/**
 * Milestone 8: Batch Assembly Queue
 *
 * Orchestrates sequential assembly + stream delivery for multiple episodes.
 * Studio Pro users can queue up to 10 episodes, Creator up to 3, free_trial 1.
 * Max 1 assembly running per user at a time. Auto-advances after completion.
 */

import { getDb } from "./db";
import { assemblyQueue, episodes, videoSlices, projects } from "../drizzle/schema";
import { eq, and, asc, inArray, sql, desc } from "drizzle-orm";
import { assembleEpisodeWithCredits } from "./video-assembler";
import { deliverToStream } from "./stream-delivery";
import { getUserSubscriptionTier } from "./db";
import { serverLog } from "./observability/logger";
import crypto from "crypto";

// ─── Tier Limits ──────────────────────────────────────────────────────────

export const BATCH_LIMITS: Record<string, number> = {
  free_trial: 1,
  creator: 3,
  creator_pro: 5,
  studio: 8,
  studio_pro: 10,
  enterprise: 20,
};

export function getBatchLimit(tier: string): number {
  return BATCH_LIMITS[tier] ?? 1;
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface BatchEnqueueResult {
  batchId: string;
  totalQueued: number;
  estimatedTotalCredits: number;
  items: Array<{
    episodeId: number;
    position: number;
    estimatedCredits: number;
  }>;
}

export interface QueueDashboardItem {
  id: number;
  episodeId: number;
  projectId: number;
  episodeTitle: string;
  projectTitle: string;
  batchId: string;
  status: "queued" | "assembling" | "streaming" | "completed" | "failed";
  position: number;
  priority: number;
  error: string | null;
  retryCount: number;
  estimatedCredits: number;
  actualCredits: number | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  estimatedWaitMinutes: number;
}

export interface QueueDashboard {
  items: QueueDashboardItem[];
  totalQueued: number;
  totalRunning: number;
  totalCompleted: number;
  totalFailed: number;
  currentBatchId: string | null;
}

export interface BatchEstimate {
  episodeCount: number;
  totalEstimatedCredits: number;
  estimatedTotalMinutes: number;
  perEpisode: Array<{
    episodeId: number;
    title: string;
    sliceCount: number;
    estimatedCredits: number;
    estimatedMinutes: number;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────

const ASSEMBLY_CREDITS_PER_EPISODE = 2;
const ESTIMATED_MINUTES_PER_EPISODE = 5;

// ─── Core Functions ───────────────────────────────────────────────────────

/**
 * Validate that episodes are ready for batch assembly.
 * Returns validated episode IDs and any errors.
 */
export async function validateEpisodesForBatch(
  userId: number,
  episodeIds: number[],
): Promise<{ valid: number[]; errors: Array<{ episodeId: number; reason: string }> }> {
  const db = await getDb();
  if (!db) return { valid: [], errors: episodeIds.map(id => ({ episodeId: id, reason: "Database unavailable" })) };

  const valid: number[] = [];
  const errors: Array<{ episodeId: number; reason: string }> = [];

  for (const episodeId of episodeIds) {
    // Check episode exists and belongs to user
    const [episode] = await db
      .select({
        id: episodes.id,
        projectId: episodes.projectId,
        videoUrl: episodes.videoUrl,
      })
      .from(episodes)
      .innerJoin(projects, eq(projects.id, episodes.projectId))
      .where(and(eq(episodes.id, episodeId), eq(projects.userId, userId)));

    if (!episode) {
      errors.push({ episodeId, reason: "Episode not found or not owned by user" });
      continue;
    }

    // Check episode has video slices with generated clips
    const slices = await db
      .select({ id: videoSlices.id, videoClipUrl: videoSlices.videoClipUrl })
      .from(videoSlices)
      .where(eq(videoSlices.episodeId, episodeId));

    if (slices.length === 0) {
      errors.push({ episodeId, reason: "No video slices found" });
      continue;
    }

    const readySlices = slices.filter(s => s.videoClipUrl !== null);
    if (readySlices.length < slices.length) {
      errors.push({
        episodeId,
        reason: `Only ${readySlices.length}/${slices.length} slices have generated video clips`,
      });
      continue;
    }

    // Check not already in queue (queued or assembling)
    const [existing] = await db
      .select({ id: assemblyQueue.id })
      .from(assemblyQueue)
      .where(
        and(
          eq(assemblyQueue.episodeId, episodeId),
          inArray(assemblyQueue.status, ["queued", "assembling", "streaming"]),
        ),
      );

    if (existing) {
      errors.push({ episodeId, reason: "Episode is already in the assembly queue" });
      continue;
    }

    valid.push(episodeId);
  }

  return { valid, errors };
}

/**
 * Enqueue multiple episodes for batch assembly.
 */
export async function enqueueBatchAssembly(
  userId: number,
  episodeIds: number[],
): Promise<BatchEnqueueResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Check tier limits
  const tier = await getUserSubscriptionTier(userId);
  const limit = getBatchLimit(tier);

  // Count existing active queue items
  const [{ activeCount }] = await db
    .select({ activeCount: sql<number>`COUNT(*)` })
    .from(assemblyQueue)
    .where(
      and(
        eq(assemblyQueue.userId, userId),
        inArray(assemblyQueue.status, ["queued", "assembling", "streaming"]),
      ),
    );

  const availableSlots = limit - Number(activeCount);
  if (episodeIds.length > availableSlots) {
    throw new Error(
      `Batch limit exceeded: your ${tier} tier allows ${limit} queued items, ` +
      `you have ${activeCount} active and are trying to add ${episodeIds.length}. ` +
      `Available slots: ${availableSlots}`,
    );
  }

  // Validate episodes
  const { valid, errors } = await validateEpisodesForBatch(userId, episodeIds);
  if (valid.length === 0) {
    throw new Error(
      `No valid episodes to queue. Errors: ${errors.map(e => `${e.episodeId}: ${e.reason}`).join("; ")}`,
    );
  }

  const batchId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const items: BatchEnqueueResult["items"] = [];

  for (let i = 0; i < valid.length; i++) {
    const episodeId = valid[i];
    const position = i + 1;
    const estimatedCredits = ASSEMBLY_CREDITS_PER_EPISODE;

    await db.insert(assemblyQueue).values({
      userId,
      episodeId,
      projectId: (await db.select({ projectId: episodes.projectId }).from(episodes).where(eq(episodes.id, episodeId)))[0].projectId,
      batchId,
      status: "queued",
      priority: 5,
      position,
      estimatedCredits,
      retryCount: 0,
    });

    items.push({ episodeId, position, estimatedCredits });
  }

  serverLog.info("Batch assembly enqueued", {
    userId,
    batchId,
    totalQueued: valid.length,
    episodeIds: valid,
  });

  // Trigger processing of the first item
  processNextInQueue(userId).catch(err => {
    serverLog.error("Failed to start batch processing", { error: String(err), batchId });
  });

  return {
    batchId,
    totalQueued: valid.length,
    estimatedTotalCredits: valid.length * ASSEMBLY_CREDITS_PER_EPISODE,
    items,
  };
}

/**
 * Process the next queued item for a user.
 * Max 1 assembly running per user at a time.
 */
export async function processNextInQueue(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if user already has a running assembly
  const [running] = await db
    .select({ id: assemblyQueue.id })
    .from(assemblyQueue)
    .where(
      and(
        eq(assemblyQueue.userId, userId),
        inArray(assemblyQueue.status, ["assembling", "streaming"]),
      ),
    );

  if (running) {
    serverLog.info("User already has running assembly, skipping", { userId });
    return;
  }

  // Get next queued item (ordered by priority ASC, then queuedAt ASC)
  const [nextItem] = await db
    .select()
    .from(assemblyQueue)
    .where(
      and(
        eq(assemblyQueue.userId, userId),
        eq(assemblyQueue.status, "queued"),
      ),
    )
    .orderBy(asc(assemblyQueue.priority), asc(assemblyQueue.queuedAt))
    .limit(1);

  if (!nextItem) {
    serverLog.info("No queued items for user", { userId });
    return;
  }

  // Mark as assembling
  await db
    .update(assemblyQueue)
    .set({ status: "assembling", startedAt: new Date() })
    .where(eq(assemblyQueue.id, nextItem.id));

  try {
    // Run assembly
    const result = await assembleEpisodeWithCredits(
      nextItem.episodeId,
      userId,
      nextItem.projectId,
    );

    // Mark as streaming
    await db
      .update(assemblyQueue)
      .set({ status: "streaming", actualCredits: ASSEMBLY_CREDITS_PER_EPISODE })
      .where(eq(assemblyQueue.id, nextItem.id));

    // Deliver to Cloudflare Stream
    try {
      await deliverToStream(nextItem.episodeId);
    } catch (streamErr) {
      serverLog.warn("Stream delivery failed but assembly succeeded", {
        episodeId: nextItem.episodeId,
        error: String(streamErr),
      });
    }

    // Mark as completed
    await db
      .update(assemblyQueue)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assemblyQueue.id, nextItem.id));

    serverLog.info("Batch assembly item completed", {
      queueItemId: nextItem.id,
      episodeId: nextItem.episodeId,
      batchId: nextItem.batchId,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .update(assemblyQueue)
      .set({
        status: "failed",
        error: errorMsg,
        completedAt: new Date(),
        retryCount: (nextItem.retryCount ?? 0) + 1,
      })
      .where(eq(assemblyQueue.id, nextItem.id));

    serverLog.error("Batch assembly item failed", {
      queueItemId: nextItem.id,
      episodeId: nextItem.episodeId,
      error: errorMsg,
    });
  }

  // Auto-advance: process next item
  processNextInQueue(userId).catch(err => {
    serverLog.error("Failed to auto-advance queue", { userId, error: String(err) });
  });
}

/**
 * Get the queue dashboard for a user.
 */
export async function getQueueDashboard(userId: number): Promise<QueueDashboard> {
  const db = await getDb();
  if (!db) {
    return { items: [], totalQueued: 0, totalRunning: 0, totalCompleted: 0, totalFailed: 0, currentBatchId: null };
  }

  const rows = await db
    .select({
      id: assemblyQueue.id,
      episodeId: assemblyQueue.episodeId,
      projectId: assemblyQueue.projectId,
      episodeTitle: episodes.title,
      projectTitle: projects.title,
      batchId: assemblyQueue.batchId,
      status: assemblyQueue.status,
      position: assemblyQueue.position,
      priority: assemblyQueue.priority,
      error: assemblyQueue.error,
      retryCount: assemblyQueue.retryCount,
      estimatedCredits: assemblyQueue.estimatedCredits,
      actualCredits: assemblyQueue.actualCredits,
      queuedAt: assemblyQueue.queuedAt,
      startedAt: assemblyQueue.startedAt,
      completedAt: assemblyQueue.completedAt,
    })
    .from(assemblyQueue)
    .innerJoin(episodes, eq(episodes.id, assemblyQueue.episodeId))
    .innerJoin(projects, eq(projects.id, assemblyQueue.projectId))
    .where(eq(assemblyQueue.userId, userId))
    .orderBy(desc(assemblyQueue.queuedAt));

  // Calculate wait estimates
  let queuePosition = 0;
  const items: QueueDashboardItem[] = rows.map(row => {
    if (row.status === "queued") queuePosition++;
    return {
      ...row,
      status: row.status as QueueDashboardItem["status"],
      episodeTitle: row.episodeTitle ?? `Episode ${row.episodeId}`,
      projectTitle: row.projectTitle ?? `Project ${row.projectId}`,
      estimatedCredits: row.estimatedCredits ?? 0,
      estimatedWaitMinutes:
        row.status === "queued"
          ? queuePosition * ESTIMATED_MINUTES_PER_EPISODE
          : 0,
    };
  });

  const totalQueued = items.filter(i => i.status === "queued").length;
  const totalRunning = items.filter(i => i.status === "assembling" || i.status === "streaming").length;
  const totalCompleted = items.filter(i => i.status === "completed").length;
  const totalFailed = items.filter(i => i.status === "failed").length;

  // Find the most recent active batch
  const activeBatch = items.find(i => i.status === "queued" || i.status === "assembling" || i.status === "streaming");
  const currentBatchId = activeBatch?.batchId ?? null;

  return { items, totalQueued, totalRunning, totalCompleted, totalFailed, currentBatchId };
}

/**
 * Cancel a queued item (only if status is "queued").
 */
export async function cancelQueueItem(
  userId: number,
  queueItemId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const [item] = await db
    .select()
    .from(assemblyQueue)
    .where(and(eq(assemblyQueue.id, queueItemId), eq(assemblyQueue.userId, userId)));

  if (!item) {
    return { success: false, error: "Queue item not found" };
  }

  if (item.status !== "queued") {
    return { success: false, error: `Cannot cancel item with status "${item.status}". Only queued items can be cancelled.` };
  }

  await db
    .update(assemblyQueue)
    .set({ status: "failed", error: "Cancelled by user", completedAt: new Date() })
    .where(eq(assemblyQueue.id, queueItemId));

  return { success: true };
}

/**
 * Retry a failed queue item.
 */
export async function retryFailedItem(
  userId: number,
  queueItemId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const [item] = await db
    .select()
    .from(assemblyQueue)
    .where(and(eq(assemblyQueue.id, queueItemId), eq(assemblyQueue.userId, userId)));

  if (!item) {
    return { success: false, error: "Queue item not found" };
  }

  if (item.status !== "failed") {
    return { success: false, error: `Cannot retry item with status "${item.status}". Only failed items can be retried.` };
  }

  // Reset to queued
  await db
    .update(assemblyQueue)
    .set({
      status: "queued",
      error: null,
      startedAt: null,
      completedAt: null,
    })
    .where(eq(assemblyQueue.id, queueItemId));

  // Trigger processing
  processNextInQueue(userId).catch(err => {
    serverLog.error("Failed to start retry processing", { error: String(err), queueItemId });
  });

  return { success: true };
}

/**
 * Get batch estimate for a set of episodes.
 */
export async function getBatchEstimate(
  userId: number,
  episodeIds: number[],
): Promise<BatchEstimate> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const perEpisode: BatchEstimate["perEpisode"] = [];

  for (const episodeId of episodeIds) {
    const [episode] = await db
      .select({ id: episodes.id, title: episodes.title })
      .from(episodes)
      .where(eq(episodes.id, episodeId));

    const slices = await db
      .select({ id: videoSlices.id })
      .from(videoSlices)
      .where(eq(videoSlices.episodeId, episodeId));

    perEpisode.push({
      episodeId,
      title: episode?.title ?? `Episode ${episodeId}`,
      sliceCount: slices.length,
      estimatedCredits: ASSEMBLY_CREDITS_PER_EPISODE,
      estimatedMinutes: ESTIMATED_MINUTES_PER_EPISODE,
    });
  }

  return {
    episodeCount: episodeIds.length,
    totalEstimatedCredits: episodeIds.length * ASSEMBLY_CREDITS_PER_EPISODE,
    estimatedTotalMinutes: episodeIds.length * ESTIMATED_MINUTES_PER_EPISODE,
    perEpisode,
  };
}
