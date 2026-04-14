import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { projects, episodes, panels, scenes, exports as exportsTable, users, subscriptions } from "../drizzle/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════
// PART A: CHAPTER STRUCTURE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Chapter length presets with panel ranges
const CHAPTER_LENGTH_PRESETS = {
  short: { minPanels: 10, maxPanels: 15, pages: "8-12", description: "Quick reads, one-shots" },
  standard: { minPanels: 15, maxPanels: 25, pages: "12-20", description: "Typical weekly manga chapter" },
  long: { minPanels: 25, maxPanels: 40, pages: "20-32", description: "Deep episodes, monthly manga feel" },
} as const;

const PACING_STYLES = {
  action_heavy: { maxDialoguePerPanel: 2, silentPanelPercent: "20-25%", description: "More panels per scene, shorter dialogue, fast cuts" },
  dialogue_heavy: { maxDialoguePerPanel: 5, silentPanelPercent: "10-15%", description: "Fewer panels, longer conversations, character-driven" },
  balanced: { maxDialoguePerPanel: 3, silentPanelPercent: "15-20%", description: "Mix of action and dialogue" },
} as const;

const ENDING_STYLES = {
  cliffhanger: "End on unanswered question, mid-action, revelation, or character in danger. Last panel should be a close-up or dramatic angle.",
  resolution: "Wrap up the chapter's conflict, but plant a seed for next chapter.",
  serialized: "End mid-scene naturally, as if turning a page in a longer work.",
} as const;

// Build the enhanced Claude system prompt for chapter generation
export function buildChapterSystemPrompt(opts: {
  title: string;
  genre: string;
  style: string;
  originalPrompt: string;
  chapterNumber: number;
  totalChapters: number;
  chapterLengthPreset: keyof typeof CHAPTER_LENGTH_PRESETS;
  pacingStyle: keyof typeof PACING_STYLES;
  chapterEndingStyle: keyof typeof ENDING_STYLES;
  previousChapterSummary?: string;
}): string {
  const preset = CHAPTER_LENGTH_PRESETS[opts.chapterLengthPreset];
  const pacing = PACING_STYLES[opts.pacingStyle];
  const ending = ENDING_STYLES[opts.chapterEndingStyle];

  return `You are a manga screenwriter. You create detailed chapter scripts for manga stories.
Output ONLY valid JSON matching the required schema. No markdown, no explanation.

Story: "${opts.title}"
Genre: ${opts.genre}
Art Style: ${opts.style}
Original Prompt: ${opts.originalPrompt.slice(0, 1000)}
Chapter: ${opts.chapterNumber} of ${opts.totalChapters}
${opts.previousChapterSummary ? `Previous Chapter Summary: ${opts.previousChapterSummary}` : ""}

CHAPTER STRUCTURE RULES:
1. Each chapter must have a clear three-act structure:
   Opening hook (1-3 panels): Grab attention immediately.
   Rising action (40% of panels): Build tension, develop characters.
   Climax (20% of panels): The peak moment of the chapter.
   Resolution or cliffhanger (2-4 panels): Close or hook for next chapter.

2. Target panel count: ${preset.minPanels}-${preset.maxPanels} panels per chapter.

3. Panel variety (CRITICAL for visual interest):
   Each chapter must include at least:
   - 1 establishing wide shot (full environment, sets the scene)
   - 2-3 medium shots (character interactions)
   - 2-3 close-ups (emotions, dramatic moments)
   - 1 dramatic splash panel (full-width, impact moment)
   Do NOT make every panel the same camera angle.

4. Dialogue distribution (${opts.pacingStyle} pacing):
   Max ${pacing.maxDialoguePerPanel} dialogue lines per panel average.
   Silent panels (no dialogue) should be ${pacing.silentPanelPercent} of all panels.
   Silent panels are powerful for emotional beats and action sequences.

5. Chapter ending style (${opts.chapterEndingStyle}):
   ${ending}

6. Multi-chapter story arc (chapter ${opts.chapterNumber} of ${opts.totalChapters}):
   ${opts.chapterNumber === 1 ? "Chapter 1: World-building + character intro + inciting incident" : ""}
   ${opts.chapterNumber > 1 && opts.chapterNumber < opts.totalChapters ? "Middle chapter: Rising stakes, character development, plot twists" : ""}
   ${opts.chapterNumber === opts.totalChapters ? "Final chapter: Climax + resolution (or season-finale cliffhanger)" : ""}
   ${opts.totalChapters >= 6 && (opts.chapterNumber === 3 || opts.chapterNumber === 4) ? "Include a midpoint twist in this chapter." : ""}

7. Scene-to-panel ratio:
   Each scene should have 3-8 panels.
   Each chapter should have 2-5 scenes.
   Scene transitions need a clear location/time change panel.`;
}

