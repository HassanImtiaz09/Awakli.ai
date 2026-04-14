import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import {
  musicTracks,
  musicVersions,
  preProductionConfigs,
  projects,
  episodes,
  users,
} from "../drizzle/schema";

// ─── Constants ────────────────────────────────────────────────────────

export const MUSIC_GENRES = [
  { id: "j_rock", name: "J-Rock / Anime Rock", description: "Electric guitars, driving drums, powerful vocals", reference: "Attack on Titan, Bleach, My Hero Academia" },
  { id: "j_pop", name: "J-Pop / Catchy Pop", description: "Upbeat, melodic, synth and guitar mix", reference: "Spy x Family, Kaguya-sama, Chainsaw Man ED1" },
  { id: "epic_orchestral", name: "Epic Orchestral", description: "Full orchestra, choir, cinematic build", reference: "Fate/Zero, Vinland Saga, Made in Abyss" },
  { id: "electronic", name: "Electronic / Future Bass", description: "Synths, drops, modern production", reference: "Psycho-Pass, Cyberpunk Edgerunners, 86" },
  { id: "hip_hop", name: "Hip-Hop / Rap", description: "Rap verses, melodic chorus, hard-hitting beats", reference: "Jujutsu Kaisen OP2, Samurai Champloo" },
  { id: "metal", name: "Metal / Screamo", description: "Heavy guitars, blast beats, screaming + clean vocals", reference: "Death Note OP2, Devilman Crybaby" },
  { id: "lofi", name: "Lo-Fi / Chill", description: "Relaxed, atmospheric, gentle vocals", reference: "March Comes in Like a Lion, Barakamon" },
  { id: "acoustic", name: "Acoustic / Ballad", description: "Piano/guitar-led, emotional, stripped back", reference: "Your Lie in April, Anohana, Violet Evergarden" },
  { id: "custom", name: "Custom", description: "Describe your ideal sound", reference: "" },
] as const;

export const BGM_MOODS = [
  { id: "main_theme", label: "Main Theme", color: "#f472b6", description: "Instrumental version of OP melody", durationMin: 120 },
  { id: "battle", label: "Battle / Action", color: "#ef4444", description: "Intense, fast-paced, adrenaline", durationMin: 120 },
  { id: "tension", label: "Tension / Suspense", color: "#a855f7", description: "Eerie strings, low drones, building dread", durationMin: 120 },
  { id: "emotional", label: "Emotional / Sad", color: "#3b82f6", description: "Piano-led, strings, gentle", durationMin: 120 },
  { id: "romance", label: "Romance / Warmth", color: "#ec4899", description: "Soft, warm, acoustic guitar or piano", durationMin: 120 },
  { id: "mystery", label: "Mystery / Intrigue", color: "#6366f1", description: "Ambient, eerie, atmospheric", durationMin: 120 },
  { id: "comedy", label: "Comedy / Light", color: "#f59e0b", description: "Bouncy, playful, xylophone/pizzicato", durationMin: 60 },
  { id: "triumph", label: "Triumph / Victory", color: "#22c55e", description: "Epic, brass, drums, uplifting", durationMin: 120 },
  { id: "daily_life", label: "Daily Life / Slice of Life", color: "#06b6d4", description: "Casual, gentle, lo-fi feel", durationMin: 120 },
  { id: "dark", label: "Dark / Villain Theme", color: "#1e1b4b", description: "Ominous, heavy, choir", durationMin: 120 },
] as const;

export const STINGER_TYPES = [
  { id: "impact", label: "Impact Hit", sourceMood: "battle", durationMs: 1500 },
  { id: "suspense", label: "Suspense Sting", sourceMood: "tension", durationMs: 4000 },
  { id: "emotional_swell", label: "Emotional Swell", sourceMood: "emotional", durationMs: 4000 },
  { id: "comedy_beat", label: "Comedy Beat", sourceMood: "comedy", durationMs: 1500 },
  { id: "transition", label: "Transition Whoosh", sourceMood: null, durationMs: 1000 },
] as const;

