/**
 * Background Asset Library — Reuse backgrounds across episodes
 *
 * Stores generated backgrounds per project with location names and tags.
 * Before generating a new background, the panel generation pipeline checks
 * this library for a matching location. If found, the existing image is
 * reused (saving ~3 credits per panel).
 *
 * Matching strategy:
 *   1. Exact location name match (case-insensitive, same project)
 *   2. Tag-based fuzzy match (Jaccard similarity > 0.6)
 *   3. If no match, generate new and store in library
 *
 * Cost savings: For a 20-panel episode with 5 recurring locations,
 * saves ~48 credits (16 panels × 3 credits each).
 */

import { getDb } from "./db";
import { backgroundAssets } from "../drizzle/schema";
import type { BackgroundAsset, InsertBackgroundAsset } from "../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────

export interface BackgroundMatch {
  asset: BackgroundAsset;
  matchType: "exact" | "tag_fuzzy";
  confidence: number;
}

export interface BackgroundSearchParams {
  projectId: number;
  locationName: string;
  tags?: string[];
  styleTag?: string;
}

export interface BackgroundCreateParams {
  projectId: number;
  locationName: string;
  imageUrl: string;
  fileKey?: string;
  styleTag?: string;
  resolution?: string;
  tags?: string[];
  sourceEpisodeId?: number;
  sourcePanelId?: number;
  promptUsed?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Minimum Jaccard similarity for tag-based matching */
const TAG_MATCH_THRESHOLD = 0.6;

/** Maximum number of results to return for browsing */
const MAX_BROWSE_RESULTS = 50;

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Search for a matching background in the library.
 * Returns the best match or null if no suitable match found.
 */
export async function findMatchingBackground(
  params: BackgroundSearchParams,
): Promise<BackgroundMatch | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. Try exact location name match (case-insensitive)
  const exactMatches = await db
    .select()
    .from(backgroundAssets)
    .where(
      and(
        eq(backgroundAssets.projectId, params.projectId),
        sql`LOWER(${backgroundAssets.locationName}) = LOWER(${params.locationName})`,
      ),
    )
    .orderBy(desc(backgroundAssets.usageCount))
    .limit(1);

  if (exactMatches.length > 0) {
    // Increment usage count
    await db
      .update(backgroundAssets)
      .set({ usageCount: sql`${backgroundAssets.usageCount} + 1` })
      .where(eq(backgroundAssets.id, exactMatches[0].id));

    return {
      asset: exactMatches[0],
      matchType: "exact",
      confidence: 1.0,
    };
  }

  // 2. Try tag-based fuzzy match
  if (params.tags && params.tags.length > 0) {
    const allAssets = await db
      .select()
      .from(backgroundAssets)
      .where(eq(backgroundAssets.projectId, params.projectId))
      .orderBy(desc(backgroundAssets.usageCount));

    let bestMatch: BackgroundMatch | null = null;

    for (const asset of allAssets) {
      const assetTags = (asset.tags as string[] | null) ?? [];
      if (assetTags.length === 0) continue;

      const similarity = jaccardSimilarity(params.tags, assetTags);
      if (similarity >= TAG_MATCH_THRESHOLD && (!bestMatch || similarity > bestMatch.confidence)) {
        bestMatch = {
          asset,
          matchType: "tag_fuzzy",
          confidence: Math.round(similarity * 100) / 100,
        };
      }
    }

    if (bestMatch) {
      // Increment usage count
      await db
        .update(backgroundAssets)
        .set({ usageCount: sql`${backgroundAssets.usageCount} + 1` })
        .where(eq(backgroundAssets.id, bestMatch.asset.id));

      return bestMatch;
    }
  }

  return null;
}

/**
 * Store a new background in the library.
 */
export async function storeBackground(
  params: BackgroundCreateParams,
): Promise<BackgroundAsset> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(backgroundAssets).values({
    projectId: params.projectId,
    locationName: params.locationName,
    imageUrl: params.imageUrl,
    fileKey: params.fileKey ?? null,
    styleTag: params.styleTag ?? null,
    resolution: params.resolution ?? null,
    tags: params.tags ?? null,
    sourceEpisodeId: params.sourceEpisodeId ?? null,
    sourcePanelId: params.sourcePanelId ?? null,
    promptUsed: params.promptUsed ?? null,
    usageCount: 1,
  });

  const insertId = result[0].insertId;
  const [created] = await db
    .select()
    .from(backgroundAssets)
    .where(eq(backgroundAssets.id, insertId));

  return created;
}

/**
 * List all backgrounds for a project.
 */
