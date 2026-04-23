/**
 * Milestone 9: Episode Analytics — Aggregation Service
 *
 * Records granular episode view events in the episode_views table and provides
 * aggregation queries for the creator analytics dashboard: per-episode stats,
 * time-series views, device/country breakdowns, and watch-through metrics.
 */

import { getDb } from "./db";
import { episodeViews, episodes, projects } from "../drizzle/schema";
import { eq, and, sql, gte, desc, count } from "drizzle-orm";
import crypto from "crypto";
import { serverLog } from "./observability/logger";

// ─── Types ──────────────────────────────────────────────────────────────

export interface RecordEpisodeViewInput {
  episodeId: number;
  projectId: number;
  viewerUserId?: number | null;
  viewerIp?: string;
  userAgent?: string;
  watchDurationSeconds?: number;
  completionPercent?: number;
  country?: string;
  referrer?: string;
}

export interface EpisodeViewStats {
  episodeId: number;
  episodeTitle: string;
  episodeNumber: number;
  totalViews: number;
  uniqueViewers: number;
  avgWatchDuration: number;
  avgCompletionPercent: number;
  viewsToday: number;
  viewsThisWeek: number;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  views: number;
}

export interface DeviceBreakdown {
  device: string;
  count: number;
  percentage: number;
}

export interface CountryBreakdown {
  country: string;
  count: number;
  percentage: number;
}

export interface EpisodeAnalyticsDashboard {
  totalEpisodeViews: number;
  totalUniqueViewers: number;
  avgWatchDuration: number;
  avgCompletionPercent: number;
  episodeStats: EpisodeViewStats[];
  viewsTimeSeries: TimeSeriesPoint[];
  deviceBreakdown: DeviceBreakdown[];
  topCountries: CountryBreakdown[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function hashIp(ip: string): string {
  return crypto.createHash("sha256").update(ip).digest("hex").substring(0, 16);
}

function detectDevice(userAgent: string): "desktop" | "mobile" | "tablet" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|windows phone/.test(ua)) return "mobile";
  if (/windows|macintosh|linux|cros/.test(ua)) return "desktop";
  return "unknown";
}

// ─── Record View ────────────────────────────────────────────────────────

/**
 * Record a granular episode view event.
 */
export async function recordEpisodeView(input: RecordEpisodeViewInput): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    const device = input.userAgent ? detectDevice(input.userAgent) : "unknown";
    const ipHash = input.viewerIp ? hashIp(input.viewerIp) : null;

    await db.insert(episodeViews).values({
      episodeId: input.episodeId,
      projectId: input.projectId,
      viewerUserId: input.viewerUserId ?? null,
      viewerIpHash: ipHash,
      watchDurationSeconds: input.watchDurationSeconds ?? 0,
      completionPercent: Math.min(100, Math.max(0, input.completionPercent ?? 0)),
      country: input.country?.substring(0, 2) ?? null,
      device,
      referrer: input.referrer?.substring(0, 512) ?? null,
    });

    return true;
  } catch (err) {
    serverLog.error("Failed to record episode view", { error: String(err) });
    return false;
  }
}

/**
 * Update watch duration and completion for an existing view (heartbeat).
 */
export async function updateViewProgress(
  viewId: number,
  watchDurationSeconds: number,
  completionPercent: number,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db
      .update(episodeViews)
      .set({
        watchDurationSeconds,
        completionPercent: Math.min(100, Math.max(0, completionPercent)),
      })
      .where(eq(episodeViews.id, viewId));
    return true;
  } catch (err) {
    serverLog.error("Failed to update view progress", { error: String(err) });
    return false;
  }
}

// ─── Aggregation Queries ────────────────────────────────────────────────

/**
 * Get per-episode view stats for a creator's episodes.
 */
