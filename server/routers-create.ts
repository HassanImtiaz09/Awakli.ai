import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { nanoid } from "nanoid";
import {
  createProject,
  updateProject,
  getProjectById,
  getEpisodesByProject,
  getEpisodeById,
  updateEpisode,
  createEpisode,
  getPanelsByEpisode,
  createPanelsBulk,
  updatePanel,
  getDb,
  getOrCreateGuestUser,
  createCharacter,
  getCharactersByProject,
  getPanelById,
} from "./db";
import { projects, episodes, panels, characters } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── In-Memory Progress Store ──────────────────────────────────────────
// Tracks real-time per-panel progress for active generations.
// Keyed by projectId. Cleared when generation completes.

interface PanelProgress {
  panelId: number;
  sceneNumber: number;
  panelNumber: number;
  step: "queued" | "building_prompt" | "generating" | "uploading" | "complete" | "failed" | "retrying";
  startedAt?: number;   // ms timestamp
  completedAt?: number;
  attempt: number;
}

interface GenerationProgress {
  projectId: number;
  startedAt: number;
  phase: "script" | "characters" | "reference_sheet" | "panels" | "complete" | "error";
  phaseMessage: string;
  panelProgress: PanelProgress[];
  avgPanelTimeMs: number;  // rolling average for ETA
  completedTimes: number[]; // track individual panel durations
  characterRefUrl?: string; // generated character reference sheet URL
}

const activeGenerations = new Map<number, GenerationProgress>();

function getOrCreateProgress(projectId: number): GenerationProgress {
  if (!activeGenerations.has(projectId)) {
    activeGenerations.set(projectId, {
      projectId,
      startedAt: Date.now(),
      phase: "script",
      phaseMessage: "Writing your story...",
      panelProgress: [],
      avgPanelTimeMs: 12000, // initial estimate: 12s per panel
      completedTimes: [],
    });
  }
  return activeGenerations.get(projectId)!;
}

function updatePanelStep(projectId: number, panelId: number, step: PanelProgress["step"]) {
  const progress = activeGenerations.get(projectId);
  if (!progress) return;
  const pp = progress.panelProgress.find(p => p.panelId === panelId);
  if (!pp) return;
  pp.step = step;
  if (step === "generating" && !pp.startedAt) pp.startedAt = Date.now();
  if (step === "complete" || step === "failed") {
    pp.completedAt = Date.now();
    if (step === "complete" && pp.startedAt) {
      const duration = pp.completedAt - pp.startedAt;
      progress.completedTimes.push(duration);
      // Rolling average of last 5 panels
      const recent = progress.completedTimes.slice(-5);
      progress.avgPanelTimeMs = recent.reduce((a, b) => a + b, 0) / recent.length;
    }
  }
  if (step === "retrying") pp.attempt++;
}

// ─── Character Consistency Engine ──────────────────────────────────────

interface CharacterProfile {
  name: string;
  role: string;
  appearance: string; // detailed visual description
  seed: number;       // deterministic seed for this character
}

/**
 * Extract characters from the script and generate detailed appearance descriptions.
 * Uses LLM to create consistent, detailed visual profiles for each character.
 */
async function extractCharacterProfiles(
  script: any,
  genre: string,
  style: string,
  originalPrompt: string,
): Promise<CharacterProfile[]> {
  // Collect all character names from dialogue
  const charNames = new Set<string>();
  for (const scene of script.scenes) {
    for (const panel of scene.panels) {
      for (const d of panel.dialogue) {
        if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
          charNames.add(d.character);
        }
      }
    }
  }

  const charNamesArray = Array.from(charNames);
  if (charNamesArray.length === 0) return [];

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a manga character designer. Given character names and story context, create EXTREMELY detailed and consistent visual appearance descriptions for each character. These descriptions will be used as image generation prompts to maintain visual consistency across all panels.

Be VERY specific about:
- Exact hair style, length, and color (e.g., "spiky jet-black hair with silver streaks, medium length reaching the ears")
- Eye shape and color (e.g., "narrow amber eyes with sharp pupils")
- Face shape and distinguishing features (e.g., "angular jawline, thin scar across left cheek")
- Body build (e.g., "lean muscular build, tall, broad shoulders")
- Clothing details (e.g., "dark navy hooded cloak over white tunic, leather belt with silver buckle")
- Age appearance (e.g., "appears mid-20s")
- Any accessories or distinguishing marks