export async function listBackgrounds(
  projectId: number,
  options?: { limit?: number; offset?: number; styleTag?: string },
): Promise<{ items: BackgroundAsset[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const limit = options?.limit ?? MAX_BROWSE_RESULTS;
  const offset = options?.offset ?? 0;

  const conditions = [eq(backgroundAssets.projectId, projectId)];
  if (options?.styleTag) {
    conditions.push(eq(backgroundAssets.styleTag, options.styleTag));
  }

  const items = await db
    .select()
    .from(backgroundAssets)
    .where(and(...conditions))
    .orderBy(desc(backgroundAssets.usageCount))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(backgroundAssets)
    .where(and(...conditions));

  return {
    items,
    total: countResult.count,
  };
}

/**
 * Get a single background by ID.
 */
export async function getBackground(id: number): Promise<BackgroundAsset | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [asset] = await db
    .select()
    .from(backgroundAssets)
    .where(eq(backgroundAssets.id, id));
  return asset ?? null;
}

/**
 * Delete a background from the library.
 */
export async function deleteBackground(id: number, projectId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .delete(backgroundAssets)
    .where(and(eq(backgroundAssets.id, id), eq(backgroundAssets.projectId, projectId)));
  return (result[0] as any).affectedRows > 0;
}

/**
 * Update a background's metadata.
 */
export async function updateBackground(
  id: number,
  projectId: number,
  updates: Partial<Pick<InsertBackgroundAsset, "locationName" | "tags" | "styleTag">>,
): Promise<BackgroundAsset | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(backgroundAssets)
    .set(updates)
    .where(and(eq(backgroundAssets.id, id), eq(backgroundAssets.projectId, projectId)));

  return getBackground(id);
}

/**
 * Get unique location names for a project (for autocomplete).
 */
export async function getProjectLocations(projectId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const results = await db
    .select({ locationName: backgroundAssets.locationName })
    .from(backgroundAssets)
    .where(eq(backgroundAssets.projectId, projectId))
    .orderBy(backgroundAssets.locationName);

  // Deduplicate
  const unique = Array.from(new Set(results.map((r: { locationName: string }) => r.locationName)));
  return unique;
}

/**
 * Extract location tags from a scene description using simple NLP heuristics.
 * This is a lightweight alternative to LLM-based tagging.
 */
export function extractLocationTags(description: string): string[] {
  const tags: string[] = [];
  const lower = description.toLowerCase();

  // Time of day
  const timePatterns: Record<string, string[]> = {
    night: ["night", "midnight", "dark", "moonlit", "starry", "nocturnal"],
    day: ["day", "daytime", "sunny", "bright", "noon", "midday"],
    dawn: ["dawn", "sunrise", "morning", "early"],
    dusk: ["dusk", "sunset", "evening", "twilight"],
  };

  for (const [tag, patterns] of Object.entries(timePatterns)) {
    if (patterns.some(p => lower.includes(p))) tags.push(tag);
  }

  // Weather
  const weatherPatterns: Record<string, string[]> = {
    rain: ["rain", "rainy", "storm", "downpour", "drizzle"],
    snow: ["snow", "snowy", "blizzard", "frost", "ice"],
    fog: ["fog", "foggy", "mist", "misty", "haze"],
    wind: ["wind", "windy", "gust", "breeze"],
  };

  for (const [tag, patterns] of Object.entries(weatherPatterns)) {
    if (patterns.some(p => lower.includes(p))) tags.push(tag);
  }

  // Location types
  const locationPatterns: Record<string, string[]> = {
    city: ["city", "urban", "downtown", "skyscraper", "metropolis"],
    forest: ["forest", "woods", "trees", "jungle", "grove"],
    ocean: ["ocean", "sea", "beach", "coast", "shore", "waves"],
    mountain: ["mountain", "peak", "cliff", "summit", "highland"],
    interior: ["room", "interior", "inside", "indoor", "hallway", "corridor"],
    school: ["school", "classroom", "campus", "university", "academy"],
    street: ["street", "road", "alley", "avenue", "path"],
    sky: ["sky", "clouds", "aerial", "flying", "rooftop"],
    cave: ["cave", "underground", "dungeon", "tunnel"],
    temple: ["temple", "shrine", "church", "cathedral", "sacred"],
    castle: ["castle", "palace", "fortress", "throne"],
    village: ["village", "town", "rural", "countryside"],
    space: ["space", "galaxy", "cosmos", "planet", "asteroid"],
    underwater: ["underwater", "deep sea", "aquatic", "submarine"],
  };

  for (const [tag, patterns] of Object.entries(locationPatterns)) {
    if (patterns.some(p => lower.includes(p))) tags.push(tag);
  }

  return Array.from(new Set(tags));
}

// ─── Internal Helpers ───────────────────────────────────────────────────

/**
 * Calculate Jaccard similarity between two tag arrays.
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = Array.from(new Set(a.map(t => t.toLowerCase())));
  const setB = Array.from(new Set(b.map(t => t.toLowerCase())));
  const lookupB = new Set(setB);

  let intersection = 0;
  for (let i = 0; i < setA.length; i++) {
    if (lookupB.has(setA[i])) intersection++;
  }

  const union = setA.length + setB.length - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Export for testing
export { jaccardSimilarity };
