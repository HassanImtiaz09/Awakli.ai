/**
 * Prompt 22 — Lineart Batch Processing
 *
 * Handles batch extraction of lineart from all panels in an episode.
 * Supports mixed strategy (Canny for action/establishing, Anime2Sketch for dialogue/reaction/montage).
 * Simulates concurrent GPU workers for Anime2Sketch panels.
 *
 * Performance targets (50 panels):
 *   • Canny only: <30s
 *   • Anime2Sketch only: 3-5 min
 *   • Mixed: 2-4 min
 *   • Cost: <$1.00/episode
 */

import {
  type ExtractionMethod,
  type ExtractionPipelineResult,
  runExtractionPipeline,
  SCENE_TYPE_EXTRACTION_DEFAULTS,
} from "./lineart-extraction";

// ─── Types ──────────────────────────────────────────────────────────────

export type BatchExtractionMethod = "canny" | "anime2sketch" | "mixed";

export interface BatchPanelInput {
  panelIndex: number;
  sourcePanelUrl: string;
  sceneType?: string;
  pageWidth?: number;
  pageHeight?: number;
  totalPanelsOnPage?: number;
}

export interface BatchPanelResult {
  panelIndex: number;
  status: "completed" | "failed";
  result?: ExtractionPipelineResult;
  errorMessage?: string;
}

export interface BatchJobSpec {
  episodeId: number;
  totalPanels: number;
  extractionMethod: BatchExtractionMethod;
  panels: Array<{
    panelIndex: number;
    method: ExtractionMethod;
    sourcePanelUrl: string;
  }>;
  estimatedTimeMs: number;
  estimatedCostUsd: number;
  concurrentWorkers: number;
}

export interface BatchProgress {
  jobId: number;
  totalPanels: number;
  completedPanels: number;
  failedPanels: number;
  status: "queued" | "running" | "completed" | "failed";
  progressPercent: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  costSoFar: number;
  results: BatchPanelResult[];
  errorLog: Array<{ panelIndex: number; errorMessage: string }>;
}

// ─── Constants ──────────────────────────────────────────────────────────

export const BATCH_CONFIG = {
  maxConcurrentWorkers: 10,
  cannyWorkers: 10,       // Canny is CPU-only, can parallelize freely
  anime2sketchWorkers: 5, // GPU-bound, limited concurrency
  maxPanelsPerBatch: 200,
  failureThreshold: 0.20, // Fail batch if >20% panels fail
} as const;

/** Cost estimates per method */
export const COST_PER_PANEL: Record<ExtractionMethod, { min: number; max: number }> = {
  canny: { min: 0, max: 0 },
  anime2sketch: { min: 0.01, max: 0.02 },
};

/** Time estimates per method (ms per panel, accounting for concurrency) */
export const TIME_PER_PANEL: Record<ExtractionMethod, { sequential: number; concurrent: number }> = {
  canny: { sequential: 80, concurrent: 20 },         // Very fast, high parallelism
  anime2sketch: { sequential: 2500, concurrent: 500 }, // GPU-bound, 5 workers
};

// ─── Helpers ────────────────────────────────────────────────────────────

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/**
 * Determine extraction method for each panel based on batch strategy.
 */
export function assignPanelMethods(
  panels: BatchPanelInput[],
  batchMethod: BatchExtractionMethod,
): Array<{ panelIndex: number; method: ExtractionMethod; sourcePanelUrl: string }> {
  return panels.map(p => {
    let method: ExtractionMethod;
    if (batchMethod === "canny") {
      method = "canny";
    } else if (batchMethod === "anime2sketch") {
      method = "anime2sketch";
    } else {
      // Mixed: use scene type defaults
      method = SCENE_TYPE_EXTRACTION_DEFAULTS[p.sceneType ?? "dialogue"] ?? "anime2sketch";
    }
    return {
      panelIndex: p.panelIndex,
      method,
      sourcePanelUrl: p.sourcePanelUrl,
    };
  });
}

/**
 * Estimate total time and cost for a batch job.
 */
export function estimateBatchJob(
  panels: Array<{ method: ExtractionMethod }>,
): { estimatedTimeMs: number; estimatedCostUsd: number; concurrentWorkers: number } {
  const cannyCount = panels.filter(p => p.method === "canny").length;
  const a2sCount = panels.filter(p => p.method === "anime2sketch").length;

  // Time: process canny and anime2sketch in parallel groups
  const cannyTimeMs = cannyCount > 0
    ? Math.ceil(cannyCount / BATCH_CONFIG.cannyWorkers) * TIME_PER_PANEL.canny.sequential
    : 0;
  const a2sTimeMs = a2sCount > 0
    ? Math.ceil(a2sCount / BATCH_CONFIG.anime2sketchWorkers) * TIME_PER_PANEL.anime2sketch.sequential
    : 0;

  // Total time is max of the two parallel groups + overhead
  const overheadMs = 2000; // Job setup, result aggregation
  const estimatedTimeMs = Math.max(cannyTimeMs, a2sTimeMs) + overheadMs;

  // Cost: only anime2sketch has cost
  const avgCostPerA2S = (COST_PER_PANEL.anime2sketch.min + COST_PER_PANEL.anime2sketch.max) / 2;
  const estimatedCostUsd = roundTo(a2sCount * avgCostPerA2S, 2);

  const concurrentWorkers = Math.min(
    BATCH_CONFIG.maxConcurrentWorkers,
    cannyCount > 0 && a2sCount > 0
      ? BATCH_CONFIG.cannyWorkers + BATCH_CONFIG.anime2sketchWorkers
      : cannyCount > 0 ? BATCH_CONFIG.cannyWorkers : BATCH_CONFIG.anime2sketchWorkers
  );

  return { estimatedTimeMs, estimatedCostUsd, concurrentWorkers };
}

