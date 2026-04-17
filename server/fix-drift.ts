/**
 * Fix Drift Module
 *
 * Provides logic for targeted re-generation of flagged frames
 * with boosted LoRA strength to correct appearance drift.
 */

import type { FrameDriftResult, FeatureDrift } from "./consistency-analysis";

// ─── Types ──────────────────────────────────────────────────────────────

export interface BoostParams {
  originalStrength: number;
  boostedStrength: number;
  boostDelta: number;
  /** Which features are being targeted for correction */
  targetFeatures: string[];
  /** Recommended negative prompt additions */
  negativePromptAdditions: string[];
  /** Confidence that the fix will resolve the drift */
  fixConfidence: "high" | "medium" | "low";
}

export interface FixDriftJobSpec {
  generationId: number;
  episodeId: number;
  sceneId: number | null;
  frameIndex: number;
  originalResultUrl: string;
  driftScore: number;
  severity: "warning" | "critical";
  boostParams: BoostParams;
  /** Estimated credits for this single re-generation */
  estimatedCredits: number;
  /** Estimated time in seconds */
  estimatedSeconds: number;
}

export interface FixDriftBatchEstimate {
  totalFrames: number;
  criticalFrames: number;
  warningFrames: number;
  totalEstimatedCredits: number;
  totalEstimatedSeconds: number;
  avgBoostDelta: number;
  jobs: FixDriftJobSpec[];
}

