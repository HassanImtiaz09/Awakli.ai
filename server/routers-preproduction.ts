import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  preProductionConfigs,
  characterVersions,
  voiceAuditions,
  characters,
  episodes,
  panels,
  scenes,
  projects,
  subscriptions,
} from "../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { browseSharedVoices, textToSpeech, instantVoiceClone, MODELS, VOICE_PRESETS } from "./elevenlabs";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ─── Helpers ─────────────────────────────────────────────────────────────

async function requireCreatorOrStudio(userId: number) {
  const db = (await getDb())!;
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  const tier = sub?.tier ?? "free";
  if (tier === "free" || tier === "pro") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Pre-production suite requires Creator or Studio tier",
    });
  }
  return tier as "creator" | "studio";
}

async function requireProjectOwner(projectId: number, userId: number) {
  const db = (await getDb())!;
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

async function getOrCreateConfig(projectId: number) {
  const db = (await getDb())!;
  const [existing] = await db
    .select()
    .from(preProductionConfigs)
    .where(eq(preProductionConfigs.projectId, projectId))
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db
    .insert(preProductionConfigs)
    .values({ projectId })
    .$returningId();
  const [config] = await db
    .select()
    .from(preProductionConfigs)
    .where(eq(preProductionConfigs.id, inserted.id))
    .limit(1);
  return config!;
}

// ─── Animation Style Definitions ─────────────────────────────────────────

const ANIMATION_STYLES = [
  {
    id: "limited",
    name: "Limited Animation",
    description:
      "Classic TV anime style. Minimal motion, strong key frames, mouth flaps for dialogue. Clean and efficient.",
    references: ["Naruto", "Dragon Ball", "Most seasonal anime"],
    klingModifier:
      "minimal movement, key frame animation style, mouth opening and closing for speech, subtle eye blinks, static backgrounds",
    costMultiplier: 1.0,
    costLabel: "$",
  },
  {
    id: "sakuga",
    name: "Full Animation / Sakuga",
    description:
      "Movie-quality fluid motion. Every frame drawn. Dynamic camera work, detailed movement, cinematic impact.",
    references: ["Studio Ghibli", "Demon Slayer fight scenes"],
    klingModifier:
      "fluid animation, dynamic camera movement, detailed character motion, flowing hair and clothing physics, cinematic quality, high frame rate feel",
    costMultiplier: 2.0,
    costLabel: "$$$",
  },
  {
    id: "cel_shaded",
    name: "Cel-Shaded 3D",
    description:
      "Modern 3D renders with anime-style cel shading. Smooth camera rotation, depth-of-field effects, 3D lighting.",
    references: ["Arcane", "Spider-Verse", "Land of the Lustrous"],
    klingModifier:
      "cel-shaded 3D animation, toon shading, smooth camera rotation, depth of field, 3D lighting with anime aesthetic, bold outlines on 3D models",
    costMultiplier: 1.5,
    costLabel: "$$",
  },
  {
    id: "rotoscope",
    name: "Rotoscoping / Semi-Realistic",
    description:
      "Traced-over-live-action feel. Fluid, realistic movement with an artistic painterly overlay.",
    references: ["A Scanner Darkly", "Undone", "Mob Psycho 100"],
    klingModifier:
      "rotoscoped animation, realistic movement, painterly overlay, detailed human motion, artistic filter, semi-realistic proportions",
    costMultiplier: 1.5,
    costLabel: "$$",
  },
  {
    id: "motion_comic",
    name: "Motion Comic",
    description:
      "Panels come to life with subtle parallax motion, zoom effects, and animated speech bubbles. Stylish and affordable.",
    references: ["Marvel Infinity Comics", "Webtoon animations"],
    klingModifier:
      "subtle parallax motion, Ken Burns effect, panel zoom, minimal character movement, animated text elements",
    costMultiplier: 0.5,
    costLabel: "$",
  },
];

const COLOR_GRADING_PRESETS = [
  { id: "warm", name: "Warm & Golden", description: "Warm tones, sunset feel, nostalgic" },
  { id: "cool", name: "Cool & Cinematic", description: "Blue tones, desaturated, film-like" },
  { id: "vivid", name: "Vivid & Saturated", description: "High saturation, punchy colors, energetic" },
  { id: "muted", name: "Muted & Atmospheric", description: "Low saturation, fog-like, moody" },
  { id: "neon", name: "Neon & Electric", description: "High contrast, neon accents on dark, cyberpunk" },
  { id: "pastel", name: "Pastel & Dreamy", description: "Soft pastels, light bloom, ethereal" },
];

const ATMOSPHERIC_EFFECTS = ["rain", "snow", "fog", "dust", "sakura", "fireflies"];

const CHARACTER_VIEWS = ["portrait", "fullBody", "threeQuarter", "action", "expressions"] as const;

// ═══════════════════════════════════════════════════════════════════════
// PRE-PRODUCTION CORE ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const preProductionRouter = router({
  // Initialize or get pre-production config
  start: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tier = await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);
      const config = await getOrCreateConfig(input.projectId);
      return { config, tier };
    }),

  // Get current status and all config data
  getStatus: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireProjectOwner(input.projectId, ctx.user.id);
      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);
      if (!config) return null;

      // Get project characters
      const projectCharacters = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, input.projectId));

      // Get project episodes for scene data
      const projectEpisodes = await db
        .select()
        .from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      return {
        config,
        characters: projectCharacters,
        episodes: projectEpisodes,
      };
    }),

  // Update config fields (partial update)
  updateConfig: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        animationStyle: z.string().optional(),
        styleMixing: z.record(z.string(), z.string()).optional(),
        colorGrading: z.string().optional(),
        atmosphericEffects: z.record(z.string(), z.array(z.string())).optional(),
        aspectRatio: z.string().optional(),
        openingStyle: z.string().optional(),
        endingStyle: z.string().optional(),
        pacing: z.string().optional(),
        subtitleConfig: z
          .object({
            primaryLang: z.string(),
            additionalLangs: z.array(z.string()).optional(),
            style: z.string().optional(),
            fontSize: z.string().optional(),
            burnedIn: z.boolean().optional(),
          })
          .optional(),
        audioConfig: z
          .object({
            musicVolume: z.number().min(10).max(50).optional(),
            sfxVolume: z.number().min(30).max(80).optional(),
            duckingIntensity: z.enum(["light", "medium", "heavy"]).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const { projectId, ...updates } = input;
      const cleanUpdates: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) cleanUpdates[key] = value;
      }

      if (Object.keys(cleanUpdates).length > 0) {
        await db
          .update(preProductionConfigs)
          .set(cleanUpdates)
          .where(eq(preProductionConfigs.projectId, projectId));
      }

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, projectId))
        .limit(1);
      return config;
    }),

  // Advance to next stage
  advanceStage: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "Config not found" });
      if (config.status === "locked")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Config is locked" });
      if (config.currentStage >= 6)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already at final stage" });

      await db
        .update(preProductionConfigs)
        .set({ currentStage: config.currentStage + 1 })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { currentStage: config.currentStage + 1 };
    }),

  // Go back to a previous stage
  goToStage: protectedProcedure
    .input(z.object({ projectId: z.number(), stage: z.number().min(1).max(6) }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      if (config.status === "locked")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Config is locked" });
      if (input.stage > config.currentStage)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot skip ahead" });

      await db
        .update(preProductionConfigs)
        .set({ currentStage: input.stage })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { currentStage: input.stage };
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 1: CHARACTER GALLERY ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const characterGalleryRouter = router({
  // Generate 5-view character sheet
  generateSheet: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [character] = await db
        .select()
        .from(characters)
        .where(
          and(
            eq(characters.id, input.characterId),
            eq(characters.projectId, input.projectId)
          )
        )
        .limit(1);

      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      // Get project art style
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);

      const artStyle = project?.animeStyle ?? "default";
      const visualTraits = (character.visualTraits as Record<string, string>) ?? {};
      const traitDesc = Object.entries(visualTraits)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      // Determine next version number
      const existingVersions = await db
        .select()
        .from(characterVersions)
        .where(eq(characterVersions.characterId, input.characterId))
        .orderBy(desc(characterVersions.versionNumber))
        .limit(1);

      const nextVersion = existingVersions.length > 0 ? existingVersions[0].versionNumber + 1 : 1;

      // In production: generate 5 views via FLUX
      // For now: create placeholder version with simulated URLs
      const viewTypes = {
        portrait: "face close-up, showing hairstyle, eye color, expression",
        fullBody: "full body front view, showing outfit, proportions, stance",
        threeQuarter: "3/4 angle view, showing depth and dimension",
        action: "dynamic action pose fitting their role",
        expressions: "expression sheet, 4 emotions: happy, angry, sad, surprised in a 2x2 grid",
      };

      const images: Record<string, string> = {};
      for (const [view, desc] of Object.entries(viewTypes)) {
        // In production: call FLUX with prompt
        // `anime character sheet, ${artStyle}, ${character.name}, ${traitDesc}, ${desc}, white background, clean lines, professional character design, consistent proportions`
        images[view] = `https://placeholder.awakli.ai/character-sheet/${input.characterId}/${view}/v${nextVersion}`;
      }

      const [versionId] = await db
        .insert(characterVersions)
        .values({
          characterId: input.characterId,
          versionNumber: nextVersion,
          images,
          descriptionUsed: traitDesc || character.name,
          qualityScores: {},
          isApproved: 0,
        })
        .$returningId();

      return {
        versionId: versionId.id,
        versionNumber: nextVersion,
        images,
        characterName: character.name,
        artStyle,
      };
    }),

  // Regenerate a specific view with updated description
  regenerateView: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        view: z.enum(["portrait", "fullBody", "threeQuarter", "action", "expressions"]),
        updatedDescription: z.string().optional(),
        specificChanges: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Get latest version
      const [latestVersion] = await db
        .select()
        .from(characterVersions)
        .where(eq(characterVersions.characterId, input.characterId))
        .orderBy(desc(characterVersions.versionNumber))
        .limit(1);

      if (!latestVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No character version found. Generate sheet first." });
      }

      const currentImages = (latestVersion.images as Record<string, string>) ?? {};
      const description = input.updatedDescription || latestVersion.descriptionUsed || "";
      const changes = input.specificChanges ? `. Changes: ${input.specificChanges}` : "";

      // In production: regenerate via FLUX with updated description
      const newUrl = `https://placeholder.awakli.ai/character-sheet/${input.characterId}/${input.view}/v${latestVersion.versionNumber}-regen-${Date.now()}`;

      // Create new version with the updated view
      const newImages = { ...currentImages, [input.view]: newUrl };
      const nextVersion = latestVersion.versionNumber + 1;

      const [versionId] = await db
        .insert(characterVersions)
        .values({
          characterId: input.characterId,
          versionNumber: nextVersion,
          images: newImages,
          descriptionUsed: description + changes,
          qualityScores: {},
          isApproved: 0,
        })
        .$returningId();

      return {
        versionId: versionId.id,
        versionNumber: nextVersion,
        view: input.view,
        newUrl,
        images: newImages,
      };
    }),

  // Approve character design
  approve: protectedProcedure
    .input(z.object({ characterId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Get latest version and mark approved
      const [latestVersion] = await db
        .select()
        .from(characterVersions)
        .where(eq(characterVersions.characterId, input.characterId))
        .orderBy(desc(characterVersions.versionNumber))
        .limit(1);

      if (!latestVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No version to approve" });
      }

      await db
        .update(characterVersions)
        .set({ isApproved: 1 })
        .where(eq(characterVersions.id, latestVersion.id));

      // Update pre-production config character approvals
      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (config) {
        const approvals = (config.characterApprovals as Record<string, unknown>) ?? {};
        approvals[String(input.characterId)] = {
          approved: true,
          versionId: latestVersion.id,
          lockedAt: new Date().toISOString(),
        };
        await db
          .update(preProductionConfigs)
          .set({ characterApprovals: approvals })
          .where(eq(preProductionConfigs.projectId, input.projectId));
      }

      return { approved: true, versionId: latestVersion.id };
    }),

  // Get version history
  getVersions: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const versions = await db
        .select()
        .from(characterVersions)
        .where(eq(characterVersions.characterId, input.characterId))
        .orderBy(desc(characterVersions.versionNumber));
      return versions;
    }),

  // Revert to a previous version
  revertVersion: protectedProcedure
    .input(z.object({ characterId: z.number(), projectId: z.number(), versionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [targetVersion] = await db
        .select()
        .from(characterVersions)
        .where(
          and(
            eq(characterVersions.id, input.versionId),
            eq(characterVersions.characterId, input.characterId)
          )
        )
        .limit(1);

      if (!targetVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      // Create a new version that copies the target version's images
      const [latest] = await db
        .select()
        .from(characterVersions)
        .where(eq(characterVersions.characterId, input.characterId))
        .orderBy(desc(characterVersions.versionNumber))
        .limit(1);

      const nextVersion = (latest?.versionNumber ?? 0) + 1;

      const [newId] = await db
        .insert(characterVersions)
        .values({
          characterId: input.characterId,
          versionNumber: nextVersion,
          images: targetVersion.images,
          descriptionUsed: `Reverted to version ${targetVersion.versionNumber}`,
          qualityScores: targetVersion.qualityScores,
          isApproved: 0,
        })
        .$returningId();

      return {
        newVersionId: newId.id,
        versionNumber: nextVersion,
        images: targetVersion.images,
        revertedFrom: targetVersion.versionNumber,
      };
    }),

  // Update character art style override
  updateStyle: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        style: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Store style override in character's visual traits
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, input.characterId))
        .limit(1);

      if (!character) throw new TRPCError({ code: "NOT_FOUND" });

      const traits = (character.visualTraits as Record<string, string>) ?? {};
      traits.styleOverride = input.style;

      await db
        .update(characters)
        .set({ visualTraits: traits })
        .where(eq(characters.id, input.characterId));

      return { characterId: input.characterId, style: input.style };
    }),

  // Queue LoRA training (Studio only)
  trainLoRA: protectedProcedure
    .input(z.object({ characterId: z.number(), projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tier = await requireCreatorOrStudio(ctx.user.id);
      if (tier !== "studio") {
        throw new TRPCError({ code: "FORBIDDEN", message: "LoRA training requires Studio tier" });
      }
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Get approved version images
      const [approvedVersion] = await db
        .select()
        .from(characterVersions)
        .where(
          and(
            eq(characterVersions.characterId, input.characterId),
            eq(characterVersions.isApproved, 1)
          )
        )
        .orderBy(desc(characterVersions.versionNumber))
        .limit(1);

      if (!approvedVersion) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Character must be approved before LoRA training" });
      }

      // Update character LoRA status
      await db
        .update(characters)
        .set({ loraStatus: "training", loraTrainingProgress: 0 })
        .where(eq(characters.id, input.characterId));

      return {
        characterId: input.characterId,
        status: "training",
        estimatedMinutes: 10,
        images: approvedVersion.images,
      };
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 2: VOICE CASTING ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const voiceCastingRouter = router({
  // Browse voice library with filters
  browseLibrary: protectedProcedure
    .input(
      z.object({
        gender: z.enum(["male", "female", "non-binary"]).optional(),
        age: z.enum(["young", "adult", "elderly"]).optional(),
        tone: z.enum(["warm", "cool", "rough", "smooth", "energetic", "calm"]).optional(),
        accent: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireCreatorOrStudio(ctx.user.id);

      // Browse ElevenLabs shared voice library with filters
      try {
        const ageMap: Record<string, "young" | "middle_aged" | "old"> = {
          young: "young",
          adult: "middle_aged",
          elderly: "old",
        };

        const result = await browseSharedVoices({
          gender: input.gender === "non-binary" ? undefined : (input.gender as "male" | "female" | undefined),
          age: input.age ? ageMap[input.age] : undefined,
          accent: input.accent,
          page_size: input.limit,
          sort: "trending",
        });

        const voices = result.voices.map((v) => ({
          id: v.voice_id,
          name: v.name,
          gender: v.gender || "unknown",
          age: v.age || "adult",
          tone: v.use_case || "neutral",
          accent: v.accent || "neutral",
          sampleUrl: v.preview_url || "",
        }));

        // Apply tone filter client-side (ElevenLabs doesn't have a direct tone filter)
        let filtered = voices;
        if (input.tone) {
          filtered = filtered.filter((v) =>
            v.tone.toLowerCase().includes(input.tone!.toLowerCase())
          );
        }

        return {
          voices: filtered,
          total: filtered.length,
          page: input.page,
        };
      } catch (err: any) {
        console.error("[VoiceCasting] Browse library failed:", err.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to browse voice library" });
      }
    }),

  // Audition voice with character's first dialogue line
  auditionWithScript: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        voiceId: z.string(),
        voiceName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Check audition limit (10 per character)
      const existingAuditions = await db
        .select()
        .from(voiceAuditions)
        .where(eq(voiceAuditions.characterId, input.characterId));

      if (existingAuditions.length >= 10) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Maximum 10 auditions per character reached",
        });
      }

      // Find character's first dialogue line from script
      const [character] = await db
        .select()
        .from(characters)
        .where(eq(characters.id, input.characterId))
        .limit(1);

      if (!character) throw new TRPCError({ code: "NOT_FOUND" });

      // Get first episode panels with dialogue
      const episodePanels = await db
        .select()
        .from(panels)
        .where(eq(panels.projectId, input.projectId))
        .limit(50);

      let dialogueText = `Hello, I am ${character.name}.`;
      for (const panel of episodePanels) {
        const dialogue = panel.dialogue as Array<{ character: string; text: string }> | null;
        if (dialogue) {
          const charLine = dialogue.find(
            (d) => d.character?.toLowerCase() === character.name.toLowerCase()
          );
          if (charLine) {
            dialogueText = charLine.text;
            break;
          }
        }
      }

      // Generate audition audio using ElevenLabs TTS
      let audioUrl: string;
      try {
        const audioBuffer = await textToSpeech({
          voiceId: input.voiceId,
          text: dialogueText,
          modelId: MODELS.MULTILINGUAL_V2,
          voiceSettings: VOICE_PRESETS.heroic,
        });
        const audioKey = `auditions/${input.characterId}/${input.voiceId}-${nanoid(6)}.mp3`;
        const { url } = await storagePut(audioKey, audioBuffer, "audio/mpeg");
        audioUrl = url;
      } catch (err: any) {
        console.error("[VoiceCasting] Audition TTS failed:", err.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Voice audition failed: " + err.message });
      }

      const [auditionId] = await db
        .insert(voiceAuditions)
        .values({
          characterId: input.characterId,
          voiceId: input.voiceId,
          voiceName: input.voiceName,
          dialogueText,
          audioUrl,
          isSelected: 0,
        })
        .$returningId();

      return {
        auditionId: auditionId.id,
        audioUrl,
        dialogueText,
        voiceName: input.voiceName,
        auditionsRemaining: 10 - existingAuditions.length - 1,
      };
    }),

  // Cast voice for character
  castVoice: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        voiceId: z.string(),
        voiceName: z.string(),
        source: z.enum(["library", "clone", "auto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Deselect all previous auditions for this character
      await db
        .update(voiceAuditions)
        .set({ isSelected: 0 })
        .where(eq(voiceAuditions.characterId, input.characterId));

      // Mark the selected voice audition
      await db
        .update(voiceAuditions)
        .set({ isSelected: 1 })
        .where(
          and(
            eq(voiceAuditions.characterId, input.characterId),
            eq(voiceAuditions.voiceId, input.voiceId)
          )
        );

      // Update character voice
      await db
        .update(characters)
        .set({ voiceId: input.voiceId })
        .where(eq(characters.id, input.characterId));

      // Update pre-production voice assignments
      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (config) {
        const assignments = (config.voiceAssignments as Record<string, unknown>) ?? {};
        assignments[String(input.characterId)] = {
          voiceId: input.voiceId,
          voiceName: input.voiceName,
          source: input.source,
        };
        await db
          .update(preProductionConfigs)
          .set({ voiceAssignments: assignments })
          .where(eq(preProductionConfigs.projectId, input.projectId));
      }

      return { characterId: input.characterId, voiceId: input.voiceId, voiceName: input.voiceName };
    }),

  // Upload voice clone
  uploadClone: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        audioUrl: z.string(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tier = await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Check clone limits
      if (tier === "creator") {
        const existingClones = await db
          .select()
          .from(characters)
          .where(
            and(
              eq(characters.projectId, input.projectId),
              eq(characters.userId, ctx.user.id)
            )
          );
        const cloneCount = existingClones.filter((c) => c.voiceCloneUrl).length;
        if (cloneCount >= 2) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Creator tier allows 2 voice clones. Upgrade to Studio for unlimited.",
          });
        }
      }

      // Clone voice using ElevenLabs instant voice cloning
      try {
        const [character] = await db
          .select()
          .from(characters)
          .where(eq(characters.id, input.characterId))
          .limit(1);

        const cloneName = character?.name
          ? `${character.name}_clone_${Date.now()}`
          : `character_${input.characterId}_clone`;

        const result = await instantVoiceClone({
          name: cloneName,
          description: `Voice clone for character ${input.characterId}`,
          audioUrls: [input.audioUrl],
          labels: { character_id: String(input.characterId), source: "user_upload" },
        });

        await db
          .update(characters)
          .set({
            voiceCloneUrl: input.audioUrl,
            voiceId: result.voice_id,
          })
          .where(eq(characters.id, input.characterId));

        return {
          characterId: input.characterId,
          cloneUrl: input.audioUrl,
          voiceId: result.voice_id,
          status: "complete",
          estimatedMinutes: 0,
        };
      } catch (err: any) {
        console.error("[VoiceCasting] Clone failed:", err.message);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Voice cloning failed: " + err.message });
      }
    }),

  // Set voice direction notes
  setDirectionNotes: protectedProcedure
    .input(
      z.object({
        characterId: z.number(),
        projectId: z.number(),
        notes: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (config) {
        const assignments = (config.voiceAssignments as Record<string, Record<string, string>>) ?? {};
        if (!assignments[String(input.characterId)]) {
          assignments[String(input.characterId)] = {} as Record<string, string>;
        }
        assignments[String(input.characterId)].directionNotes = input.notes;
        await db
          .update(preProductionConfigs)
          .set({ voiceAssignments: assignments })
          .where(eq(preProductionConfigs.projectId, input.projectId));
      }

      return { characterId: input.characterId, notes: input.notes };
    }),

  // Get auditions for a character
  getAuditions: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const auditions = await db
        .select()
        .from(voiceAuditions)
        .where(eq(voiceAuditions.characterId, input.characterId))
        .orderBy(desc(voiceAuditions.createdAt));
      return auditions;
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 3: ANIMATION STYLE ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const animationStyleRouter = router({
  // Get all animation style options
  getOptions: protectedProcedure.query(async () => {
    return ANIMATION_STYLES;
  }),

  // Generate preview clip for a specific style
  generatePreview: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        styleId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const style = ANIMATION_STYLES.find((s) => s.id === input.styleId);
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Style not found" });

      // In production: find best scene, generate 3-5s video clip via Kling
      // with style.klingModifier applied
      const previewUrl = `https://placeholder.awakli.ai/style-preview/${input.projectId}/${input.styleId}/${Date.now()}.mp4`;

      return {
        styleId: input.styleId,
        styleName: style.name,
        previewUrl,
        durationSeconds: 5,
        costMultiplier: style.costMultiplier,
      };
    }),

  // Select animation style
  select: protectedProcedure
    .input(z.object({ projectId: z.number(), styleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const style = ANIMATION_STYLES.find((s) => s.id === input.styleId);
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Style not found" });

      await db
        .update(preProductionConfigs)
        .set({ animationStyle: input.styleId })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { styleId: input.styleId, styleName: style.name, costMultiplier: style.costMultiplier };
    }),

  // Set style mixing per scene (Studio only)
  setMixing: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        mixing: z.record(z.string(), z.string()), // sceneId -> styleId
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tier = await requireCreatorOrStudio(ctx.user.id);
      if (tier !== "studio") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Style mixing requires Studio tier" });
      }
      await requireProjectOwner(input.projectId, ctx.user.id);

      await db
        .update(preProductionConfigs)
        .set({ styleMixing: input.mixing })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { mixing: input.mixing };
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 4: ENVIRONMENTS ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const environmentsRouter = router({
  // Extract locations from script
  extractLocations: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Get scenes for this project
      const projectScenes = await db
        .select()
        .from(scenes)
        .where(eq(scenes.projectId, input.projectId));

      // Extract unique locations
      const locationMap = new Map<string, { sceneIds: number[]; timeOfDay: string; mood: string }>();
      for (const scene of projectScenes) {
        const loc = scene.location || "Unknown Location";
        if (!locationMap.has(loc)) {
          locationMap.set(loc, {
            sceneIds: [],
            timeOfDay: scene.timeOfDay || "day",
            mood: scene.mood || "neutral",
          });
        }
        locationMap.get(loc)!.sceneIds.push(scene.id);
      }

      return Array.from(locationMap.entries()).map(([name, data]) => ({
        name,
        sceneIds: data.sceneIds,
        timeOfDay: data.timeOfDay,
        mood: data.mood,
      }));
    }),

  // Generate concept art for a location
  generateConceptArt: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        locationName: z.string(),
        timeOfDay: z.enum(["day", "night", "dawn", "dusk"]).default("day"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // In production: generate via FLUX with landscape 16:9 aspect
      const imageUrl = `https://placeholder.awakli.ai/environment/${input.projectId}/${encodeURIComponent(input.locationName)}/${input.timeOfDay}/${Date.now()}.png`;

      return {
        locationName: input.locationName,
        timeOfDay: input.timeOfDay,
        imageUrl,
      };
    }),

  // Approve location
  approveLocation: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        locationName: z.string(),
        imageUrl: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (config) {
        const approvals = (config.environmentApprovals as Record<string, unknown>) ?? {};
        approvals[input.locationName] = {
          approvedUrl: input.imageUrl,
          approvedAt: new Date().toISOString(),
        };
        await db
          .update(preProductionConfigs)
          .set({ environmentApprovals: approvals })
          .where(eq(preProductionConfigs.projectId, input.projectId));
      }

      return { locationName: input.locationName, approved: true };
    }),

  // Get color grading presets
  getColorGradingPresets: protectedProcedure.query(async () => {
    return COLOR_GRADING_PRESETS;
  }),

  // Set color grading
  setColorGrading: protectedProcedure
    .input(z.object({ projectId: z.number(), preset: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const preset = COLOR_GRADING_PRESETS.find((p) => p.id === input.preset);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });

      await db
        .update(preProductionConfigs)
        .set({ colorGrading: input.preset })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { preset: input.preset, name: preset.name };
    }),

  // Set atmospheric effects per scene
  setAtmosphericEffects: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        effects: z.record(z.string(), z.array(z.string())), // sceneId -> effects[]
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      // Validate effects
      for (const effectList of Object.values(input.effects) as string[][]) {
        for (const effect of effectList) {
          if (!ATMOSPHERIC_EFFECTS.includes(effect)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Invalid effect: ${effect}. Valid: ${ATMOSPHERIC_EFFECTS.join(", ")}`,
            });
          }
        }
      }

      await db
        .update(preProductionConfigs)
        .set({ atmosphericEffects: input.effects })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { effects: input.effects };
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 5: PRODUCTION CONFIG ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const productionConfigRouter = router({
  // Set aspect ratio
  setAspectRatio: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        aspectRatio: z.enum(["16:9", "9:16", "4:3", "2.35:1"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tier = await requireCreatorOrStudio(ctx.user.id);
      if (input.aspectRatio === "2.35:1" && tier !== "studio") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cinematic 2.35:1 requires Studio tier" });
      }
      await requireProjectOwner(input.projectId, ctx.user.id);

      await db
        .update(preProductionConfigs)
        .set({ aspectRatio: input.aspectRatio })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { aspectRatio: input.aspectRatio };
    }),

  // Set opening style
  setOpeningStyle: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        style: z.enum(["classic_anime_op", "title_card", "cold_open", "custom"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const tier = await requireCreatorOrStudio(ctx.user.id);
      if (input.style === "custom" && tier !== "studio") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Custom opening requires Studio tier" });
      }
      await requireProjectOwner(input.projectId, ctx.user.id);

      await db
        .update(preProductionConfigs)
        .set({ openingStyle: input.style })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { openingStyle: input.style };
    }),

  // Set ending style
  setEndingStyle: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        style: z.enum(["credits_roll", "still_frame", "next_preview", "none"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      await db
        .update(preProductionConfigs)
        .set({ endingStyle: input.style })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { endingStyle: input.style };
    }),

  // Set pacing
  setPacing: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        pacing: z.enum(["cinematic_slow", "standard_tv", "fast_dynamic"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      await db
        .update(preProductionConfigs)
        .set({ pacing: input.pacing })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return { pacing: input.pacing };
    }),

  // Set subtitle config
  setSubtitles: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        primaryLang: z.string(),
        additionalLangs: z.array(z.string()).optional(),
        style: z.enum(["standard_white", "anime_yellow", "styled"]).default("standard_white"),
        fontSize: z.enum(["small", "medium", "large"]).default("medium"),
        burnedIn: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const subtitleConfig = {
        primaryLang: input.primaryLang,
        additionalLangs: input.additionalLangs || [],
        style: input.style,
        fontSize: input.fontSize,
        burnedIn: input.burnedIn,
      };

      await db
        .update(preProductionConfigs)
        .set({ subtitleConfig })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return subtitleConfig;
    }),

  // Set audio preferences
  setAudio: protectedProcedure
    .input(
      z.object({
        projectId: z.number(),
        musicVolume: z.number().min(10).max(50).default(30),
        sfxVolume: z.number().min(30).max(80).default(60),
        duckingIntensity: z.enum(["light", "medium", "heavy"]).default("medium"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const audioConfig = {
        musicVolume: input.musicVolume,
        sfxVolume: input.sfxVolume,
        duckingIntensity: input.duckingIntensity,
      };

      await db
        .update(preProductionConfigs)
        .set({ audioConfig })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return audioConfig;
    }),
});

// ═══════════════════════════════════════════════════════════════════════
// STAGE 6: FINAL REVIEW ROUTER
// ═══════════════════════════════════════════════════════════════════════

export const reviewRouter = router({
  // Get full production summary
  getSummary: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND" });

      // Get characters with their approved versions and voices
      const projectCharacters = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, input.projectId));

      const characterSummaries = await Promise.all(
        projectCharacters.map(async (char) => {
          const [approvedVersion] = await db
            .select()
            .from(characterVersions)
            .where(
              and(
                eq(characterVersions.characterId, char.id),
                eq(characterVersions.isApproved, 1)
              )
            )
            .orderBy(desc(characterVersions.versionNumber))
            .limit(1);

          const [selectedVoice] = await db
            .select()
            .from(voiceAuditions)
            .where(
              and(
                eq(voiceAuditions.characterId, char.id),
                eq(voiceAuditions.isSelected, 1)
              )
            )
            .limit(1);

          return {
            id: char.id,
            name: char.name,
            role: char.role,
            portraitUrl: approvedVersion
              ? (approvedVersion.images as Record<string, string>)?.portrait
              : null,
            voiceName: selectedVoice?.voiceName || char.voiceId || "Auto-assigned",
            voiceId: selectedVoice?.voiceId || char.voiceId,
            approved: !!approvedVersion,
          };
        })
      );

      // Get animation style info
      const animStyle = ANIMATION_STYLES.find((s) => s.id === config.animationStyle);
      const colorPreset = COLOR_GRADING_PRESETS.find((p) => p.id === config.colorGrading);

      // Get episode count for cost estimation
      const projectEpisodes = await db
        .select()
        .from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      return {
        config,
        characters: characterSummaries,
        animationStyle: animStyle || null,
        colorGrading: colorPreset || null,
        episodeCount: projectEpisodes.length,
      };
    }),

  // Estimate production cost
  estimateCost: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND" });

      // Get episode and panel counts
      const projectEpisodes = await db
        .select()
        .from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      const totalPanels = projectEpisodes.reduce((sum, ep) => sum + (ep.panelCount ?? 0), 0);
      const episodeCount = projectEpisodes.length;

      // Base costs per episode (in credits)
      const baseCosts = {
        videoGen: totalPanels * 5, // 5 credits per panel video
        voiceGen: episodeCount * 20, // 20 credits per episode voice
        musicGen: episodeCount * 10, // 10 credits per episode music
        sfxGen: episodeCount * 5, // 5 credits per episode SFX
        assembly: episodeCount * 3, // 3 credits per episode assembly
      };

      // Apply animation style multiplier
      const styleMultiplier =
        ANIMATION_STYLES.find((s) => s.id === config.animationStyle)?.costMultiplier ?? 1.0;

      const adjustedCosts = {
        videoGen: Math.ceil(baseCosts.videoGen * styleMultiplier),
        voiceGen: baseCosts.voiceGen,
        musicGen: baseCosts.musicGen,
        sfxGen: baseCosts.sfxGen,
        assembly: baseCosts.assembly,
      };

      const totalCredits = Object.values(adjustedCosts).reduce((a, b) => a + b, 0);

      // Save estimate
      await db
        .update(preProductionConfigs)
        .set({ estimatedCostCredits: totalCredits })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      return {
        breakdown: adjustedCosts,
        styleMultiplier,
        totalCredits,
        estimatedDollars: (totalCredits * 0.05).toFixed(2),
        episodeCount,
        totalPanels,
        estimatedMinutesPerEpisode: Math.ceil(totalPanels * 2.5),
      };
    }),

  // Lock config and start pipeline
  lock: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      await requireCreatorOrStudio(ctx.user.id);
      await requireProjectOwner(input.projectId, ctx.user.id);

      const [config] = await db
        .select()
        .from(preProductionConfigs)
        .where(eq(preProductionConfigs.projectId, input.projectId))
        .limit(1);

      if (!config) throw new TRPCError({ code: "NOT_FOUND" });
      if (config.status === "locked") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Config is already locked" });
      }

      // Validate all stages are complete
      const projectCharacters = await db
        .select()
        .from(characters)
        .where(eq(characters.projectId, input.projectId));

      const approvals = (config.characterApprovals as Record<string, { approved: boolean }>) ?? {};
      const allApproved = projectCharacters.every(
        (c) => approvals[String(c.id)]?.approved
      );

      if (!allApproved && projectCharacters.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "All characters must be approved before locking",
        });
      }

      if (!config.animationStyle) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Animation style must be selected before locking",
        });
      }

      // Lock the config
      await db
        .update(preProductionConfigs)
        .set({ status: "locked", lockedAt: new Date(), currentStage: 6 })
        .where(eq(preProductionConfigs.projectId, input.projectId));

      // Update project anime status
      await db
        .update(projects)
        .set({ animeStatus: "in_production" })
        .where(eq(projects.id, input.projectId));

      return {
        locked: true,
        lockedAt: new Date().toISOString(),
        estimatedCostCredits: config.estimatedCostCredits,
        redirectTo: `/studio/${input.projectId}/pipeline`,
      };
    }),
});
