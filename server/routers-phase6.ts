import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getStripe } from "./stripe/client";
import { TIERS, CREDIT_COSTS, getTierFeatureList, normalizeTier, type TierKey } from "./stripe/products";
import {
  getSubscriptionByUserId, upsertSubscription,
  createUsageRecord, getUsageRecordsByUser, getMonthlyUsageSummary,
  createTip, getTipsByCreator, getCreatorEarnings,
  createModerationItem, getModerationQueue, updateModerationItem,
  getAdminMetrics, getAdminUserList, getAllSubscriptions,
} from "./db-phase6";
import { getPlatformConfig, getPlatformConfigMulti, setPlatformConfig } from "./db";
import { DEMO_CONFIG_KEYS } from "../shared/demo-scenario";
import { generateAllDemoAssets } from "./demo-assets";
import * as cfStream from "./cloudflare-stream";

// ─── Billing Router ────────────────────────────────────────────────────

export const billingRouter = router({
  // Get current user's subscription
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getSubscriptionByUserId(ctx.user.id);
    if (!sub) {
      return {
        tier: "free" as TierKey,
        status: "active",
        limits: TIERS.free,
        features: getTierFeatureList("free"),
      };
    }
    return {
      ...sub,
      limits: TIERS[sub.tier as TierKey] || TIERS.free,
      features: getTierFeatureList(sub.tier as TierKey || "free"),
    };
  }),

  // Get tier info (public)
  getTiers: publicProcedure.query(() => {
    return Object.entries(TIERS).map(([key, config]) => ({
      key: key as TierKey,
      ...config,
      features: getTierFeatureList(key as TierKey),
    }));
  }),

  // Create checkout session
  createCheckout: protectedProcedure
    .input(z.object({
      tier: z.enum(["creator", "studio"]),
      interval: z.enum(["monthly", "annual"]).default("monthly"),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripe = getStripe();
      const tierConfig = TIERS[normalizeTier(input.tier)];
      const priceInCents = input.interval === "annual" ? tierConfig.annualPrice : tierConfig.monthlyPrice;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        allow_promotion_codes: true,
        client_reference_id: ctx.user.id.toString(),
        customer_email: ctx.user.email || undefined,
        metadata: {
          user_id: ctx.user.id.toString(),
          tier: input.tier,
          customer_name: ctx.user.name || "",
          customer_email: ctx.user.email || "",
        },
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Awakli ${tierConfig.name}`,
              description: `${tierConfig.name} plan - ${input.interval}`,
            },
            unit_amount: input.interval === "annual"
              ? Math.round(tierConfig.annualPrice / 12)
              : tierConfig.monthlyPrice,
            recurring: {
              interval: input.interval === "annual" ? "year" : "month",
            },
          },
          quantity: 1,
        }],
        success_url: `${ctx.req.headers.origin}/studio?checkout=success`,
        cancel_url: `${ctx.req.headers.origin}/pricing?checkout=canceled`,
      });

      return { url: session.url };
    }),

  // Create billing portal session
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const sub = await getSubscriptionByUserId(ctx.user.id);
    if (!sub?.stripeCustomerId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription found" });
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${ctx.req.headers.origin}/studio`,
    });
    return { url: session.url };
  }),
});

// ─── Usage Router ──────────────────────────────────────────────────────

