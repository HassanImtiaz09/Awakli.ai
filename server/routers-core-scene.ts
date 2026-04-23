/**
 * Core Scene Preview Router — tRPC endpoints for storyboard preview images
 *
 * Provides endpoints for:
 *   - Generating preview images for individual slices
 *   - Batch generating previews for all pending slices
 *   - Regenerating rejected previews
 *   - Approving / rejecting previews
 *   - Bulk approval
 *   - Getting storyboard status
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getSliceById, getSlicesByEpisode, getEpisodeById, getProjectById,
  getCharactersByProject, updateSlice,
} from "./db";
import {
  buildCoreScenePrompt,
  generateCoreScenePreview,
  generateAllCoreScenesForEpisode,
  approveCoreScene,
  rejectCoreScene,
  approveAllCoreScenes,
} from "./core-scene-preview";

export const coreSceneRouter = router({

  /**
   * Generate a core scene preview for a single slice.
   * Returns the generated image URL and credit cost.
   */
  generate: protectedProcedure
    .input(z.object({
      sliceId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      // Verify ownership via episode → project
      const episode = await getEpisodeById(slice.episodeId!);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      // Mark as generating
      await updateSlice(input.sliceId, { coreSceneStatus: "generating" });

      const projectCharacters = await getCharactersByProject((episode as any).projectId);
      const result = await generateCoreScenePreview(
        input.sliceId,
        ctx.user.id,
        projectCharacters as any,
        (project as any).animeStyle || "default",
        (project as any).tone || null,
      );

      if (result.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Core scene generation failed",
        });
      }

      return {
        sliceId: result.sliceId,
        sliceNumber: result.sliceNumber,
        imageUrl: result.imageUrl,
        creditsUsed: result.creditsUsed,
      };
    }),

  /**
   * Batch generate core scene previews for all pending slices in an episode.
   * Skips slices that already have generated or approved previews.
   */
  generateBatch: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      concurrency: z.number().min(1).max(4).default(2),
    }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      // Mark all pending slices as generating
      const slices = await getSlicesByEpisode(input.episodeId);
      const pendingSlices = slices.filter(
        s => !s.coreSceneStatus || s.coreSceneStatus === "pending" || s.coreSceneStatus === "rejected"
      );
      for (const slice of pendingSlices) {
        await updateSlice(slice.id, { coreSceneStatus: "generating" });
      }

      const result = await generateAllCoreScenesForEpisode(
        input.episodeId,
        ctx.user.id,
        (episode as any).projectId,
        (project as any).animeStyle || "default",
        (project as any).tone || null,
        input.concurrency,
      );

      return {
        total: result.total,
        generated: result.generated,
        failed: result.failed,
        totalCreditsUsed: result.totalCreditsUsed,
        results: result.results.map(r => ({
          sliceId: r.sliceId,
          sliceNumber: r.sliceNumber,
          imageUrl: r.imageUrl,
          status: r.status,
          error: r.error,
        })),
      };
    }),

  /**
   * Regenerate a single slice's preview (after user rejected it).
   * Clears the old image and generates a new one.
   */
  regenerate: protectedProcedure
    .input(z.object({
      sliceId: z.number(),
      feedbackPrompt: z.string().optional(),  // User can provide guidance for regeneration
    }))
    .mutation(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      const episode = await getEpisodeById(slice.episodeId!);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      // Clear old preview and mark as generating
      await updateSlice(input.sliceId, {
        coreSceneImageUrl: null,
        coreSceneStatus: "generating",
      });

      // If user provided feedback, temporarily augment the action description
      let originalAction: string | null = null;
      if (input.feedbackPrompt) {
        originalAction = slice.actionDescription;
        const augmented = `${slice.actionDescription || "anime scene"}. User refinement: ${input.feedbackPrompt}`;
        await updateSlice(input.sliceId, { actionDescription: augmented });
      }

      const projectCharacters = await getCharactersByProject((episode as any).projectId);
      const result = await generateCoreScenePreview(
        input.sliceId,
        ctx.user.id,
        projectCharacters as any,
        (project as any).animeStyle || "default",
        (project as any).tone || null,
      );

      // Restore original action description if we augmented it
      if (originalAction !== null) {
        await updateSlice(input.sliceId, { actionDescription: originalAction });
      }

      if (result.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Regeneration failed",
        });
      }

      return {
        sliceId: result.sliceId,
        sliceNumber: result.sliceNumber,
        imageUrl: result.imageUrl,
        creditsUsed: result.creditsUsed,
      };
    }),

  /**
   * Approve a slice's core scene preview.
   * Marks it as ready for video generation.
   */
  approve: protectedProcedure
    .input(z.object({
      sliceId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      // Verify ownership
      const episode = await getEpisodeById(slice.episodeId!);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      const result = await approveCoreScene(input.sliceId);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Approval failed",
        });
      }

      return { success: true, sliceId: input.sliceId };
    }),

  /**
   * Reject a slice's core scene preview with optional feedback.
   */
  reject: protectedProcedure
    .input(z.object({
      sliceId: z.number(),
      feedback: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      // Verify ownership
      const episode = await getEpisodeById(slice.episodeId!);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      const result = await rejectCoreScene(input.sliceId, input.feedback);
      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error || "Rejection failed",
        });
      }

      return { success: true, sliceId: input.sliceId };
    }),

  /**
   * Bulk approve all generated core scenes for an episode.
   */
  approveAll: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      const result = await approveAllCoreScenes(input.episodeId);
      return result;
    }),

  /**
   * Get the storyboard status for an episode.
   * Returns all slices with their preview status, grouped for the UI.
   */
  getStoryboard: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const slices = await getSlicesByEpisode(input.episodeId);

      const statusCounts = {
        pending: 0,
        generating: 0,
        generated: 0,
        approved: 0,
        rejected: 0,
      };

      const storyboardSlices = slices.map(slice => {
        const status = (slice.coreSceneStatus || "pending") as keyof typeof statusCounts;
        if (status in statusCounts) {
          statusCounts[status]++;
        }

        return {
          id: slice.id,
          sliceNumber: slice.sliceNumber,
          durationSeconds: Number(slice.durationSeconds) || 10,
          characters: safeParseJson(slice.characters, []),
          dialogue: safeParseJson(slice.dialogue, []),
          actionDescription: slice.actionDescription,
          cameraAngle: slice.cameraAngle,
          mood: slice.mood,
          complexityTier: slice.complexityTier,
          klingModel: slice.klingModel,
          klingMode: slice.klingMode,
          lipSyncRequired: slice.lipSyncRequired === 1,
          coreSceneImageUrl: slice.coreSceneImageUrl,
          coreSceneStatus: slice.coreSceneStatus || "pending",
          estimatedCredits: Number(slice.estimatedCredits) || 0,
        };
      });

      const allApproved = statusCounts.approved === slices.length && slices.length > 0;
      const allGenerated = (statusCounts.generated + statusCounts.approved) === slices.length && slices.length > 0;

      return {
        episodeId: input.episodeId,
        totalSlices: slices.length,
        statusCounts,
        allGenerated,
        allApproved,
        readyForVideoGeneration: allApproved,
        slices: storyboardSlices,
      };
    }),

  /**
   * Get a prompt preview for a slice without generating the image.
   * Useful for debugging and letting users see what prompt will be used.
   */
  getPromptPreview: protectedProcedure
    .input(z.object({
      sliceId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const slice = await getSliceById(input.sliceId);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      const episode = await getEpisodeById(slice.episodeId!);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      const project = await getProjectById((episode as any).projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You don't own this project" });
      }

      const projectCharacters = await getCharactersByProject((episode as any).projectId);
      const promptData = buildCoreScenePrompt(
        {
          actionDescription: slice.actionDescription,
          cameraAngle: slice.cameraAngle,
          mood: slice.mood,
          characters: slice.characters as any,
          dialogue: slice.dialogue as any,
          lipSyncRequired: slice.lipSyncRequired ?? 0,
        },
        projectCharacters as any,
        (project as any).animeStyle || "default",
        (project as any).tone || null,
      );

      return {
        sliceId: input.sliceId,
        sliceNumber: slice.sliceNumber,
        prompt: promptData.prompt,
        simplifiedPrompt: promptData.simplified,
        negativePrompt: promptData.negativePrompt,
        estimatedCreditCost: 1,  // core_scene_preview costs 1 credit
      };
    }),
});

// ─── Utility ──────────────────────────────────────────────────────────────

function safeParseJson<T>(value: any, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
}
