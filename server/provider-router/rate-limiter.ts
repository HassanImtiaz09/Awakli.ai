/**
 * Rate Limiter — Token bucket per provider API key.
 *
 * Uses the provider_rate_limits table to track sliding-window request counts.
 * Supports per-minute and per-day windows.
 */
import { getDb } from "../db";
import { eq, and, gte, sql } from "drizzle-orm";
import { providerRateLimits, providerApiKeys } from "../../drizzle/schema";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfterMs?: number;
}

/**
 * Check if a request is allowed under the provider's rate limit.
 * Uses a sliding window counter in the database.
 */
export async function checkRateLimit(
  providerId: string,
  apiKeyId: number,
): Promise<RateLimitResult> {
  const db = await getDb();
  if (!db) return { allowed: true, remaining: 999, limit: 999, resetAt: new Date() };

  // Get the API key's RPM limit
  const keys = await db
    .select({ rateLimitRpm: providerApiKeys.rateLimitRpm })
    .from(providerApiKeys)
    .where(eq(providerApiKeys.id, apiKeyId))
    .limit(1);

  const rpm = keys[0]?.rateLimitRpm ?? 60;
  const windowStart = new Date(Date.now() - 60_000); // 1-minute window

  // Count requests in the current window
  const counts = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(providerRateLimits)
    .where(
      and(
        eq(providerRateLimits.providerId, providerId),
        eq(providerRateLimits.apiKeyId, apiKeyId),
        gte(providerRateLimits.windowStart, windowStart),
      ),
    );

  const currentCount = counts[0]?.count ?? 0;
  const remaining = Math.max(0, rpm - currentCount);
  const resetAt = new Date(Date.now() + 60_000);

  if (currentCount >= rpm) {
    return {
      allowed: false,
      remaining: 0,
      limit: rpm,
      resetAt,
      retryAfterMs: 60_000 - (Date.now() - windowStart.getTime()),
    };
  }

  return { allowed: true, remaining, limit: rpm, resetAt };
}

/**
 * Record a request against the rate limit window.
 */
export async function recordRequest(
  providerId: string,
  apiKeyId: number,
  costUsd: number = 0,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  // Round to the start of the current minute for window grouping
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());

  try {
    // Upsert: increment count for this window
    await db
      .insert(providerRateLimits)
      .values({
        providerId,
        apiKeyId,
        windowStart,
        requestCount: 1,
        spendUsd: String(costUsd),
      })
      .onDuplicateKeyUpdate({
        set: {
          requestCount: sql`${providerRateLimits.requestCount} + 1`,
          spendUsd: sql`${providerRateLimits.spendUsd} + ${String(costUsd)}`,
        },
      });
  } catch {
    // Non-critical — don't fail the request over rate limit tracking
  }
}

/**
 * Get current rate limit status for a provider (all keys combined).
 */
export async function getRateLimitStatus(providerId: string): Promise<{
  totalRpm: number;
  currentRpm: number;
  utilizationPct: number;
}> {
  const db = await getDb();
  if (!db) return { totalRpm: 0, currentRpm: 0, utilizationPct: 0 };

  const windowStart = new Date(Date.now() - 60_000);

  // Get total RPM across all active keys
  const keys = await db
    .select({ rpm: providerApiKeys.rateLimitRpm })
    .from(providerApiKeys)
    .where(
      and(
        eq(providerApiKeys.providerId, providerId),
        eq(providerApiKeys.isActive, 1),
      ),
    );

  const totalRpm = keys.reduce((sum, k) => sum + k.rpm, 0);

  // Get current request count
  const counts = await db
    .select({ total: sql<number>`COALESCE(SUM(${providerRateLimits.requestCount}), 0)` })
    .from(providerRateLimits)
    .where(
      and(
        eq(providerRateLimits.providerId, providerId),
        gte(providerRateLimits.windowStart, windowStart),
      ),
    );

  const currentRpm = counts[0]?.total ?? 0;
  const utilizationPct = totalRpm > 0 ? (currentRpm / totalRpm) * 100 : 0;

  return { totalRpm, currentRpm, utilizationPct };
}

/**
 * Clean up old rate limit windows (older than 1 hour).
 * Should be called periodically.
 */
export async function cleanupRateLimitWindows(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const cutoff = new Date(Date.now() - 3600_000);
  const result = await db
    .delete(providerRateLimits)
    .where(sql`${providerRateLimits.windowStart} < ${cutoff}`);

  return (result as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
}
