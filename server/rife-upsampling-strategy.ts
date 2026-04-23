/**
 * RIFE Upsampling Strategy — Keyframe-Only Video Generation with RIFE Interpolation
 *
 * Determines when to use 8fps keyframe generation + RIFE interpolation to 24fps
 * instead of full-rate premium video generation. This matches traditional anime's
 * "limited animation" aesthetic while dramatically reducing generation costs.
 *
 * Strategy mapping:
 *   - action scenes → full_rate (premium video providers, fluid motion required)
 *   - dialogue scenes → keyframe_rife (already uses inpainting at 8fps + RIFE)
 *   - establishing scenes → skip (Ken Burns, no video gen)
 *   - transition scenes → skip (rule-based compositing, no video gen)
 *   - reaction scenes → keyframe_rife (AnimateDiff at 8fps + RIFE)
 *   - montage scenes → keyframe_rife (image sequence with per-image motion)
 *
 * Cost savings: ~100 credits per 20-panel episode for non-action scenes.
 */

import type { SceneType } from "../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────

export type GenerationStrategy = "full_rate" | "keyframe_rife" | "skip";

export interface StrategyConfig {
  /** The generation strategy for this scene type */
  strategy: GenerationStrategy;
  /** Target generation FPS (before RIFE interpolation) */
  generationFps: number;
  /** Final output FPS (after RIFE interpolation) */
  outputFps: number;
  /** RIFE interpolation multiplier (e.g., 3x for 8→24fps) */
  rifeMultiplier: number;
  /** Whether RIFE interpolation is applied */
  rifeEnabled: boolean;
  /** Preferred video provider for this strategy */
  preferredProvider: string | null;
  /** Credit cost multiplier vs full-rate (1.0 = same, 0.3 = 70% cheaper) */
  costMultiplier: number;
  /** Human-readable explanation */
  explanation: string;
}

export interface StrategyOverride {
  /** Scene or slice ID this override applies to */
  targetId: number;
  /** Override type: scene-level or slice-level */
  targetType: "scene" | "slice";
  /** The overridden strategy */
  strategy: GenerationStrategy;
  /** Who set the override */
  source: "creator" | "system";
  /** Reason for the override */
  reason: string;
}

// ─── Strategy Mapping ───────────────────────────────────────────────────

/**
 * Default strategy per scene type.
 * Non-action scenes use keyframe_rife for significant cost savings.
 */
