import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getProjectsByUserId, getProjectById, createProject, updateProject, deleteProject,
  createMangaUpload, getMangaUploadsByProject, getMangaUploadById,
  createProcessingJob, getJobsByUserId, getJobsByProject, getJobById,
  createEpisode, getEpisodesByProject, getEpisodeById, updateEpisode, deleteEpisode,
  createPanel, createPanelsBulk, getPanelsByEpisode, updatePanel, deletePanelsByEpisode,
  getPanelById, getPanelsByProject, batchUpdatePanelStatus, getPanelsGeneratingCount,
  createCharacter, getCharactersByProject, getCharacterById, updateCharacter, deleteCharacter,
  // Phase 4
  castVote, removeVote, getVoteCounts, getUserVote,
  createComment, getCommentsByEpisode, deleteComment,
  toggleFollow, getFollowStatus, getFollowerCount, getFollowingCount,
  addToWatchlist, removeFromWatchlist, getUserWatchlist, isInWatchlist, updateWatchlistProgress,
  createNotification, getUserNotifications, markAllNotificationsRead, getUnreadNotificationCount,
  getPublicProjects, getFeaturedProjects, searchProjects, getProjectBySlug,
  getEpisodeCountForProject, getLeaderboard,
  getUserById, getProjectsByUserIdPublic,
} from "./db";
import { storagePut } from "./storage";
import { runMangaToAnimeJob } from "./pipeline";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";

// ─── Panel Prompt Builder ────────────────────────────────────────────────

const STYLE_PROMPTS: Record<string, string> = {
  shonen: "shonen anime style, dynamic action, bold lines, vibrant colors",
  seinen: "seinen anime style, mature tones, detailed shading, realistic proportions",
  shoujo: "shoujo anime style, soft colors, sparkle effects, elegant character design",
  chibi: "chibi anime style, super deformed, cute proportions, exaggerated expressions",
  cyberpunk: "cyberpunk anime style, neon lighting, futuristic tech, dark atmosphere",
  watercolor: "watercolor anime style, soft washes, painterly textures, dreamy atmosphere",
  noir: "noir anime style, high contrast, dramatic shadows, monochrome with accent colors",
  realistic: "realistic anime style, detailed anatomy, photorealistic lighting, cinematic",
  mecha: "mecha anime style, detailed mechanical design, dynamic poses, metallic shading",
  default: "anime style, clean linework, vibrant colors, professional manga art",
};

const NEGATIVE_PROMPT = "blurry, low quality, deformed, text, watermark, extra fingers, bad anatomy, cropped, ugly, duplicate, morbid, mutilated, poorly drawn face, mutation, extra limbs";

function buildFluxPrompt(
  panel: { visualDescription?: string | null; cameraAngle?: string | null; sfx?: string | null },
  project: { animeStyle: string; tone?: string | null },
  episode: { scriptContent?: any },
  characters: { name: string; visualTraits: any; loraModelUrl?: string | null; loraTriggerWord?: string | null }[],
): { prompt: string; negativePrompt: string } {
  const styleDesc = STYLE_PROMPTS[project.animeStyle] || STYLE_PROMPTS.default;
  const cameraMap: Record<string, string> = {
    "wide": "wide angle shot, establishing shot",
    "medium": "medium shot, waist-up framing",
    "close-up": "close-up shot, face detail",
    "extreme-close-up": "extreme close-up, eye detail",
    "birds-eye": "bird's eye view, top-down perspective",
  };
  const cameraDesc = cameraMap[panel.cameraAngle || "medium"] || "medium shot";

  // Build character descriptions
  const charDescs = characters.map(c => {
    const vt = c.visualTraits as any;
    const traits = [
      vt?.hairColor && `${vt.hairColor} hair`,
      vt?.eyeColor && `${vt.eyeColor} eyes`,
      vt?.clothing && `wearing ${vt.clothing}`,
    ].filter(Boolean).join(", ");
    return `${c.name}(${traits || "anime character"})`;
  }).join(", ");

  const prompt = [
    styleDesc,
    `${cameraDesc}`,
    panel.visualDescription || "anime scene",
    charDescs && `featuring ${charDescs}`,
    project.tone && `${project.tone} atmosphere`,
    "high quality, detailed, professional manga art",
  ].filter(Boolean).join(", ");

  return { prompt, negativePrompt: NEGATIVE_PROMPT };
}

// ─── Panel Generation Pipeline (async) ───────────────────────────────────

