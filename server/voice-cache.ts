/**
 * Voice Line Caching — Reuse generated voice lines
 *
 * Caches TTS output keyed by (voiceId + textHash + emotion).
 * Before generating a new voice line, the pipeline checks this cache.
 * Common interjections ("Yes!", "No!", "Hmm...", etc.) are pre-generated
 * during voice clone setup to save ~1 credit per reuse.
 *
 * Cost savings: For a 20-panel episode with 30% repeated/common lines,
 * saves ~6 credits per episode.
 */

import { createHash } from "crypto";
import { getDb } from "./db";
import { voiceCache } from "../drizzle/schema";
import type { VoiceCacheEntry } from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────

export interface VoiceCacheLookup {
  voiceId: string;
  text: string;
  emotion?: string;
}

export interface VoiceCacheStore {
  voiceId: string;
  text: string;
  emotion?: string;
  audioUrl: string;
  fileKey?: string;
  durationMs?: number;
  projectId?: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/**
 * Common interjections that should be pre-generated during voice clone setup.
 * These are short, frequently-used lines that appear across many episodes.
 */
export const COMMON_INTERJECTIONS: { text: string; emotion: string }[] = [
  // Affirmative
  { text: "Yes!", emotion: "neutral" },
  { text: "Yeah.", emotion: "neutral" },
  { text: "Right.", emotion: "neutral" },
  { text: "Of course!", emotion: "excited" },
  { text: "Understood.", emotion: "neutral" },
  { text: "Got it.", emotion: "neutral" },
  // Negative
  { text: "No!", emotion: "angry" },
  { text: "No way!", emotion: "shocked" },
  { text: "Never!", emotion: "angry" },
  { text: "I refuse.", emotion: "neutral" },
  { text: "Stop!", emotion: "angry" },
  // Reactions
  { text: "What?!", emotion: "shocked" },
  { text: "Huh?", emotion: "confused" },
  { text: "Hmm...", emotion: "thinking" },
  { text: "I see.", emotion: "neutral" },
  { text: "Interesting.", emotion: "thinking" },
  { text: "Impossible!", emotion: "shocked" },
  { text: "How dare you!", emotion: "angry" },
  // Emotional
  { text: "Thank you.", emotion: "grateful" },
  { text: "I'm sorry.", emotion: "sad" },
  { text: "Please!", emotion: "desperate" },
  { text: "Help!", emotion: "scared" },
  { text: "Watch out!", emotion: "urgent" },
  { text: "Let's go!", emotion: "excited" },
  { text: "Amazing!", emotion: "excited" },
  // Combat
  { text: "Take this!", emotion: "fierce" },
  { text: "Here I come!", emotion: "fierce" },
  { text: "Not yet!", emotion: "determined" },
  { text: "I won't give up!", emotion: "determined" },
  { text: "It's over.", emotion: "calm" },
];

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Generate a consistent hash for a text string.
 * Normalizes whitespace and case for better cache hits.
 */
export function hashText(text: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

/**
 * Look up a cached voice line.
 * Returns the cached entry or null if not found.
 */
export async function lookupVoiceLine(
  params: VoiceCacheLookup,
): Promise<VoiceCacheEntry | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const textHash = hashText(params.text);
  const conditions = [
    eq(voiceCache.voiceId, params.voiceId),
    eq(voiceCache.textHash, textHash),
  ];

  if (params.emotion) {
    conditions.push(eq(voiceCache.emotion, params.emotion));
  }

  const [entry] = await db
    .select()
    .from(voiceCache)
    .where(and(...conditions))
    .limit(1);

  if (entry) {
    // Increment usage count
    await db
      .update(voiceCache)
      .set({ usageCount: sql`${voiceCache.usageCount} + 1` })
      .where(eq(voiceCache.id, entry.id));
  }

  return entry ?? null;
}

/**
 * Store a voice line in the cache.
 */
export async function storeVoiceLine(
  params: VoiceCacheStore,
): Promise<VoiceCacheEntry> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const textHash = hashText(params.text);

  // Check if already cached (upsert)
  const [existing] = await db
    .select()
    .from(voiceCache)
    .where(
      and(
        eq(voiceCache.voiceId, params.voiceId),
        eq(voiceCache.textHash, textHash),
      ),
    )
    .limit(1);

  if (existing) {
    // Update existing entry
    await db
      .update(voiceCache)
      .set({
        audioUrl: params.audioUrl,
        fileKey: params.fileKey ?? null,
        durationMs: params.durationMs ?? null,
        usageCount: sql`${voiceCache.usageCount} + 1`,
      })
      .where(eq(voiceCache.id, existing.id));

    const [updated] = await db
      .select()
      .from(voiceCache)
      .where(eq(voiceCache.id, existing.id));
    return updated;
  }

  // Insert new entry
  const result = await db.insert(voiceCache).values({
    voiceId: params.voiceId,
    textHash,
    text: params.text,
    emotion: params.emotion ?? null,
    audioUrl: params.audioUrl,
    fileKey: params.fileKey ?? null,
    durationMs: params.durationMs ?? null,
    projectId: params.projectId ?? null,
    usageCount: 1,
  });

  const insertId = result[0].insertId;
  const [created] = await db
    .select()
    .from(voiceCache)
    .where(eq(voiceCache.id, insertId));

  return created;
}

/**
 * List cached voice lines for a voice ID.
 */
export async function listVoiceLines(
  voiceId: string,
  options?: { limit?: number; offset?: number; projectId?: number },
): Promise<{ items: VoiceCacheEntry[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const conditions = [eq(voiceCache.voiceId, voiceId)];
  if (options?.projectId !== undefined) {
    conditions.push(eq(voiceCache.projectId, options.projectId));
  }

  const items = await db
    .select()
    .from(voiceCache)
    .where(and(...conditions))
    .orderBy(desc(voiceCache.usageCount))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(voiceCache)
    .where(and(...conditions));

  return { items, total: countResult.count };
}

/**
 * Delete a cached voice line.
 */
export async function deleteVoiceLine(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(voiceCache)
    .where(eq(voiceCache.id, id));
  return (result[0] as any).affectedRows > 0;
}

/**
 * Get cache statistics for a voice.
 */
export async function getVoiceCacheStats(voiceId: string): Promise<{
  totalEntries: number;
  totalUsages: number;
  estimatedCreditsSaved: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [stats] = await db
    .select({
      totalEntries: sql<number>`COUNT(*)`,
      totalUsages: sql<number>`COALESCE(SUM(${voiceCache.usageCount}), 0)`,
    })
    .from(voiceCache)
    .where(eq(voiceCache.voiceId, voiceId));

  // Each cache hit saves ~1 credit (cost of TTS generation)
  // Subtract totalEntries because the first generation wasn't a savings
  const reuses = Math.max(0, stats.totalUsages - stats.totalEntries);

  return {
    totalEntries: stats.totalEntries,
    totalUsages: stats.totalUsages,
    estimatedCreditsSaved: reuses,
  };
}

/**
 * Get the list of common interjections that should be pre-generated.
 * Filters out any that are already cached for the given voice.
 */
export async function getUncachedInterjections(
  voiceId: string,
): Promise<{ text: string; emotion: string }[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cached = await db
    .select({ textHash: voiceCache.textHash })
    .from(voiceCache)
    .where(eq(voiceCache.voiceId, voiceId));

  const cachedHashes = new Set(cached.map((c: { textHash: string }) => c.textHash));

  return COMMON_INTERJECTIONS.filter(
    (intj) => !cachedHashes.has(hashText(intj.text)),
  );
}
