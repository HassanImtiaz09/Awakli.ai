/**
 * Benchmark Runner Base
 *
 * Shared infrastructure for all benchmark tickets (B1-B7, P1-P4).
 * Provides: cost tracking, wall-clock timing, retry logic, CSV logging,
 * and a standardised result format for the cost assessment framework.
 */

import fs from "fs";
import path from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ClipResult {
  ticketId: string;
  shotId: string;
  provider: string;
  model: string;
  mode: string;
  resolution: string;
  durationSec: number;
  costUsd: number;
  wallClockMs: number;
  queueTimeMs: number;
  generationTimeMs: number;
  outputUrl: string | null;
  status: "success" | "failed" | "timeout";
  error: string | null;
  retryCount: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface PipelineResult {
  pipelineId: string;
  variant: string;
  totalSlices: number;
  totalDurationSec: number;
  components: ComponentCost[];
  totalCostUsd: number;
  totalWallClockMs: number;
  costPerSecond: number;
  costPerMinute: number;
  costPer5Min: number;
  status: "success" | "partial" | "failed";
  failedSlices: number;
  timestamp: string;
}

export interface ComponentCost {
  component: "video" | "tts" | "lipsync" | "assembly" | "lora_training";
  provider: string;
  model: string;
  units: number;
  unitType: "seconds" | "clips" | "characters" | "runs";
  costUsd: number;
  percentOfTotal: number;
}

export interface TTSResult {
  ticketId: string;
  provider: string;
  model: string;
  inputText: string;
  inputChars: number;
  costUsd: number;
  wallClockMs: number;
  outputUrl: string | null;
  status: "success" | "failed";
  error: string | null;
  voiceQuality: number | null; // 1-5, filled by rater
  emotionControl: number | null; // 1-5, filled by rater
  timestamp: string;
}

// ─── CSV Logger ──────────────────────────────────────────────────────────────

const REPORT_DIR = path.join(process.cwd(), "server/benchmarks/report");

function ensureReportDir(): void {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

function toCsvRow(obj: Record<string, unknown>): string {
  return Object.values(obj)
    .map((v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

function toCsvHeader(obj: Record<string, unknown>): string {
  return Object.keys(obj).join(",");
}

export function appendClipResult(result: ClipResult): void {
  ensureReportDir();
  const filePath = path.join(REPORT_DIR, "clip-results.csv");
  const flat = {
    ticket_id: result.ticketId,
    shot_id: result.shotId,
    provider: result.provider,
    model: result.model,
    mode: result.mode,
    resolution: result.resolution,
    duration_sec: result.durationSec,
    cost_usd: result.costUsd,
    wall_clock_ms: result.wallClockMs,
    queue_time_ms: result.queueTimeMs,
    generation_time_ms: result.generationTimeMs,
    output_url: result.outputUrl,
    status: result.status,
    error: result.error,
    retry_count: result.retryCount,
    timestamp: result.timestamp,
  };

  const needsHeader = !fs.existsSync(filePath) || fs.statSync(filePath).size === 0;
  const line = (needsHeader ? toCsvHeader(flat) + "\n" : "") + toCsvRow(flat) + "\n";
  fs.appendFileSync(filePath, line);
}

export function appendPipelineResult(result: PipelineResult): void {
  ensureReportDir();
  const filePath = path.join(REPORT_DIR, "pipeline-results.csv");
  const flat = {
    pipeline_id: result.pipelineId,
    variant: result.variant,
    total_slices: result.totalSlices,
    total_duration_sec: result.totalDurationSec,
    total_cost_usd: result.totalCostUsd,
    total_wall_clock_ms: result.totalWallClockMs,
    cost_per_second: result.costPerSecond,
    cost_per_minute: result.costPerMinute,
    cost_per_5min: result.costPer5Min,
    status: result.status,
    failed_slices: result.failedSlices,
    timestamp: result.timestamp,
  };

  const needsHeader = !fs.existsSync(filePath) || fs.statSync(filePath).size === 0;
  const line = (needsHeader ? toCsvHeader(flat) + "\n" : "") + toCsvRow(flat) + "\n";
  fs.appendFileSync(filePath, line);
}

export function appendTTSResult(result: TTSResult): void {
  ensureReportDir();
  const filePath = path.join(REPORT_DIR, "tts-results.csv");
  const flat = {
    ticket_id: result.ticketId,
    provider: result.provider,
    model: result.model,
    input_chars: result.inputChars,
    cost_usd: result.costUsd,
    wall_clock_ms: result.wallClockMs,
    output_url: result.outputUrl,
    status: result.status,
    error: result.error,
    timestamp: result.timestamp,
  };

  const needsHeader = !fs.existsSync(filePath) || fs.statSync(filePath).size === 0;
  const line = (needsHeader ? toCsvHeader(flat) + "\n" : "") + toCsvRow(flat) + "\n";
  fs.appendFileSync(filePath, line);
}

// ─── Timing Utilities ────────────────────────────────────────────────────────

export function startTimer(): () => number {
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

// ─── Retry Logic ─────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 3000,
  maxDelayMs: 30000,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<{ result: T; retryCount: number }> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retryCount: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < opts.maxRetries) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ─── Cost Calculation Helpers ────────────────────────────────────────────────

export function calculateClipCost(
  durationSec: number,
  perSecondRate: number | null,
  perClipRate: number | null,
  perVideoRate: number | null
): number {
  if (perSecondRate !== null) return durationSec * perSecondRate;
  if (perClipRate !== null) return perClipRate;
  if (perVideoRate !== null) return perVideoRate;
  return 0;
}

export function calculateTTSCost(
  charCount: number,
  perKCharsRate: number
): number {
  return (charCount / 1000) * perKCharsRate;
}

/**
 * Extrapolate a measured 3-minute cost to other durations.
 * Assumes linear scaling (cost scales with clip count, which scales with duration).
 */
export function extrapolateCost(
  measuredCost: number,
  measuredDurationMin: number,
  targetDurationMin: number
): number {
  return (measuredCost / measuredDurationMin) * targetDurationMin;
}

/**
 * Calculate gross margin at a given retail price.
 */
export function calculateMargin(
  costPerVideo: number,
  retailPrice: number
): { marginUsd: number; marginPercent: number } {
  const marginUsd = retailPrice - costPerVideo;
  const marginPercent = (marginUsd / retailPrice) * 100;
  return { marginUsd, marginPercent: Math.round(marginPercent * 10) / 10 };
}

// ─── Component Breakdown ─────────────────────────────────────────────────────

export function buildComponentBreakdown(
  components: Omit<ComponentCost, "percentOfTotal">[]
): ComponentCost[] {
  const totalCost = components.reduce((sum, c) => sum + c.costUsd, 0);
  return components.map((c) => ({
    ...c,
    percentOfTotal:
      totalCost > 0
        ? Math.round((c.costUsd / totalCost) * 1000) / 10
        : 0,
  }));
}

// ─── Report Generation ───────────────────────────────────────────────────────

export function writeComponentBreakdownCsv(
  pipelineId: string,
  components: ComponentCost[]
): void {
  ensureReportDir();
  const filePath = path.join(REPORT_DIR, "component-breakdown.csv");
  const rows = components.map((c) => ({
    pipeline_id: pipelineId,
    component: c.component,
    provider: c.provider,
    model: c.model,
    units: c.units,
    unit_type: c.unitType,
    cost_usd: c.costUsd,
    percent_of_total: c.percentOfTotal,
  }));

  const needsHeader = !fs.existsSync(filePath) || fs.statSync(filePath).size === 0;
  let content = "";
  if (needsHeader && rows.length > 0) {
    content += toCsvHeader(rows[0]) + "\n";
  }
  for (const row of rows) {
    content += toCsvRow(row) + "\n";
  }
  fs.appendFileSync(filePath, content);
}

export function writeCostMatrix(): void {
  ensureReportDir();
  const pipelineResultsPath = path.join(REPORT_DIR, "pipeline-results.csv");
  if (!fs.existsSync(pipelineResultsPath)) {
    console.warn("No pipeline results found. Run P1-P4 first.");
    return;
  }

  const lines = fs.readFileSync(pipelineResultsPath, "utf-8").trim().split("\n");
  if (lines.length < 2) return;

  const headers = lines[0].split(",");
  const variantIdx = headers.indexOf("variant");
  const costIdx = headers.indexOf("total_cost_usd");
  const durationIdx = headers.indexOf("total_duration_sec");

  const matrixPath = path.join(REPORT_DIR, "cost-matrix.csv");
  let output = "pipeline_variant,measured_duration_min,measured_cost_usd,cost_per_min,cost_1min,cost_3min,cost_5min,cost_7min,cost_15min\n";

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const variant = cols[variantIdx];
    const cost = parseFloat(cols[costIdx]);
    const durationSec = parseFloat(cols[durationIdx]);
    const durationMin = durationSec / 60;
    const costPerMin = cost / durationMin;

    output += [
      variant,
      durationMin.toFixed(1),
      cost.toFixed(2),
      costPerMin.toFixed(2),
      extrapolateCost(cost, durationMin, 1).toFixed(2),
      extrapolateCost(cost, durationMin, 3).toFixed(2),
      extrapolateCost(cost, durationMin, 5).toFixed(2),
      extrapolateCost(cost, durationMin, 7).toFixed(2),
      extrapolateCost(cost, durationMin, 15).toFixed(2),
    ].join(",") + "\n";
  }

  fs.writeFileSync(matrixPath, output);
  console.log(`Cost matrix written to ${matrixPath}`);
}

export function writeMarginAnalysis(
  retailTiers: number[] = [19, 35, 49]
): void {
  ensureReportDir();
  const pipelineResultsPath = path.join(REPORT_DIR, "pipeline-results.csv");
  if (!fs.existsSync(pipelineResultsPath)) {
    console.warn("No pipeline results found. Run P1-P4 first.");
    return;
  }

  const lines = fs.readFileSync(pipelineResultsPath, "utf-8").trim().split("\n");
  if (lines.length < 2) return;

  const headers = lines[0].split(",");
  const variantIdx = headers.indexOf("variant");
  const cost5minIdx = headers.indexOf("cost_per_5min");

  const marginPath = path.join(REPORT_DIR, "margin-analysis.csv");
  const tierHeaders = retailTiers.flatMap((t) => [
    `margin_usd_at_$${t}`,
    `margin_pct_at_$${t}`,
  ]);
  let output = `pipeline_variant,cost_per_5min,${tierHeaders.join(",")}\n`;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const variant = cols[variantIdx];
    const cost5min = parseFloat(cols[cost5minIdx]);

    const margins = retailTiers.flatMap((tier) => {
      const { marginUsd, marginPercent } = calculateMargin(cost5min, tier);
      return [marginUsd.toFixed(2), `${marginPercent}%`];
    });

    output += `${variant},${cost5min.toFixed(2)},${margins.join(",")}\n`;
  }

  fs.writeFileSync(marginPath, output);
  console.log(`Margin analysis written to ${marginPath}`);
}
