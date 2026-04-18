/**
 * Image Health Monitor — Circuit breaker and canary probes for image providers.
 *
 * Tracks per-provider success rates, latency percentiles, and circuit state.
 * Implements a circuit breaker pattern:
 *   closed (healthy) → open (unhealthy, after N failures) → half_open (probe)
 *
 * @see Prompt 25, Section 9
 */
import type { ProviderHealthStatus } from "./types";
import type { ImageHealthMonitor as IImageHealthMonitor } from "./router";

// ─── Configuration ──────────────────────────────────────────────────────

const CIRCUIT_BREAKER_CONFIG = {
  /** Number of consecutive failures to open the circuit */
  failureThreshold: 5,
  /** Time in ms to wait before probing (half_open) */
  recoveryTimeMs: 60_000,
  /** Time window for success rate calculation (1 hour) */
  successRateWindowMs: 3_600_000,
  /** Max events to keep in the sliding window */
  maxWindowEvents: 500,
} as const;

// ─── Event Types ────────────────────────────────────────────────────────

interface HealthEvent {
  timestamp: number;
  success: boolean;
  latencyMs?: number;
}

interface ProviderState {
  events: HealthEvent[];
  consecutiveFailures: number;
  circuitState: "closed" | "open" | "half_open";
  circuitOpenedAt: number | null;
  lastCanaryAt: number | null;
  lastCanaryResult: "pass" | "fail" | null;
}

// ─── Health Monitor Implementation ──────────────────────────────────────

export class ImageHealthMonitorImpl implements IImageHealthMonitor {
  private providers = new Map<string, ProviderState>();

  /**
   * Get or create state for a provider.
   */
  private getState(providerId: string): ProviderState {
    let state = this.providers.get(providerId);
    if (!state) {
      state = {
        events: [],
        consecutiveFailures: 0,
        circuitState: "closed",
        circuitOpenedAt: null,
        lastCanaryAt: null,
        lastCanaryResult: null,
      };
      this.providers.set(providerId, state);
    }
    return state;
  }

  /**
   * Prune old events outside the sliding window.
   */
  private pruneEvents(state: ProviderState): void {
    const cutoff = Date.now() - CIRCUIT_BREAKER_CONFIG.successRateWindowMs;
    state.events = state.events.filter((e) => e.timestamp > cutoff);

    // Also cap the array size
    if (state.events.length > CIRCUIT_BREAKER_CONFIG.maxWindowEvents) {
      state.events = state.events.slice(-CIRCUIT_BREAKER_CONFIG.maxWindowEvents);
    }
  }

  /**
   * Record a successful generation.
   */
  recordSuccess(providerId: string, latencyMs: number): void {
    const state = this.getState(providerId);
    state.events.push({ timestamp: Date.now(), success: true, latencyMs });
    state.consecutiveFailures = 0;

    // If circuit was half_open, close it
    if (state.circuitState === "half_open") {
      state.circuitState = "closed";
      state.circuitOpenedAt = null;
    }

    this.pruneEvents(state);
  }

  /**
   * Record a failed generation.
   */
  recordFailure(providerId: string): void {
    const state = this.getState(providerId);
    state.events.push({ timestamp: Date.now(), success: false });
    state.consecutiveFailures++;

    // Check if we should open the circuit
    if (
      state.circuitState === "closed" &&
      state.consecutiveFailures >= CIRCUIT_BREAKER_CONFIG.failureThreshold
    ) {
      state.circuitState = "open";
      state.circuitOpenedAt = Date.now();
    }

    // If half_open probe failed, reopen
    if (state.circuitState === "half_open") {
      state.circuitState = "open";
      state.circuitOpenedAt = Date.now();
    }

    this.pruneEvents(state);
  }

  /**
   * Check if a provider is healthy (circuit closed or half_open).
   */
  isHealthy(providerId: string): boolean {
    const state = this.getState(providerId);

    // Check if open circuit should transition to half_open
    if (
      state.circuitState === "open" &&
      state.circuitOpenedAt &&
      Date.now() - state.circuitOpenedAt > CIRCUIT_BREAKER_CONFIG.recoveryTimeMs
    ) {
      state.circuitState = "half_open";
    }

    return state.circuitState !== "open";
  }

  /**
   * Get success rate in the last hour (0.0–1.0).
   */
  getSuccessRate(providerId: string): number | null {
    const state = this.getState(providerId);
    this.pruneEvents(state);

    if (state.events.length === 0) return null;

    const successes = state.events.filter((e) => e.success).length;
    return successes / state.events.length;
  }

  /**
   * Get latency percentile (p50 or p95) in ms.
   */
  getLatencyPercentile(providerId: string, percentile: 50 | 95): number | null {
    const state = this.getState(providerId);
    this.pruneEvents(state);

    const latencies = state.events
      .filter((e) => e.success && e.latencyMs !== undefined)
      .map((e) => e.latencyMs!)
      .sort((a, b) => a - b);

    if (latencies.length === 0) return null;

    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[Math.max(0, index)];
  }

  /**
   * Get full health status for a provider.
   */
  getStatus(providerId: string): ProviderHealthStatus {
    const state = this.getState(providerId);

    // Check circuit state transition
    this.isHealthy(providerId);

    return {
      providerId,
      isHealthy: state.circuitState !== "open",
      latencyP50Ms: this.getLatencyPercentile(providerId, 50),
      latencyP95Ms: this.getLatencyPercentile(providerId, 95),
      successRate1h: this.getSuccessRate(providerId),
      lastCanaryAt: state.lastCanaryAt ? new Date(state.lastCanaryAt) : null,
      lastCanaryResult: state.lastCanaryResult,
      circuitState: state.circuitState,
      consecutiveFailures: state.consecutiveFailures,
    };
  }

  /**
   * Get all provider statuses as a Map (for router scoring).
   */
  getAllStatuses(): Map<string, { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null }> {
    const result = new Map<string, { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null }>();

    for (const providerId of Array.from(this.providers.keys())) {
      result.set(providerId, {
        isHealthy: this.isHealthy(providerId),
        successRate1h: this.getSuccessRate(providerId),
        latencyP50Ms: this.getLatencyPercentile(providerId, 50),
      });
    }

    return result;
  }

  /**
   * Record a canary probe result.
   */
  recordCanary(providerId: string, passed: boolean): void {
    const state = this.getState(providerId);
    state.lastCanaryAt = Date.now();
    state.lastCanaryResult = passed ? "pass" : "fail";

    if (passed) {
      this.recordSuccess(providerId, 0);
    } else {
      this.recordFailure(providerId);
    }
  }

  /**
   * Reset a provider's health state (for testing or manual recovery).
   */
  reset(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * Reset all providers.
   */
  resetAll(): void {
    this.providers.clear();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

export const imageHealthMonitor = new ImageHealthMonitorImpl();

// ─── Re-export config for testing ───────────────────────────────────────

export { CIRCUIT_BREAKER_CONFIG };
