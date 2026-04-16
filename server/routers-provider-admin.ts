/**
 * Provider Admin Router — tRPC endpoints for managing providers, API keys,
 * circuit breakers, health, and the global provider dashboard.
 * Prompt 16: Multi-Provider API Router
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "./_core/trpc";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import {
  providers, providerApiKeys, providerHealth, generationRequests,
  providerEvents, providerRateLimits, providerSpend24h, creatorProviderMix7d,
} from "../drizzle/schema";

// Admin guard
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
  return next({ ctx });
});

export const providerAdminRouter = router({
  // ─── Provider List ──────────────────────────────────────────────────
  listProviders: adminProcedure
    .input(z.object({
      modality: z.enum(["video", "voice", "music", "image"]).optional(),
      status: z.enum(["active", "disabled", "deprecated"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let query = db.select().from(providers);
      const conditions = [];
      if (input?.modality) conditions.push(eq(providers.modality, input.modality));
      if (input?.status) conditions.push(eq(providers.status, input.status));
      if (conditions.length) query = query.where(and(...conditions)) as typeof query;

      const rows = await query.orderBy(providers.modality, providers.tier);

      // Attach health data
      const healthRows = await db.select().from(providerHealth);
      const healthMap = new Map(healthRows.map(h => [h.providerId, h]));

      return rows.map(p => ({
        ...p,
        capabilities: typeof p.capabilities === "string" ? JSON.parse(p.capabilities) : p.capabilities,
        pricing: typeof p.pricing === "string" ? JSON.parse(p.pricing) : p.pricing,
        health: healthMap.get(p.id) ?? null,
      }));
    }),

  // ─── Provider Detail ────────────────────────────────────────────────
  getProvider: adminProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [provider] = await db.select().from(providers).where(eq(providers.id, input.providerId));
      if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });

      const [health] = await db.select().from(providerHealth).where(eq(providerHealth.providerId, input.providerId));
      const keys = await db.select({
        id: providerApiKeys.id,
        keyLabel: providerApiKeys.keyLabel,
        isActive: providerApiKeys.isActive,
        rateLimitRpm: providerApiKeys.rateLimitRpm,
        dailySpendCapUsd: providerApiKeys.dailySpendCapUsd,
        createdAt: providerApiKeys.createdAt,
      }).from(providerApiKeys).where(eq(providerApiKeys.providerId, input.providerId));

      const [rateLimit] = await db.select().from(providerRateLimits).where(eq(providerRateLimits.providerId, input.providerId));

      // Recent events
      const events = await db.select().from(providerEvents)
        .where(eq(providerEvents.providerId, input.providerId))
        .orderBy(desc(providerEvents.createdAt))
        .limit(50);

      // Recent requests (last 24h)
      const oneDayAgo = new Date(Date.now() - 86_400_000);
      const recentRequests = await db.select({
      total: sql<number>`COUNT(*)`,
      succeeded: sql<number>`SUM(CASE WHEN ${generationRequests.status} = 'succeeded' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN ${generationRequests.status} = 'failed' THEN 1 ELSE 0 END)`,
      avgLatency: sql<number>`AVG(${generationRequests.latencyMs})`,
      totalCostUsd: sql<number>`SUM(${generationRequests.actualCostUsd})`,
    }).from(generationRequests)
      .where(and(
        eq(generationRequests.providerId, input.providerId),
        gte(generationRequests.createdAt, oneDayAgo),
      ));

      return {
        ...provider,
        capabilities: typeof provider.capabilities === "string" ? JSON.parse(provider.capabilities) : provider.capabilities,
        pricing: typeof provider.pricing === "string" ? JSON.parse(provider.pricing) : provider.pricing,
        health: health ?? null,
        apiKeys: keys,
        rateLimit: rateLimit ?? null,
        events,
        stats24h: recentRequests[0] ?? { total: 0, succeeded: 0, failed: 0, avgLatency: 0, totalCostUsd: 0 },
      };
    }),

  // ─── Toggle Provider Status ─────────────────────────────────────────
  toggleProvider: adminProcedure
    .input(z.object({
      providerId: z.string(),
      status: z.enum(["active", "disabled", "deprecated"]),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(providers).set({ status: input.status }).where(eq(providers.id, input.providerId));
      return { success: true };
    }),

  // ─── Reset Circuit Breaker ──────────────────────────────────────────
  resetCircuitBreaker: adminProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(providerHealth).set({
        circuitState: "closed",
        consecutiveFailures: 0,
        lastFailureAt: null,
      }).where(eq(providerHealth.providerId, input.providerId));

      // Log event
      await db.insert(providerEvents).values({
        providerId: input.providerId,
        eventType: "admin_override",
        severity: "info",
        detail: { message: "Circuit breaker manually reset by admin", action: "reset_circuit" },
      });
      return { success: true };
    }),

  // ─── Add API Key ────────────────────────────────────────────────────
  addApiKey: adminProcedure
    .input(z.object({
      providerId: z.string(),
      label: z.string().min(1),
      encryptedKey: z.string().min(1),
      rateLimitRpm: z.number().min(1).default(60),
      dailySpendCapUsd: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(providerApiKeys).values({
        providerId: input.providerId,
        keyLabel: input.label,
        encryptedKey: input.encryptedKey,
        rateLimitRpm: input.rateLimitRpm,
        dailySpendCapUsd: input.dailySpendCapUsd ? String(input.dailySpendCapUsd) : null,
        isActive: 1,
      });
      return { success: true };
    }),

  // ─── Toggle API Key ─────────────────────────────────────────────────
  toggleApiKey: adminProcedure
    .input(z.object({ keyId: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(providerApiKeys).set({ isActive: input.isActive ? 1 : 0 }).where(eq(providerApiKeys.id, input.keyId));
      return { success: true };
    }),

  // ─── Global Dashboard ───────────────────────────────────────────────
  getDashboard: adminProcedure.query(async () => {
    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Provider counts by status
    const statusCounts = await db.select({
      status: providers.status,
      count: sql<number>`COUNT(*)`,
    }).from(providers).groupBy(providers.status);

    // Health overview
    const healthOverview = await db.select({
      circuitState: providerHealth.circuitState,
      count: sql<number>`COUNT(*)`,
    }).from(providerHealth).groupBy(providerHealth.circuitState);

    // 24h spend summary
    const spendSummary = await db.select({
      providerId: providerSpend24h.providerId,
      requests: providerSpend24h.requests,
      spendUsd: providerSpend24h.spendUsd,
      avgLatencyMs: providerSpend24h.avgLatencyMs,
      successRate: providerSpend24h.successRate,
    }).from(providerSpend24h);

    // Top 10 spenders (24h)
    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const topSpenders = await db.select({
      providerId: generationRequests.providerId,
      totalCost: sql<number>`SUM(${generationRequests.actualCostUsd})`,
      requestCount: sql<number>`COUNT(*)`,
      avgLatency: sql<number>`AVG(${generationRequests.latencyMs})`,
    }).from(generationRequests)
      .where(gte(generationRequests.createdAt, oneDayAgo))
      .groupBy(generationRequests.providerId)
      .orderBy(desc(sql`SUM(${generationRequests.actualCostUsd})`))
      .limit(10);

    // Recent critical events
    const criticalEvents = await db.select().from(providerEvents)
      .where(eq(providerEvents.severity, "critical"))
      .orderBy(desc(providerEvents.createdAt))
      .limit(20);

    // Modality breakdown
    const modalityBreakdown = await db.select({
      modality: providers.modality,
      count: sql<number>`COUNT(*)`,
    }).from(providers).where(eq(providers.status, "active")).groupBy(providers.modality);

    return {
      statusCounts: Object.fromEntries(statusCounts.map(s => [s.status, s.count])),
      healthOverview: Object.fromEntries(healthOverview.map(h => [h.circuitState, h.count])),
      spendSummary,
      topSpenders,
      criticalEvents,
      modalityBreakdown: Object.fromEntries(modalityBreakdown.map(m => [m.modality, m.count])),
    };
  }),

  // ─── Request History ────────────────────────────────────────────────
  getRequestHistory: adminProcedure
    .input(z.object({
      providerId: z.string().optional(),
      status: z.enum(["pending", "succeeded", "failed"]).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const conditions = [];
      if (input?.providerId) conditions.push(eq(generationRequests.providerId, input.providerId));
      if (input?.status) conditions.push(eq(generationRequests.status, input.status));

      let query = db.select().from(generationRequests);
      if (conditions.length) query = query.where(and(...conditions)) as typeof query;

      const rows = await query
        .orderBy(desc(generationRequests.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      return { requests: rows, page, limit };
    }),

  // ─── Creator Provider Mix ──────────────────────────────────────────
  getCreatorMix: adminProcedure
    .input(z.object({ userId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let query = db.select().from(creatorProviderMix7d);
      if (input?.userId) query = query.where(eq(creatorProviderMix7d.userId, input.userId)) as typeof query;

      return query.orderBy(desc(creatorProviderMix7d.refreshedAt)).limit(100);
    }),
});
