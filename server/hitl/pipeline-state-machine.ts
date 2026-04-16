/**
 * HITL Pipeline State Machine (Prompt 17)
 *
 * Manages the execution flow of an episode through all 12 stages,
 * respecting gate decisions at each checkpoint. Event-driven, not polling.
 *
 * State transitions per stage:
 * PENDING → EXECUTING → AWAITING_GATE → APPROVED → (next stage)
 *                                      → REJECTED → (halt)
 *                                      → REGENERATING → EXECUTING → ...
 * EXECUTING → FAILED (provider error after all retries)
 * AWAITING_GATE → TIMED_OUT (depends on timeout_action)
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  TOTAL_STAGES, STAGE_NAMES, STAGE_CREDIT_ESTIMATES,
  StageStatus, PipelineRunStatus,
  isStageSkippable,
} from "./stage-config";
import {
  resolveAllGateConfigs, createGate, recordGateDecision,
  determineGateBehavior, writeAuditLog,
  type GateConfig, type GateRow,
} from "./gate-manager";
import { scoreGeneration, type GenerateResult, type ScoreContext } from "./confidence-scorer";

// ─── Types ──────────────────────────────────────────────────────────────

export interface PipelineStageRow {
  id: number;
  pipelineRunId: number;
  stageNumber: number;
  stageName: string;
  status: StageStatus;
  generationRequestId: number | null;
  gateId: number | null;
  creditsEstimated: number | null;
  creditsActual: number | null;
  holdId: string | null;
  attempts: number;
  maxAttempts: number;
  resultUrl: string | null;
  resultMetadata: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface InitPipelineParams {
  pipelineRunId: number;
  userId: number;
  tierName: string;
  episodeId: number;
}

export interface StageCompletionResult {
  behavior: "block" | "auto_advance" | "soft_notify" | "log_only";
  gateId: number;
  confidenceScore: number;
  flags: string[];
  nextAction: "wait_for_creator" | "advance" | "advance_after_delay";
}

// ─── Pipeline Initialization ────────────────────────────────────────────

/**
 * Initialize all 12 pipeline_stages rows for a new pipeline run.
 * Sets stage 1 to 'pending' (orchestrator will start it).
 */
export async function initializePipelineStages(params: InitPipelineParams): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Resolve gate configs for this user's tier
  const gateConfigs = await resolveAllGateConfigs(params.tierName, params.userId);

  // Store gate config snapshot on the pipeline run
  await db.execute(sql`
    UPDATE pipeline_runs SET
      currentStageNumber = 0,
      totalStages = ${TOTAL_STAGES},
      gateConfig = ${JSON.stringify(gateConfigs)},
      totalCreditsSpent = 0,
      totalCreditsHeld = 0
    WHERE id = ${params.pipelineRunId}
  `);

  // Create all 12 stage rows
  for (let i = 1; i <= TOTAL_STAGES; i++) {
    const stageName = STAGE_NAMES[i];
    const creditsEstimated = STAGE_CREDIT_ESTIMATES[i] || 0;

    await db.execute(sql`
      INSERT INTO pipeline_stages (
        pipelineRunId, stageNumber, stageName, status,
        creditsEstimated, attempts, maxAttempts
      ) VALUES (
        ${params.pipelineRunId}, ${i}, ${stageName}, 'pending',
        ${creditsEstimated}, 0, 3
      )
    `);
  }
}

// ─── Stage Lifecycle ────────────────────────────────────────────────────

/**
 * Transition a stage to 'executing' status.
 */
export async function startStageExecution(
  pipelineRunId: number,
  stageNumber: number
): Promise<PipelineStageRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Validate transition: must be 'pending' or 'regenerating'
  const stage = await getStageByNumber(pipelineRunId, stageNumber);
  if (!stage) throw new Error(`Stage ${stageNumber} not found for run ${pipelineRunId}`);

  if (stage.status !== "pending" && stage.status !== "regenerating") {
    throw new Error(`Invalid transition: cannot start execution from status '${stage.status}'`);
  }

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'executing',
      startedAt = NOW(),
      attempts = attempts + 1
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);

  // Update pipeline run current stage
  await db.execute(sql`
    UPDATE pipeline_runs SET currentStageNumber = ${stageNumber}
    WHERE id = ${pipelineRunId}
  `);

  return getStageByNumber(pipelineRunId, stageNumber);
}

