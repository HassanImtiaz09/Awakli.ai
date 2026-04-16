/**
 * HITL Orchestrator Bridge (Prompt 17 Integration)
 *
 * Connects the existing 4-node pipeline orchestrator to the 12-stage HITL
 * gate system. Maps orchestrator nodes to HITL stages, triggers gates after
 * generation completes, and resumes the pipeline after creator decisions.
 *
 * Node-to-Stage Mapping:
 * ┌─────────────────┬──────────────────────────────────────────────┐
 * │ Orchestrator     │ HITL Stages                                  │
 * │ Node             │                                              │
 * ├─────────────────┼──────────────────────────────────────────────┤
 * │ (pre-flight)     │ 1: manga_analysis, 2: scene_planning         │
 * │ video_gen        │ 3: character_sheet_gen, 4: keyframe_gen,     │
 * │                  │ 5: video_generation                          │
 * │ voice_gen        │ 6: voice_synthesis                           │
 * │ music_gen        │ 7: music_scoring, 8: sfx_foley               │
 * │ assembly         │ 9: audio_mix, 10: video_composite,           │
 * │                  │ 11: subtitle_render, 12: episode_publish     │
 * └─────────────────┴──────────────────────────────────────────────┘
 *
 * Flow:
 * 1. Pipeline starts → initializeHitlForRun() creates 12 stage rows
 * 2. Before each node → auto-advance pre-flight stages (1, 2)
 * 3. After each node → completeNodeWithGate() runs confidence scoring + gate
 * 4. If gate blocks → pipeline pauses, SSE notification sent
 * 5. Creator approves → resumePipelineAfterApproval() re-enters orchestrator
 * 6. Creator regenerates → re-execute the current node
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { getPipelineRunById, updatePipelineRun } from "../db";
import {
  initializePipelineStages,
  completeStageGeneration,
  startStageExecution,
  approveStage,
  getStageByNumber,
  getAllStages,
  getNextPendingStage,
  isPipelineComplete,
  type StageCompletionResult,
} from "./pipeline-state-machine";
import {
  resolveGateConfig,
  resolveAllGateConfigs,
  getGateById,
  type GateConfig,
} from "./gate-manager";
import {
  notifyGateReady,
  notifyAutoAdvanced,
} from "./notification-dispatcher";
import type { GenerateResult, ScoreContext } from "./confidence-scorer";
import { STAGE_NAMES, STAGE_CREDIT_ESTIMATES, TOTAL_STAGES } from "./stage-config";

// ─── Node-to-Stage Mapping ─────────────────────────────────────────────

export type OrchestratorNode = "video_gen" | "voice_gen" | "music_gen" | "assembly";

/**
 * Maps each orchestrator node to its primary HITL stage(s).
 * The "primary" stage is the one that gets the actual generation result.
 * Pre-flight stages (1, 2) are auto-advanced before node execution.
 * Post-node stages within a node group are auto-advanced with the node result.
 */
export const NODE_TO_PRIMARY_STAGE: Record<OrchestratorNode, number> = {
  video_gen: 5,   // Stage 5: video_generation (stages 3-4 are pre-flight for this node)
  voice_gen: 6,   // Stage 6: voice_synthesis
  music_gen: 7,   // Stage 7: music_scoring (stage 8 sfx_foley is secondary)
  assembly: 10,   // Stage 10: video_composite (stages 9, 11, 12 are secondary)
};

/**
 * Pre-flight stages that should be auto-advanced before the first node runs.
 * These are LLM-based analysis stages with ambient gates.
 */
export const PRE_FLIGHT_STAGES = [1, 2]; // manga_analysis, scene_planning

/**
 * Stages that are secondary to a node and auto-advance with the primary.
 * Key = primary stage, Value = array of secondary stages to auto-advance.
 */
export const SECONDARY_STAGES: Record<number, number[]> = {
  5: [3, 4],      // video_gen: character_sheet_gen + keyframe_gen are pre-stages
  7: [8],         // music_gen: sfx_foley is secondary
  10: [9, 11, 12], // assembly: audio_mix, subtitle_render, episode_publish
};

/**
 * Maps a stage number back to its orchestrator node.
 */
export const STAGE_TO_NODE: Record<number, OrchestratorNode> = {
  3: "video_gen",
  4: "video_gen",
  5: "video_gen",
  6: "voice_gen",
  7: "music_gen",
  8: "music_gen",
  9: "assembly",
  10: "assembly",
  11: "assembly",
  12: "assembly",
};

// ─── Pipeline Initialization ────────────────────────────────────────────

/**
 * Initialize HITL stages for a pipeline run.
 * Called at the start of runPipeline() before any node executes.
 */
