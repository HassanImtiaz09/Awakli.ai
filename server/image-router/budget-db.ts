/**
 * DB-Backed Budget Store — Persistent spend tracking with circuit breaker.
 *
 * Audit fix C-4: Replaces in-memory Map with Drizzle-backed table.
 * Survives server restarts and scales across instances.
 */
import { getDb } from "../db";
import { sql, eq, and } from "drizzle-orm";
import type { BudgetAlert, BudgetAlertLevel } from "./types";
import { getMonthlyBudgetCap, type ImageProvider } from "./vault";

// ─── Alert Thresholds ───────────────────────────────────────────────────

const ALERT_THRESHOLDS: Array<{ percent: number; level: BudgetAlertLevel }> = [
  { percent: 100, level: "critical" },
  { percent: 90, level: "warning" },
  { percent: 70, level: "info" },
];

// ─── Daily Org-Level Circuit Breaker ────────────────────────────────────

const DAILY_ORG_CEILING_USD = 500; // Hard ceiling across all providers per day

// ─── DB Operations ──────────────────────────────────────────────────────

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDay(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Record a spend event and check budget thresholds.
 * Uses raw SQL for atomic upsert on the budget_spend table.
 */
export async function recordSpend(
  providerId: string,
  amountUsd: number,
): Promise<{ allowed: boolean; alerts: BudgetAlert[] }> {
  const alerts: BudgetAlert[] = [];
  const db = await getDb();
  if (!db) {
    console.warn("[BudgetDB] Database not available, allowing spend");
    return { allowed: true, alerts };
  }

  const month = getCurrentMonth();
  const day = getCurrentDay();

  // Atomic upsert: increment monthly spend
  await db.execute(sql`
    INSERT INTO budget_spend (provider_id, month, spend_usd, updated_at)
    VALUES (${providerId}, ${month}, ${amountUsd}, NOW())
    ON DUPLICATE KEY UPDATE
      spend_usd = spend_usd + ${amountUsd},
      updated_at = NOW()
  `);

  // Atomic upsert: increment daily org-level spend
  await db.execute(sql`
    INSERT INTO budget_spend (provider_id, month, spend_usd, updated_at)
    VALUES (${"__org_daily__"}, ${day}, ${amountUsd}, NOW())
    ON DUPLICATE KEY UPDATE
      spend_usd = spend_usd + ${amountUsd},
      updated_at = NOW()
  `);

  // Check daily org ceiling (circuit breaker)
  const dailyRows = await db.execute(sql`
    SELECT spend_usd FROM budget_spend
    WHERE provider_id = ${"__org_daily__"} AND month = ${day}
    LIMIT 1
  `);
  const dailySpend = Number((dailyRows as any)[0]?.[0]?.spend_usd ?? 0);
  if (dailySpend >= DAILY_ORG_CEILING_USD) {
    alerts.push({
      provider: "__org__",
      level: "critical",
      message: `CIRCUIT BREAKER: Daily org spend $${dailySpend.toFixed(2)} exceeds ceiling $${DAILY_ORG_CEILING_USD}`,
      timestamp: new Date(),
      currentSpendUsd: dailySpend,
      monthlyCapUsd: DAILY_ORG_CEILING_USD,
      percentUsed: (dailySpend / DAILY_ORG_CEILING_USD) * 100,
    });
    return { allowed: false, alerts };
  }

  // Check monthly provider cap
  const cap = getMonthlyBudgetCap(providerId as ImageProvider);
  if (cap > 0) {
    const monthlyRows = await db.execute(sql`
      SELECT spend_usd FROM budget_spend
      WHERE provider_id = ${providerId} AND month = ${month}
      LIMIT 1
    `);
    const monthlySpend = Number((monthlyRows as any)[0]?.[0]?.spend_usd ?? 0);
    const percentUsed = (monthlySpend / cap) * 100;

    for (const threshold of ALERT_THRESHOLDS) {
      if (percentUsed >= threshold.percent) {
        alerts.push({
          provider: providerId,
          level: threshold.level,
          message: `${providerId} at ${percentUsed.toFixed(1)}% of monthly budget ($${monthlySpend.toFixed(2)} / $${cap})`,
          timestamp: new Date(),
          currentSpendUsd: monthlySpend,
          monthlyCapUsd: cap,
          percentUsed,
        });
        break;
      }
    }

    if (percentUsed >= 100) {
      return { allowed: false, alerts };
    }
  }

  return { allowed: true, alerts };
}

/**
 * Check if a provider has budget remaining without recording spend.
 */
export async function hasBudget(providerId: string, estimatedCostUsd: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // Fail open if DB unavailable

  const month = getCurrentMonth();
  const cap = getMonthlyBudgetCap(providerId as ImageProvider);
  if (cap <= 0) return true; // No cap set

  const rows = await db.execute(sql`
    SELECT spend_usd FROM budget_spend
    WHERE provider_id = ${providerId} AND month = ${month}
    LIMIT 1
  `);
  const currentSpend = Number((rows as any)[0]?.[0]?.spend_usd ?? 0);
  return (currentSpend + estimatedCostUsd) <= cap;
}

/**
 * Get budget summary for all providers.
 */
export async function getBudgetSummary(): Promise<Array<{
  providerId: string;
  monthlyCapUsd: number;
  currentSpendUsd: number;
  remainingUsd: number;
  percentUsed: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const month = getCurrentMonth();
  const rows = await db.execute(sql`
    SELECT provider_id, spend_usd FROM budget_spend
    WHERE month = ${month} AND provider_id != '__org_daily__'
  `);

  const results: Array<{
    providerId: string;
    monthlyCapUsd: number;
    currentSpendUsd: number;
    remainingUsd: number;
    percentUsed: number;
  }> = [];

  for (const row of (rows as any)[0] ?? []) {
    const providerId = row.provider_id;
    const spent = Number(row.spend_usd);
    const cap = getMonthlyBudgetCap(providerId as ImageProvider);
    results.push({
      providerId,
      monthlyCapUsd: cap,
      currentSpendUsd: spent,
      remainingUsd: Math.max(0, cap - spent),
      percentUsed: cap > 0 ? (spent / cap) * 100 : 0,
    });
  }

  return results;
}

export { DAILY_ORG_CEILING_USD };
