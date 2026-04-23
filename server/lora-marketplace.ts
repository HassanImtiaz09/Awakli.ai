/**
 * LoRA Sharing Marketplace — Publish, browse, purchase, and fine-tune from base LoRAs
 *
 * Allows creators to share their trained LoRA models with the community.
 * Other creators can use these as base models, reducing training cost
 * from ~120 credits to ~30 credits (75% savings).
 *
 * Revenue sharing: Creators earn a percentage of each paid LoRA download.
 */

import { getDb } from "./db";
import {
  loraMarketplace,
  loraMarketplaceReviews,
} from "../drizzle/schema";
import type {
  LoraMarketplaceEntry,
  LoraReview,
} from "../drizzle/schema";
import { eq, and, sql, desc, asc, like, or } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────

export type LoraCategory = "character" | "style" | "background" | "effect" | "general";
export type LoraLicense = "free" | "attribution" | "commercial" | "exclusive";
export type LoraSortBy = "newest" | "popular" | "rating" | "downloads";

export interface PublishLoraInput {
  creatorId: number;
  name: string;
  description?: string;
  previewImages?: string[]; // URLs
  license: LoraLicense;
  priceCents: number;
  tags?: string[];
  category: LoraCategory;
  loraFileKey?: string;
  loraFileUrl?: string;
  baseModelId?: string;
  trainingCreditsUsed?: number;
}

export interface BrowseOptions {
  category?: LoraCategory;
  search?: string;
  sortBy?: LoraSortBy;
  limit?: number;
  offset?: number;
  creatorId?: number;
  freeOnly?: boolean;
}

export interface LoraWithRating extends LoraMarketplaceEntry {
  averageRating: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Revenue share percentage for marketplace creators */
export const CREATOR_REVENUE_SHARE = 0.70; // 70% to creator

/** Credits saved when using a base LoRA vs training from scratch */
export const BASE_LORA_SAVINGS = 90; // 120 - 30 = 90 credits saved

/** Full training cost from scratch */
export const FULL_TRAINING_COST = 120;

/** Training cost when starting from a base LoRA */
export const BASE_LORA_TRAINING_COST = 30;

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Publish a LoRA to the marketplace.
 */
export async function publishLora(input: PublishLoraInput): Promise<LoraMarketplaceEntry> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(loraMarketplace).values({
    creatorId: input.creatorId,
    name: input.name,
    description: input.description ?? null,
    previewImages: input.previewImages ? JSON.stringify(input.previewImages) : null,
    license: input.license,
    priceCents: input.priceCents,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    category: input.category,
    loraFileKey: input.loraFileKey ?? null,
    loraFileUrl: input.loraFileUrl ?? null,
    baseModelId: input.baseModelId ?? null,
    trainingCreditsUsed: input.trainingCreditsUsed ?? null,
    isPublished: 1,
  });

  const insertId = result[0].insertId;
  const [created] = await db
    .select()
    .from(loraMarketplace)
    .where(eq(loraMarketplace.id, insertId));

  return created;
}

/**
 * Browse marketplace listings with filtering and sorting.
 */
export async function browseLoras(options: BrowseOptions = {}): Promise<{
  items: LoraWithRating[];
  total: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const conditions: any[] = [eq(loraMarketplace.isPublished, 1)];

  if (options.category) {
    conditions.push(eq(loraMarketplace.category, options.category));
  }
  if (options.creatorId) {
    conditions.push(eq(loraMarketplace.creatorId, options.creatorId));
  }
  if (options.freeOnly) {
    conditions.push(eq(loraMarketplace.priceCents, 0));
  }
  if (options.search) {
    const searchPattern = `%${options.search}%`;
    conditions.push(
      or(
        like(loraMarketplace.name, searchPattern),
        like(loraMarketplace.description, searchPattern),
        like(loraMarketplace.tags, searchPattern),
      ),
    );
  }

  // Determine sort order
  let orderBy;
  switch (options.sortBy) {
    case "popular":
      orderBy = desc(loraMarketplace.downloads);
      break;
    case "rating":
      orderBy = desc(loraMarketplace.ratingSum);
      break;
    case "downloads":
      orderBy = desc(loraMarketplace.downloads);
      break;
    case "newest":
    default:
      orderBy = desc(loraMarketplace.createdAt);
      break;
  }

  const items = await db
    .select()
    .from(loraMarketplace)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(loraMarketplace)
    .where(and(...conditions));

  const itemsWithRating: LoraWithRating[] = items.map((item) => ({
    ...item,
    averageRating: item.ratingCount > 0
      ? Math.round((item.ratingSum / item.ratingCount) * 10) / 10
      : 0,
  }));

  return { items: itemsWithRating, total: countResult.count };
}

