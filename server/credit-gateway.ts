/**
 * Credit Gateway — Pre-flight affordability check for all paid API calls.
 *
 * Every generation action (video, image, voice, music, script, etc.) MUST pass
 * through this gateway before the actual provider call fires.
 *
 * Flow:
 *   1. Caller invokes `authorizeAndHold(userId, action, meta)`
 *   2. Gateway checks available balance >= cost
 *   3. If affordable → places a HOLD via the ledger, returns a HoldTicket
 *   4. Caller executes the provider API call
 *   5. On success → `commitTicket(ticket)` converts hold to committed spend
 *   6. On failure → `releaseTicket(ticket)` releases the hold back to available
 *
 * This module does NOT modify the existing video/image/voice generation code.
 * It provides a clean wrapper that routers call before and after generation.
 */

import { holdCredits, commitHold, releaseHold, refundCredits, getBalance } from "./credit-ledger";
import { getSubscriptionByUserId } from "./db-phase6";
import { TIERS, CREDIT_COSTS, normalizeTier, type TierKey } from "./stripe/products";
import { getDb } from "./db";
import { usageEvents, episodeCosts } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────

export interface HoldTicket {
  holdId: string;
  userId: number;
  creditsHeld: number;
  action: string;
  modelTier?: string;
  episodeId?: number;
  projectId?: number;
  createdAt: number;
}

export type GenerationAction =
  | "video_5s_budget" | "video_5s_standard" | "video_5s_premium"
  | "video_10s_budget" | "video_10s_standard" | "video_10s_premium"
  | "voice_synthesis" | "voice_clone"
  | "script_generation"
  | "panel_generation" | "image_upscale"
  | "music_generation"
  | "sfx_generation" | "narrator_generation"
  | "lora_train";

export interface AuthorizationMeta {
  episodeId?: number;
  projectId?: number;
  panelId?: number;
  provider?: string;
  modelName?: string;
  modelTier?: string;
  description?: string;
}

export interface AuthorizationResult {
  authorized: boolean;
  ticket?: HoldTicket;
  error?: string;
  balance?: { available: number; committed: number; holds: number };
  suggestedAction?: "upgrade" | "buy_pack" | "wait";
}

// ─── Core Gateway Functions ─────────────────────────────────────────────

/**
 * Pre-flight check: verify the user can afford the action and place a hold.
 * Returns a HoldTicket on success, or an error with suggested remediation.
 */
export async function authorizeAndHold(
  userId: number,
  action: GenerationAction,
  meta: AuthorizationMeta = {}
): Promise<AuthorizationResult> {
  const creditCost = CREDIT_COSTS[action];
  if (creditCost === undefined) {
    return { authorized: false, error: `Unknown action: ${action}` };
  }

  if (creditCost === 0) {
    // Free actions don't need holds
    return {
      authorized: true,
      ticket: {
        holdId: `free_${Date.now()}`,
        userId,
        creditsHeld: 0,
        action,
        createdAt: Date.now(),
      },
    };
  }

  // Check tier-based model access
  const sub = await getSubscriptionByUserId(userId);
  const tier = normalizeTier(sub?.tier || "free_trial") as TierKey;
  const tierConfig = TIERS[tier];

  if (meta.modelTier && !tierConfig.allowedModelTiers.includes(meta.modelTier)) {
    return {
      authorized: false,
      error: `Your ${tierConfig.name} plan does not include ${meta.modelTier} model tier. Upgrade to access it.`,
      suggestedAction: "upgrade",
    };
  }

  // Check concurrent generation limit
  const balance = await getBalance(userId);

  // Check affordability
  if (balance.availableBalance < creditCost) {
    return {
      authorized: false,
      error: `Insufficient credits. This action costs ${creditCost} credits but you only have ${balance.availableBalance} available.`,
      balance: {
        available: balance.availableBalance,
        committed: balance.committedBalance,
        holds: balance.activeHolds,
      },
      suggestedAction: balance.committedBalance + balance.activeHolds > 0 ? "wait" : "buy_pack",
    };
  }

  // Place hold
  try {
    const holdResult = await holdCredits(
      userId,
      creditCost,
      action,
      meta.episodeId
    );

    if (!holdResult.success || !holdResult.holdId) {
      return {
        authorized: false,
        error: holdResult.reason || "Failed to place credit hold",
        suggestedAction: "buy_pack",
      };
    }

    const ticket: HoldTicket = {
      holdId: holdResult.holdId,
      userId,
      creditsHeld: creditCost,
      action,
      modelTier: meta.modelTier,
      episodeId: meta.episodeId,
      projectId: meta.projectId,
      createdAt: Date.now(),
    };

    return {
      authorized: true,
      ticket,
      balance: {
        available: holdResult.availableBalance || 0,
        committed: balance.committedBalance,
        holds: balance.activeHolds + creditCost,
      },
    };
  } catch (err: any) {
    return {
      authorized: false,
      error: err.message || "Failed to place credit hold",
      suggestedAction: "buy_pack",
    };
  }
}

/**
 * Commit a hold after successful generation.
 * Records the usage event and updates episode costs.
 */