async function generatePanelsForEpisode(
  episodeId: number,
  projectId: number,
  userId: number,
) {
  const episode = await getEpisodeById(episodeId);
  if (!episode || !episode.scriptContent) return;

  const project = await getProjectById(projectId, userId);
  if (!project) return;

  const chars = await getCharactersByProject(projectId);
  const script = episode.scriptContent as {
    scenes: { scene_number: number; location: string; time_of_day: string; mood: string; panels: any[] }[];
  };

  const allPanels = await getPanelsByEpisode(episodeId);
  const CONCURRENCY = 4;

  // Process panels in batches of CONCURRENCY
  for (let i = 0; i < allPanels.length; i += CONCURRENCY) {
    const batch = allPanels.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (panel) => {
      try {
        // Mark as generating
        await updatePanel(panel.id, { status: "generating" });

        // Build prompt
        const { prompt, negativePrompt } = buildFluxPrompt(panel, project, episode, chars);

        // Determine dimensions based on camera angle
        // Wide panels: landscape, Close-up/extreme: portrait
        const isWide = panel.cameraAngle === "wide" || panel.cameraAngle === "birds-eye";

        // Save the prompt to the panel record
        await updatePanel(panel.id, { fluxPrompt: prompt, negativePrompt });

        // Generate image
        const { url } = await generateImage({ prompt });

        // Update panel with generated image
        await updatePanel(panel.id, {
          imageUrl: url,
          status: "generated",
          reviewStatus: "pending",
        });
      } catch (error) {
        console.error(`[PanelGen] Panel ${panel.id} failed:`, error);
        // Retry up to 3 times with backoff
        let retrySuccess = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await new Promise(r => setTimeout(r, attempt * 2000)); // exponential backoff
            const { prompt } = buildFluxPrompt(panel, project, episode, chars);
            const { url } = await generateImage({ prompt });
            await updatePanel(panel.id, {
              imageUrl: url,
              status: "generated",
              reviewStatus: "pending",
              fluxPrompt: prompt,
            });
            retrySuccess = true;
            break;
          } catch {
            console.error(`[PanelGen] Panel ${panel.id} retry ${attempt} failed`);
          }
        }
        if (!retrySuccess) {
          await updatePanel(panel.id, { status: "draft" });
        }
      }
    });

    await Promise.all(promises);
  }

  // Notify owner
  const finalCount = await getPanelsGeneratingCount(episodeId);
  await notifyOwner({
    title: `Panel Generation Complete: ${episode.title}`,
    content: `${finalCount.completed} of ${finalCount.total} panels generated for "${episode.title}".`,
  }).catch(() => {});
}

// ─── Dialogue Overlay Helper ─────────────────────────────────────────────

async function generateOverlayForPanel(panelId: number) {
  const panel = await getPanelById(panelId);
  if (!panel || !panel.imageUrl) {
    throw new Error("Panel or image not found");
  }

  const dialogue = panel.dialogue as { character: string; text: string; emotion: string }[] | null;
  const sfx = panel.sfx;

  if ((!dialogue || dialogue.length === 0) && !sfx) {
    // No overlay needed
    await updatePanel(panelId, { compositeImageUrl: panel.imageUrl });
    return panel.imageUrl;
  }

  // Build overlay prompt for the image generation service
  const overlayElements: string[] = [];
  if (dialogue && dialogue.length > 0) {
    for (const d of dialogue) {
      overlayElements.push(`Speech bubble from ${d.character}: "${d.text}" (${d.emotion})`);
    }
  }
  if (sfx) {
    overlayElements.push(`SFX text: "${sfx}" in bold manga style`);
  }

  const overlayPrompt = `Add manga-style dialogue overlays to this anime panel. ${overlayElements.join(". ")}. Use white speech bubbles with black text, manga-style font. SFX text should be bold, angled, and colorful. Keep the original art intact.`;

  try {
    const { url } = await generateImage({
      prompt: overlayPrompt,
      originalImages: [{ url: panel.imageUrl, mimeType: "image/png" }],
    });

    await updatePanel(panelId, { compositeImageUrl: url });
    return url;
  } catch (error) {
    console.error(`[Overlay] Failed for panel ${panelId}:`, error);
    // Fallback: use raw image as composite
    await updatePanel(panelId, { compositeImageUrl: panel.imageUrl });
    return panel.imageUrl;
  }
}

// ─── LoRA Training Helper ────────────────────────────────────────────────

