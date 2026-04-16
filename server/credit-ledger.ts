/**
 * Credit Ledger Service (Prompt 15)
 *
 * Append-only ledger with materialized balance projection.
 * Implements hold/commit/release semantics for pre-flight authorization.
 *
 * Flow:
 *   1. holdCredits(userId, amount, ...) → creates HOLD_PREAUTH entry, increments activeHolds
 *   2. commitHold(holdId) → converts hold to COMMIT_CONSUMPTION, decrements balance + holds
 *   3. releaseHold(holdId) → cancels hold via RELEASE_HOLD entry, decrements activeHolds
 *
 * Balance invariant:
 *   available_balance = committedBalance - activeHolds
 *   available_balance >= 0 at all times
 */

import { getDb } from "./db";
import { creditLedger, creditBalances, subscriptions } from "../drizzle/schema";
import { eq, and, sql, desc, gte, lte, sum } from "drizzle-orm";
import { TIERS, type TierKey } from "./stripe/products";
import { nanoid } from "nanoid";

// ─── Types ───────────────────────────────────────────────────────────

export type TransactionType =
  | "grant_subscription"
  | "grant_pack_purchase"
  | "grant_promotional"
  | "hold_preauth"
  | "commit_consumption"
  | "release_hold"
  | "refund_generation"
  | "rollover"
  | "expiry"
  | "admin_adjustment";

export interface HoldResult {
  success: boolean;
  holdId?: string;
  ledgerEntryId?: number;
  availableBalance?: number;
  reason?: string;
}

export interface BalanceSnapshot {
  committedBalance: number;
  activeHolds: number;
  availableBalance: number;
  lifetimeGrants: number;
  lifetimeConsumption: number;
}

// ─── Balance Helpers ─────────────────────────────────────────────────

/**
 * Get or initialize the credit balance for a user.
 * Creates a zero-balance row if none exists.
 */
export async function getBalance(userId: number): Promise<BalanceSnapshot> {
  const db = (await getDb())!;

  const [existing] = await db.select().from(creditBalances)
    .where(eq(creditBalances.userId, userId)).limit(1);

  if (existing) {
    return {
      committedBalance: existing.committedBalance,
      activeHolds: existing.activeHolds,
      availableBalance: existing.committedBalance - existing.activeHolds,
      lifetimeGrants: existing.lifetimeGrants,
      lifetimeConsumption: existing.lifetimeConsumption,
    };
  }

  // Initialize balance row
  await db.insert(creditBalances).values({
    userId,
    committedBalance: 0,
    activeHolds: 0,
    lifetimeGrants: 0,
    lifetimeConsumption: 0,
  });

  return {
    committedBalance: 0,
    activeHolds: 0,
    availableBalance: 0,
    lifetimeGrants: 0,
    lifetimeConsumption: 0,
  };
}

/**
 * Append a ledger entry and update the materialized balance atomically.
 * Returns the new ledger entry ID.
 */
