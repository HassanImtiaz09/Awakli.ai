/**
 * Enhanced Pipeline tRPC Router — quality assessment, upscaling, scene consistency,
 * SFX, narrator, moderation, cost estimation, and enhanced video prompts.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  assessPanelQuality,
  qualityCheckWithRetry,
  upscalePanel,
  upscaleEpisodePanels,
  extractSceneContext,
  getSceneContextForPrompt,
  buildConsistentPrompt,
  generateSfxTimeline,
  generateNarratorVoice,
  extractNarratorLines,
  buildEnhancedVideoPrompt,
  getTransitionFilter,
  buildAssemblyFilterChain,
  moderateScript,
  moderatePanel,
  estimatePipelineCost,
  CAMERA_MOTION_PRESETS,
  MOOD_MOTION_INTENSITY,
  TRANSITION_FFMPEG_FILTERS,
  SFX_LIBRARY,
} from "./pipelineAgents";
import { getEpisodeById, getPanelById, getProjectById } from "./db";

// ─── Quality Assessment Router ──────────────────────────────────────────

export const qualityRouter = router({
  assess: protectedProcedure
    .input(z.object({ panelId: z.number(), projectStyle: z.string().optional() }))
    .mutation(async ({ input }) => {
      const result = await assessPanelQuality(input.panelId, input.projectStyle);
      return result;
    }),

  assessWithRetry: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      projectStyle: z.string().optional(),
      maxAttempts: z.number().min(1).max(5).optional(),
    }))
    .mutation(async ({ input }) => {
      // For now, just assess without actual regeneration
      const result = await qualityCheckWithRetry(
        input.panelId,
        async () => { /* regeneration would go here */ },
        input.projectStyle,
        input.maxAttempts || 3,
      );
      return result;
    }),

  getScore: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .query(async ({ input }) => {
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      return {
        score: panel.qualityScore ?? null,
        details: panel.qualityDetails ?? null,
        attempts: panel.generationAttempts ?? 1,
      };
    }),
});

// ─── Upscale Router ─────────────────────────────────────────────────────

export const upscaleRouter = router({
  panel: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await upscalePanel(input.panelId);
      return result;
    }),

  episode: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ input }) => {
      const count = await upscaleEpisodePanels(input.episodeId);
      return { upscaledCount: count };
    }),

  getStatus: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .query(async ({ input }) => {
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      return {
        hasUpscaled: !!panel.upscaledImageUrl,
        upscaledUrl: panel.upscaledImageUrl ?? null,
        originalUrl: panel.imageUrl ?? null,
      };
    }),
});

// ─── Scene Consistency Router ───────────────────────────────────────────

export const sceneRouter = router({
  extractContext: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      episodeId: z.number(),
      projectId: z.number(),
      sceneNumber: z.number(),
    }))
    .mutation(async ({ input }) => {
      const context = await extractSceneContext(
        input.panelId, input.episodeId, input.projectId, input.sceneNumber
      );
      return context;
    }),

  getContext: protectedProcedure
    .input(z.object({ episodeId: z.number(), sceneNumber: z.number() }))
    .query(async ({ input }) => {
      const contextPrompt = await getSceneContextForPrompt(input.episodeId, input.sceneNumber);
      return { contextPrompt };
    }),

  buildPrompt: protectedProcedure
    .input(z.object({
      basePrompt: z.string(),
      episodeId: z.number(),
      sceneNumber: z.number(),
    }))
    .query(async ({ input }) => {
      const contextPrefix = await getSceneContextForPrompt(input.episodeId, input.sceneNumber);
      const enhancedPrompt = buildConsistentPrompt(input.basePrompt, contextPrefix);
      return { enhancedPrompt };
    }),
});

// ─── SFX Router ─────────────────────────────────────────────────────────

export const sfxRouter = router({
  generateTimeline: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ input }) => {
      const timeline = await generateSfxTimeline(input.episodeId);
      return { entries: timeline, count: timeline.length };
    }),

  getLibrary: publicProcedure
    .query(() => {
      return SFX_LIBRARY;
    }),
});

// ─── Narrator Router ────────────────────────────────────────────────────

export const narratorRouter = router({
  generate: protectedProcedure
    .input(z.object({ episodeId: z.number(), runId: z.number() }))
    .mutation(async ({ input }) => {
      const count = await generateNarratorVoice(input.episodeId, input.runId);
      return { generatedCount: count };
    }),

  extractLines: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode || !episode.scriptContent) return { lines: [] };
      const lines = extractNarratorLines(episode.scriptContent);
      return { lines };
    }),
});

// ─── Enhanced Video Prompt Router ───────────────────────────────────────

export const videoPromptRouter = router({
  build: protectedProcedure
    .input(z.object({
      visualDescription: z.string(),
      cameraAngle: z.string().optional(),
      mood: z.string().optional(),
      transition: z.string().optional(),
    }))
    .query(({ input }) => {
      const prompt = buildEnhancedVideoPrompt(
        input.visualDescription,
        input.cameraAngle,
        input.mood,
        input.transition,
      );
      const transitionFilter = getTransitionFilter(input.transition || "dissolve");
      return { prompt, transitionFilter };
    }),

  getCameraPresets: publicProcedure
    .query(() => CAMERA_MOTION_PRESETS),

  getMoodPresets: publicProcedure
    .query(() => MOOD_MOTION_INTENSITY),

  getTransitions: publicProcedure
    .query(() => TRANSITION_FFMPEG_FILTERS),

  buildAssemblyChain: protectedProcedure
    .input(z.object({
      clips: z.array(z.object({
        transition: z.string(),
        duration: z.number().optional(),
      })),
    }))
    .query(({ input }) => {
      const filters = buildAssemblyFilterChain(input.clips);
      return { filters };
    }),
});

// ─── Moderation Router ──────────────────────────────────────────────────

export const moderationRouter = router({
  checkScript: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await moderateScript(input.episodeId);
      return result;
    }),

  checkPanel: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await moderatePanel(input.panelId);
      return result;
    }),

  getStatus: protectedProcedure
    .input(z.object({ panelId: z.number() }))
    .query(async ({ input }) => {
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      return {
        status: panel.moderationStatus ?? "pending",
        flags: panel.moderationFlags ?? [],
      };
    }),
});

// ─── Cost Estimation Router ─────────────────────────────────────────────

export const costRouter = router({
  estimate: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const estimate = await estimatePipelineCost(input.episodeId);
      return estimate;
    }),
});