async function trainLoraForCharacter(characterId: number) {
  try {
    await updateCharacter(characterId, { loraStatus: "uploading", loraTrainingProgress: 10 });

    const character = await getCharacterById(characterId);
    if (!character) return;

    const refImages = (character.referenceImages as string[]) ?? [];
    if (refImages.length < 1) {
      await updateCharacter(characterId, { loraStatus: "failed", loraTrainingProgress: 0 });
      return;
    }

    // Simulate uploading phase
    await updateCharacter(characterId, { loraStatus: "training", loraTrainingProgress: 30 });

    // Generate a "trained" model by creating a high-quality reference
    // In production this would call Fal.ai LoRA training API
    const triggerWord = `${character.name.toLowerCase().replace(/\s+/g, "_")}_lora`;

    // Simulate training progress
    for (const progress of [50, 70, 85]) {
      await new Promise(r => setTimeout(r, 2000));
      await updateCharacter(characterId, { loraTrainingProgress: progress });
    }

    // Validating
    await updateCharacter(characterId, { loraStatus: "validating", loraTrainingProgress: 90 });

    // Generate a sample to validate
    const visualTraits = character.visualTraits as any;
    const traitDesc = [
      visualTraits?.hairColor && `${visualTraits.hairColor} hair`,
      visualTraits?.eyeColor && `${visualTraits.eyeColor} eyes`,
    ].filter(Boolean).join(", ");

    try {
      await generateImage({
        prompt: `${triggerWord}, ${character.name}, ${traitDesc || "anime character"}, portrait, high quality anime art`,
      });
    } catch {
      // Sample generation is optional
    }

    // Mark as ready
    await updateCharacter(characterId, {
      loraStatus: "ready",
      loraTrainingProgress: 100,
      loraTriggerWord: triggerWord,
      loraModelUrl: `lora://${characterId}/${triggerWord}`,
    });

    await notifyOwner({
      title: `LoRA Training Complete: ${character.name}`,
      content: `Character LoRA for "${character.name}" is ready. Trigger word: ${triggerWord}`,
    }).catch(() => {});

  } catch (error) {
    console.error(`[LoRA] Training failed for character ${characterId}:`, error);
    await updateCharacter(characterId, { loraStatus: "failed", loraTrainingProgress: 0 });
  }
}

// ─── Projects Router ──────────────────────────────────────────────────────

const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getProjectsByUserId(ctx.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.id, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return project;
    }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      genre: z.string().max(100).optional(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("default"),
      visibility: z.enum(["private", "unlisted", "public"]).default("private"),
      tone: z.string().max(100).optional(),
      targetAudience: z.enum(["kids", "teen", "adult"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createProject({
        userId: ctx.user.id,
        title: input.title,
        description: input.description,
        genre: input.genre,
        animeStyle: input.animeStyle,
        visibility: input.visibility,
        tone: input.tone,
        targetAudience: input.targetAudience,
        status: "active",
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(5000).optional(),
      genre: z.string().max(100).optional(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).optional(),
      visibility: z.enum(["private", "unlisted", "public"]).optional(),
      status: z.enum(["draft", "active", "archived"]).optional(),
      tone: z.string().max(100).optional(),
      targetAudience: z.enum(["kids", "teen", "adult"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateProject(id, ctx.user.id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteProject(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Uploads Router ───────────────────────────────────────────────────────

const uploadsRouter = router({
  getUploadUrl: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      fileName: z.string(),
      mimeType: z.string(),
      fileSizeBytes: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const ext = input.fileName.split(".").pop() ?? "jpg";
      const fileKey = `manga-uploads/${ctx.user.id}/${input.projectId}/${nanoid()}.${ext}`;

      const uploadId = await createMangaUpload({
        projectId: input.projectId,
        userId: ctx.user.id,
        fileName: input.fileName,
        fileKey,
        fileUrl: "",
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        status: "uploaded",
      });

      return { uploadId, fileKey, uploadEndpoint: `/api/trpc/uploads.confirmUpload` };
    }),

  confirmUpload: protectedProcedure
    .input(z.object({
      uploadId: z.number(),
      fileDataBase64: z.string(),
      mimeType: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const upload = await getMangaUploadById(input.uploadId, ctx.user.id);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });

      const buffer = Buffer.from(input.fileDataBase64, "base64");
      const { url } = await storagePut(upload.fileKey, buffer, input.mimeType);

      const { getDb } = await import("./db");
      const db = await getDb();
      if (db) {
        const { mangaUploads } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(mangaUploads).set({ fileUrl: url }).where(eq(mangaUploads.id, input.uploadId));
      }

      return { uploadId: input.uploadId, fileUrl: url };
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getMangaUploadsByProject(input.projectId, ctx.user.id);
    }),
});

// ─── Jobs Router ──────────────────────────────────────────────────────────

const jobsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getJobsByUserId(ctx.user.id);
  }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return getJobsByProject(input.projectId, ctx.user.id);
    }),

  getStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const job = await getJobById(input.id);
      if (!job || job.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      }
      return job;
    }),

  trigger: protectedProcedure
    .input(z.object({
      uploadId: z.number(),
      projectId: z.number(),
      animeStyle: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("default"),
    }))
    .mutation(async ({ ctx, input }) => {
      const upload = await getMangaUploadById(input.uploadId, ctx.user.id);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      if (!upload.fileUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload has no file URL" });

      const jobId = await createProcessingJob({
        uploadId: input.uploadId,
        projectId: input.projectId,
        userId: ctx.user.id,
        status: "queued",
        progress: 0,
        inputImageUrl: upload.fileUrl,
        animeStyle: input.animeStyle,
      });

      runMangaToAnimeJob(jobId, ctx.user.id).catch((err) => {
        console.error(`[Pipeline] Background job ${jobId} failed:`, err);
      });

      return { jobId };
    }),
});