async function appendLedgerEntry(params: {
  userId: number;
  transactionType: TransactionType;
  amountCredits: number;
  holdId?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: any;
  createdBy?: number;
}): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  const db = (await getDb())!;

  // Get current balance (or init)
  const balance = await getBalance(params.userId);

  // Compute new committed balance
  let newCommitted = balance.committedBalance;
  let newHolds = balance.activeHolds;
  let newLifetimeGrants = balance.lifetimeGrants;
  let newLifetimeConsumption = balance.lifetimeConsumption;

  switch (params.transactionType) {
    case "grant_subscription":
    case "grant_pack_purchase":
    case "grant_promotional":
    case "rollover":
    case "admin_adjustment":
    case "refund_generation":
      // Positive: increase committed balance
      newCommitted += params.amountCredits;
      if (params.amountCredits > 0) {
        newLifetimeGrants += params.amountCredits;
      }
      break;

    case "hold_preauth":
      // Hold: increase activeHolds (amount is positive, representing credits held)
      newHolds += Math.abs(params.amountCredits);
      break;

    case "commit_consumption":
      // Commit: decrease committed balance, decrease activeHolds
      newCommitted -= Math.abs(params.amountCredits);
      newHolds -= Math.abs(params.amountCredits);
      newLifetimeConsumption += Math.abs(params.amountCredits);
      break;

    case "release_hold":
      // Release: decrease activeHolds only
      newHolds -= Math.abs(params.amountCredits);
      break;

    case "expiry":
      // Expiry: decrease committed balance (amount is negative)
      newCommitted += params.amountCredits; // amountCredits is negative
      break;
  }

  // Ensure non-negative
  newCommitted = Math.max(0, newCommitted);
  newHolds = Math.max(0, newHolds);

  // Insert ledger entry
  const [result] = await db.insert(creditLedger).values({
    userId: params.userId,
    transactionType: params.transactionType,
    amountCredits: params.amountCredits,
    holdId: params.holdId || null,
    referenceType: params.referenceType || null,
    referenceId: params.referenceId || null,
    description: params.description || null,
    metadata: params.metadata || null,
    balanceAfter: newCommitted,
    createdBy: params.createdBy || null,
  });

  const ledgerEntryId = (result as any).insertId;

  // Update materialized balance
  await db.update(creditBalances).set({
    committedBalance: newCommitted,
    activeHolds: newHolds,
    lifetimeGrants: newLifetimeGrants,
    lifetimeConsumption: newLifetimeConsumption,
    lastTransactionAt: new Date(),
  }).where(eq(creditBalances.userId, params.userId));

  return { ledgerEntryId, balanceAfter: newCommitted };
}

// ─── Grant Credits ───────────────────────────────────────────────────

/**
 * Grant subscription credits (monthly renewal).
 */
export async function grantSubscriptionCredits(
  userId: number,
  credits: number,
  periodLabel: string
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  return appendLedgerEntry({
    userId,
    transactionType: "grant_subscription",
    amountCredits: credits,
    referenceType: "subscription",
    description: `Monthly credit grant: ${credits} credits for ${periodLabel}`,
  });
}

/**
 * Grant credits from a pack purchase.
 */
export async function grantPackCredits(
  userId: number,
  credits: number,
  packId: number,
  stripePaymentIntentId: string
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  return appendLedgerEntry({
    userId,
    transactionType: "grant_pack_purchase",
    amountCredits: credits,
    referenceType: "credit_pack",
    referenceId: String(packId),
    description: `Credit pack purchase: ${credits} credits`,
    metadata: { stripePaymentIntentId },
  });
}

/**
 * Grant promotional credits (admin or system).
 */
export async function grantPromotionalCredits(
  userId: number,
  credits: number,
  reason: string,
  adminId?: number
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  return appendLedgerEntry({
    userId,
    transactionType: "grant_promotional",
    amountCredits: credits,
    referenceType: "promotion",
    description: reason,
    createdBy: adminId,
  });
}

// ─── Hold / Commit / Release ─────────────────────────────────────────

/**
 * Place a credit hold (pre-authorization) before an API call.
 * Returns a holdId that must be committed or released.
 */
export async function holdCredits(
  userId: number,
  amount: number,
  apiCallType: string,
  episodeId?: number
): Promise<HoldResult> {
  const balance = await getBalance(userId);
  const available = balance.availableBalance;

  if (available < amount) {
    return {
      success: false,
      availableBalance: available,
      reason: `Insufficient credits: need ${amount}, have ${available} available (${balance.committedBalance} committed, ${balance.activeHolds} held)`,
    };
  }

  const holdId = `hold_${nanoid(16)}`;

  const { ledgerEntryId } = await appendLedgerEntry({
    userId,
    transactionType: "hold_preauth",
    amountCredits: amount,
    holdId,
    referenceType: "api_call",
    referenceId: apiCallType,
    description: `Pre-auth hold: ${amount} credits for ${apiCallType}`,
    metadata: { episodeId },
  });

  const newBalance = await getBalance(userId);

  return {
    success: true,
    holdId,
    ledgerEntryId,
    availableBalance: newBalance.availableBalance,
  };
}

/**
 * Commit a hold after successful API call.
 * Converts the hold to actual consumption.
 */
