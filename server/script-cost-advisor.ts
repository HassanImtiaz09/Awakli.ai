/**
 * Script-Level Cost Optimizer — Real-time cost estimation per scene
 *
 * Analyzes script text and provides per-scene cost breakdowns with
 * a heatmap visualization (green=cheap, yellow=moderate, red=expensive).
 * Also offers "Budget Mode" suggestions that rewrite expensive scenes
 * using cheaper scene types while preserving narrative intent.
 *
 * Cost savings: Helps creators make informed decisions during writing,
 * potentially saving 20-40% by choosing cheaper scene types upfront.
 */

import { ALL_PIPELINE_TEMPLATES } from "./scene-type-router/pipeline-templates";
import type { SceneType } from "../drizzle/schema";

// Build cost lookup from pipeline templates
const SCENE_TYPE_COSTS: Record<string, number> = {};
for (const t of ALL_PIPELINE_TEMPLATES) {
  SCENE_TYPE_COSTS[t.sceneType] = parseFloat(t.estimatedCreditsPerTenS) * 10; // per-panel approx
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface SceneAnalysis {
  sceneIndex: number;
  sceneText: string;
  estimatedSceneType: SceneType;
  estimatedCost: number;
  costLevel: "low" | "medium" | "high";
  /** Hex color for heatmap: green, yellow, red */
  heatmapColor: string;
  panelCount: number;
  hasDialogue: boolean;
  hasAction: boolean;
  hasSfx: boolean;
}

export interface ScriptCostBreakdown {
  scenes: SceneAnalysis[];
  totalEstimatedCost: number;
  averageCostPerScene: number;
  costDistribution: {
    low: number;
    medium: number;
    high: number;
  };
  budgetSuggestions: BudgetSuggestion[];
}

export interface BudgetSuggestion {
  sceneIndex: number;
  currentType: SceneType;
  suggestedType: SceneType;
  currentCost: number;
  suggestedCost: number;
  savings: number;
  reason: string;
  rewriteHint: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Cost thresholds for heatmap coloring */
const COST_THRESHOLDS = {
  low: 8,      // <= 8 credits: green
  medium: 15,  // <= 15 credits: yellow
  // > 15 credits: red
};

const HEATMAP_COLORS = {
  low: "#22c55e",     // green-500
  medium: "#eab308",  // yellow-500
  high: "#ef4444",    // red-500
};

/** Scene type detection patterns */
const SCENE_PATTERNS: Record<SceneType, RegExp[]> = {
  action: [
    /fight|battle|attack|slash|punch|kick|explod|chase|dodge|block|clash/i,
    /sword|weapon|combat|strike|charge|blast|destroy/i,
  ],
  dialogue: [
    /said|asked|replied|whispered|shouted|murmured|spoke|told/i,
    /[""].+[""]|conversation|discuss|talk|chat/i,
  ],
  establishing: [
    /panorama|landscape|skyline|overview|establishing|wide shot/i,
    /the city|the town|the village|the school|the building/i,
  ],
  reaction: [
    /shocked|surprised|gasped|stunned|froze|eyes widen|jaw drop/i,
    /close-?up|reaction|expression|face|emotion/i,
  ],
  transition: [
    /meanwhile|later|next day|time skip|fade|transition|cut to/i,
    /hours later|the following|after that|some time/i,
  ],
  montage: [
    /montage|training|preparation|flashback|memories|sequence/i,
    /series of|quick cuts|rapid|compilation/i,
  ],
};

/** Estimated panel count per scene type */
const PANELS_PER_SCENE_TYPE: Record<SceneType, number> = {
  action: 6,
  dialogue: 4,
  establishing: 2,
  reaction: 2,
  transition: 1,
  montage: 5,
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Analyze a script and return per-scene cost breakdown.
 * Splits script into scenes and classifies each one.
 */
export function analyzeScriptCost(scriptText: string): ScriptCostBreakdown {
  const scenes = splitIntoScenes(scriptText);
  const analyzed: SceneAnalysis[] = scenes.map((sceneText, index) => {
    const sceneType = classifyScene(sceneText);
    const panelCount = PANELS_PER_SCENE_TYPE[sceneType];
    const cost = estimateSceneCost(sceneType, panelCount);
    const costLevel = getCostLevel(cost);

    return {
      sceneIndex: index,
      sceneText: sceneText.trim(),
      estimatedSceneType: sceneType,
      estimatedCost: cost,
      costLevel,
      heatmapColor: HEATMAP_COLORS[costLevel],
      panelCount,
      hasDialogue: SCENE_PATTERNS.dialogue.some(p => p.test(sceneText)),
      hasAction: SCENE_PATTERNS.action.some(p => p.test(sceneText)),
      hasSfx: /sfx|sound effect|boom|crash|whoosh|thunder/i.test(sceneText),
    };
  });

  const totalCost = analyzed.reduce((sum, s) => sum + s.estimatedCost, 0);
  const distribution = {
    low: analyzed.filter(s => s.costLevel === "low").length,
    medium: analyzed.filter(s => s.costLevel === "medium").length,
    high: analyzed.filter(s => s.costLevel === "high").length,
  };

  const suggestions = generateBudgetSuggestions(analyzed);

  return {
    scenes: analyzed,
    totalEstimatedCost: Math.round(totalCost * 10) / 10,
    averageCostPerScene: analyzed.length > 0
      ? Math.round((totalCost / analyzed.length) * 10) / 10
      : 0,
    costDistribution: distribution,
    budgetSuggestions: suggestions,
  };
}

/**
 * Generate budget-friendly alternatives for expensive scenes.
 */
export function generateBudgetSuggestions(scenes: SceneAnalysis[]): BudgetSuggestion[] {
  const suggestions: BudgetSuggestion[] = [];

  for (const scene of scenes) {
    if (scene.costLevel !== "high") continue;

    const downgrade = getDowngradeOption(scene);
    if (downgrade) {
      suggestions.push(downgrade);
    }
  }

  return suggestions;
}

/**
 * Estimate the total cost of a full episode from scene analyses.
 */
export function estimateEpisodeCost(scenes: SceneAnalysis[]): {
  totalCredits: number;
  breakdown: { panelGeneration: number; voiceSynthesis: number; videoMotion: number; assembly: number };
} {
  let panelGen = 0;
  let voice = 0;
  let video = 0;

  for (const scene of scenes) {
    panelGen += scene.panelCount * 3; // ~3 credits per panel
    if (scene.hasDialogue) voice += scene.panelCount * 1; // ~1 credit per voiced panel
    video += scene.panelCount * (scene.estimatedSceneType === "action" ? 5 : 2); // video motion
  }

  const assembly = 5; // flat assembly cost

  return {
    totalCredits: panelGen + voice + video + assembly,
    breakdown: {
      panelGeneration: panelGen,
      voiceSynthesis: voice,
      videoMotion: video,
      assembly,
    },
  };
}

// ─── Internal Helpers ───────────────────────────────────────────────────

/**
 * Split script text into scenes.
 * Looks for scene breaks: double newlines, "Scene X:", "INT.", "EXT.", etc.
 */
function splitIntoScenes(text: string): string[] {
  // Try screenplay-style scene headers first
  const screenplayPattern = /(?:^|\n)(?:INT\.|EXT\.|SCENE\s*\d+|---+)/i;
  if (screenplayPattern.test(text)) {
    return text
      .split(screenplayPattern)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  // Fall back to paragraph-based splitting
  const paragraphs = text.split(/\n\s*\n/).map(s => s.trim()).filter(s => s.length > 10);

  // If very few paragraphs, return as-is
  if (paragraphs.length <= 1) {
    return [text.trim()];
  }

  return paragraphs;
}

/**
 * Classify a scene based on text content patterns.
 */
function classifyScene(text: string): SceneType {
  const scores: Record<SceneType, number> = {
    action: 0,
    dialogue: 0,
    establishing: 0,
    reaction: 0,
    transition: 0,
    montage: 0,
  };

  for (const [type, patterns] of Object.entries(SCENE_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, "gi"));
      if (matches) {
        scores[type as SceneType] += matches.length;
      }
    }
  }

  // Find the type with the highest score
  let bestType: SceneType = "dialogue"; // default
  let bestScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type as SceneType;
    }
  }

  return bestType;
}