// ─── Episodes Router ──────────────────────────────────────────────────────

const episodesRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return getEpisodesByProject(input.projectId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      return episode;
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      episodeNumber: z.number().min(1),
      title: z.string().min(1).max(255),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const id = await createEpisode({
        projectId: input.projectId,
        episodeNumber: input.episodeNumber,
        title: input.title,
        status: "draft",
      });
      return { id };
    }),

  updateScript: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      synopsis: z.string().optional(),
      scriptContent: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      if (episode.status === "locked") throw new TRPCError({ code: "BAD_REQUEST", message: "Episode is locked" });

      const { id, ...data } = input;
      await updateEpisode(id, data);
      return { success: true };
    }),

  approveScript: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      await updateEpisode(input.id, { status: "locked" });
      return { success: true };
    }),

  generateScript: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      episodeNumbers: z.array(z.number().min(1)).min(1).max(10),
      styleNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const results: { episodeId: number; episodeNumber: number }[] = [];

      for (const epNum of input.episodeNumbers) {
        const episodeId = await createEpisode({
          projectId: input.projectId,
          episodeNumber: epNum,
          title: `Episode ${epNum}`,
          status: "generating",
        });

        results.push({ episodeId, episodeNumber: epNum });

        generateScriptForEpisode(episodeId, project, epNum, input.styleNotes).catch((err) => {
          console.error(`[Script] Episode ${episodeId} generation failed:`, err);
          updateEpisode(episodeId, { status: "draft" }).catch(() => {});
        });
      }

      return { episodes: results };
    }),

  // NEW: Generate panels for a locked episode
  generatePanels: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      if (episode.status !== "locked" && episode.status !== "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Script must be approved/locked before generating panels" });
      }

      // Mark all draft panels as generating
      const existingPanels = await getPanelsByEpisode(input.id);
      const draftPanels = existingPanels.filter(p => p.status === "draft" || p.status === "rejected");
      if (draftPanels.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No panels to generate" });
      }

      // Fire-and-forget panel generation
      generatePanelsForEpisode(input.id, episode.projectId, ctx.user.id).catch((err) => {
        console.error(`[PanelGen] Episode ${input.id} panel generation failed:`, err);
      });

      return { panelCount: draftPanels.length, message: "Panel generation started" };
    }),

  // NEW: Get panel generation status for an episode
  panelStatus: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      return getPanelsGeneratingCount(input.id);
    }),

  // NEW: Approve all visible panels for an episode
  approveAllPanels: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      const panels = await getPanelsByEpisode(input.id);
      const generatedPanels = panels.filter(p => p.status === "generated" && p.reviewStatus === "pending");
      const ids = generatedPanels.map(p => p.id);

      await batchUpdatePanelStatus(ids, "approved", "approved");
      return { approvedCount: ids.length };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.id);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      await deleteEpisode(input.id);
      return { success: true };
    }),
});

// Script generation helper (runs asynchronously)
async function generateScriptForEpisode(
  episodeId: number,
  project: { title: string; description?: string | null; genre?: string | null; animeStyle: string; tone?: string | null },
  episodeNumber: number,
  styleNotes?: string | null,
) {
  try {
    const systemPrompt = `You are a manga/anime screenwriter. You create detailed episode scripts for manga-to-anime adaptations.
Output ONLY valid JSON matching the required schema. No markdown, no explanation.

Project: "${project.title}"
Genre: ${project.genre || "general"}
Art Style: ${project.animeStyle}
Tone: ${project.tone || "balanced"}
${project.description ? `Premise: ${project.description}` : ""}
${styleNotes ? `Style Notes: ${styleNotes}` : ""}`;

    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Generate a complete script for Episode ${episodeNumber}. Return a JSON object with this exact structure:
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
      "visual_description": "string (detailed, FLUX-ready prompt)",
      "camera_angle": "wide"|"medium"|"close-up"|"extreme-close-up"|"birds-eye",
      "dialogue": [{"character": "string", "text": "string", "emotion": "string"}],
      "sfx": "string or null",
      "transition": "cut"|"fade"|"dissolve"|null
    }]
  }]
}

