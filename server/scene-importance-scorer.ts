/**
 * Scene Importance Scorer — Adaptive Provider Routing by Scene Importance
 *
 * Assigns a 1–10 importance score to each scene/slice based on narrative signals.
 * The score determines which provider tier to use:
 *   - 8–10 (climactic): flagship/premium providers (Kling V3 Omni)
 *   - 5–7 (standard): standard providers (Kling V2.6)
 *   - 1–4 (low): budget providers (AnimateDiff, Kling V1.6)
 *
 * Scoring signals:
 *   - Dialogue density (more lines → more important)
 *   - Character count (ensemble scenes → more important)
 *   - Motion intensity (action beats → more important)
 *   - Narrative position (climax, opening, ending → more important)
 *   - Panel size (full-page spreads → more important)
 *   - Scene type (action > dialogue > reaction > establishing)
 *   - Creator override (explicit "premium" flag)
 *
 * Cost savings: Routes 60–70% of scenes to budget/standard providers,
 * saving 30–50 credits per episode while concentrating quality where it matters.
 */

import type { SceneType } from "../drizzle/schema";
import type { ProviderTier } from "./provider-router/types";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ImportanceInput {
  /** Scene type from classifier */
  sceneType: SceneType;
  /** Number of dialogue lines in the scene */
  dialogueLineCount: number;
  /** Number of characters present */
  characterCount: number;
  /** Motion intensity level */
  motionIntensity: "none" | "low" | "medium" | "high";
  /** Position in episode (0.0 = start, 1.0 = end) */
  narrativePosition: number;
  /** Total number of scenes in episode (for position context) */
  totalScenes: number;
  /** Scene index (0-based) within the episode */
  sceneIndex: number;
  /** Panel size as percentage of page (0–100) */
  panelSizePct: number;
  /** Whether this is a full-page spread */
  isFullPageSpread?: boolean;
  /** Whether this scene has been explicitly marked as important by the creator */
  creatorPremiumFlag?: boolean;
  /** Narrative tags (e.g., "climax", "reveal", "flashback") */
  narrativeTag?: string;
  /** Number of panels in the scene */
  panelCount: number;
}

export interface ImportanceScore {
  /** Overall importance score (1–10) */
  score: number;
  /** Recommended provider tier based on score */
  recommendedTier: ProviderTier;
  /** Individual signal contributions for transparency */
  signals: ImportanceSignal[];
  /** Human-readable explanation */
  explanation: string;
  /** Estimated cost multiplier vs always using premium (0.0–1.0) */
  costMultiplier: number;
}

export interface ImportanceSignal {
  name: string;
  rawValue: number;
  weight: number;
  contribution: number;
  description: string;
}

// ─── Signal Weights ─────────────────────────────────────────────────────

/**
 * Weights for each scoring signal. Sum = 1.0.
 * These can be tuned based on user feedback and A/B testing.
 */
const SIGNAL_WEIGHTS = {
  sceneType: 0.20,
  motionIntensity: 0.15,
  narrativePosition: 0.20,
  dialogueDensity: 0.10,
  characterCount: 0.10,
  panelSize: 0.10,
  narrativeTag: 0.15,
} as const;

// ─── Scene Type Base Scores ─────────────────────────────────────────────

const SCENE_TYPE_BASE_SCORE: Record<SceneType, number> = {
  action: 0.90,
  dialogue: 0.60,
  reaction: 0.40,
  montage: 0.50,
  establishing: 0.30,
  transition: 0.10,
};

// ─── Motion Intensity Scores ────────────────────────────────────────────

const MOTION_INTENSITY_SCORE: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
  none: 0.0,
};

// ─── Narrative Tag Scores ───────────────────────────────────────────────

const NARRATIVE_TAG_SCORE: Record<string, number> = {
  climax: 1.0,
  reveal: 0.9,
  twist: 0.9,
  battle: 0.85,
  transformation: 0.85,
  death: 0.8,
  reunion: 0.75,
  confession: 0.7,
  training_montage: 0.5,
  flashback: 0.4,
  timeskip: 0.3,
  recap: 0.2,
  montage: 0.4,
};

