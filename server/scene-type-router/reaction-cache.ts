/**
 * Prompt 20 — Reaction Shot Cache Manager
 *
 * Lookup by (character_id, emotion, camera_angle).
 * Cache miss → generate 2-3s clip via local_animatediff + IP-Adapter.
 * Reusable across episodes. Usage tracking for analytics.
 */

import type { ReactionEmotion, ReactionCameraAngle } from "../../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ReactionCacheKey {
  characterId: number;
  emotion: ReactionEmotion;
  cameraAngle: ReactionCameraAngle;
}

export interface ReactionCacheEntry {
  id: number;
  characterId: number;
  emotion: ReactionEmotion;
  cameraAngle: ReactionCameraAngle;
  storageUrl: string;
  durationS: string;  // decimal string
  generationRequestId: number | null;
  reusableAcrossEpisodes: number;
  usageCount: number;
  createdBy: number;
  createdAt: Date;
}

export interface CacheLookupResult {
  hit: boolean;
  entry: ReactionCacheEntry | null;
  estimatedCredits: number;  // 0 if cache hit, generation cost if miss
}

export interface GenerationRequest {
  characterId: number;
  emotion: ReactionEmotion;
  cameraAngle: ReactionCameraAngle;
  characterReferenceUrl: string;  // IP-Adapter reference image
  durationS: number;
  style?: string;
}

export interface GenerationResult {
  storageUrl: string;
  durationS: number;
  generationRequestId: number;
  creditsUsed: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

export const VALID_EMOTIONS: ReactionEmotion[] = [
  "surprise", "anger", "joy", "sadness", "fear", "neutral",
];

export const VALID_CAMERA_ANGLES: ReactionCameraAngle[] = [
  "front", "three_quarter", "side", "close_up",
];

/** Estimated credits for generating a reaction shot on cache miss */
export const CACHE_MISS_GENERATION_CREDITS = 0.14;

/** Default clip duration for generated reaction shots */
export const DEFAULT_REACTION_DURATION_S = 2.5;

/** Maximum cache entries per character (to prevent unbounded growth) */
export const MAX_CACHE_PER_CHARACTER = 24;  // 6 emotions × 4 angles

// ─── Reaction Cache Manager ─────────────────────────────────────────────

export class ReactionCacheManager {
  // In-memory LRU for hot lookups (character+emotion+angle → entry)
  private memoryCache = new Map<string, ReactionCacheEntry>();
  private readonly memoryCacheMaxSize = 200;

  /**
   * Build a cache key string for Map lookups.
   */
  static cacheKeyString(key: ReactionCacheKey): string {
    return `${key.characterId}:${key.emotion}:${key.cameraAngle}`;
  }

  /**
   * Look up a reaction shot in the cache.
   * Returns { hit: true, entry, estimatedCredits: 0 } on hit.
   * Returns { hit: false, entry: null, estimatedCredits: CACHE_MISS_GENERATION_CREDITS } on miss.
   */
  async lookup(key: ReactionCacheKey): Promise<CacheLookupResult> {
    // 1. Check in-memory cache first
    const memKey = ReactionCacheManager.cacheKeyString(key);
    const memEntry = this.memoryCache.get(memKey);
    if (memEntry) {
      return { hit: true, entry: memEntry, estimatedCredits: 0 };
    }

    // 2. Check database
    const dbEntry = await this.findInDatabase(key);
    if (dbEntry) {
      // Populate memory cache
      this.setMemoryCache(memKey, dbEntry);
      return { hit: true, entry: dbEntry, estimatedCredits: 0 };
    }

    // 3. Cache miss
    return { hit: false, entry: null, estimatedCredits: CACHE_MISS_GENERATION_CREDITS };
  }

  /**
   * Store a newly generated reaction shot in the cache.
   */
  async store(
    key: ReactionCacheKey,
    result: GenerationResult,
    createdBy: number,
  ): Promise<ReactionCacheEntry> {
    const entry = await this.insertIntoDatabase(key, result, createdBy);

    // Update memory cache
    const memKey = ReactionCacheManager.cacheKeyString(key);
    this.setMemoryCache(memKey, entry);

    return entry;
  }

  /**
   * Increment usage count for a cache entry (called when a cached shot is reused).
   */
  async recordUsage(entryId: number): Promise<void> {
    await this.incrementUsageCount(entryId);

    // Update memory cache if present
    const memEntries = Array.from(this.memoryCache.entries());
    for (const [key, entry] of memEntries) {
      if (entry.id === entryId) {
        entry.usageCount++;
        this.memoryCache.set(key, entry);
        break;
      }
    }
  }

  /**
   * Get all cached reactions for a character.
   */
  async getCharacterCache(characterId: number): Promise<ReactionCacheEntry[]> {
    return this.findAllForCharacter(characterId);
  }

  /**
   * Get cache statistics.
   */
  async getStats(): Promise<ReactionCacheStats> {
    const allEntries = await this.getAllEntries();
    const totalEntries = allEntries.length;
    const totalUsages = allEntries.reduce((sum, e) => sum + e.usageCount, 0);
    const reusableEntries = allEntries.filter(e => e.reusableAcrossEpisodes === 1).length;
    const uniqueCharacters = new Set(allEntries.map(e => e.characterId)).size;

    // Estimate savings: each reuse saves CACHE_MISS_GENERATION_CREDITS
    const estimatedSavingsCredits = totalUsages * CACHE_MISS_GENERATION_CREDITS;

    // Coverage: what % of possible slots are filled per character
    const coverageByCharacter = new Map<number, number>();
    for (const entry of allEntries) {
      coverageByCharacter.set(
        entry.characterId,
        (coverageByCharacter.get(entry.characterId) || 0) + 1,
      );
    }
    const avgCoverage = uniqueCharacters > 0
      ? Array.from(coverageByCharacter.values()).reduce((a, b) => a + b, 0) / (uniqueCharacters * MAX_CACHE_PER_CHARACTER)
      : 0;

    return {
      totalEntries,
      totalUsages,
      reusableEntries,
      uniqueCharacters,
      estimatedSavingsCredits,
      avgCoveragePercent: Math.round(avgCoverage * 100),
      memoryCacheSize: this.memoryCache.size,
    };
  }

