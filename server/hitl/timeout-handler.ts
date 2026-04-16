/**
 * HITL Timeout Handler (Prompt 17)
 *
 * Checks for timed-out gates and executes the configured timeout action:
 * - auto_approve: approve and advance
 * - auto_reject: reject and halt pipeline
 * - auto_pause: pause pipeline, wait for creator
 *
 * Also handles timeout warning notifications at 23h, 6h, and 1h marks.
 */

import {
  getTimedOutGates, recordGateDecision, getGateById,
} from "./gate-manager";
import {
  approveStage, rejectStage,
} from "./pipeline-state-machine";
import {
  notifyTimeoutWarning,
} from "./notification-dispatcher";
import {
  writeQualityScore,
} from "./quality-feedback";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// ─── Timeout Warning Check ──────────────────────────────────────────────

/**
 * Check for gates approaching timeout and send warning notifications.
 * Should be called periodically (e.g., every 15 minutes).
 */
export async function checkTimeoutWarnings(): Promise<{
  warningsSent: number;
}> {
  const db = await getDb();
  if (!db) return { warningsSent: 0 };

  let warningsSent = 0;

  // Find pending gates with timeout approaching
  const [rows] = await db.execute(sql`
    SELECT * FROM gates
    WHERE decision = 'pending'
      AND timeoutAt IS NOT NULL
    ORDER BY timeoutAt ASC
  `);
  const pendingGates = rows as unknown as any[];

  const now = Date.now();

  for (const gate of pendingGates) {
    const timeoutAt = new Date(gate.timeoutAt).getTime();
    const hoursRemaining = (timeoutAt - now) / (1000 * 60 * 60);

    // Send warnings at 23h, 6h, and 1h marks
    if (hoursRemaining <= 1 && hoursRemaining > 0) {
      await notifyTimeoutWarning(gate, 1);
      warningsSent++;
    } else if (hoursRemaining <= 6 && hoursRemaining > 1) {
      await notifyTimeoutWarning(gate, 6);
      warningsSent++;
    } else if (hoursRemaining <= 23 && hoursRemaining > 6) {
      await notifyTimeoutWarning(gate, 23);
      warningsSent++;
    }
  }

  return { warningsSent };
}

// ─── Timeout Execution ──────────────────────────────────────────────────

/**
 * Process all timed-out gates and execute their configured timeout actions.
 * Should be called periodically (e.g., every 5 minutes).
 */
export async function processTimedOutGates(): Promise<{
  processed: number;
  autoApproved: number;
  autoRejected: number;
  autoPaused: number;
  errors: string[];
}> {
  const timedOutGates = await getTimedOutGates();
  const results = {
    processed: 0,
    autoApproved: 0,
    autoRejected: 0,
    autoPaused: 0,
    errors: [] as string[],
  };

  for (const gate of timedOutGates) {
    try {
      switch (gate.timeoutAction) {
        case "auto_approve":
          await handleAutoApproveTimeout(gate);
          results.autoApproved++;
          break;

        case "auto_reject":
          await handleAutoRejectTimeout(gate);
          results.autoRejected++;
          break;

        case "auto_pause":
          await handleAutoPauseTimeout(gate);
          results.autoPaused++;
          break;

        default:
          results.errors.push(`Gate ${gate.id}: unknown timeout action '${gate.timeoutAction}'`);
          continue;
      }

      results.processed++;
    } catch (err) {
      const msg = `Gate ${gate.id}: ${(err as Error).message}`;
      console.error("[TimeoutHandler]", msg);
      results.errors.push(msg);
    }
  }

  return results;
}

// ─── Individual Timeout Handlers ────────────────────────────────────────

async function handleAutoApproveTimeout(gate: any): Promise<void> {
  await recordGateDecision({
    gateId: gate.id,
    decision: "auto_approved",
    decisionSource: "timeout",
    decisionReason: `Timed out after ${gate.timeoutAction} policy. Auto-approved.`,
    qualityScore: 3,
  });

  await approveStage(gate.pipelineRunId, gate.stageNumber);

  // Write quality feedback
  await writeQualityScore({
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageNumber: gate.stageNumber,
    providerId: "unknown", // Would need to look up from stage
    sceneType: "unknown",
    decision: "auto_approved",
    decisionSource: "timeout",
    confidenceScore: gate.confidenceScore || 0,
    isFirstAttempt: true,
  });
}

