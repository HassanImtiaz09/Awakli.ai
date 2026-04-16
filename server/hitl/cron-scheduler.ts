/**
 * HITL Timeout Cron Scheduler
 *
 * In-process recurring timer that calls checkTimeoutWarnings() and
 * processTimedOutGates() on a configurable interval (default: 5 minutes).
 *
 * Features:
 * - Overlap prevention via a running-lock flag
 * - Structured logging with run counts, durations, and error tracking
 * - Graceful shutdown on process exit (SIGTERM / SIGINT)
 * - Immediate first run option
 * - Manual trigger for testing
 */

import { checkTimeoutWarnings, processTimedOutGates } from "./timeout-handler";

// ─── Configuration ─────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOG_PREFIX = "[HITL Cron]";

// ─── State ─────────────────────────────────────────────────────────────

let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;
let _stats = {
  totalRuns: 0,
  successfulRuns: 0,
  failedRuns: 0,
  totalWarningsSent: 0,
  totalGatesProcessed: 0,
  totalAutoApproved: 0,
  totalAutoRejected: 0,
  totalAutoPaused: 0,
  totalErrors: 0,
  lastRunAt: null as number | null,
  lastRunDurationMs: null as number | null,
  lastError: null as string | null,
  startedAt: null as number | null,
};

// ─── Types ─────────────────────────────────────────────────────────────

export interface CronRunResult {
  skipped: boolean;
  durationMs: number;
  warnings: { warningsSent: number };
  timeouts: {
    processed: number;
    autoApproved: number;
    autoRejected: number;
    autoPaused: number;
    errors: string[];
  };
}

export interface CronStats {
  running: boolean;
  intervalMs: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalWarningsSent: number;
  totalGatesProcessed: number;
  totalAutoApproved: number;
  totalAutoRejected: number;
  totalAutoPaused: number;
  totalErrors: number;
  lastRunAt: number | null;
  lastRunDurationMs: number | null;
  lastError: string | null;
  startedAt: number | null;
  uptimeMs: number | null;
}

// ─── Core Tick Function ────────────────────────────────────────────────

/**
 * Execute one cron tick: check warnings, then process timed-out gates.
 * Returns the result of the run. If another run is already in progress,
 * the call is skipped and `skipped: true` is returned.
 */