// Enhanced script JSON schema with chapter metadata
export const ENHANCED_SCRIPT_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "chapter_script",
    strict: true,
    schema: {
      type: "object",
      properties: {
        episode_title: { type: "string" },
        synopsis: { type: "string" },
        panel_count: { type: "integer" },
        estimated_read_time_minutes: { type: "number" },
        mood_arc: { type: "array", items: { type: "string" } },
        chapter_end_type: { type: "string", enum: ["cliffhanger", "resolution", "serialized"] },
        next_chapter_hook: { type: "string" },
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
      required: ["episode_title", "synopsis", "panel_count", "estimated_read_time_minutes", "mood_arc", "chapter_end_type", "next_chapter_hook", "scenes"],
      additionalProperties: false,
    },
  },
};

// Chapter editor router (Studio only)
export const chapterEditorRouter = router({
  // Get chapter structure presets
  getPresets: publicProcedure.query(() => {
    return {
      lengthPresets: Object.entries(CHAPTER_LENGTH_PRESETS).map(([key, val]) => ({
        key, ...val,
      })),
      pacingStyles: Object.entries(PACING_STYLES).map(([key, val]) => ({
        key, ...val,
      })),
      endingStyles: Object.entries(ENDING_STYLES).map(([key, val]) => ({
        key, description: val,
      })),
    };
  }),

  // Move a panel from one chapter to another
  movePanel: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      targetEpisodeId: z.number(),
      targetPosition: z.number(), // new panelNumber in target episode
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const panel = await db.select().from(panels).where(eq(panels.id, input.panelId)).limit(1);
      if (!panel[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });

      // Verify user owns the project
      const project = await db.select().from(projects)
        .where(and(eq(projects.id, panel[0].projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "FORBIDDEN" });

      const sourceEpisodeId = panel[0].episodeId;

      // Move the panel
      await db.update(panels).set({
        episodeId: input.targetEpisodeId,
        panelNumber: input.targetPosition,
      }).where(eq(panels.id, input.panelId));

      // Renumber panels in source episode
      const sourcePanels = await db.select().from(panels)
        .where(eq(panels.episodeId, sourceEpisodeId))
        .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));
      for (let i = 0; i < sourcePanels.length; i++) {
        await db.update(panels).set({ panelNumber: i + 1 }).where(eq(panels.id, sourcePanels[i].id));
      }

      // Renumber panels in target episode
      const targetPanels = await db.select().from(panels)
        .where(eq(panels.episodeId, input.targetEpisodeId))
        .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));
      for (let i = 0; i < targetPanels.length; i++) {
        await db.update(panels).set({ panelNumber: i + 1 }).where(eq(panels.id, targetPanels[i].id));
      }

      // Update panel counts
      await db.update(episodes).set({ panelCount: sourcePanels.length })
        .where(eq(episodes.id, sourceEpisodeId));
      await db.update(episodes).set({ panelCount: targetPanels.length })
        .where(eq(episodes.id, input.targetEpisodeId));

      return { success: true };
    }),

  // Split a chapter at a panel boundary
  split: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      splitAtPanelId: z.number(), // panels from this ID onward go to new chapter
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const episode = await db.select().from(episodes).where(eq(episodes.id, input.episodeId)).limit(1);
      if (!episode[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, episode[0].projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "FORBIDDEN" });

      const allPanels = await db.select().from(panels)
        .where(eq(panels.episodeId, input.episodeId))
        .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));

      const splitIdx = allPanels.findIndex(p => p.id === input.splitAtPanelId);
      if (splitIdx <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot split at first panel" });

      // Get all episodes to determine next episode number
      const allEps = await db.select().from(episodes)
        .where(eq(episodes.projectId, episode[0].projectId))
        .orderBy(asc(episodes.episodeNumber));

      const currentEpIdx = allEps.findIndex(e => e.id === input.episodeId);
      const newEpNumber = episode[0].episodeNumber + 1;

      // Shift episode numbers for subsequent episodes
      for (let i = allEps.length - 1; i > currentEpIdx; i--) {
        await db.update(episodes).set({ episodeNumber: allEps[i].episodeNumber + 1 })
          .where(eq(episodes.id, allEps[i].id));
      }

      // Create new episode
      const [newEp] = await db.insert(episodes).values({
        projectId: episode[0].projectId,
        episodeNumber: newEpNumber,
        title: `Chapter ${newEpNumber}`,
        status: episode[0].status,
      }).$returningId();

      // Move panels after split point to new episode
      const panelsToMove = allPanels.slice(splitIdx);
      for (let i = 0; i < panelsToMove.length; i++) {
        await db.update(panels).set({
          episodeId: newEp.id,
          panelNumber: i + 1,
        }).where(eq(panels.id, panelsToMove[i].id));
      }

      // Update panel counts
      await db.update(episodes).set({ panelCount: splitIdx }).where(eq(episodes.id, input.episodeId));
      await db.update(episodes).set({ panelCount: panelsToMove.length }).where(eq(episodes.id, newEp.id));

      return { success: true, newEpisodeId: newEp.id };
    }),

  // Merge two adjacent chapters
  merge: protectedProcedure
    .input(z.object({
      episodeId: z.number(),       // chapter to keep
      mergeWithId: z.number(),     // chapter to merge into the first (must be adjacent)
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const ep1 = await db.select().from(episodes).where(eq(episodes.id, input.episodeId)).limit(1);
      const ep2 = await db.select().from(episodes).where(eq(episodes.id, input.mergeWithId)).limit(1);
      if (!ep1[0] || !ep2[0]) throw new TRPCError({ code: "NOT_FOUND" });

      if (ep1[0].projectId !== ep2[0].projectId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Episodes must be from the same project" });
      }

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, ep1[0].projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "FORBIDDEN" });

      // Get existing panels from the episode being merged
      const existingPanels = await db.select().from(panels)
        .where(eq(panels.episodeId, input.episodeId))
        .orderBy(asc(panels.panelNumber));
      const maxPanelNum = existingPanels.length;

      // Move all panels from mergeWith to the target episode
      const mergePanels = await db.select().from(panels)
        .where(eq(panels.episodeId, input.mergeWithId))
        .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));

      for (let i = 0; i < mergePanels.length; i++) {
        await db.update(panels).set({
          episodeId: input.episodeId,
          panelNumber: maxPanelNum + i + 1,
        }).where(eq(panels.id, mergePanels[i].id));
      }

      // Update panel count
      await db.update(episodes).set({ panelCount: maxPanelNum + mergePanels.length })
        .where(eq(episodes.id, input.episodeId));

      // Delete the merged episode
      await db.delete(episodes).where(eq(episodes.id, input.mergeWithId));

      // Renumber remaining episodes
      const remainingEps = await db.select().from(episodes)
        .where(eq(episodes.projectId, ep1[0].projectId))
        .orderBy(asc(episodes.episodeNumber));
      for (let i = 0; i < remainingEps.length; i++) {
        await db.update(episodes).set({ episodeNumber: i + 1 })
          .where(eq(episodes.id, remainingEps[i].id));
      }

      return { success: true };
    }),

  // Reorder scenes within a chapter
  reorderScenes: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      sceneOrder: z.array(z.number()), // array of scene numbers in new order
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const episode = await db.select().from(episodes).where(eq(episodes.id, input.episodeId)).limit(1);
      if (!episode[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, episode[0].projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "FORBIDDEN" });

      // Update scene numbers based on new order
      let globalPanelNum = 1;
      for (let i = 0; i < input.sceneOrder.length; i++) {
        const oldSceneNum = input.sceneOrder[i];
        const newSceneNum = i + 1;

        const scenePanels = await db.select().from(panels)
          .where(and(eq(panels.episodeId, input.episodeId), eq(panels.sceneNumber, oldSceneNum)))
          .orderBy(asc(panels.panelNumber));

        for (const panel of scenePanels) {
          await db.update(panels).set({
            sceneNumber: newSceneNum + 1000, // temp offset to avoid conflicts
            panelNumber: globalPanelNum++,
          }).where(eq(panels.id, panel.id));
        }
      }

      // Remove temp offset
      const allPanels = await db.select().from(panels)
        .where(eq(panels.episodeId, input.episodeId));
      for (const panel of allPanels) {
        if (panel.sceneNumber > 1000) {
          await db.update(panels).set({ sceneNumber: panel.sceneNumber - 1000 })
            .where(eq(panels.id, panel.id));
        }
      }

      return { success: true };
    }),

  // Get chapter timeline data for the editor
  getTimeline: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "FORBIDDEN" });

      const eps = await db.select().from(episodes)
        .where(eq(episodes.projectId, input.projectId))
        .orderBy(asc(episodes.episodeNumber));

      const timeline = await Promise.all(eps.map(async (ep) => {
        const epPanels = await db.select().from(panels)
          .where(eq(panels.episodeId, ep.id))
          .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));

        // Group panels by scene
        const sceneMap = new Map<number, typeof epPanels>();
        for (const p of epPanels) {
          if (!sceneMap.has(p.sceneNumber)) sceneMap.set(p.sceneNumber, []);
          sceneMap.get(p.sceneNumber)!.push(p);
        }

        const sceneGroups = Array.from(sceneMap.entries()).map(([sceneNum, scenePanels]) => {
          // Determine scene type based on dialogue density
          const avgDialogue = scenePanels.reduce((sum, p) => {
            const d = p.dialogue as any[];
            return sum + (d?.length || 0);
          }, 0) / (scenePanels.length || 1);

          const type = avgDialogue > 3 ? "dialogue" : avgDialogue < 1 ? "establishing" : "action";

          return {
            sceneNumber: sceneNum,
            type,
            panelCount: scenePanels.length,
            panels: scenePanels.map(p => ({
              id: p.id,
              panelNumber: p.panelNumber,
              cameraAngle: p.cameraAngle,
              hasDialogue: !!(p.dialogue as any[])?.length,
              imageUrl: p.imageUrl,
              status: p.status,
            })),
          };
        });

        return {
          id: ep.id,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          status: ep.status,
          panelCount: epPanels.length,
          chapterEndType: ep.chapterEndType,
          nextChapterHook: ep.nextChapterHook,
          moodArc: ep.moodArc,
          estimatedReadTime: ep.estimatedReadTime,
          scenes: sceneGroups,
        };
      }));

      return {
        projectId: input.projectId,
        chapterLengthPreset: project[0].chapterLengthPreset,
        pacingStyle: project[0].pacingStyle,
        chapterEndingStyle: project[0].chapterEndingStyle,
        chapters: timeline,
      };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// PART B: ANIME SNEAK PEEK SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Music sting library (10 pre-made options)
