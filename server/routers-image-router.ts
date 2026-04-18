/**
 * Image Router tRPC Procedures — Exposes image generation, cost attribution,
 * budget monitoring, and health status via tRPC.
 *
 * @see Prompt 25, Section 10
 */
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createGenerationJob,
  executeGenerationJob,
  makeRoutingDecision,
  registerImageAdapter,
  getAllImageAdapters,
  scoreProvider,
} from "./image-router/router";
import { WORKLOAD_CONFIGS, type WorkloadType } from "./image-router/types";
import { budgetGovernor } from "./image-router/budget";
import { imageHealthMonitor } from "./image-router/health";
import { getProviderApiKey, getConfiguredProviders, isProviderConfigured, type ImageProvider } from "./image-router/vault";
import { runwareAdapter } from "./image-router/adapters/runware";
import { tensorArtAdapter } from "./image-router/adapters/tensorart";
import { falAdapter } from "./image-router/adapters/fal";
import { getDb } from "./db";
import { generationCosts } from "../drizzle/schema";
import { eq, desc, and, sql, gte } from "drizzle-orm";

// ─── Register Adapters on Import ────────────────────────────────────────

registerImageAdapter(runwareAdapter);
registerImageAdapter(tensorArtAdapter);
registerImageAdapter(falAdapter);

// ─── Workload Type Enum ─────────────────────────────────────────────────

const workloadTypeEnum = z.enum([
  "manga_panel",
  "character_sheet",
  "background_art",
  "cover_art",
  "thumbnail",
  "ui_asset",
]);

// ─── Cost Attribution Helper ────────────────────────────────────────────

async function recordCostAttribution(job: {
  id: string;
  userId: number;
  workloadType: string;
  providerId?: string;
  status: string;
  actualCostUsd?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  attemptCount: number;
  episodeId?: number;
  sceneId?: number;
  chapterId?: number;
  errorCode?: string;
  errorMessage?: string;
  providerMetadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(generationCosts).values({
      jobId: job.id,
      idempotencyKey: `${job.workloadType}:${job.userId}:${job.id}`,
      userId: job.userId,
      workloadType: job.workloadType,
      providerId: job.providerId ?? "unknown",
      status: job.status,
      actualCostUsd: job.actualCostUsd?.toString() ?? "0",
      estimatedCostUsd: job.estimatedCostUsd?.toString() ?? "0",
      latencyMs: job.latencyMs ?? 0,
      attemptCount: job.attemptCount,
      episodeId: job.episodeId ?? null,
      sceneId: job.sceneId ?? null,
      chapterId: job.chapterId ?? null,
      errorCode: job.errorCode ?? null,
      errorMessage: job.errorMessage ?? null,
      providerMetadata: job.providerMetadata ?? null,
    });
  } catch (err) {
    console.error("[ImageRouter] Failed to record cost attribution:", err);
  }
}

// ─── tRPC Router ────────────────────────────────────────────────────────

