/**
 * Anime Episode Publish Router
 *
 * Handles the anime-specific publish flow:
 *   - Publish readiness check (assembled? stream ready? subtitles?)
 *   - SRT subtitle generation trigger
 *   - Anime episode publish/unpublish
 *   - Public episode player data endpoint
 *   - Episode navigation (prev/next)
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getEpisodeById,
  getEpisodesByProject,
  updateEpisode,
  getProjectById,
  getCharactersByProject,
  getUserSubscriptionTier,
} from "./db";
import { generateSrt } from "./subtitle-generator";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";

// ─── Anime Publish Router ────────────────────────────────────────────────

export const animePublishRouter = router({
  /**
   * Check publish readiness for an anime episode.
   * Returns a checklist of requirements and their status.
   */
  getPublishStatus: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      // Verify ownership
      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      }

      // Check tier
      const tier = await getUserSubscriptionTier(ctx.user.id);
      const canPublish = tier !== "free_trial";

      // Build checklist
      const hasAssembledVideo = !!episode.videoUrl;
      const hasStreamReady = episode.streamStatus === "ready";
      const hasSubtitles = !!episode.srtUrl;
      const hasThumbnail = !!episode.thumbnailUrl || !!episode.streamThumbnailUrl;
      const isAlreadyPublished = episode.status === "published";

      const allReady = hasAssembledVideo && hasStreamReady && canPublish;

      return {
        episodeId: input.episodeId,
        projectId: episode.projectId,
        episodeTitle: episode.title,
        isAlreadyPublished,
        canPublish,
        allReady,
        tier,
        checklist: {
          assembledVideo: { ready: hasAssembledVideo, label: "Video assembled" },
          streamReady: { ready: hasStreamReady, label: "CDN stream ready", status: episode.streamStatus },
          subtitles: { ready: hasSubtitles, label: "Subtitles generated", optional: true },
          thumbnail: { ready: hasThumbnail, label: "Thumbnail available", optional: true },
          tierEligible: { ready: canPublish, label: `Tier: ${tier}` },
        },
        videoUrl: episode.videoUrl,
        streamEmbedUrl: episode.streamEmbedUrl,
        streamHlsUrl: episode.streamHlsUrl,
        streamThumbnailUrl: episode.streamThumbnailUrl,
        srtUrl: episode.srtUrl,
      };
    }),

  /**
   * Generate SRT subtitles for an episode.
   */
  generateSubtitles: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      }

      const result = await generateSrt(input.episodeId);

      if (!result.success && !result.srtUrl) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Subtitle generation failed",
        });
      }

      return {
        success: result.success,
        srtUrl: result.srtUrl,
        totalCues: result.totalCues,
        totalDurationSeconds: result.totalDurationSeconds,
        message: result.totalCues === 0
          ? "No dialogue found in episode slices"
          : `Generated ${result.totalCues} subtitle cues`,
      };
    }),

  /**
   * Publish an anime episode.
   * Sets episode status to published, generates share link, notifies owner.
   */
  publish: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      visibility: z.enum(["public", "unlisted", "private"]).default("public"),
    }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      }

      // Check tier
      const tier = await getUserSubscriptionTier(ctx.user.id);
      if (tier === "free_trial") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upgrade to Creator tier or above to publish anime episodes",
        });
      }

      // Check minimum requirements
      if (!episode.videoUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Episode must have an assembled video before publishing",
        });
      }

      if (episode.streamStatus !== "ready") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "CDN stream must be ready before publishing. Current status: " + episode.streamStatus,
        });
      }

      // Update episode status
      await updateEpisode(input.episodeId, {
        status: "published",
        publishedAt: new Date(),
      } as any);

      // Update project visibility if publishing as public
      if (input.visibility === "public" && project.visibility !== "public") {
        const { updateProject } = await import("./db");
        await updateProject(project.id, ctx.user.id, { visibility: "public" });
      }

      // Update project anime status
      if (project.animeStatus !== "completed") {
        const { updateProject } = await import("./db");
        await updateProject(project.id, ctx.user.id, { animeStatus: "completed" } as any);
      }

      // Generate share URL
      const shareUrl = `/watch/${project.id}/${input.episodeId}`;

      // Notify owner
      notifyOwner({
        title: "Anime Episode Published",
        content: `"${episode.title}" (Episode ${episode.episodeNumber}) from "${project.title}" has been published by ${ctx.user.name || "a creator"}.`,
      }).catch(() => {}); // fire-and-forget

      return {
        success: true,
        shareUrl,
        episodeId: input.episodeId,
        projectId: project.id,
        visibility: input.visibility,
        streamEmbedUrl: episode.streamEmbedUrl,
        streamHlsUrl: episode.streamHlsUrl,
      };
    }),

  /**
   * Unpublish an anime episode.
   */
  unpublish: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const project = await getProjectById(episode.projectId, ctx.user.id);
      if (!project) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your project" });
      }

      await updateEpisode(input.episodeId, {
        status: "approved", // revert to approved (pre-publish state)
        publishedAt: null,
      } as any);

      return { success: true, status: "unpublished" as const };
    }),

  /**
   * Public endpoint: get episode player data for the watch page.
   * No auth required — returns only public-safe data.
   */
  getEpisodePlayer: publicProcedure
    .input(z.object({
      projectId: z.number(),
      episodeId: z.number(),
    }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode || episode.projectId !== input.projectId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      // Only allow viewing published episodes
      if (episode.status !== "published") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not available" });
      }

      // Get project for metadata
      // Use a raw query since getProjectById requires userId
      const { getDb } = await import("./db");
      const { projects } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
      if (!project || project.visibility === "private") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not available" });
      }

      // Get characters for metadata
      const characters = await getCharactersByProject(input.projectId);

      // Get all published episodes for navigation
      const allEpisodes = await getEpisodesByProject(input.projectId);
      const publishedEpisodes = (allEpisodes || [])
        .filter((ep) => ep.status === "published")
        .sort((a, b) => a.episodeNumber - b.episodeNumber);

      const currentIndex = publishedEpisodes.findIndex((ep) => ep.id === input.episodeId);
      const prevEpisode = currentIndex > 0 ? publishedEpisodes[currentIndex - 1] : null;
      const nextEpisode = currentIndex < publishedEpisodes.length - 1 ? publishedEpisodes[currentIndex + 1] : null;

      // Increment view count
      try {
        await updateEpisode(input.episodeId, {
          viewCount: (episode.viewCount || 0) + 1,
        } as any);
      } catch {} // non-critical

      return {
        episode: {
          id: episode.id,
          title: episode.title,
          synopsis: episode.synopsis,
          episodeNumber: episode.episodeNumber,
          duration: episode.duration,
          publishedAt: episode.publishedAt,
          viewCount: (episode.viewCount || 0) + 1,
        },
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          genre: project.genre,
          coverImageUrl: project.coverImageUrl,
          animeStyle: project.animeStyle,
          slug: project.slug,
          creatorId: project.userId,
        },
        player: {
          streamEmbedUrl: episode.streamEmbedUrl,
          streamHlsUrl: episode.streamHlsUrl,
          streamThumbnailUrl: episode.streamThumbnailUrl,
          videoUrl: episode.videoUrl,
          srtUrl: episode.srtUrl,
        },
        characters: (characters || []).map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          visualTraits: c.visualTraits,
        })),
        navigation: {
          prevEpisode: prevEpisode ? { id: prevEpisode.id, title: prevEpisode.title, episodeNumber: prevEpisode.episodeNumber } : null,
          nextEpisode: nextEpisode ? { id: nextEpisode.id, title: nextEpisode.title, episodeNumber: nextEpisode.episodeNumber } : null,
          totalEpisodes: publishedEpisodes.length,
          currentIndex: currentIndex + 1,
        },
      };
    }),
});