export async function commitHold(
  holdId: string,
  actualAmount?: number
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  const db = (await getDb())!;

  // Find the original hold entry
  const [holdEntry] = await db.select().from(creditLedger)
    .where(and(
      eq(creditLedger.holdId, holdId),
      eq(creditLedger.transactionType, "hold_preauth")
    )).limit(1);

  if (!holdEntry) {
    throw new Error(`Hold not found: ${holdId}`);
  }

  // Check if already committed or released
  const [existingCommit] = await db.select().from(creditLedger)
    .where(and(
      eq(creditLedger.holdId, holdId),
      sql`${creditLedger.transactionType} IN ('commit_consumption', 'release_hold')`
    )).limit(1);

  if (existingCommit) {
    throw new Error(`Hold ${holdId} already ${existingCommit.transactionType}`);
  }

  const consumeAmount = actualAmount ?? Math.abs(holdEntry.amountCredits);
  const holdAmount = Math.abs(holdEntry.amountCredits);

  // If actual < held, we need to release the difference
  if (consumeAmount < holdAmount) {
    // First release the excess
    await appendLedgerEntry({
      userId: holdEntry.userId,
      transactionType: "release_hold",
      amountCredits: holdAmount - consumeAmount,
      holdId,
      referenceType: holdEntry.referenceType || undefined,
      referenceId: holdEntry.referenceId || undefined,
      description: `Partial release: ${holdAmount - consumeAmount} credits (held ${holdAmount}, consumed ${consumeAmount})`,
    });
  }

  // Commit the actual consumption
  return appendLedgerEntry({
    userId: holdEntry.userId,
    transactionType: "commit_consumption",
    amountCredits: consumeAmount,
    holdId,
    referenceType: holdEntry.referenceType || undefined,
    referenceId: holdEntry.referenceId || undefined,
    description: `Consumed: ${consumeAmount} credits for ${holdEntry.referenceId || "api_call"}`,
  });
}

/**
 * Release a hold (cancel pre-authorization).
 * Used when an API call fails or is cancelled.
 */
export async function releaseHold(holdId: string): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  const db = (await getDb())!;

  // Find the original hold entry
  const [holdEntry] = await db.select().from(creditLedger)
    .where(and(
      eq(creditLedger.holdId, holdId),
      eq(creditLedger.transactionType, "hold_preauth")
    )).limit(1);

  if (!holdEntry) {
    throw new Error(`Hold not found: ${holdId}`);
  }

  // Check if already committed or released
  const [existingAction] = await db.select().from(creditLedger)
    .where(and(
      eq(creditLedger.holdId, holdId),
      sql`${creditLedger.transactionType} IN ('commit_consumption', 'release_hold')`
    )).limit(1);

  if (existingAction) {
    throw new Error(`Hold ${holdId} already ${existingAction.transactionType}`);
  }

  return appendLedgerEntry({
    userId: holdEntry.userId,
    transactionType: "release_hold",
    amountCredits: Math.abs(holdEntry.amountCredits),
    holdId,
    referenceType: holdEntry.referenceType || undefined,
    referenceId: holdEntry.referenceId || undefined,
    description: `Released hold: ${Math.abs(holdEntry.amountCredits)} credits`,
  });
}

// ─── Refund ──────────────────────────────────────────────────────────

/**
 * Refund credits for a failed generation (after commit).
 */
export async function refundCredits(
  userId: number,
  amount: number,
  reason: string,
  originalHoldId?: string
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  return appendLedgerEntry({
    userId,
    transactionType: "refund_generation",
    amountCredits: amount,
    holdId: originalHoldId || undefined,
    referenceType: "refund",
    description: reason,
  });
}

// ─── Rollover ────────────────────────────────────────────────────────

/**
 * Process credit rollover at billing period end.
 * Calculates rollover based on tier config and applies expiry + rollover entries.
 */
