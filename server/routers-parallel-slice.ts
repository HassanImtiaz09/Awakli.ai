/**
 * Parallel Slice Scheduler — tRPC Router
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  buildDependencyGraph,
  getReadySlices,
  markSliceStarted,
  markSliceComplete,
  markSliceFailed,
  cancelEpisode,
  getSchedulerStatus,
  getGraphForVisualization,
  cleanupGraph,
  getActiveEpisodes,
  type SliceInput,
} from "./parallel-slice-scheduler";

export const parallelSliceRouter = router({
  /** Build dependency graph and start scheduling. */
  start: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      slices: z.array(z.object({
        sliceId: z.number(),
        sceneIndex: z.number(),
        characterIds: z.array(z.number()),
        importance: z.number().min(1).max(10),
        estimatedDurationSec: z.number().optional(),
      })),
      maxConcurrency: z.number().min(1).max(8).optional(),
    }))
    .mutation(({ input }) => {
      const graph = buildDependencyGraph(
        input.episodeId,
        input.slices as SliceInput[],
        input.maxConcurrency,
      );
      const readySlices = getReadySlices(input.episodeId);
      return {
        totalSlices: graph.totalSlices,
        readySlices,
        maxConcurrency: graph.maxConcurrency,
      };
    }),

  /** Get current generation status. */
  getStatus: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(({ input }) => {
      return getSchedulerStatus(input.episodeId);
    }),

  /** Get next batch of ready slices. */
  getReady: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(({ input }) => {
      return { readySlices: getReadySlices(input.episodeId) };
    }),

  /** Mark a slice as started. */
  markStarted: protectedProcedure
    .input(z.object({ episodeId: z.number(), sliceId: z.number() }))
    .mutation(({ input }) => {
      return { success: markSliceStarted(input.episodeId, input.sliceId) };
    }),

  /** Mark a slice as complete. */
  markComplete: protectedProcedure
    .input(z.object({ episodeId: z.number(), sliceId: z.number() }))
    .mutation(({ input }) => {
      const success = markSliceComplete(input.episodeId, input.sliceId);
      const readySlices = getReadySlices(input.episodeId);
      return { success, readySlices };
    }),

  /** Mark a slice as failed. */
  markFailed: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      sliceId: z.number(),
      error: z.string(),
    }))
    .mutation(({ input }) => {
      return { success: markSliceFailed(input.episodeId, input.sliceId, input.error) };
    }),

  /** Cancel all pending slices. */
  cancel: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(({ input }) => {
      const cancelled = cancelEpisode(input.episodeId);
      return { cancelled };
    }),

  /** Get dependency graph for visualization. */
  getGraph: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(({ input }) => {
      return getGraphForVisualization(input.episodeId);
    }),

  /** Cleanup completed graph from memory. */
  cleanup: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(({ input }) => {
      return { success: cleanupGraph(input.episodeId) };
    }),

  /** List all active episode generations. */
  activeEpisodes: protectedProcedure
    .query(() => {
      return { episodes: getActiveEpisodes() };
    }),
});
