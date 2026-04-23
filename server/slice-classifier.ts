/**
 * Slice Complexity Classifier — Intra-Kling Routing for 10-Second Slices
 *
 * Classifies each video slice by visual complexity and assigns the optimal
 * Kling model tier. This is the cost-optimization layer that routes simple
 * scenes to cheaper models while preserving quality for complex ones.
 *
 * Routing strategy (intra-Kling only — no cross-provider mixing):
 *   Tier 1: Kling V3 Omni  — dialogue with visible face, lip sync required
 *   Tier 2: Kling V2.6     — multi-character action, complex motion
 *   Tier 3: Kling V2.1     — single character static, establishing shots
 *   Tier 4: Kling V1.6     — transitions, title cards, simple stills
 *
 * Mode routing (within each tier):
 *   Professional: lip sync scenes, Sakuga-quality action, hero shots
 *   Standard: everything else (33% cheaper per second)
 */

import { MODEL_MAP } from "./scene-classifier";
import type { SliceDefinition } from "./slice-decomposer";

// ─── Types ────────────────────────────────────────────────────────────────

export interface SliceClassification {
  tier: 1 | 2 | 3 | 4;
  model: string;
  modelName: string;
  mode: "professional" | "standard";
  reasoning: string;
  lipSyncRequired: boolean;
  estimatedCostUsd: number;
  estimatedCredits: number;  // Internal credit units (1 credit ≈ $0.01)
  deterministic: boolean;
}

export interface RoutingSummary {
  totalSlices: number;
  tierDistribution: Record<number, number>;  // tier → count
  modeDistribution: { professional: number; standard: number };
  totalEstimatedCostUsd: number;
  totalEstimatedCredits: number;
  costIfAllV3OmniPro: number;
  savingsUsd: number;
  savingsPercent: number;
}

// ─── Constants ────────────────────────────────────────────────────────────

// Credit conversion: 1 credit = $0.01 (100 credits = $1.00)
const USD_TO_CREDITS = 100;

// Camera angles that indicate close framing (face visible)
const CLOSE_ANGLES = ["close-up", "extreme-close-up", "closeup", "ecu"];
const MEDIUM_ANGLES = ["medium", "medium-shot", "mid-shot"];
const WIDE_ANGLES = ["wide", "birds-eye", "panoramic", "establishing", "panning", "tracking"];

// Action keywords in descriptions
const ACTION_KEYWORDS = [
  "fight", "battle", "explosion", "chase", "run", "attack", "dodge",
  "clash", "punch", "kick", "slash", "transform", "flying", "crash",
  "impact", "combat", "duel", "sword", "blast", "shockwave",
];

// Transition/simple keywords
const TRANSITION_KEYWORDS = [
  "fade", "title card", "black screen", "text overlay", "transition",
  "end card", "credits", "logo", "still image", "static",
];

// ─── Classification Logic ────────────────────────────────────────────────

/**
 * Classify a single slice's complexity and assign the optimal Kling model.
 * Uses deterministic rules only — no LLM call needed (classification is
 * already informed by the slice's extracted metadata).
 */
export function classifySliceComplexity(slice: SliceDefinition): SliceClassification {
  const angle = (slice.cameraAngle || "medium").toLowerCase();
  const action = (slice.actionDescription || "").toLowerCase();
  const hasDialogue = slice.lipSyncRequired;
  const characterCount = slice.characters.length;
  const dialogueLineCount = slice.dialogue.length;

  const isCloseUp = CLOSE_ANGLES.some(a => angle.includes(a));
  const isMedium = MEDIUM_ANGLES.some(a => angle.includes(a));
  const isWide = WIDE_ANGLES.some(a => angle.includes(a));
  const isAction = ACTION_KEYWORDS.some(k => action.includes(k));
  const isTransition = TRANSITION_KEYWORDS.some(k => action.includes(k));

  let tier: 1 | 2 | 3 | 4;
  let mode: "professional" | "standard";
  let reasoning: string;
  let lipSyncRequired = false;

  // ─── Tier Assignment Rules (priority order) ─────────────────────────

  // Rule 1: Transition/title card → Tier 4 Standard
  if (isTransition && !hasDialogue) {
    tier = 4;
    mode = "standard";
    reasoning = "Transition/title card scene — minimal motion, no dialogue";
  }
  // Rule 2: Dialogue + close-up/medium → Tier 1 (lip sync critical)
  else if (hasDialogue && (isCloseUp || isMedium)) {
    tier = 1;
    mode = "professional";
    lipSyncRequired = true;
    reasoning = `Dialogue with ${isCloseUp ? "close-up" : "medium"} framing — lip sync critical (${dialogueLineCount} lines)`;
  }
  // Rule 3: Dialogue + wide shot → Tier 2 Professional (face too small for lip sync)
  else if (hasDialogue && isWide) {
    tier = 2;
    mode = "professional";
    reasoning = `Dialogue in wide shot — face too small for lip sync, but high quality needed (${dialogueLineCount} lines)`;
  }
  // Rule 4: Dialogue + unknown angle → Tier 1 Professional (safe default)
  else if (hasDialogue) {
    tier = 1;
    mode = "professional";
    lipSyncRequired = true;
    reasoning = `Dialogue present with ${characterCount} character(s) — defaulting to Tier 1 for lip sync safety`;
  }
  // Rule 5: Multi-character action → Tier 2 Professional
  else if (isAction && characterCount >= 2) {
    tier = 2;
    mode = "professional";
    reasoning = `Multi-character action scene (${characterCount} characters) — complex motion requires high quality`;
  }
  // Rule 6: Single-character action → Tier 2 Standard
  else if (isAction && characterCount === 1) {
    tier = 2;
    mode = "standard";
    reasoning = "Single-character action — dynamic but less complex";
  }
  // Rule 7: Action with no characters → Tier 2 Standard
  else if (isAction) {
    tier = 2;
    mode = "standard";
    reasoning = "Action/effects scene without character focus";
  }
  // Rule 8: Establishing/wide shot, no dialogue, no action → Tier 3 Standard
  else if (isWide || angle.includes("establishing")) {
    tier = 3;
    mode = "standard";
    reasoning = "Establishing/environment shot — minimal character interaction";
  }
  // Rule 9: Single character, static, no dialogue → Tier 3 Standard
  else if (characterCount <= 1 && !isAction && !hasDialogue) {
    tier = 3;
    mode = "standard";
    reasoning = "Single character or empty scene, no dialogue — medium complexity";
  }
  // Rule 10: Default → Tier 2 Standard (safe middle ground)
  else {
    tier = 2;
    mode = "standard";
    reasoning = `Default classification: ${characterCount} character(s), ${angle} angle`;
  }

  // Calculate cost
  const m = MODEL_MAP[tier] || MODEL_MAP[2];
  const costPerSec = mode === "professional" ? m.costPerSecPro : m.costPerSecStd;
  const estimatedCostUsd = costPerSec * slice.durationSeconds;
  const estimatedCredits = Math.ceil(estimatedCostUsd * USD_TO_CREDITS);

  return {
    tier,
    model: m.model,
    modelName: m.modelName,
    mode,
    reasoning,
    lipSyncRequired,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1000) / 1000,
    estimatedCredits,
    deterministic: true,
  };
}