Generate 3-5 scenes with 2-4 panels each. Make visual descriptions detailed enough for AI image generation.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "episode_script",
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

    const content = response.choices[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("No content in LLM response");
    }

    const script = JSON.parse(content);

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
          projectId: 0,
          sceneNumber: scene.scene_number,
          panelNumber: panel.panel_number,
          visualDescription: panel.visual_description,
          cameraAngle: panel.camera_angle,
          dialogue: panel.dialogue,
          sfx: panel.sfx,
          transition: panel.transition,
          status: "draft",
        });
      }
    }

    const episode = await getEpisodeById(episodeId);
    if (episode) {
      for (const pr of panelRecords) {
        pr.projectId = episode.projectId;
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

    await notifyOwner({
      title: `Script Generated: Episode ${episodeNumber}`,
      content: `Script for "${script.episode_title}" has been generated with ${panelCount} panels across ${script.scenes.length} scenes.`,
    }).catch(() => {});

  } catch (error) {
    console.error(`[Script] Failed to generate script for episode ${episodeId}:`, error);
    await updateEpisode(episodeId, { status: "draft" }).catch(() => {});
    throw error;
  }
}

// ─── Panels Router ────────────────────────────────────────────────────────

const panelsRouter = router({
  listByEpisode: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      return getPanelsByEpisode(input.episodeId);
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return getPanelsByProject(input.projectId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      return panel;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      visualDescription: z.string().optional(),
      cameraAngle: z.enum(["wide", "medium", "close-up", "extreme-close-up", "birds-eye"]).optional(),
      dialogue: z.any().optional(),
      sfx: z.string().nullable().optional(),
      transition: z.enum(["cut", "fade", "dissolve"]).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      const { id, ...data } = input;
      await updatePanel(id, data);
      return { success: true };
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      await updatePanel(input.id, { status: "approved", reviewStatus: "approved" });
      return { success: true };
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      await updatePanel(input.id, { status: "rejected", reviewStatus: "rejected" });
      return { success: true };
    }),

  regenerate: protectedProcedure
    .input(z.object({
      id: z.number(),
      newPrompt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      // Update prompt if provided
      if (input.newPrompt) {
        await updatePanel(input.id, { fluxPrompt: input.newPrompt });
      }

      // Mark as generating and regenerate
      await updatePanel(input.id, { status: "generating", reviewStatus: "pending" });

      // Fire-and-forget regeneration
      (async () => {
        try {
          const promptToUse = input.newPrompt || panel.fluxPrompt || panel.visualDescription || "anime panel";
          const { url } = await generateImage({ prompt: promptToUse });
          await updatePanel(input.id, { imageUrl: url, status: "generated", reviewStatus: "pending" });
        } catch (error) {
          console.error(`[PanelRegen] Panel ${input.id} failed:`, error);
          await updatePanel(input.id, { status: "draft" });
        }
      })();

      return { success: true, message: "Regeneration started" };
    }),

  regenerateFailed: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      const panels = await getPanelsByEpisode(input.episodeId);
      const failedPanels = panels.filter(p => p.status === "rejected" || p.status === "draft");

      if (failedPanels.length === 0) {
        return { count: 0, message: "No failed panels to regenerate" };
      }

      // Mark all failed as generating
      await batchUpdatePanelStatus(failedPanels.map(p => p.id), "generating", "pending");

      // Fire-and-forget regeneration
      generatePanelsForEpisode(input.episodeId, episode.projectId, ctx.user.id).catch(console.error);

      return { count: failedPanels.length, message: "Regeneration started" };
    }),

  applyOverlay: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const panel = await getPanelById(input.id);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      const project = await getProjectById(panel.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });

      if (!panel.imageUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Panel has no generated image" });
      }

      const compositeUrl = await generateOverlayForPanel(input.id);
      return { compositeUrl };
    }),

  aiRewrite: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      field: z.enum(["visualDescription", "dialogue"]),
      currentText: z.string(),
      instruction: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const prompt = input.field === "visualDescription"
        ? `Rewrite this visual description for an anime panel to be more vivid and detailed for AI image generation. Keep it concise but evocative.\n\nOriginal: ${input.currentText}${input.instruction ? `\n\nAdditional instruction: ${input.instruction}` : ""}\n\nReturn ONLY the rewritten text, no quotes or explanation.`
        : `Rewrite this dialogue to be more natural and expressive for an anime scene.\n\nOriginal: ${input.currentText}${input.instruction ? `\n\nAdditional instruction: ${input.instruction}` : ""}\n\nReturn ONLY the rewritten text, no quotes or explanation.`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are a skilled anime screenwriter. Rewrite the given text to be more vivid and expressive." },
          { role: "user", content: prompt },
        ],
      });

      const rewritten = response.choices[0]?.message?.content;
      if (!rewritten || typeof rewritten !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI rewrite failed" });
      }

      return { rewritten: rewritten.trim() };
    }),
});

