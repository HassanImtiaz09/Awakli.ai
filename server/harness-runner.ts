/**
 * Harness Runner Framework
 * 
 * Provides the core infrastructure for running quality checks:
 * - Result types: PASS, WARN, RETRY, BLOCK, HUMAN_REVIEW
 * - Auto-retry with max attempts
 * - Auto-fix strategies per check
 * - DB persistence of all results
 * - Cost tracking per check
 */

import { getDb } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { harnessResults, pipelineAssets, type HarnessResult } from "../drizzle/schema";
import type { ProductionBibleData } from "./production-bible";

// ─── Types ─────────────────────────────────────────────────────────────

export type HarnessLayer = "script" | "visual" | "video" | "audio" | "integration";
export type HarnessResultType = "pass" | "warn" | "retry" | "block" | "human_review";

export interface HarnessCheckResult {
  result: HarnessResultType;
  score: number;          // 0-10
  details: Record<string, any>;
  autoFixApplied?: string;
  costCredits: number;    // cost in dollars for this check
}

export interface HarnessCheckConfig {
  name: string;           // e.g., '1A_schema_validation'
  layer: HarnessLayer;
  description: string;
  costEstimate: number;   // estimated cost per run
  isCompute: boolean;     // true = no AI cost, false = uses LLM/vision
}

export type HarnessCheckFn = (
  context: HarnessContext,
  bible: ProductionBibleData,
) => Promise<HarnessCheckResult>;

export interface HarnessContext {
  episodeId: number;
  pipelineRunId?: number;
  targetId?: number;      // panel_id, asset_id, etc.
  targetType?: string;    // 'panel', 'clip', 'episode', 'asset'
  targetUrl?: string;     // URL of the asset being checked
  targetData?: any;       // additional data (script content, metadata, etc.)
}

export interface HarnessRunSummary {
  totalChecks: number;
  passed: number;
  warned: number;
  retried: number;
  blocked: number;
  humanReview: number;
  overallScore: number;   // weighted average
  totalCost: number;
  results: HarnessCheckResult[];
  shouldBlock: boolean;   // true if any check returned BLOCK
  flaggedItems: Array<{ checkName: string; targetId?: number; score: number; details: any }>;
}

// ─── Runner ────────────────────────────────────────────────────────────

/**
 * Run a single harness check with auto-retry logic.
 * Returns the final result after retries (if applicable).
 */
export async function runHarnessCheck(
  config: HarnessCheckConfig,
  checkFn: HarnessCheckFn,
  context: HarnessContext,
  bible: ProductionBibleData,
  maxRetries: number = 3,
): Promise<HarnessCheckResult> {
  let attempt = 1;
  let lastResult: HarnessCheckResult | null = null;

  while (attempt <= maxRetries) {
    const result = await checkFn(context, bible);
    lastResult = result;

    // Persist result to DB
    await persistHarnessResult(config, context, result, attempt);

    // If not a retry, we're done
    if (result.result !== "retry") {
      return result;
    }

    // If retry but max attempts reached, escalate to human_review
    if (attempt >= maxRetries) {
      const escalated: HarnessCheckResult = {
        ...result,
        result: "human_review",
        details: {
          ...result.details,
          escalationReason: `Failed after ${maxRetries} attempts`,
          lastAutoFix: result.autoFixApplied,
        },
      };
      await persistHarnessResult(config, context, escalated, attempt);
      return escalated;
    }

    console.log(`[Harness] ${config.name}: RETRY (attempt ${attempt}/${maxRetries}) — ${result.autoFixApplied || "no auto-fix"}`);
    attempt++;
  }

  return lastResult!;
}

/**
 * Run a batch of harness checks for a specific layer.
 * Returns a summary with overall score and flagged items.
 */