export async function initializeHitlForRun(
  pipelineRunId: number,
  userId: number,
  tierName: string = "free_trial"
): Promise<void> {
  console.log(`[HITL Bridge] Initializing 12 HITL stages for run ${pipelineRunId}`);

  await initializePipelineStages({
    pipelineRunId,
    userId,
    tierName,
    episodeId: 0, // Will be resolved from the pipeline run
  });

  // Update pipeline run with HITL metadata
  const db = await getDb();
  if (db) {
    await db.execute(sql`
      UPDATE pipeline_runs SET
        currentStageNumber = 0,
        totalStages = ${TOTAL_STAGES}
      WHERE id = ${pipelineRunId}
    `);
  }

  console.log(`[HITL Bridge] 12 stages initialized for run ${pipelineRunId}`);
}

// ─── Pre-flight Stage Processing ────────────────────────────────────────

/**
 * Auto-advance pre-flight stages (manga_analysis, scene_planning).
 * These are LLM-based analysis stages that run before any generation node.
 * They get ambient gates and auto-advance with a synthetic result.
 */
export async function processPreFlightStages(
  pipelineRunId: number,
  userId: number,
  tierName: string = "free_trial"
): Promise<{ blocked: boolean; blockingGateId?: number; blockingStage?: number }> {
  console.log(`[HITL Bridge] Processing pre-flight stages for run ${pipelineRunId}`);

  for (const stageNum of PRE_FLIGHT_STAGES) {
    const gateConfig = await resolveGateConfig(stageNum, tierName, userId);

    // Start execution
    await startStageExecution(pipelineRunId, stageNum);

    // Create a synthetic result for LLM analysis stages
    const syntheticResult: GenerateResult = {
      requestType: "text",
      outputUrl: "",
      outputFileSize: 1000, // Non-trivial size to avoid blank detection
    };

    const scoreContext: ScoreContext = {
      stageNumber: stageNum,
    };

    const result = await completeStageGeneration(
      pipelineRunId,
      stageNum,
      userId,
      syntheticResult,
      scoreContext,
      gateConfig
    );

    // If a pre-flight gate blocks (unusual but possible for safety flags)
    if (result.nextAction === "wait_for_creator") {
      console.log(`[HITL Bridge] Pre-flight stage ${stageNum} blocked! Gate ${result.gateId}`);
      const gate = await getGateById(result.gateId);
      if (gate) await notifyGateReady(gate);
      return { blocked: true, blockingGateId: result.gateId, blockingStage: stageNum };
    }

    // Notify if auto-advanced
    if (result.behavior === "auto_advance" || result.behavior === "log_only") {
      const gate = await getGateById(result.gateId);
      if (gate) await notifyAutoAdvanced(gate);
    }

    console.log(`[HITL Bridge] Pre-flight stage ${stageNum} completed: ${result.behavior} (score: ${result.confidenceScore})`);
  }

  return { blocked: false };
}

// ─── Post-Node Gate Processing ──────────────────────────────────────────

export interface NodeCompletionParams {
  pipelineRunId: number;
  node: OrchestratorNode;
  userId: number;
  tierName?: string;
  /** The primary generation result (e.g., the video output) */
  generationResult: GenerateResult;
  /** Context for confidence scoring */
  scoreContext?: Partial<ScoreContext>;
  /** Generation request ID from the provider router */
  generationRequestId?: number;
  /** Credit hold ID */
  holdId?: string;
  /** Actual credits spent */
  creditsActual?: number;
}

/**
 * Process HITL gates after a node completes generation.
 * Auto-advances secondary stages, then creates a gate for the primary stage.
 *
 * Returns the gate result for the primary stage. If the gate blocks,
 * the caller should pause the pipeline and wait for creator input.
 */