export const imageRouterTrpc = router({
  /**
   * Generate an image through the multi-surface router.
   * Handles provider selection, fallback, and cost attribution.
   */
  generate: protectedProcedure
    .input(
      z.object({
        workloadType: workloadTypeEnum,
        prompt: z.string().min(1).max(2000),
        negativePrompt: z.string().max(1000).optional(),
        width: z.number().int().min(64).max(2048).default(1024),
        height: z.number().int().min(64).max(2048).default(1024),
        numImages: z.number().int().min(1).max(4).default(1),
        guidanceScale: z.number().min(1).max(30).optional(),
        seed: z.number().int().optional(),
        controlNetModel: z.string().optional(),
        controlNetImageUrl: z.string().url().optional(),
        controlNetStrength: z.number().min(0).max(1).optional(),
        loraModelUrl: z.string().optional(),
        loraWeight: z.number().min(0).max(1).optional(),
        episodeId: z.number().int().optional(),
        sceneId: z.number().int().optional(),
        chapterId: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const job = createGenerationJob(
        input.workloadType as WorkloadType,
        {
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          width: input.width,
          height: input.height,
          numImages: input.numImages,
          guidanceScale: input.guidanceScale,
          seed: input.seed,
          controlNetModel: input.controlNetModel,
          controlNetImageUrl: input.controlNetImageUrl,
          controlNetStrength: input.controlNetStrength,
          loraModelUrl: input.loraModelUrl,
          loraWeight: input.loraWeight,
        },
        ctx.user.id,
        {
          episodeId: input.episodeId,
          sceneId: input.sceneId,
          chapterId: input.chapterId,
        },
      );

      const completedJob = await executeGenerationJob(job, {
        healthMonitor: imageHealthMonitor,
        budgetGovernor: budgetGovernor,
        timeoutMs: 90_000,
      });

      // Record cost attribution
      await recordCostAttribution(completedJob);

      if (completedJob.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: completedJob.errorMessage ?? "Image generation failed",
        });
      }

      return {
        jobId: completedJob.id,
        imageUrl: completedJob.resultUrl!,
        mimeType: completedJob.resultMimeType ?? "image/png",
        provider: completedJob.providerId,
        costUsd: completedJob.actualCostUsd,
        latencyMs: completedJob.latencyMs,
        attempts: completedJob.attemptCount,
      };
    }),

  /**
   * Preview routing decision without executing generation.
   * Useful for cost estimation and provider selection preview.
   */
  previewRoute: protectedProcedure
    .input(
      z.object({
        workloadType: workloadTypeEnum,
        prompt: z.string().min(1),
        width: z.number().int().min(64).max(2048).default(1024),
        height: z.number().int().min(64).max(2048).default(1024),
        numImages: z.number().int().min(1).max(4).default(1),
        controlNetModel: z.string().optional(),
        loraModelUrl: z.string().optional(),
      }),
    )
    .query(({ input }) => {
      const decision = makeRoutingDecision(
        input.workloadType as WorkloadType,
        {
          prompt: input.prompt,
          width: input.width,
          height: input.height,
          numImages: input.numImages,
          controlNetModel: input.controlNetModel,
          loraModelUrl: input.loraModelUrl,
        },
        imageHealthMonitor.getAllStatuses(),
      );

      return decision;
    }),

  /**
   * Get provider health status for all registered providers.
   */
  health: protectedProcedure.query(() => {
    const adapters = getAllImageAdapters();
    return adapters.map((adapter) => ({
      ...imageHealthMonitor.getStatus(adapter.providerId),
      displayName: adapter.displayName,
      configured: isProviderConfigured(adapter.providerId as ImageProvider),
    }));
  }),

  /**
   * Get budget summary for all providers.
   */
  budget: protectedProcedure.query(() => {
    return {
      summary: budgetGovernor.getBudgetSummary(),
      alerts: budgetGovernor.getAlerts(),
    };
  }),

  /**
   * Get cost history for the current user.
   */
  costHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        workloadType: workloadTypeEnum.optional(),
        episodeId: z.number().int().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(generationCosts.userId, ctx.user.id)];

      if (input.workloadType) {
        conditions.push(eq(generationCosts.workloadType, input.workloadType));
      }
      if (input.episodeId) {
        conditions.push(eq(generationCosts.episodeId, input.episodeId));
      }

      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(generationCosts)
        .where(and(...conditions))
        .orderBy(desc(generationCosts.createdAt))
        .limit(input.limit);

      return rows.map((r: any) => ({
        jobId: r.jobId,
        workloadType: r.workloadType,
        providerId: r.providerId,
        status: r.status,
        actualCostUsd: parseFloat(r.actualCostUsd ?? "0"),
        estimatedCostUsd: parseFloat(r.estimatedCostUsd ?? "0"),
        latencyMs: r.latencyMs,
        attemptCount: r.attemptCount,
        episodeId: r.episodeId,
        chapterId: r.chapterId,
        errorCode: r.errorCode,
        createdAt: r.createdAt,
      }));
    }),

  /**
   * Get aggregated cost stats per provider for the current month.
   */
  costStats: protectedProcedure.query(async ({ ctx }) => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        providerId: generationCosts.providerId,
        workloadType: generationCosts.workloadType,
        totalCost: sql<string>`COALESCE(SUM(CAST(${generationCosts.actualCostUsd} AS DECIMAL(10,4))), 0)`,
        totalJobs: sql<number>`COUNT(*)`,
        successCount: sql<number>`SUM(CASE WHEN ${generationCosts.status} = 'succeeded' THEN 1 ELSE 0 END)`,
        failCount: sql<number>`SUM(CASE WHEN ${generationCosts.status} = 'failed' THEN 1 ELSE 0 END)`,
        avgLatencyMs: sql<number>`AVG(${generationCosts.latencyMs})`,
      })
      .from(generationCosts)
      .where(
        and(
          eq(generationCosts.userId, ctx.user.id),
          gte(generationCosts.createdAt, monthStart),
        ),
      )
      .groupBy(generationCosts.providerId, generationCosts.workloadType);

    return rows.map((r: any) => ({
      providerId: r.providerId,
      workloadType: r.workloadType,
      totalCostUsd: parseFloat(r.totalCost),
      totalJobs: Number(r.totalJobs),
      successCount: Number(r.successCount),
      failCount: Number(r.failCount),
      avgLatencyMs: Math.round(Number(r.avgLatencyMs) || 0),
    }));
  }),

  /**
   * Get workload configuration (for UI display).
   */
  workloadConfigs: publicProcedure.query(() => {
    return Object.entries(WORKLOAD_CONFIGS).map(([key, config]) => ({
      workloadType: key,
      ...config,
    }));
  }),

  /**
   * Get list of configured providers (for admin/debug).
   */
  providers: protectedProcedure.query(() => {
    const adapters = getAllImageAdapters();
    return adapters.map((adapter) => ({
      providerId: adapter.providerId,
      displayName: adapter.displayName,
      configured: isProviderConfigured(adapter.providerId as ImageProvider),
      supportsControlNet: adapter.supportsControlNet(),
      supportsLoRA: adapter.supportsLoRA(),
      supportedWorkloads: (
        ["manga_panel", "character_sheet", "background_art", "cover_art", "thumbnail", "ui_asset"] as WorkloadType[]
      ).filter((w) => adapter.supportsWorkload(w)),
    }));
  }),
});