export async function runTimeoutTick(): Promise<CronRunResult> {
  // Overlap prevention
  if (_isRunning) {
    console.log(`${LOG_PREFIX} Skipping tick — previous run still in progress`);
    return {
      skipped: true,
      durationMs: 0,
      warnings: { warningsSent: 0 },
      timeouts: { processed: 0, autoApproved: 0, autoRejected: 0, autoPaused: 0, errors: [] },
    };
  }

  _isRunning = true;
  const startTime = Date.now();

  try {
    // 1. Check timeout warnings
    const warningsResult = await checkTimeoutWarnings();

    // 2. Process timed-out gates
    const timeoutResult = await processTimedOutGates();

    const durationMs = Date.now() - startTime;

    // Update stats
    _stats.totalRuns++;
    _stats.successfulRuns++;
    _stats.totalWarningsSent += warningsResult.warningsSent;
    _stats.totalGatesProcessed += timeoutResult.processed;
    _stats.totalAutoApproved += timeoutResult.autoApproved;
    _stats.totalAutoRejected += timeoutResult.autoRejected;
    _stats.totalAutoPaused += timeoutResult.autoPaused;
    _stats.totalErrors += timeoutResult.errors.length;
    _stats.lastRunAt = Date.now();
    _stats.lastRunDurationMs = durationMs;

    // Log summary (only when something happened, to avoid noise)
    if (warningsResult.warningsSent > 0 || timeoutResult.processed > 0) {
      console.log(
        `${LOG_PREFIX} Tick #${_stats.totalRuns} completed in ${durationMs}ms: ` +
        `${warningsResult.warningsSent} warnings sent, ` +
        `${timeoutResult.processed} gates processed ` +
        `(${timeoutResult.autoApproved} approved, ${timeoutResult.autoRejected} rejected, ${timeoutResult.autoPaused} paused)`
      );
    } else if (_stats.totalRuns % 12 === 0) {
      // Log a heartbeat every ~60 minutes (12 ticks × 5 min)
      console.log(`${LOG_PREFIX} Heartbeat: tick #${_stats.totalRuns}, no pending timeouts`);
    }

    if (timeoutResult.errors.length > 0) {
      console.warn(`${LOG_PREFIX} ${timeoutResult.errors.length} error(s) during processing:`, timeoutResult.errors);
      _stats.lastError = timeoutResult.errors[0];
    }

    return {
      skipped: false,
      durationMs,
      warnings: warningsResult,
      timeouts: timeoutResult,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

    _stats.totalRuns++;
    _stats.failedRuns++;
    _stats.lastRunAt = Date.now();
    _stats.lastRunDurationMs = durationMs;
    _stats.lastError = errorMsg;

    console.error(`${LOG_PREFIX} Tick #${_stats.totalRuns} FAILED in ${durationMs}ms:`, errorMsg);

    return {
      skipped: false,
      durationMs,
      warnings: { warningsSent: 0 },
      timeouts: { processed: 0, autoApproved: 0, autoRejected: 0, autoPaused: 0, errors: [errorMsg] },
    };
  } finally {
    _isRunning = false;
  }
}

// ─── Scheduler Lifecycle ───────────────────────────────────────────────

/**
 * Start the cron scheduler. Runs the timeout tick every `intervalMs`
 * milliseconds (default: 5 minutes). Optionally runs immediately on start.
 *
 * @param intervalMs - Interval between ticks in milliseconds (default: 300000 = 5 min)
 * @param runImmediately - Whether to run the first tick immediately (default: true)
 * @returns true if started, false if already running
 */
export function startCronScheduler(
  intervalMs: number = DEFAULT_INTERVAL_MS,
  runImmediately: boolean = true
): boolean {
  if (_intervalHandle !== null) {
    console.warn(`${LOG_PREFIX} Scheduler already running. Stop it first before restarting.`);
    return false;
  }

  _stats.startedAt = Date.now();

  console.log(`${LOG_PREFIX} Starting timeout cron scheduler (interval: ${intervalMs / 1000}s)`);

  // Run immediately if requested
  if (runImmediately) {
    // Fire-and-forget the first tick (don't block startup)
    runTimeoutTick().catch((err) => {
      console.error(`${LOG_PREFIX} Initial tick failed:`, err);
    });
  }

  _intervalHandle = setInterval(() => {
    runTimeoutTick().catch((err) => {
      console.error(`${LOG_PREFIX} Scheduled tick failed:`, err);
    });
  }, intervalMs);

  // Ensure the interval doesn't prevent Node.js from exiting
  if (_intervalHandle && typeof _intervalHandle === "object" && "unref" in _intervalHandle) {
    _intervalHandle.unref();
  }

  return true;
}

/**
 * Stop the cron scheduler.
 * @returns true if stopped, false if not running
 */
export function stopCronScheduler(): boolean {
  if (_intervalHandle === null) {
    return false;
  }

  clearInterval(_intervalHandle);
  _intervalHandle = null;
  console.log(`${LOG_PREFIX} Scheduler stopped after ${_stats.totalRuns} runs`);
  return true;
}

/**
 * Check if the cron scheduler is currently active.
 */
export function isCronSchedulerRunning(): boolean {
  return _intervalHandle !== null;
}

/**
 * Get cumulative statistics from the cron scheduler.
 */
export function getCronStats(intervalMs: number = DEFAULT_INTERVAL_MS): CronStats {
  return {
    running: _intervalHandle !== null,
    intervalMs,
    ..._stats,
    uptimeMs: _stats.startedAt ? Date.now() - _stats.startedAt : null,
  };
}

/**
 * Reset all statistics (useful for testing).
 */
export function resetCronStats(): void {
  _stats = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalWarningsSent: 0,
    totalGatesProcessed: 0,
    totalAutoApproved: 0,
    totalAutoRejected: 0,
    totalAutoPaused: 0,
    totalErrors: 0,
    lastRunAt: null,
    lastRunDurationMs: null,
    lastError: null,
    startedAt: null,
  };
}

// ─── Graceful Shutdown ─────────────────────────────────────────────────

function handleShutdown(signal: string) {
  console.log(`${LOG_PREFIX} Received ${signal}, stopping scheduler...`);
  stopCronScheduler();
}

// Register shutdown handlers (only once, idempotent)
let _shutdownRegistered = false;

export function registerShutdownHandlers(): void {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;

  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}

// ─── Express Route for Manual Trigger & Stats ──────────────────────────

import type { Express, Request, Response } from "express";

/**
 * Register cron-related Express routes:
 * - POST /api/hitl/cron/trigger — manually trigger a timeout tick
 * - GET  /api/hitl/cron/stats   — get cron scheduler statistics
 */
export function registerCronRoutes(app: Express): void {
  // Manual trigger (useful for testing or admin dashboards)
  app.post("/api/hitl/cron/trigger", async (_req: Request, res: Response) => {
    try {
      const result = await runTimeoutTick();
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Stats endpoint
  app.get("/api/hitl/cron/stats", (_req: Request, res: Response) => {
    res.json(getCronStats());
  });
}

// ─── Exports for barrel ────────────────────────────────────────────────

export const _internal = {
  DEFAULT_INTERVAL_MS,
  LOG_PREFIX,
  get isRunning() { return _isRunning; },
  set isRunning(v: boolean) { _isRunning = v; },
  get intervalHandle() { return _intervalHandle; },
};