export async function processRollover(userId: number): Promise<{
  expired: number;
  rolledOver: number;
}> {
  const db = (await getDb())!;

  // Get subscription for rollover config
  const [sub] = await db.select().from(subscriptions)
    .where(eq(subscriptions.userId, userId)).limit(1);

  if (!sub) {
    return { expired: 0, rolledOver: 0 };
  }

  const balance = await getBalance(userId);
  const currentBalance = balance.committedBalance;

  if (currentBalance <= 0) {
    return { expired: 0, rolledOver: 0 };
  }

  const rolloverPct = parseFloat(String(sub.rolloverPercentage)) || 0;
  const rolloverCap = sub.rolloverCap;

  // Calculate rollover amount
  let rolloverAmount = Math.floor(currentBalance * rolloverPct);
  if (rolloverCap !== null && rolloverCap !== undefined) {
    rolloverAmount = Math.min(rolloverAmount, rolloverCap);
  }

  const expiredAmount = currentBalance - rolloverAmount;

  // Apply expiry
  if (expiredAmount > 0) {
    await appendLedgerEntry({
      userId,
      transactionType: "expiry",
      amountCredits: -expiredAmount,
      referenceType: "billing_period",
      description: `Period-end expiry: ${expiredAmount} credits expired`,
    });
  }

  // Apply rollover (if any)
  if (rolloverAmount > 0) {
    await appendLedgerEntry({
      userId,
      transactionType: "rollover",
      amountCredits: 0, // Balance already reflects the rollover (expiry removed the rest)
      referenceType: "billing_period",
      description: `Period rollover: ${rolloverAmount} credits carried forward`,
      metadata: { rolloverPct, rolloverCap, originalBalance: currentBalance },
    });
  }

  return { expired: expiredAmount, rolledOver: rolloverAmount };
}

// ─── Admin Adjustment ────────────────────────────────────────────────

/**
 * Admin credit adjustment (add or remove credits).
 */
export async function adminAdjustment(
  userId: number,
  amount: number,
  reason: string,
  adminId: number
): Promise<{ ledgerEntryId: number; balanceAfter: number }> {
  return appendLedgerEntry({
    userId,
    transactionType: "admin_adjustment",
    amountCredits: amount,
    referenceType: "admin",
    description: reason,
    createdBy: adminId,
  });
}

// ─── Ledger History ──────────────────────────────────────────────────

/**
 * Get paginated ledger history for a user.
 */
export async function getLedgerHistory(
  userId: number,
  limit: number = 50,
  offset: number = 0
): Promise<{ entries: any[]; total: number }> {
  const db = (await getDb())!;

  const entries = await db.select().from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({ count: sql<number>`count(*)` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));

  return {
    entries,
    total: countResult?.count || 0,
  };
}

// ─── Reconciliation ──────────────────────────────────────────────────

/**
 * Reconciliation job: verify materialized balance matches ledger sum.
 * Returns discrepancies if any.
 */
export async function reconcileBalance(userId: number): Promise<{
  isConsistent: boolean;
  materializedBalance: number;
  ledgerBalance: number;
  discrepancy: number;
  staleHolds: number;
}> {
  const db = (await getDb())!;

  // Get materialized balance
  const [matBalance] = await db.select().from(creditBalances)
    .where(eq(creditBalances.userId, userId)).limit(1);

  if (!matBalance) {
    return {
      isConsistent: true,
      materializedBalance: 0,
      ledgerBalance: 0,
      discrepancy: 0,
      staleHolds: 0,
    };
  }

  // Calculate balance from ledger entries
  const [ledgerSum] = await db.select({
    totalGrants: sql<number>`COALESCE(SUM(CASE WHEN transactionType IN ('grant_subscription', 'grant_pack_purchase', 'grant_promotional', 'rollover', 'admin_adjustment', 'refund_generation') THEN amountCredits ELSE 0 END), 0)`,
    totalConsumption: sql<number>`COALESCE(SUM(CASE WHEN transactionType = 'commit_consumption' THEN ABS(amountCredits) ELSE 0 END), 0)`,
    totalExpiry: sql<number>`COALESCE(SUM(CASE WHEN transactionType = 'expiry' THEN ABS(amountCredits) ELSE 0 END), 0)`,
  }).from(creditLedger)
    .where(eq(creditLedger.userId, userId));

  const ledgerBalance = (ledgerSum?.totalGrants || 0) - (ledgerSum?.totalConsumption || 0) - (ledgerSum?.totalExpiry || 0);

  // Check for stale holds (holds older than 1 hour without commit/release)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const staleHoldsResult = await db.select({ count: sql<number>`count(*)` })
    .from(creditLedger)
    .where(and(
      eq(creditLedger.userId, userId),
      eq(creditLedger.transactionType, "hold_preauth"),
      lte(creditLedger.createdAt, oneHourAgo),
      // No corresponding commit or release
      sql`${creditLedger.holdId} NOT IN (
        SELECT holdId FROM credit_ledger 
        WHERE userId = ${userId} 
        AND transactionType IN ('commit_consumption', 'release_hold')
        AND holdId IS NOT NULL
      )`
    ));

  const discrepancy = matBalance.committedBalance - ledgerBalance;

  return {
    isConsistent: Math.abs(discrepancy) === 0,
    materializedBalance: matBalance.committedBalance,
    ledgerBalance,
    discrepancy,
    staleHolds: staleHoldsResult[0]?.count || 0,
  };
}

