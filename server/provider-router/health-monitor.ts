/**
 * Health Monitor — Tracks provider health metrics and updates summary tables.
 *
 * Responsibilities:
 * - Update latency percentiles (P50, P95) from recent requests
 * - Update success rate from recent requests
 * - Refresh provider_spend_24h summary
 * - Refresh creator_provider_mix_7d summary
 * - Detect anomalies and emit alerts
 */
import { getDb } from "../db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import {
  providerHealth,
  generationRequests,
  providerSpend24h,
  creatorProviderMix7d,
  providerEvents,
} from "../../drizzle/schema";

/**
 * Update health metrics for a single provider from recent generation_requests.
 */
export async function updateProviderMetrics(providerId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const oneHourAgo = new Date(Date.now() - 3600_000);

  // Get recent requests for this provider
  const recentRequests = await db
    .select({
      status: generationRequests.status,
      latencyMs: generationRequests.latencyMs,
    })
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.providerId, providerId),
        gte(generationRequests.createdAt, oneHourAgo),
      ),
    );

  if (recentRequests.length === 0) return;

  // Calculate success rate
  const total = recentRequests.length;
  const succeeded = recentRequests.filter((r) => r.status === "succeeded").length;
  const successRate = total > 0 ? succeeded / total : null;

  // Calculate latency percentiles from successful requests
  const latencies = recentRequests
    .filter((r) => r.status === "succeeded" && r.latencyMs != null)
    .map((r) => r.latencyMs!)
    .sort((a, b) => a - b);

  const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : null;
  const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : null;

  // Update provider_health
  await db
    .update(providerHealth)
    .set({
      latencyP50Ms: p50,
      latencyP95Ms: p95,
      successRate1h: successRate !== null ? String(successRate) : null,
      requestCount1h: total,
    })
    .where(eq(providerHealth.providerId, providerId));
}

/**
 * Refresh the provider_spend_24h summary table.
 * Aggregates generation_requests from the last 24 hours.
 */
export async function refreshSpend24h(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600_000);

  // Aggregate spend by provider
  const spendData = await db
    .select({
      providerId: generationRequests.providerId,
      requestCount: sql<number>`COUNT(*)`,
      successCount: sql<number>`SUM(CASE WHEN ${generationRequests.status} = 'succeeded' THEN 1 ELSE 0 END)`,
      totalCostUsd: sql<string>`COALESCE(SUM(CAST(${generationRequests.actualCostUsd} AS DECIMAL(10,4))), 0)`,
      totalCostCredits: sql<string>`COALESCE(SUM(CAST(${generationRequests.actualCostCredits} AS DECIMAL(10,2))), 0)`,
      avgLatencyMs: sql<number>`AVG(${generationRequests.latencyMs})`,
    })
    .from(generationRequests)
    .where(gte(generationRequests.createdAt, twentyFourHoursAgo))
    .groupBy(generationRequests.providerId);

  // Upsert into summary table
  for (const row of spendData) {
    if (!row.providerId) continue;
    const successRate = row.requestCount > 0 ? row.successCount / row.requestCount : null;
    await db
      .insert(providerSpend24h)
      .values({
        providerId: row.providerId,
        requests: row.requestCount,
        spendUsd: row.totalCostUsd,
        avgLatencyMs: row.avgLatencyMs,
        successRate: successRate !== null ? String(successRate) : null,
        refreshedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: {
          requests: row.requestCount,
          spendUsd: row.totalCostUsd,
          avgLatencyMs: row.avgLatencyMs,
          successRate: successRate !== null ? String(successRate) : null,
          refreshedAt: new Date(),
        },
      });
  }
}

/**
 * Refresh the creator_provider_mix_7d summary table.
 * Aggregates per-user provider usage from the last 7 days.
 */
export async function refreshCreatorMix7d(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  // Aggregate by user + provider
  const mixData = await db
    .select({
      userId: generationRequests.userId,
      providerId: generationRequests.providerId,
      requestCount: sql<number>`COUNT(*)`,
      totalCostCredits: sql<string>`COALESCE(SUM(CAST(${generationRequests.actualCostCredits} AS DECIMAL(10,2))), 0)`,
      avgLatencyMs: sql<number>`AVG(${generationRequests.latencyMs})`,
    })
    .from(generationRequests)
    .where(
      and(
        gte(generationRequests.createdAt, sevenDaysAgo),
        eq(generationRequests.status, "succeeded"),
      ),
    )
    .groupBy(generationRequests.userId, generationRequests.providerId);

  // Clear old data and insert fresh
  await db.delete(creatorProviderMix7d).where(sql`1=1`);

  for (const row of mixData) {
    if (!row.providerId || !row.userId) continue;
    await db.insert(creatorProviderMix7d).values({
      userId: row.userId,
      providerId: row.providerId,
      requests: row.requestCount,
      creditsSpent: row.totalCostCredits,
      platformCogsUsd: String(Number(row.totalCostCredits) * 0.55),
    });
  }
}

/**
 * Run all health monitoring tasks.
 * Should be called periodically (e.g., every 5 minutes).
 */
export async function runHealthCheck(): Promise<{
  providersUpdated: number;
  spendRefreshed: boolean;
  mixRefreshed: boolean;
}> {
  const db = await getDb();
  if (!db) return { providersUpdated: 0, spendRefreshed: false, mixRefreshed: false };

  // Get all active providers
  const { providers } = await import("../../drizzle/schema");
  const allProviders = await db
    .select({ id: providers.id })
    .from(providers)
    .where(eq(providers.status, "active"));

  // Update metrics for each provider
  let updated = 0;
  for (const p of allProviders) {
    await updateProviderMetrics(p.id);
    updated++;
  }

  // Refresh summary tables
  await refreshSpend24h();
  await refreshCreatorMix7d();

  return { providersUpdated: updated, spendRefreshed: true, mixRefreshed: true };
}

/**
 * Get recent provider events for monitoring.
 */
export async function getRecentEvents(
  providerId?: string,
  limit: number = 50,
): Promise<Array<{
  id: number;
  providerId: string;
  eventType: string;
  severity: string;
  detail: unknown;
  createdAt: Date;
}>> {
  const db = await getDb();
  if (!db) return [];

  const conditions = providerId
    ? [eq(providerEvents.providerId, providerId)]
    : [];

  const rows = conditions.length > 0
    ? await db.select().from(providerEvents).where(and(...conditions)).orderBy(desc(providerEvents.createdAt)).limit(limit)
    : await db.select().from(providerEvents).orderBy(desc(providerEvents.createdAt)).limit(limit);

  return rows.map((r) => ({
    id: r.id,
    providerId: r.providerId,
    eventType: r.eventType,
    severity: r.severity,
    detail: r.detail,
    createdAt: r.createdAt!,
  }));
}
