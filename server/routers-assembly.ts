/**
 * Assembly Router — tRPC endpoints for assembling 10-second video slices
 * into the final 5–7 minute anime video.
 *
 * Pipeline position: Stage 7 (final step in guided production pipeline)
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  assembleEpisodeFromSlices,
  assembleEpisodeWithCredits,
  getEpisodeAssemblyStatus,
  parseAssemblySettings,
  buildSliceTimeline,
  validateSlicesForAssembly,
  DEFAULT_ASSEMBLY_CONFIG,
  type AssemblyConfig,
} from "./video-assembler";
import {
  getSlicesByEpisode,
  getEpisodeById,
  updateEpisode,
} from "./db";
import {
  deliverToStream,
  getDeliveryStatus,
  retryDelivery,
  triggerStreamDeliveryAsync,
} from "./stream-delivery";

export const assemblyRouter = router({
  /**
   * Trigger assembly for an episode — joins all generated slices into the final video.
   * Validates that all slices are ready, holds credits, runs FFmpeg pipeline, uploads to S3.
   */
  assemble: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
        config: z
          .object({
            transitionType: z.enum(["cut", "fade", "dissolve", "cross-dissolve"]).optional(),
            transitionDuration: z.number().min(0.1).max(2.0).optional(),
            musicUrl: z.string().url().optional(),
            musicVolume: z.number().min(0).max(1).optional(),
            enableSidechainDucking: z.boolean().optional(),
            skipVoiceValidation: z.boolean().optional(),
            voiceValidationThreshold: z.number().min(-60).max(0).optional(),
            masterLufs: z.number().min(-24).max(-8).optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate episode exists and belongs to user's project
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }
      if (episode.projectId !== input.projectId) {
        throw new Error("Episode does not belong to the specified project");
      }

      // Check assembly readiness
      const status = await getEpisodeAssemblyStatus(input.episodeId);
      if (status.status === "assembling") {
        throw new Error("Assembly is already in progress for this episode");
      }
      if (status.readySlices < status.totalSlices) {
        throw new Error(
          `Not all slices are ready: ${status.readySlices}/${status.totalSlices} ready`
        );
      }

      // Run assembly with credit gateway
      const result = await assembleEpisodeWithCredits(
        input.episodeId,
        ctx.user.id,
        input.projectId,
        input.config || {},
      );

      return result;
    }),

  /**
   * Get assembly status and readiness for an episode.
   * Returns slice counts, voice/music availability, estimated duration, and current video URL.
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return getEpisodeAssemblyStatus(input.episodeId);
    }),

  /**
   * Retry a failed assembly with optional config adjustments.
   * Clears the existing video URL and re-runs the assembly pipeline.
   */
  retry: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
        config: z
          .object({
            transitionType: z.enum(["cut", "fade", "dissolve", "cross-dissolve"]).optional(),
            transitionDuration: z.number().min(0.1).max(2.0).optional(),
            musicUrl: z.string().url().optional(),
            musicVolume: z.number().min(0).max(1).optional(),
            enableSidechainDucking: z.boolean().optional(),
            skipVoiceValidation: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }

      // Clear existing video URL to allow re-assembly
      await updateEpisode(input.episodeId, {
        videoUrl: null,
      });

      // Run assembly with credit gateway
      const result = await assembleEpisodeWithCredits(
        input.episodeId,
        ctx.user.id,
        input.projectId,
        input.config || {},
      );

      return result;
    }),

  /**
   * Get the assembled video URL for preview playback.
   * Returns the video URL and metadata if assembly is complete.
   */
  getPreview: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }

      if (!episode.videoUrl) {
        return {
          available: false,
          videoUrl: null,
          duration: 0,
          status: episode.status,
        };
      }

      const ep = episode as any;
      return {
        available: true,
        videoUrl: episode.videoUrl,
        duration: episode.duration || 0,
        status: episode.status,
        // Stream delivery fields (if available)
        streamUid: ep.streamUid || null,
        streamEmbedUrl: ep.streamEmbedUrl || null,
        streamHlsUrl: ep.streamHlsUrl || null,
        streamThumbnailUrl: ep.streamThumbnailUrl || null,
        streamStatus: ep.streamStatus || "none",
      };
    }),

  /**
   * Get current assembly settings for an episode.
   * Returns the parsed settings with defaults applied.
   */
  getSettings: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }

      const config = parseAssemblySettings(episode.assemblySettings);
      return config;
    }),

  /**
   * Update assembly settings for an episode.
   * Settings are stored in the episode's assembly_settings JSON column.
   */
  updateSettings: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        settings: z.object({
          transitionType: z.enum(["cut", "fade", "dissolve", "cross-dissolve"]).optional(),
          transitionDuration: z.number().min(0.1).max(2.0).optional(),
          musicUrl: z.string().url().nullable().optional(),
          musicVolume: z.number().min(0).max(1).optional(),
          enableSidechainDucking: z.boolean().optional(),
          skipVoiceValidation: z.boolean().optional(),
          voiceValidationThreshold: z.number().min(-60).max(0).optional(),
          voiceLufs: z.number().min(-24).max(-8).optional(),
          musicLufs: z.number().min(-30).max(-8).optional(),
          masterLufs: z.number().min(-24).max(-8).optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }

      // Merge with existing settings
      const existing = (episode.assemblySettings as Record<string, unknown>) || {};
      const merged = { ...existing };

      for (const [key, value] of Object.entries(input.settings)) {
        if (value !== undefined) {
          merged[key] = value;
        }
      }

      await updateEpisode(input.episodeId, {
        assemblySettings: merged,
      });

      return parseAssemblySettings(merged);
    }),

  /**
   * Get the slice timeline for an episode — shows start/end times for each slice
   * accounting for transition overlaps. Useful for preview and debugging.
   */
  getTimeline: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const slices = await getSlicesByEpisode(input.episodeId);
      if (!slices || slices.length === 0) {
        return { slices: [], totalDurationSeconds: 0, transitionOverlapTotal: 0 };
      }

      const episode = await getEpisodeById(input.episodeId);
      const config = parseAssemblySettings(episode?.assemblySettings);

      const validation = validateSlicesForAssembly(slices);
      if (!validation.valid) {
        return {
          slices: [],
          totalDurationSeconds: 0,
          transitionOverlapTotal: 0,
          errors: validation.errors,
        };
      }

      return buildSliceTimeline(
        validation.readySlices,
        config.transitionDuration,
        config.transitionType,
      );
    }),

  /**
   * Manually trigger Cloudflare Stream upload for an assembled episode.
   * Uploads the assembled video to Cloudflare Stream for CDN-backed HLS playback.
   */
  deliverToStream: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }
      if (episode.projectId !== input.projectId) {
        throw new Error("Episode does not belong to the specified project");
      }
      if (!episode.videoUrl) {
        throw new Error("Episode has no assembled video \u2014 run assembly first");
      }

      const result = await deliverToStream(input.episodeId);
      return result;
    }),

  /**
   * Get the current stream delivery status for an episode.
   * If processing, also checks Cloudflare for live progress.
   */
  getDeliveryStatus: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return getDeliveryStatus(input.episodeId);
    }),

  /**
   * Retry a failed stream delivery.
   * Clears the error state and re-uploads the assembled video to Cloudflare Stream.
   */
  retryDelivery: protectedProcedure
    .input(
      z.object({
        episodeId: z.number(),
        projectId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error(`Episode ${input.episodeId} not found`);
      }
      if (episode.projectId !== input.projectId) {
        throw new Error("Episode does not belong to the specified project");
      }

      const result = await retryDelivery(input.episodeId);
      return result;
    }),
});