Genre: ${genre}
Art Style: ${style}`,
        },
        {
          role: "user",
          content: `Story premise: ${originalPrompt.slice(0, 500)}

Characters to design: ${charNamesArray.join(", ")}

Return a JSON array of character profiles. Each profile should have:
- "name": exact character name
- "role": their role (protagonist, antagonist, supporting)
- "appearance": a single detailed paragraph describing their complete visual appearance (100-200 words), written as image generation tags`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "character_profiles",
          strict: true,
          schema: {
            type: "object",
            properties: {
              characters: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    role: { type: "string", enum: ["protagonist", "antagonist", "supporting"] },
                    appearance: { type: "string" },
                  },
                  required: ["name", "role", "appearance"],
                  additionalProperties: false,
                },
              },
            },
            required: ["characters"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") return [];
    const parsed = JSON.parse(raw);

    // Assign deterministic seeds per character (based on name hash)
    return (parsed.characters || []).map((c: any) => ({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      seed: hashStringToSeed(c.name + style + genre),
    }));
  } catch (error) {
    console.warn("[QuickCreate] Character extraction failed, falling back to basic prompts:", error);
    return charNamesArray.map((name, i) => ({
      name,
      role: i === 0 ? "protagonist" : "supporting",
      appearance: "",
      seed: hashStringToSeed(name + style + genre),
    }));
  }
}

/** Simple string hash → deterministic seed (0 to 2^31) */
function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2147483647;
}

/**
 * Generate a character reference sheet for the protagonist.
 * This image is used as IP-Adapter reference for all subsequent panels.
 */
async function generateCharacterReferenceSheet(
  character: CharacterProfile,
  style: string,
): Promise<string | undefined> {
  try {
    const stylePrefix = style === "default" ? "manga style" : `${style} manga style`;
    const prompt = `${stylePrefix}, character reference sheet, multiple views of the same character, front view and three-quarter view, ${character.appearance}, clean white background, character turnaround, consistent design, professional manga character sheet, high quality, detailed`;

    const { url } = await generateImage({ prompt });
    return url;
  } catch (error) {
    console.warn("[QuickCreate] Character reference sheet generation failed:", error);
    return undefined;
  }
}

/**
 * Build a consistency-enhanced prompt for a panel.
 * Injects character appearance descriptions and reference anchoring.
 */
function buildConsistentPanelPrompt(
  panel: any,
  style: string,
  characterProfiles: CharacterProfile[],
  characterRefUrl?: string,
): { prompt: string; referenceUrl?: string } {
  const stylePrefix = style === "default" ? "manga style" : `${style} manga style`;

  // Find which characters appear in this panel's dialogue
  const panelCharacterSet = new Set<string>();
  if (panel.dialogue) {
    for (const d of panel.dialogue) {
      if (d.character && d.character !== "Narrator" && d.character !== "SFX") {
        panelCharacterSet.add(d.character);
      }
    }
  }
  const panelCharacters = Array.from(panelCharacterSet);

  // Build character appearance tags for characters in this panel
  const charDescriptions: string[] = [];
  for (const charName of panelCharacters) {
    const profile = characterProfiles.find(
      (p) => p.name.toLowerCase() === charName.toLowerCase()
    );
    if (profile?.appearance) {
      charDescriptions.push(`[${profile.name}: ${profile.appearance}]`);
    }
  }

  // If no specific characters found, use protagonist description for consistency
  if (charDescriptions.length === 0 && characterProfiles.length > 0) {
    const protagonist = characterProfiles.find(p => p.role === "protagonist") || characterProfiles[0];
    if (protagonist.appearance) {
      charDescriptions.push(`[${protagonist.name}: ${protagonist.appearance}]`);
    }
  }

  const characterSection = charDescriptions.length > 0
    ? `\nCharacter details: ${charDescriptions.join(" ")}\n`
    : "";

  const prompt = `${stylePrefix}, ${panel.visual_description || panel.visualDescription}${characterSection}, high quality manga panel, detailed linework, dramatic composition, consistent character design, same character appearance throughout`;

  return {
    prompt,
    referenceUrl: characterRefUrl,
  };
}

// ─── Quick Create Router ─────────────────────────────────────────────────

export const quickCreateRouter = router({
  // Step 1: Create project from prompt (allows guests)
  start: publicProcedure
    .input(z.object({
      prompt: z.string().min(10).max(5000),
      genre: z.string().default("Fantasy"),
      style: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("shonen"),
      chapters: z.number().min(1).max(12).default(3),
      tone: z.string().nullish(),
      audience: z.enum(["everyone", "teens", "adults"]).nullish(),
      characters: z.array(z.object({
        name: z.string(),
        role: z.string(),
        description: z.string().optional(),
        appearance: z.string().optional(),
      })).nullish(),
      chapterLength: z.enum(["short", "standard", "long"]).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id ?? await getOrCreateGuestUser();

      let title = input.prompt.slice(0, 60).replace(/[^\w\s]/g, "").trim();
      try {
        const titleResponse = await invokeLLM({
          messages: [
            { role: "system", content: "Generate a short, catchy manga title (2-5 words) from this story premise. Return ONLY the title, nothing else." },
            { role: "user", content: input.prompt.slice(0, 500) },
          ],
        });
        const rawContent = titleResponse.choices[0]?.message?.content;
        const generated = typeof rawContent === "string" ? rawContent.trim() : undefined;
        if (generated && generated.length > 0 && generated.length < 100) {
          title = generated.replace(/['"]/g, "");
        }
      } catch {
        // fallback to truncated prompt
      }

      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}-${nanoid(6)}`;

      const projectId = await createProject({
        userId,
        title,
        description: input.prompt,
        genre: input.genre,
        animeStyle: input.style,
        tone: input.tone || undefined,
        targetAudience: input.audience === "teens" ? "teen" : input.audience === "adults" ? "adult" : undefined,
        status: "active",
        visibility: "private",
        slug,
        originalPrompt: input.prompt,
        creationMode: "quick_create",
        chapterLengthPreset: input.chapterLength || undefined,
      });

      const episodeIds: number[] = [];
      for (let i = 1; i <= input.chapters; i++) {
        const epId = await createEpisode({
          projectId,
          episodeNumber: i,
          title: `Chapter ${i}`,
          status: "draft",
        });
        episodeIds.push(epId);
      }

      // Start generation for chapter 1 in background
      generateChapterInBackground(projectId, episodeIds[0], userId, input.prompt, {
        title,
        genre: input.genre,
        style: input.style,
      }).catch(err => {
        console.error(`[QuickCreate] Background generation failed:`, err);
        const progress = activeGenerations.get(projectId);
        if (progress) {
          progress.phase = "error";
          progress.phaseMessage = "Generation failed. Please try again.";
        }
      });

      return { projectId, slug, episodeIds, title };
    }),

  // Get generation status with granular per-panel progress and ETA
  status: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const eps = await db.select().from(episodes).where(eq(episodes.projectId, input.projectId)).orderBy(episodes.episodeNumber);
      const allPanels = await db.select().from(panels).where(eq(panels.projectId, input.projectId)).orderBy(panels.sceneNumber, panels.panelNumber);

      const totalPanels = allPanels.length;
      const generatedPanels = allPanels.filter(p => p.status === "generated").length;
      const generatingPanels = allPanels.filter(p => p.status === "generating").length;

      let phase: "script" | "panels" | "complete" | "error" = "script";
      if (eps.some(e => e.scriptContent)) {
        phase = totalPanels > 0 ? (generatedPanels === totalPanels && totalPanels > 0 ? "complete" : "panels") : "script";
      }

      const chapters = eps.map(ep => {
        const epPanels = allPanels.filter(p => p.episodeId === ep.id);
        const epGenerated = epPanels.filter(p => p.status === "generated").length;
        return {
          id: ep.id,
          number: ep.episodeNumber,
          title: ep.title,
          status: ep.status,
          hasScript: !!ep.scriptContent,
          totalPanels: epPanels.length,
          generatedPanels: epGenerated,
        };
      });

      // Get real-time progress from in-memory store
      const liveProgress = activeGenerations.get(input.projectId);
      const elapsedMs = liveProgress ? Date.now() - liveProgress.startedAt : 0;
      const remainingPanels = totalPanels - generatedPanels;
      const estimatedRemainingMs = liveProgress
        ? remainingPanels * liveProgress.avgPanelTimeMs
        : remainingPanels * 12000;

      // Build per-panel step info
      const panelSteps = liveProgress?.panelProgress.map(pp => ({
        panelId: pp.panelId,
        sceneNumber: pp.sceneNumber,
        panelNumber: pp.panelNumber,
        step: pp.step,
        attempt: pp.attempt,
      })) ?? [];

      // Find currently generating panel for status message
      const currentlyGenerating = panelSteps.filter(p => p.step === "generating" || p.step === "building_prompt" || p.step === "uploading");

      let statusMessage = "Preparing...";
      if (phase === "complete") {
        statusMessage = "Your manga is ready!";
      } else if (liveProgress) {
        if (liveProgress.phase === "script") {
          statusMessage = "Writing your story...";
        } else if (liveProgress.phase === "characters") {
          statusMessage = "Designing characters for visual consistency...";
        } else if (liveProgress.phase === "reference_sheet") {
          statusMessage = "Creating character reference sheet...";
        } else if (liveProgress.phase === "panels") {
          if (currentlyGenerating.length > 0) {
            const panelLabels = currentlyGenerating
              .map(p => `S${p.sceneNumber}P${p.panelNumber}`)
              .join(", ");
            statusMessage = `Generating ${panelLabels} (${generatedPanels}/${totalPanels} done)`;
          } else {
            statusMessage = `Generating panels: ${generatedPanels}/${totalPanels}`;
          }
        } else if (liveProgress.phase === "error") {
          statusMessage = liveProgress.phaseMessage;
        }
      } else if (phase === "panels") {
        statusMessage = `Generating panels: ${generatedPanels}/${totalPanels}`;
      }

      return {
        projectId: input.projectId,
        title: project[0].title,
        phase,
        chapters,
        totalPanels,
        generatedPanels,
        generatingPanels,
        progress: totalPanels > 0 ? Math.round((generatedPanels / totalPanels) * 100) : 0,
        // New granular fields
        statusMessage,
        panelSteps,
        elapsedMs,
        estimatedRemainingMs,
        avgPanelTimeMs: liveProgress?.avgPanelTimeMs ?? 12000,
        characterRefUrl: liveProgress?.characterRefUrl,
        livePhase: liveProgress?.phase ?? (phase === "complete" ? "complete" : "script"),
      };
    }),

  // Get script content for streaming display
  getScript: publicProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        title: episode.title,
        synopsis: episode.synopsis,
        scriptContent: episode.scriptContent,
        status: episode.status,
      };
    }),

  // Get panels for live generation view
  getPanels: publicProcedure
    .input(z.object({ projectId: z.number(), episodeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      let query;
      if (input.episodeId) {
        query = db.select().from(panels)
          .where(eq(panels.episodeId, input.episodeId))
          .orderBy(panels.sceneNumber, panels.panelNumber);
      } else {
        query = db.select().from(panels)
          .where(eq(panels.projectId, input.projectId))
          .orderBy(panels.sceneNumber, panels.panelNumber);
      }
      return query;
    }),

  // Publish project to community
  publish: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      await updateProject(input.projectId, ctx.user.id, {
        visibility: "public",
        status: "active",
      });

      return { success: true };
    }),

  // Get recently created public projects (for Discover "Just Created" row)
  justCreated: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { users } = await import("../drizzle/schema");
      return db.select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        genre: projects.genre,
        coverImageUrl: projects.coverImageUrl,
        slug: projects.slug,
        animeStyle: projects.animeStyle,
        createdAt: projects.createdAt,
        userId: projects.userId,
        userName: users.name,
        creationMode: projects.creationMode,
      }).from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .where(and(
          eq(projects.visibility, "public"),
          eq(projects.creationMode, "quick_create"),
        ))
        .orderBy(desc(projects.createdAt))
        .limit(input?.limit ?? 10);
    }),

  // Regenerate a single panel with an optional tweaked prompt
  regeneratePanel: publicProcedure
    .input(z.object({
      panelId: z.number(),
      prompt: z.string().min(5).max(2000).optional(),
      style: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });

      // Save previous image URL for undo capability
      const previousImageUrl = panel.imageUrl;
      const previousPrompt = panel.fluxPrompt;
      const currentAttempts = panel.generationAttempts ?? 1;

      // Mark as generating
      await updatePanel(panel.id, { status: "generating" });

      try {
        // Determine the prompt to use
        let finalPrompt: string;
        if (input.prompt) {
          // User provided a custom prompt — prepend style prefix
          const style = input.style ?? "default";
          const stylePrefix = style === "default" ? "manga style" : `${style} manga style`;
          finalPrompt = `${stylePrefix}, ${input.prompt}, high quality manga panel, detailed linework, dramatic composition, consistent character design`;
        } else if (panel.fluxPrompt) {
          // Re-use the existing prompt (simple retry)
          finalPrompt = panel.fluxPrompt;
        } else {
          // Fallback: build from visual description
          const stylePrefix = input.style && input.style !== "default" ? `${input.style} manga style` : "manga style";
          finalPrompt = `${stylePrefix}, ${panel.visualDescription ?? "manga panel"}, high quality manga panel, detailed linework`;
        }

        // Try to get character reference from the project's characters
        let referenceUrl: string | undefined;
        try {
          const chars = await getCharactersByProject(panel.projectId);
          const protagonist = chars.find((c: any) => c.role === "protagonist");
          if (protagonist?.referenceImages && Array.isArray(protagonist.referenceImages) && protagonist.referenceImages.length > 0) {
            referenceUrl = protagonist.referenceImages[0];
          }
        } catch {
          // Non-critical
        }

        const generateOptions: any = { prompt: finalPrompt };
        if (referenceUrl) {
          generateOptions.originalImages = [{ url: referenceUrl, mimeType: "image/png" }];
        }

        const { url } = await generateImage(generateOptions);

        await updatePanel(panel.id, {
          imageUrl: url,
          fluxPrompt: finalPrompt,
          status: "generated",
          reviewStatus: "pending",
          generationAttempts: currentAttempts + 1,
        });

        return {
          success: true,
          panelId: panel.id,
          imageUrl: url,
          prompt: finalPrompt,
          previousImageUrl,
          previousPrompt,
          attempt: currentAttempts + 1,
        };
      } catch (error) {
        console.error(`[Regenerate] Panel ${panel.id} regeneration failed:`, error);
        // Restore previous state on failure
        await updatePanel(panel.id, {
          imageUrl: previousImageUrl,
          status: previousImageUrl ? "generated" : "draft",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Panel regeneration failed. Previous image has been restored.",
        });
      }
    }),

  // Undo a panel regeneration (restore previous image)
  undoRegenerate: publicProcedure
    .input(z.object({
      panelId: z.number(),
      previousImageUrl: z.string(),
      previousPrompt: z.string().nullish(),
    }))
    .mutation(async ({ input }) => {
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });

      await updatePanel(panel.id, {
        imageUrl: input.previousImageUrl,
        fluxPrompt: input.previousPrompt ?? panel.fluxPrompt,
        status: "generated",
        generationAttempts: Math.max(1, (panel.generationAttempts ?? 1) - 1),
      });

      return { success: true, panelId: panel.id, imageUrl: input.previousImageUrl };
    }),
});

