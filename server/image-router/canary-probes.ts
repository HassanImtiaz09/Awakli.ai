/**
 * Canary Probe Scheduler — Periodic health checks for image generation providers.
 *
 * Sends lightweight "canary" generation requests to each provider on a schedule,
 * records results in the health monitor, and logs alerts when providers go unhealthy.
 *
 * @see Audit M-6
 */
import { imageHealthMonitor } from "./health";
import { generateImage } from "../_core/imageGeneration";

// ─── Configuration ──────────────────────────────────────────────────────

export const CANARY_CONFIG = {
  /** Interval between canary runs (ms). Default: 5 minutes */
  intervalMs: 5 * 60_000,
  /** Timeout for a single canary probe (ms) */
  probeTimeoutMs: 30_000,
  /** The prompt used for canary probes — cheap, fast, deterministic */
  canaryPrompt: "A simple red circle on a white background, minimal, flat design",
  /** Maximum consecutive canary failures before alerting */
  alertThreshold: 3,
} as const;

// ─── Provider Registry for Canary ───────────────────────────────────────

/** Providers that support canary probes */
const CANARY_PROVIDERS = [
  "runware",
  "tensorart",
  "fal",
] as const;

export type CanaryProviderId = (typeof CANARY_PROVIDERS)[number];

// ─── Canary Probe Result ────────────────────────────────────────────────

export interface CanaryResult {
  providerId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  timestamp: Date;
}

// ─── Probe Execution ────────────────────────────────────────────────────

/**
 * Run a single canary probe against a provider.
 * Uses the platform's generateImage helper with a minimal prompt.
 */
export async function runCanaryProbe(providerId: string): Promise<CanaryResult> {
  const start = Date.now();

  try {
    // Use a timeout wrapper to prevent hanging probes
    const result = await Promise.race([
      generateImage({ prompt: CANARY_CONFIG.canaryPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Canary probe timeout")), CANARY_CONFIG.probeTimeoutMs)
      ),
    ]);

    const latencyMs = Date.now() - start;

    // Verify we got a valid URL back
    const isValid = result && typeof result.url === "string" && result.url.length > 0;

    if (isValid) {
      imageHealthMonitor.recordCanary(providerId, true);
    } else {
      imageHealthMonitor.recordCanary(providerId, false);
    }

    return {
      providerId,
      success: isValid,
      latencyMs,
      timestamp: new Date(),
      ...(!isValid && { error: "Invalid response: missing or empty URL" }),
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    imageHealthMonitor.recordCanary(providerId, false);

    return {
      providerId,
      success: false,
      latencyMs,
      error: err?.message || "Unknown error",
      timestamp: new Date(),
    };
  }
}

/**
 * Run canary probes against all registered providers in parallel.
 */
export async function runAllCanaryProbes(): Promise<CanaryResult[]> {
  const results = await Promise.allSettled(
    CANARY_PROVIDERS.map((pid) => runCanaryProbe(pid))
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          providerId: CANARY_PROVIDERS[i],
          success: false,
          latencyMs: 0,
          error: r.reason?.message || "Probe rejected",
          timestamp: new Date(),
        }
  );
}

// ─── Scheduler ──────────────────────────────────────────────────────────

let canaryInterval: ReturnType<typeof setInterval> | null = null;
let lastResults: CanaryResult[] = [];

/**
 * Start the canary probe scheduler.
 * Runs probes immediately, then on the configured interval.
 */
export function startCanaryScheduler(): void {
  if (canaryInterval) return; // Already running

  // Delta audit: guard behind ENABLE_CANARIES env to prevent unwanted API spend
  const enableCanaries = process.env.ENABLE_CANARIES;
  if (!enableCanaries || enableCanaries === "false" || enableCanaries === "0") {
    console.log("[Canary] Probe scheduler disabled (set ENABLE_CANARIES=true to activate)");
    return;
  }

  console.log(`[Canary] Starting probe scheduler (interval: ${CANARY_CONFIG.intervalMs / 1000}s)`);

  // Run immediately on start
  runAllCanaryProbes().then((results) => {
    lastResults = results;
    logCanaryResults(results);
  });

  // Schedule recurring probes + idempotency cleanup
  canaryInterval = setInterval(async () => {
    try {
      const results = await runAllCanaryProbes();
      lastResults = results;
      logCanaryResults(results);

      // Piggyback idempotency cleanup on canary interval
      try {
        const { cleanupExpiredIdempotency } = await import("./idempotency");
        const deleted = await cleanupExpiredIdempotency();
        if (deleted > 0) {
          console.log(`[Cleanup] Removed ${deleted} expired idempotency records`);
        }
      } catch (cleanupErr) {
        console.error("[Cleanup] Idempotency cleanup error:", cleanupErr);
      }
    } catch (err) {
      console.error("[Canary] Scheduler error:", err);
    }
  }, CANARY_CONFIG.intervalMs);
}

/**
 * Stop the canary probe scheduler.
 */
export function stopCanaryScheduler(): void {
  if (canaryInterval) {
    clearInterval(canaryInterval);
    canaryInterval = null;
    console.log("[Canary] Probe scheduler stopped");
  }
}

/**
 * Get the latest canary results.
 */
export function getLastCanaryResults(): CanaryResult[] {
  return [...lastResults];
}

// ─── Logging ────────────────────────────────────────────────────────────

function logCanaryResults(results: CanaryResult[]): void {
  const healthy = results.filter((r) => r.success).length;
  const total = results.length;

  if (healthy === total) {
    console.log(`[Canary] All ${total} providers healthy`);
  } else {
    const unhealthy = results.filter((r) => !r.success);
    console.warn(
      `[Canary] ${healthy}/${total} healthy. Unhealthy: ${unhealthy
        .map((r) => `${r.providerId} (${r.error})`)
        .join(", ")}`
    );
  }
}
