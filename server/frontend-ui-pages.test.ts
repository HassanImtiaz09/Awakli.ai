/**
 * Frontend UI Pages & Components — Integration Tests
 * Tests for LoRA Marketplace, Location Library, Script Cost Advisor,
 * Generation Dashboard, and Budget Mode Toggle backend endpoints.
 */
import { describe, it, expect, beforeEach } from "vitest";

// ─── LoRA Marketplace Service ────────────────────────────────────────────
import {
  browseLoras,
  publishLora,
  calculateRevenueShare,
  calculateTrainingSavings,
} from "./lora-marketplace";

describe("LoRA Marketplace Service", () => {
  describe("browseLoras", () => {
    it("returns paginated results with correct structure", async () => {
      const result = await browseLoras({});
      expect(result).toHaveProperty("items");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe("number");
    });

    it("filters by category", async () => {
      const result = await browseLoras({ category: "character" });
      expect(result).toHaveProperty("items");
    });

    it("supports sort options", async () => {
      const newest = await browseLoras({ sort: "newest" });
      const popular = await browseLoras({ sort: "popular" });
      expect(newest).toHaveProperty("items");
      expect(popular).toHaveProperty("items");
    });

    it("respects pagination limit and offset", async () => {
      const result = await browseLoras({ limit: 5, offset: 0 });
      expect(result.items.length).toBeLessThanOrEqual(5);
    });
  });

  describe("calculateRevenueShare", () => {
    it("returns 70/30 split for creator/platform", () => {
      const result = calculateRevenueShare(1000);
      expect(result.creatorEarnings).toBe(700);
      expect(result.platformFee).toBe(300);
    });

    it("handles zero revenue", () => {
      const result = calculateRevenueShare(0);
      expect(result.creatorEarnings).toBe(0);
      expect(result.platformFee).toBe(0);
    });
  });

  describe("calculateTrainingSavings", () => {
    it("shows savings when using a base LoRA", () => {
      const result = calculateTrainingSavings(1);
      expect(result.fullCost).toBeGreaterThan(0);
      expect(result.withBaseCost).toBeLessThan(result.fullCost);
      expect(result.savings).toBeGreaterThan(0);
    });

    it("shows full cost without base LoRA", () => {
      const result = calculateTrainingSavings();
      expect(result.fullCost).toBeGreaterThan(0);
    });
  });
});

// ─── Background Library Service ──────────────────────────────────────────
import {
  listBackgrounds,
  findMatchingBackground,
  extractLocationTags,
} from "./background-library";

describe("Background Library Service", () => {
  describe("extractLocationTags", () => {
    it("extracts location-related tags from description", () => {
      const tags = extractLocationTags("A dark forest with tall trees and a moonlit sky");
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
    });

    it("returns empty array for empty input", () => {
      const tags = extractLocationTags("");
      expect(tags).toEqual([]);
    });

    it("extracts multiple location keywords", () => {
      const tags = extractLocationTags("A city street with buildings and a park nearby, mountains in the background");
      expect(tags.length).toBeGreaterThan(1);
    });
  });

  describe("findMatchingBackground", () => {
    it("returns null when no backgrounds exist", async () => {
      const result = await findMatchingBackground({ projectId: 99999, locationName: "nonexistent location", tags: ["tag1"] });
      expect(result).toBeNull();
    });
  });

  describe("listBackgrounds", () => {
    it("returns array of backgrounds for a project", async () => {
      const result = await listBackgrounds(99999, 10, 0);
      expect(result).toHaveProperty("items");
      expect(Array.isArray(result.items)).toBe(true);
    });
  });
});

// ─── Script Cost Advisor Service ─────────────────────────────────────────
import { analyzeScriptCost, generateBudgetSuggestions, estimateEpisodeCost } from "./script-cost-advisor";

