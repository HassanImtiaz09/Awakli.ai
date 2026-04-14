import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { TIERS, normalizeTier, ANIME_PREVIEW, type TierKey } from "./stripe/products";
import { getSubscriptionByUserId } from "./db-phase6";
import { projects, episodes, panels, users, characters, tierLimits } from "../drizzle/schema";
import { eq, and, sql, count, gte } from "drizzle-orm";

// ─── Tier Enforcement Helpers ─────────────────────────────────────────

type ActionType =
  | "create_project"
  | "create_chapter"
  | "create_panel"
  | "generate_anime"
  | "clone_voice"
  | "train_lora"
  | "export_manga"
  | "export_anime"
  | "set_premium"
  | "upload_manga";

interface TierCheckResult {
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  limit?: number;
  upgradeTier?: TierKey;
  upgradeBenefit?: string;
}

async function getUserTier(userId: number): Promise<TierKey> {
  const sub = await getSubscriptionByUserId(userId);
  return normalizeTier(sub?.tier || "free");
}

async function checkTierLimit(
  userId: number,
  action: ActionType,
  projectId?: number
): Promise<TierCheckResult> {
  const tier = await getUserTier(userId);
  const config = TIERS[tier];
  const db = (await getDb())!;

  switch (action) {
    case "create_project": {
      const [result] = await db
        .select({ count: count() })
        .from(projects)
        .where(eq(projects.userId, userId));
      const current = result?.count || 0;
      if (current >= config.maxProjects) {
        return {
          allowed: false,
          reason: `You've reached the ${config.maxProjects} project limit on the ${config.name} plan.`,
          currentCount: current,
          limit: config.maxProjects,
          upgradeTier: tier === "free" ? "creator" : "studio",
          upgradeBenefit: tier === "free"
            ? "Upgrade to Creator for up to 10 projects"
            : "Upgrade to Studio for unlimited projects",
        };
      }
      return { allowed: true, currentCount: current, limit: config.maxProjects };
    }

    case "create_chapter": {
      if (!projectId) return { allowed: true };
      const [result] = await db
        .select({ count: count() })
        .from(episodes)
        .where(eq(episodes.projectId, projectId));
      const current = result?.count || 0;
      if (current >= config.maxChaptersPerProject) {
        return {
          allowed: false,
          reason: `You've reached ${config.maxChaptersPerProject} chapters per project on the ${config.name} plan.`,
          currentCount: current,
          limit: config.maxChaptersPerProject,
          upgradeTier: tier === "free" ? "creator" : "studio",
          upgradeBenefit: tier === "free"
            ? "Upgrade to Creator for 12 chapters per project"
            : "Upgrade to Studio for unlimited chapters",
        };
      }
      return { allowed: true, currentCount: current, limit: config.maxChaptersPerProject };
    }

    case "create_panel": {
      if (!projectId) return { allowed: true };
      // Check panels per chapter (approximate by checking total panels in project / episodes)
      return { allowed: true };
    }

    case "generate_anime": {
      if (config.maxAnimeEpisodesPerMonth === 0) {
        return {
          allowed: false,
          reason: "Anime generation requires a Creator or Studio plan.",
          limit: 0,
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator for 5 anime episodes per month",
        };
      }
      // Check monthly anime generation count
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [result] = await db
        .select({ count: count() })
        .from(episodes)
        .where(
          and(
            eq(episodes.projectId, projectId || 0),
            gte(episodes.publishedAt, startOfMonth)
          )
        );
      const current = result?.count || 0;
      if (current >= config.maxAnimeEpisodesPerMonth) {
        return {
          allowed: false,
          reason: `You've used all ${config.maxAnimeEpisodesPerMonth} anime episodes this month.`,
          currentCount: current,
          limit: config.maxAnimeEpisodesPerMonth,
          upgradeTier: tier === "creator" ? "studio" : "studio",
          upgradeBenefit: "Upgrade to Studio for 20 anime episodes per month",
        };
      }
      return { allowed: true, currentCount: current, limit: config.maxAnimeEpisodesPerMonth };
    }

    case "clone_voice": {
      if (config.maxVoiceClones === 0) {
        return {
          allowed: false,
          reason: "Voice cloning requires a Creator or Studio plan.",
          limit: 0,
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator for 2 voice clones",
        };
      }
      const [result] = await db
        .select({ count: count() })
        .from(characters)
        .where(and(eq(characters.userId, userId), sql`${characters.voiceCloneUrl} IS NOT NULL`));
      const current = result?.count || 0;
      if (current >= config.maxVoiceClones) {
        return {
          allowed: false,
          reason: `You've used all ${config.maxVoiceClones} voice clones on the ${config.name} plan.`,
          currentCount: current,
          limit: config.maxVoiceClones,
          upgradeTier: "studio",
          upgradeBenefit: "Upgrade to Studio for unlimited voice clones",
        };
      }
      return { allowed: true, currentCount: current, limit: config.maxVoiceClones };
    }

    case "train_lora": {
      if (config.maxLoraCharacters === 0) {
        return {
          allowed: false,
          reason: "LoRA character training requires a Creator or Studio plan.",
          limit: 0,
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator for 3 LoRA character models",
        };
      }
      const [result] = await db
        .select({ count: count() })
        .from(characters)
        .where(and(eq(characters.userId, userId), sql`${characters.loraModelUrl} IS NOT NULL`));
      const current = result?.count || 0;
      if (current >= config.maxLoraCharacters) {
        return {
          allowed: false,
          reason: `You've used all ${config.maxLoraCharacters} LoRA models on the ${config.name} plan.`,
          currentCount: current,
          limit: config.maxLoraCharacters,
          upgradeTier: "studio",
          upgradeBenefit: "Upgrade to Studio for unlimited LoRA models",
        };
      }
      return { allowed: true, currentCount: current, limit: config.maxLoraCharacters };
    }

    case "export_manga": {
      if (!config.canExportManga) {
        return {
          allowed: false,
          reason: "Manga export requires a Creator or Studio plan.",
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator to download your manga as PDF, PNG, or ZIP",
        };
      }
      return { allowed: true };
    }

    case "export_anime": {
      if (!config.canExportAnime) {
        return {
          allowed: false,
          reason: "Anime export requires a Creator or Studio plan.",
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator to download your anime as MP4",
        };
      }
      return { allowed: true };
    }

    case "set_premium": {
      if (!config.canMonetize) {
        return {
          allowed: false,
          reason: "Monetization requires a Creator or Studio plan.",
          upgradeTier: "creator",
          upgradeBenefit: "Upgrade to Creator to earn revenue from premium content (80/20 split)",
        };
      }
      return { allowed: true };
    }

    case "upload_manga": {
      if (!config.canUploadManga) {
        return {
          allowed: false,
          reason: "Manga upload requires a Studio plan.",
          upgradeTier: "studio",
          upgradeBenefit: "Upgrade to Studio to upload your own manga for anime conversion",
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

// ─── Tier Enforcement Router ──────────────────────────────────────────

export const tierRouter = router({
  // Check if an action is allowed for the current user
  check: protectedProcedure
    .input(z.object({
      action: z.enum([
        "create_project", "create_chapter", "create_panel",
        "generate_anime", "clone_voice", "train_lora",
        "export_manga", "export_anime", "set_premium", "upload_manga",
      ]),
      projectId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return checkTierLimit(ctx.user.id, input.action as ActionType, input.projectId);
    }),

  // Get full tier status for the current user
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const tier = await getUserTier(ctx.user.id);
    const config = TIERS[tier];
    const db = (await getDb())!;

    // Count current usage
    const [projectCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.userId, ctx.user.id));

    const [loraCount] = await db
      .select({ count: count() })
      .from(characters)
      .where(and(eq(characters.userId, ctx.user.id), sql`${characters.loraModelUrl} IS NOT NULL`));

    const [voiceCount] = await db
      .select({ count: count() })
      .from(characters)
      .where(and(eq(characters.userId, ctx.user.id), sql`${characters.voiceCloneUrl} IS NOT NULL`));

    return {
      tier,
      config: {
        name: config.name,
        maxProjects: config.maxProjects,
        maxChaptersPerProject: config.maxChaptersPerProject,
        maxPanelsPerChapter: config.maxPanelsPerChapter,
        maxAnimeEpisodesPerMonth: config.maxAnimeEpisodesPerMonth,
        maxLoraCharacters: config.maxLoraCharacters,
        maxVoiceClones: config.maxVoiceClones,
        scriptModel: config.scriptModel,
        videoResolution: config.videoResolution,
        hasWatermark: config.hasWatermark,
        canUploadManga: config.canUploadManga,
        canMonetize: config.canMonetize,
        canExportManga: config.canExportManga,
        canExportAnime: config.canExportAnime,
        exportFormats: config.exportFormats,
      },
      usage: {
        projects: projectCount?.count || 0,
        loraModels: loraCount?.count || 0,
        voiceClones: voiceCount?.count || 0,
      },
    };
  }),

  // Get tier comparison data (public)
  compare: publicProcedure.query(() => {
    return Object.entries(TIERS).map(([key, config]) => ({
      key: key as TierKey,
      name: config.name,
      monthlyPrice: config.monthlyPrice,
      annualMonthlyPrice: config.annualMonthlyPrice,
      maxProjects: config.maxProjects,
      maxChaptersPerProject: config.maxChaptersPerProject,
      maxAnimeEpisodesPerMonth: config.maxAnimeEpisodesPerMonth,
      maxLoraCharacters: config.maxLoraCharacters,
      maxVoiceClones: config.maxVoiceClones,
      scriptModel: config.scriptModel,
      videoResolution: config.videoResolution,
      hasWatermark: config.hasWatermark,
      canUploadManga: config.canUploadManga,
      canMonetize: config.canMonetize,
      canExportManga: config.canExportManga,
      canExportAnime: config.canExportAnime,
      exportFormats: config.exportFormats,
      hasPriorityQueue: config.hasPriorityQueue,
      hasPrioritySupport: config.hasPrioritySupport,
      hasCustomNarrator: config.hasCustomNarrator,
    }));
  }),
});

// ─── Anime Preview Router ─────────────────────────────────────────────

export const animePreviewRouter = router({
  // Check if user can generate a preview
  canGenerate: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [user] = await db
      .select({ animePreviewUsed: users.animePreviewUsed })
      .from(users)
      .where(eq(users.id, ctx.user.id));

    const tier = await getUserTier(ctx.user.id);
    const hasFullAccess = tier !== "free";

    return {
      canGenerate: !user?.animePreviewUsed && !hasFullAccess,
      hasFullAccess,
      previewUsed: !!user?.animePreviewUsed,
      previewConfig: ANIME_PREVIEW,
    };
  }),

  // Generate anime preview for a project
  generate: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;

      // Check if user already used their preview
      const [user] = await db
        .select({ animePreviewUsed: users.animePreviewUsed })
        .from(users)
        .where(eq(users.id, ctx.user.id));

      const tier = await getUserTier(ctx.user.id);
      if (tier !== "free") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You already have full anime access with your plan.",
        });
      }

      if (user?.animePreviewUsed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You've already used your free anime preview. Upgrade to Creator for full access.",
        });
      }

      // Verify project exists and belongs to user
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // Mark preview as used
      await db
        .update(users)
        .set({ animePreviewUsed: 1 })
        .where(eq(users.id, ctx.user.id));

      // In a real implementation, this would trigger the abbreviated pipeline
      // For now, we return a placeholder that indicates the preview is being generated
      const previewUrl = "generating";
      await db
        .update(projects)
        .set({
          previewVideoUrl: previewUrl,
          previewGeneratedAt: new Date(),
        })
        .where(eq(projects.id, input.projectId));

      return {
        status: "generating",
        message: "Your anime preview is being generated. This typically takes 2-5 minutes.",
        projectId: input.projectId,
      };
    }),

  // Get preview status for a project
  getStatus: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [project] = await db
        .select({
          previewVideoUrl: projects.previewVideoUrl,
          previewGeneratedAt: projects.previewGeneratedAt,
          title: projects.title,
        })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      return {
        hasPreview: !!project.previewVideoUrl && project.previewVideoUrl !== "generating",
        isGenerating: project.previewVideoUrl === "generating",
        previewUrl: project.previewVideoUrl !== "generating" ? project.previewVideoUrl : null,
        generatedAt: project.previewGeneratedAt,
        title: project.title,
      };
    }),
});

