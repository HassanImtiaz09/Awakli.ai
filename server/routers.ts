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
  createCharacter, getCharactersByProject, getCharacterById, updateCharacter, deleteCharacter,
} from "./db";
import { storagePut } from "./storage";
import { runMangaToAnimeJob } from "./pipeline";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";

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
        // Create episode record in "generating" state
        const episodeId = await createEpisode({
          projectId: input.projectId,
          episodeNumber: epNum,
          title: `Episode ${epNum}`,
          status: "generating",
        });

        results.push({ episodeId, episodeNumber: epNum });

        // Fire-and-forget script generation
        generateScriptForEpisode(episodeId, project, epNum, input.styleNotes).catch((err) => {
          console.error(`[Script] Episode ${episodeId} generation failed:`, err);
          updateEpisode(episodeId, { status: "draft" }).catch(() => {});
        });
      }

      return { episodes: results };
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

    // Count words and panels
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
          projectId: 0, // Will be set below
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

    // Get projectId from episode
    const episode = await getEpisodeById(episodeId);
    if (episode) {
      for (const pr of panelRecords) {
        pr.projectId = episode.projectId;
      }
    }

    // Update episode with script
    await updateEpisode(episodeId, {
      title: script.episode_title,
      synopsis: script.synopsis,
      scriptContent: script,
      status: "generated",
      wordCount,
      panelCount,
    });

    // Create panel records
    if (panelRecords.length > 0) {
      await createPanelsBulk(panelRecords);
    }

    // Notify owner
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
      const { id, ...data } = input;
      await updatePanel(id, data);
      return { success: true };
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

        // Save URL to character's reference images
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
});

export type AppRouter = typeof appRouter;
