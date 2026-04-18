/**
 * Prompt 25 — Motion LoRA GPU Job Queue
 *
 * Manages training job submission, status polling, and state transitions
 * for motion LoRA training on RunPod (SDXL/Kohya) and Modal (Wan fork).
 *
 * State machine: queued → training → evaluating → promoted/blocked/needs_review
 *
 * In production, this module calls RunPod/Modal serverless endpoints.
 * Currently implements the full interface with simulated GPU providers
 * so the pipeline is testable end-to-end without real GPU infrastructure.
 */

import { updateMotionLora } from "./db-motion-lora";

// ─── Types ─────────────────────────────────────────────────────────────

export interface TrainingJobSubmission {
  motionLoraId: number;
  characterId: number;
  characterName: string;
  userId: number;
  trainingPath: "sdxl_kohya" | "wan_fork";
  trainingClipUrls: string[];
  captionUrls: string[];
  config: Record<string, unknown>;
}

export interface TrainingJobResult {
  jobId: string;
  provider: "runpod" | "modal";
  status: "submitted" | "queued";
  estimatedMinutes: number;
  estimatedCostCredits: number;
  estimatedCostUsd: number;
}

export interface TrainingJobPollResult {
  status: "queued" | "training" | "evaluating" | "promoted" | "blocked" | "needs_review";
  progress: number;           // 0-100
  currentStep?: number;
  totalSteps?: number;
  loss?: number;
  artifactUrl?: string;
  artifactKey?: string;
  estimatedRemainingMs?: number;
  error?: string;
}

// ─── GPU Provider Configuration ────────────────────────────────────────

export const GPU_PROVIDERS = {
  runpod: {
    name: "RunPod Serverless",
    supportedPaths: ["sdxl_kohya"] as const,
    gpuType: "A100-80GB",
    costPerMinuteUsd: 0.027,
    averageTrainingMinutes: { 3500: 35, 4000: 40, 5000: 50 },
    maxConcurrentJobs: 5,
    endpointUrl: process.env.RUNPOD_ENDPOINT_URL || "https://api.runpod.ai/v2/motion-lora-sdxl",
    apiKey: process.env.RUNPOD_API_KEY || "",
  },
  modal: {
    name: "Modal",
    supportedPaths: ["wan_fork"] as const,
    gpuType: "H100-SXM",
    costPerMinuteUsd: 0.058,
    averageTrainingMinutes: { 3500: 20, 4000: 23, 5000: 28 },
    maxConcurrentJobs: 3,
    endpointUrl: process.env.MODAL_ENDPOINT_URL || "https://awakli--motion-lora-wan.modal.run",
    apiKey: process.env.MODAL_API_KEY || "",
  },
} as const;

/** Cost margin for infrastructure overhead */
const COST_MARGIN = 0.30;

/** Credits per USD conversion */
const CREDITS_PER_USD = 1.0 / 0.55; // ~1.82 credits per dollar (based on COGS)

// ─── In-Memory Job Registry (production: replace with Redis/DB) ───────

interface ActiveJob {
  jobId: string;
  motionLoraId: number;
  provider: "runpod" | "modal";
  submittedAt: number;
  trainingSteps: number;
  status: TrainingJobPollResult["status"];
  progress: number;
  externalJobId?: string;
  artifactUrl?: string;
  artifactKey?: string;
}

const activeJobs = new Map<number, ActiveJob>();

// ─── Job Submission ────────────────────────────────────────────────────

/**
 * Submit a motion LoRA training job to the appropriate GPU provider.
 *
 * Routes SDXL/Kohya jobs to RunPod, Wan fork jobs to Modal.
 * Returns immediately with a job ID and cost estimate.
 */
