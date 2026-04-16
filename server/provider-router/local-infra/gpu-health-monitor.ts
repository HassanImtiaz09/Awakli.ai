/**
 * GPU Health Monitor — Periodic endpoint polling, drift detection, cost alerts
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Runs on a configurable interval (default 60s) to:
 * 1. Poll RunPod/Modal endpoint health (warm workers, queue depth)
 * 2. Update local_endpoints table with fresh metrics
 * 3. Update provider_health with latency/status
 * 4. Detect model version drift
 * 5. Check cold start rate thresholds
 * 6. Monitor GPU cost burn rate
 */
import { runpodClient } from "./runpod-client";
import { modalClient } from "./modal-client";
import {
  listEndpoints,
  updateEndpointMetrics,
  checkVersionDrift,
} from "./model-artifact-manager";
import { getTotalGpuSpend, getGpuCostSummary24h } from "./gpu-usage-logger";
import type { GpuPlatformClient, EndpointInfo } from "./types";

export interface HealthCheckResult {
  endpointId: number;
  providerId: string;
  platform: string;
  healthy: boolean;
  warmWorkers: number;
  queueDepth: number;
  checkedAt: Date;
  error?: string;
}

export interface MonitorReport {
  timestamp: Date;
  endpointChecks: HealthCheckResult[];
  versionDrift: Array<{
    endpointId: number;
    providerId: string;
    deployedArtifactId: number | null;
    activeArtifactId: number | null;
    activeVersion: string | null;
  }>;
  costSummary: {
    totalCostUsd24h: number;
    totalRequests24h: number;
    totalGpuSeconds24h: number;
    coldStartRate: number;
  };
  alerts: MonitorAlert[];
}