const MUSIC_STINGS = [
  { id: 1, name: "Epic Impact", mood: "dramatic", durationMs: 4000 },
  { id: 2, name: "Mystery Reveal", mood: "suspense", durationMs: 3500 },
  { id: 3, name: "Battle Cry", mood: "action", durationMs: 5000 },
  { id: 4, name: "Emotional Swell", mood: "emotional", durationMs: 4500 },
  { id: 5, name: "Dark Tension", mood: "dark", durationMs: 3000 },
  { id: 6, name: "Victory Fanfare", mood: "triumph", durationMs: 4000 },
  { id: 7, name: "Romantic Bloom", mood: "romance", durationMs: 3500 },
  { id: 8, name: "Comic Sting", mood: "comedy", durationMs: 2500 },
  { id: 9, name: "Horror Drone", mood: "horror", durationMs: 5000 },
  { id: 10, name: "Adventure Start", mood: "adventure", durationMs: 4000 },
];

export const sneakPeekRouter = router({
  // Score scenes and select best for sneak peek
  selectScene: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      // Get all panels grouped by scene
      const allPanels = await db.select().from(panels)
        .where(eq(panels.projectId, input.projectId))
        .orderBy(asc(panels.sceneNumber), asc(panels.panelNumber));

      if (allPanels.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No panels generated yet" });
      }

      // Group by scene
      const sceneMap = new Map<string, typeof allPanels>();
      for (const p of allPanels) {
        const key = `${p.episodeId}-${p.sceneNumber}`;
        if (!sceneMap.has(key)) sceneMap.set(key, []);
        sceneMap.get(key)!.push(p);
      }

      // Score each scene
      let bestScore = -1;
      let bestSceneKey = "";
      let bestPanels: typeof allPanels = [];

      for (const [key, scenePanels] of Array.from(sceneMap.entries())) {
        let score = 0;

        for (const p of scenePanels) {
          const desc = (p.visualDescription || "").toLowerCase();
          const dialogue = p.dialogue as any[] | null;

          // Action or dramatic moment: +3
          if (desc.includes("action") || desc.includes("fight") || desc.includes("dramatic") ||
              desc.includes("explosion") || desc.includes("clash") || desc.includes("battle")) {
            score += 3;
          }

          // Character close-up with emotion: +2
          if ((p.cameraAngle === "close-up" || p.cameraAngle === "extreme-close-up") &&
              (desc.includes("emotion") || desc.includes("tears") || desc.includes("anger") ||
               desc.includes("shock") || desc.includes("smile"))) {
            score += 2;
          }

          // Has dialogue: +2
          if (dialogue && dialogue.length > 0) {
            score += 2;
          }

          // Climax/cliffhanger scene: +3
          if (desc.includes("climax") || desc.includes("reveal") || desc.includes("twist") ||
              desc.includes("cliffhanger") || desc.includes("final")) {
            score += 3;
          }

          // Multiple characters: +1
          if (dialogue && dialogue.length > 1) {
            const uniqueChars = new Set(dialogue.map((d: any) => d.character));
            if (uniqueChars.size > 1) score += 1;
          }

          // Dynamic camera angles: +1
          if (p.cameraAngle !== "medium") score += 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestSceneKey = key;
          bestPanels = scenePanels;
        }
      }

      // Select 2-3 best consecutive panels from the best scene
      const selectedPanels = bestPanels.slice(0, Math.min(3, bestPanels.length));
      const sceneId = selectedPanels[0]?.sceneNumber || 0;

      // Update project with selected scene
      await db.update(projects).set({
        sneakPeekSceneId: sceneId,
      }).where(eq(projects.id, input.projectId));

      return {
        sceneKey: bestSceneKey,
        score: bestScore,
        selectedPanelIds: selectedPanels.map(p => p.id),
        selectedPanels: selectedPanels.map(p => ({
          id: p.id,
          imageUrl: p.imageUrl,
          visualDescription: p.visualDescription,
          dialogue: p.dialogue,
          cameraAngle: p.cameraAngle,
        })),
      };
    }),

  // Generate sneak peek (abbreviated pipeline)
  generate: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      if (project[0].sneakPeekStatus === "generating") {
        throw new TRPCError({ code: "CONFLICT", message: "Sneak peek is already being generated" });
      }

      if (project[0].sneakPeekStatus === "ready" && project[0].sneakPeekUrl) {
        return { status: "ready", url: project[0].sneakPeekUrl };
      }

      // Mark as generating
      await db.update(projects).set({
        sneakPeekStatus: "generating",
      }).where(eq(projects.id, input.projectId));

      // In production, this would trigger an async job
      // For now, simulate the pipeline steps and return a placeholder
      // The actual pipeline: upscale panels -> Kling video -> ElevenLabs voice -> FFmpeg assembly
      const selectedMusicSting = MUSIC_STINGS[Math.floor(Math.random() * MUSIC_STINGS.length)];

      // Simulate completion (in production, this runs async)
      await db.update(projects).set({
        sneakPeekStatus: "ready",
        sneakPeekUrl: `https://cdn.awakli.ai/sneak-peek/${input.projectId}-preview.mp4`,
        sneakPeekGeneratedAt: new Date(),
      }).where(eq(projects.id, input.projectId));

      return {
        status: "ready",
        url: `https://cdn.awakli.ai/sneak-peek/${input.projectId}-preview.mp4`,
        musicSting: selectedMusicSting.name,
        estimatedDurationMs: 8000,
      };
    }),

  // Get sneak peek status
  getStatus: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        status: project[0].sneakPeekStatus || "none",
        url: project[0].sneakPeekUrl,
        sceneId: project[0].sneakPeekSceneId,
        generatedAt: project[0].sneakPeekGeneratedAt,
      };
    }),

  // Get music sting library
  getMusicStings: publicProcedure.query(() => {
    return MUSIC_STINGS;
  }),
});

