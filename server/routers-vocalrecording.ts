import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  vocalRecordings,
  rvcVoiceModels,
  musicTracks,
  projects,
} from "../drizzle/schema";
import { getSubscriptionByUserId } from "./db-phase6";

// ─── Constants ─────────────────────────────────────────────────────────

export const SINGING_VOICE_CATEGORIES = [
  { gender: "female", label: "Female Voices" },
  { gender: "male", label: "Male Voices" },
  { gender: "non-binary", label: "Non-Binary Voices" },
] as const;

export const VOCAL_RANGES = [
  "soprano", "mezzo-soprano", "alto", "tenor", "baritone", "bass",
] as const;

export const PERFORMANCE_ANNOTATION_TYPES = {
  volume: ["whisper", "soft", "medium", "loud", "belt"] as const,
  emotion: ["hopeful", "angry", "sad", "joyful", "desperate", "triumphant", "vulnerable", "confident", "mysterious", "playful"] as const,
  technique: ["hold_note", "quick_notes", "vibrato", "breath_before", "crescendo", "decrescendo", "staccato", "legato"] as const,
} as const;

export const CONVERSION_DEFAULTS = {
  pitchShift: 0,       // auto-detect
  indexRate: 0.75,      // balance between conversion and original character
  f0Method: "rmvpe",    // best pitch tracking for singing
  reverbDecay: 1.5,     // seconds
  reverbWet: 0.15,      // 15% wet
  compressionThreshold: -12,  // dB
  compressionRatio: 3,  // 3:1
  eqPresenceBoost: 3,   // dB at 2-4kHz
  eqMudCut: -3,         // dB at 200-400Hz
  targetLufs: -14,      // broadcast standard
} as const;

export const MAX_CONVERSIONS_PER_THEME = 3;

// ─── Helper: Studio-only gate ──────────────────────────────────────────

async function requireStudioTier(userId: number) {
  const sub = await getSubscriptionByUserId(userId);
  const tier = sub?.tier || "free";
  if (tier !== "studio") {
    throw new Error("Voice conversion is a Studio-exclusive feature. Upgrade to Studio to record your performance.");
  }
}

// ─── Performance Guide Router ──────────────────────────────────────────

