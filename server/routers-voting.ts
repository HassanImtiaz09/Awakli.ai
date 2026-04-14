import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getProjectVoteProgress,
  checkAndPromoteProject,
  startAnimeProduction,
  getRisingStars,
  getBecomingAnime,
  getLeaderboardRising,
  getLeaderboardPromoted,
  getLeaderboardCompleted,
  getAnimePromotion,
  getCreatorProjectsWithVoteProgress,
  getAnimeVoteThreshold,
  updateAnimeThreshold,
  updateFeaturedThreshold,
} from "./db-voting";
import { castVote, removeVote, getVoteCounts, getUserVote, getProjectById } from "./db";
import { getEpisodesByProject } from "./db";

// ─── Enhanced Voting Router ────────────────────────────────────────────
// Replaces the existing voting router with threshold-checking logic

export const enhancedVotingRouter = router({
  cast: protectedProcedure
    .input(z.object({ episodeId: z.number(), voteType: z.enum(["up", "down"]) }))
    .mutation(async ({ ctx, input }) => {
      await castVote(ctx.user.id, input.episodeId, input.voteType);
      const counts = await getVoteCounts(input.episodeId);

      // Get the project for this episode to check threshold
      const { getDb } = await import("./db");
      const { episodes } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      let promotionResult = null;
      let votesRemaining = 0;

      if (db && input.voteType === "up") {
        const ep = await db.select({ projectId: episodes.projectId })
          .from(episodes).where(eq(episodes.id, input.episodeId)).limit(1);
        if (ep[0]) {
          promotionResult = await checkAndPromoteProject(ep[0].projectId);
          votesRemaining = Math.max(0, promotionResult.threshold - promotionResult.totalVotes);
        }
      }

      return {
        ...counts,
        userVote: input.voteType,
        promoted: promotionResult?.promoted ?? false,
        votesRemaining,
        totalProjectVotes: promotionResult?.totalVotes ?? 0,
        threshold: promotionResult?.threshold ?? 500,
      };
    }),

  remove: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await removeVote(ctx.user.id, input.episodeId);
      const counts = await getVoteCounts(input.episodeId);

      // Recalculate project votes
      const { getDb } = await import("./db");
      const { episodes } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const ep = await db.select({ projectId: episodes.projectId })
          .from(episodes).where(eq(episodes.id, input.episodeId)).limit(1);
        if (ep[0]) {
          await checkAndPromoteProject(ep[0].projectId);
        }
      }

      return { ...counts, userVote: null };
    }),

  get: publicProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const counts = await getVoteCounts(input.episodeId);
      const userVote = ctx.user ? await getUserVote(ctx.user.id, input.episodeId) : null;
      return { ...counts, userVote: userVote?.voteType ?? null };
    }),
});

// ─── Vote Progress Router ──────────────────────────────────────────────

export const voteProgressRouter = router({
  get: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return getProjectVoteProgress(input.projectId);
    }),

  getThreshold: publicProcedure.query(async () => {
    const threshold = await getAnimeVoteThreshold();
    return { threshold };
  }),
});

// ─── Anime Production Router ───────────────────────────────────────────

export const animeProductionRouter = router({
  start: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const project = await getProjectById(input.projectId, ctx.user.id);
      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      if (project.animeStatus !== "eligible") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Project is not eligible for anime production" });
      }

      const success = await startAnimeProduction(input.projectId, ctx.user.id);
      if (!success) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to start production" });

      return { success: true };
    }),

  getPromotion: publicProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return getAnimePromotion(input.projectId);
    }),
});

// ─── Discover Extensions ───────────────────────────────────────────────

export const discoverVotingRouter = router({
  rising: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ input }) => {
      const threshold = await getAnimeVoteThreshold();
      const results = await getRisingStars(input?.limit ?? 20);
      return results.map(r => ({
        ...r,
        threshold,
        percentage: Math.min(Math.round(((r.totalVotes ?? 0) / threshold) * 100), 100),
      }));
    }),

  becomingAnime: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
    .query(async ({ input }) => {
      return getBecomingAnime(input?.limit ?? 20);
    }),
});

// ─── Road to Anime Leaderboard ─────────────────────────────────────────

export const roadToAnimeRouter = router({
  rising: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      const threshold = await getAnimeVoteThreshold();
      const results = await getLeaderboardRising(input?.limit ?? 50);
      return {
        threshold,
        items: results.map((r, i) => ({
          rank: i + 1,
          ...r,
          percentage: Math.min(Math.round(((r.totalVotes ?? 0) / threshold) * 100), 100),
        })),
      };
    }),

  promoted: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      return getLeaderboardPromoted(input?.limit ?? 50);
    }),

  completed: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      return getLeaderboardCompleted(input?.limit ?? 50);
    }),
});

// ─── Creator Dashboard Extensions ──────────────────────────────────────

export const creatorVotingRouter = router({
  projectsWithProgress: protectedProcedure.query(async ({ ctx }) => {
    return getCreatorProjectsWithVoteProgress(ctx.user.id);
  }),
});

// ─── Admin Threshold Management ────────────────────────────────────────

export const adminVotingRouter = router({
  getThresholds: adminProcedure.query(async () => {
    const { getConfigValue } = await import("./db-voting");
    const animeThreshold = await getConfigValue("anime_vote_threshold");
    const featuredThreshold = await getConfigValue("anime_featured_threshold");
    return {
      animeVoteThreshold: animeThreshold ? parseInt(animeThreshold, 10) : 500,
      animeFeaturedThreshold: featuredThreshold ? parseInt(featuredThreshold, 10) : 1000,
    };
  }),

  updateThresholds: adminProcedure
    .input(z.object({
      animeVoteThreshold: z.number().min(10).optional(),
      animeFeaturedThreshold: z.number().min(10).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.animeVoteThreshold) await updateAnimeThreshold(input.animeVoteThreshold);
      if (input.animeFeaturedThreshold) await updateFeaturedThreshold(input.animeFeaturedThreshold);
      return { success: true };
    }),
});
