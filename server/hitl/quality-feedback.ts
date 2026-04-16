/**
 * HITL Quality Feedback Loop (Prompt 17)
 *
 * Writes quality signals from gate decisions to provider_quality_scores.
 * Maps gate decisions to quality scores per the spec:
 *
 * | Gate Decision                              | Score | Source    |
 * |-------------------------------------------|-------|-----------|
 * | Creator approves on first attempt           | 5     | creator   |
 * | Auto-approved (score >= 85)                 | 4     | auto_clip |
 * | Creator approves after reviewing advisory   | 4     | creator   |
 * | Auto-advanced (60-84), not retroactively rejected | 3 | auto_clip |
 * | Creator regenerates (any reason)            | 2     | creator   |
 * | Creator rejects                             | 1     | creator   |
 * | Ambient gate escalation                     | 1     | auto_clip |
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import type { GateDecision, DecisionSource } from "./stage-config";

// ─── Types ──────────────────────────────────────────────────────────────

export interface QualityFeedbackParams {
  gateId: number;
  pipelineRunId: number;
  stageNumber: number;
  providerId: string;
  sceneType: string;
  decision: GateDecision;
  decisionSource: DecisionSource;
  confidenceScore: number;
  isFirstAttempt: boolean;
}

// ─── Score Mapping ──────────────────────────────────────────────────────

/**
 * Map a gate decision to a quality score (1-5).
 */
export function mapDecisionToQualityScore(
  decision: GateDecision,
  decisionSource: DecisionSource,
  confidenceScore: number,
  isFirstAttempt: boolean
): { score: number; ratingSource: "creator" | "auto_clip" | "admin" } {
  switch (decision) {
    case "approved":
      if (isFirstAttempt) {
        return { score: 5, ratingSource: "creator" };
      }
      return { score: 4, ratingSource: "creator" };

    case "auto_approved":
      if (confidenceScore >= 85) {
        return { score: 4, ratingSource: "auto_clip" };
      }
      return { score: 3, ratingSource: "auto_clip" };

    case "regenerate":
    case "regenerate_with_edits":
      return { score: 2, ratingSource: "creator" };

    case "rejected":
      return { score: 1, ratingSource: "creator" };

    case "escalated":
      return { score: 1, ratingSource: "auto_clip" };

    case "auto_rejected":
      return { score: 1, ratingSource: "auto_clip" };

    case "timed_out":
      // Timeout doesn't generate a quality signal
      return { score: 0, ratingSource: "auto_clip" };

    default:
      return { score: 3, ratingSource: "auto_clip" };
  }
}

// ─── Write Quality Score ────────────────────────────────────────────────

/**
 * Write a quality score to provider_quality_scores.
 */
export async function writeQualityScore(params: QualityFeedbackParams): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const { score, ratingSource } = mapDecisionToQualityScore(
    params.decision,
    params.decisionSource,
    params.confidenceScore,
    params.isFirstAttempt
  );

  // Skip writing for timeout (score 0)
  if (score === 0) return;

  try {
    await db.execute(sql`
      INSERT INTO provider_quality_scores (
        providerId, sceneType, qualityScore, sampleCount, ratingSource, notes
      ) VALUES (
        ${params.providerId},
        ${params.sceneType},
        ${score},
        1,
        ${ratingSource},
        ${`Gate ${params.gateId} | Stage ${params.stageNumber} | Decision: ${params.decision} | Confidence: ${params.confidenceScore}`}
      )
    `);
  } catch (err) {
    console.error("[QualityFeedback] Failed to write quality score:", err);
  }
}

// ─── Quality Analytics ──────────────────────────────────────────────────

/**
 * Get approval rate per stage over the last N days.
 */
export async function getApprovalRateByStage(
  userId: number,
  days: number = 30
): Promise<Array<{ stageNumber: number; approvalRate: number; totalGates: number }>> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT
      stageNumber,
      COUNT(*) as totalGates,
      SUM(CASE WHEN decision IN ('approved', 'auto_approved') THEN 1 ELSE 0 END) as approvedCount
    FROM gates
    WHERE userId = ${userId}
      AND decision != 'pending'
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
    GROUP BY stageNumber
    ORDER BY stageNumber ASC
  `);

  return (rows as unknown as any[]).map((row: any) => ({
    stageNumber: row.stageNumber,
    approvalRate: row.totalGates > 0 ? (row.approvedCount / row.totalGates) * 100 : 0,
    totalGates: Number(row.totalGates),
  }));
}

/**
 * Get average confidence score per stage over the last N days.
 */
export async function getAvgConfidenceByStage(
  userId: number,
  days: number = 30
): Promise<Array<{ stageNumber: number; avgConfidence: number }>> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT
      stageNumber,
      AVG(confidenceScore) as avgConfidence
    FROM gates
    WHERE userId = ${userId}
      AND confidenceScore IS NOT NULL
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
    GROUP BY stageNumber
    ORDER BY stageNumber ASC
  `);

  return (rows as unknown as any[]).map((row: any) => ({
    stageNumber: row.stageNumber,
    avgConfidence: Number(row.avgConfidence) || 0,
  }));
}

/**
 * Get credits saved by HITL (sum of credits that would have been spent
 * on downstream stages for results the creator rejected).
 */
export async function getCreditsSavedByHitl(
  userId: number,
  days: number = 30
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [rows] = await db.execute(sql`
    SELECT COALESCE(SUM(creditsSavedIfReject), 0) as totalSaved
    FROM gates
    WHERE userId = ${userId}
      AND decision IN ('rejected', 'regenerate', 'regenerate_with_edits')
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
  `);

  const result = (rows as unknown as any[])[0];
  return result ? Number(result.totalSaved) : 0;
}

/**
 * Get most-regenerated stages for a user.
 */
export async function getMostRegeneratedStages(
  userId: number,
  days: number = 30
): Promise<Array<{ stageNumber: number; stageName: string; regenCount: number }>> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT
      stageNumber,
      stageName,
      COUNT(*) as regenCount
    FROM gates
    WHERE userId = ${userId}
      AND decision IN ('regenerate', 'regenerate_with_edits')
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
    GROUP BY stageNumber, stageName
    ORDER BY regenCount DESC
  `);

  return (rows as unknown as any[]) as any[];
}