/**
 * Record a generation result for a stage and create the gate.
 * Returns the gate behavior and confidence score.
 */
export async function completeStageGeneration(
  pipelineRunId: number,
  stageNumber: number,
  userId: number,
  generationResult: GenerateResult,
  scoreContext: ScoreContext,
  gateConfig: GateConfig,
  generationRequestId?: number,
  holdId?: string,
  creditsActual?: number
): Promise<StageCompletionResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stage = await getStageByNumber(pipelineRunId, stageNumber);
  if (!stage) throw new Error(`Stage ${stageNumber} not found`);

  // Run confidence scorer
  const confidence = await scoreGeneration(generationResult, scoreContext);

  // Update stage with result
  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'awaiting_gate',
      generationRequestId = ${generationRequestId ?? null},
      holdId = ${holdId ?? null},
      creditsActual = ${creditsActual ?? null},
      resultUrl = ${generationResult.outputUrl},
      resultMetadata = ${JSON.stringify({
        requestType: generationResult.requestType,
        duration: generationResult.outputDuration,
        width: generationResult.outputWidth,
        height: generationResult.outputHeight,
        fileSize: generationResult.outputFileSize,
        frameCount: generationResult.outputFrameCount,
      })}
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);

  // Calculate credit context for the gate
  const creditContext = await calculateCreditContext(pipelineRunId, stageNumber);

  // Create the gate
  const gateId = await createGate({
    pipelineStageId: stage.id,
    pipelineRunId,
    userId,
    stageNumber,
    gateType: gateConfig.gateType,
    confidenceScore: confidence.score,
    confidenceDetails: {
      breakdown: confidence.breakdown,
      flags: confidence.flags,
    },
    autoAdvanceThreshold: gateConfig.autoAdvanceThreshold,
    reviewThreshold: gateConfig.reviewThreshold,
    timeoutHours: gateConfig.timeoutHours,
    timeoutAction: gateConfig.timeoutAction,
    ...creditContext,
  });

  // Link gate to stage
  await db.execute(sql`
    UPDATE pipeline_stages SET gateId = ${gateId}
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);

  // Determine gate behavior
  const behavior = determineGateBehavior(
    gateConfig.gateType,
    confidence.score,
    gateConfig.autoAdvanceThreshold,
    gateConfig.reviewThreshold,
    confidence.flags
  );

  let nextAction: StageCompletionResult["nextAction"];

  switch (behavior) {
    case "auto_advance":
      // Auto-approve and advance
      await recordGateDecision({
        gateId,
        decision: "auto_approved",
        decisionSource: "auto",
        decisionReason: `Confidence ${confidence.score} >= threshold ${gateConfig.autoAdvanceThreshold}`,
        qualityScore: 4, // auto-approved quality score
      });
      await approveStage(pipelineRunId, stageNumber);
      nextAction = "advance";
      break;

    case "soft_notify":
      // Will auto-advance after 5-minute delay unless creator intervenes
      nextAction = "advance_after_delay";
      break;

    case "log_only":
      // Ambient gate — log and advance immediately
      await recordGateDecision({
        gateId,
        decision: "auto_approved",
        decisionSource: "auto",
        decisionReason: `Ambient gate: score ${confidence.score} (no issues detected)`,
        qualityScore: 3,
      });
      await approveStage(pipelineRunId, stageNumber);
      nextAction = "advance";
      break;

    case "block":
    default:
      // Wait for creator action
      nextAction = "wait_for_creator";
      break;
  }

  return {
    behavior,
    gateId,
    confidenceScore: confidence.score,
    flags: confidence.flags,
    nextAction,
  };
}

/**
 * Approve a stage and prepare to advance to the next.
 */
export async function approveStage(
  pipelineRunId: number,
  stageNumber: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'approved',
      completedAt = NOW()
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);
}

/**
 * Reject a stage. Pipeline halts.
 */
export async function rejectStage(
  pipelineRunId: number,
  stageNumber: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'rejected',
      completedAt = NOW()
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);

  // Pause the pipeline run
  await db.execute(sql`
    UPDATE pipeline_runs SET status = 'paused'
    WHERE id = ${pipelineRunId}
  `);
}

/**
 * Set a stage to regenerating status.
 */
export async function startRegeneration(
  pipelineRunId: number,
  stageNumber: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stage = await getStageByNumber(pipelineRunId, stageNumber);
  if (!stage) throw new Error(`Stage ${stageNumber} not found`);

  if (stage.attempts >= stage.maxAttempts) {
    throw new Error(`Stage ${stageNumber} has exhausted max attempts (${stage.maxAttempts})`);
  }

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'regenerating',
      resultUrl = NULL,
      resultMetadata = NULL,
      holdId = NULL
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);
}

/**
 * Mark a stage as failed.
 */
export async function failStage(
  pipelineRunId: number,
  stageNumber: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'failed',
      completedAt = NOW(),
      resultMetadata = ${JSON.stringify({ failureReason: reason })}
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);

  await db.execute(sql`
    UPDATE pipeline_runs SET status = 'failed'
    WHERE id = ${pipelineRunId}
  `);
}

/**
 * Skip a stage (only for skippable ambient gates).
 */
export async function skipStage(
  pipelineRunId: number,
  stageNumber: number,
  gateType: string
): Promise<void> {
  if (!isStageSkippable(stageNumber, gateType as any)) {
    throw new Error(`Stage ${stageNumber} with gate type '${gateType}' is not skippable`);
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'skipped',
      completedAt = NOW()
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
  `);
}