/**
 * Get a single LoRA listing by ID.
 */
export async function getLoraById(id: number): Promise<LoraWithRating | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [item] = await db
    .select()
    .from(loraMarketplace)
    .where(eq(loraMarketplace.id, id));

  if (!item) return null;

  return {
    ...item,
    averageRating: item.ratingCount > 0
      ? Math.round((item.ratingSum / item.ratingCount) * 10) / 10
      : 0,
  };
}

/**
 * Record a download and increment the counter.
 */
export async function recordDownload(loraId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(loraMarketplace)
    .set({ downloads: sql`${loraMarketplace.downloads} + 1` })
    .where(eq(loraMarketplace.id, loraId));
}

/**
 * Add a review for a LoRA.
 */
export async function addReview(
  loraId: number,
  userId: number,
  rating: number,
  comment?: string,
): Promise<LoraReview> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (rating < 1 || rating > 5) throw new Error("Rating must be 1-5");

  // Check for existing review
  const [existing] = await db
    .select()
    .from(loraMarketplaceReviews)
    .where(
      and(
        eq(loraMarketplaceReviews.loraId, loraId),
        eq(loraMarketplaceReviews.userId, userId),
      ),
    );

  if (existing) throw new Error("User has already reviewed this LoRA");

  // Insert review
  const result = await db.insert(loraMarketplaceReviews).values({
    loraId,
    userId,
    rating,
    comment: comment ?? null,
  });

  // Update aggregate rating on the LoRA
  await db
    .update(loraMarketplace)
    .set({
      ratingSum: sql`${loraMarketplace.ratingSum} + ${rating}`,
      ratingCount: sql`${loraMarketplace.ratingCount} + 1`,
    })
    .where(eq(loraMarketplace.id, loraId));

  const insertId = result[0].insertId;
  const [created] = await db
    .select()
    .from(loraMarketplaceReviews)
    .where(eq(loraMarketplaceReviews.id, insertId));

  return created;
}

/**
 * Get reviews for a LoRA.
 */
export async function getReviews(
  loraId: number,
  limit = 20,
  offset = 0,
): Promise<{ items: LoraReview[]; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const items = await db
    .select()
    .from(loraMarketplaceReviews)
    .where(eq(loraMarketplaceReviews.loraId, loraId))
    .orderBy(desc(loraMarketplaceReviews.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(loraMarketplaceReviews)
    .where(eq(loraMarketplaceReviews.loraId, loraId));

  return { items, total: countResult.count };
}

/**
 * Calculate revenue share for a marketplace sale.
 */
export function calculateRevenueShare(priceCents: number): {
  creatorEarnings: number;
  platformFee: number;
} {
  const creatorEarnings = Math.round(priceCents * CREATOR_REVENUE_SHARE);
  return {
    creatorEarnings,
    platformFee: priceCents - creatorEarnings,
  };
}

/**
 * Calculate training cost savings when using a base LoRA.
 */
export function calculateTrainingSavings(baseLoraId?: number): {
  fullCost: number;
  withBaseCost: number;
  savings: number;
  savingsPercent: number;
} {
  if (!baseLoraId) {
    return {
      fullCost: FULL_TRAINING_COST,
      withBaseCost: FULL_TRAINING_COST,
      savings: 0,
      savingsPercent: 0,
    };
  }

  return {
    fullCost: FULL_TRAINING_COST,
    withBaseCost: BASE_LORA_TRAINING_COST,
    savings: BASE_LORA_SAVINGS,
    savingsPercent: Math.round((BASE_LORA_SAVINGS / FULL_TRAINING_COST) * 100),
  };
}

/**
 * Unpublish a LoRA (soft delete).
 */
export async function unpublishLora(loraId: number, creatorId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(loraMarketplace)
    .set({ isPublished: 0 })
    .where(
      and(
        eq(loraMarketplace.id, loraId),
        eq(loraMarketplace.creatorId, creatorId),
      ),
    );

  return (result[0] as any).affectedRows > 0;
}