export async function commitTicket(
  ticket: HoldTicket,
  result: {
    provider?: string;
    modelName?: string;
    modelTier?: string;
    usdCostCents?: number;
    apiCallType?: string;
  } = {}
): Promise<void> {
  if (ticket.creditsHeld === 0) return; // Free action, no hold to commit

  // Commit the hold in the ledger
  const { ledgerEntryId } = await commitHold(
    ticket.holdId,
    ticket.creditsHeld
  );

  // Record usage event
  const db = await getDb();
  if (db) {
    try {
      await db.insert(usageEvents).values({
        userId: ticket.userId,
        episodeId: ticket.episodeId || null,
        provider: result.provider || "unknown",
        modelName: result.modelName || ticket.action,
        modelTier: result.modelTier || ticket.modelTier || "standard",
        apiCallType: result.apiCallType || ticket.action,
        usdCostCents: result.usdCostCents || 0,
        creditsConsumed: ticket.creditsHeld,
        holdLedgerId: null, // The hold entry
        commitLedgerId: ledgerEntryId,
      });

      // Update episode costs if applicable
      if (ticket.episodeId) {
        await updateEpisodeCosts(ticket.userId, ticket.episodeId, ticket.action, ticket.creditsHeld, result.usdCostCents || 0);
      }
    } catch (err) {
      console.error("[CreditGateway] Failed to record usage event:", err);
      // Don't throw — the hold is already committed, usage tracking is best-effort
    }
  }
}

/**
 * Release a hold after a failed generation (refund the credits).
 */
export async function releaseTicket(
  ticket: HoldTicket,
  reason?: string
): Promise<void> {
  if (ticket.creditsHeld === 0) return; // Free action, no hold to release

  await releaseHold(ticket.holdId);
}

/**
 * Quick check: can the user afford an action without placing a hold?
 * Useful for UI to show/disable buttons.
 */
export async function canAfford(
  userId: number,
  action: GenerationAction
): Promise<{ affordable: boolean; cost: number; available: number }> {
  const cost = CREDIT_COSTS[action] || 0;
  if (cost === 0) return { affordable: true, cost: 0, available: 0 };

  const balance = await getBalance(userId);
  return {
    affordable: balance.availableBalance >= cost,
    cost,
    available: balance.availableBalance,
  };
}

/**
 * Batch affordability check for multiple actions.
 */
export async function canAffordBatch(
  userId: number,
  actions: GenerationAction[]
): Promise<{ affordable: boolean; totalCost: number; available: number; breakdown: Record<string, number> }> {
  const balance = await getBalance(userId);
  let totalCost = 0;
  const breakdown: Record<string, number> = {};

  for (const action of actions) {
    const cost = CREDIT_COSTS[action] || 0;
    totalCost += cost;
    breakdown[action] = (breakdown[action] || 0) + cost;
  }

  return {
    affordable: balance.availableBalance >= totalCost,
    totalCost,
    available: balance.availableBalance,
    breakdown,
  };
}

// ─── Episode Cost Aggregation ───────────────────────────────────────────

async function updateEpisodeCosts(
  userId: number,
  episodeId: number,
  action: string,
  credits: number,
  usdCostCents: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Determine which cost category this action falls into
  const category = getCostCategory(action);

  // Upsert episode_costs row
  const existing = await db.select().from(episodeCosts)
    .where(and(eq(episodeCosts.episodeId, episodeId), eq(episodeCosts.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    const updates: Record<string, any> = {
      totalCredits: sql`${episodeCosts.totalCredits} + ${credits}`,
      totalUsdCents: sql`${episodeCosts.totalUsdCents} + ${usdCostCents}`,
    };

    // Increment the specific category
    if (category === "video") {
      updates.videoCostCredits = sql`${episodeCosts.videoCostCredits} + ${credits}`;
    } else if (category === "voice") {
      updates.voiceCostCredits = sql`${episodeCosts.voiceCostCredits} + ${credits}`;
    } else if (category === "music") {
      updates.musicCostCredits = sql`${episodeCosts.musicCostCredits} + ${credits}`;
    } else if (category === "script") {
      updates.scriptCostCredits = sql`${episodeCosts.scriptCostCredits} + ${credits}`;
    } else if (category === "image") {
      updates.imageCostCredits = sql`${episodeCosts.imageCostCredits} + ${credits}`;
    }

    await db.update(episodeCosts).set(updates)
      .where(and(eq(episodeCosts.episodeId, episodeId), eq(episodeCosts.userId, userId)));
  } else {
    // Create new episode cost record
    const values: any = {
      episodeId,
      userId,
      totalCredits: credits,
      totalUsdCents: usdCostCents,
      videoCostCredits: 0,
      voiceCostCredits: 0,
      musicCostCredits: 0,
      postProcessingCostCredits: 0,
      scriptCostCredits: 0,
      imageCostCredits: 0,
      status: "in_progress",
    };

    if (category === "video") { values.videoCostCredits = credits; }
    else if (category === "voice") { values.voiceCostCredits = credits; }
    else if (category === "music") { values.musicCostCredits = credits; }
    else if (category === "script") { values.scriptCostCredits = credits; }
    else if (category === "image") { values.imageCostCredits = credits; }

    await db.insert(episodeCosts).values(values);
  }
}

function getCostCategory(action: string): "video" | "voice" | "music" | "script" | "image" {
  if (action.startsWith("video_")) return "video";
  if (action.includes("voice") || action.includes("narrator")) return "voice";
  if (action.includes("music") || action.includes("sfx")) return "music";
  if (action.includes("script")) return "script";
  return "image"; // panel_generation, image_upscale, lora_train
}

// ─── Exported Cost Lookup ───────────────────────────────────────────────

export function getCreditCost(action: GenerationAction): number {
  return CREDIT_COSTS[action] || 0;
}

export function getAllCreditCosts(): Record<string, number> {
  return { ...CREDIT_COSTS };
}