export const VOCAL_TYPES = ["male", "female", "duet", "choir", "instrumental"] as const;
export const LANGUAGES = ["japanese", "english", "bilingual", "korean", "custom"] as const;
export const ENERGY_CURVES = ["builds_gradually", "starts_strong", "stays_consistent"] as const;
export const INSTRUMENTS = [
  "electric_guitar", "acoustic_guitar", "piano", "synth", "drums",
  "bass", "strings_orchestra", "brass", "choir", "electronic_beats",
] as const;

// Tier limits for music
const MUSIC_TIER_LIMITS = {
  free: { opVariations: 0, edVariations: 0, opRefinements: 0, edRefinements: 0, bgmTracks: 0, customTracks: 0, upload: false, sectionEdit: false, exportStems: false },
  creator: { opVariations: 3, edVariations: 3, opRefinements: 3, edRefinements: 2, bgmTracks: 8, customTracks: 2, upload: true, sectionEdit: false, exportStems: false },
  studio: { opVariations: 5, edVariations: 5, opRefinements: 5, edRefinements: 5, bgmTracks: 12, customTracks: 999, upload: true, sectionEdit: true, exportStems: true },
};

function getTierLimits(tier: string) {
  return MUSIC_TIER_LIMITS[tier as keyof typeof MUSIC_TIER_LIMITS] || MUSIC_TIER_LIMITS.free;
}

// ─── Theme Concept & Lyrics Router ───────────────────────────────────