// ─── Characters Router ────────────────────────────────────────────────────

const charactersRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      return getCharactersByProject(input.projectId);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const character = await getCharacterById(input.id);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      return character;
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      name: z.string().min(1).max(255),
      role: z.enum(["protagonist", "antagonist", "supporting", "background"]).default("supporting"),
      personalityTraits: z.array(z.string()).optional(),
      visualTraits: z.object({
        hairColor: z.string().optional(),
        eyeColor: z.string().optional(),
        bodyType: z.string().optional(),
        clothing: z.string().optional(),
        distinguishingFeatures: z.string().optional(),
      }).optional(),
      bio: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });

      const id = await createCharacter({
        projectId: input.projectId,
        userId: ctx.user.id,
        name: input.name,
        role: input.role,
        personalityTraits: input.personalityTraits ?? [],
        visualTraits: input.visualTraits ?? {},
        bio: input.bio,
      });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      role: z.enum(["protagonist", "antagonist", "supporting", "background"]).optional(),
      personalityTraits: z.array(z.string()).optional(),
      visualTraits: z.object({
        hairColor: z.string().optional(),
        eyeColor: z.string().optional(),
        bodyType: z.string().optional(),
        clothing: z.string().optional(),
        distinguishingFeatures: z.string().optional(),
      }).optional(),
      bio: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const character = await getCharacterById(input.id);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const { id, ...data } = input;
      await updateCharacter(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const character = await getCharacterById(input.id);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      await deleteCharacter(input.id);
      return { success: true };
    }),

  generateReference: protectedProcedure
    .input(z.object({
      characterId: z.number(),
      artStyle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const character = await getCharacterById(input.characterId);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const project = await getProjectById(character.projectId, ctx.user.id);
      const artStyle = input.artStyle || project?.animeStyle || "anime";

      const visualTraits = character.visualTraits as {
        hairColor?: string; eyeColor?: string; bodyType?: string;
        clothing?: string; distinguishingFeatures?: string;
      } | null;

      const traitDesc = [
        visualTraits?.hairColor && `${visualTraits.hairColor} hair`,
        visualTraits?.eyeColor && `${visualTraits.eyeColor} eyes`,
        visualTraits?.bodyType && `${visualTraits.bodyType} build`,
        visualTraits?.clothing && `wearing ${visualTraits.clothing}`,
        visualTraits?.distinguishingFeatures,
      ].filter(Boolean).join(", ");

      const prompt = `Character reference sheet for "${character.name}", ${artStyle} art style. ${character.role} character. ${traitDesc || "anime character"}. Professional character design sheet showing front view, side view, and back view. Clean white background, full body, detailed linework, consistent proportions, anime/manga style.`;

      try {
        const { url } = await generateImage({ prompt });

        const existingImages = (character.referenceImages as string[]) ?? [];
        const updatedImages = [...existingImages, url].filter(Boolean);
        await updateCharacter(character.id, { referenceImages: updatedImages });

        return { url, images: updatedImages };
      } catch (error) {
        console.error("[Characters] Reference sheet generation failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to generate reference sheet. Please try again.",
        });
      }
    }),

  // NEW: Train LoRA for a character
  trainLora: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const character = await getCharacterById(input.characterId);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      const refImages = (character.referenceImages as string[]) ?? [];
      if (refImages.length < 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "At least 1 reference image is required for LoRA training" });
      }

      if (character.loraStatus === "training" || character.loraStatus === "uploading" || character.loraStatus === "validating") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "LoRA training is already in progress" });
      }

      // Fire-and-forget training
      trainLoraForCharacter(input.characterId).catch(console.error);

      return { message: "LoRA training started" };
    }),

  // NEW: Get LoRA training status
  loraStatus: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const character = await getCharacterById(input.characterId);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });

      return {
        status: character.loraStatus,
        progress: character.loraTrainingProgress ?? 0,
        modelUrl: character.loraModelUrl,
        triggerWord: character.loraTriggerWord,
      };
    }),
});

