/**
 * Captions Router — tRPC endpoints for VTT caption delivery to Cloudflare Stream
 *
 * Endpoints:
 *   - captions.deliver: Manually trigger caption delivery (SRT → VTT → Cloudflare Stream)
 *   - captions.getStatus: Check caption delivery status for an episode
 *   - captions.retry: Retry failed caption delivery
 *   - captions.delete: Remove caption from Cloudflare Stream
 *   - captions.listStreamCaptions: List all captions on a Cloudflare Stream video
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  deliverCaptions,
  getCaptionStatus,
  retryCaptionDelivery,
  deleteCaptionFromStream,
} from "./caption-delivery";
import {
  translateSrt,
  listSubtitleLanguages,
  deleteSubtitleLanguage,
  SUPPORTED_LANGUAGES,
  isLanguageSupported,
} from "./subtitle-translator";
import { listCaptions } from "./cloudflare-stream";
import { getEpisodeById } from "./db";

export const captionsRouter = router({
  /**
   * Manually trigger caption delivery for an episode.
   * Prerequisites: episode must have srtUrl and streamUid with streamStatus="ready".
   */
  deliver: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        language: z.string().min(2).max(10).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error("Episode not found");
      }

      const result = await deliverCaptions(input.episodeId, {
        language: input.language,
      });

      return result;
    }),

  /**
   * Get caption delivery status for an episode.
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      return getCaptionStatus(input.episodeId);
    }),

  /**
   * Retry failed caption delivery.
   */
  retry: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        language: z.string().min(2).max(10).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error("Episode not found");
      }

      return retryCaptionDelivery(input.episodeId, {
        language: input.language,
      });
    }),

  /**
   * Delete caption from Cloudflare Stream.
   */
  delete: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        language: z.string().min(2).max(10).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error("Episode not found");
      }

      return deleteCaptionFromStream(input.episodeId, input.language);
    }),

  /**
   * Translate subtitles to a new language using LLM.
   * Requires episode to have English SRT subtitles.
   */
  translateSubtitle: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        language: z.string().min(2).max(10),
      }),
    )
    .mutation(async ({ input }) => {
      if (!isLanguageSupported(input.language)) {
        throw new Error(`Unsupported language: ${input.language}. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(", ")}`);
      }
      return translateSrt(input.episodeId, input.language);
    }),

  /**
   * List all subtitle languages for an episode (existing + available).
   */
  listLanguages: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      return listSubtitleLanguages(input.episodeId);
    }),

  /**
   * Delete a specific language subtitle.
   */
  deleteLanguage: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
        language: z.string().min(2).max(10),
      }),
    )
    .mutation(async ({ input }) => {
      return deleteSubtitleLanguage(input.episodeId, input.language);
    }),

  /**
   * List all caption tracks on a Cloudflare Stream video.
   */
  listStreamCaptions: protectedProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive(),
      }),
    )
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new Error("Episode not found");
      }

      const ep = episode as any;
      if (!ep.streamUid) {
        return { captions: [], streamUid: null };
      }

      try {
        const captions = await listCaptions(ep.streamUid);
        return { captions, streamUid: ep.streamUid };
      } catch {
        return { captions: [], streamUid: ep.streamUid, error: "Failed to fetch captions from Cloudflare Stream" };
      }
    }),
});
