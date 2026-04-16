import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getPublishedProjects, getTrendingProjects, getNewReleases,
  getCategories, recordView, getViewCount, getViewsByProject,
  publishProject, unpublishProject, getUserSubscriptionTier,
  getCreatorAnalytics, getCreatorContentBreakdown,
  getProjectBySlug, getEpisodesByProject, getUserById,
  getProjectsByUserIdPublic, searchProjects, formatViewCount,
} from "./db";
import crypto from "crypto";

// ─── Viewer fingerprint hash (IP + user-agent, no cookies) ─────────────────
function computeViewerHash(req: any): string {
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  return crypto.createHash("sha256").update(`${ip}:${ua}`).digest("hex").substring(0, 16);
}

// ─── Public Content Router (no auth required) ──────────────────────────────
export const publicContentRouter = router({
  // Discover: paginated published content with filters
  discover: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      genre: z.string().optional(),
      sort: z.enum(["trending", "newest", "most_viewed", "most_liked", "rising"]).default("trending"),
      contentType: z.enum(["all", "manga", "anime"]).default("all"),
      timePeriod: z.enum(["today", "week", "month", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const results = await getPublishedProjects(input);
      return {
        items: results.map(r => ({
          ...r,
          viewCountFormatted: formatViewCount(r.viewCount ?? 0),
        })),
        hasMore: results.length === input.limit,
      };
    }),

  // Trending: weighted algorithm
  trending: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const results = await getTrendingProjects(input.limit);
      return results.map(r => ({
        ...r,
        viewCountFormatted: formatViewCount(r.viewCount ?? 0),
      }));
    }),

  // New releases: chronological
  newReleases: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const results = await getNewReleases(input.limit, input.offset);
      return {
        items: results.map(r => ({
          ...r,
          viewCountFormatted: formatViewCount(r.viewCount ?? 0),
        })),
        hasMore: results.length === input.limit,
      };
    }),

  // Categories list with counts
  categories: publicProcedure.query(async () => {
    return getCategories();
  }),

  // Category content
  categoryContent: publicProcedure
    .input(z.object({
      genre: z.string(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      sort: z.enum(["trending", "newest", "most_viewed", "most_liked"]).default("trending"),
    }))
    .query(async ({ input }) => {
      const results = await getPublishedProjects({
        genre: input.genre,
        sort: input.sort,
        limit: input.limit,
        offset: input.offset,
      });
      return {
        items: results.map(r => ({
          ...r,
          viewCountFormatted: formatViewCount(r.viewCount ?? 0),
        })),
        hasMore: results.length === input.limit,
      };
    }),

  // Public project by slug (only published or owner)
  getProject: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await getProjectBySlug(input.slug);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      // Allow owner to see their own private content
      const isOwner = ctx.user && ctx.user.id === project.userId;
      if (!isOwner && project.visibility !== "public") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      const episodesList = await getEpisodesByProject(project.id);
      return {
        ...project,
        episodes: episodesList,
        episodeCount: episodesList.length,
        viewCountFormatted: formatViewCount(project.viewCount ?? 0),
        isOwner: !!isOwner,
      };
    }),

  // Public creator profile
  creatorProfile: publicProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Creator not found" });
      const publishedContent = await getProjectsByUserIdPublic(input.userId);
      return {
        id: user.id,
        name: user.name,
        createdAt: user.createdAt,
        contentCount: publishedContent.length,
        content: publishedContent.map(p => ({
          ...p,
          viewCountFormatted: formatViewCount((p as any).viewCount ?? 0),
        })),
      };
    }),

  // Public search
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const results = await searchProjects(input.query, input.limit);
      return results;
    }),

  // Record a view (anonymous, no auth required)
  recordView: publicProcedure
    .input(z.object({
      contentType: z.enum(["manga_chapter", "anime_episode", "project"]),
      contentId: z.number(),
      projectId: z.number().optional(),
      source: z.enum(["direct", "search", "social", "internal", "embed"]).default("direct"),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const viewerHash = computeViewerHash(ctx.req);
      const viewId = await recordView({
        contentType: input.contentType,
        contentId: input.contentId,
        projectId: input.projectId ?? null,
        viewerHash,
        sessionId: input.sessionId ?? null,
        userId: ctx.user?.id ?? null,
        source: input.source,
      });
      return { recorded: viewId !== null, viewId };
    }),

  // Get view count for content
  getViewCount: publicProcedure
    .input(z.object({
      contentType: z.enum(["manga_chapter", "anime_episode", "project"]),
      contentId: z.number(),
    }))
    .query(async ({ input }) => {
      const count = await getViewCount(input.contentType, input.contentId);
      return { count, formatted: formatViewCount(count) };
    }),
});

// ─── Publish Router (auth required) ─────────────────────────────────────────
export const publishRouter = router({
  // Publish a project (requires Creator or Studio tier)
  publish: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getUserSubscriptionTier(ctx.user.id);
      if (tier === "free_trial") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "UPGRADE_REQUIRED",
        });
      }
      await publishProject(input.projectId, ctx.user.id);
      return { success: true, publicationStatus: "published" as const };
    }),

  // Unpublish a project
  unpublish: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await unpublishProject(input.projectId, ctx.user.id);
      return { success: true, publicationStatus: "private" as const };
    }),

  // Check publish eligibility
  checkEligibility: protectedProcedure.query(async ({ ctx }) => {
    const tier = await getUserSubscriptionTier(ctx.user.id);
    return {
      canPublish: tier !== "free_trial",
      tier,
      upgradeRequired: tier === "free_trial",
    };
  }),
});

// ─── Creator Analytics Router (auth required) ───────────────────────────────
export const creatorAnalyticsRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    return getCreatorAnalytics(ctx.user.id);
  }),

  contentBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const content = await getCreatorContentBreakdown(ctx.user.id);
    return content.map(c => ({
      ...c,
      viewCountFormatted: formatViewCount(c.viewCount ?? 0),
    }));
  }),

  viewsOverTime: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx }) => {
      // Simplified: return total views for the creator
      const analytics = await getCreatorAnalytics(ctx.user.id);
      return analytics;
    }),
});