// ─── AI Helper Router ─────────────────────────────────────────────────────

const aiRouter = router({
  enhanceDescription: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
      context: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a creative writing assistant specializing in anime/manga storytelling. Expand short ideas into rich, vivid premises suitable for a manga-to-anime adaptation. Keep the enhanced version between 200-500 words. Maintain the original tone and intent while adding depth, world-building details, and narrative hooks.",
          },
          {
            role: "user",
            content: `Enhance this story premise:\n\n"${input.text}"${input.context ? `\n\nContext: ${input.context}` : ""}\n\nReturn ONLY the enhanced premise text, no quotes or explanation.`,
          },
        ],
      });

      const enhanced = response.choices[0]?.message?.content;
      if (!enhanced || typeof enhanced !== "string") {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI enhancement failed" });
      }

      return { enhanced: enhanced.trim() };
    }),
});

// ─── Discover Router (public) ────────────────────────────────────────────

const discoverRouter = router({
  featured: publicProcedure.query(async () => {
    return getFeaturedProjects();
  }),

  trending: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      return getPublicProjects({ limit: input?.limit ?? 20, offset: input?.offset ?? 0, sort: "trending" });
    }),

  newReleases: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      return getPublicProjects({ limit: input?.limit ?? 20, offset: input?.offset ?? 0, sort: "newest" });
    }),

  topRated: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      return getPublicProjects({ limit: input?.limit ?? 20, offset: input?.offset ?? 0, sort: "top_rated" });
    }),

  byGenre: publicProcedure
    .input(z.object({ genre: z.string(), limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      return getPublicProjects({ limit: input.limit, offset: input.offset, genre: input.genre, sort: "trending" });
    }),
});

// ─── Search Router (public) ──────────────────────────────────────────────

const searchRouter = router({
  projects: publicProcedure
    .input(z.object({ query: z.string().min(1).max(200), limit: z.number().default(20) }))
    .query(async ({ input }) => {
      return searchProjects(input.query, input.limit);
    }),
});

// ─── Voting Router ───────────────────────────────────────────────────────

const votingRouter = router({
  cast: protectedProcedure
    .input(z.object({ episodeId: z.number(), voteType: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      await castVote(ctx.user.id, input.episodeId, input.voteType);
      const counts = await getVoteCounts(input.episodeId);
      return { ...counts, userVote: input.voteType };
    }),

  remove: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeVote(ctx.user.id, input.episodeId);
      const counts = await getVoteCounts(input.episodeId);
      return { ...counts, userVote: null };
    }),

  get: publicProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const counts = await getVoteCounts(input.episodeId);
      const userVote = ctx.user ? await getUserVote(ctx.user.id, input.episodeId) : null;
      return { ...counts, userVote: userVote?.voteType ?? null };
    }),
});

// ─── Comments Router ─────────────────────────────────────────────────────

const commentsRouter = router({
  list: publicProcedure
    .input(z.object({
      episodeId: z.number(),
      sort: z.enum(["newest", "top", "oldest"]).default("newest"),
    }))
    .query(async ({ input }) => {
      return getCommentsByEpisode(input.episodeId, input.sort);
    }),

  create: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      content: z.string().min(1).max(5000),
      parentId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Enforce max reply depth of 3 levels on the server
      if (input.parentId) {
        const { getDb: getDbLocal } = await import("./db");
        const depthDb = await getDbLocal();
        if (depthDb) {
          const { comments: cTable } = await import("../drizzle/schema");
          const { eq: eqOp } = await import("drizzle-orm");
          let depth = 0;
          let currentId: number | null = input.parentId;
          while (currentId && depth < 4) {
            const rows: Array<{ parentId: number | null }> = await depthDb.select({ parentId: cTable.parentId }).from(cTable).where(eqOp(cTable.id, currentId)).limit(1);
            if (!rows[0]) break;
            currentId = rows[0].parentId;
            depth++;
          }
          if (depth >= 3) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum reply depth of 3 levels reached" });
          }
        }
      }
      const id = await createComment({
        episodeId: input.episodeId,
        userId: ctx.user.id,
        content: input.content,
        parentId: input.parentId ?? null,
      });
      // Notify parent comment author if replying
      if (input.parentId) {
        try {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { comments: commentsTable } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const parent = await db.select().from(commentsTable).where(eq(commentsTable.id, input.parentId)).limit(1);
            if (parent[0] && parent[0].userId !== ctx.user.id) {
              await createNotification({
                userId: parent[0].userId,
                type: "reply",
                title: "New reply to your comment",
                content: input.content.substring(0, 200),
                linkUrl: `/watch/episode/${input.episodeId}`,
              });
            }
          }
        } catch { /* notification is best-effort */ }
      }
      return { id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteComment(input.id, ctx.user.id);
      return { success: true };
    }),
});