// ═══════════════════════════════════════════════════════════════════════════
// PART C: DOWNLOAD & EXPORT SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// Format tier requirements
const FORMAT_TIERS: Record<string, { minTier: string; description: string; estimateMbPerChapter: number }> = {
  pdf: { minTier: "free", description: "Manga PDF", estimateMbPerChapter: 15 },
  png_zip: { minTier: "free", description: "Panel images (PNG ZIP)", estimateMbPerChapter: 50 },
  epub: { minTier: "studio", description: "ePub format", estimateMbPerChapter: 20 },
  cbz: { minTier: "studio", description: "CBZ format (manga readers)", estimateMbPerChapter: 45 },
  tiff_zip: { minTier: "studio", description: "TIFF lossless panels", estimateMbPerChapter: 120 },
  mp4_1080: { minTier: "creator", description: "MP4 1080p video", estimateMbPerChapter: 200 },
  mp4_4k: { minTier: "studio", description: "MP4 4K video", estimateMbPerChapter: 800 },
  prores: { minTier: "studio", description: "ProRes 422 (professional editing)", estimateMbPerChapter: 2000 },
  stems: { minTier: "studio", description: "Audio stems (voice/music/SFX)", estimateMbPerChapter: 100 },
  srt: { minTier: "free", description: "SRT subtitles", estimateMbPerChapter: 0.01 },
  thumbnail: { minTier: "studio", description: "YouTube/Crunchyroll thumbnails", estimateMbPerChapter: 2 },
};

