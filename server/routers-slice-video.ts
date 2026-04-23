/**
 * Slice Video Generation Router — tRPC endpoints for generating,
 * managing, and monitoring 10-second video clips per slice.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  generateSliceVideo,
  generateEpisodeVideos,
  retryFailedSlices,
  getEpisodeVideoStatus,
  resolveModelRoute,
} from "./slice-video-generator";
import {
  getSliceById,
  getSlicesByEpisode,
  updateSlice,
} from "./db";

export const sliceVideoRouter = router({
  /**
   * Generate a video clip for a single approved slice.
   */
  generateOne: protectedProcedure
    .input(
      z.object({
        sliceId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new Error(`Slice ${input.sliceId} not found`);
      }
      if (slice.coreSceneStatus !== "approved") {
        throw new Error(
          `Slice ${input.sliceId} core scene must be approved before video generation`
        );
      }

      const result = await generateSliceVideo(
        input.sliceId,
        ctx.user.id,
        input.projectId
      );

      return result;
    }),

  /**
   * Generate video clips for all approved slices in an episode (batch).
   */
  generateAll: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await generateEpisodeVideos(
        input.episodeId,
        ctx.user.id,
        input.projectId
      );

      return result;
    }),

  /**
   * Retry failed video clips for an episode.
   */
  retryFailed: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await retryFailedSlices(
        input.episodeId,
        ctx.user.id,
        input.projectId
      );

      return result;
    }),

  /**
   * Get video generation status for all slices in an episode.
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return getEpisodeVideoStatus(input.episodeId);
    }),

  /**
   * Approve a generated video clip (marks it ready for assembly).
   */
  approveClip: protectedProcedure
    .input(
      z.object({
        sliceId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new Error(`Slice ${input.sliceId} not found`);
      }
      if (slice.videoClipStatus !== "generated") {
        throw new Error(
          `Slice ${input.sliceId} video must be generated before approval (status: ${slice.videoClipStatus})`
        );
      }

      await updateSlice(input.sliceId, {
        videoClipStatus: "approved",
      });

      return { success: true, sliceId: input.sliceId };
    }),

  /**
   * Reject a generated video clip (allows regeneration).
   */
  rejectClip: protectedProcedure
    .input(
      z.object({
        sliceId: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new Error(`Slice ${input.sliceId} not found`);
      }
      if (
        slice.videoClipStatus !== "generated" &&
        slice.videoClipStatus !== "approved"
      ) {
        throw new Error(
          `Slice ${input.sliceId} video must be generated or approved to reject (status: ${slice.videoClipStatus})`
        );
      }

      await updateSlice(input.sliceId, {
        videoClipStatus: "rejected",
        videoClipUrl: null,
      });

      return { success: true, sliceId: input.sliceId };
    }),

  /**
   * Bulk approve all generated video clips in an episode.
   */
  approveAll: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const slices = await getSlicesByEpisode(input.episodeId);
      if (!slices || slices.length === 0) {
        throw new Error(`No slices found for episode ${input.episodeId}`);
      }

      const generatedSlices = slices.filter(
        (s) => s.videoClipStatus === "generated"
      );

      let approvedCount = 0;
      for (const slice of generatedSlices) {
        await updateSlice(slice.id, { videoClipStatus: "approved" });
        approvedCount++;
      }

      return {
        success: true,
        episodeId: input.episodeId,
        approvedCount,
        totalSlices: slices.length,
      };
    }),

  /**
   * Get detailed info for a single slice's video generation.
   */
  getSliceDetail: protectedProcedure
    .input(
      z.object({
        sliceId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new Error(`Slice ${input.sliceId} not found`);
      }

      const route = resolveModelRoute(slice.klingModel, slice.klingMode);

      return {
        sliceId: slice.id,
        sliceNumber: slice.sliceNumber,
        videoClipUrl: slice.videoClipUrl,
        videoClipStatus: slice.videoClipStatus,
        videoClipAttempts: slice.videoClipAttempts,
        videoClipDurationMs: slice.videoClipDurationMs,
        coreSceneImageUrl: slice.coreSceneImageUrl,
        klingModel: slice.klingModel,
        klingMode: slice.klingMode,
        complexityTier: slice.complexityTier,
        lipSyncRequired: slice.lipSyncRequired,
        estimatedCredits: slice.estimatedCredits,
        actualCredits: slice.actualCredits,
        routeInfo: {
          modelName: route.modelName,
          endpoint: route.endpoint,
          supportsElements: route.supportsElements,
          supportsNativeLipSync: route.supportsNativeLipSync,
        },
      };
    }),

  /**
   * Get the video generation preview for an episode — shows all clips
   * with their status, thumbnails, and readiness for assembly.
   */
  getVideoPreview: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const slices = await getSlicesByEpisode(input.episodeId);
      if (!slices || slices.length === 0) {
        return { slices: [], status: null };
      }

      const status = await getEpisodeVideoStatus(input.episodeId);

      const sliceDetails = slices.map((s) => {
        const route = resolveModelRoute(s.klingModel, s.klingMode);
        return {
          id: s.id,
          sliceNumber: s.sliceNumber,
          durationSeconds: s.durationSeconds,
          coreSceneImageUrl: s.coreSceneImageUrl,
          videoClipUrl: s.videoClipUrl,
          videoClipStatus: s.videoClipStatus,
          videoClipAttempts: s.videoClipAttempts,
          videoClipDurationMs: s.videoClipDurationMs,
          klingModel: s.klingModel,
          klingMode: s.klingMode,
          complexityTier: s.complexityTier,
          lipSyncRequired: s.lipSyncRequired,
          estimatedCredits: s.estimatedCredits,
          actualCredits: s.actualCredits,
          characters: s.characters,
          dialogue: s.dialogue,
          actionDescription: s.actionDescription,
          mood: s.mood,
          routeEndpoint: route.endpoint,
        };
      });

      return { slices: sliceDetails, status };
    }),
});