const STRATEGY_MAP: Record<SceneType, StrategyConfig> = {
  dialogue: {
    strategy: "keyframe_rife",
    generationFps: 8,
    outputFps: 24,
    rifeMultiplier: 3,
    rifeEnabled: true,
    preferredProvider: "local_controlnet",
    costMultiplier: 0.03,  // 97% cheaper (inpainting pipeline)
    explanation: "Dialogue uses inpainting pipeline at 8fps with RIFE interpolation to 24fps. Mouth movements are generated per-viseme, not per-frame.",
  },
  action: {
    strategy: "full_rate",
    generationFps: 24,
    outputFps: 24,
    rifeMultiplier: 1,
    rifeEnabled: false,
    preferredProvider: "kling_26",
    costMultiplier: 1.0,  // Full cost
    explanation: "Action scenes require premium video generation at full frame rate for fluid motion and dynamic camera work.",
  },
  establishing: {
    strategy: "skip",
    generationFps: 0,
    outputFps: 24,
    rifeMultiplier: 0,
    rifeEnabled: false,
    preferredProvider: null,
    costMultiplier: 0.02,  // Ken Burns is nearly free
    explanation: "Establishing shots use Ken Burns engine (pan/zoom on static image). No video generation needed.",
  },
  transition: {
    strategy: "skip",
    generationFps: 0,
    outputFps: 24,
    rifeMultiplier: 0,
    rifeEnabled: false,
    preferredProvider: null,
    costMultiplier: 0.0,  // Zero AI cost
    explanation: "Transitions use rule-based compositing (ffmpeg/canvas). No AI generation needed.",
  },
  reaction: {
    strategy: "keyframe_rife",
    generationFps: 8,
    outputFps: 24,
    rifeMultiplier: 3,
    rifeEnabled: true,
    preferredProvider: "local_animatediff",
    costMultiplier: 0.25,  // 75% cheaper
    explanation: "Reaction shots use AnimateDiff at 8fps with RIFE interpolation. Limited motion (facial expressions, subtle gestures) works well at lower generation rates.",
  },
  montage: {
    strategy: "keyframe_rife",
    generationFps: 8,
    outputFps: 24,
    rifeMultiplier: 3,
    rifeEnabled: true,
    preferredProvider: "local_animatediff",
    costMultiplier: 0.15,  // 85% cheaper (image sequence + per-image motion)
    explanation: "Montage sequences use image sequence with per-image motion at 8fps, interpolated to 24fps via RIFE.",
  },
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Get the default generation strategy for a scene type.
 */
export function getStrategyForSceneType(sceneType: SceneType): StrategyConfig {
  return STRATEGY_MAP[sceneType];
}

/**
 * Get the effective strategy for a slice, considering any creator overrides.
 * If premiumMotion is true, forces full_rate regardless of scene type.
 */
export function getEffectiveStrategy(
  sceneType: SceneType,
  premiumMotion: boolean = false,
): StrategyConfig {
  if (premiumMotion) {
    return {
      ...STRATEGY_MAP.action,
      explanation: `Premium Motion override: using full-rate generation instead of ${STRATEGY_MAP[sceneType].strategy}.`,
    };
  }
  return STRATEGY_MAP[sceneType];
}

/**
 * Check if a scene type benefits from RIFE interpolation.
 */
export function usesRifeInterpolation(sceneType: SceneType): boolean {
  return STRATEGY_MAP[sceneType].rifeEnabled;
}

/**
 * Check if a scene type skips video generation entirely.
 */
export function skipsVideoGeneration(sceneType: SceneType): boolean {
  return STRATEGY_MAP[sceneType].strategy === "skip";
}

/**
 * Estimate the credit cost for a slice based on its strategy.
 * Returns the adjusted credit cost considering the strategy's cost multiplier.
 */
export function estimateStrategyCost(
  sceneType: SceneType,
  baseCreditCost: number,
  premiumMotion: boolean = false,
): number {
  const strategy = getEffectiveStrategy(sceneType, premiumMotion);
  return Math.round(baseCreditCost * strategy.costMultiplier * 100) / 100;
}

/**
 * Calculate the total savings for an episode based on scene type distribution.
 * Returns the credits saved vs using full-rate for everything.
 */
export function calculateEpisodeSavings(
  sceneDistribution: Array<{
    sceneType: SceneType;
    count: number;
    avgDurationS: number;
    premiumMotionOverrides?: number;
  }>,
  fullRateCreditsPer10s: number = 3.54,  // Action premium rate
): {
  totalWithStrategy: number;
  totalWithoutStrategy: number;
  creditsSaved: number;
  savingsPercent: number;
  breakdown: Array<{
    sceneType: SceneType;
    count: number;
    strategy: GenerationStrategy;
    creditsUsed: number;
    creditsWithoutStrategy: number;
  }>;
} {
  const breakdown: Array<{
    sceneType: SceneType;
    count: number;
    strategy: GenerationStrategy;
    creditsUsed: number;
    creditsWithoutStrategy: number;
  }> = [];

  let totalWithStrategy = 0;
  let totalWithoutStrategy = 0;

  for (const dist of sceneDistribution) {
    const strategy = STRATEGY_MAP[dist.sceneType];
    const fullRateScenes = dist.premiumMotionOverrides ?? 0;
    const strategyScenes = dist.count - fullRateScenes;

    // Credits with strategy
    const strategyCost = strategyScenes * (dist.avgDurationS / 10) * fullRateCreditsPer10s * strategy.costMultiplier;
    const fullRateCost = fullRateScenes * (dist.avgDurationS / 10) * fullRateCreditsPer10s;
    const totalCost = strategyCost + fullRateCost;

    // Credits without strategy (everything at full rate)
    const withoutStrategy = dist.count * (dist.avgDurationS / 10) * fullRateCreditsPer10s;

    totalWithStrategy += totalCost;
    totalWithoutStrategy += withoutStrategy;

    breakdown.push({
      sceneType: dist.sceneType,
      count: dist.count,
      strategy: strategy.strategy,
      creditsUsed: Math.round(totalCost * 100) / 100,
      creditsWithoutStrategy: Math.round(withoutStrategy * 100) / 100,
    });
  }

  totalWithStrategy = Math.round(totalWithStrategy * 100) / 100;
  totalWithoutStrategy = Math.round(totalWithoutStrategy * 100) / 100;
  const creditsSaved = Math.round((totalWithoutStrategy - totalWithStrategy) * 100) / 100;
  const savingsPercent = totalWithoutStrategy > 0
    ? Math.round((creditsSaved / totalWithoutStrategy) * 100)
    : 0;

  return {
    totalWithStrategy,
    totalWithoutStrategy,
    creditsSaved,
    savingsPercent,
    breakdown,
  };
}

/**
 * Get all strategy configs for display purposes.
 */
export function getAllStrategies(): Array<{
  sceneType: SceneType;
  config: StrategyConfig;
}> {
  return (Object.entries(STRATEGY_MAP) as Array<[SceneType, StrategyConfig]>).map(
    ([sceneType, config]) => ({ sceneType, config })
  );
}

/**
 * Get the provider hint override for keyframe_rife strategy.
 * Used by the router integration to redirect non-action video generation
 * to local_animatediff instead of premium providers.
 */
export function getKeyframeRifeProviderHint(sceneType: SceneType): string[] | null {
  const strategy = STRATEGY_MAP[sceneType];
  if (strategy.strategy !== "keyframe_rife" || !strategy.preferredProvider) {
    return null;
  }
  return [strategy.preferredProvider, "local_animatediff"];
}