// ─── Export Router ────────────────────────────────────────────────────

export const exportRouter = router({
  // Estimate export file sizes
  estimate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      type: z.enum(["manga", "anime"]),
      format: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const db = getDb();

      // Check tier allows export
      const tier = await getUserTier(ctx.user.id);
      const config = TIERS[tier];
      const allowed = input.type === "manga" ? config.canExportManga : config.canExportAnime;

      if (!allowed) {
        return {
          allowed: false,
          upgradeTier: "creator" as TierKey,
          upgradeBenefit: `Upgrade to Creator to export ${input.type}`,
        };
      }

      // Check format is available for tier
      if (!config.exportFormats.includes(input.format)) {
        return {
          allowed: false,
          upgradeTier: "studio" as TierKey,
          upgradeBenefit: `${input.format.toUpperCase()} export requires Studio plan`,
        };
      }

      // Count panels/episodes for size estimation
      const db2 = (await getDb())!;
      const [panelCount] = await db2
        .select({ count: count() })
        .from(panels)
        .where(eq(panels.projectId, input.projectId));

      const [episodeCount] = await db2
        .select({ count: count() })
        .from(episodes)
        .where(eq(episodes.projectId, input.projectId));

      const numPanels = panelCount?.count || 0;
      const numEpisodes = episodeCount?.count || 0;

      let estimatedSizeMB = 0;
      if (input.type === "manga") {
        switch (input.format) {
          case "pdf": estimatedSizeMB = numPanels * 2; break;
          case "png": estimatedSizeMB = numPanels * 5; break;
          case "zip": estimatedSizeMB = numPanels * 5; break;
        }
      } else {
        switch (input.format) {
          case "mp4": estimatedSizeMB = numEpisodes * 150; break;
          case "prores": estimatedSizeMB = numEpisodes * 2000; break;
          case "stems": estimatedSizeMB = numEpisodes * 500; break;
          case "srt": estimatedSizeMB = numEpisodes * 0.01; break;
        }
      }

      return {
        allowed: true,
        format: input.format,
        estimatedSizeMB: Math.round(estimatedSizeMB * 10) / 10,
        estimatedSizeFormatted: estimatedSizeMB >= 1000
          ? `${(estimatedSizeMB / 1000).toFixed(1)} GB`
          : `${Math.round(estimatedSizeMB)} MB`,
        itemCount: input.type === "manga" ? numPanels : numEpisodes,
        expiryHours: 24,
      };
    }),

  // Generate export download URL
  generate: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      type: z.enum(["manga", "anime"]),
      format: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check tier allows export
      const tier = await getUserTier(ctx.user.id);
      const config = TIERS[tier];
      const allowed = input.type === "manga" ? config.canExportManga : config.canExportAnime;

      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.type} export requires a ${tier === "free" ? "Creator" : "Studio"} plan.`,
        });
      }

      if (!config.exportFormats.includes(input.format)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `${input.format.toUpperCase()} format requires a Studio plan.`,
        });
      }

      // Verify project belongs to user
      const db = (await getDb())!;
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.userId, ctx.user.id)));

      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      // In production, this would generate the export and return a presigned URL
      return {
        status: "generating",
        message: `Your ${input.format.toUpperCase()} export is being prepared. You'll receive a notification when it's ready.`,
        estimatedMinutes: input.format === "prores" ? 15 : 5,
      };
    }),
});

// ─── Premium Episodes Router ──────────────────────────────────────────

export const premiumRouter = router({
  // Set episode premium status
  setStatus: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      isPremium: z.enum(["free", "premium", "pay_per_view"]),
      ppvPriceCents: z.number().min(50).max(9999).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Check tier allows monetization
      const check = await checkTierLimit(ctx.user.id, "set_premium");
      if (!check.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: check.reason || "Monetization requires a Creator or Studio plan.",
        });
      }

      const db = (await getDb())!;
      const [episode] = await db
        .select({ id: episodes.id, projectId: episodes.projectId })
        .from(episodes)
        .innerJoin(projects, eq(episodes.projectId, projects.id))
        .where(and(eq(episodes.id, input.episodeId), eq(projects.userId, ctx.user.id)));

      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      if (input.isPremium === "pay_per_view" && !input.ppvPriceCents) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pay-per-view episodes require a price.",
        });
      }

      await db
        .update(episodes)
        .set({
          isPremium: input.isPremium,
          ppvPriceCents: input.isPremium === "pay_per_view" ? input.ppvPriceCents : null,
        })
        .where(eq(episodes.id, input.episodeId));

      return { success: true };
    }),

  // Get premium status for an episode
  getStatus: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      const [episode] = await db
        .select({
          isPremium: episodes.isPremium,
          ppvPriceCents: episodes.ppvPriceCents,
        })
        .from(episodes)
        .where(eq(episodes.id, input.episodeId));

      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      return episode;
    }),
});
