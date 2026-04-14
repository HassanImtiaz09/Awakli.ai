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
} from "./db";
import { projects, episodes, panels } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── Quick Create Router ─────────────────────────────────────────────────

export const quickCreateRouter = router({
  // Step 1: Create project from prompt
  start: protectedProcedure
    .input(z.object({
      prompt: z.string().min(10).max(5000),
      genre: z.string().default("Fantasy"),
      style: z.enum(["shonen", "seinen", "shoujo", "chibi", "cyberpunk", "watercolor", "noir", "realistic", "mecha", "default"]).default("shonen"),
      chapters: z.number().min(1).max(12).default(3),
    }))
    .mutation(async ({ ctx, input }) => {
      // Auto-generate a title from the prompt
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

      // Create the project
      const projectId = await createProject({
        userId: ctx.user.id,
        title,
        description: input.prompt,
        genre: input.genre,
        animeStyle: input.style,
        status: "active",
        visibility: "private",
        slug,
        originalPrompt: input.prompt,
        creationMode: "quick_create",
      });

      // Create episodes (chapters)
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
      generateChapterInBackground(projectId, episodeIds[0], input.prompt, {
        title,
        genre: input.genre,
        style: input.style,
      }).catch(err => {
        console.error(`[QuickCreate] Background generation failed:`, err);
      });

      return { projectId, slug, episodeIds, title };
    }),

  // Get generation status for a project
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

      // Determine overall phase
      let phase: "script" | "panels" | "complete" | "error" = "script";
      const currentEp = eps.find(e => e.status === "generating" || e.status === "generated" || e.status === "draft");
      
      if (eps.some(e => e.scriptContent)) {
        phase = totalPanels > 0 ? (generatedPanels === totalPanels && totalPanels > 0 ? "complete" : "panels") : "script";
      }

      // Build chapter statuses
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

      return {
        projectId: input.projectId,
        title: project[0].title,
        phase,
        chapters,
        totalPanels,
        generatedPanels,
        generatingPanels,
        progress: totalPanels > 0 ? Math.round((generatedPanels / totalPanels) * 100) : 0,
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
});

// ─── Background Generation ───────────────────────────────────────────────

async function generateChapterInBackground(
  projectId: number,
  episodeId: number,
  originalPrompt: string,
  meta: { title: string; genre: string; style: string },
) {
  try {
    // Step 1: Generate script
    await updateEpisode(episodeId, { status: "generating" } as any);

    const systemPrompt = `You are a manga screenwriter. You create detailed chapter scripts for manga stories.
Output ONLY valid JSON matching the required schema. No markdown, no explanation.

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
      "visual_description": "string (detailed, FLUX-ready prompt for manga panel generation)",
      "camera_angle": "wide"|"medium"|"close-up"|"extreme-close-up"|"birds-eye",
      "dialogue": [{"character": "string", "text": "string", "emotion": "string"}],
      "sfx": "string or null",
      "transition": "cut"|"fade"|"dissolve"|null
    }]
  }]
}

Generate 3-5 scenes with 2-4 panels each. Make visual descriptions detailed enough for AI image generation. Focus on dramatic, cinematic manga compositions.`,
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
    const content = rawLLMContent;

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
          projectId,
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

    // Step 2: Generate panel images
    const allPanels = await getPanelsByEpisode(episodeId);
    const CONCURRENCY = 3;

    for (let i = 0; i < allPanels.length; i += CONCURRENCY) {
      const batch = allPanels.slice(i, i + CONCURRENCY);
      const promises = batch.map(async (panel) => {
        try {
          await updatePanel(panel.id, { status: "generating" });

          const stylePrefix = meta.style === "default" ? "manga style" : `${meta.style} manga style`;
          const prompt = `${stylePrefix}, ${panel.visualDescription}, high quality manga panel, detailed linework, dramatic composition, black and white manga art`;

          const { url } = await generateImage({ prompt });

          await updatePanel(panel.id, {
            imageUrl: url,
            fluxPrompt: prompt,
            status: "generated",
            reviewStatus: "pending",
          });
        } catch (error) {
          console.error(`[QuickCreate] Panel ${panel.id} generation failed:`, error);
          // One retry
          try {
            await new Promise(r => setTimeout(r, 2000));
            const prompt = `manga panel, ${panel.visualDescription}, high quality`;
            const { url } = await generateImage({ prompt });
            await updatePanel(panel.id, {
              imageUrl: url,
              fluxPrompt: prompt,
              status: "generated",
              reviewStatus: "pending",
            });
          } catch {
            await updatePanel(panel.id, { status: "draft" });
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

    console.log(`[QuickCreate] Project ${projectId} Chapter 1 generation complete`);
  } catch (error) {
    console.error(`[QuickCreate] Generation failed for project ${projectId}:`, error);
    await updateEpisode(episodeId, { status: "draft" } as any).catch(() => {});
  }
}