export async function getEpisodeViewStats(userId: number): Promise<EpisodeViewStats[]> {
  const db = await getDb();
  if (!db) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const rows = await db
    .select({
      episodeId: episodeViews.episodeId,
      episodeTitle: episodes.title,
      episodeNumber: episodes.episodeNumber,
      totalViews: count(),
      uniqueViewers: sql<number>`COUNT(DISTINCT ${episodeViews.viewerIpHash})`,
      avgWatchDuration: sql<number>`COALESCE(AVG(${episodeViews.watchDurationSeconds}), 0)`,
      avgCompletionPercent: sql<number>`COALESCE(AVG(${episodeViews.completionPercent}), 0)`,
      viewsToday: sql<number>`SUM(CASE WHEN ${episodeViews.createdAt} >= ${todayStart} THEN 1 ELSE 0 END)`,
      viewsThisWeek: sql<number>`SUM(CASE WHEN ${episodeViews.createdAt} >= ${weekStart} THEN 1 ELSE 0 END)`,
    })
    .from(episodeViews)
    .innerJoin(episodes, eq(episodes.id, episodeViews.episodeId))
    .innerJoin(projects, eq(projects.id, episodeViews.projectId))
    .where(eq(projects.userId, userId))
    .groupBy(episodeViews.episodeId, episodes.title, episodes.episodeNumber)
    .orderBy(desc(sql`COUNT(*)`));

  return rows.map(r => ({
    episodeId: r.episodeId,
    episodeTitle: r.episodeTitle ?? `Episode ${r.episodeId}`,
    episodeNumber: r.episodeNumber ?? 1,
    totalViews: Number(r.totalViews),
    uniqueViewers: Number(r.uniqueViewers),
    avgWatchDuration: Math.round(Number(r.avgWatchDuration)),
    avgCompletionPercent: Math.round(Number(r.avgCompletionPercent)),
    viewsToday: Number(r.viewsToday),
    viewsThisWeek: Number(r.viewsThisWeek),
  }));
}

/**
 * Get time-series view data for a creator's episodes over the last N days.
 */
export async function getViewsTimeSeries(
  userId: number,
  days: number = 30,
): Promise<TimeSeriesPoint[]> {
  const db = await getDb();
  if (!db) return [];

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rows = await db
    .select({
      date: sql<string>`DATE(${episodeViews.createdAt})`,
      views: count(),
    })
    .from(episodeViews)
    .innerJoin(projects, eq(projects.id, episodeViews.projectId))
    .where(
      and(
        eq(projects.userId, userId),
        gte(episodeViews.createdAt, startDate),
      ),
    )
    .groupBy(sql`DATE(${episodeViews.createdAt})`)
    .orderBy(sql`DATE(${episodeViews.createdAt})`);

  // Fill in missing dates with 0 views
  const result: TimeSeriesPoint[] = [];
  const dateMap = new Map(rows.map(r => [r.date, Number(r.views)]));

  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    result.push({ date: dateStr, views: dateMap.get(dateStr) ?? 0 });
  }

  return result;
}

/**
 * Get device breakdown for a creator's episode views.
 */
export async function getDeviceBreakdown(userId: number): Promise<DeviceBreakdown[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      device: episodeViews.device,
      count: count(),
    })
    .from(episodeViews)
    .innerJoin(projects, eq(projects.id, episodeViews.projectId))
    .where(eq(projects.userId, userId))
    .groupBy(episodeViews.device)
    .orderBy(desc(count()));

  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  return rows.map(r => ({
    device: r.device ?? "unknown",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));
}

/**
 * Get top countries for a creator's episode views.
 */
export async function getTopCountries(
  userId: number,
  limit: number = 10,
): Promise<CountryBreakdown[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      country: episodeViews.country,
      count: count(),
    })
    .from(episodeViews)
    .innerJoin(projects, eq(projects.id, episodeViews.projectId))
    .where(eq(projects.userId, userId))
    .groupBy(episodeViews.country)
    .orderBy(desc(count()))
    .limit(limit);

  const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
  return rows.map(r => ({
    country: r.country ?? "Unknown",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));
}

/**
 * Get the full episode analytics dashboard for a creator.
 */
export async function getEpisodeAnalyticsDashboard(
  userId: number,
  days: number = 30,
): Promise<EpisodeAnalyticsDashboard> {
  const [episodeStats, viewsTimeSeries, deviceBreakdown, topCountries] = await Promise.all([
    getEpisodeViewStats(userId),
    getViewsTimeSeries(userId, days),
    getDeviceBreakdown(userId),
    getTopCountries(userId),
  ]);

  const totalEpisodeViews = episodeStats.reduce((sum, e) => sum + e.totalViews, 0);
  const totalUniqueViewers = episodeStats.reduce((sum, e) => sum + e.uniqueViewers, 0);
  const avgWatchDuration = episodeStats.length > 0
    ? Math.round(episodeStats.reduce((sum, e) => sum + e.avgWatchDuration, 0) / episodeStats.length)
    : 0;
  const avgCompletionPercent = episodeStats.length > 0
    ? Math.round(episodeStats.reduce((sum, e) => sum + e.avgCompletionPercent, 0) / episodeStats.length)
    : 0;

  return {
    totalEpisodeViews,
    totalUniqueViewers,
    avgWatchDuration,
    avgCompletionPercent,
    episodeStats,
    viewsTimeSeries,
    deviceBreakdown,
    topCountries,
  };
}

// ─── Exported Helpers ───────────────────────────────────────────────────

export { hashIp, detectDevice };