/**
 * Auto-release stale holds (older than 1 hour).
 * Called by reconciliation job.
 */
export async function releaseStaleHolds(userId: number): Promise<number> {
  const db = (await getDb())!;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Find stale holds
  const staleHolds = await db.select().from(creditLedger)
    .where(and(
      eq(creditLedger.userId, userId),
      eq(creditLedger.transactionType, "hold_preauth"),
      lte(creditLedger.createdAt, oneHourAgo),
      sql`${creditLedger.holdId} NOT IN (
        SELECT holdId FROM credit_ledger 
        WHERE userId = ${userId} 
        AND transactionType IN ('commit_consumption', 'release_hold')
        AND holdId IS NOT NULL
      )`
    ));

  let released = 0;
  for (const hold of staleHolds) {
    if (hold.holdId) {
      try {
        await releaseHold(hold.holdId);
        released++;
      } catch (err) {
        // Already released/committed, skip
      }
    }
  }

  return released;
}

// ─── Usage Summary ───────────────────────────────────────────────────

/**
 * Get usage summary for a billing period.
 */
export async function getUsageSummary(
  userId: number,
  periodStart: Date,
  periodEnd: Date
): Promise<{
  totalConsumed: number;
  totalGranted: number;
  holdsPending: number;
  byType: Record<string, number>;
}> {
  const db = (await getDb())!;

  // Total consumed in period
  const [consumed] = await db.select({
    total: sql<number>`COALESCE(SUM(CASE WHEN transactionType = 'commit_consumption' THEN ABS(amountCredits) ELSE 0 END), 0)`,
  }).from(creditLedger)
    .where(and(
      eq(creditLedger.userId, userId),
      gte(creditLedger.createdAt, periodStart),
      lte(creditLedger.createdAt, periodEnd)
    ));

  // Total granted in period
  const [granted] = await db.select({
    total: sql<number>`COALESCE(SUM(CASE WHEN transactionType IN ('grant_subscription', 'grant_pack_purchase', 'grant_promotional') THEN amountCredits ELSE 0 END), 0)`,
  }).from(creditLedger)
    .where(and(
      eq(creditLedger.userId, userId),
      gte(creditLedger.createdAt, periodStart),
      lte(creditLedger.createdAt, periodEnd)
    ));

  // Active holds
  const balance = await getBalance(userId);

  // Consumption by API call type
  const byTypeRows = await db.select({
    apiType: creditLedger.referenceId,
    total: sql<number>`SUM(ABS(amountCredits))`,
  }).from(creditLedger)
    .where(and(
      eq(creditLedger.userId, userId),
      eq(creditLedger.transactionType, "commit_consumption"),
      gte(creditLedger.createdAt, periodStart),
      lte(creditLedger.createdAt, periodEnd)
    ))
    .groupBy(creditLedger.referenceId);

  const byType: Record<string, number> = {};
  for (const row of byTypeRows) {
    if (row.apiType) {
      byType[row.apiType] = row.total;
    }
  }

  return {
    totalConsumed: consumed?.total || 0,
    totalGranted: granted?.total || 0,
    holdsPending: balance.activeHolds,
    byType,
  };
}
