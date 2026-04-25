/**
 * I1/I2: LLM Observability — per-call cost, latency, and circuit-breaker state logging
 *
 * All LLM calls are logged here for cost tracking, latency monitoring,
 * and circuit-breaker state management.
 */

import type { LLMRole, LLMCallResult } from "./types.js";

export interface CallLogEntry {
  timestamp: string;
  role: LLMRole;
  model: string;
  success: boolean;
  latencyMs: number;
  costEstimate: number;
  retryCount: number;
  promptTokens: number;
  completionTokens: number;
  error?: string;
}

export interface EpisodeSummary {
  episodeId: string;
  totalCalls: number;
  totalCost: number;
  totalLatencyMs: number;
  perRole: Record<LLMRole, {
    calls: number;
    cost: number;
    avgLatencyMs: number;
    failures: number;
  }>;
}

class LLMObservability {
  private callLog: CallLogEntry[] = [];
  private episodeId: string = "";

  startEpisode(episodeId: string): void {
    this.episodeId = episodeId;
    this.callLog = [];
    console.log(`  [LLM-OBS] Episode ${episodeId} started`);
  }

  logCall(result: LLMCallResult): void {
    const entry: CallLogEntry = {
      timestamp: new Date().toISOString(),
      role: result.role,
      model: result.model,
      success: result.success,
      latencyMs: result.latencyMs,
      costEstimate: result.costEstimate,
      retryCount: result.retryCount,
      promptTokens: result.usage?.promptTokens ?? 0,
      completionTokens: result.usage?.completionTokens ?? 0,
      error: result.error,
    };
    this.callLog.push(entry);

    const icon = result.success ? "✓" : "✗";
    console.log(
      `  [LLM-OBS] ${icon} ${result.role} | ${result.model} | ${result.latencyMs}ms | $${result.costEstimate.toFixed(4)} | retries: ${result.retryCount}${result.error ? ` | err: ${result.error.slice(0, 60)}` : ""}`
    );
  }

  getEpisodeSummary(): EpisodeSummary {
    const roles: LLMRole[] = ["director", "prompt-engineer", "critic", "voice-director"];
    const perRole = {} as EpisodeSummary["perRole"];

    for (const role of roles) {
      const roleCalls = this.callLog.filter((c) => c.role === role);
      perRole[role] = {
        calls: roleCalls.length,
        cost: roleCalls.reduce((s, c) => s + c.costEstimate, 0),
        avgLatencyMs: roleCalls.length > 0
          ? roleCalls.reduce((s, c) => s + c.latencyMs, 0) / roleCalls.length
          : 0,
        failures: roleCalls.filter((c) => !c.success).length,
      };
    }

    return {
      episodeId: this.episodeId,
      totalCalls: this.callLog.length,
      totalCost: this.callLog.reduce((s, c) => s + c.costEstimate, 0),
      totalLatencyMs: this.callLog.reduce((s, c) => s + c.latencyMs, 0),
      perRole,
    };
  }

  getTotalCost(): number {
    return this.callLog.reduce((s, c) => s + c.costEstimate, 0);
  }

  getConsecutiveFailures(role: LLMRole): number {
    let count = 0;
    for (let i = this.callLog.length - 1; i >= 0; i--) {
      if (this.callLog[i].role !== role) continue;
      if (!this.callLog[i].success) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  printSummary(): void {
    const summary = this.getEpisodeSummary();
    console.log(`\n  ═══ LLM Observability Summary ═══`);
    console.log(`  Episode: ${summary.episodeId}`);
    console.log(`  Total calls: ${summary.totalCalls}`);
    console.log(`  Total cost: $${summary.totalCost.toFixed(4)}`);
    console.log(`  Total latency: ${(summary.totalLatencyMs / 1000).toFixed(1)}s`);
    for (const [role, stats] of Object.entries(summary.perRole)) {
      if (stats.calls > 0) {
        console.log(`  ${role}: ${stats.calls} calls, $${stats.cost.toFixed(4)}, avg ${stats.avgLatencyMs.toFixed(0)}ms, ${stats.failures} failures`);
      }
    }
    console.log(`  ═══════════════════════════════════\n`);
  }
}

// Singleton instance
export const llmObs = new LLMObservability();
