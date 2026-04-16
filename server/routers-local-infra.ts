/**
 * Local Infrastructure Admin Router — tRPC endpoints for GPU monitoring,
 * model artifacts, endpoint management, and cost analytics.
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";

// Admin guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  return next({ ctx });
});

export const localInfraRouter = router({
  // ─── Dashboard Overview ───────────────────────────────────────────────
  /**
   * Get a comprehensive overview of local GPU infrastructure.
   * Combines endpoint status, cost summary, and alerts.
   */
  overview: adminProcedure.query(async () => {
    const {
      getLastMonitorReport,
      isMonitorRunning,
      listEndpoints,
      listArtifacts,
      getGpuCostSummary24h,
      getTotalGpuSpend,
    } = await import("./provider-router/local-infra");

    const [endpoints, artifacts, costByModel, costTotal, costWeekly] = await Promise.all([
      listEndpoints(),
      listArtifacts(),
      getGpuCostSummary24h(),
      getTotalGpuSpend(1),
      getTotalGpuSpend(7),
    ]);

    const lastReport = getLastMonitorReport();

    return {
      monitorRunning: isMonitorRunning(),
      lastCheckAt: lastReport?.timestamp ?? null,
      alerts: lastReport?.alerts ?? [],
      endpoints: endpoints.map(ep => ({
        id: ep.id,
        providerId: ep.providerId,
        platform: ep.platform,
        endpointId: ep.endpointId,
        gpuType: ep.gpuType,
        status: ep.status,
        warmWorkers: ep.warmWorkers,
        queueDepth: ep.queueDepth,
        scalingConfig: ep.scalingConfig,
      })),
      artifacts: artifacts.map(a => ({
        id: a.id,
        modelName: a.modelName,
        version: a.version,
        sizeBytes: a.sizeBytes,
        isActive: a.isActive,
      })),
      costByModel,
      cost24h: costTotal,
      cost7d: costWeekly,
      versionDrift: lastReport?.versionDrift ?? [],
    };
  }),

  // ─── Endpoints ────────────────────────────────────────────────────────
  /**
   * List all local endpoints with their current status.
   */
  listEndpoints: adminProcedure.query(async () => {
    const { listEndpoints } = await import("./provider-router/local-infra");
    return listEndpoints();
  }),

  /**
   * Update endpoint status (e.g., drain or disable).
   */
  updateEndpointStatus: adminProcedure
    .input(z.object({
      endpointDbId: z.number(),
      status: z.enum(["active", "draining", "disabled"]),
    }))
    .mutation(async ({ input }) => {
      const { updateEndpointMetrics } = await import("./provider-router/local-infra");
      await updateEndpointMetrics(input.endpointDbId, { status: input.status });
      return { success: true };
    }),

  // ─── Model Artifacts ──────────────────────────────────────────────────
  /**
   * List all model artifacts, optionally filtered by model name.
   */
  listArtifacts: adminProcedure
    .input(z.object({ modelName: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const { listArtifacts } = await import("./provider-router/local-infra");
      return listArtifacts(input?.modelName);
    }),

  /**
   * Activate a specific artifact version for a model.
   */
  activateArtifact: adminProcedure
    .input(z.object({
      modelName: z.string(),
      version: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { activateArtifactVersion } = await import("./provider-router/local-infra");
      const success = await activateArtifactVersion(input.modelName, input.version);
      if (!success) throw new TRPCError({ code: "NOT_FOUND", message: "Artifact version not found" });
      return { success: true };
    }),

  // ─── GPU Cost Analytics ───────────────────────────────────────────────
  /**
   * Get GPU cost summary for the last 24 hours, grouped by model.
   */
  costSummary24h: adminProcedure.query(async () => {
    const { getGpuCostSummary24h } = await import("./provider-router/local-infra");
    return getGpuCostSummary24h();
  }),

  /**
   * Get total GPU spend for a given number of days.
   */
  totalSpend: adminProcedure
    .input(z.object({ days: z.number().min(1).max(90).default(1) }))
    .query(async ({ input }) => {
      const { getTotalGpuSpend } = await import("./provider-router/local-infra");
      return getTotalGpuSpend(input.days);
    }),

  /**
   * Compare local vs API costs for each model.
   */
  costComparison: adminProcedure.query(async () => {
    const { LOCAL_MODEL_SPECS, estimateLocalProviderCost } = await import("./provider-router/local-infra");
    const { LOCAL_FALLBACK_MAP } = await import("./provider-router/local-infra/fallback-map");
    const { estimateCost } = await import("./provider-router/cost-estimator");

    const comparisons = Object.entries(LOCAL_MODEL_SPECS).map(([providerId, spec]) => {
      // Estimate local cost for a typical operation
      const typicalParams: Record<string, unknown> = {};
      if (providerId === "local_animatediff") {
        typicalParams.durationSeconds = 3;
        typicalParams.resolution = "512p";
        typicalParams.prompt = "test";
      } else if (providerId === "local_svd") {
        typicalParams.durationSeconds = 4;
        typicalParams.imageUrl = "test";
        typicalParams.prompt = "";
      } else if (providerId === "local_rife") {
        typicalParams.frameCount = 24;
        typicalParams.upscaleFactor = 3;
        typicalParams.prompt = "";
        typicalParams.imageUrl = "test";
      } else if (providerId === "local_controlnet") {
        typicalParams.width = 1024;
        typicalParams.height = 1024;
        typicalParams.prompt = "test";
        typicalParams.imageUrl = "test";
      } else if (providerId === "local_ip_adapter") {
        typicalParams.numReferenceImages = 1;
        typicalParams.prompt = "test";
        typicalParams.imageUrl = "test";
      } else if (providerId === "local_realesrgan") {
        typicalParams.width = 512;
        typicalParams.height = 512;
        typicalParams.upscaleFactor = 4;
        typicalParams.prompt = "";
        typicalParams.imageUrl = "test";
      }

      const localCost = estimateLocalProviderCost(providerId, typicalParams);
      const fallbackChain = LOCAL_FALLBACK_MAP[providerId];
      const primaryFallback = fallbackChain?.fallbacks[0]?.providerId;

      let apiFallbackCostUsd: number | null = null;
      if (primaryFallback) {
        try {
          const apiCost = estimateCost(primaryFallback, typicalParams as any);
          apiFallbackCostUsd = apiCost.estimatedUsd;
        } catch {
          // Fallback provider may not have a cost estimator
        }
      }

      return {
        providerId,
        modelName: spec.modelName,
        gpuType: spec.defaultGpuType,
        localCostUsd: localCost.marginCostUsd,
        localCostCredits: localCost.costCredits,
        estimatedGpuSeconds: localCost.estimatedGpuSeconds,
        primaryFallback: primaryFallback ?? null,
        apiFallbackCostUsd,
        savingsPercent: apiFallbackCostUsd && apiFallbackCostUsd > 0
          ? Math.round(((apiFallbackCostUsd - localCost.marginCostUsd) / apiFallbackCostUsd) * 10000) / 100
          : null,
      };
    });

    return comparisons;
  }),

  // ─── Version Drift ────────────────────────────────────────────────────
  /**
   * Check for model version drift across all endpoints.
   */
  checkDrift: adminProcedure.query(async () => {
    const { checkVersionDrift } = await import("./provider-router/local-infra");
    return checkVersionDrift();
  }),

  // ─── Monitor Control ──────────────────────────────────────────────────
  /**
   * Get the last monitor report.
   */
  lastReport: adminProcedure.query(async () => {
    const { getLastMonitorReport, isMonitorRunning } = await import("./provider-router/local-infra");
    return {
      running: isMonitorRunning(),
      report: getLastMonitorReport(),
    };
  }),

  /**
   * Trigger a manual monitor cycle.
   */
  triggerMonitor: adminProcedure.mutation(async () => {
    const { runMonitorCycle } = await import("./provider-router/local-infra");
    const report = await runMonitorCycle();
    return report;
  }),

  // ─── Seed Data ────────────────────────────────────────────────────────
  /**
   * Seed local providers and model artifacts (idempotent).
   */
  seedData: adminProcedure.mutation(async () => {
    const { seedLocalProviders, seedModelArtifacts } = await import("./provider-router/local-infra");
    const [providerResult, artifactResult] = await Promise.all([
      seedLocalProviders(),
      seedModelArtifacts(),
    ]);
    return {
      providers: providerResult,
      artifacts: artifactResult,
    };
  }),

  // ─── Fallback Map ────────────────────────────────────────────────────
  /**
   * Get the fallback mapping for all local providers.
   */
  fallbackMap: adminProcedure.query(async () => {
    const { LOCAL_FALLBACK_MAP } = await import("./provider-router/local-infra/fallback-map");
    return Object.values(LOCAL_FALLBACK_MAP);
  }),
});