export const usageRouter = router({
  // Get current month usage summary
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const summary = await getMonthlyUsageSummary(ctx.user.id);
    const sub = await getSubscriptionByUserId(ctx.user.id);
    const tier = (sub?.tier || "free") as TierKey;
    const allocation = TIERS[tier].credits;

    return {
      ...summary,
      allocation,
      tier,
      remaining: Math.max(0, allocation - summary.total),
      percentUsed: allocation > 0 ? Math.min(100, (summary.total / allocation) * 100) : 0,
    };
  }),

  // Get usage history
  getHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const records = await getUsageRecordsByUser(ctx.user.id);
      return records.slice(0, input?.limit || 50);
    }),

  // Record usage (internal, called by other procedures)
  record: protectedProcedure
    .input(z.object({
      actionType: z.enum(["script", "panel", "video", "voice", "lora_train"]),
      projectId: z.number().optional(),
      episodeId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const credits = CREDIT_COSTS[input.actionType] || 0;

      // Check tier limits
      const sub = await getSubscriptionByUserId(ctx.user.id);
      const tier = (sub?.tier || "free") as TierKey;
      const summary = await getMonthlyUsageSummary(ctx.user.id);
      const allocation = TIERS[tier].credits;

      if (summary.total + credits > allocation && tier === "free") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Monthly credit limit reached (${allocation} credits). Upgrade to Pro for more.`,
        });
      }

      return createUsageRecord({
        userId: ctx.user.id,
        actionType: input.actionType,
        creditsUsed: credits,
        projectId: input.projectId || null,
        episodeId: input.episodeId || null,
      });
    }),
});

// ─── Creator Marketplace Router ────────────────────────────────────────

export const marketplaceRouter = router({
  // Send a tip
  sendTip: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      toUserId: z.number(),
      amountCents: z.number().min(100).max(50000),
    }))
    .mutation(async ({ ctx, input }) => {
      const creatorShare = Math.round(input.amountCents * 0.8);
      const platformShare = input.amountCents - creatorShare;

      const tipId = await createTip({
        fromUserId: ctx.user.id,
        toUserId: input.toUserId,
        episodeId: input.episodeId,
        amountCents: input.amountCents,
        creatorShareCents: creatorShare,
        platformShareCents: platformShare,
        status: "completed",
      });

      return { tipId, creatorShare, platformShare };
    }),

  // Get creator earnings
  getEarnings: protectedProcedure.query(async ({ ctx }) => {
    return getCreatorEarnings(ctx.user.id);
  }),

  // Get tips received
  getTips: protectedProcedure.query(async ({ ctx }) => {
    return getTipsByCreator(ctx.user.id);
  }),
});

// ─── Admin Router ──────────────────────────────────────────────────────

export const adminRouter = router({
  // Get admin metrics
  getMetrics: adminProcedure.query(async () => {
    return getAdminMetrics();
  }),

  // Get user list
  getUsers: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }).optional())
    .query(async ({ input }) => {
      return getAdminUserList(input?.page || 1, input?.limit || 20);
    }),

  // Get all subscriptions
  getSubscriptions: adminProcedure.query(async () => {
    return getAllSubscriptions();
  }),

  // Get moderation queue
  getModerationQueue: adminProcedure
    .input(z.object({
      status: z.enum(["pending", "approved", "removed", "dismissed"]).default("pending"),
    }).optional())
    .query(async ({ input }) => {
      return getModerationQueue(input?.status || "pending");
    }),

  // Review moderation item
  reviewModeration: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["approved", "removed", "dismissed"]),
    }))
    .mutation(async ({ ctx, input }) => {
      await updateModerationItem(input.id, {
        status: input.status,
        reviewedBy: ctx.user.id,
      });
      return { success: true };
    }),

  // Update user role
  updateUserRole: adminProcedure
    .input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin"]),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const { users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { success: true };
    }),

  // Get demo video configuration
  getDemoConfig: adminProcedure.query(async () => {
    const keys = Object.values(DEMO_CONFIG_KEYS);
    const config = await getPlatformConfigMulti(keys);
    return {
      panelUrls: config[DEMO_CONFIG_KEYS.PANEL_URLS] ? JSON.parse(config[DEMO_CONFIG_KEYS.PANEL_URLS]) as string[] : [],
      characterUrls: config[DEMO_CONFIG_KEYS.CHARACTER_URLS] ? JSON.parse(config[DEMO_CONFIG_KEYS.CHARACTER_URLS]) as Record<string, string> : {},
      scriptText: config["demo_script_text"] || "",
      fallbackUrls: config[DEMO_CONFIG_KEYS.FALLBACK_URLS] ? JSON.parse(config[DEMO_CONFIG_KEYS.FALLBACK_URLS]) as string[] : [],
      streamId: config[DEMO_CONFIG_KEYS.STREAM_ID] || null,
      posterUrl: config[DEMO_CONFIG_KEYS.POSTER_URL] || null,
      updatedAt: config[DEMO_CONFIG_KEYS.UPDATED_AT] || null,
      status: config[DEMO_CONFIG_KEYS.STATUS] || "not_started",
    };
  }),

  // Regenerate demo assets
  regenerateDemo: adminProcedure.mutation(async () => {
    // Run in background (don't await)
    generateAllDemoAssets().catch((err) => {
      console.error("[Demo] Asset generation failed:", err);
      setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "failed").catch(() => {});
    });
    return { success: true, message: "Demo asset generation started. Check status via getDemoConfig." };
  }),

  // Upload a video to Cloudflare Stream from a public URL
  uploadDemoVideo: adminProcedure
    .input(z.object({
      videoUrl: z.string().url(),
      waitForReady: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "uploading_stream");

      try {
        if (input.waitForReady) {
          // Upload and wait until ready (may take a few minutes)
          const result = await cfStream.uploadAndWait(input.videoUrl, { name: "awakli-demo" }, { timeoutMs: 10 * 60 * 1000 });
          await setPlatformConfig(DEMO_CONFIG_KEYS.STREAM_ID, result.uid);
          await setPlatformConfig("demo_video_embed_url", result.embedUrl);
          await setPlatformConfig(DEMO_CONFIG_KEYS.POSTER_URL, result.thumbnailUrl);
          await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "stream_ready");
          await setPlatformConfig(DEMO_CONFIG_KEYS.UPDATED_AT, new Date().toISOString());
          return { success: true, uid: result.uid, embedUrl: result.embedUrl, thumbnailUrl: result.thumbnailUrl };
        } else {
          // Upload and return immediately (poll separately)
          const uploaded = await cfStream.uploadFromUrl(input.videoUrl, { name: "awakli-demo" });
          await setPlatformConfig(DEMO_CONFIG_KEYS.STREAM_ID, uploaded.uid);
          await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "stream_processing");
          await setPlatformConfig(DEMO_CONFIG_KEYS.UPDATED_AT, new Date().toISOString());
          return { success: true, uid: uploaded.uid, status: uploaded.status.state };
        }
      } catch (err: any) {
        console.error("[Admin] Demo video upload failed:", err);
        await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "stream_failed");
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message || "Stream upload failed" });
      }
    }),

  // Check the processing status of a Cloudflare Stream video
  checkStreamStatus: adminProcedure
    .input(z.object({ uid: z.string().optional() }))
    .query(async ({ input }) => {
      const uid = input.uid || await getPlatformConfig(DEMO_CONFIG_KEYS.STREAM_ID);
      if (!uid) return { ready: false, status: "no_video", uid: null };

      try {
        const video = await cfStream.getVideoStatus(uid);
        // If newly ready, update platform config with embed/poster URLs
        if (video.readyToStream) {
          const embedUrl = cfStream.getEmbedUrl(video);
          const thumbnailUrl = cfStream.getThumbnailUrl(video);
          await setPlatformConfig("demo_video_embed_url", embedUrl);
          await setPlatformConfig(DEMO_CONFIG_KEYS.POSTER_URL, thumbnailUrl);
          await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "stream_ready");
        }
        return {
          ready: video.readyToStream,
          status: video.status.state,
          uid: video.uid,
          pctComplete: video.status.pctComplete || null,
          duration: video.duration || null,
          embedUrl: video.readyToStream ? cfStream.getEmbedUrl(video) : null,
          thumbnailUrl: video.thumbnail || null,
        };
      } catch (err: any) {
        return { ready: false, status: "error", uid, error: err.message };
      }
    }),

  // List all videos in Cloudflare Stream account
  listStreamVideos: adminProcedure.query(async () => {
    try {
      const videos = await cfStream.listVideos({ perPage: 20 });
      return videos.map((v) => ({
        uid: v.uid,
        name: v.meta?.name || "Untitled",
        ready: v.readyToStream,
        status: v.status.state,
        duration: v.duration || null,
        created: v.created,
        thumbnail: v.thumbnail,
      }));
    } catch (err: any) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message || "Failed to list videos" });
    }
  }),

  // Delete a video from Cloudflare Stream
  deleteStreamVideo: adminProcedure
    .input(z.object({ uid: z.string() }))
    .mutation(async ({ input }) => {
      try {
        await cfStream.deleteVideo(input.uid);
        // If this was the demo video, clear the config
        const currentStreamId = await getPlatformConfig(DEMO_CONFIG_KEYS.STREAM_ID);
        if (currentStreamId === input.uid) {
          await setPlatformConfig(DEMO_CONFIG_KEYS.STREAM_ID, "");
          await setPlatformConfig("demo_video_embed_url", "");
          await setPlatformConfig(DEMO_CONFIG_KEYS.POSTER_URL, "");
          await setPlatformConfig(DEMO_CONFIG_KEYS.STATUS, "assets_ready");
        }
        return { success: true };
      } catch (err: any) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message || "Failed to delete video" });
      }
    }),
});

// ─── Report Content ────────────────────────────────────────────────────

export const reportRouter = router({
  create: protectedProcedure
    .input(z.object({
      contentType: z.enum(["project", "episode", "comment", "panel"]),
      contentId: z.number(),
      reason: z.string().min(1).max(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      return createModerationItem({
        contentType: input.contentType,
        contentId: input.contentId,
        reportedBy: ctx.user.id,
        reason: input.reason,
      });
    }),
});