export interface MonitorAlert {
  severity: "info" | "warn" | "critical";
  type: "cold_start_high" | "cost_threshold" | "version_drift" | "queue_overload" | "endpoint_down";
  message: string;
  providerId?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────

export const MONITOR_CONFIG = {
  /** Polling interval in ms (default 60s) */
  pollIntervalMs: 60_000,
  /** Cold start rate threshold (alert if > 20%) */
  coldStartRateThreshold: 0.20,
  /** Daily GPU cost alert threshold in USD */
  dailyCostAlertUsd: 50.0,
  /** Queue depth threshold for overload alert */
  queueOverloadThreshold: 10,
};

// ─── Monitor State ──────────────────────────────────────────────────────

let _monitorInterval: ReturnType<typeof setInterval> | null = null;
let _lastReport: MonitorReport | null = null;
let _isRunning = false;

// ─── Core Monitor Functions ─────────────────────────────────────────────

function getPlatformClient(platform: string): GpuPlatformClient {
  return platform === "modal" ? modalClient : runpodClient;
}

/**
 * Check health of a single endpoint.
 */
async function checkEndpointHealth(endpoint: EndpointInfo): Promise<HealthCheckResult> {
  const client = getPlatformClient(endpoint.platform);
  const checkedAt = new Date();

  try {
    const health = await client.healthCheck(endpoint.endpointId);

    // Update DB with fresh metrics
    await updateEndpointMetrics(endpoint.id, {
      warmWorkers: health.warmWorkers,
      queueDepth: health.queueDepth,
      status: health.healthy ? "active" : "draining",
    });

    return {
      endpointId: endpoint.id,
      providerId: endpoint.providerId,
      platform: endpoint.platform,
      healthy: health.healthy,
      warmWorkers: health.warmWorkers,
      queueDepth: health.queueDepth,
      checkedAt,
    };
  } catch (err) {
    return {
      endpointId: endpoint.id,
      providerId: endpoint.providerId,
      platform: endpoint.platform,
      healthy: false,
      warmWorkers: 0,
      queueDepth: 0,
      checkedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run a full monitoring cycle: check all endpoints, detect drift, generate alerts.
 */
export async function runMonitorCycle(): Promise<MonitorReport> {
  const timestamp = new Date();
  const alerts: MonitorAlert[] = [];

  // 1. Check all active endpoints
  const endpoints = await listEndpoints();
  const activeEndpoints = endpoints.filter(ep => ep.status !== "disabled");

  const endpointChecks = await Promise.all(
    activeEndpoints.map(ep => checkEndpointHealth(ep))
  );

  // 2. Generate endpoint alerts
  for (const check of endpointChecks) {
    if (!check.healthy) {
      alerts.push({
        severity: "warn",
        type: "endpoint_down",
        message: `Endpoint ${check.providerId} (${check.platform}) is unhealthy${check.error ? `: ${check.error}` : ""}`,
        providerId: check.providerId,
      });
    }
    if (check.queueDepth > MONITOR_CONFIG.queueOverloadThreshold && check.warmWorkers === 0) {
      alerts.push({
        severity: "warn",
        type: "queue_overload",
        message: `${check.providerId} queue overloaded: depth=${check.queueDepth}, warm=0`,
        providerId: check.providerId,
      });
    }
  }

  // 3. Check version drift
  const versionDrift = await checkVersionDrift();
  for (const drift of versionDrift) {
    alerts.push({
      severity: "warn",
      type: "version_drift",
      message: `${drift.providerId} running artifact #${drift.deployedArtifactId}, active is #${drift.activeArtifactId} (${drift.activeVersion})`,
      providerId: drift.providerId,
    });
  }

  // 4. Cost summary
  const costSummary = await getTotalGpuSpend(1);

  // 5. Cost alerts
  if (costSummary.totalCostUsd > MONITOR_CONFIG.dailyCostAlertUsd) {
    alerts.push({
      severity: "critical",
      type: "cost_threshold",
      message: `24h GPU cost $${costSummary.totalCostUsd.toFixed(2)} exceeds threshold $${MONITOR_CONFIG.dailyCostAlertUsd.toFixed(2)}`,
    });
  }

  // 6. Cold start rate alert
  if (costSummary.coldStartRate > MONITOR_CONFIG.coldStartRateThreshold && costSummary.totalRequests > 10) {
    alerts.push({
      severity: "warn",
      type: "cold_start_high",
      message: `Cold start rate ${(costSummary.coldStartRate * 100).toFixed(1)}% exceeds ${(MONITOR_CONFIG.coldStartRateThreshold * 100).toFixed(0)}% threshold`,
    });
  }

  const report: MonitorReport = {
    timestamp,
    endpointChecks,
    versionDrift,
    costSummary: {
      totalCostUsd24h: costSummary.totalCostUsd,
      totalRequests24h: costSummary.totalRequests,
      totalGpuSeconds24h: costSummary.totalGpuSeconds,
      coldStartRate: costSummary.coldStartRate,
    },
    alerts,
  };

  _lastReport = report;

  if (alerts.length > 0) {
    console.log(`[GPU Monitor] ${alerts.length} alert(s):`, alerts.map(a => `[${a.severity}] ${a.message}`).join("; "));
  }

  return report;
}

// ─── Monitor Lifecycle ──────────────────────────────────────────────────

/**
 * Start the GPU health monitor on a recurring interval.
 */
export function startGpuMonitor(intervalMs?: number): void {
  if (_monitorInterval) {
    console.warn("[GPU Monitor] Already running, stopping first");
    stopGpuMonitor();
  }

  const interval = intervalMs ?? MONITOR_CONFIG.pollIntervalMs;
  console.log(`[GPU Monitor] Starting with ${interval}ms interval`);

  // Run immediately, then on interval
  runMonitorCycle().catch(err => {
    console.error("[GPU Monitor] Initial cycle failed:", err);
  });

  _monitorInterval = setInterval(async () => {
    if (_isRunning) return; // Skip if previous cycle still running
    _isRunning = true;
    try {
      await runMonitorCycle();
    } catch (err) {
      console.error("[GPU Monitor] Cycle failed:", err);
    } finally {
      _isRunning = false;
    }
  }, interval);

  _monitorInterval.unref(); // Don't prevent process exit
}

/**
 * Stop the GPU health monitor.
 */
export function stopGpuMonitor(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
    console.log("[GPU Monitor] Stopped");
  }
}

/**
 * Get the last monitor report.
 */
export function getLastMonitorReport(): MonitorReport | null {
  return _lastReport;
}

/**
 * Check if the monitor is currently running.
 */
export function isMonitorRunning(): boolean {
  return _monitorInterval !== null;
}
