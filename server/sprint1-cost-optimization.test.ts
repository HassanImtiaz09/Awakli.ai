/**
 * Sprint 1 Tests — Keyframe + RIFE Strategy & Scene Importance Scorer
 */
import { describe, it, expect } from "vitest";
import {
  getStrategyForSceneType,
  getEffectiveStrategy,
  usesRifeInterpolation,
  skipsVideoGeneration,
  estimateStrategyCost,
  calculateEpisodeSavings,
  getAllStrategies,
  getKeyframeRifeProviderHint,
} from "./rife-upsampling-strategy";
import {
  scoreSceneImportance,
  scoreEpisodeScenes,
  getTierForScore,
  getCostMultiplierForScore,
} from "./scene-importance-scorer";
import type { ImportanceInput } from "./scene-importance-scorer";

// ─── RIFE Upsampling Strategy Tests ─────────────────────────────────────

describe("RIFE Upsampling Strategy", () => {
  describe("getStrategyForSceneType", () => {
    it("returns full_rate for action scenes", () => {
      const strategy = getStrategyForSceneType("action");
      expect(strategy.strategy).toBe("full_rate");
      expect(strategy.generationFps).toBe(24);
      expect(strategy.rifeEnabled).toBe(false);
      expect(strategy.costMultiplier).toBe(1.0);
    });

    it("returns keyframe_rife for dialogue scenes", () => {
      const strategy = getStrategyForSceneType("dialogue");
      expect(strategy.strategy).toBe("keyframe_rife");
      expect(strategy.generationFps).toBe(8);
      expect(strategy.outputFps).toBe(24);
      expect(strategy.rifeMultiplier).toBe(3);
      expect(strategy.rifeEnabled).toBe(true);
      expect(strategy.costMultiplier).toBeLessThan(0.1);
    });

    it("returns skip for establishing scenes", () => {
      const strategy = getStrategyForSceneType("establishing");
      expect(strategy.strategy).toBe("skip");
      expect(strategy.generationFps).toBe(0);
      expect(strategy.rifeEnabled).toBe(false);
    });

    it("returns skip for transition scenes", () => {
      const strategy = getStrategyForSceneType("transition");
      expect(strategy.strategy).toBe("skip");
      expect(strategy.costMultiplier).toBe(0.0);
    });

    it("returns keyframe_rife for reaction scenes", () => {
      const strategy = getStrategyForSceneType("reaction");
      expect(strategy.strategy).toBe("keyframe_rife");
      expect(strategy.preferredProvider).toBe("local_animatediff");
    });

    it("returns keyframe_rife for montage scenes", () => {
      const strategy = getStrategyForSceneType("montage");
      expect(strategy.strategy).toBe("keyframe_rife");
      expect(strategy.costMultiplier).toBeLessThan(0.5);
    });
  });

  describe("getEffectiveStrategy", () => {
    it("returns default strategy when premiumMotion is false", () => {
      const strategy = getEffectiveStrategy("dialogue", false);
      expect(strategy.strategy).toBe("keyframe_rife");
    });

    it("overrides to full_rate when premiumMotion is true", () => {
      const strategy = getEffectiveStrategy("dialogue", true);
      expect(strategy.strategy).toBe("full_rate");
      expect(strategy.generationFps).toBe(24);
      expect(strategy.costMultiplier).toBe(1.0);
      expect(strategy.explanation).toContain("Premium Motion override");
    });

    it("keeps action at full_rate regardless of premiumMotion", () => {
      const strategyDefault = getEffectiveStrategy("action", false);
      const strategyPremium = getEffectiveStrategy("action", true);
      expect(strategyDefault.strategy).toBe("full_rate");
      expect(strategyPremium.strategy).toBe("full_rate");
    });
  });

  describe("usesRifeInterpolation", () => {
    it("returns true for dialogue, reaction, montage", () => {
      expect(usesRifeInterpolation("dialogue")).toBe(true);
      expect(usesRifeInterpolation("reaction")).toBe(true);
      expect(usesRifeInterpolation("montage")).toBe(true);
    });

    it("returns false for action, establishing, transition", () => {
      expect(usesRifeInterpolation("action")).toBe(false);
      expect(usesRifeInterpolation("establishing")).toBe(false);
      expect(usesRifeInterpolation("transition")).toBe(false);
    });
  });

  describe("skipsVideoGeneration", () => {
    it("returns true for establishing and transition", () => {
      expect(skipsVideoGeneration("establishing")).toBe(true);
      expect(skipsVideoGeneration("transition")).toBe(true);
    });

    it("returns false for action, dialogue, reaction, montage", () => {
      expect(skipsVideoGeneration("action")).toBe(false);
      expect(skipsVideoGeneration("dialogue")).toBe(false);
      expect(skipsVideoGeneration("reaction")).toBe(false);
      expect(skipsVideoGeneration("montage")).toBe(false);
    });
  });

  describe("estimateStrategyCost", () => {
    it("returns full cost for action scenes", () => {
      const cost = estimateStrategyCost("action", 10);
      expect(cost).toBe(10);
    });

    it("returns reduced cost for dialogue scenes", () => {
      const cost = estimateStrategyCost("dialogue", 10);
      expect(cost).toBeLessThan(1);
    });

    it("returns zero cost for transition scenes", () => {
      const cost = estimateStrategyCost("transition", 10);
      expect(cost).toBe(0);
    });

    it("uses full_rate cost when premiumMotion is true", () => {
      const normalCost = estimateStrategyCost("dialogue", 10, false);
      const premiumCost = estimateStrategyCost("dialogue", 10, true);
      expect(premiumCost).toBeGreaterThan(normalCost);
      expect(premiumCost).toBe(10);
    });
  });

  describe("calculateEpisodeSavings", () => {
    it("calculates savings for a typical episode distribution", () => {
      const result = calculateEpisodeSavings([
        { sceneType: "dialogue", count: 8, avgDurationS: 10 },
        { sceneType: "action", count: 3, avgDurationS: 10 },
        { sceneType: "establishing", count: 3, avgDurationS: 10 },
        { sceneType: "reaction", count: 4, avgDurationS: 10 },
        { sceneType: "transition", count: 2, avgDurationS: 5 },
      ]);

      expect(result.creditsSaved).toBeGreaterThan(0);
      expect(result.savingsPercent).toBeGreaterThan(30);
      expect(result.totalWithStrategy).toBeLessThan(result.totalWithoutStrategy);
      expect(result.breakdown).toHaveLength(5);
    });

    it("shows no savings when all scenes are action", () => {
      const result = calculateEpisodeSavings([
        { sceneType: "action", count: 10, avgDurationS: 10 },
      ]);

      expect(result.creditsSaved).toBe(0);
      expect(result.savingsPercent).toBe(0);
    });

    it("accounts for premium motion overrides", () => {
      const withoutOverrides = calculateEpisodeSavings([
        { sceneType: "dialogue", count: 10, avgDurationS: 10 },
      ]);
      const withOverrides = calculateEpisodeSavings([
        { sceneType: "dialogue", count: 10, avgDurationS: 10, premiumMotionOverrides: 5 },
      ]);

      expect(withOverrides.totalWithStrategy).toBeGreaterThan(withoutOverrides.totalWithStrategy);
    });
  });

  describe("getAllStrategies", () => {
    it("returns 6 strategies (one per scene type)", () => {
      const strategies = getAllStrategies();
      expect(strategies).toHaveLength(6);
      const sceneTypes = strategies.map(s => s.sceneType);
      expect(sceneTypes).toContain("dialogue");
      expect(sceneTypes).toContain("action");
      expect(sceneTypes).toContain("establishing");
      expect(sceneTypes).toContain("transition");
      expect(sceneTypes).toContain("reaction");
      expect(sceneTypes).toContain("montage");
    });
  });

  describe("getKeyframeRifeProviderHint", () => {
    it("returns provider hints for keyframe_rife scenes", () => {
      const hints = getKeyframeRifeProviderHint("reaction");
      expect(hints).not.toBeNull();
      expect(hints).toContain("local_animatediff");
    });

    it("returns null for non-keyframe_rife scenes", () => {
      expect(getKeyframeRifeProviderHint("action")).toBeNull();
      expect(getKeyframeRifeProviderHint("establishing")).toBeNull();
      expect(getKeyframeRifeProviderHint("transition")).toBeNull();
    });
  });
});