// DPI by tier
const DPI_BY_TIER: Record<string, number> = {
  free: 72,
  creator: 150,
  studio: 300,
};

// Resolution by tier for panels
const PANEL_RESOLUTION_BY_TIER: Record<string, number> = {
  free: 1024,
  creator: 2048,
  studio: 2048,
};

async function getUserTier(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) return "free";
  const sub = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .limit(1);
  if (!sub[0]) return "free";
  const tier = sub[0].tier;
  // Normalize: "pro" -> "creator"
  if (tier === "pro") return "creator";
  return tier || "free";
}

const TIER_HIERARCHY = ["free", "creator", "studio"];

function tierMeetsMinimum(userTier: string, minTier: string): boolean {
  return TIER_HIERARCHY.indexOf(userTier) >= TIER_HIERARCHY.indexOf(minTier);
}

export const downloadsRouter = router({
  // Get available formats for a project based on user's tier
  getFormats: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userTier = await getUserTier(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(eq(projects.id, input.projectId)).limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      // Check if project has anime content
      const eps = await db.select().from(episodes)
        .where(eq(episodes.projectId, input.projectId));
      const hasAnime = eps.some(e => e.videoUrl);

      const epPanels = await db.select({ count: sql<number>`count(*)` }).from(panels)
        .where(eq(panels.projectId, input.projectId));
      const panelCount = Number(epPanels[0]?.count || 0);
      const chapterCount = eps.length;

      const mangaFormats = ["pdf", "png_zip", "epub", "cbz", "tiff_zip"].map(format => {
        const info = FORMAT_TIERS[format];
        const unlocked = tierMeetsMinimum(userTier, info.minTier);
        const estimatedSizeMb = Math.round(info.estimateMbPerChapter * chapterCount * 10) / 10;
        return {
          format,
          description: info.description,
          minTier: info.minTier,
          unlocked,
          estimatedSizeMb,
          dpi: format === "pdf" ? DPI_BY_TIER[userTier] : undefined,
          resolution: format === "png_zip" ? `${PANEL_RESOLUTION_BY_TIER[userTier]}px` : undefined,
          watermarked: userTier === "free",
        };
      });

      const animeFormats = hasAnime ? ["mp4_1080", "mp4_4k", "prores", "stems", "srt", "thumbnail"].map(format => {
        const info = FORMAT_TIERS[format];
        const unlocked = tierMeetsMinimum(userTier, info.minTier);
        const estimatedSizeMb = Math.round(info.estimateMbPerChapter * chapterCount * 10) / 10;
        return {
          format,
          description: info.description,
          minTier: info.minTier,
          unlocked,
          estimatedSizeMb,
        };
      }) : [];

      return {
        userTier,
        panelCount,
        chapterCount,
        hasAnime,
        mangaFormats,
        animeFormats,
      };
    }),

  // Generate a download
  generate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      format: z.enum(["pdf", "png_zip", "epub", "cbz", "tiff_zip", "mp4_1080", "mp4_4k", "prores", "stems", "srt", "thumbnail"]),
      chapterNumber: z.number().optional(), // null = all chapters
      episodeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userTier = await getUserTier(ctx.user.id);
      const formatInfo = FORMAT_TIERS[input.format];
      if (!formatInfo) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid format" });

      if (!tierMeetsMinimum(userTier, formatInfo.minTier)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.format} requires ${formatInfo.minTier} tier or higher. You are on ${userTier}.`,
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(eq(projects.id, input.projectId)).limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      // Create export record
      const dpi = input.format === "pdf" ? DPI_BY_TIER[userTier] : undefined;
      const resolution = ["png_zip", "tiff_zip"].includes(input.format) ? `${PANEL_RESOLUTION_BY_TIER[userTier]}px` : undefined;

      const [exportRecord] = await db.insert(exportsTable).values({
        userId: ctx.user.id,
        projectId: input.projectId,
        episodeId: input.episodeId || null,
        format: input.format,
        status: "generating",
        watermarked: userTier === "free" ? 1 : 0,
        resolution: resolution || null,
        dpi: dpi || null,
        chapterNumber: input.chapterNumber || null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
      }).$returningId();

      // In production, this would trigger an async job
      // Simulate completion
      const estimatedSize = Math.round(formatInfo.estimateMbPerChapter * 1024 * 1024);
      const fileUrl = `https://cdn.awakli.ai/exports/${ctx.user.id}/${input.projectId}/${input.format}-${exportRecord.id}.${input.format === "pdf" ? "pdf" : "zip"}`;

      await db.update(exportsTable).set({
        status: "ready",
        fileUrl,
        fileSizeBytes: estimatedSize,
      }).where(eq(exportsTable.id, exportRecord.id));

      return {
        exportId: exportRecord.id,
        status: "ready",
        fileUrl,
        fileSizeBytes: estimatedSize,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }),

  // Get export status
  getStatus: protectedProcedure
    .input(z.object({ exportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const exp = await db.select().from(exportsTable)
        .where(and(eq(exportsTable.id, input.exportId), eq(exportsTable.userId, ctx.user.id)))
        .limit(1);
      if (!exp[0]) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: exp[0].id,
        format: exp[0].format,
        status: exp[0].status,
        fileUrl: exp[0].fileUrl,
        fileSizeBytes: exp[0].fileSizeBytes,
        watermarked: exp[0].watermarked === 1,
        resolution: exp[0].resolution,
        dpi: exp[0].dpi,
        expiresAt: exp[0].expiresAt,
        createdAt: exp[0].createdAt,
      };
    }),

  // List exports for a project
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const exps = await db.select().from(exportsTable)
        .where(and(eq(exportsTable.projectId, input.projectId), eq(exportsTable.userId, ctx.user.id)))
        .orderBy(desc(exportsTable.createdAt))
        .limit(50);

      return exps.map(e => ({
        id: e.id,
        format: e.format,
        status: e.status,
        fileUrl: e.fileUrl,
        fileSizeBytes: e.fileSizeBytes,
        watermarked: e.watermarked === 1,
        chapterNumber: e.chapterNumber,
        expiresAt: e.expiresAt,
        createdAt: e.createdAt,
      }));
    }),

  // Estimate file sizes before download
  estimate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      format: z.enum(["pdf", "png_zip", "epub", "cbz", "tiff_zip", "mp4_1080", "mp4_4k", "prores", "stems", "srt", "thumbnail"]),
    }))
    .query(async ({ ctx, input }) => {
      const userTier = await getUserTier(ctx.user.id);
      const formatInfo = FORMAT_TIERS[input.format];
      if (!formatInfo) throw new TRPCError({ code: "BAD_REQUEST" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const eps = await db.select().from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      const chapterCount = eps.length || 1;
      const estimatedSizeMb = Math.round(formatInfo.estimateMbPerChapter * chapterCount * 10) / 10;

      return {
        format: input.format,
        description: formatInfo.description,
        estimatedSizeMb,
        estimatedSizeBytes: Math.round(estimatedSizeMb * 1024 * 1024),
        chapterCount,
        unlocked: tierMeetsMinimum(userTier, formatInfo.minTier),
        minTier: formatInfo.minTier,
        userTier,
        dpi: input.format === "pdf" ? DPI_BY_TIER[userTier] : undefined,
        watermarked: userTier === "free",
      };
    }),
});

