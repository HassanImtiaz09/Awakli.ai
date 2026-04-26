/**
 * H2 · Feedback Router
 *
 * Consumes a HarnessVerdict (from H1 or D5) and dispatches targeted
 * regeneration actions. Each H1/D5 failure category maps to exactly
 * one regeneration entrypoint.
 *
 * Per-slice retry cap: 1 attempt via H1, 1 attempt via D5.
 * After both, escalate to admin quality queue.
 */

import type {
  HarnessVerdict,
  HarnessCheckResult,
  RegenerationAction,
  RegenerationTarget,
  SliceRetryState,
  EscalationEntry,
  MAX_H1_RETRIES_PER_SLICE,
  MAX_D5_RETRIES_PER_SLICE,
} from "./types.js";

// Re-export constants for use
const H1_MAX = 1;
const D5_MAX = 1;

// ─── Retry State Manager ────────────────────────────────────────────────────

export class SliceRetryTracker {
  private states: Map<number, SliceRetryState> = new Map();

  getState(sliceId: number): SliceRetryState {
    if (!this.states.has(sliceId)) {
      this.states.set(sliceId, {
        sliceId,
        h1Attempts: 0,
        d5Attempts: 0,
        escalated: false,
      });
    }
    return this.states.get(sliceId)!;
  }

  recordAttempt(sliceId: number, tier: "tier1_rules" | "tier2_llm"): boolean {
    const state = this.getState(sliceId);
    if (tier === "tier1_rules") {
      if (state.h1Attempts >= H1_MAX) return false; // cap reached
      state.h1Attempts++;
      return true;
    } else {
      if (state.d5Attempts >= D5_MAX) return false; // cap reached
      state.d5Attempts++;
      return true;
    }
  }

  shouldEscalate(sliceId: number): boolean {
    const state = this.getState(sliceId);
    return state.h1Attempts >= H1_MAX && state.d5Attempts >= D5_MAX;
  }

  markEscalated(sliceId: number): void {
    const state = this.getState(sliceId);
    state.escalated = true;
  }

  getAllStates(): SliceRetryState[] {
    return Array.from(this.states.values());
  }
}

// ─── Feedback Router ────────────────────────────────────────────────────────

export interface FeedbackRouterResult {
  /** Actions to take (regeneration targets) */
  actions: RegenerationAction[];
  /** Issues that have exhausted retries and need human review */
  escalations: EscalationEntry[];
  /** Whether any actions were dispatched */
  hasActions: boolean;
  /** Whether any escalations were created */
  hasEscalations: boolean;
}

export function routeFeedback(
  verdict: HarnessVerdict,
  retryTracker: SliceRetryTracker,
  episodeId: string
): FeedbackRouterResult {
  const actions: RegenerationAction[] = [];
  const escalations: EscalationEntry[] = [];

  console.log("  ┌─ H2 Feedback Router ───────────────────────────────────");

  const failedChecks = verdict.checks.filter((c) => !c.passed);

  if (failedChecks.length === 0) {
    console.log("  │ No failures to route — all checks passed");
    console.log("  └────────────────────────────────────────────────────────");
    return { actions, escalations, hasActions: false, hasEscalations: false };
  }

  console.log(`  │ Routing ${failedChecks.length} failure(s) from ${verdict.tier}...`);

  for (const check of failedChecks) {
    const hint = check.routingHint;
    const sliceId = hint.sliceId;

    // For slice-level failures, check retry cap
    if (sliceId !== undefined) {
      const canRetry = retryTracker.recordAttempt(sliceId, verdict.tier);

      if (!canRetry) {
        // Check if we should escalate
        if (retryTracker.shouldEscalate(sliceId)) {
          retryTracker.markEscalated(sliceId);
          const escalation: EscalationEntry = {
            episodeId,
            sliceId,
            failureCategory: check.checkName,
            source: verdict.tier,
            attempts: 2, // 1 H1 + 1 D5
            reason: `Slice ${sliceId} failed after max retries: ${hint.reason}`,
            timestamp: new Date().toISOString(),
          };
          escalations.push(escalation);
          console.log(`  │ ⚠ ESCALATE slice ${sliceId}: ${check.checkName} (max retries reached)`);
          continue;
        }
        // Cap reached for this tier but not yet escalated — skip this action
        console.log(`  │ ⏭ Skip slice ${sliceId}: ${verdict.tier} retry cap reached`);
        continue;
      }
    }

    // Route to regeneration target
    if (hint.target !== "none" && hint.target !== "log_only") {
      const state = sliceId !== undefined ? retryTracker.getState(sliceId) : undefined;
      const action: RegenerationAction = {
        target: hint.target,
        sliceId: hint.sliceId,
        reason: hint.reason,
        source: verdict.tier,
        checkName: check.checkName,
        attempt: state
          ? (verdict.tier === "tier1_rules" ? state.h1Attempts : state.d5Attempts)
          : 1,
      };
      actions.push(action);
      console.log(`  │ → ${hint.target}${sliceId !== undefined ? ` (slice ${sliceId})` : ""}: ${hint.reason}`);
    } else if (hint.target === "log_only") {
      // Log-only issues (e.g., narrative_coherence) — escalate immediately
      const escalation: EscalationEntry = {
        episodeId,
        sliceId,
        failureCategory: check.checkName,
        source: verdict.tier,
        attempts: 0,
        reason: `Log-only issue: ${hint.reason}`,
        timestamp: new Date().toISOString(),
      };
      escalations.push(escalation);
      console.log(`  │ 📝 LOG ONLY: ${check.checkName} — ${hint.reason}`);
    }
  }

  console.log(`  │`);
  console.log(`  │ Actions: ${actions.length}, Escalations: ${escalations.length}`);
  console.log(`  └────────────────────────────────────────────────────────`);

  return {
    actions,
    escalations,
    hasActions: actions.length > 0,
    hasEscalations: escalations.length > 0,
  };
}

/**
 * Deduplicate actions by target + sliceId (keep the first occurrence).
 * This prevents redundant regenerations when multiple checks flag the same slice.
 */
export function deduplicateActions(actions: RegenerationAction[]): RegenerationAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = `${a.target}:${a.sliceId ?? "global"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
