/**
 * Budget Governor — Monthly per-provider spend caps and alerts.
 *
 * Tracks spend per provider per month, enforces caps, and emits alerts
 * at 70%, 90%, and 100% thresholds.
 *
 * @see Prompt 25, Section 7
 */
import { getMonthlyBudgetCap, type ImageProvider } from "./vault";
import type { BudgetAlert, BudgetAlertLevel } from "./types";
import type { BudgetGovernor as IBudgetGovernor } from "./router";

// ─── Alert Thresholds ───────────────────────────────────────────────────

const ALERT_THRESHOLDS: Array<{ percent: number; level: BudgetAlertLevel }> = [
  { percent: 100, level: "critical" },
  { percent: 90, level: "warning" },
  { percent: 70, level: "info" },
];

// ─── In-Memory Spend Tracker ────────────────────────────────────────────

interface MonthlySpend {
  /** YYYY-MM key */
  month: string;
  /** Provider → total spend in USD */
  spendByProvider: Map<string, number>;
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Budget Governor Implementation ─────────────────────────────────────

export class BudgetGovernorImpl implements IBudgetGovernor {
  private monthlySpend: MonthlySpend;
  private alertHistory: BudgetAlert[] = [];
  private alertCallbacks: Array<(alert: BudgetAlert) => void> = [];

  constructor() {
    this.monthlySpend = {
      month: getCurrentMonth(),
      spendByProvider: new Map(),
    };
  }

  /**
   * Ensure we're tracking the current month.
   * Resets spend if the month has rolled over.
   */
  private ensureCurrentMonth(): void {
    const current = getCurrentMonth();
    if (this.monthlySpend.month !== current) {
      this.monthlySpend = {
        month: current,
        spendByProvider: new Map(),
      };
    }
  }

  /**
   * Get total spend for a provider in the current month.
   */
  getProviderSpend(providerId: string): number {
    this.ensureCurrentMonth();
    return this.monthlySpend.spendByProvider.get(providerId) ?? 0;
  }

  /**
   * Get total spend across all providers in the current month.
   */
  getTotalSpend(): number {
    this.ensureCurrentMonth();
    let total = 0;
    for (const spend of Array.from(this.monthlySpend.spendByProvider.values())) {
      total += spend;
    }
    return total;
  }

  /**
   * Check if a provider has budget remaining for an estimated cost.
   */
  async checkBudget(providerId: string, estimatedCostUsd: number): Promise<boolean> {
    this.ensureCurrentMonth();
    const currentSpend = this.getProviderSpend(providerId);
    const cap = getMonthlyBudgetCap(providerId as ImageProvider);
    return currentSpend + estimatedCostUsd <= cap;
  }

  /**
   * Get total remaining budget across all providers.
   */
  async getRemainingBudget(): Promise<number> {
    this.ensureCurrentMonth();
    let totalRemaining = 0;
    const providers: ImageProvider[] = ["runware", "tensorart", "fal"];

    for (const provider of providers) {
      const cap = getMonthlyBudgetCap(provider);
      const spent = this.getProviderSpend(provider);
      totalRemaining += Math.max(0, cap - spent);
    }

    return totalRemaining;
  }

  /**
   * Record a spend event for a provider.
   * Checks alert thresholds after recording.
   */
  async recordSpend(providerId: string, costUsd: number): Promise<void> {
    this.ensureCurrentMonth();
    const current = this.getProviderSpend(providerId);
    this.monthlySpend.spendByProvider.set(providerId, current + costUsd);

    // Check alert thresholds
    this.checkAlerts(providerId);
  }

  /**
   * Check if any alert thresholds have been crossed.
   */
  private checkAlerts(providerId: string): void {
    const currentSpend = this.getProviderSpend(providerId);
    const cap = getMonthlyBudgetCap(providerId as ImageProvider);
    const percentUsed = (currentSpend / cap) * 100;

    for (const threshold of ALERT_THRESHOLDS) {
      if (percentUsed >= threshold.percent) {
        // Check if we already emitted this alert this month
        const alreadyEmitted = this.alertHistory.some(
          (a) =>
            a.provider === providerId &&
            a.level === threshold.level &&
            a.timestamp.getTime() > new Date(this.monthlySpend.month + "-01").getTime(),
        );

        if (!alreadyEmitted) {
          const alert: BudgetAlert = {
            provider: providerId,
            level: threshold.level,
            currentSpendUsd: currentSpend,
            monthlyCapUsd: cap,
            percentUsed,
            message: `${providerId} has used ${percentUsed.toFixed(1)}% of its monthly budget ($${currentSpend.toFixed(2)} / $${cap})`,
            timestamp: new Date(),
          };

          this.alertHistory.push(alert);
          this.emitAlert(alert);
        }

        break; // Only emit the highest threshold
      }
    }
  }

  /**
   * Register a callback for budget alerts.
   */
  onAlert(callback: (alert: BudgetAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  private emitAlert(alert: BudgetAlert): void {
    for (const cb of this.alertCallbacks) {
      try {
        cb(alert);
      } catch (err) {
        console.error("[BudgetGovernor] Alert callback error:", err);
      }
    }
  }

  /**
   * Get all alerts for the current month.
   */
  getAlerts(): BudgetAlert[] {
    return [...this.alertHistory];
  }

  /**
   * Get a budget summary for all providers.
   */
  getBudgetSummary(): Array<{
    providerId: string;
    monthlyCapUsd: number;
    currentSpendUsd: number;
    remainingUsd: number;
    percentUsed: number;
  }> {
    this.ensureCurrentMonth();
    const providers: ImageProvider[] = ["runware", "tensorart", "fal"];

    return providers.map((provider) => {
      const cap = getMonthlyBudgetCap(provider);
      const spent = this.getProviderSpend(provider);
      return {
        providerId: provider,
        monthlyCapUsd: cap,
        currentSpendUsd: spent,
        remainingUsd: Math.max(0, cap - spent),
        percentUsed: cap > 0 ? (spent / cap) * 100 : 0,
      };
    });
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

export const budgetGovernor = new BudgetGovernorImpl();