// ═══════════════════════════════════════════════════════════════════════════
// PART D: SHARING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export const sharingRouter = router({
  // Get shareable link and OG data for a project
  getShareData: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(eq(projects.id, input.projectId)).limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const eps = await db.select().from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      const panelCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(panels).where(eq(panels.projectId, input.projectId));

      const slug = project[0].slug || `project-${input.projectId}`;

      return {
        shareUrl: `/read/${slug}`,
        slug,
        ogData: {
          title: project[0].title,
          description: project[0].description?.slice(0, 200) || `A manga created on Awakli`,
          image: project[0].coverImageUrl,
          chapterCount: eps.length,
          panelCount: Number(panelCountResult[0]?.count || 0),
          genre: project[0].genre,
          style: project[0].animeStyle,
        },
        hasSneakPeek: project[0].sneakPeekStatus === "ready",
        sneakPeekUrl: project[0].sneakPeekUrl,
        socialShareText: {
          twitter: `Check out "${project[0].title}" - an AI manga on Awakli! 🎨`,
          reddit: `[OC] ${project[0].title} - Created with Awakli AI`,
          whatsapp: `Check out this manga I found: ${project[0].title}`,
          discord: project[0].title,
        },
      };
    }),

  // Get embed code (Creator/Studio only)
  getEmbedCode: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const userTier = await getUserTier(ctx.user.id);
      if (!tierMeetsMinimum(userTier, "creator")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Embed widget requires Creator tier or higher",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const project = await db.select().from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)))
        .limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const slug = project[0].slug || `project-${input.projectId}`;

      return {
        iframeCode: `<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed/${slug}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`,
        slug,
        embedUrl: `/embed/${slug}`,
      };
    }),

  // Generate a shareable panel image
  generatePanelImage: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      includeTitle: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const panel = await db.select().from(panels)
        .where(eq(panels.id, input.panelId)).limit(1);
      if (!panel[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const project = await db.select().from(projects)
        .where(eq(projects.id, panel[0].projectId)).limit(1);
      if (!project[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const userTier = await getUserTier(ctx.user.id);

      return {
        imageUrl: panel[0].imageUrl || panel[0].compositeImageUrl,
        projectTitle: project[0].title,
        projectSlug: project[0].slug,
        watermarked: userTier === "free",
        shareText: `From "${project[0].title}" on Awakli`,
      };
    }),
});
