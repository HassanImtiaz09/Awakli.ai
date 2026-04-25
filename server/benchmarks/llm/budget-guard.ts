/**
 * I2: Budget Guard — per-episode LLM cost ceiling + per-role circuit breakers
 *
 * Prevents cost runaway from retry loops or off-rails model output.
 * Circuit breaker disables a role after N consecutive failures.
 */

import type { LLMRole } from "./types.js";
import { llmObs } from "./observability.js";

export interface BudgetGuardConfig {
  perEpisodeCap: number;           // Default $2.00
  circuitBreakerThreshold: number; // Default 5 consecutive failures
}

const DEFAULT_CONFIG: BudgetGuardConfig = {
  perEpisodeCap: 2.0,
  circuitBreakerThreshold: 5,
};

class BudgetGuard {
  private config: BudgetGuardConfig;
  private disabledRoles: Set<LLMRole> = new Set();

  constructor(config: Partial<BudgetGuardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(config?: Partial<BudgetGuardConfig>): void {
    if (config) {
      this.config = { ...DEFAULT_CONFIG, ...config };
    }
    this.disabledRoles.clear();
  }

  /**
   * Check if a role is allowed to make a call.
   * Returns { allowed, reason } — if not allowed, reason explains why.
   */
  checkAllowed(role: LLMRole): { allowed: boolean; reason?: string } {
    // Check circuit breaker
    if (this.disabledRoles.has(role)) {
      return {
        allowed: false,
        reason: `Circuit breaker open: ${role} disabled after ${this.config.circuitBreakerThreshold} consecutive failures`,
      };
    }

    // Check budget cap
    const currentCost = llmObs.getTotalCost();
    if (currentCost >= this.config.perEpisodeCap) {
      return {
        allowed: false,
        reason: `Budget cap reached: $${currentCost.toFixed(4)} >= $${this.config.perEpisodeCap} per-episode limit`,
      };
    }

    return { allowed: true };
  }

  /**
   * Called after each LLM call to update circuit breaker state.
   */
  recordOutcome(role: LLMRole, success: boolean): void {
    if (success) return; // Only track failures

    const consecutiveFailures = llmObs.getConsecutiveFailures(role);
    if (consecutiveFailures >= this.config.circuitBreakerThreshold) {
      this.disabledRoles.add(role);
      console.warn(
        `  [BUDGET] Circuit breaker OPEN for ${role}: ${consecutiveFailures} consecutive failures`
      );
    }
  }

  isRoleDisabled(role: LLMRole): boolean {
    return this.disabledRoles.has(role);
  }

  getRemainingBudget(): number {
    return Math.max(0, this.config.perEpisodeCap - llmObs.getTotalCost());
  }

  getStatus(): {
    totalSpent: number;
    remaining: number;
    cap: number;
    disabledRoles: LLMRole[];
  } {
    return {
      totalSpent: llmObs.getTotalCost(),
      remaining: this.getRemainingBudget(),
      cap: this.config.perEpisodeCap,
      disabledRoles: Array.from(this.disabledRoles),
    };
  }
}

// Singleton instance
export const budgetGuard = new BudgetGuard();