export const musicConceptRouter = router({
  // Suggest a theme concept based on project analysis
  suggestThemeConcept: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      themeType: z.enum(["opening", "ending"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project) throw new Error("Project not found");

      // Get episodes for story context
      const projectEpisodes = await db.select().from(episodes).where(eq(episodes.projectId, input.projectId)).limit(5);
      const storyContext = projectEpisodes.map(e => e.title || "").filter(Boolean).join(", ");

      const isEnding = input.themeType === "ending";
      const themeDirection = isEnding
        ? "This is an ENDING theme. Endings are typically softer, more reflective, focusing on emotion, hope, aftermath, and closure."
        : "This is an OPENING theme. Openings are typically energetic, exciting, setting the tone for the episode with powerful hooks.";

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an expert anime music director. Analyze the anime project and suggest a theme song concept. ${themeDirection}
Return JSON with: suggested_mood, suggested_genre, suggested_tempo, key_themes_for_lyrics (array of 3-5 themes), vocal_suggestion, reference_vibes, concept_summary.`,
          },
          {
            role: "user",
            content: `Project: "${project.title}"
Genre: ${project.genre || "unknown"}
Tone: ${project.tone || "unknown"}
Synopsis: ${project.description || "No synopsis"}
Art Style: ${project.animeStyle || "default"}
Chapters: ${storyContext || "No chapters yet"}

Generate a theme concept for the ${input.themeType} theme.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "theme_concept",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggested_mood: { type: "string" },
                suggested_genre: { type: "string" },
                suggested_tempo: { type: "string" },
                key_themes_for_lyrics: { type: "array", items: { type: "string" } },
                vocal_suggestion: { type: "string" },
                reference_vibes: { type: "string" },
                concept_summary: { type: "string" },
              },
              required: ["suggested_mood", "suggested_genre", "suggested_tempo", "key_themes_for_lyrics", "vocal_suggestion", "reference_vibes", "concept_summary"],
              additionalProperties: false,
            },
          },
        },
      });

      const concept = JSON.parse((response.choices[0].message.content as string) || "{}");
      return concept;
    }),

  // Generate structured lyrics
  generateLyrics: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      themeType: z.enum(["opening", "ending"]),
      concept: z.string(), // concept summary or custom description
      genre: z.string().optional(),
      vocalType: z.enum(["male", "female", "duet", "choir", "instrumental"]).optional(),
      language: z.enum(["japanese", "english", "bilingual", "korean", "custom"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project) throw new Error("Project not found");

      const langInstructions = {
        japanese: "Write in romanized Japanese with kanji/kana annotations in parentheses.",
        english: "Write in English.",
        bilingual: "Write Japanese verses with English chorus (common anime OP pattern). Include romanization.",
        korean: "Write in romanized Korean.",
        custom: "Write in the language that best fits the story setting.",
      };

      const isEnding = input.themeType === "ending";
      const structureGuide = isEnding
        ? "Structure: Intro (2 lines) -> Verse 1 (6 lines) -> Chorus (6 lines) -> Verse 2 (6 lines) -> Chorus (repeat) -> Outro (4 lines, fading)"
        : "Structure: Intro (4 lines) -> Verse 1 (8 lines) -> Pre-Chorus (4 lines) -> Chorus (8 lines) -> Verse 2 (8 lines) -> Chorus (repeat) -> Bridge (4 lines) -> Final Chorus (8 lines) -> Outro (2 lines)";

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a professional anime theme song lyricist. Write lyrics for an anime ${input.themeType} theme.
The lyrics must:
- Be 60-90 seconds when sung (standard anime ${input.themeType} length)
- ${structureGuide}
- Reference the anime story themes WITHOUT being too literal/on-the-nose
- Use metaphor and emotional imagery (anime themes are poetic, not narrative)
- ${langInstructions[input.language || "japanese"]}
- Include emotional direction markers: [building], [explosive], [soft], [whispered], [belted], [fade out]
- The chorus must be CATCHY and MEMORABLE (the hook)

Return JSON with sections array, each section having: section_name, emotion_marker, lines (array of strings).`,
          },
          {
            role: "user",
            content: `Project: "${project.title}"
Concept: ${input.concept}
Genre: ${input.genre || "J-Rock"}
Vocal type: ${input.vocalType || "female"}
Language: ${input.language || "japanese"}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lyrics",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                sections: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      section_name: { type: "string" },
                      emotion_marker: { type: "string" },
                      lines: { type: "array", items: { type: "string" } },
                    },
                    required: ["section_name", "emotion_marker", "lines"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["title", "sections"],
              additionalProperties: false,
            },
          },
        },
      });

      return JSON.parse((response.choices[0].message.content as string) || "{}");
    }),

  // Update lyrics (save edited version)
  updateLyrics: protectedProcedure
    .input(z.object({
      trackId: z.number(),
      lyrics: z.string(), // full lyrics text
      sections: z.array(z.object({
        section_name: z.string(),
        emotion_marker: z.string(),
        lines: z.array(z.string()),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(musicTracks).set({ lyrics: input.lyrics }).where(eq(musicTracks.id, input.trackId));
      return { success: true };
    }),

  // Generate alternative lines for a specific lyric line
  generateAltLine: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      currentLine: z.string(),
      sectionName: z.string(),
      emotionMarker: z.string(),
      context: z.string().optional(), // surrounding lines for context
    }))
    .mutation(async ({ ctx, input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a professional anime lyricist. Generate 3 alternative lines for the given lyric line, maintaining the same emotion (${input.emotionMarker}) and fitting the section (${input.sectionName}). Return JSON with alternatives array of 3 strings.`,
          },
          {
            role: "user",
            content: `Current line: "${input.currentLine}"
Context: ${input.context || "N/A"}
Generate 3 alternatives.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "alt_lines",
            strict: true,
            schema: {
              type: "object",
              properties: {
                alternatives: { type: "array", items: { type: "string" } },
              },
              required: ["alternatives"],
              additionalProperties: false,
            },
          },
        },
      });

      return JSON.parse((response.choices[0].message.content as string) || '{"alternatives":[]}');
    }),

  // Rewrite an entire section
  rewriteSection: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      sectionName: z.string(),
      emotionMarker: z.string(),
      currentLines: z.array(z.string()),
      direction: z.string().optional(), // user guidance for rewrite
    }))
    .mutation(async ({ ctx, input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are a professional anime lyricist. Rewrite the ${input.sectionName} section with emotion [${input.emotionMarker}]. Keep the same number of lines (${input.currentLines.length}). Return JSON with lines array.`,
          },
          {
            role: "user",
            content: `Current lines:\n${input.currentLines.join("\n")}
${input.direction ? `Direction: ${input.direction}` : ""}
Rewrite this section.`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "rewritten_section",
            strict: true,
            schema: {
              type: "object",
              properties: {
                lines: { type: "array", items: { type: "string" } },
              },
              required: ["lines"],
              additionalProperties: false,
            },
          },
        },
      });

      return JSON.parse((response.choices[0].message.content as string) || '{"lines":[]}');
    }),
});

// ─── Song Generation & Refinement Router ─────────────────────────────

export const musicGenerationRouter = router({
  // Generate theme song via Suno-style API
  generateTheme: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      themeType: z.enum(["opening", "ending"]),
      lyrics: z.string(),
      genre: z.string(),
      tempo: z.number().min(60).max(220).default(140),
      vocalType: z.enum(["male", "female", "duet", "choir", "instrumental"]).default("female"),
      language: z.string().default("japanese"),
      energyCurve: z.enum(["builds_gradually", "starts_strong", "stays_consistent"]).default("builds_gradually"),
      instruments: z.array(z.string()).optional(),
      variationCount: z.number().min(1).max(5).default(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const tier = (user as any)?.tier || "free";
      const limits = getTierLimits(tier);

      const maxVariations = input.themeType === "opening" ? limits.opVariations : limits.edVariations;
      if (maxVariations === 0) throw new Error("Music generation not available on free tier");

      const actualVariations = Math.min(input.variationCount, maxVariations);

      // Build Suno-style prompt
      const instrumentList = input.instruments?.join(", ") || "full band";
      const stylePrompt = `${input.genre}, ${input.tempo} BPM, ${input.vocalType} vocals, ${input.language}, ${instrumentList}, anime ${input.themeType} theme, emotional, professional production quality, ${input.energyCurve.replace(/_/g, " ")}`;

      // Create tracks for each variation (simulated - in production would call Suno API)
      const tracks = [];
      for (let i = 0; i < actualVariations; i++) {
        const versionLabel = String.fromCharCode(65 + i); // A, B, C...
        const [track] = await db.insert(musicTracks).values({
          projectId: input.projectId,
          trackType: input.themeType,
          title: `${input.themeType === "opening" ? "OP" : "ED"} Theme - Version ${versionLabel}`,
          lyrics: input.lyrics,
          stylePrompt,
          trackUrl: null, // Would be set by Suno callback
          durationSeconds: 90,
          isVocal: input.vocalType !== "instrumental" ? 1 : 0,
          isLoopable: 0,
          versionNumber: 1,
          isApproved: 0,
          isUserUploaded: 0,
          sunoGenerationId: `suno_${Date.now()}_${i}`,
        }).$returningId();

        tracks.push({
          id: track.id,
          title: `${input.themeType === "opening" ? "OP" : "ED"} Theme - Version ${versionLabel}`,
          stylePrompt,
          status: "generating",
          variationIndex: i,
        });
      }

      return {
        tracks,
        variationsGenerated: actualVariations,
        stylePrompt,
        message: `Generating ${actualVariations} variations. Each takes 30-60 seconds.`,
      };
    }),

  // Refine a theme with modifier
  refineTheme: protectedProcedure
    .input(z.object({
      trackId: z.number(),
      modifier: z.enum([
        "more_energetic", "softer", "speed_up", "slow_down",
        "add_guitar_solo", "add_piano_break", "heavier_drums",
        "more_orchestral", "male_vocals", "female_vocals",
      ]),
      customInstruction: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [track] = await db.select().from(musicTracks).where(eq(musicTracks.id, input.trackId)).limit(1);
      if (!track) throw new Error("Track not found");

      // Check refinement limits
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const tier = (user as any)?.tier || "free";
      const limits = getTierLimits(tier);
      const maxRefinements = track.trackType === "opening" ? limits.opRefinements : limits.edRefinements;

      // Count existing versions
      const existingVersions = await db.select().from(musicVersions)
        .where(eq(musicVersions.musicTrackId, input.trackId));
      if (existingVersions.length >= maxRefinements) {
        throw new Error(`Refinement limit reached (${maxRefinements} for ${tier} tier)`);
      }

      // Save current version to history
      await db.insert(musicVersions).values({
        musicTrackId: input.trackId,
        versionNumber: track.versionNumber,
        trackUrl: track.trackUrl,
        stylePrompt: track.stylePrompt,
        refinementNotes: `Before: ${input.modifier}`,
      });

      // Build modified prompt
      const modifierMap: Record<string, string> = {
        more_energetic: "more energy, louder, more intense",
        softer: "softer, gentler, more delicate",
        speed_up: "faster tempo, +20 BPM",
        slow_down: "slower tempo, -20 BPM",
        add_guitar_solo: "add electric guitar solo section",
        add_piano_break: "add piano break in the bridge",
        heavier_drums: "heavier drums, more powerful percussion",
        more_orchestral: "add orchestral strings and brass",
        male_vocals: "change to male vocalist",
        female_vocals: "change to female vocalist",
      };

      const modifiedPrompt = `${track.stylePrompt}, ${modifierMap[input.modifier] || input.customInstruction || ""}`;

      // Update track with new version
      await db.update(musicTracks).set({
        stylePrompt: modifiedPrompt,
        versionNumber: track.versionNumber + 1,
        trackUrl: null, // Would be regenerated
        sunoGenerationId: `suno_refine_${Date.now()}`,
      }).where(eq(musicTracks.id, input.trackId));

      return {
        trackId: input.trackId,
        newVersion: track.versionNumber + 1,
        modifiedPrompt,
        refinementsRemaining: maxRefinements - existingVersions.length - 1,
        status: "generating",
      };
    }),

  // Select a version as the chosen theme
  selectVersion: protectedProcedure
    .input(z.object({ trackId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [track] = await db.select().from(musicTracks).where(eq(musicTracks.id, input.trackId)).limit(1);
      if (!track) throw new Error("Track not found");

      // Deselect other tracks of same type for this project
      const allTracks = await db.select().from(musicTracks)
        .where(and(eq(musicTracks.projectId, track.projectId), eq(musicTracks.trackType, track.trackType)));
      for (const t of allTracks) {
        await db.update(musicTracks).set({ isApproved: 0 }).where(eq(musicTracks.id, t.id));
      }

      // Select this one
      await db.update(musicTracks).set({ isApproved: 1 }).where(eq(musicTracks.id, input.trackId));
      return { success: true, selectedTrackId: input.trackId };
    }),

  // Confirm as OP/ED with TV-size cut option
  confirmTheme: protectedProcedure
    .input(z.object({
      trackId: z.number(),
      useTvSizeCut: z.boolean().default(false), // 90s -> 60s
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [track] = await db.select().from(musicTracks).where(eq(musicTracks.id, input.trackId)).limit(1);
      if (!track) throw new Error("Track not found");

      await db.update(musicTracks).set({ isApproved: 1 }).where(eq(musicTracks.id, input.trackId));

      // Update music config in pre_production_configs
      const [config] = await db.select().from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, track.projectId)).limit(1);

      if (config) {
        const musicConfig = (config.musicConfig as any) || {};
        const themeKey = track.trackType === "opening" ? "opening_theme" : "ending_theme";
        musicConfig[themeKey] = {
          trackId: track.id,
          trackUrl: track.trackUrl,
          durationSeconds: track.durationSeconds || 90,
          tvCutStartMs: 0,
          tvCutEndMs: input.useTvSizeCut ? 60000 : (track.durationSeconds || 90) * 1000,
          volume: 100,
        };
        await db.update(preProductionConfigs).set({ musicConfig }).where(eq(preProductionConfigs.id, config.id));
      }

      return {
        confirmed: true,
        themeType: track.trackType,
        tvSizeCut: input.useTvSizeCut,
        duration: input.useTvSizeCut ? 60 : (track.durationSeconds || 90),
      };
    }),
});

// ─── BGM / OST Router ────────────────────────────────────────────────

export const musicOstRouter = router({
  // Generate full OST set
  generateOst: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const tier = (user as any)?.tier || "free";
      const limits = getTierLimits(tier);
      if (limits.bgmTracks === 0) throw new Error("BGM generation not available on free tier");

      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project) throw new Error("Project not found");

      // Determine which moods to generate based on tier
      const moodsToGenerate = BGM_MOODS.slice(0, limits.bgmTracks);

      const tracks = [];
      for (const mood of moodsToGenerate) {
        const stylePrompt = `anime background music, ${mood.label.toLowerCase()}, instrumental, ${project.genre || "anime"}, loopable, cinematic quality, no vocals, ${mood.durationMin / 60} minutes`;

        const [track] = await db.insert(musicTracks).values({
          projectId: input.projectId,
          trackType: "bgm",
          mood: mood.id,
          title: mood.label,
          stylePrompt,
          trackUrl: null,
          durationSeconds: mood.durationMin,
          isVocal: 0,
          isLoopable: 1,
          versionNumber: 1,
          isApproved: 0,
          isUserUploaded: 0,
          sunoGenerationId: `suno_bgm_${Date.now()}_${mood.id}`,
        }).$returningId();

        tracks.push({
          id: track.id,
          mood: mood.id,
          title: mood.label,
          color: mood.color,
          status: "generating",
        });
      }

      return {
        tracks,
        totalGenerated: tracks.length,
        message: `Generating ${tracks.length} BGM tracks. Each takes 30-60 seconds.`,
      };
    }),

  // Generate custom BGM track from user description
  generateCustomTrack: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      description: z.string().min(10),
      mood: z.string().optional(),
      title: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const tier = (user as any)?.tier || "free";
      const limits = getTierLimits(tier);

      // Count existing custom tracks
      const existingCustom = await db.select().from(musicTracks)
        .where(and(eq(musicTracks.projectId, input.projectId), eq(musicTracks.trackType, "custom")));
      if (existingCustom.length >= limits.customTracks) {
        throw new Error(`Custom track limit reached (${limits.customTracks} for ${tier} tier)`);
      }

      const stylePrompt = `anime background music, ${input.description}, instrumental, loopable, cinematic quality, no vocals`;

      const [track] = await db.insert(musicTracks).values({
        projectId: input.projectId,
        trackType: "custom",
        mood: input.mood || "custom",
        title: input.title || "Custom Track",
        stylePrompt,
        trackUrl: null,
        durationSeconds: 120,
        isVocal: 0,
        isLoopable: 1,
        versionNumber: 1,
        isApproved: 0,
        isUserUploaded: 0,
        sunoGenerationId: `suno_custom_${Date.now()}`,
      }).$returningId();

      return {
        id: track.id,
        title: input.title || "Custom Track",
        status: "generating",
        customTracksRemaining: limits.customTracks - existingCustom.length - 1,
      };
    }),

  // Generate stingers from BGM tracks
  generateStingers: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const stingers = [];

      for (const stingerType of STINGER_TYPES) {
        const [track] = await db.insert(musicTracks).values({
          projectId: input.projectId,
          trackType: "stinger",
          mood: stingerType.id,
          title: stingerType.label,
          stylePrompt: stingerType.sourceMood
            ? `Cut from ${stingerType.sourceMood} track, ${stingerType.durationMs}ms`
            : `Generated transition sound effect, ${stingerType.durationMs}ms`,
          trackUrl: null,
          durationSeconds: stingerType.durationMs / 1000,
          isVocal: 0,
          isLoopable: 0,
          versionNumber: 1,
          isApproved: 0,
          isUserUploaded: 0,
        }).$returningId();

        stingers.push({
          id: track.id,
          type: stingerType.id,
          label: stingerType.label,
          durationMs: stingerType.durationMs,
          status: "generating",
        });
      }

      return { stingers, total: stingers.length };
    }),

  // Auto-assign BGM tracks to scenes
  autoAssignScenes: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const projectEpisodes = await db.select().from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      const bgmTracks = await db.select().from(musicTracks)
        .where(and(
          eq(musicTracks.projectId, input.projectId),
          eq(musicTracks.trackType, "bgm"),
        ));

      // Simple mood-to-track mapping
      const moodToTrack = new Map<string, number>();
      for (const track of bgmTracks) {
        if (track.mood) moodToTrack.set(track.mood, track.id);
      }

      // Use Claude to analyze scenes and assign moods
      const sceneList = projectEpisodes.map((ep, i) => `Scene ${i + 1}: ${ep.title || "Untitled"}`).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `You are an anime music director. Assign background music moods to each scene. Available moods: ${BGM_MOODS.map(m => m.id).join(", ")}. Return JSON with assignments array of {scene_index, mood, volume (0-100)}.`,
          },
          { role: "user", content: `Scenes:\n${sceneList}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "scene_assignments",
            strict: true,
            schema: {
              type: "object",
              properties: {
                assignments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      scene_index: { type: "number" },
                      mood: { type: "string" },
                      volume: { type: "number" },
                    },
                    required: ["scene_index", "mood", "volume"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["assignments"],
              additionalProperties: false,
            },
          },
        },
      });

      const { assignments } = JSON.parse((response.choices[0].message.content as string) || '{"assignments":[]}');

      // Map moods to track IDs
      const sceneBgmMapping = assignments.map((a: any) => ({
        sceneIndex: a.scene_index,
        mood: a.mood,
        trackId: moodToTrack.get(a.mood) || null,
        volume: a.volume,
        startOffsetMs: 0,
      }));

      // Save to music config
      const [config] = await db.select().from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId)).limit(1);
      if (config) {
        const musicConfig = (config.musicConfig as any) || {};
        musicConfig.scene_bgm_mapping = sceneBgmMapping;
        await db.update(preProductionConfigs).set({ musicConfig }).where(eq(preProductionConfigs.id, config.id));
      }

      return { assignments: sceneBgmMapping, total: sceneBgmMapping.length };
    }),

  // Manual scene-BGM assignment
  assignSceneBgm: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      sceneIndex: z.number(),
      trackId: z.number(),
      volume: z.number().min(0).max(100).default(50),
      startOffsetMs: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [config] = await db.select().from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId)).limit(1);
      if (!config) throw new Error("Pre-production config not found");

      const musicConfig = (config.musicConfig as any) || {};
      const mapping = musicConfig.scene_bgm_mapping || [];

      // Update or add assignment
      const existingIdx = mapping.findIndex((m: any) => m.sceneIndex === input.sceneIndex);
      const assignment = {
        sceneIndex: input.sceneIndex,
        trackId: input.trackId,
        volume: input.volume,
        startOffsetMs: input.startOffsetMs,
      };

      if (existingIdx >= 0) {
        mapping[existingIdx] = assignment;
      } else {
        mapping.push(assignment);
      }

      musicConfig.scene_bgm_mapping = mapping;
      await db.update(preProductionConfigs).set({ musicConfig }).where(eq(preProductionConfigs.id, config.id));

      return { success: true, assignment };
    }),
});