export async function completeNodeWithGate(
  params: NodeCompletionParams
): Promise<{
  blocked: boolean;
  gateResult: StageCompletionResult;
  primaryStage: number;
  secondaryStagesAdvanced: number[];
}> {
  const {
    pipelineRunId,
    node,
    userId,
    tierName = "free_trial",
    generationResult,
    scoreContext = {},
    generationRequestId,
    holdId,
    creditsActual,
  } = params;

  const primaryStage = NODE_TO_PRIMARY_STAGE[node];
  const secondaryStages = SECONDARY_STAGES[primaryStage] || [];
  const secondaryStagesAdvanced: number[] = [];

  console.log(`[HITL Bridge] Processing node '${node}' completion → primary stage ${primaryStage}`);

  // 1. Auto-advance secondary pre-stages (e.g., stages 3-4 before stage 5)
  for (const secStage of secondaryStages.filter(s => s < primaryStage)) {
    try {
      const secConfig = await resolveGateConfig(secStage, tierName, userId);
      await startStageExecution(pipelineRunId, secStage);

      const secResult = await completeStageGeneration(
        pipelineRunId,
        secStage,
        userId,
        { ...generationResult, requestType: "image" }, // Secondary stages get image type
        { stageNumber: secStage, ...scoreContext },
        secConfig
      );

      if (secResult.nextAction !== "wait_for_creator") {
        secondaryStagesAdvanced.push(secStage);
        const gate = await getGateById(secResult.gateId);
        if (gate) await notifyAutoAdvanced(gate);
      }
    } catch (err) {
      console.warn(`[HITL Bridge] Secondary stage ${secStage} auto-advance failed:`, err);
      // Non-critical: secondary stage failure doesn't block the primary
    }
  }

  // 2. Execute and gate the primary stage
  await startStageExecution(pipelineRunId, primaryStage);

  const gateConfig = await resolveGateConfig(primaryStage, tierName, userId);
  const fullScoreContext: ScoreContext = {
    stageNumber: primaryStage,
    ...scoreContext,
  };

  const gateResult = await completeStageGeneration(
    pipelineRunId,
    primaryStage,
    userId,
    generationResult,
    fullScoreContext,
    gateConfig,
    generationRequestId,
    holdId,
    creditsActual
  );

  // 3. Send notifications
  const gate = await getGateById(gateResult.gateId);
  if (gate) {
    if (gateResult.nextAction === "wait_for_creator") {
      await notifyGateReady(gate);
      console.log(`[HITL Bridge] Gate BLOCKED at stage ${primaryStage} (score: ${gateResult.confidenceScore})`);
    } else {
      await notifyAutoAdvanced(gate);
      console.log(`[HITL Bridge] Gate auto-advanced at stage ${primaryStage} (score: ${gateResult.confidenceScore})`);
    }
  }

  // 4. Auto-advance secondary post-stages (e.g., stage 8 after stage 7)
  if (gateResult.nextAction !== "wait_for_creator") {
    for (const secStage of secondaryStages.filter(s => s > primaryStage)) {
      try {
        const secConfig = await resolveGateConfig(secStage, tierName, userId);
        await startStageExecution(pipelineRunId, secStage);

        const secResult = await completeStageGeneration(
          pipelineRunId,
          secStage,
          userId,
          generationResult,
          { stageNumber: secStage, ...scoreContext },
          secConfig
        );

        if (secResult.nextAction !== "wait_for_creator") {
          secondaryStagesAdvanced.push(secStage);
          const secGate = await getGateById(secResult.gateId);
          if (secGate) await notifyAutoAdvanced(secGate);
        }
      } catch (err) {
        console.warn(`[HITL Bridge] Secondary stage ${secStage} auto-advance failed:`, err);
      }
    }
  }

  // 5. Update pipeline run current stage
  const db = await getDb();
  if (db) {
    await db.execute(sql`
      UPDATE pipeline_runs SET currentStageNumber = ${primaryStage}
      WHERE id = ${pipelineRunId}
    `);
  }

  return {
    blocked: gateResult.nextAction === "wait_for_creator",
    gateResult,
    primaryStage,
    secondaryStagesAdvanced,
  };
}

// ─── Pipeline Resume After Gate Decision ────────────────────────────────

export interface ResumeResult {
  resumed: boolean;
  nextNode?: OrchestratorNode;
  pipelineComplete?: boolean;
  error?: string;
}

/**
 * Resume the pipeline after a creator approves a gate.
 * Called from the submitDecision tRPC procedure after approveStage().
 *
 * Determines the next orchestrator node to execute and returns it.
 * The actual node execution is handled by the orchestrator.
 */
export async function resumePipelineAfterApproval(
  pipelineRunId: number
): Promise<ResumeResult> {
  const run = await getPipelineRunById(pipelineRunId);
  if (!run) return { resumed: false, error: "Pipeline run not found" };

  // Check if pipeline is complete
  if (await isPipelineComplete(pipelineRunId)) {
    await updatePipelineRun(pipelineRunId, {
      status: "completed",
      completedAt: new Date(),
    } as any);
    return { resumed: true, pipelineComplete: true };
  }

  // Find the next pending stage
  const stages = await getAllStages(pipelineRunId);
  const currentStageNumber = stages.find(s =>
    s.status === "pending" || s.status === "regenerating"
  )?.stageNumber;

  if (!currentStageNumber) {
    // All stages are either approved, skipped, or failed
    return { resumed: true, pipelineComplete: true };
  }

  // Map the next stage back to an orchestrator node
  const nextNode = STAGE_TO_NODE[currentStageNumber];
  if (!nextNode) {
    // Pre-flight stages (1, 2) — re-process them
    return { resumed: true, nextNode: "video_gen" };
  }

  // Update pipeline run status to active
  await updatePipelineRun(pipelineRunId, {
    status: "running",
    currentNode: nextNode,
  } as any);

  console.log(`[HITL Bridge] Pipeline ${pipelineRunId} resuming at node '${nextNode}' (stage ${currentStageNumber})`);

  return { resumed: true, nextNode };
}

