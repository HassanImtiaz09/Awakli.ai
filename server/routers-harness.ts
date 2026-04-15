/**
 * Harness Router — tRPC endpoints for quality harness results, re-runs, and Production Bible.
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getHarnessResultsForRun,
  getHarnessResultsForEpisode,
  getFlaggedItems,
  getOverallQualityScore,
  runHarnessLayer,
  type HarnessContext,
} from "./harness-runner";
import {
  getOrCompileProductionBible,
  getProductionBible,
  saveProductionBible,
  compileProductionBible,
  lockProductionBible,
} from "./production-bible";
import {
  scriptChecks,
  visualChecks,
  videoChecks,
  audioChecks,
  integrationChecks,
  allChecks,
} from "./harness-checks";
import {
  getPipelineRunById,
  getEpisodeById,
} from "./db";

// ─── Harness Results Router ──────────────────────────────────────────────

export const harnessRouter = router({
  /**
   * Get all harness results for a pipeline run.
   */
  getRunResults: protectedProcedure
    .input(z.object({ pipelineRunId: z.number() }))
    .query(async ({ input }) => {
      const results = await getHarnessResultsForRun(input.pipelineRunId);
      return { results };
    }),

  /**
   * Get all harness results for an episode (across all runs).
   */
  getEpisodeResults: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const results = await getHarnessResultsForEpisode(input.episodeId);
      return { results };
    }),

  /**
   * Get flagged items requiring human review for an episode.
   */
  getFlaggedItems: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const flagged = await getFlaggedItems(input.episodeId);
      return { flagged };
    }),

  /**
   * Get overall quality score summary for an episode.
   */
  getQualityScore: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const score = await getOverallQualityScore(input.episodeId);
      return score;
    }),

  /**
   * Re-run harness checks for a specific layer on a pipeline run.
   * Useful for re-checking after manual fixes.
   */
  reRunLayer: protectedProcedure
    .input(z.object({
      pipelineRunId: z.number(),
      layer: z.enum(["script", "visual", "video", "audio", "integration"]),
    }))
    .mutation(async ({ input }) => {
      const run = await getPipelineRunById(input.pipelineRunId);
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline run not found" });
      }

      const episode = await getEpisodeById(run.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      // Get or compile the production bible
      const bible = await getOrCompileProductionBible(run.projectId);

      const context: HarnessContext = {
        episodeId: run.episodeId,
        pipelineRunId: input.pipelineRunId,
        targetType: input.layer === "script" || input.layer === "integration" ? "episode" : "clip",
      };

      // Select the right check set
      const layerChecks = allChecks[input.layer];
      const summary = await runHarnessLayer(layerChecks, context, bible);

      return {
        layer: input.layer,
        summary: {
          totalChecks: summary.totalChecks,
          passed: summary.passed,
          warned: summary.warned,
          blocked: summary.blocked,
          humanReview: summary.humanReview,
          overallScore: summary.overallScore,
          totalCost: summary.totalCost,
          shouldBlock: summary.shouldBlock,
          flaggedItems: summary.flaggedItems,
        },
      };
    }),

  /**
   * Re-run ALL harness layers for a pipeline run.
   */
  reRunAll: protectedProcedure
    .input(z.object({ pipelineRunId: z.number() }))
    .mutation(async ({ input }) => {
      const run = await getPipelineRunById(input.pipelineRunId);
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pipeline run not found" });
      }

      const bible = await getOrCompileProductionBible(run.projectId);

      const layers = ["script", "visual", "video", "audio", "integration"] as const;
      const layerResults: Record<string, any> = {};
      let totalCost = 0;
      let totalPassed = 0;
      let totalChecks = 0;

      for (const layer of layers) {
        const context: HarnessContext = {
          episodeId: run.episodeId,
          pipelineRunId: input.pipelineRunId,
          targetType: layer === "script" || layer === "integration" ? "episode" : "clip",
        };

        const summary = await runHarnessLayer(allChecks[layer], context, bible);
        layerResults[layer] = {
          totalChecks: summary.totalChecks,
          passed: summary.passed,
          warned: summary.warned,
          blocked: summary.blocked,
          humanReview: summary.humanReview,
          overallScore: summary.overallScore,
          totalCost: summary.totalCost,
          shouldBlock: summary.shouldBlock,
          flaggedItems: summary.flaggedItems,
        };
        totalCost += summary.totalCost;
        totalPassed += summary.passed;
        totalChecks += summary.totalChecks;
      }

      return {
        layerResults,
        totalCost,
        totalPassed,
        totalChecks,
        overallScore: Object.values(layerResults).reduce((sum: number, r: any) => sum + r.overallScore, 0) / layers.length,
      };
    }),
});

// ─── Production Bible Router ─────────────────────────────────────────────

export const productionBibleRouter = router({
  /**
   * Get the production bible for a project.
   * Returns null if not yet compiled.
   */
  get: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      const bible = await getProductionBible(input.projectId);
      return { bible };
    }),

  /**
   * Compile (or re-compile) the production bible for a project.
   */
  compile: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      const bible = await compileProductionBible(input.projectId);
      const id = await saveProductionBible(input.projectId, bible);
      return { bible, id };
    }),

  /**
   * Lock the production bible (makes it immutable for pipeline runs).
   */
  lock: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ input }) => {
      await lockProductionBible(input.projectId);
      return { locked: true };
    }),
});