/**
 * Apply a user's tier override to a classification.
 * Recalculates cost based on the new tier.
 */
export function applyTierOverride(
  slice: SliceDefinition,
  originalClassification: SliceClassification,
  overrideTier: 1 | 2 | 3 | 4,
): SliceClassification {
  const m = MODEL_MAP[overrideTier] || MODEL_MAP[2];

  // If user downgrades a lip-sync scene, warn but allow
  const lipSyncRequired = originalClassification.lipSyncRequired && overrideTier === 1;

  // Determine mode: keep professional if lip sync is needed, otherwise match original
  const mode = lipSyncRequired ? "professional" : originalClassification.mode;
  const costPerSec = mode === "professional" ? m.costPerSecPro : m.costPerSecStd;
  const estimatedCostUsd = costPerSec * slice.durationSeconds;

  return {
    tier: overrideTier,
    model: m.model,
    modelName: m.modelName,
    mode,
    reasoning: `User override: Tier ${originalClassification.tier} → Tier ${overrideTier}${
      originalClassification.lipSyncRequired && overrideTier > 1
        ? " (WARNING: lip sync may be degraded)"
        : ""
    }`,
    lipSyncRequired,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1000) / 1000,
    estimatedCredits: Math.ceil(estimatedCostUsd * USD_TO_CREDITS),
    deterministic: true,
  };
}

// ─── Batch Classification & Summary ──────────────────────────────────────

/**
 * Classify all slices in an episode and compute routing summary.
 */
export function classifyAllSlices(slices: SliceDefinition[]): {
  classifications: SliceClassification[];
  summary: RoutingSummary;
} {
  const classifications = slices.map(classifySliceComplexity);

  // Compute summary
  const tierDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const modeDistribution = { professional: 0, standard: 0 };
  let totalCost = 0;
  let totalCredits = 0;
  let costIfAllV3OmniPro = 0;

  for (let i = 0; i < classifications.length; i++) {
    const c = classifications[i];
    const s = slices[i];

    tierDistribution[c.tier]++;
    modeDistribution[c.mode]++;
    totalCost += c.estimatedCostUsd;
    totalCredits += c.estimatedCredits;

    // What it would cost if everything was V3 Omni Professional
    costIfAllV3OmniPro += MODEL_MAP[1].costPerSecPro * s.durationSeconds;
  }

  const savingsUsd = costIfAllV3OmniPro - totalCost;

  return {
    classifications,
    summary: {
      totalSlices: slices.length,
      tierDistribution,
      modeDistribution,
      totalEstimatedCostUsd: Math.round(totalCost * 1000) / 1000,
      totalEstimatedCredits: totalCredits,
      costIfAllV3OmniPro: Math.round(costIfAllV3OmniPro * 1000) / 1000,
      savingsUsd: Math.round(savingsUsd * 1000) / 1000,
      savingsPercent: costIfAllV3OmniPro > 0
        ? Math.round((savingsUsd / costIfAllV3OmniPro) * 1000) / 10
        : 0,
    },
  };
}

/**
 * Compute the routing savings for a single tier override.
 * Returns the delta in cost and credits.
 */
export function computeRoutingSavings(
  slice: SliceDefinition,
  originalTier: number,
  newTier: number,
): { costDeltaUsd: number; creditDelta: number; direction: "cheaper" | "same" | "more_expensive" } {
  const originalModel = MODEL_MAP[originalTier] || MODEL_MAP[2];
  const newModel = MODEL_MAP[newTier] || MODEL_MAP[2];

  const originalCost = originalModel.costPerSecPro * slice.durationSeconds;
  const newCost = newModel.costPerSecPro * slice.durationSeconds;
  const delta = newCost - originalCost;

  return {
    costDeltaUsd: Math.round(delta * 1000) / 1000,
    creditDelta: Math.ceil(delta * USD_TO_CREDITS),
    direction: delta < -0.001 ? "cheaper" : delta > 0.001 ? "more_expensive" : "same",
  };
}