// ─── Track Management Router ─────────────────────────────────────────

export const musicTrackRouter = router({
  // List all tracks for a project
  getTracks: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      trackType: z.enum(["opening", "ending", "bgm", "stinger", "custom"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      let query = db.select().from(musicTracks).where(eq(musicTracks.projectId, input.projectId));
      if (input.trackType) {
        query = db.select().from(musicTracks).where(
          and(eq(musicTracks.projectId, input.projectId), eq(musicTracks.trackType, input.trackType))
        );
      }
      const tracks = await query.orderBy(asc(musicTracks.id));
      return tracks;
    }),

  // Approve a track
  approveTrack: protectedProcedure
    .input(z.object({ trackId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(musicTracks).set({ isApproved: 1 }).where(eq(musicTracks.id, input.trackId));
      return { success: true };
    }),

  // Regenerate a specific track
  regenerateTrack: protectedProcedure
    .input(z.object({
      trackId: z.number(),
      styleModifier: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [track] = await db.select().from(musicTracks).where(eq(musicTracks.id, input.trackId)).limit(1);
      if (!track) throw new Error("Track not found");

      // Save current to versions
      await db.insert(musicVersions).values({
        musicTrackId: track.id,
        versionNumber: track.versionNumber,
        trackUrl: track.trackUrl,
        stylePrompt: track.stylePrompt,
        refinementNotes: input.styleModifier || "Regenerated",
      });

      const newPrompt = input.styleModifier
        ? `${track.stylePrompt}, ${input.styleModifier}`
        : track.stylePrompt;

      await db.update(musicTracks).set({
        stylePrompt: newPrompt,
        versionNumber: track.versionNumber + 1,
        trackUrl: null,
        sunoGenerationId: `suno_regen_${Date.now()}`,
        isApproved: 0,
      }).where(eq(musicTracks.id, input.trackId));

      return { trackId: input.trackId, newVersion: track.versionNumber + 1, status: "generating" };
    }),

  // Get version history for a track
  getVersions: protectedProcedure
    .input(z.object({ trackId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const versions = await db.select().from(musicVersions)
        .where(eq(musicVersions.musicTrackId, input.trackId))
        .orderBy(desc(musicVersions.versionNumber));
      return versions;
    }),

  // Revert to a previous version
  revertVersion: protectedProcedure
    .input(z.object({ trackId: z.number(), versionNumber: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [version] = await db.select().from(musicVersions)
        .where(and(
          eq(musicVersions.musicTrackId, input.trackId),
          eq(musicVersions.versionNumber, input.versionNumber),
        )).limit(1);
      if (!version) throw new Error("Version not found");

      const [track] = await db.select().from(musicTracks).where(eq(musicTracks.id, input.trackId)).limit(1);
      if (!track) throw new Error("Track not found");

      // Save current as a new version
      await db.insert(musicVersions).values({
        musicTrackId: track.id,
        versionNumber: track.versionNumber,
        trackUrl: track.trackUrl,
        stylePrompt: track.stylePrompt,
        refinementNotes: `Reverted to version ${input.versionNumber}`,
      });

      // Restore the old version
      await db.update(musicTracks).set({
        trackUrl: version.trackUrl,
        stylePrompt: version.stylePrompt,
        versionNumber: track.versionNumber + 1,
        isApproved: 0,
      }).where(eq(musicTracks.id, input.trackId));

      return { success: true, restoredVersion: input.versionNumber };
    }),

  // Upload user's own music
  uploadTrack: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      trackType: z.enum(["opening", "ending", "bgm", "custom"]),
      title: z.string(),
      mood: z.string().optional(),
      fileKey: z.string(),
      fileUrl: z.string(),
      durationSeconds: z.number(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const tier = (user as any)?.tier || "free";
      const limits = getTierLimits(tier);
      if (!limits.upload) throw new Error("Music upload not available on free tier");

      const [track] = await db.insert(musicTracks).values({
        projectId: input.projectId,
        trackType: input.trackType,
        mood: input.mood || null,
        title: input.title,
        trackUrl: input.fileUrl,
        durationSeconds: input.durationSeconds,
        isVocal: input.trackType === "opening" || input.trackType === "ending" ? 1 : 0,
        isLoopable: input.trackType === "bgm" ? 1 : 0,
        versionNumber: 1,
        isApproved: 0,
        isUserUploaded: 1,
      }).$returningId();

      return { id: track.id, title: input.title, uploaded: true };
    }),

  // Save full music config to pre_production_configs
  saveMusicConfig: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      musicConfig: z.any(), // Full music config JSON
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await db.update(preProductionConfigs)
        .set({ musicConfig: input.musicConfig })
        .where(eq(preProductionConfigs.projectId, input.projectId));
      return { success: true };
    }),

  // Get music genres list
  getGenres: protectedProcedure.query(async () => {
    return MUSIC_GENRES;
  }),

  // Get BGM moods list
  getBgmMoods: protectedProcedure.query(async () => {
    return BGM_MOODS;
  }),

  // Get stinger types list
  getStingerTypes: protectedProcedure.query(async () => {
    return STINGER_TYPES;
  }),

  // Get tier limits for music
  getMusicTierLimits: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const tier = (user as any)?.tier || "free";
    return { tier, limits: getTierLimits(tier) };
  }),
});
