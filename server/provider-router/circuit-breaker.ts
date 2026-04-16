/**
 * Circuit Breaker — Protects against cascading failures.
 *
 * States: closed (normal) → open (failing) → half_open (testing)
 * Transitions:
 *   closed → open: after N consecutive failures
 *   open → half_open: after cooldown expires
 *   half_open → closed: on success
 *   half_open → open: on failure (with exponential cooldown)
 */
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import {
  providerHealth,
  providerEvents,
} from "../../drizzle/schema";
import { CIRCUIT_BREAKER_CONFIG } from "./types";
import type { CircuitState } from "./types";

/**
 * Check if a provider's circuit is allowing requests.
 */
export async function isCircuitAllowing(providerId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerId, providerId))
    .limit(1);

  if (rows.length === 0) return true; // No health record = assume OK

  const h = rows[0];
  const state = h.circuitState as CircuitState;

  if (state === "closed") return true;
  if (state === "open") {
    // Check if cooldown has expired → transition to half_open
    if (h.nextRetryAt && new Date() >= h.nextRetryAt) {
      await db
        .update(providerHealth)
        .set({ circuitState: "half_open" })
        .where(eq(providerHealth.providerId, providerId));
      return true; // Allow one test request
    }
    return false;
  }
  // half_open: allow one request through
  return true;
}

/**
 * Report a successful request — reset circuit to closed.
 */
export async function reportSuccess(providerId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(providerHealth)
    .set({
      circuitState: "closed",
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      openedAt: null,
      nextRetryAt: null,
    })
    .where(eq(providerHealth.providerId, providerId));

  // Log event
  await db.insert(providerEvents).values({
    providerId,
    eventType: "success",
    severity: "info",
    detail: { message: "Request succeeded" },
  }).catch(() => {}); // Non-critical
}

/**
 * Report a failed request — increment failures, potentially open circuit.
 */
export async function reportFailure(
  providerId: string,
  errorCode?: string,
  errorMessage?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerId, providerId))
    .limit(1);

  if (rows.length === 0) return;

  const h = rows[0];
  const newFailures = h.consecutiveFailures + 1;
  const state = h.circuitState as CircuitState;

  if (state === "half_open") {
    // Half-open failure → back to open with longer cooldown
    const prevCooldown = h.nextRetryAt && h.openedAt
      ? h.nextRetryAt.getTime() - h.openedAt.getTime()
      : CIRCUIT_BREAKER_CONFIG.baseCooldownMs;
    const nextCooldown = Math.min(
      prevCooldown * CIRCUIT_BREAKER_CONFIG.cooldownMultiplier,
      CIRCUIT_BREAKER_CONFIG.maxCooldownMs,
    );
    const now = new Date();
    await db
      .update(providerHealth)
      .set({
        circuitState: "open",
        consecutiveFailures: newFailures,
        lastFailureAt: now,
        openedAt: now,
        nextRetryAt: new Date(now.getTime() + nextCooldown),
      })
      .where(eq(providerHealth.providerId, providerId));
  } else if (newFailures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    // Threshold reached → open circuit
    const now = new Date();
    await db
      .update(providerHealth)
      .set({
        circuitState: "open",
        consecutiveFailures: newFailures,
        lastFailureAt: now,
        openedAt: now,
        nextRetryAt: new Date(now.getTime() + CIRCUIT_BREAKER_CONFIG.baseCooldownMs),
      })
      .where(eq(providerHealth.providerId, providerId));
  } else {
    // Below threshold — just increment
    await db
      .update(providerHealth)
      .set({
        consecutiveFailures: newFailures,
        lastFailureAt: new Date(),
      })
      .where(eq(providerHealth.providerId, providerId));
  }

  // Log event
  await db.insert(providerEvents).values({
    providerId,
    eventType: "failure",
    severity: "warn",
    detail: { errorCode, errorMessage: errorMessage?.slice(0, 200) },
  }).catch(() => {});
}

/**
 * Get the current circuit state for a provider.
 */
export async function getCircuitState(providerId: string): Promise<{
  state: CircuitState;
  consecutiveFailures: number;
  nextRetryAt: Date | null;
}> {
  const db = await getDb();
  if (!db) return { state: "closed", consecutiveFailures: 0, nextRetryAt: null };

  const rows = await db
    .select()
    .from(providerHealth)
    .where(eq(providerHealth.providerId, providerId))
    .limit(1);

  if (rows.length === 0) return { state: "closed", consecutiveFailures: 0, nextRetryAt: null };

  return {
    state: rows[0].circuitState as CircuitState,
    consecutiveFailures: rows[0].consecutiveFailures,
    nextRetryAt: rows[0].nextRetryAt,
  };
}

/**
 * Manually reset a circuit to closed (admin action).
 */
export async function resetCircuit(providerId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(providerHealth)
    .set({
      circuitState: "closed",
      consecutiveFailures: 0,
      openedAt: null,
      nextRetryAt: null,
    })
    .where(eq(providerHealth.providerId, providerId));

  await db.insert(providerEvents).values({
    providerId,
    eventType: "circuit_reset",
    severity: "info",
    detail: { message: "Manual circuit reset by admin" },
  }).catch(() => {});
}