export async function runHarnessLayer(
  checks: Array<{ config: HarnessCheckConfig; fn: HarnessCheckFn }>,
  context: HarnessContext,
  bible: ProductionBibleData,
): Promise<HarnessRunSummary> {
  const results: HarnessCheckResult[] = [];
  const flaggedItems: HarnessRunSummary["flaggedItems"] = [];
  let totalCost = 0;

  for (const { config, fn } of checks) {
    const result = await runHarnessCheck(
      config, fn, context, bible,
      bible.qualityThresholds.maxRetries,
    );
    results.push(result);
    totalCost += result.costCredits;

    if (result.result === "block" || result.result === "human_review" || result.result === "warn") {
      flaggedItems.push({
        checkName: config.name,
        targetId: context.targetId,
        score: result.score,
        details: result.details,
      });
    }
  }

  const passed = results.filter(r => r.result === "pass").length;
  const warned = results.filter(r => r.result === "warn").length;
  const retried = results.filter(r => r.result === "retry").length;
  const blocked = results.filter(r => r.result === "block").length;
  const humanReview = results.filter(r => r.result === "human_review").length;

  // Weighted average score
  const scores = results.map(r => r.score).filter(s => s > 0);
  const overallScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    totalChecks: results.length,
    passed,
    warned,
    retried,
    blocked,
    humanReview,
    overallScore: Math.round(overallScore * 10) / 10,
    totalCost: Math.round(totalCost * 1000) / 1000,
    results,
    shouldBlock: blocked > 0,
    flaggedItems,
  };
}

// ─── DB Persistence ────────────────────────────────────────────────────

async function persistHarnessResult(
  config: HarnessCheckConfig,
  context: HarnessContext,
  result: HarnessCheckResult,
  attempt: number,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.insert(harnessResults).values({
      episodeId: context.episodeId,
      pipelineRunId: context.pipelineRunId,
      layer: config.layer,
      checkName: config.name,
      targetId: context.targetId,
      targetType: context.targetType,
      result: result.result,
      score: result.score,
      details: result.details,
      autoFixApplied: result.autoFixApplied || null,
      attemptNumber: attempt,
      costCredits: result.costCredits,
    });
  } catch (e) {
    console.error(`[Harness] Failed to persist result for ${config.name}:`, e);
  }
}

/**
 * Update a pipeline asset with its harness score.
 */
export async function updateAssetHarnessScore(
  assetId: number,
  score: number,
  result: HarnessResultType,
  details: Record<string, any>,
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db.update(pipelineAssets)
      .set({
        harnessScore: score,
        harnessResult: result,
        harnessDetails: details,
      })
      .where(eq(pipelineAssets.id, assetId));
  } catch (e) {
    console.error(`[Harness] Failed to update asset ${assetId}:`, e);
  }
}

// ─── Query Helpers ─────────────────────────────────────────────────────

export async function getHarnessResultsForEpisode(episodeId: number): Promise<HarnessResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(harnessResults)
    .where(eq(harnessResults.episodeId, episodeId))
    .orderBy(desc(harnessResults.createdAt));
}

export async function getHarnessResultsForRun(pipelineRunId: number): Promise<HarnessResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(harnessResults)
    .where(eq(harnessResults.pipelineRunId, pipelineRunId))
    .orderBy(desc(harnessResults.createdAt));
}

export async function getFlaggedItems(episodeId: number): Promise<HarnessResult[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(harnessResults)
    .where(and(
      eq(harnessResults.episodeId, episodeId),
      eq(harnessResults.result, "human_review"),
    ))
    .orderBy(desc(harnessResults.createdAt));
}

export async function getOverallQualityScore(episodeId: number): Promise<{
  overall: number;
  byLayer: Record<HarnessLayer, { score: number; count: number }>;
  totalCost: number;
}> {
  const results = await getHarnessResultsForEpisode(episodeId);
  
  const byLayer: Record<string, { scores: number[]; count: number }> = {};
  let totalCost = 0;

  for (const r of results) {
    if (!byLayer[r.layer]) byLayer[r.layer] = { scores: [], count: 0 };
    if (r.score !== null) byLayer[r.layer].scores.push(r.score);
    byLayer[r.layer].count++;
    totalCost += r.costCredits || 0;
  }

  const layerScores: Record<string, { score: number; count: number }> = {};
  const allScores: number[] = [];
  for (const [layer, data] of Object.entries(byLayer)) {
    const avg = data.scores.length > 0
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
      : 0;
    layerScores[layer] = { score: Math.round(avg * 10) / 10, count: data.count };
    allScores.push(avg);
  }

  const overall = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  return {
    overall: Math.round(overall * 10) / 10,
    byLayer: layerScores as Record<HarnessLayer, { score: number; count: number }>,
    totalCost: Math.round(totalCost * 1000) / 1000,
  };
}