export const performanceGuideRouter = router({
  generate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      lyrics: z.string().min(1),
      themeConcept: z.string().optional(),
      mood: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const systemPrompt = `You are a vocal performance coach for anime theme songs. Given song lyrics, annotate each line with performance directions.

For each section (INTRO, VERSE, PRE-CHORUS, CHORUS, BRIDGE, OUTRO), provide:
- Section label and overall energy level (1-10)
- Section direction (e.g., "Start soft, building gradually")

For each line, provide:
- volume: one of [whisper, soft, medium, loud, belt]
- emotion: one of [hopeful, angry, sad, joyful, desperate, triumphant, vulnerable, confident, mysterious, playful]
- technique: array of [hold_note, quick_notes, vibrato, breath_before, crescendo, decrescendo, staccato, legato]
- notes: brief performance tip (e.g., "sustain the last word", "crack voice slightly for raw emotion")

Return JSON: {
  "sections": [{
    "label": "INTRO",
    "direction": "Start soft, almost whispered, building gradually",
    "energyLevel": 3,
    "lines": [{
      "text": "In the silence of the wires",
      "volume": "soft",
      "emotion": "mysterious",
      "technique": ["breath_before"],
      "notes": "breathy delivery, let the words float"
    }]
  }]
}`;

      const userPrompt = `Lyrics:\n${input.lyrics}\n\nTheme concept: ${input.themeConcept || "anime opening"}\nMood: ${input.mood || "epic"}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "performance_guide",
            strict: true,
            schema: {
              type: "object",
              properties: {
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      direction: { type: "string" },
                      energyLevel: { type: "integer" },
                      lines: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            text: { type: "string" },
                            volume: { type: "string" },
                            emotion: { type: "string" },
                            technique: { type: "array", items: { type: "string" } },
                            notes: { type: "string" },
                          },
                          required: ["text", "volume", "emotion", "technique", "notes"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["label", "direction", "energyLevel", "lines"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["sections"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices?.[0]?.message?.content as string;
      const guide = JSON.parse(content);
      return { guide };
    }),
});

// ─── Singing Voice Models Router ───────────────────────────────────────

export const singingVoiceRouter = router({
  list: protectedProcedure
    .input(z.object({
      gender: z.string().optional(),
      vocalRange: z.string().optional(),
      style: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      let query = db.select().from(rvcVoiceModels).where(eq(rvcVoiceModels.isActive, 1));
      const voices = await query;

      let filtered = voices;
      if (input?.gender) {
        filtered = filtered.filter(v => v.gender === input.gender);
      }
      if (input?.vocalRange) {
        filtered = filtered.filter(v => v.vocalRange === input.vocalRange);
      }
      if (input?.style) {
        filtered = filtered.filter(v => v.styleTags?.includes(input.style!));
      }

      return {
        voices: filtered.map(v => ({
          id: v.id,
          name: v.name,
          gender: v.gender,
          vocalRange: v.vocalRange,
          styleTags: v.styleTags?.split(",") || [],
          sampleAudioUrl: v.sampleAudioUrl,
        })),
        categories: SINGING_VOICE_CATEGORIES,
      };
    }),

  getPreview: protectedProcedure
    .input(z.object({ voiceId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [voice] = await db.select().from(rvcVoiceModels).where(eq(rvcVoiceModels.id, input.voiceId));
      if (!voice) throw new Error("Voice model not found");
      return {
        id: voice.id,
        name: voice.name,
        sampleAudioUrl: voice.sampleAudioUrl,
      };
    }),
});

// ─── Vocal Recording Router ────────────────────────────────────────────

export const vocalRecordingRouter = router({
  upload: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      trackType: z.enum(["opening", "ending"]),
      recordingMode: z.enum(["full_take", "section_by_section"]).default("full_take"),
      audioBase64: z.string().min(1),
      mimeType: z.string().default("audio/wav"),
      sectionIndex: z.number().optional(),  // for section-by-section mode
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const db = (await getDb())!;
      const buffer = Buffer.from(input.audioBase64, "base64");
      const fileKey = `vocal-recordings/${input.projectId}/${input.trackType}-${Date.now()}.wav`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Check for existing recording
      const existing = await db.select().from(vocalRecordings)
        .where(and(
          eq(vocalRecordings.projectId, input.projectId),
          eq(vocalRecordings.trackType, input.trackType),
        ))
        .orderBy(desc(vocalRecordings.createdAt))
        .limit(1);

      if (existing.length > 0 && input.recordingMode === "section_by_section" && input.sectionIndex !== undefined) {
        // Update section in existing recording
        const rec = existing[0];
        const sections = (rec.sectionRecordings as string[] | null) || [];
        sections[input.sectionIndex] = url;
        await db.update(vocalRecordings)
          .set({ sectionRecordings: sections, status: "recording" })
          .where(eq(vocalRecordings.id, rec.id));
        return { recordingId: rec.id, url, sectionIndex: input.sectionIndex };
      }

      // Create new recording
      const result = await db.insert(vocalRecordings).values({
        projectId: input.projectId,
        trackType: input.trackType,
        rawRecordingUrl: url,
        recordingMode: input.recordingMode,
        sectionRecordings: input.recordingMode === "section_by_section" ? [url] : null,
        status: "recording",
      });

      return { recordingId: Number(result[0].insertId), url };
    }),

  getStatus: protectedProcedure
    .input(z.object({ recordingId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [rec] = await db.select().from(vocalRecordings)
        .where(eq(vocalRecordings.id, input.recordingId));
      if (!rec) throw new Error("Recording not found");
      return {
        id: rec.id,
        status: rec.status,
        rawRecordingUrl: rec.rawRecordingUrl,
        isolatedVocalUrl: rec.isolatedVocalUrl,
        convertedVocalUrl: rec.convertedVocalUrl,
        finalMixUrl: rec.finalMixUrl,
        targetVoiceModel: rec.targetVoiceModel,
        conversionCount: rec.conversionCount,
        recordingMode: rec.recordingMode,
      };
    }),

  getBackingTrack: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      trackType: z.enum(["opening", "ending"]),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      // Find the instrumental version of the theme
      const [track] = await db.select().from(musicTracks)
        .where(and(
          eq(musicTracks.projectId, input.projectId),
          eq(musicTracks.trackType, input.trackType),
          eq(musicTracks.isVocal, 0),
          eq(musicTracks.isApproved, 1),
        ))
        .orderBy(desc(musicTracks.createdAt))
        .limit(1);

      if (!track) {
        // Fall back to any track of this type
        const [anyTrack] = await db.select().from(musicTracks)
          .where(and(
            eq(musicTracks.projectId, input.projectId),
            eq(musicTracks.trackType, input.trackType),
          ))
          .orderBy(desc(musicTracks.createdAt))
          .limit(1);
        return {
          trackUrl: anyTrack?.trackUrl || null,
          duration: anyTrack?.durationSeconds || null,
          isInstrumental: false,
        };
      }

      return {
        trackUrl: track.trackUrl,
        duration: track.durationSeconds,
        isInstrumental: true,
      };
    }),

  getByProject: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      trackType: z.enum(["opening", "ending"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const conditions = [eq(vocalRecordings.projectId, input.projectId)];
      if (input.trackType) {
        conditions.push(eq(vocalRecordings.trackType, input.trackType));
      }
      const recordings = await db.select().from(vocalRecordings)
        .where(and(...conditions))
        .orderBy(desc(vocalRecordings.createdAt));
      return { recordings };
    }),
});

// ─── Voice Conversion Router ───────────────────────────────────────────

export const voiceConversionRouter = router({
  convert: protectedProcedure
    .input(z.object({
      recordingId: z.number(),
      targetVoiceModelId: z.number(),
      settings: z.object({
        pitchShift: z.number().default(CONVERSION_DEFAULTS.pitchShift),
        indexRate: z.number().min(0).max(1).default(CONVERSION_DEFAULTS.indexRate),
        f0Method: z.string().default(CONVERSION_DEFAULTS.f0Method),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const db = (await getDb())!;
      const [rec] = await db.select().from(vocalRecordings)
        .where(eq(vocalRecordings.id, input.recordingId));
      if (!rec) throw new Error("Recording not found");

      // Check conversion limit
      if (rec.conversionCount >= MAX_CONVERSIONS_PER_THEME) {
        throw new Error(`Maximum ${MAX_CONVERSIONS_PER_THEME} voice conversions per theme reached. Please approve a version or start a new recording.`);
      }

      // Get target voice model
      const [voice] = await db.select().from(rvcVoiceModels)
        .where(eq(rvcVoiceModels.id, input.targetVoiceModelId));
      if (!voice) throw new Error("Voice model not found");

      // Update status to processing
      await db.update(vocalRecordings)
        .set({
          status: "processing",
          targetVoiceModel: voice.name,
          conversionSettings: {
            ...CONVERSION_DEFAULTS,
            ...input.settings,
            targetVoiceId: voice.id,
            targetVoiceName: voice.name,
          },
          conversionCount: rec.conversionCount + 1,
        })
        .where(eq(vocalRecordings.id, input.recordingId));

      // Simulate the conversion pipeline
      // In production: Demucs V4 -> RVC V2 -> FFmpeg mixing
      // Step 1: Vocal isolation (Demucs)
      const isolatedKey = `vocal-recordings/${rec.projectId}/isolated-${Date.now()}.wav`;
      const { url: isolatedUrl } = await storagePut(
        isolatedKey,
        Buffer.from("isolated-vocal-placeholder"),
        "audio/wav"
      );

      // Step 2: Voice conversion (RVC V2)
      const convertedKey = `vocal-recordings/${rec.projectId}/converted-${Date.now()}.wav`;
      const { url: convertedUrl } = await storagePut(
        convertedKey,
        Buffer.from("converted-vocal-placeholder"),
        "audio/wav"
      );

      // Step 3: Final mix (FFmpeg + SoX)
      const mixKey = `vocal-recordings/${rec.projectId}/final-mix-${Date.now()}.wav`;
      const { url: mixUrl } = await storagePut(
        mixKey,
        Buffer.from("final-mix-placeholder"),
        "audio/wav"
      );

      // Update recording with results
      await db.update(vocalRecordings)
        .set({
          isolatedVocalUrl: isolatedUrl,
          convertedVocalUrl: convertedUrl,
          finalMixUrl: mixUrl,
          status: "ready",
        })
        .where(eq(vocalRecordings.id, input.recordingId));

      return {
        recordingId: input.recordingId,
        isolatedVocalUrl: isolatedUrl,
        convertedVocalUrl: convertedUrl,
        finalMixUrl: mixUrl,
        targetVoice: voice.name,
        conversionCount: rec.conversionCount + 1,
        maxConversions: MAX_CONVERSIONS_PER_THEME,
      };
    }),

  reRecordSection: protectedProcedure
    .input(z.object({
      recordingId: z.number(),
      sectionIndex: z.number(),
      audioBase64: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const db = (await getDb())!;
      const [rec] = await db.select().from(vocalRecordings)
        .where(eq(vocalRecordings.id, input.recordingId));
      if (!rec) throw new Error("Recording not found");
      if (rec.recordingMode !== "section_by_section") {
        throw new Error("Section re-recording is only available for section-by-section recordings");
      }

      const buffer = Buffer.from(input.audioBase64, "base64");
      const fileKey = `vocal-recordings/${rec.projectId}/section-${input.sectionIndex}-${Date.now()}.wav`;
      const { url } = await storagePut(fileKey, buffer, "audio/wav");

      const sections = (rec.sectionRecordings as string[] | null) || [];
      sections[input.sectionIndex] = url;

      await db.update(vocalRecordings)
        .set({
          sectionRecordings: sections,
          status: "recording",  // needs re-conversion
        })
        .where(eq(vocalRecordings.id, input.recordingId));

      return { sectionIndex: input.sectionIndex, url, sections };
    }),

  adjustMix: protectedProcedure
    .input(z.object({
      recordingId: z.number(),
      vocalVolume: z.number().min(0).max(2).default(1),
      reverbAmount: z.number().min(0).max(1).default(0.15),
      backingTrackVolume: z.number().min(0).max(2).default(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const db = (await getDb())!;
      const [rec] = await db.select().from(vocalRecordings)
        .where(eq(vocalRecordings.id, input.recordingId));
      if (!rec) throw new Error("Recording not found");
      if (rec.status !== "ready") throw new Error("Recording must be in ready state to adjust mix");

      // In production: re-run FFmpeg mix with new parameters
      const mixKey = `vocal-recordings/${rec.projectId}/adjusted-mix-${Date.now()}.wav`;
      const { url: mixUrl } = await storagePut(
        mixKey,
        Buffer.from("adjusted-mix-placeholder"),
        "audio/wav"
      );

      const currentSettings = (rec.conversionSettings as Record<string, unknown>) || {};
      await db.update(vocalRecordings)
        .set({
          finalMixUrl: mixUrl,
          conversionSettings: {
            ...currentSettings,
            vocalVolume: input.vocalVolume,
            reverbAmount: input.reverbAmount,
            backingTrackVolume: input.backingTrackVolume,
          },
        })
        .where(eq(vocalRecordings.id, input.recordingId));

      return { finalMixUrl: mixUrl };
    }),

  approve: protectedProcedure
    .input(z.object({ recordingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireStudioTier(ctx.user.id);

      const db = (await getDb())!;
      const [rec] = await db.select().from(vocalRecordings)
        .where(eq(vocalRecordings.id, input.recordingId));
      if (!rec) throw new Error("Recording not found");
      if (rec.status !== "ready") throw new Error("Recording must be in ready state to approve");

      await db.update(vocalRecordings)
        .set({ status: "approved" })
        .where(eq(vocalRecordings.id, input.recordingId));

      // Also create/update a music track with the final mix as the OP/ED vocal track
      if (rec.finalMixUrl) {
        await db.insert(musicTracks).values({
          projectId: rec.projectId,
          trackType: rec.trackType,
          title: `${rec.trackType === "opening" ? "OP" : "ED"} - Voice Converted`,
          trackUrl: rec.finalMixUrl,
          isVocal: 1,
          isApproved: 1,
          versionNumber: 1,
        });
      }

      return { approved: true };
    }),
});
