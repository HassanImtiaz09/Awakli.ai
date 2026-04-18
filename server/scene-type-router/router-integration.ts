/**
 * Prompt 20 — Router Integration
 *
 * Scene-type-aware providerHint injection and pipeline stage skipping.
 * Connects the scene-type classifier output to the provider router and
 * pipeline executor, so each scene type gets the optimal pipeline.
 */

import type { SceneType } from "../../drizzle/schema";

// ─── Provider Hint Types ────────────────────────────────────────────────

export interface ProviderHints {
  /** Preferred video generation providers (or null if video stage is replaced) */
  videoHints: string[] | null;
  /** Preferred image generation providers */
  imageHints: string[];
  /** Whether the video stage is replaced by a sub-pipeline */
  videoStageReplaced: boolean;
  /** Name of the replacement sub-pipeline (if any) */
  replacementPipeline: string | null;
}

export interface StageSkipConfig {
  /** Stage numbers to skip entirely */
  skippedStages: number[];
  /** Stage numbers replaced by sub-pipelines (not skipped, but different execution) */
  replacedStages: Record<number, string>;
  /** Human-readable explanation */
  explanation: string;
}

// ─── Hint Mapping ───────────────────────────────────────────────────────

/**
 * Full provider hint mapping per scene type.
 * Based on Section 12.1 of the spec.
 */
const PROVIDER_HINT_MAP: Record<SceneType, ProviderHints> = {
  dialogue: {
    videoHints: null,
    imageHints: ["local_controlnet", "local_ip_adapter"],
    videoStageReplaced: true,
    replacementPipeline: "dialogue_inpaint",
  },
  action: {
    videoHints: ["kling_26", "kling_3_omni", "wan_26"],  // wan_26 via fal.ai for motion-LoRA-capable path
    imageHints: ["local_controlnet", "local_ip_adapter"],
    videoStageReplaced: false,
    replacementPipeline: null,
  },
  establishing: {
    videoHints: null,
    imageHints: ["flux_11_pro", "local_controlnet"],
    videoStageReplaced: true,
    replacementPipeline: "establishing_ken_burns",
  },
  transition: {
    videoHints: null,
    imageHints: [],
    videoStageReplaced: true,
    replacementPipeline: "transition_rule_based",
  },
  reaction: {
    videoHints: ["local_animatediff"],
    imageHints: ["local_ip_adapter"],
    videoStageReplaced: false,
    replacementPipeline: null,
  },
  montage: {
    videoHints: null,
    imageHints: ["flux_schnell", "local_controlnet"],
    videoStageReplaced: true,
    replacementPipeline: "montage_image_seq",
  },
};

/**
 * Get provider hints for a scene type.
 */
export function getProviderHintForSceneType(sceneType: SceneType): ProviderHints {
  return PROVIDER_HINT_MAP[sceneType];
}

// ─── Stage Skipping ─────────────────────────────────────────────────────

/**
 * Pipeline stage numbers (from existing pipeline config):
 * 1 = Panel Extraction
 * 2 = Scene Classification (this prompt)
 * 3 = Character Extraction
 * 4 = Image Generation
 * 5 = Video Generation
 * 6 = Voice Generation
 * 7 = Music/SFX
 * 8 = Post-Processing (RIFE, Real-ESRGAN)
 * 9 = Assembly
 */

const STAGE_SKIP_MAP: Record<SceneType, StageSkipConfig> = {
  dialogue: {
    skippedStages: [],
    replacedStages: { 5: "dialogue_inpaint" },
    explanation: "Video generation (Stage 5) replaced by dialogue inpainting sub-pipeline. All other stages run normally.",
  },
  action: {
    skippedStages: [],
    replacedStages: {},
    explanation: "Full pipeline — no stages skipped. Premium video generation via Kling 2.6/3 Omni.",
  },
  establishing: {
    skippedStages: [5, 6],
    replacedStages: {},
    explanation: "Video Gen (5) and Voice (6) skipped. Ken Burns engine generates motion from static image.",
  },
  transition: {
    skippedStages: [3, 4, 5, 6, 7, 8],
    replacedStages: {},
    explanation: "Stages 3-8 skipped. Only panel extraction, classification, and assembly run. Transitions are compositing-only.",
  },
  reaction: {
    skippedStages: [2, 6, 7, 8],
    replacedStages: {},
    explanation: "Classification (2), Voice (6), Music (7), Post-Processing (8) skipped if cache hit. Video generated only on cache miss.",
  },
  montage: {
    skippedStages: [],
    replacedStages: { 5: "montage_image_seq" },
    explanation: "Video Gen (Stage 5) replaced by image sequence with motion. Other stages run normally.",
  },
};