export async function submitMotionLoraTrainingJob(
  submission: TrainingJobSubmission
): Promise<TrainingJobResult> {
  const provider = submission.trainingPath === "sdxl_kohya" ? "runpod" : "modal";
  const providerConfig = GPU_PROVIDERS[provider];
  const trainingSteps = (submission.config.trainingSteps as number) || 3500;

  // Estimate cost
  const stepBucket = trainingSteps <= 3500 ? 3500 : trainingSteps <= 4000 ? 4000 : 5000;
  const estimatedMinutes = providerConfig.averageTrainingMinutes[stepBucket as keyof typeof providerConfig.averageTrainingMinutes];
  const rawCostUsd = estimatedMinutes * providerConfig.costPerMinuteUsd;
  const estimatedCostUsd = rawCostUsd * (1 + COST_MARGIN);
  const estimatedCostCredits = Math.ceil(estimatedCostUsd * CREDITS_PER_USD);

  // Generate job ID
  const jobId = `mlora_${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // In production: call the actual GPU provider API
  // For now, register the job in the in-memory registry
  const job: ActiveJob = {
    jobId,
    motionLoraId: submission.motionLoraId,
    provider,
    submittedAt: Date.now(),
    trainingSteps,
    status: "training",
    progress: 0,
  };

  activeJobs.set(submission.motionLoraId, job);

  // In production, this would be:
  // if (provider === "runpod") {
  //   const response = await fetch(`${providerConfig.endpointUrl}/run`, {
  //     method: "POST",
  //     headers: {
  //       "Authorization": `Bearer ${providerConfig.apiKey}`,
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       input: {
  //         training_clips: submission.trainingClipUrls,
  //         captions: submission.captionUrls,
  //         config: submission.config,
  //         character_name: submission.characterName,
  //         callback_url: `${process.env.VITE_APP_URL}/api/webhooks/motion-lora/${submission.motionLoraId}`,
  //       },
  //     }),
  //   });
  //   const data = await response.json();
  //   job.externalJobId = data.id;
  // } else {
  //   // Modal endpoint
  //   const response = await fetch(providerConfig.endpointUrl, {
  //     method: "POST",
  //     headers: {
  //       "Authorization": `Token ${providerConfig.apiKey}`,
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       training_clips: submission.trainingClipUrls,
  //       captions: submission.captionUrls,
  //       config: submission.config,
  //       character_name: submission.characterName,
  //     }),
  //   });
  //   const data = await response.json();
  //   job.externalJobId = data.call_id;
  // }

  console.log(`[MotionLoRA] Job ${jobId} submitted to ${providerConfig.name} for character ${submission.characterName} (${trainingSteps} steps, est. ${estimatedMinutes}min, $${estimatedCostUsd.toFixed(2)})`);

  // Update DB with cost estimate
  await updateMotionLora(submission.motionLoraId, {
    trainingCostCredits: estimatedCostCredits,
  });

  return {
    jobId,
    provider,
    status: "submitted",
    estimatedMinutes,
    estimatedCostCredits,
    estimatedCostUsd,
  };
}

// ─── Job Status Polling ────────────────────────────────────────────────

/**
 * Poll the training job status from the GPU provider.
 *
 * In production, this calls the provider's status API.
 * Currently simulates progress based on elapsed time.
 */
export async function pollTrainingJobStatus(
  motionLoraId: number
): Promise<TrainingJobPollResult> {
  const job = activeJobs.get(motionLoraId);

  if (!job) {
    // No active job — return from DB state
    return {
      status: "queued",
      progress: 0,
    };
  }

  // In production: poll the actual GPU provider
  // if (job.provider === "runpod" && job.externalJobId) {
  //   const response = await fetch(`${GPU_PROVIDERS.runpod.endpointUrl}/status/${job.externalJobId}`, {
  //     headers: { "Authorization": `Bearer ${GPU_PROVIDERS.runpod.apiKey}` },
  //   });
  //   const data = await response.json();
  //   // Map RunPod status to our status
  //   if (data.status === "COMPLETED") {
  //     job.status = "evaluating";
  //     job.progress = 100;
  //     job.artifactUrl = data.output.artifact_url;
  //     job.artifactKey = data.output.artifact_key;
  //   } else if (data.status === "FAILED") {
  //     return { status: "blocked", progress: 0, error: data.error };
  //   } else {
  //     job.progress = data.progress || estimateProgress(job);
  //   }
  // }

  // Simulate progress based on elapsed time
  const elapsedMs = Date.now() - job.submittedAt;
  const stepBucket = job.trainingSteps <= 3500 ? 3500 : job.trainingSteps <= 4000 ? 4000 : 5000;
  const providerConfig = GPU_PROVIDERS[job.provider];
  const estimatedMs = providerConfig.averageTrainingMinutes[stepBucket as keyof typeof providerConfig.averageTrainingMinutes] * 60 * 1000;

  const rawProgress = Math.min((elapsedMs / estimatedMs) * 100, 100);
  const currentStep = Math.floor((rawProgress / 100) * job.trainingSteps);

  // Simulate loss curve (exponential decay with noise)
  const progressFraction = rawProgress / 100;
  const baseLoss = 0.15 * Math.exp(-3 * progressFraction) + 0.02;
  const noise = (Math.random() - 0.5) * 0.005;
  const loss = Math.max(0.01, baseLoss + noise);

  if (rawProgress >= 100 && job.status === "training") {
    // Training complete — transition to evaluating
    job.status = "evaluating";
    job.progress = 100;
    job.artifactUrl = `https://storage.awakli.com/motion-lora/${motionLoraId}/model.safetensors`;
    job.artifactKey = `motion-lora/${motionLoraId}/model.safetensors`;
  }

  return {
    status: job.status,
    progress: Math.round(rawProgress),
    currentStep,
    totalSteps: job.trainingSteps,
    loss: Math.round(loss * 10000) / 10000,
    artifactUrl: job.artifactUrl,
    artifactKey: job.artifactKey,
    estimatedRemainingMs: rawProgress < 100 ? Math.max(0, estimatedMs - elapsedMs) : 0,
  };
}

// ─── Job Cancellation ──────────────────────────────────────────────────

/**
 * Cancel an in-progress training job.
 */