// ─── Tier Mapping ───────────────────────────────────────────────────────

const TIER_THRESHOLDS: Array<{ min: number; tier: ProviderTier; costMultiplier: number }> = [
  { min: 8, tier: "flagship", costMultiplier: 1.0 },
  { min: 5, tier: "standard", costMultiplier: 0.65 },
  { min: 1, tier: "budget", costMultiplier: 0.35 },
];

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Calculate the importance score for a scene/slice.
 * Returns a score from 1–10 with a recommended provider tier.
 */
export function scoreSceneImportance(input: ImportanceInput): ImportanceScore {
  const signals: ImportanceSignal[] = [];

  // 1. Scene type signal
  const sceneTypeRaw = SCENE_TYPE_BASE_SCORE[input.sceneType];
  signals.push({
    name: "sceneType",
    rawValue: sceneTypeRaw,
    weight: SIGNAL_WEIGHTS.sceneType,
    contribution: sceneTypeRaw * SIGNAL_WEIGHTS.sceneType,
    description: `Scene type "${input.sceneType}" base importance`,
  });

  // 2. Motion intensity signal
  const motionRaw = MOTION_INTENSITY_SCORE[input.motionIntensity] ?? 0;
  signals.push({
    name: "motionIntensity",
    rawValue: motionRaw,
    weight: SIGNAL_WEIGHTS.motionIntensity,
    contribution: motionRaw * SIGNAL_WEIGHTS.motionIntensity,
    description: `Motion intensity "${input.motionIntensity}"`,
  });

  // 3. Narrative position signal (U-shaped: high at start and end, lower in middle)
  const positionRaw = calculateNarrativePositionScore(
    input.sceneIndex,
    input.totalScenes,
  );
  signals.push({
    name: "narrativePosition",
    rawValue: positionRaw,
    weight: SIGNAL_WEIGHTS.narrativePosition,
    contribution: positionRaw * SIGNAL_WEIGHTS.narrativePosition,
    description: `Narrative position ${Math.round(input.narrativePosition * 100)}% through episode`,
  });

  // 4. Dialogue density signal (normalized to 0–1, capped at 8 lines)
  const dialogueRaw = Math.min(input.dialogueLineCount / 8, 1.0);
  signals.push({
    name: "dialogueDensity",
    rawValue: dialogueRaw,
    weight: SIGNAL_WEIGHTS.dialogueDensity,
    contribution: dialogueRaw * SIGNAL_WEIGHTS.dialogueDensity,
    description: `${input.dialogueLineCount} dialogue lines`,
  });

  // 5. Character count signal (normalized to 0–1, capped at 5 characters)
  const charRaw = Math.min(input.characterCount / 5, 1.0);
  signals.push({
    name: "characterCount",
    rawValue: charRaw,
    weight: SIGNAL_WEIGHTS.characterCount,
    contribution: charRaw * SIGNAL_WEIGHTS.characterCount,
    description: `${input.characterCount} characters present`,
  });

  // 6. Panel size signal
  const panelRaw = input.isFullPageSpread ? 1.0 : Math.min(input.panelSizePct / 100, 1.0);
  signals.push({
    name: "panelSize",
    rawValue: panelRaw,
    weight: SIGNAL_WEIGHTS.panelSize,
    contribution: panelRaw * SIGNAL_WEIGHTS.panelSize,
    description: input.isFullPageSpread ? "Full-page spread" : `Panel size ${input.panelSizePct}%`,
  });

  // 7. Narrative tag signal
  const tagRaw = input.narrativeTag
    ? (NARRATIVE_TAG_SCORE[input.narrativeTag.toLowerCase()] ?? 0.3)
    : 0.0;
  signals.push({
    name: "narrativeTag",
    rawValue: tagRaw,
    weight: SIGNAL_WEIGHTS.narrativeTag,
    contribution: tagRaw * SIGNAL_WEIGHTS.narrativeTag,
    description: input.narrativeTag ? `Narrative tag "${input.narrativeTag}"` : "No narrative tag",
  });

  // Calculate weighted sum (0.0–1.0)
  const weightedSum = signals.reduce((sum, s) => sum + s.contribution, 0);

  // Scale to 1–10
  let score = Math.round(weightedSum * 10);
  score = Math.max(1, Math.min(10, score));

  // Creator premium override: force score to 8+
  if (input.creatorPremiumFlag) {
    score = Math.max(8, score);
  }

  // Determine tier
  const tierEntry = TIER_THRESHOLDS.find(t => score >= t.min) ?? TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];

  // Build explanation
  const topSignals = [...signals]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  const explanation = input.creatorPremiumFlag
    ? `Creator marked as premium. Score boosted to ${score}/10 → ${tierEntry.tier} tier.`
    : `Score ${score}/10 → ${tierEntry.tier} tier. Top factors: ${topSignals.map(s => s.name).join(", ")}.`;

  return {
    score,
    recommendedTier: tierEntry.tier,
    signals,
    explanation,
    costMultiplier: tierEntry.costMultiplier,
  };
}