async function handleAutoRejectTimeout(gate: any): Promise<void> {
  await recordGateDecision({
    gateId: gate.id,
    decision: "auto_rejected",
    decisionSource: "timeout",
    decisionReason: `Timed out after ${gate.timeoutAction} policy. Auto-rejected.`,
    qualityScore: 1,
  });

  await rejectStage(gate.pipelineRunId, gate.stageNumber);

  await writeQualityScore({
    gateId: gate.id,
    pipelineRunId: gate.pipelineRunId,
    stageNumber: gate.stageNumber,
    providerId: "unknown",
    sceneType: "unknown",
    decision: "auto_rejected",
    decisionSource: "timeout",
    confidenceScore: gate.confidenceScore || 0,
    isFirstAttempt: true,
  });
}

async function handleAutoPauseTimeout(gate: any): Promise<void> {
  await recordGateDecision({
    gateId: gate.id,
    decision: "timed_out",
    decisionSource: "timeout",
    decisionReason: `Timed out. Pipeline paused per ${gate.timeoutAction} policy.`,
  });

  // Pause the pipeline
  const db = await getDb();
  if (db) {
    await db.execute(sql`
      UPDATE pipeline_runs SET status = 'paused'
      WHERE id = ${gate.pipelineRunId}
    `);

    await db.execute(sql`
      UPDATE pipeline_stages SET status = 'timed_out'
      WHERE pipelineRunId = ${gate.pipelineRunId} AND stageNumber = ${gate.stageNumber}
    `);
  }
}

// ─── Batch Review Mode ──────────────────────────────────────────────────

/**
 * Get all auto-advanced gates within the 1-hour review window
 * that the creator hasn't explicitly reviewed yet.
 * Used for the "batch review" UI.
 */
export async function getBatchReviewableGates(
  userId: number
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT g.*, ps.resultUrl, ps.resultMetadata
    FROM gates g
    JOIN pipeline_stages ps ON ps.id = g.pipelineStageId
    WHERE g.userId = ${userId}
      AND g.decision = 'auto_approved'
      AND g.decisionSource = 'auto'
      AND g.decisionAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
    ORDER BY g.pipelineRunId ASC, g.stageNumber ASC
  `);

  return rows as unknown as any[];
}

/**
 * Process a batch review decision. If the creator retroactively rejects
 * an auto-advanced gate, trigger cascade rewind.
 */
export async function processBatchReviewDecision(
  gateId: number,
  decision: "confirm" | "reject" | "regenerate",
  qualityScore?: number
): Promise<{ cascadeTriggered: boolean; stagesInvalidated?: number }> {
  const gate = await getGateById(gateId);
  if (!gate) throw new Error(`Gate ${gateId} not found`);

  if (gate.decision !== "auto_approved") {
    throw new Error(`Gate ${gateId} is not in auto_approved state (current: ${gate.decision})`);
  }

  if (decision === "confirm") {
    // Creator confirms the auto-advance — upgrade to explicit approval
    await recordGateDecision({
      gateId,
      decision: "approved",
      decisionSource: "creator",
      decisionReason: "Creator confirmed auto-advanced result in batch review",
      qualityScore: qualityScore ?? 5,
    });
    return { cascadeTriggered: false };
  }

  if (decision === "reject" || decision === "regenerate") {
    // Creator retroactively rejects — trigger cascade rewind
    const { cascadeRewind } = await import("./pipeline-state-machine");

    await recordGateDecision({
      gateId,
      decision: decision === "reject" ? "rejected" : "regenerate",
      decisionSource: "creator",
      decisionReason: `Creator retroactively ${decision}ed in batch review`,
      qualityScore: qualityScore ?? (decision === "reject" ? 1 : 2),
    });

    const result = await cascadeRewind(gate.pipelineRunId, gate.stageNumber);
    return {
      cascadeTriggered: true,
      stagesInvalidated: result.stagesInvalidated,
    };
  }

  throw new Error(`Invalid batch review decision: ${decision}`);
}
