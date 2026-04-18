/**
 * Prompt 25 — Motion LoRA tRPC Router
 *
 * CRUD procedures for motion LoRA training jobs, coverage matrix,
 * GPU job submission/polling, and evaluation gate runner.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { TIERS, normalizeTier, type TierKey } from "./stripe/products";
import { getSubscriptionByUserId } from "./db-phase6";
import {
  getMotionLorasByCharacter, getMotionLoraById, getActiveMotionLora,
  createMotionLora, updateMotionLora, retireMotionLora, promoteMotionLora,
  countTrainingsThisMonth,
  getMotionLoraConfig, createMotionLoraConfig,
  getCoverageByCharacter, getCoverageByMotionLora, batchUpsertCoverage,
} from "./db-motion-lora";
import { getCharacterById } from "./db";
import {
  submitMotionLoraTrainingJob, pollTrainingJobStatus,
  cancelTrainingJob, type TrainingJobSubmission,
} from "./motion-lora-job-queue";
import {
  runEvaluationPipeline, getEvaluationReport,
} from "./motion-lora-gate-runner";

// ─── Helpers ───────────────────────────────────────────────────────────

async function getUserTier(userId: number): Promise<TierKey> {
  const sub = await getSubscriptionByUserId(userId);
  return normalizeTier(sub?.tier || "free_trial");
}

function assertMotionLoraAllowed(tierConfig: typeof TIERS[TierKey]) {
  if (!tierConfig.motionLoraEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Motion LoRA requires Creator Pro or higher. Your plan (${tierConfig.name}) does not include this feature.`,
    });
  }
}

// ─── Router ────────────────────────────────────────────────────────────

export const motionLoraRouter = router({

  // ─── Status (combined query for MotionLoraPanel) ─────────────────────

  /** Get the full motion LoRA status for a character (tier, quota, active LoRA, coverage) */
  status: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const tier = await getUserTier(ctx.user.id);
      const tierConfig = TIERS[tier];
      const trainingsUsed = await countTrainingsThisMonth(ctx.user.id);
      const activeLora = await getActiveMotionLora(input.characterId);
      const allLoras = await getMotionLorasByCharacter(input.characterId);
      const coverage = activeLora
        ? await getCoverageByMotionLora(activeLora.id)
        : [];

      // Map evaluation results to the shape MotionLoraPanel expects
      let evaluationResults: {
        verdict: "promoted" | "blocked" | "needs_review";
        gates: Array<{ gateId: string; status: "pass" | "fail" | "warn" | "skip"; score: number | null }>;
        evaluatedAt: number;
      } | undefined;

      if (activeLora?.evaluationResults && activeLora?.evaluationVerdict) {
        const rawGates = activeLora.evaluationResults as Array<{
          gateId: string; passed: boolean; value: number; threshold: number; details?: string;
        }>;
        evaluationResults = {
          verdict: activeLora.evaluationVerdict,
          gates: rawGates.map(g => ({
            gateId: g.gateId,
            status: g.passed ? "pass" as const : "fail" as const,
            score: g.value ?? null,
          })),
          evaluatedAt: activeLora.evaluatedAt?.getTime() ?? Date.now(),
        };
      }

      // Map training status from DB enum to MotionLoraPanel enum
      const statusMap: Record<string, "pending" | "preparing" | "training" | "evaluating" | "complete" | "failed"> = {
        queued: "pending",
        training: "training",
        evaluating: "evaluating",
        promoted: "complete",
        blocked: "failed",
        needs_review: "complete",
        retired: "complete",
      };

      // Find the latest non-retired LoRA for training status
      const latestLora = allLoras.find(l => l.status !== "retired") ?? activeLora;

      return {
        tierAllowed: tierConfig.motionLoraEnabled,
        tierName: tierConfig.name,
        maxTrainingsPerMonth: tierConfig.maxMotionLoraTrainingsPerMonth,
        trainingsUsedThisMonth: trainingsUsed,
        hasMotionLora: !!activeLora,
        trainingStatus: latestLora ? statusMap[latestLora.status] ?? "pending" : undefined,
        trainingProgress: latestLora?.status === "training" ? 50 : // TODO: real progress from job queue
          latestLora?.status === "evaluating" ? 90 :
          latestLora?.status === "promoted" ? 100 : 0,
        modelVersion: activeLora ? `v${activeLora.version}` : undefined,
        evaluationResults,
        // Additional data for detailed views
        activeLora,
        allLoras,
        coverage,
      };
    }),

  // ─── List ────────────────────────────────────────────────────────────

  /** List all motion LoRAs for a character */
  list: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ input }) => {
      return getMotionLorasByCharacter(input.characterId);
    }),

  // ─── Get ─────────────────────────────────────────────────────────────

  /** Get a single motion LoRA with its config and coverage */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const lora = await getMotionLoraById(input.id);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });

      const config = await getMotionLoraConfig(lora.id);
      const coverage = await getCoverageByMotionLora(lora.id);

      return { lora, config, coverage };
    }),

  // ─── Submit Training ─────────────────────────────────────────────────

  /** Submit a new motion LoRA training job (tier-gated, quota-checked) */
  submitTraining: protectedProcedure
    .input(z.object({
      characterId: z.number(),
      trainingPath: z.enum(["sdxl_kohya", "wan_fork"]),
      trainingClipUrls: z.array(z.string()).min(40, "Need at least 40 training clips"),
      captionUrls: z.array(z.string()).optional(),
      trainingSteps: z.number().min(1000).max(5000).default(3500),
      frameCount: z.number().min(16).max(24).default(16),
      baseWeight: z.number().min(0.30).max(0.85).default(0.60),
      // Optional hyperparameter overrides
      networkDim: z.number().min(16).max(128).default(64),
      networkAlpha: z.number().min(8).max(64).default(32),
      learningRate: z.number().min(1e-5).max(1e-3).default(1e-4),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. Tier gate check
      const tier = await getUserTier(ctx.user.id);
      const tierConfig = TIERS[tier];
      assertMotionLoraAllowed(tierConfig);

      // 2. Quota check
      const trainingsUsed = await countTrainingsThisMonth(ctx.user.id);
      if (trainingsUsed >= tierConfig.maxMotionLoraTrainingsPerMonth) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Monthly training quota reached (${trainingsUsed}/${tierConfig.maxMotionLoraTrainingsPerMonth}). Quota resets on the 1st of next month.`,
        });
      }

      // 3. Verify character exists and belongs to user
      const character = await getCharacterById(input.characterId);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
      if (character.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your character" });
      }

      // 4. Create the motion LoRA DB record
      const motionLoraId = await createMotionLora({
        characterId: input.characterId,
        userId: ctx.user.id,
        trainingPath: input.trainingPath,
        status: "queued",
        trainingSteps: input.trainingSteps,
        trainingClipCount: input.trainingClipUrls.length,
        frameCount: input.frameCount,
        baseWeight: input.baseWeight,
        triggerToken: `motion_${character.name?.toLowerCase().replace(/\s+/g, "_") ?? "char"}_v`,
      });

      // 5. Save the training config snapshot
      const configSnapshot = {
        trainingPath: input.trainingPath,
        trainingSteps: input.trainingSteps,
        networkDim: input.networkDim,
        networkAlpha: input.networkAlpha,
        learningRate: input.learningRate,
        frameCount: input.frameCount,
        clipCount: input.trainingClipUrls.length,
        captionCount: input.captionUrls?.length ?? 0,
        baseWeight: input.baseWeight,
      };

      await createMotionLoraConfig({
        motionLoraId,
        config: configSnapshot,
        trainingPath: input.trainingPath,
        learningRate: input.learningRate,
        rank: input.networkDim,
        alpha: input.networkAlpha,
        networkDim: input.networkDim,
        batchSize: 1,
        resolution: "512x512",
        schedulerType: "cosine_with_restarts",
        optimizerType: "AdamW8bit",
      });

      // 6. Submit to GPU job queue
      const jobSubmission: TrainingJobSubmission = {
        motionLoraId,
        characterId: input.characterId,
        characterName: character.name ?? "Unknown",
        userId: ctx.user.id,
        trainingPath: input.trainingPath,
        trainingClipUrls: input.trainingClipUrls,
        captionUrls: input.captionUrls ?? [],
        config: configSnapshot,
      };

      const jobResult = await submitMotionLoraTrainingJob(jobSubmission);

      // 7. Update the record with training start time
      await updateMotionLora(motionLoraId, {
        status: "training",
        trainingStartedAt: new Date(),
      });

      return {
        motionLoraId,
        jobId: jobResult.jobId,
        provider: jobResult.provider,
        estimatedMinutes: jobResult.estimatedMinutes,
        estimatedCostCredits: jobResult.estimatedCostCredits,
      };
    }),

  // ─── Check Training Status ───────────────────────────────────────────

  /** Poll the training job status from the GPU provider */
  checkTrainingStatus: protectedProcedure
    .input(z.object({ motionLoraId: z.number() }))
    .query(async ({ ctx, input }) => {
      const lora = await getMotionLoraById(input.motionLoraId);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });
      if (lora.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your training job" });
      }

      // If already in a terminal state, return from DB
      if (["promoted", "blocked", "needs_review", "retired"].includes(lora.status)) {
        return {
          status: lora.status,
          progress: 100,
          artifactUrl: lora.artifactUrl,
          evaluationVerdict: lora.evaluationVerdict,
          completedAt: lora.trainingCompletedAt?.getTime(),
        };
      }

      // Poll the GPU provider for live status
      const pollResult = await pollTrainingJobStatus(input.motionLoraId);

      // Update DB if status changed
      if (pollResult.status !== lora.status) {
        const updates: Record<string, unknown> = { status: pollResult.status };
        if (pollResult.status === "evaluating" && pollResult.artifactUrl) {
          updates.artifactUrl = pollResult.artifactUrl;
          updates.artifactKey = pollResult.artifactKey;
          updates.trainingCompletedAt = new Date();
        }
        await updateMotionLora(input.motionLoraId, updates as any);
      }

      return {
        status: pollResult.status,
        progress: pollResult.progress,
        currentStep: pollResult.currentStep,
        totalSteps: pollResult.totalSteps,
        loss: pollResult.loss,
        artifactUrl: pollResult.artifactUrl,
        estimatedRemainingMs: pollResult.estimatedRemainingMs,
      };
    }),

  // ─── Cancel Training ─────────────────────────────────────────────────

  /** Cancel an in-progress training job */
  cancelTraining: protectedProcedure
    .input(z.object({ motionLoraId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const lora = await getMotionLoraById(input.motionLoraId);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });
      if (lora.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your training job" });
      }
      if (!["queued", "training"].includes(lora.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only cancel queued or training jobs" });
      }

      await cancelTrainingJob(input.motionLoraId);
      await retireMotionLora(input.motionLoraId);

      return { cancelled: true };
    }),

  // ─── Run Evaluation ──────────────────────────────────────────────────

  /** Trigger M1-M14 evaluation on a trained motion LoRA artifact */
  runEvaluation: protectedProcedure
    .input(z.object({ motionLoraId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const lora = await getMotionLoraById(input.motionLoraId);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });
      if (lora.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your training job" });
      }
      if (!lora.artifactUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No trained artifact available for evaluation" });
      }

      // Set status to evaluating
      await updateMotionLora(input.motionLoraId, { status: "evaluating" });

      // Run the evaluation pipeline
      const evalResult = await runEvaluationPipeline({
        motionLoraId: input.motionLoraId,
        characterId: lora.characterId,
        artifactUrl: lora.artifactUrl,
        trainingPath: lora.trainingPath as "sdxl_kohya" | "wan_fork",
        baseWeight: lora.baseWeight ?? 0.60,
      });

      // Write results back to the motion LoRA record
      await updateMotionLora(input.motionLoraId, {
        evaluationResults: evalResult.gates,
        evaluationVerdict: evalResult.verdict,
        evaluationCostUsd: evalResult.costUsd,
        evaluatedAt: new Date(),
        status: evalResult.verdict === "promoted" ? "promoted" : evalResult.verdict === "blocked" ? "blocked" : "needs_review",
      });

      // If promoted, retire previous versions and update coverage
      if (evalResult.verdict === "promoted") {
        await promoteMotionLora(input.motionLoraId, lora.characterId);

        // Write coverage matrix from evaluation
        if (evalResult.coverageEntries) {
          await batchUpsertCoverage(evalResult.coverageEntries.map((entry: { sceneType: string; clipCount: number; qualityScore: number; passed: boolean }) => ({
            characterId: lora.characterId,
            motionLoraId: input.motionLoraId,
            sceneType: entry.sceneType,
            clipCount: entry.clipCount,
            qualityScore: entry.qualityScore,
            passed: entry.passed ? 1 : -1,
            evaluatedAt: new Date(),
          })));
        }
      }

      return {
        verdict: evalResult.verdict,
        passCount: evalResult.passCount,
        failCount: evalResult.failCount,
        criticalFailures: evalResult.criticalFailures,
        costUsd: evalResult.costUsd,
      };
    }),

  // ─── Get Evaluation Report ───────────────────────────────────────────

  /** Get the full evaluation gate report for a motion LoRA */
  getEvaluationReport: protectedProcedure
    .input(z.object({ motionLoraId: z.number() }))
    .query(async ({ input }) => {
      const lora = await getMotionLoraById(input.motionLoraId);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });

      return getEvaluationReport(lora);
    }),

  // ─── Update (weight, status) ─────────────────────────────────────────

  /** Update a motion LoRA's base weight or other editable fields */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      baseWeight: z.number().min(0.30).max(0.85).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const lora = await getMotionLoraById(input.id);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });
      if (lora.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your motion LoRA" });
      }

      const updates: Record<string, unknown> = {};
      if (input.baseWeight !== undefined) updates.baseWeight = input.baseWeight;

      if (Object.keys(updates).length > 0) {
        await updateMotionLora(input.id, updates as any);
      }

      return { updated: true };
    }),

  // ─── Retire (soft-delete) ────────────────────────────────────────────

  /** Retire a motion LoRA */
  retire: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const lora = await getMotionLoraById(input.id);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "Motion LoRA not found" });
      if (lora.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your motion LoRA" });
      }

      await retireMotionLora(input.id);
      return { retired: true };
    }),

  // ─── Coverage ────────────────────────────────────────────────────────

  /** Get the motion coverage matrix for a character */
  getCoverage: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ input }) => {
      return getCoverageByCharacter(input.characterId);
    }),
});