describe("Script Cost Advisor Service", () => {
  describe("analyzeScriptCost", () => {
    it("returns per-scene breakdown for a multi-scene script", () => {
      const script = `
SCENE 1: EXT. CITY STREET - DAY
The hero walks through a bustling city street.
DIALOGUE: "I need to find the artifact."

SCENE 2: INT. DARK CAVE - NIGHT
An intense battle erupts between the hero and the villain.
ACTION: Swords clash, explosions, fast camera movements.

SCENE 3: EXT. MOUNTAIN TOP - SUNSET
A quiet moment of reflection after the battle.
DIALOGUE: "It's finally over."
      `.trim();

      const result = analyzeScriptCost(script);
      expect(result).toHaveProperty("scenes");
      expect(result).toHaveProperty("totalEstimatedCost");
      expect(Array.isArray(result.scenes)).toBe(true);
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(typeof result.totalEstimatedCost).toBe("number");
      expect(result.totalEstimatedCost).toBeGreaterThan(0);
    });

    it("returns minimal analysis for empty script", () => {
      const result = analyzeScriptCost("");
      // Empty string may still produce a single scene entry
      expect(result.scenes.length).toBeLessThanOrEqual(1);
      expect(typeof result.totalEstimatedCost).toBe("number");
    });

    it("includes cost distribution in breakdown", () => {
      const script = "SCENE 1: A character walks through a forest\nSCENE 2: An action battle sequence";
      const result = analyzeScriptCost(script);
      expect(result).toHaveProperty("costDistribution");
    });
  });

  describe("generateBudgetSuggestions", () => {
    it("returns suggestions array", () => {
      const scenes = [
        { sceneType: "action" as any, panelCount: 5, estimatedCredits: 30, dialogueLines: 2, hasAction: true, description: "Battle" },
      ];
      const suggestions = generateBudgetSuggestions(scenes);
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });
});

// ─── Scene Type Optimizer Service ────────────────────────────────────────
import {
  optimizeSceneTypes,
  recordSuggestionOutcome,
  getAcceptanceRates,
  resetAcceptanceTracker,
} from "./scene-type-optimizer";

describe("Scene Type Optimizer Service", () => {
  beforeEach(() => {
    resetAcceptanceTracker();
  });

  describe("optimizeSceneTypes", () => {
    it("returns optimization result for expensive scenes", () => {
      const scenes = [
        { sceneType: "action" as const, panelCount: 5, hasDialogue: true, motionIntensity: 0.4 },
        { sceneType: "montage" as const, panelCount: 3, hasDialogue: false, motionIntensity: 0.3 },
      ];
      const result = optimizeSceneTypes(scenes);
      expect(result).toHaveProperty("suggestions");
      expect(Array.isArray(result.suggestions)).toBe(true);
    });

    it("handles already-cheap scene types", () => {
      const scenes = [
        { sceneType: "dialogue" as const, panelCount: 2, hasDialogue: true, motionIntensity: 0.1 },
      ];
      const result = optimizeSceneTypes(scenes);
      expect(result).toHaveProperty("suggestions");
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe("recordSuggestionOutcome", () => {
    it("records accepted suggestions", () => {
      recordSuggestionOutcome("action", "dialogue", true);
      const rates = getAcceptanceRates();
      expect(Array.isArray(rates)).toBe(true);
      expect(rates.length).toBeGreaterThan(0);
    });

    it("records rejected suggestions", () => {
      recordSuggestionOutcome("montage", "reaction", false);
      const rates = getAcceptanceRates();
      expect(Array.isArray(rates)).toBe(true);
    });
  });
});

// ─── Parallel Slice Scheduler Service ────────────────────────────────────
import {
  buildDependencyGraph,
  getReadySlices,
  markSliceStarted,
  markSliceComplete,
  markSliceFailed,
  cancelEpisode,
  getSchedulerStatus,
  getGraphForVisualization,
  cleanupGraph,
  getActiveEpisodes,
} from "./parallel-slice-scheduler";

describe("Parallel Slice Scheduler Service", () => {
  const testEpisodeId = 99990;

  beforeEach(() => {
    cleanupGraph(testEpisodeId);
  });

  describe("buildDependencyGraph", () => {
    it("builds a graph from slice definitions", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
        { sliceId: 2, sceneIndex: 0, importance: 5, characterIds: [1] },
        { sliceId: 3, sceneIndex: 1, importance: 7, characterIds: [] as number[] },
      ];
      const graph = buildDependencyGraph(testEpisodeId, slices);
      expect(graph).toHaveProperty("nodes");
      expect(graph.nodes instanceof Map).toBe(true);
      expect(graph.nodes.size).toBe(3);
    });

    it("handles empty slice list", () => {
      const graph = buildDependencyGraph(testEpisodeId, [] as any[]);
      expect(graph.nodes.size).toBe(0);
    });
  });

  describe("scheduler lifecycle", () => {
    it("starts and returns initial status", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
        { sliceId: 2, sceneIndex: 1, importance: 5, characterIds: [] as number[] },
      ];
      buildDependencyGraph(testEpisodeId, slices);

      const status = getSchedulerStatus(testEpisodeId);
      expect(status).toBeDefined();
      expect(status!.totalSlices).toBe(2);
      expect(status!.complete).toBe(0);
    });

    it("returns ready slices sorted by importance", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 3, characterIds: [] as number[] },
        { sliceId: 2, sceneIndex: 1, importance: 9, characterIds: [] as number[] },
      ];
      buildDependencyGraph(testEpisodeId, slices);

      const ready = getReadySlices(testEpisodeId);
      expect(ready.length).toBe(2);
      // Higher importance first
      expect(ready[0]).toBe(2);
    });

    it("tracks slice completion", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
      ];
      buildDependencyGraph(testEpisodeId, slices);

      markSliceStarted(testEpisodeId, 1);
      markSliceComplete(testEpisodeId, 1);

      const status = getSchedulerStatus(testEpisodeId);
      expect(status!.complete).toBe(1);
    });

    it("handles slice failure", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
      ];
      buildDependencyGraph(testEpisodeId, slices);

      markSliceStarted(testEpisodeId, 1);
      markSliceFailed(testEpisodeId, 1, "GPU timeout");

      const status = getSchedulerStatus(testEpisodeId);
      expect(status!.failed).toBe(1);
    });

    it("cancels a running scheduler", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
      ];
      buildDependencyGraph(testEpisodeId, slices);
      const cancelled = cancelEpisode(testEpisodeId);
      expect(cancelled).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getGraphForVisualization", () => {
    it("returns visualization data with nodes and edges", () => {
      const slices = [
        { sliceId: 1, sceneIndex: 0, importance: 8, characterIds: [] as number[] },
        { sliceId: 2, sceneIndex: 0, importance: 5, characterIds: [1] },
      ];
      buildDependencyGraph(testEpisodeId, slices);

      const viz = getGraphForVisualization(testEpisodeId);
      expect(viz).toBeDefined();
      if (viz) {
        expect(viz).toHaveProperty("nodes");
        expect(viz).toHaveProperty("edges");
      }
    });
  });

  describe("getActiveEpisodes", () => {
    it("returns list of active episode ids", () => {
      const result = getActiveEpisodes();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});

// ─── RIFE Upsampling Strategy ────────────────────────────────────────────
import {
  getStrategyForSceneType,
  getAllStrategies,
  usesRifeInterpolation,
  skipsVideoGeneration,
  estimateStrategyCost,
  type GenerationStrategy,
} from "./rife-upsampling-strategy";

describe("RIFE Upsampling Strategy", () => {
  it("returns full_rate for action scenes", () => {
    const strategy = getStrategyForSceneType("action");
    expect(strategy.strategy).toBe("full_rate");
  });

  it("returns keyframe_rife for dialogue scenes", () => {
    const strategy = getStrategyForSceneType("dialogue");
    expect(strategy.strategy).toBe("keyframe_rife");
  });

    it("returns skip for establishing scenes (Ken Burns)", () => {
    const strategy = getStrategyForSceneType("establishing");
    expect(strategy.strategy).toBe("skip");
  });

  it("returns keyframe_rife for reaction scenes", () => {
    const strategy = getStrategyForSceneType("reaction");
    expect(strategy.strategy).toBe("keyframe_rife");
  });

    it("returns skip for transition scenes", () => {
    const strategy = getStrategyForSceneType("transition");
    expect(strategy.strategy).toBe("skip");
  });

  it("has cost multiplier less than 1 for RIFE strategies", () => {
    const strategy = getStrategyForSceneType("dialogue");
    if (strategy.strategy === "keyframe_rife") {
      expect(strategy.costMultiplier).toBeLessThan(1);
    }
  });

  it("usesRifeInterpolation returns true for dialogue", () => {
    expect(usesRifeInterpolation("dialogue")).toBe(true);
  });

  it("usesRifeInterpolation returns false for action", () => {
    expect(usesRifeInterpolation("action")).toBe(false);
  });

  it("getAllStrategies returns array of strategies", () => {
    const strategies = getAllStrategies();
    expect(Array.isArray(strategies)).toBe(true);
    expect(strategies.length).toBeGreaterThan(0);
  });
});

// ─── Scene Importance Scorer ─────────────────────────────────────────────
import {
  scoreSceneImportance,
  scoreEpisodeScenes,
  getTierForScore,
  type ImportanceInput,
} from "./scene-importance-scorer";

describe("Scene Importance Scorer", () => {
  describe("scoreSceneImportance", () => {
    it("returns a score between 1 and 10", () => {
      const result = scoreSceneImportance({
        sceneType: "action",
        motionIntensity: "high",
        narrativePosition: 0.9,
        dialogueLineCount: 2,
        characterCount: 3,
        panelSizePct: 80,
        narrativeTag: "climax",
        totalScenes: 10,
        sceneIndex: 8,
        panelCount: 5,
      });
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it("scores climax scenes higher than filler", () => {
      const climax = scoreSceneImportance({
        sceneType: "action",
        motionIntensity: "high",
        narrativePosition: 0.85,
        dialogueLineCount: 1,
        characterCount: 4,
        panelSizePct: 90,
        narrativeTag: "climax",
        totalScenes: 10,
        sceneIndex: 8,
        panelCount: 5,
      });
      const filler = scoreSceneImportance({
        sceneType: "transition",
        motionIntensity: "none",
        narrativePosition: 0.5,
        dialogueLineCount: 0,
        characterCount: 0,
        panelSizePct: 20,
        narrativeTag: "filler",
        totalScenes: 10,
        sceneIndex: 5,
        panelCount: 1,
      });
      expect(climax.score).toBeGreaterThan(filler.score);
    });
  });

  describe("getTierForScore", () => {
    it("returns flagship for scores 8-10", () => {
      expect(getTierForScore(8)).toBe("flagship");
      expect(getTierForScore(10)).toBe("flagship");
    });

    it("returns standard for scores 5-7", () => {
      expect(getTierForScore(5)).toBe("standard");
      expect(getTierForScore(7)).toBe("standard");
    });

    it("returns budget for scores 1-4", () => {
      expect(getTierForScore(1)).toBe("budget");
      expect(getTierForScore(4)).toBe("budget");
    });
  });

  describe("scoreEpisodeScenes", () => {
    it("returns scored scenes with tier distribution", () => {
      const scenes: ImportanceInput[] = [
        { sceneType: "action", motionIntensity: "high", narrativePosition: 0.9, dialogueLineCount: 1, characterCount: 3, panelSizePct: 80, narrativeTag: "climax", totalScenes: 3, sceneIndex: 2, panelCount: 5 },
        { sceneType: "dialogue", motionIntensity: "low", narrativePosition: 0.5, dialogueLineCount: 8, characterCount: 2, panelSizePct: 50, narrativeTag: "development", totalScenes: 3, sceneIndex: 1, panelCount: 3 },
        { sceneType: "transition", motionIntensity: "none", narrativePosition: 0.3, dialogueLineCount: 0, characterCount: 0, panelSizePct: 20, narrativeTag: "filler", totalScenes: 3, sceneIndex: 0, panelCount: 1 },
      ];
      const result = scoreEpisodeScenes(scenes);
      expect(result).toHaveProperty("scores");
      expect(result).toHaveProperty("tierDistribution");
      expect(result.scores.length).toBe(3);
    });
  });
});

// ─── Voice Cache Service ─────────────────────────────────────────────────
import {
  lookupVoiceLine,
  COMMON_INTERJECTIONS,
  getVoiceCacheStats,
  hashText,
} from "./voice-cache";

describe("Voice Cache Service", () => {
  describe("COMMON_INTERJECTIONS", () => {
    it("contains at least 20 common phrases", () => {
      expect(COMMON_INTERJECTIONS.length).toBeGreaterThanOrEqual(20);
    });

    it("each interjection has text and emotion", () => {
      for (const interjection of COMMON_INTERJECTIONS) {
        expect(interjection).toHaveProperty("text");
        expect(interjection).toHaveProperty("emotion");
        expect(typeof interjection.text).toBe("string");
        expect(typeof interjection.emotion).toBe("string");
      }
    });
  });

  describe("hashText", () => {
    it("returns consistent hash for same input", () => {
      const hash1 = hashText("Hello world");
      const hash2 = hashText("Hello world");
      expect(hash1).toBe(hash2);
    });

    it("returns different hash for different input", () => {
      const hash1 = hashText("Hello world");
      const hash2 = hashText("Goodbye world");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("lookupVoiceLine", () => {
    it("returns null for uncached voice line", async () => {
      const result = await lookupVoiceLine({ voiceId: "nonexistent-voice", text: "Hello world", emotion: "neutral" });
      expect(result).toBeNull();
    });
  });

  describe("getVoiceCacheStats", () => {
    it("returns stats object with expected fields", async () => {
      const stats = await getVoiceCacheStats("test-voice-id");
      expect(stats).toHaveProperty("totalEntries");
      expect(stats).toHaveProperty("totalUsages");
      expect(typeof stats.totalEntries).toBe("number");
    });
  });
});

// ─── Targeted Inpainting Service ─────────────────────────────────────────
import {
  validateMask,
  estimateInpaintCost,
  getMaskAreaPercent,
  type InpaintMask,
} from "./targeted-inpainting";

describe("Targeted Inpainting Service", () => {
  describe("validateMask", () => {
    it("validates a rectangle mask (returns null for valid)", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      };
      const result = validateMask(mask);
      expect(result).toBeNull(); // null means valid
    });

    it("rejects mask that exceeds image bounds", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.9, y: 0.9, width: 0.3, height: 0.3 },
      };
      const result = validateMask(mask);
      expect(result).not.toBeNull(); // string error means invalid
      expect(typeof result).toBe("string");
    });

    it("rejects mask that is too small", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.1, y: 0.1, width: 0.001, height: 0.001 },
      };
      const result = validateMask(mask);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("string");
    });

    it("rejects mask that is too large", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.0, y: 0.0, width: 0.9, height: 0.9 },
      };
      const result = validateMask(mask);
      expect(result).not.toBeNull();
      expect(typeof result).toBe("string");
    });
  });

  describe("estimateInpaintCost", () => {
    it("returns cost >= 0.5 for any mask", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      };
      const cost = estimateInpaintCost(mask);
      expect(cost).toBeGreaterThanOrEqual(0.5);
    });

    it("scales with mask area", () => {
      const smallMask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.1, y: 0.1, width: 0.1, height: 0.1 },
      };
      const largeMask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
      };
      const smallCost = estimateInpaintCost(smallMask);
      const largeCost = estimateInpaintCost(largeMask);
      expect(largeCost).toBeGreaterThanOrEqual(smallCost);
    });
  });

  describe("getMaskAreaPercent", () => {
    it("returns correct area percentage for rectangle", () => {
      const mask: InpaintMask = {
        type: "rectangle",
        boundingBox: { x: 0.0, y: 0.0, width: 0.5, height: 0.5 },
      };
      const area = getMaskAreaPercent(mask);
      expect(area).toBeCloseTo(25, 0); // 50% * 50% = 25%
    });
  });
});