/**
 * Batch score all scenes in an episode.
 * Returns scores with episode-level statistics.
 */
export function scoreEpisodeScenes(
  scenes: ImportanceInput[],
): {
  scores: ImportanceScore[];
  averageScore: number;
  tierDistribution: Record<ProviderTier, number>;
  estimatedSavingsPercent: number;
} {
  const scores = scenes.map(s => scoreSceneImportance(s));

  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((sum, s) => sum + s.score, 0) / scores.length) * 10) / 10
    : 0;

  const tierDistribution: Record<ProviderTier, number> = {
    flagship: 0,
    premium: 0,
    standard: 0,
    budget: 0,
  };
  for (const s of scores) {
    tierDistribution[s.recommendedTier]++;
  }

  // Estimated savings: weighted average of cost multipliers vs all-flagship
  const avgCostMultiplier = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.costMultiplier, 0) / scores.length
    : 1.0;
  const estimatedSavingsPercent = Math.round((1 - avgCostMultiplier) * 100);

  return {
    scores,
    averageScore,
    tierDistribution,
    estimatedSavingsPercent,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────

/**
 * U-shaped narrative position score.
 * Opening (first 15%) and climax (last 20%) get high scores.
 * The "rising action" middle gets moderate scores.
 * The "falling action" just before climax gets slightly elevated scores.
 */
function calculateNarrativePositionScore(
  sceneIndex: number,
  totalScenes: number,
): number {
  if (totalScenes <= 1) return 0.7; // Single scene = moderately important

  const position = sceneIndex / (totalScenes - 1); // 0.0 to 1.0

  // Opening hook (first 15%)
  if (position <= 0.15) {
    return 0.8 + (0.15 - position) / 0.15 * 0.2; // 0.8–1.0
  }

  // Climax zone (last 20%)
  if (position >= 0.80) {
    return 0.7 + (position - 0.80) / 0.20 * 0.3; // 0.7–1.0
  }

  // Rising action before climax (60–80%)
  if (position >= 0.60) {
    return 0.4 + (position - 0.60) / 0.20 * 0.3; // 0.4–0.7
  }

  // Middle (15–60%) — lowest importance
  return 0.2 + (position - 0.15) / 0.45 * 0.2; // 0.2–0.4
}

/**
 * Get the recommended tier for a given importance score.
 */
export function getTierForScore(score: number): ProviderTier {
  const entry = TIER_THRESHOLDS.find(t => score >= t.min);
  return entry?.tier ?? "budget";
}

/**
 * Get the cost multiplier for a given importance score.
 */
export function getCostMultiplierForScore(score: number): number {
  const entry = TIER_THRESHOLDS.find(t => score >= t.min);
  return entry?.costMultiplier ?? 0.35;
}