/**
 * Get stage skip configuration for a scene type.
 */
export function getPipelineStageSkips(sceneType: SceneType): StageSkipConfig {
  return STAGE_SKIP_MAP[sceneType];
}

/**
 * Check if a specific stage should be skipped for a scene type.
 */
export function shouldSkipStage(sceneType: SceneType, stageNumber: number): boolean {
  const config = STAGE_SKIP_MAP[sceneType];
  return config.skippedStages.includes(stageNumber);
}

/**
 * Check if a specific stage is replaced by a sub-pipeline.
 */
export function getStageReplacement(sceneType: SceneType, stageNumber: number): string | null {
  const config = STAGE_SKIP_MAP[sceneType];
  return config.replacedStages[stageNumber] ?? null;
}

// ─── Cost Forecast Enhancement ──────────────────────────────────────────

/**
 * Estimated credits per 10 seconds of output, by scene type.
 * These are the pipeline_template.estimated_credits_per_10s values.
 */
export const CREDITS_PER_10S: Record<SceneType, number> = {
  dialogue: 0.08,       // Inpainting pipeline
  action: 2.60,         // Full Kling 2.6 pipeline
  establishing: 0.05,   // Ken Burns (image gen + motion)
  transition: 0.00,     // Zero AI cost (compositing only)
  reaction: 0.14,       // AnimateDiff (cache miss) or 0 (cache hit)
  montage: 0.30,        // Image sequence + motion
};

export interface SceneTypeDistribution {
  sceneType: SceneType;
  count: number;
  totalDurationS: number;
}

export interface CostForecast {
  /** Per-scene-type breakdown */
  breakdown: CostForecastBreakdown[];
  /** Total estimated credits for the episode */
  totalCredits: number;
  /** Total estimated cost in USD (credits × $0.82) */
  totalCostUsd: number;
  /** What it would cost with V3-Omni for everything */
  v3OmniTotalCredits: number;
  /** Savings percentage vs V3-Omni */
  savingsPercent: number;
  /** Human-readable summary */
  summary: string;
}

export interface CostForecastBreakdown {
  sceneType: SceneType;
  sceneCount: number;
  totalDurationS: number;
  creditsPerScene: number;
  totalCredits: number;
  pipelineTemplate: string;
}

/**
 * Generate a scene-type-aware cost forecast for an episode.
 * Called after Stage 1+2 (panel extraction + classification).
 */
export function generateCostForecast(
  distribution: SceneTypeDistribution[],
  reactionCacheHitRate: number = 0.5,  // Estimated cache hit rate
): CostForecast {
  const breakdown: CostForecastBreakdown[] = [];
  let totalCredits = 0;
  let v3OmniTotal = 0;

  const V3_OMNI_PER_10S = 2.60;

  const templateNames: Record<SceneType, string> = {
    dialogue: "dialogue_inpaint",
    action: "action_premium",
    establishing: "establishing_ken_burns",
    transition: "transition_rule_based",
    reaction: "reaction_cached",
    montage: "montage_image_seq",
  };

  for (const dist of distribution) {
    let creditsPerScene: number;

    if (dist.sceneType === "reaction") {
      // Reaction scenes: cache hit = 0, cache miss = CREDITS_PER_10S
      const avgDurationS = dist.totalDurationS / Math.max(dist.count, 1);
      const missCredits = (avgDurationS / 10) * CREDITS_PER_10S.reaction;
      creditsPerScene = missCredits * (1 - reactionCacheHitRate);
    } else {
      const avgDurationS = dist.totalDurationS / Math.max(dist.count, 1);
      creditsPerScene = (avgDurationS / 10) * CREDITS_PER_10S[dist.sceneType];
    }

    const typeTotal = creditsPerScene * dist.count;
    totalCredits += typeTotal;

    // V3-Omni comparison
    const v3OmniTypeTotal = (dist.totalDurationS / 10) * V3_OMNI_PER_10S;
    v3OmniTotal += v3OmniTypeTotal;

    breakdown.push({
      sceneType: dist.sceneType,
      sceneCount: dist.count,
      totalDurationS: dist.totalDurationS,
      creditsPerScene: Math.round(creditsPerScene * 10000) / 10000,
      totalCredits: Math.round(typeTotal * 10000) / 10000,
      pipelineTemplate: templateNames[dist.sceneType],
    });
  }

  totalCredits = Math.round(totalCredits * 100) / 100;
  v3OmniTotal = Math.round(v3OmniTotal * 100) / 100;
  const savingsPercent = v3OmniTotal > 0
    ? Math.round((1 - totalCredits / v3OmniTotal) * 100)
    : 0;

  // Generate summary string
  const typeCounts = breakdown
    .filter(b => b.sceneCount > 0)
    .map(b => `${b.sceneCount} ${b.sceneType}`)
    .join(", ");

  const totalCostUsd = Math.round(totalCredits * 0.82 * 100) / 100;

  const summary = `${typeCounts}. Total: ${totalCredits} credits ($${totalCostUsd}). ` +
    `Savings: ${savingsPercent}% vs V3-Omni (${v3OmniTotal} credits).`;

  return {
    breakdown,
    totalCredits,
    totalCostUsd,
    v3OmniTotalCredits: v3OmniTotal,
    savingsPercent,
    summary,
  };
}