/**
 * Estimate credit cost for a scene based on type and panel count.
 */
function estimateSceneCost(sceneType: SceneType, panelCount: number): number {
  const costPerPanel = SCENE_TYPE_COSTS[sceneType] ?? 5;
  return Math.round(costPerPanel * panelCount * 10) / 10;
}

/**
 * Get the cost level for a given credit amount.
 */
function getCostLevel(cost: number): "low" | "medium" | "high" {
  if (cost <= COST_THRESHOLDS.low) return "low";
  if (cost <= COST_THRESHOLDS.medium) return "medium";
  return "high";
}

/**
 * Get a downgrade suggestion for an expensive scene.
 */
function getDowngradeOption(scene: SceneAnalysis): BudgetSuggestion | null {
  const downgrades: Partial<Record<SceneType, { target: SceneType; reason: string; hint: string }>> = {
    action: {
      target: "reaction",
      reason: "Action scenes are the most expensive. If the scene focuses on a character's response rather than full combat, a reaction scene is much cheaper.",
      hint: "Focus on the character's emotional reaction to the event rather than animating the full action sequence. Show the aftermath or a key moment instead.",
    },
    montage: {
      target: "transition",
      reason: "Montage sequences require many panels. A transition scene can convey the passage of time more efficiently.",
      hint: "Replace the multi-panel montage with a single transition panel showing key moments as a split-screen or time-lapse.",
    },
  };

  const downgrade = downgrades[scene.estimatedSceneType];
  if (!downgrade) return null;

  const currentCost = scene.estimatedCost;
  const suggestedPanels = PANELS_PER_SCENE_TYPE[downgrade.target];
  const suggestedCost = estimateSceneCost(downgrade.target, suggestedPanels);

  if (suggestedCost >= currentCost * 0.8) return null; // Not worth suggesting if savings < 20%

  return {
    sceneIndex: scene.sceneIndex,
    currentType: scene.estimatedSceneType,
    suggestedType: downgrade.target,
    currentCost,
    suggestedCost,
    savings: Math.round((currentCost - suggestedCost) * 10) / 10,
    reason: downgrade.reason,
    rewriteHint: downgrade.hint,
  };
}

// Export for testing
export {
  splitIntoScenes,
  classifyScene,
  estimateSceneCost,
  getCostLevel,
  SCENE_TYPE_COSTS,
  COST_THRESHOLDS,
  HEATMAP_COLORS,
};