export interface FixDriftJobStatus {
  generationId: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;           // 0-100
  newResultUrl: string | null;
  newDriftScore: number | null;
  driftImprovement: number | null;  // positive = improvement
  errorMessage: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Base credits per frame re-generation (10s clip) */
export const BASE_REGEN_CREDITS = 8;

/** Additional credits per 0.1 boost delta */
export const BOOST_CREDIT_MULTIPLIER = 2;

/** Base generation time in seconds */
export const BASE_REGEN_SECONDS = 45;

/** Maximum LoRA strength (clamped) */
export const MAX_LORA_STRENGTH = 0.95;

/** Minimum LoRA strength for fix attempts */
export const MIN_LORA_STRENGTH = 0.5;

/** Default LoRA strength when no original strength is available */
export const DEFAULT_ORIGINAL_STRENGTH = 0.75;

/** Feature drift thresholds for targeting */
export const FEATURE_TARGET_THRESHOLD = 0.18;

/** Feature-to-negative-prompt mapping */
const FEATURE_NEGATIVE_PROMPTS: Record<keyof FeatureDrift, string> = {
  face: "deformed face, wrong facial features, different face shape",
  hair: "wrong hair color, different hairstyle, messy hair",
  outfit: "wrong clothing, different outfit, costume change",
  colorPalette: "wrong colors, color shift, desaturated",
  bodyProportion: "wrong proportions, deformed body, elongated limbs",
};

// ─── Core Functions ─────────────────────────────────────────────────────

/**
 * Compute optimal LoRA strength boost based on drift severity.
 *
 * Higher drift → larger boost. The boost is proportional to drift score
 * but clamped to prevent over-saturation artifacts.
 */
export function computeBoostParams(frame: FrameDriftResult): BoostParams {
  const originalStrength = frame.loraStrength ?? DEFAULT_ORIGINAL_STRENGTH;

  // Boost delta scales with drift severity:
  // - drift 0.15 → +0.06
  // - drift 0.25 → +0.10
  // - drift 0.40+ → +0.15 (capped)
  const rawBoost = Math.min(0.15, frame.driftScore * 0.4);
  const boostDelta = Math.round(rawBoost * 100) / 100;

  const boostedStrength = Math.min(
    MAX_LORA_STRENGTH,
    Math.max(MIN_LORA_STRENGTH, originalStrength + boostDelta)
  );

  // Identify which features need targeting
  const targetFeatures: string[] = [];
  const negativePromptAdditions: string[] = [];

  const featureEntries = Object.entries(frame.featureDrifts) as Array<[keyof FeatureDrift, number]>;
  for (const [feature, drift] of featureEntries) {
    if (drift >= FEATURE_TARGET_THRESHOLD) {
      targetFeatures.push(feature);
      negativePromptAdditions.push(FEATURE_NEGATIVE_PROMPTS[feature]);
    }
  }

  // Confidence based on drift severity and LoRA availability
  let fixConfidence: BoostParams["fixConfidence"];
  if (frame.loraVersion === null) {
    fixConfidence = "low"; // No LoRA = low confidence in fix
  } else if (frame.driftScore < 0.20) {
    fixConfidence = "high"; // Minor drift = high confidence
  } else if (frame.driftScore < 0.35) {
    fixConfidence = "medium";
  } else {
    fixConfidence = "low"; // Severe drift may need retraining, not just boost
  }

  return {
    originalStrength: Math.round(originalStrength * 100) / 100,
    boostedStrength: Math.round(boostedStrength * 100) / 100,
    boostDelta: Math.round((boostedStrength - originalStrength) * 100) / 100,
    targetFeatures,
    negativePromptAdditions,
    fixConfidence,
  };
}

/**
 * Build a fix-drift job specification for a single flagged frame.
 */
export function buildFixDriftJob(frame: FrameDriftResult): FixDriftJobSpec {
  const boostParams = computeBoostParams(frame);

  // Cost scales with boost delta
  const boostCreditAddon = Math.ceil(boostParams.boostDelta / 0.1) * BOOST_CREDIT_MULTIPLIER;
  const estimatedCredits = BASE_REGEN_CREDITS + boostCreditAddon;

  // Time slightly increases with higher strength (more denoising steps)
  const timeMultiplier = 1 + boostParams.boostDelta * 0.5;
  const estimatedSeconds = Math.round(BASE_REGEN_SECONDS * timeMultiplier);

  return {
    generationId: frame.generationId,
    episodeId: frame.episodeId,
    sceneId: frame.sceneId,
    frameIndex: frame.frameIndex,
    originalResultUrl: frame.resultUrl,
    driftScore: frame.driftScore,
    severity: frame.severity === "critical" ? "critical" : "warning",
    boostParams,
    estimatedCredits,
    estimatedSeconds,
  };
}

/**
 * Estimate cost and build job specs for a batch of flagged frames.
 */
export function estimateFixDriftBatch(
  frames: FrameDriftResult[],
): FixDriftBatchEstimate {
  // Only process flagged frames (warning or critical)
  const flagged = frames.filter(f => f.severity === "warning" || f.severity === "critical");

  const jobs = flagged.map(f => buildFixDriftJob(f));

  const criticalFrames = flagged.filter(f => f.severity === "critical").length;
  const warningFrames = flagged.filter(f => f.severity === "warning").length;

  const totalEstimatedCredits = jobs.reduce((s, j) => s + j.estimatedCredits, 0);
  const totalEstimatedSeconds = jobs.reduce((s, j) => s + j.estimatedSeconds, 0);
  const avgBoostDelta = jobs.length > 0
    ? Math.round(jobs.reduce((s, j) => s + j.boostParams.boostDelta, 0) / jobs.length * 100) / 100
    : 0;

  return {
    totalFrames: jobs.length,
    criticalFrames,
    warningFrames,
    totalEstimatedCredits,
    totalEstimatedSeconds,
    avgBoostDelta,
    jobs,
  };
}

/**
 * Simulate fix-drift job status for a given generation.
 * In production, this would query the actual job queue.
 */
export function simulateFixDriftStatus(
  generationId: number,
  originalDriftScore: number,
): FixDriftJobStatus {
  // Simulate a completed fix with improved drift
  const improvement = originalDriftScore * (0.3 + Math.random() * 0.4); // 30-70% improvement
  const newDriftScore = Math.round((originalDriftScore - improvement) * 10000) / 10000;

  return {
    generationId,
    status: "completed",
    progress: 100,
    newResultUrl: null, // Would be set by actual generation
    newDriftScore,
    driftImprovement: Math.round(improvement * 10000) / 10000,
    errorMessage: null,
    startedAt: Date.now() - 60000,
    completedAt: Date.now(),
  };
}

/**
 * Format seconds into human-readable duration.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}
