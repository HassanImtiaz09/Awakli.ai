/**
 * Automatic Scene-Type Optimization — Secondary pass after classification
 *
 * After the scene classifier assigns types, this module performs a second
 * pass to identify scenes that could work with a cheaper scene type.
 * Provides side-by-side cost comparisons and one-click accept/reject.
 *
 * Tracks acceptance rates per suggestion type to improve future
 * classification accuracy.
 */

import type { SceneType } from "../drizzle/schema";

// ─── Types ──────────────────────────────────────────────────────────────

export interface SceneInput {
  sceneId: number;
  sceneType: SceneType;
  description: string;
  panelCount: number;
  motionIntensity?: number; // 0-1
  dialogueDensity?: number; // 0-1
  characterCount?: number;
}

export interface OptimizationSuggestion {
  sceneId: number;
  currentType: SceneType;
  suggestedType: SceneType;
  currentCostEstimate: number;
  suggestedCostEstimate: number;
  savingsEstimate: number;
  savingsPercent: number;
  confidence: number; // 0-1
  reason: string;
  qualityImpact: "none" | "minimal" | "noticeable";
}

export interface OptimizationResult {
  suggestions: OptimizationSuggestion[];
  totalPotentialSavings: number;
  optimizableSceneCount: number;
  totalSceneCount: number;
}

export interface AcceptanceRecord {
  suggestionType: string; // e.g., "action→reaction"
  accepted: number;
  rejected: number;
  acceptanceRate: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Cost per panel by scene type (credits) */
const COST_PER_PANEL: Record<SceneType, number> = {
  action: 8,
  montage: 5,
  dialogue: 3,
  reaction: 2,
  establishing: 2,
  transition: 1,
};

/** Valid downgrade paths: which types can be downgraded to which */
const DOWNGRADE_PATHS: Record<string, {
  target: SceneType;
  conditions: (scene: SceneInput) => boolean;
  confidence: (scene: SceneInput) => number;
  reason: string;
  qualityImpact: "none" | "minimal" | "noticeable";
}[]> = {
  action: [
    {
      target: "reaction",
      conditions: (s) => (s.motionIntensity ?? 0.5) < 0.4 && (s.characterCount ?? 2) <= 2,
      confidence: (s) => 0.7 + (0.3 * (1 - (s.motionIntensity ?? 0.5))),
      reason: "Low-motion action scene with few characters — a reaction shot captures the emotional impact at lower cost.",
      qualityImpact: "minimal",
    },
    {
      target: "dialogue",
      conditions: (s) => (s.dialogueDensity ?? 0) > 0.5 && (s.motionIntensity ?? 0.5) < 0.3,
      confidence: (s) => 0.6 + (0.3 * (s.dialogueDensity ?? 0)),
      reason: "This 'action' scene is mostly dialogue-driven. A dialogue scene type preserves the conversation while reducing animation cost.",
      qualityImpact: "minimal",
    },
  ],
  montage: [
    {
      target: "transition",
      conditions: (s) => s.panelCount <= 3,
      confidence: (s) => 0.8 - (s.panelCount * 0.1),
      reason: "Short montage with few panels — a transition achieves the same time-skip effect more efficiently.",
      qualityImpact: "none",
    },
    {
      target: "establishing",
      conditions: (s) => (s.characterCount ?? 0) === 0 && s.panelCount <= 2,
      confidence: () => 0.75,
      reason: "Character-free montage with minimal panels — an establishing shot conveys the setting at lower cost.",
      qualityImpact: "none",
    },
  ],
  dialogue: [
    {
      target: "reaction",
      conditions: (s) => s.panelCount <= 2 && (s.dialogueDensity ?? 0) < 0.3,
      confidence: () => 0.65,
      reason: "Short dialogue scene with minimal text — a reaction shot may suffice.",
      qualityImpact: "minimal",
    },
  ],
};

/** Minimum savings percentage to suggest a downgrade */
const MIN_SAVINGS_PERCENT = 20;

/** Minimum confidence to suggest a downgrade */
const MIN_CONFIDENCE = 0.5;

// ─── In-memory acceptance tracking ──────────────────────────────────────

const acceptanceTracker: Map<string, { accepted: number; rejected: number }> = new Map();

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Analyze scenes and generate optimization suggestions.
 */
export function optimizeSceneTypes(scenes: SceneInput[]): OptimizationResult {
  const suggestions: OptimizationSuggestion[] = [];

  for (const scene of scenes) {
    const paths = DOWNGRADE_PATHS[scene.sceneType];
    if (!paths) continue;

    for (const path of paths) {
      if (!path.conditions(scene)) continue;

      const confidence = Math.min(1, Math.max(0, path.confidence(scene)));
      if (confidence < MIN_CONFIDENCE) continue;

      const currentCost = COST_PER_PANEL[scene.sceneType] * scene.panelCount;
      const suggestedCost = COST_PER_PANEL[path.target] * scene.panelCount;
      const savings = currentCost - suggestedCost;
      const savingsPercent = currentCost > 0 ? (savings / currentCost) * 100 : 0;

      if (savingsPercent < MIN_SAVINGS_PERCENT) continue;

      suggestions.push({
        sceneId: scene.sceneId,
        currentType: scene.sceneType,
        suggestedType: path.target,
        currentCostEstimate: currentCost,
        suggestedCostEstimate: suggestedCost,
        savingsEstimate: Math.round(savings * 10) / 10,
        savingsPercent: Math.round(savingsPercent),
        confidence: Math.round(confidence * 100) / 100,
        reason: path.reason,
        qualityImpact: path.qualityImpact,
      });

      // Only suggest the best downgrade per scene
      break;
    }
  }

  const totalSavings = suggestions.reduce((sum, s) => sum + s.savingsEstimate, 0);

  return {
    suggestions,
    totalPotentialSavings: Math.round(totalSavings * 10) / 10,
    optimizableSceneCount: suggestions.length,
    totalSceneCount: scenes.length,
  };
}

/**
 * Record whether a suggestion was accepted or rejected.
 */
export function recordSuggestionOutcome(
  currentType: SceneType,
  suggestedType: SceneType,
  accepted: boolean,
): void {
  const key = `${currentType}→${suggestedType}`;
  const record = acceptanceTracker.get(key) ?? { accepted: 0, rejected: 0 };

  if (accepted) {
    record.accepted++;
  } else {
    record.rejected++;
  }

  acceptanceTracker.set(key, record);
}

/**
 * Get acceptance rates for all suggestion types.
 */
export function getAcceptanceRates(): AcceptanceRecord[] {
  const records: AcceptanceRecord[] = [];

  acceptanceTracker.forEach((value, key) => {
    const total = value.accepted + value.rejected;
    records.push({
      suggestionType: key,
      accepted: value.accepted,
      rejected: value.rejected,
      acceptanceRate: total > 0 ? Math.round((value.accepted / total) * 100) : 0,
    });
  });

  return records.sort((a, b) => b.acceptanceRate - a.acceptanceRate);
}

/**
 * Reset acceptance tracking (for testing).
 */
export function resetAcceptanceTracker(): void {
  acceptanceTracker.clear();
}

// Export constants for testing
export { COST_PER_PANEL, DOWNGRADE_PATHS, MIN_SAVINGS_PERCENT, MIN_CONFIDENCE };