// ─── Scene Importance Scorer Tests ──────────────────────────────────────

describe("Scene Importance Scorer", () => {
  const makeInput = (overrides: Partial<ImportanceInput> = {}): ImportanceInput => ({
    sceneType: "dialogue",
    dialogueLineCount: 3,
    characterCount: 2,
    motionIntensity: "low",
    narrativePosition: 0.5,
    totalScenes: 20,
    sceneIndex: 10,
    panelSizePct: 50,
    panelCount: 3,
    ...overrides,
  });

  describe("scoreSceneImportance", () => {
    it("returns a score between 1 and 10", () => {
      const result = scoreSceneImportance(makeInput());
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it("returns a valid tier", () => {
      const result = scoreSceneImportance(makeInput());
      expect(["flagship", "premium", "standard", "budget"]).toContain(result.recommendedTier);
    });

    it("returns signal breakdown", () => {
      const result = scoreSceneImportance(makeInput());
      expect(result.signals.length).toBeGreaterThan(0);
      for (const signal of result.signals) {
        expect(signal.name).toBeTruthy();
        expect(signal.weight).toBeGreaterThanOrEqual(0);
        expect(signal.weight).toBeLessThanOrEqual(1);
      }
    });

    it("scores action scenes higher than establishing scenes", () => {
      const actionScore = scoreSceneImportance(makeInput({
        sceneType: "action",
        motionIntensity: "high",
      }));
      const establishingScore = scoreSceneImportance(makeInput({
        sceneType: "establishing",
        motionIntensity: "none",
        dialogueLineCount: 0,
        characterCount: 0,
      }));
      expect(actionScore.score).toBeGreaterThan(establishingScore.score);
    });

    it("scores climax scenes higher than middle scenes", () => {
      const climaxScore = scoreSceneImportance(makeInput({
        sceneType: "action",
        motionIntensity: "high",
        sceneIndex: 19,
        totalScenes: 20,
        narrativePosition: 0.95,
        narrativeTag: "climax",
      }));
      const middleScore = scoreSceneImportance(makeInput({
        sceneType: "dialogue",
        motionIntensity: "low",
        sceneIndex: 10,
        totalScenes: 20,
        narrativePosition: 0.5,
      }));
      expect(climaxScore.score).toBeGreaterThan(middleScore.score);
    });

    it("boosts score to 8+ when creatorPremiumFlag is set", () => {
      const normalResult = scoreSceneImportance(makeInput({
        sceneType: "establishing",
        motionIntensity: "none",
        dialogueLineCount: 0,
        characterCount: 0,
      }));
      const premiumResult = scoreSceneImportance(makeInput({
        sceneType: "establishing",
        motionIntensity: "none",
        dialogueLineCount: 0,
        characterCount: 0,
        creatorPremiumFlag: true,
      }));
      expect(premiumResult.score).toBeGreaterThanOrEqual(8);
      expect(premiumResult.recommendedTier).toBe("flagship");
      expect(normalResult.score).toBeLessThan(premiumResult.score);
    });

    it("gives higher scores to scenes with narrative tags like climax", () => {
      const withTag = scoreSceneImportance(makeInput({ narrativeTag: "climax" }));
      const withoutTag = scoreSceneImportance(makeInput());
      expect(withTag.score).toBeGreaterThanOrEqual(withoutTag.score);
    });

    it("gives higher scores to full-page spreads", () => {
      const spread = scoreSceneImportance(makeInput({ isFullPageSpread: true }));
      const normal = scoreSceneImportance(makeInput({ panelSizePct: 25 }));
      expect(spread.score).toBeGreaterThanOrEqual(normal.score);
    });
  });

  describe("scoreEpisodeScenes", () => {
    it("returns scores for all scenes", () => {
      const scenes = [
        makeInput({ sceneIndex: 0, sceneType: "establishing" }),
        makeInput({ sceneIndex: 1, sceneType: "dialogue" }),
        makeInput({ sceneIndex: 2, sceneType: "action", motionIntensity: "high" }),
        makeInput({ sceneIndex: 3, sceneType: "dialogue" }),
        makeInput({ sceneIndex: 4, sceneType: "reaction" }),
      ];

      const result = scoreEpisodeScenes(scenes);
      expect(result.scores).toHaveLength(5);
      expect(result.averageScore).toBeGreaterThan(0);
    });

    it("provides tier distribution", () => {
      const scenes = Array.from({ length: 20 }, (_, i) => makeInput({
        sceneIndex: i,
        totalScenes: 20,
        narrativePosition: i / 19,
        sceneType: i % 3 === 0 ? "action" : i % 3 === 1 ? "dialogue" : "reaction",
        motionIntensity: i % 3 === 0 ? "high" : "low",
      }));

      const result = scoreEpisodeScenes(scenes);
      const totalInTiers = Object.values(result.tierDistribution).reduce((a, b) => a + b, 0);
      expect(totalInTiers).toBe(20);
    });

    it("estimates positive savings percent", () => {
      const scenes = Array.from({ length: 10 }, (_, i) => makeInput({
        sceneIndex: i,
        totalScenes: 10,
        narrativePosition: i / 9,
      }));

      const result = scoreEpisodeScenes(scenes);
      expect(result.estimatedSavingsPercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getTierForScore", () => {
    it("returns flagship for scores 8-10", () => {
      expect(getTierForScore(8)).toBe("flagship");
      expect(getTierForScore(9)).toBe("flagship");
      expect(getTierForScore(10)).toBe("flagship");
    });

    it("returns standard for scores 5-7", () => {
      expect(getTierForScore(5)).toBe("standard");
      expect(getTierForScore(6)).toBe("standard");
      expect(getTierForScore(7)).toBe("standard");
    });

    it("returns budget for scores 1-4", () => {
      expect(getTierForScore(1)).toBe("budget");
      expect(getTierForScore(2)).toBe("budget");
      expect(getTierForScore(3)).toBe("budget");
      expect(getTierForScore(4)).toBe("budget");
    });
  });

  describe("getCostMultiplierForScore", () => {
    it("returns 1.0 for flagship tier", () => {
      expect(getCostMultiplierForScore(8)).toBe(1.0);
    });

    it("returns 0.65 for standard tier", () => {
      expect(getCostMultiplierForScore(5)).toBe(0.65);
    });

    it("returns 0.35 for budget tier", () => {
      expect(getCostMultiplierForScore(1)).toBe(0.35);
    });
  });
});
