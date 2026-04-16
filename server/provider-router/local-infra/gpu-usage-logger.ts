/**
 * GPU Usage Logger — Append-only log for cost reconciliation
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Records every GPU inference execution for billing reconciliation,
 * cold start tracking, and cost analytics.
 */
import { getDb } from "../../db";
import { gpuUsageLog } from "../../../drizzle/schema";
import { sql, gte } from "drizzle-orm";
import type { GpuType } from "./types";
import { calculateActualCost } from "./gpu-cost-model";

export interface GpuUsageEntry {
  generationRequestId?: number;
  endpointId: number;
  gpuType: GpuType;
  gpuSeconds: number;
  modelName: string;
  modelVersion: string;
  wasColdStart: boolean;
  coldStartSeconds?: number;
}

/**
 * Log a GPU usage entry after inference completes.
 */
export async function logGpuUsage(entry: GpuUsageEntry): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const cost = calculateActualCost(entry.gpuType, entry.gpuSeconds);

  const result = await db.insert(gpuUsageLog).values({
    generationRequestId: entry.generationRequestId ?? null,
    endpointId: entry.endpointId,
    gpuType: entry.gpuType,
    gpuSeconds: String(entry.gpuSeconds),
    costUsd: String(cost.marginCostUsd),
    wasColdStart: entry.wasColdStart ? 1 : 0,
    coldStartSeconds: entry.coldStartSeconds ? String(entry.coldStartSeconds) : null,
    modelName: entry.modelName,
    modelVersion: entry.modelVersion,
  });

  return result[0].insertId;
}

/**
 * Get GPU cost summary for the last 24 hours, grouped by model.
 */
export async function getGpuCostSummary24h(): Promise<Array<{
  modelName: string;
  gpuType: string;
  requests: number;
  totalGpuSeconds: number;
  totalCostUsd: number;
  avgGpuSeconds: number;
  coldStarts: number;
  avgColdStartSeconds: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      modelName: gpuUsageLog.modelName,
      gpuType: gpuUsageLog.gpuType,
      requests: sql<number>`COUNT(*)`,
      totalGpuSeconds: sql<number>`SUM(CAST(${gpuUsageLog.gpuSeconds} AS DECIMAL(10,3)))`,
      totalCostUsd: sql<number>`SUM(CAST(${gpuUsageLog.costUsd} AS DECIMAL(10,6)))`,
      avgGpuSeconds: sql<number>`AVG(CAST(${gpuUsageLog.gpuSeconds} AS DECIMAL(10,3)))`,
      coldStarts: sql<number>`SUM(${gpuUsageLog.wasColdStart})`,
      avgColdStartSeconds: sql<number>`AVG(CASE WHEN ${gpuUsageLog.wasColdStart} = 1 THEN CAST(${gpuUsageLog.coldStartSeconds} AS DECIMAL(6,2)) ELSE NULL END)`,
    })
    .from(gpuUsageLog)
    .where(gte(gpuUsageLog.createdAt, cutoff))
    .groupBy(gpuUsageLog.modelName, gpuUsageLog.gpuType);

  return rows.map(r => ({
    modelName: r.modelName,
    gpuType: r.gpuType,
    requests: Number(r.requests),
    totalGpuSeconds: Number(r.totalGpuSeconds ?? 0),
    totalCostUsd: Number(r.totalCostUsd ?? 0),
    avgGpuSeconds: Number(r.avgGpuSeconds ?? 0),
    coldStarts: Number(r.coldStarts ?? 0),
    avgColdStartSeconds: Number(r.avgColdStartSeconds ?? 0),
  }));
}

/**
 * Get total GPU spend for the last N days.
 */
export async function getTotalGpuSpend(days: number = 1): Promise<{
  totalCostUsd: number;
  totalRequests: number;
  totalGpuSeconds: number;
  coldStartRate: number;
}> {
  const db = await getDb();
  if (!db) return { totalCostUsd: 0, totalRequests: 0, totalGpuSeconds: 0, coldStartRate: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      totalCostUsd: sql<number>`SUM(CAST(${gpuUsageLog.costUsd} AS DECIMAL(10,6)))`,
      totalRequests: sql<number>`COUNT(*)`,
      totalGpuSeconds: sql<number>`SUM(CAST(${gpuUsageLog.gpuSeconds} AS DECIMAL(10,3)))`,
      coldStarts: sql<number>`SUM(${gpuUsageLog.wasColdStart})`,
    })
    .from(gpuUsageLog)
    .where(gte(gpuUsageLog.createdAt, cutoff));

  const row = rows[0];
  const totalRequests = Number(row?.totalRequests ?? 0);
  const coldStarts = Number(row?.coldStarts ?? 0);

  return {
    totalCostUsd: Number(row?.totalCostUsd ?? 0),
    totalRequests,
    totalGpuSeconds: Number(row?.totalGpuSeconds ?? 0),
    coldStartRate: totalRequests > 0 ? coldStarts / totalRequests : 0,
  };
}
