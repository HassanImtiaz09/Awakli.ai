/**
 * Idempotency Dedup — Prevents duplicate generation requests.
 *
 * Audit fix C-7: DB-backed idempotency table with 24h TTL.
 * If a request with the same key arrives within 24h, returns the cached result.
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

const TTL_HOURS = 24;

/**
 * Check if an idempotency key already has a result.
 * Returns the cached resultUrl if found, null otherwise.
 */
export async function checkIdempotency(
  userId: number,
  idempotencyKey: string,
): Promise<{ resultUrl: string; jobId: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.execute(sql`
    SELECT result_url, job_id FROM image_idempotency
    WHERE user_id = ${userId}
      AND idempotency_key = ${idempotencyKey}
      AND created_at > DATE_SUB(NOW(), INTERVAL ${TTL_HOURS} HOUR)
    LIMIT 1
  `);

  const row = (rows as any)[0]?.[0];
  if (row?.result_url) {
    return { resultUrl: row.result_url, jobId: row.job_id };
  }
  return null;
}

/**
 * Record an idempotency key with its result.
 * Uses INSERT IGNORE to handle race conditions.
 */
export async function recordIdempotency(
  userId: number,
  idempotencyKey: string,
  resultUrl: string,
  jobId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    INSERT IGNORE INTO image_idempotency (user_id, idempotency_key, result_url, job_id, created_at)
    VALUES (${userId}, ${idempotencyKey}, ${resultUrl}, ${jobId}, NOW())
  `);
}

/**
 * Clean up expired idempotency records (call periodically).
 */
export async function cleanupExpiredIdempotency(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.execute(sql`
    DELETE FROM image_idempotency
    WHERE created_at < DATE_SUB(NOW(), INTERVAL ${TTL_HOURS} HOUR)
  `);
  return (result as any)[0]?.affectedRows ?? 0;
}
