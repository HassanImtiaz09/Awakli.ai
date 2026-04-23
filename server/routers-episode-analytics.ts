/**
 * Milestone 9: Episode Analytics Router
 *
 * tRPC endpoints for recording episode views and querying analytics.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import {
  recordEpisodeView,
  updateViewProgress,
  getEpisodeViewStats,
  getViewsTimeSeries,
  getDeviceBreakdown,
  getTopCountries,
  getEpisodeAnalyticsDashboard,
} from "./episode-analytics";

export const episodeAnalyticsRouter = router({
  /**
   * Record an episode view (public — called from the watch page).
   */
  recordView: publicProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        projectId: z.number().int().positive(),
        referrer: z.string().max(512).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const req = ctx.req;
      const viewerIp =
        (req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
        req?.socket?.remoteAddress ??
        "unknown";
      const userAgent = (req?.headers?.["user-agent"] as string) ?? "";

      const success = await recordEpisodeView({
        episodeId: input.episodeId,
        projectId: input.projectId,
        viewerUserId: ctx.user?.id ?? null,
        viewerIp,
        userAgent,
        referrer: input.referrer,
      });

      return { success };
    }),

  /**
   * Update watch progress (heartbeat from player).
   */
  updateProgress: publicProcedure
    .input(
      z.object({
        viewId: z.number().int().positive(),
        watchDurationSeconds: z.number().int().min(0),
        completionPercent: z.number().int().min(0).max(100),
      }),
    )
    .mutation(async ({ input }) => {
      const success = await updateViewProgress(
        input.viewId,
        input.watchDurationSeconds,
        input.completionPercent,
      );
      return { success };
    }),

  /**
   * Get per-episode view stats for the authenticated creator.
   */
  episodeStats: protectedProcedure.query(async ({ ctx }) => {
    return getEpisodeViewStats(ctx.user.id);
  }),

  /**
   * Get time-series view data for the creator's episodes.
   */
  viewsTimeSeries: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      return getViewsTimeSeries(ctx.user.id, input.days);
    }),

  /**
   * Get device breakdown for the creator's episode views.
   */
  deviceBreakdown: protectedProcedure.query(async ({ ctx }) => {
    return getDeviceBreakdown(ctx.user.id);
  }),

  /**
   * Get top countries for the creator's episode views.
   */
  topCountries: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      return getTopCountries(ctx.user.id, input.limit);
    }),

  /**
   * Get the full episode analytics dashboard.
   */
  dashboard: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      return getEpisodeAnalyticsDashboard(ctx.user.id, input.days);
    }),
});
