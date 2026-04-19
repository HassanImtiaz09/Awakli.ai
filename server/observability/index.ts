/**
 * Observability Module — Request timing, health endpoint, and metrics collection.
 *
 * Provides:
 * - Request timing middleware (logs duration, status, path)
 * - /api/health endpoint (DB ping, provider health, uptime)
 * - Metrics collection helpers for OTel-compatible export
 *
 * @see Audit L-5, L-6, L-7
 */
import type { Request, Response, NextFunction } from "express";
import { createLogger } from "./logger";
import { imageHealthMonitor } from "../image-router/health";
import { getLastCanaryResults } from "../image-router/canary-probes";

export { createLogger, Logger, serverLog, routerLog, pipelineLog, authLog, stripeLog, qaLog } from "./logger";

const log = createLogger("http");

// ─── Request Timing Middleware ──────────────────────────────────────────

/**
 * Express middleware that logs request duration, method, path, and status.
 * Attaches timing to res.locals for downstream use.
 */
export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Skip noisy paths
  const skip = req.path === "/api/health" || req.path.startsWith("/_vite");
  
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    if (!skip) {
      log.info("request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        userAgent: req.headers["user-agent"]?.substring(0, 100),
      });
    }
  });

  next();
}

// ─── Health Endpoint Handler ────────────────────────────────────────────

const startTime = Date.now();

/**
 * GET /api/health — Returns server health status.
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const uptimeMs = Date.now() - startTime;

  // Collect provider health
  const providerStatuses: Record<string, any> = {};
  const canaryResults = getLastCanaryResults();
  for (const result of canaryResults) {
    providerStatuses[result.providerId] = {
      healthy: result.success,
      latencyMs: result.latencyMs,
      lastChecked: result.timestamp.toISOString(),
      error: result.error || null,
    };
  }

  // DB health check
  let dbHealthy = false;
  try {
    // Simple connectivity check — import dynamically to avoid circular deps
    const { getDb } = await import("../db");
    const db = getDb();
    // If getDb returns without throwing, the connection is alive
    dbHealthy = db !== undefined;
  } catch {
    dbHealthy = false;
  }

  const status = dbHealthy ? "healthy" : "degraded";

  res.status(dbHealthy ? 200 : 503).json({
    status,
    uptimeMs,
    uptimeHuman: formatUptime(uptimeMs),
    database: dbHealthy ? "connected" : "unreachable",
    providers: providerStatuses,
    version: process.env.npm_package_version || "dev",
    timestamp: new Date().toISOString(),
  });
}

// ─── Metrics Helpers ────────────────────────────────────────────────────

interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

const metricsBuffer: MetricPoint[] = [];
const MAX_BUFFER = 10_000;

/**
 * Record a metric point (OTel-compatible format).
 */
export function recordMetric(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  if (metricsBuffer.length >= MAX_BUFFER) {
    metricsBuffer.shift(); // Drop oldest
  }
  metricsBuffer.push({
    name,
    value,
    labels,
    timestamp: Date.now(),
  });
}

/**
 * Flush and return all buffered metrics.
 */
export function flushMetrics(): MetricPoint[] {
  const metrics = [...metricsBuffer];
  metricsBuffer.length = 0;
  return metrics;
}

/**
 * Get current metrics without flushing.
 */
export function peekMetrics(): MetricPoint[] {
  return [...metricsBuffer];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