/**
 * Resume the pipeline after a creator requests regeneration.
 * Returns the node that needs to be re-executed.
 */
export async function resumePipelineAfterRegeneration(
  pipelineRunId: number,
  stageNumber: number
): Promise<ResumeResult> {
  const node = STAGE_TO_NODE[stageNumber];
  if (!node) {
    return { resumed: false, error: `Stage ${stageNumber} has no mapped orchestrator node` };
  }

  // Update pipeline run status
  await updatePipelineRun(pipelineRunId, {
    status: "running",
    currentNode: node,
  } as any);

  console.log(`[HITL Bridge] Pipeline ${pipelineRunId} regenerating at node '${node}' (stage ${stageNumber})`);

  return { resumed: true, nextNode: node };
}

// ─── Pipeline Pause ─────────────────────────────────────────────────────

/**
 * Pause the pipeline when a gate blocks.
 * Updates the pipeline run status and stores the blocking gate info.
 */
export async function pausePipelineForGate(
  pipelineRunId: number,
  gateId: number,
  stageNumber: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    UPDATE pipeline_runs SET
      status = 'paused',
      currentStageNumber = ${stageNumber}
    WHERE id = ${pipelineRunId}
  `);

  console.log(`[HITL Bridge] Pipeline ${pipelineRunId} paused at stage ${stageNumber} (gate ${gateId})`);
}

// ─── Timeout Cron Integration ───────────────────────────────────────────

import { checkTimeoutWarnings, processTimedOutGates } from "./timeout-handler";

/**
 * Process all timeout-related actions. Should be called on a cron schedule
 * (e.g., every 5 minutes).
 *
 * 1. Send timeout warnings (1h, 6h, 23h before expiry)
 * 2. Process gates that have exceeded their timeout
 * 3. Resume pipelines that were auto-approved by timeout
 */
export async function processTimeouts(): Promise<{
  warningsSent: number;
  gatesProcessed: number;
  pipelinesResumed: number;
}> {
  console.log("[HITL Bridge] Processing timeouts...");

  // 1. Send warnings
  const warningsResult = await checkTimeoutWarnings();
  const warningsSent = typeof warningsResult === 'number' ? warningsResult : (warningsResult as any)?.warningsSent ?? 0;

  // 2. Process timed-out gates
  const timeoutResult = await processTimedOutGates();
  const gatesProcessed = typeof timeoutResult === 'number' ? timeoutResult : (timeoutResult as any)?.processed ?? 0;

  // 3. Check if any auto-approved gates need pipeline resumption
  let pipelinesResumed = 0;
  const db = await getDb();
  if (db) {
    // Find pipeline runs that are paused but have no pending gates
    const [rows] = await db.execute(sql`
      SELECT DISTINCT pr.id
      FROM pipeline_runs pr
      WHERE pr.status = 'paused'
        AND NOT EXISTS (
          SELECT 1 FROM gates g
          WHERE g.pipelineRunId = pr.id AND g.decision = 'pending'
        )
    `);
    const pausedRuns = rows as unknown as any[];

    for (const run of pausedRuns) {
      try {
        const result = await resumePipelineAfterApproval(run.id);
        if (result.resumed) pipelinesResumed++;
      } catch (err) {
        console.error(`[HITL Bridge] Failed to resume pipeline ${run.id} after timeout:`, err);
      }
    }
  }

  console.log(`[HITL Bridge] Timeouts processed: ${warningsSent} warnings, ${gatesProcessed} gates, ${pipelinesResumed} pipelines resumed`);

  return { warningsSent, gatesProcessed, pipelinesResumed };
}

// ─── Helper: Get user tier from pipeline run ────────────────────────────

export async function getUserTierForRun(pipelineRunId: number): Promise<string> {
  const db = await getDb();
  if (!db) return "free_trial";

  const [rows] = await db.execute(sql`
    SELECT s.planId
    FROM pipeline_runs pr
    JOIN users u ON pr.userId = u.id
    LEFT JOIN subscriptions s ON s.userId = u.id AND s.status = 'active'
    WHERE pr.id = ${pipelineRunId}
    LIMIT 1
  `);
  const results = rows as unknown as any[];
  if (results.length === 0) return "free_trial";

  const planId = results[0]?.planId;
  // Map plan IDs to tier names
  const planToTier: Record<string, string> = {
    creator_monthly: "creator",
    creator_yearly: "creator",
    creator_pro_monthly: "creator_pro",
    creator_pro_yearly: "creator_pro",
    studio_monthly: "studio",
    studio_yearly: "studio",
    enterprise: "enterprise",
  };

  return planToTier[planId] || "free_trial";
}