/**
 * Abort an entire pipeline run. Release all pending holds.
 */
export async function abortPipeline(
  pipelineRunId: number,
  reason: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Mark all pending/executing/awaiting_gate stages as failed
  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'failed',
      completedAt = NOW()
    WHERE pipelineRunId = ${pipelineRunId}
      AND status IN ('pending', 'executing', 'awaiting_gate', 'regenerating')
  `);

  // Mark all pending gates as timed_out
  await db.execute(sql`
    UPDATE gates SET
      decision = 'timed_out',
      decisionSource = 'timeout',
      decisionReason = ${reason},
      decisionAt = NOW()
    WHERE pipelineRunId = ${pipelineRunId} AND decision = 'pending'
  `);

  // Update pipeline run
  await db.execute(sql`
    UPDATE pipeline_runs SET
      status = 'aborted',
      abortedAt = NOW(),
      abortReason = ${reason}
    WHERE id = ${pipelineRunId}
  `);
}

/**
 * Cascade rewind: invalidate all stages from a given stage number onwards.
 * Used when a creator retroactively rejects an auto-advanced stage.
 */
export async function cascadeRewind(
  pipelineRunId: number,
  rewindToStage: number
): Promise<{ stagesInvalidated: number; creditsReleased: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get all stages after the rewind point that have been executed
  const [rows] = await db.execute(sql`
    SELECT id, stageNumber, creditsActual, holdId, status
    FROM pipeline_stages
    WHERE pipelineRunId = ${pipelineRunId}
      AND stageNumber > ${rewindToStage}
      AND status IN ('approved', 'awaiting_gate', 'executing')
    ORDER BY stageNumber ASC
  `);
  const stages = rows as unknown as any[];

  let creditsReleased = 0;
  let stagesInvalidated = 0;

  for (const stage of stages) {
    // Reset stage to pending
    await db.execute(sql`
      UPDATE pipeline_stages SET
        status = 'pending',
        resultUrl = NULL,
        resultMetadata = NULL,
        holdId = NULL,
        gateId = NULL,
        creditsActual = NULL,
        attempts = 0,
        startedAt = NULL,
        completedAt = NULL
      WHERE id = ${stage.id}
    `);

    if (stage.creditsActual) {
      creditsReleased += Number(stage.creditsActual);
    }
    stagesInvalidated++;
  }

  // Set the rewind target stage to regenerating
  await db.execute(sql`
    UPDATE pipeline_stages SET
      status = 'regenerating',
      resultUrl = NULL,
      resultMetadata = NULL,
      holdId = NULL
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${rewindToStage}
  `);

  // Update pipeline run current stage
  await db.execute(sql`
    UPDATE pipeline_runs SET
      currentStageNumber = ${rewindToStage},
      status = 'active'
    WHERE id = ${pipelineRunId}
  `);

  // Write audit log
  await writeAuditLog({
    gateId: 0,
    pipelineRunId,
    stageNumber: rewindToStage,
    eventType: "cascade_rewind",
    oldState: null,
    newState: { rewindToStage, stagesInvalidated, creditsReleased },
    actor: "creator",
  });

  return { stagesInvalidated, creditsReleased };
}

// ─── Query Helpers ──────────────────────────────────────────────────────

/**
 * Get a specific stage by pipeline run and stage number.
 */
export async function getStageByNumber(
  pipelineRunId: number,
  stageNumber: number
): Promise<PipelineStageRow | null> {
  const db = await getDb();
  if (!db) return null;

  const [rows] = await db.execute(sql`
    SELECT * FROM pipeline_stages
    WHERE pipelineRunId = ${pipelineRunId} AND stageNumber = ${stageNumber}
    LIMIT 1
  `);
  const results = rows as unknown as any[];
  return results.length > 0 ? results[0] as PipelineStageRow : null;
}

/**
 * Get all stages for a pipeline run.
 */
export async function getAllStages(pipelineRunId: number): Promise<PipelineStageRow[]> {
  const db = await getDb();
  if (!db) return [];

  const [rows] = await db.execute(sql`
    SELECT * FROM pipeline_stages
    WHERE pipelineRunId = ${pipelineRunId}
    ORDER BY stageNumber ASC
  `);
  return (rows as unknown as any[]) as PipelineStageRow[];
}

/**
 * Get the next pending stage after the current one.
 */
export async function getNextPendingStage(
  pipelineRunId: number,
  afterStage: number
): Promise<PipelineStageRow | null> {
  const db = await getDb();
  if (!db) return null;

  const [rows] = await db.execute(sql`
    SELECT * FROM pipeline_stages
    WHERE pipelineRunId = ${pipelineRunId}
      AND stageNumber > ${afterStage}
      AND status = 'pending'
    ORDER BY stageNumber ASC
    LIMIT 1
  `);
  const results = rows as unknown as any[];
  return results.length > 0 ? results[0] as PipelineStageRow : null;
}

/**
 * Check if all stages are complete (approved or skipped).
 */
export async function isPipelineComplete(pipelineRunId: number): Promise<boolean> {
  const stages = await getAllStages(pipelineRunId);
  return stages.length === TOTAL_STAGES &&
    stages.every(s => s.status === "approved" || s.status === "skipped");
}

// ─── Credit Context Calculator ──────────────────────────────────────────

async function calculateCreditContext(
  pipelineRunId: number,
  currentStageNumber: number
): Promise<{
  creditsSpentSoFar: number;
  creditsToProceed: number;
  creditsToRegenerate: number;
  creditsSavedIfReject: number;
}> {
  const stages = await getAllStages(pipelineRunId);

  let creditsSpentSoFar = 0;
  let creditsToProceed = 0;
  let creditsToRegenerate = 0;

  for (const stage of stages) {
    if (stage.stageNumber < currentStageNumber && stage.creditsActual) {
      creditsSpentSoFar += Number(stage.creditsActual);
    }
    if (stage.stageNumber === currentStageNumber && stage.creditsActual) {
      creditsSpentSoFar += Number(stage.creditsActual);
      creditsToRegenerate = Number(stage.creditsEstimated || stage.creditsActual);
    }
    if (stage.stageNumber > currentStageNumber) {
      creditsToProceed += Number(stage.creditsEstimated || 0);
    }
  }

  // Credits saved if reject = remaining stages' estimated cost
  const creditsSavedIfReject = creditsToProceed;

  return {
    creditsSpentSoFar,
    creditsToProceed,
    creditsToRegenerate,
    creditsSavedIfReject,
  };
}