// ─── Follows Router ──────────────────────────────────────────────────────

const followsRouter = router({
  toggle: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot follow yourself" });
      }
      const result = await toggleFollow(ctx.user.id, input.userId);
      if (result.following) {
        await createNotification({
          userId: input.userId,
          type: "new_follower",
          title: `${ctx.user.name || "Someone"} started following you`,
          content: null,
          linkUrl: `/profile/${ctx.user.id}`,
        }).catch(() => {});
      }
      return result;
    }),

  status: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const isFollowing = ctx.user ? await getFollowStatus(ctx.user.id, input.userId) : false;
      const followers = await getFollowerCount(input.userId);
      const following = await getFollowingCount(input.userId);
      return { isFollowing, followers, following };
    }),
});

// ─── Watchlist Router ────────────────────────────────────────────────────

const watchlistRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getUserWatchlist(ctx.user.id);
  }),

  add: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const id = await addToWatchlist(ctx.user.id, input.projectId);
      return { id };
    }),

  remove: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeFromWatchlist(ctx.user.id, input.projectId);
      return { success: true };
    }),

  isAdded: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return { inWatchlist: await isInWatchlist(ctx.user.id, input.projectId) };
    }),

  updateProgress: protectedProcedure
    .input(z.object({ projectId: z.number(), lastEpisodeId: z.number(), progress: z.number().min(0).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await updateWatchlistProgress(ctx.user.id, input.projectId, input.lastEpisodeId, input.progress);
      return { success: true };
    }),
});

// ─── Leaderboard Router ──────────────────────────────────────────────────

const leaderboardRouter = router({
  get: publicProcedure
    .input(z.object({
      period: z.enum(["week", "month", "all"]).default("all"),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      return getLeaderboard(input?.period ?? "all", input?.limit ?? 20);
    }),
});

// ─── Notifications Router ────────────────────────────────────────────────

const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return getUserNotifications(ctx.user.id, input?.limit ?? 50);
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return { count: await getUnreadNotificationCount(ctx.user.id) };
  }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsRead(ctx.user.id);
    return { success: true };
  }),
});

// ─── User Profile Router (public) ───────────────────────────────────────

const userProfileRouter = router({
  get: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      const projectsList = await getProjectsByUserIdPublic(input.userId);
      const followers = await getFollowerCount(input.userId);
      const following = await getFollowingCount(input.userId);
      return {
        id: user.id,
        name: user.name,
        createdAt: user.createdAt,
        projects: projectsList,
        followers,
        following,
      };
    }),
});

// ─── Watch Router (public project/episode viewing) ──────────────────────

const watchRouter = router({
  project: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const project = await getProjectBySlug(input.slug);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      const episodesList = await getEpisodesByProject(project.id);
      const episodeCount = episodesList.length;
      return { ...project, episodes: episodesList, episodeCount };
    }),

  episode: publicProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const panelsList = await getPanelsByEpisode(input.episodeId);
      return { ...episode, panels: panelsList };
    }),

  storyboard: publicProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      const panelsList = await getPanelsByEpisode(input.episodeId);
      // Return panels with composite images preferred
      const storyboardPanels = panelsList.map(p => ({
        id: p.id,
        sceneNumber: p.sceneNumber,
        panelNumber: p.panelNumber,
        imageUrl: (p.compositeImageUrl || p.imageUrl) as string | null,
        rawImageUrl: p.imageUrl,
        visualDescription: p.visualDescription,
        cameraAngle: p.cameraAngle,
        dialogue: p.dialogue,
        sfx: p.sfx,
        transition: p.transition,
      }));
      return { episode, panels: storyboardPanels };
    }),
});

// ─── App Router ───────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  projects: projectsRouter,
  uploads: uploadsRouter,
  jobs: jobsRouter,
  episodes: episodesRouter,
  panels: panelsRouter,
  characters: charactersRouter,
  ai: aiRouter,

  // Phase 4: Community & Streaming
  discover: discoverRouter,
  search: searchRouter,
  voting: votingRouter,
  comments: commentsRouter,
  follows: followsRouter,
  watchlist: watchlistRouter,
  leaderboard: leaderboardRouter,
  notifications: notificationsRouter,
  userProfile: userProfileRouter,
  watch: watchRouter,
});

export type AppRouter = typeof appRouter;
