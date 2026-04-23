/**
 * Milestone 8: Batch Assembly Queue tRPC Router
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  enqueueBatchAssembly,
  getQueueDashboard,
  cancelQueueItem,
  retryFailedItem,
  getBatchEstimate,
  getBatchLimit,
} from "./batch-assembly-queue";
import { getUserSubscriptionTier } from "./db";

export const batchAssemblyRouter = router({
  /**
   * Submit episodes for batch assembly.
   */
  enqueue: protectedProcedure
    .input(
      z.object({
        episodeIds: z.array(z.number().int().positive()).min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await enqueueBatchAssembly(ctx.user.id, input.episodeIds);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to enqueue batch assembly",
        });
      }
    }),

  /**
   * Get user's assembly queue dashboard.
   */
  getQueue: protectedProcedure.query(async ({ ctx }) => {
    return getQueueDashboard(ctx.user.id);
  }),

  /**
   * Cancel a queued item.
   */
  cancel: protectedProcedure
    .input(z.object({ queueItemId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const result = await cancelQueueItem(ctx.user.id, input.queueItemId);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Failed to cancel queue item",
        });
      }
      return result;
    }),

  /**
   * Retry a failed item.
   */
  retry: protectedProcedure
    .input(z.object({ queueItemId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const result = await retryFailedItem(ctx.user.id, input.queueItemId);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Failed to retry queue item",
        });
      }
      return result;
    }),

  /**
   * Get batch estimate (time and credit cost).
   */
  getEstimate: protectedProcedure
    .input(
      z.object({
        episodeIds: z.array(z.number().int().positive()).min(1).max(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return getBatchEstimate(ctx.user.id, input.episodeIds);
    }),

  /**
   * Get batch limits for the current user's tier.
   */
  getLimits: protectedProcedure.query(async ({ ctx }) => {
    const tier = await getUserSubscriptionTier(ctx.user.id);
    return {
      tier,
      maxBatchSize: getBatchLimit(tier),
    };
  }),
});