/**
 * Build a batch job specification.
 */
export function buildBatchJobSpec(
  episodeId: number,
  panelInputs: BatchPanelInput[],
  batchMethod: BatchExtractionMethod,
): BatchJobSpec {
  const panels = assignPanelMethods(panelInputs, batchMethod);
  const { estimatedTimeMs, estimatedCostUsd, concurrentWorkers } = estimateBatchJob(panels);

  return {
    episodeId,
    totalPanels: panels.length,
    extractionMethod: batchMethod,
    panels,
    estimatedTimeMs,
    estimatedCostUsd,
    concurrentWorkers,
  };
}

/**
 * Simulate processing a single panel in a batch.
 */
export function processPanel(
  panelInput: { panelIndex: number; method: ExtractionMethod; sourcePanelUrl: string },
  pageWidth: number = 1600,
  pageHeight: number = 2400,
  totalPanelsOnPage: number = 4,
): BatchPanelResult {
  // Simulate a small failure rate (3%)
  if (Math.random() < 0.03) {
    return {
      panelIndex: panelInput.panelIndex,
      status: "failed",
      errorMessage: `Extraction failed for panel ${panelInput.panelIndex}: insufficient edge contrast`,
    };
  }

  const result = runExtractionPipeline(
    panelInput.sourcePanelUrl,
    panelInput.panelIndex,
    panelInput.method,
    pageWidth,
    pageHeight,
    totalPanelsOnPage,
  );

  return {
    panelIndex: panelInput.panelIndex,
    status: "completed",
    result,
  };
}

/**
 * Simulate running a full batch extraction job.
 * Returns the final progress state.
 */
export function simulateBatchExecution(
  spec: BatchJobSpec,
): BatchProgress {
  const startTime = Date.now();
  const results: BatchPanelResult[] = [];
  const errorLog: Array<{ panelIndex: number; errorMessage: string }> = [];

  for (const panel of spec.panels) {
    const result = processPanel(panel);
    results.push(result);
    if (result.status === "failed" && result.errorMessage) {
      errorLog.push({ panelIndex: panel.panelIndex, errorMessage: result.errorMessage });
    }
  }

  const completedPanels = results.filter(r => r.status === "completed").length;
  const failedPanels = results.filter(r => r.status === "failed").length;
  const failureRate = failedPanels / spec.totalPanels;

  // Calculate actual cost from completed panels
  const costSoFar = roundTo(
    results
      .filter(r => r.status === "completed" && r.result)
      .reduce((sum, r) => sum + (r.result?.totalCostUsd ?? 0), 0),
    4,
  );

  const status: "completed" | "failed" = failureRate > BATCH_CONFIG.failureThreshold
    ? "failed"
    : "completed";

  return {
    jobId: 0, // Will be set by the caller
    totalPanels: spec.totalPanels,
    completedPanels,
    failedPanels,
    status,
    progressPercent: 100,
    elapsedMs: Date.now() - startTime,
    estimatedRemainingMs: 0,
    costSoFar,
    results,
    errorLog,
  };
}

/**
 * Create an initial batch progress for a queued job.
 */
export function createInitialProgress(jobId: number, totalPanels: number, estimatedTimeMs: number): BatchProgress {
  return {
    jobId,
    totalPanels,
    completedPanels: 0,
    failedPanels: 0,
    status: "queued",
    progressPercent: 0,
    elapsedMs: 0,
    estimatedRemainingMs: estimatedTimeMs,
    costSoFar: 0,
    results: [],
    errorLog: [],
  };
}

/**
 * Format batch duration for display.
 */
export function formatBatchDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Get batch method summary for display.
 */
export function getBatchMethodSummary(
  panels: Array<{ method: ExtractionMethod }>,
): { cannyCount: number; anime2sketchCount: number; description: string } {
  const cannyCount = panels.filter(p => p.method === "canny").length;
  const anime2sketchCount = panels.filter(p => p.method === "anime2sketch").length;

  let description: string;
  if (cannyCount > 0 && anime2sketchCount > 0) {
    description = `Mixed: ${cannyCount} Canny + ${anime2sketchCount} Anime2Sketch`;
  } else if (cannyCount > 0) {
    description = `All Canny (${cannyCount} panels)`;
  } else {
    description = `All Anime2Sketch (${anime2sketchCount} panels)`;
  }

  return { cannyCount, anime2sketchCount, description };
}