// ─── Scene-Type-Aware Pipeline Executor Config ──────────────────────────

export interface MotionLoraHint {
  /** Whether this scene type benefits from motion LoRA conditioning */
  motionLoraRequired: boolean;
  /** Recommended motion LoRA weight for this scene type (0.0 if not required) */
  motionLoraWeight: number;
}

/**
 * Motion LoRA requirement mapping per scene type.
 * Based on Prompt 24 Section 5.1 scene-type weight map.
 *
 * Scene types that involve character motion get motion LoRA;
 * static/compositing-only scenes skip it.
 */
const MOTION_LORA_HINT_MAP: Record<SceneType, MotionLoraHint> = {
  dialogue: {
    motionLoraRequired: true,
    motionLoraWeight: 0.55,  // Subtle gestures for dialogue
  },
  action: {
    motionLoraRequired: true,
    motionLoraWeight: 0.75,  // Strong motion for action scenes
  },
  establishing: {
    motionLoraRequired: false,
    motionLoraWeight: 0.0,   // Ken Burns — no character motion
  },
  transition: {
    motionLoraRequired: false,
    motionLoraWeight: 0.0,   // Compositing only — no AI generation
  },
  reaction: {
    motionLoraRequired: true,
    motionLoraWeight: 0.60,  // Moderate for reaction expressions
  },
  montage: {
    motionLoraRequired: true,
    motionLoraWeight: 0.65,  // Moderate-high for montage sequences
  },
};

/**
 * Get motion LoRA hints for a scene type.
 */
export function getMotionLoraHint(sceneType: SceneType): MotionLoraHint {
  return MOTION_LORA_HINT_MAP[sceneType];
}

export interface PipelineExecutionConfig {
  sceneType: SceneType;
  providerHints: ProviderHints;
  stageSkips: StageSkipConfig;
  estimatedCredits: number;
  pipelineTemplate: string;
  /** Motion LoRA hints for this scene type */
  motionLoraHint: MotionLoraHint;
}

/**
 * Get the full pipeline execution config for a classified scene.
 * This is the main entry point for the pipeline executor.
 */
export function getPipelineExecutionConfig(
  sceneType: SceneType,
  durationS: number,
): PipelineExecutionConfig {
  const hints = getProviderHintForSceneType(sceneType);
  const skips = getPipelineStageSkips(sceneType);
  const estimatedCredits = (durationS / 10) * CREDITS_PER_10S[sceneType];

  const templateNames: Record<SceneType, string> = {
    dialogue: "dialogue_inpaint",
    action: "action_premium",
    establishing: "establishing_ken_burns",
    transition: "transition_rule_based",
    reaction: "reaction_cached",
    montage: "montage_image_seq",
  };

  return {
    sceneType,
    providerHints: hints,
    stageSkips: skips,
    estimatedCredits: Math.round(estimatedCredits * 10000) / 10000,
    pipelineTemplate: templateNames[sceneType],
    motionLoraHint: getMotionLoraHint(sceneType),
  };
}

/**
 * Get all scene types and their pipeline configurations (for admin display).
 */
export function getAllPipelineConfigs(): PipelineExecutionConfig[] {
  const sceneTypes: SceneType[] = [
    "dialogue", "action", "establishing", "transition", "reaction", "montage",
  ];

  return sceneTypes.map(st => getPipelineExecutionConfig(st, 10));
}