export async function cancelTrainingJob(motionLoraId: number): Promise<void> {
  const job = activeJobs.get(motionLoraId);

  if (job) {
    // In production: call provider's cancel API
    // if (job.provider === "runpod" && job.externalJobId) {
    //   await fetch(`${GPU_PROVIDERS.runpod.endpointUrl}/cancel/${job.externalJobId}`, {
    //     method: "POST",
    //     headers: { "Authorization": `Bearer ${GPU_PROVIDERS.runpod.apiKey}` },
    //   });
    // }

    activeJobs.delete(motionLoraId);
    console.log(`[MotionLoRA] Job ${job.jobId} cancelled`);
  }
}

// ─── Webhook Handler (for production callback-based updates) ───────────

/**
 * Handle webhook callbacks from GPU providers.
 * Called when a training job completes or fails on the provider side.
 *
 * In production, register this at POST /api/webhooks/motion-lora/:motionLoraId
 */
export async function handleTrainingWebhook(
  motionLoraId: number,
  payload: {
    status: "completed" | "failed";
    artifactUrl?: string;
    artifactKey?: string;
    error?: string;
    metrics?: {
      finalLoss: number;
      totalSteps: number;
      trainingTimeMs: number;
    };
  }
): Promise<void> {
  const job = activeJobs.get(motionLoraId);

  if (payload.status === "completed" && payload.artifactUrl) {
    // Training succeeded — transition to evaluating
    await updateMotionLora(motionLoraId, {
      status: "evaluating",
      artifactUrl: payload.artifactUrl,
      artifactKey: payload.artifactKey ?? null,
      trainingCompletedAt: new Date(),
    });

    if (job) {
      job.status = "evaluating";
      job.progress = 100;
      job.artifactUrl = payload.artifactUrl;
      job.artifactKey = payload.artifactKey;
    }

    console.log(`[MotionLoRA] Training completed for ${motionLoraId}, transitioning to evaluation`);

    // Auto-trigger evaluation (import dynamically to avoid circular deps)
    try {
      const { runEvaluationPipeline } = await import("./motion-lora-gate-runner");
      const { getMotionLoraById } = await import("./db-motion-lora");
      const lora = await getMotionLoraById(motionLoraId);
      if (lora) {
        const evalResult = await runEvaluationPipeline({
          motionLoraId,
          characterId: lora.characterId,
          artifactUrl: payload.artifactUrl,
          trainingPath: lora.trainingPath as "sdxl_kohya" | "wan_fork",
          baseWeight: lora.baseWeight ?? 0.60,
        });

        await updateMotionLora(motionLoraId, {
          evaluationResults: evalResult.gates,
          evaluationVerdict: evalResult.verdict,
          evaluationCostUsd: evalResult.costUsd,
          evaluatedAt: new Date(),
          status: evalResult.verdict === "promoted" ? "promoted"
            : evalResult.verdict === "blocked" ? "blocked"
            : "needs_review",
        });

        if (evalResult.verdict === "promoted") {
          const { promoteMotionLora } = await import("./db-motion-lora");
          await promoteMotionLora(motionLoraId, lora.characterId);
        }

        console.log(`[MotionLoRA] Evaluation complete for ${motionLoraId}: ${evalResult.verdict}`);
      }
    } catch (err) {
      console.error(`[MotionLoRA] Auto-evaluation failed for ${motionLoraId}:`, err);
    }
  } else if (payload.status === "failed") {
    await updateMotionLora(motionLoraId, {
      status: "blocked",
      evaluationVerdict: "blocked",
    });

    if (job) {
      job.status = "blocked";
    }

    console.error(`[MotionLoRA] Training failed for ${motionLoraId}: ${payload.error}`);
  }

  // Clean up the in-memory job after terminal state
  if (["promoted", "blocked", "needs_review"].includes(job?.status ?? "")) {
    activeJobs.delete(motionLoraId);
  }
}

// ─── Utility: Get all active jobs for a user ───────────────────────────

export function getActiveJobsForUser(userId: number): ActiveJob[] {
  return Array.from(activeJobs.values()).filter(j => {
    // In production, filter by userId from DB lookup
    return true; // Simplified — all jobs visible for now
  });
}

// ─── Utility: Estimate cost for a training configuration ───────────────

export function estimateTrainingCost(
  trainingPath: "sdxl_kohya" | "wan_fork",
  trainingSteps: number
): { provider: string; estimatedMinutes: number; estimatedCostUsd: number; estimatedCostCredits: number } {
  const provider = trainingPath === "sdxl_kohya" ? "runpod" : "modal";
  const providerConfig = GPU_PROVIDERS[provider];
  const stepBucket = trainingSteps <= 3500 ? 3500 : trainingSteps <= 4000 ? 4000 : 5000;
  const estimatedMinutes = providerConfig.averageTrainingMinutes[stepBucket as keyof typeof providerConfig.averageTrainingMinutes];
  const rawCostUsd = estimatedMinutes * providerConfig.costPerMinuteUsd;
  const estimatedCostUsd = rawCostUsd * (1 + COST_MARGIN);
  const estimatedCostCredits = Math.ceil(estimatedCostUsd * CREDITS_PER_USD);

  return {
    provider: providerConfig.name,
    estimatedMinutes,
    estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
    estimatedCostCredits,
  };
}