  /**
   * Invalidate a specific cache entry (e.g., when character design changes).
   */
  async invalidate(key: ReactionCacheKey): Promise<boolean> {
    const memKey = ReactionCacheManager.cacheKeyString(key);
    this.memoryCache.delete(memKey);
    return this.deleteFromDatabase(key);
  }

  /**
   * Invalidate all cache entries for a character.
   */
  async invalidateCharacter(characterId: number): Promise<number> {
    // Clear memory cache entries for this character
    const entries = Array.from(this.memoryCache.entries());
    for (const [key, entry] of entries) {
      if (entry.characterId === characterId) {
        this.memoryCache.delete(key);
      }
    }
    return this.deleteAllForCharacter(characterId);
  }

  /**
   * Clear the in-memory cache (for testing or memory pressure).
   */
  clearMemoryCache(): void {
    this.memoryCache.clear();
  }

  // ─── Private: Memory Cache Management ─────────────────────────────────

  private setMemoryCache(key: string, entry: ReactionCacheEntry): void {
    // Simple eviction: if at max, delete oldest entry
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(key, entry);
  }

  // ─── Protected: Database Operations (overridable for testing) ─────────

  protected async findInDatabase(key: ReactionCacheKey): Promise<ReactionCacheEntry | null> {
    // In production, this queries the reaction_cache table
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return null;

    const rows = await db.select().from(reactionCache).where(
      and(
        eq(reactionCache.characterId, key.characterId),
        eq(reactionCache.emotion, key.emotion),
        eq(reactionCache.cameraAngle, key.cameraAngle),
      ),
    ).limit(1);

    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  protected async insertIntoDatabase(
    key: ReactionCacheKey,
    result: GenerationResult,
    createdBy: number,
  ): Promise<ReactionCacheEntry> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [inserted] = await db.insert(reactionCache).values({
      characterId: key.characterId,
      emotion: key.emotion,
      cameraAngle: key.cameraAngle,
      storageUrl: result.storageUrl,
      durationS: result.durationS.toFixed(2),
      generationRequestId: result.generationRequestId,
      reusableAcrossEpisodes: 1,
      usageCount: 0,
      createdBy,
    }).$returningId();

    return {
      id: inserted.id,
      characterId: key.characterId,
      emotion: key.emotion,
      cameraAngle: key.cameraAngle,
      storageUrl: result.storageUrl,
      durationS: result.durationS.toFixed(2),
      generationRequestId: result.generationRequestId,
      reusableAcrossEpisodes: 1,
      usageCount: 0,
      createdBy,
      createdAt: new Date(),
    };
  }

  protected async incrementUsageCount(entryId: number): Promise<void> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const { eq, sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.update(reactionCache)
      .set({ usageCount: sql`${reactionCache.usageCount} + 1` })
      .where(eq(reactionCache.id, entryId));
  }

  protected async findAllForCharacter(characterId: number): Promise<ReactionCacheEntry[]> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select().from(reactionCache)
      .where(eq(reactionCache.characterId, characterId));

    return rows.map((r: any) => this.mapRow(r));
  }

  protected async getAllEntries(): Promise<ReactionCacheEntry[]> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const db = await getDb();
    if (!db) return [];

    const rows = await db.select().from(reactionCache);
    return rows.map((r: any) => this.mapRow(r));
  }

  protected async deleteFromDatabase(key: ReactionCacheKey): Promise<boolean> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return false;

    const result = await db.delete(reactionCache).where(
      and(
        eq(reactionCache.characterId, key.characterId),
        eq(reactionCache.emotion, key.emotion),
        eq(reactionCache.cameraAngle, key.cameraAngle),
      ),
    );

    return (result[0]?.affectedRows ?? 0) > 0;
  }

  protected async deleteAllForCharacter(characterId: number): Promise<number> {
    const { getDb } = await import("../db");
    const { reactionCache } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return 0;

    const result = await db.delete(reactionCache)
      .where(eq(reactionCache.characterId, characterId));

    return result[0]?.affectedRows ?? 0;
  }

  // ─── Row Mapping ──────────────────────────────────────────────────────

  private mapRow(row: any): ReactionCacheEntry {
    return {
      id: row.id,
      characterId: row.characterId,
      emotion: row.emotion,
      cameraAngle: row.cameraAngle,
      storageUrl: row.storageUrl,
      durationS: row.durationS,
      generationRequestId: row.generationRequestId,
      reusableAcrossEpisodes: row.reusableAcrossEpisodes,
      usageCount: row.usageCount,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }
}

// ─── Stats Type ─────────────────────────────────────────────────────────

export interface ReactionCacheStats {
  totalEntries: number;
  totalUsages: number;
  reusableEntries: number;
  uniqueCharacters: number;
  estimatedSavingsCredits: number;
  avgCoveragePercent: number;
  memoryCacheSize: number;
}

// ─── Singleton ──────────────────────────────────────────────────────────

let _instance: ReactionCacheManager | null = null;

export function getReactionCacheManager(): ReactionCacheManager {
  if (!_instance) {
    _instance = new ReactionCacheManager();
  }
  return _instance;
}

/** Reset singleton (for testing) */
export function resetReactionCacheManager(): void {
  _instance = null;
}