// ─── Background Generation (Enhanced) ───────────────────────────────────

async function generateChapterInBackground(
  projectId: number,
  episodeId: number,
  userId: number,
  originalPrompt: string,
  meta: { title: string; genre: string; style: string },
) {
  const progress = getOrCreateProgress(projectId);

  try {
    // ── Phase 1: Generate Script ──────────────────────────────────────
    progress.phase = "script";
    progress.phaseMessage = "Writing your story...";
    await updateEpisode(episodeId, { status: "generating" } as any);

    const systemPrompt = `You are a manga screenwriter. You create detailed chapter scripts for manga stories.
Output ONLY valid JSON matching the required schema. No markdown, no explanation.

IMPORTANT: For character consistency, include the SAME character names throughout all scenes.
Each character should have a consistent visual description across panels.

Story: "${meta.title}"
Genre: ${meta.genre}
Art Style: ${meta.style}
Original Prompt: ${originalPrompt.slice(0, 1000)}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a complete script for Chapter 1. Return a JSON object with this exact structure:
{
  "episode_title": "string",
  "synopsis": "string (100-300 words)",
  "scenes": [{
    "scene_number": 1,
    "location": "string",
    "time_of_day": "day"|"night"|"dawn"|"dusk",
    "mood": "string",
    "description": "string",
    "panels": [{
      "panel_number": 1,
      "visual_description": "string (detailed, FLUX-ready prompt for manga panel generation. ALWAYS include the character's full appearance description in every panel they appear in.)",
      "camera_angle": "wide"|"medium"|"close-up"|"extreme-close-up"|"birds-eye",
      "dialogue": [{"character": "string", "text": "string", "emotion": "string"}],
      "sfx": "string or null",
      "transition": "cut"|"fade"|"dissolve"|null
    }]
  }]
}

Generate 3-5 scenes with 2-4 panels each. Make visual descriptions detailed enough for AI image generation. Focus on dramatic, cinematic manga compositions. CRITICAL: Use the EXACT same character names in all scenes for consistency.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "chapter_script",
          strict: true,
          schema: {
            type: "object",
            properties: {
              episode_title: { type: "string" },
              synopsis: { type: "string" },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    scene_number: { type: "integer" },
                    location: { type: "string" },
                    time_of_day: { type: "string", enum: ["day", "night", "dawn", "dusk"] },
                    mood: { type: "string" },
                    description: { type: "string" },
                    panels: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          panel_number: { type: "integer" },
                          visual_description: { type: "string" },
                          camera_angle: { type: "string", enum: ["wide", "medium", "close-up", "extreme-close-up", "birds-eye"] },
                          dialogue: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                character: { type: "string" },
                                text: { type: "string" },
                                emotion: { type: "string" },
                              },
                              required: ["character", "text", "emotion"],
                              additionalProperties: false,
                            },
                          },
                          sfx: { type: ["string", "null"] },
                          transition: { type: ["string", "null"], enum: ["cut", "fade", "dissolve", null] },
                        },
                        required: ["panel_number", "visual_description", "camera_angle", "dialogue", "sfx", "transition"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["scene_number", "location", "time_of_day", "mood", "description", "panels"],
                  additionalProperties: false,
                },
              },
            },
            required: ["episode_title", "synopsis", "scenes"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawLLMContent = response.choices[0]?.message?.content;
    if (!rawLLMContent || typeof rawLLMContent !== "string") throw new Error("No content in LLM response");
    const script = JSON.parse(rawLLMContent);

    let wordCount = 0;
    let panelCount = 0;
    const panelRecords: any[] = [];

    for (const scene of script.scenes) {
      wordCount += scene.description.split(/\s+/).length;
      for (const panel of scene.panels) {
        panelCount++;
        wordCount += panel.visual_description.split(/\s+/).length;
        for (const d of panel.dialogue) {
          wordCount += d.text.split(/\s+/).length;
        }
        panelRecords.push({
          episodeId,
          projectId,
          sceneNumber: scene.scene_number,
          panelNumber: panel.panel_number,
          visualDescription: panel.visual_description,
          cameraAngle: panel.camera_angle,
          dialogue: panel.dialogue,
          sfx: panel.sfx,
          transition: panel.transition && ["cut", "fade", "dissolve"].includes(panel.transition) ? panel.transition : undefined,
          status: "draft",
        });
      }
    }

    await updateEpisode(episodeId, {
      title: script.episode_title,
      synopsis: script.synopsis,
      scriptContent: script,
      status: "generated",
      wordCount,
      panelCount,
    });

    if (panelRecords.length > 0) {
      await createPanelsBulk(panelRecords);
    }

    // ── Phase 2: Character Consistency ────────────────────────────────
    progress.phase = "characters";
    progress.phaseMessage = "Designing characters for visual consistency...";

    const characterProfiles = await extractCharacterProfiles(
      script, meta.genre, meta.style, originalPrompt
    );

    // Save character profiles to DB for future reference / video creation
    for (const profile of characterProfiles) {
      try {
        await createCharacter({
          projectId,
          userId,
          name: profile.name,
          role: profile.role === "protagonist" ? "protagonist" : profile.role === "antagonist" ? "antagonist" : "supporting",
          visualTraits: {
            appearance: profile.appearance,
            seed: profile.seed,
          },
          referenceImages: [],
        });
      } catch {
        // Character creation is non-critical
      }
    }

    // Generate character reference sheet for protagonist
    let characterRefUrl: string | undefined;
    const protagonist = characterProfiles.find(p => p.role === "protagonist");
    if (protagonist) {
      progress.phase = "reference_sheet";
      progress.phaseMessage = `Creating reference sheet for ${protagonist.name}...`;

      characterRefUrl = await generateCharacterReferenceSheet(protagonist, meta.style);
      if (characterRefUrl) {
        progress.characterRefUrl = characterRefUrl;
        console.log(`[QuickCreate] Character reference sheet generated for ${protagonist.name}`);
      }
    }

    // ── Phase 3: Generate Panel Images with Consistency ──────────────
    progress.phase = "panels";
    progress.phaseMessage = "Generating panels...";

    const allPanels = await getPanelsByEpisode(episodeId);

    // Initialize panel progress tracking
    progress.panelProgress = allPanels.map(p => ({
      panelId: p.id,
      sceneNumber: p.sceneNumber,
      panelNumber: p.panelNumber,
      step: "queued" as const,
      attempt: 1,
    }));

    const CONCURRENCY = 3;

    for (let i = 0; i < allPanels.length; i += CONCURRENCY) {
      const batch = allPanels.slice(i, i + CONCURRENCY);
      const promises = batch.map(async (panel) => {
        try {
          updatePanelStep(projectId, panel.id, "building_prompt");
          await updatePanel(panel.id, { status: "generating" });

          // Build consistency-enhanced prompt
          const { prompt, referenceUrl } = buildConsistentPanelPrompt(
            panel,
            meta.style,
            characterProfiles,
            characterRefUrl,
          );

          updatePanelStep(projectId, panel.id, "generating");

          // Use reference image as IP-Adapter input if available
          const generateOptions: any = { prompt };
          if (referenceUrl) {
            generateOptions.originalImages = [{
              url: referenceUrl,
              mimeType: "image/png",
            }];
          }

          const { url } = await generateImage(generateOptions);

          updatePanelStep(projectId, panel.id, "uploading");

          await updatePanel(panel.id, {
            imageUrl: url,
            fluxPrompt: prompt,
            status: "generated",
            reviewStatus: "pending",
          });

          updatePanelStep(projectId, panel.id, "complete");

          // Update progress message
          const completed = progress.panelProgress.filter(p => p.step === "complete").length;
          progress.phaseMessage = `Generated ${completed}/${allPanels.length} panels`;

        } catch (error) {
          console.error(`[QuickCreate] Panel ${panel.id} generation failed:`, error);
          updatePanelStep(projectId, panel.id, "retrying");

          // One retry with simplified prompt
          try {
            await new Promise(r => setTimeout(r, 2000));
            const stylePrefix = meta.style === "default" ? "manga style" : `${meta.style} manga style`;
            const prompt = `${stylePrefix}, manga panel, ${panel.visualDescription}, high quality`;
            const { url } = await generateImage({ prompt });
            await updatePanel(panel.id, {
              imageUrl: url,
              fluxPrompt: prompt,
              status: "generated",
              reviewStatus: "pending",
            });
            updatePanelStep(projectId, panel.id, "complete");
          } catch {
            await updatePanel(panel.id, { status: "draft" });
            updatePanelStep(projectId, panel.id, "failed");
          }
        }
      });
      await Promise.all(promises);
    }

    // Update project cover with first panel image
    const firstPanel = (await getPanelsByEpisode(episodeId)).find(p => p.imageUrl);
    if (firstPanel?.imageUrl) {
      const db = await getDb();
      if (db) {
        await db.update(projects).set({ coverImageUrl: firstPanel.imageUrl }).where(eq(projects.id, projectId));
      }
    }

    progress.phase = "complete";
    progress.phaseMessage = "Your manga is ready!";
    console.log(`[QuickCreate] Project ${projectId} Chapter 1 generation complete`);

    // Clean up after 5 minutes
    setTimeout(() => activeGenerations.delete(projectId), 5 * 60 * 1000);

  } catch (error) {
    console.error(`[QuickCreate] Generation failed for project ${projectId}:`, error);
    progress.phase = "error";
    progress.phaseMessage = "Generation failed. Please try again.";
    await updateEpisode(episodeId, { status: "draft" } as any).catch(() => {});
    // Clean up after 2 minutes on error
    setTimeout(() => activeGenerations.delete(projectId), 2 * 60 * 1000);
  }
}

// Export for testing
export { extractCharacterProfiles, buildConsistentPanelPrompt, hashStringToSeed, activeGenerations, getOrCreateProgress, updatePanelStep };
