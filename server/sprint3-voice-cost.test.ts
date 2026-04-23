/**
 * Sprint 3 Tests — Voice Cache, Script Cost Advisor, Scene-Type Optimizer
 */
import { describe, it, expect, beforeEach } from "vitest";

// ─── Voice Cache Tests ──────────────────────────────────────────────────

import { hashText, COMMON_INTERJECTIONS } from "./voice-cache";

describe("Voice Cache — hashText", () => {
  it("produces consistent hashes for the same text", () => {
    expect(hashText("Hello world")).toBe(hashText("Hello world"));
  });

  it("normalizes whitespace", () => {
    expect(hashText("Hello   world")).toBe(hashText("Hello world"));
    expect(hashText("  Hello world  ")).toBe(hashText("Hello world"));
  });

  it("normalizes case", () => {
    expect(hashText("HELLO WORLD")).toBe(hashText("hello world"));
    expect(hashText("Hello World")).toBe(hashText("hello world"));
  });

  it("produces different hashes for different text", () => {
    expect(hashText("Hello")).not.toBe(hashText("World"));
  });

  it("returns a 32-character hex string", () => {
    const hash = hashText("test");
    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("Voice Cache — COMMON_INTERJECTIONS", () => {
  it("contains at least 20 interjections", () => {
    expect(COMMON_INTERJECTIONS.length).toBeGreaterThanOrEqual(20);
  });

  it("each interjection has text and emotion", () => {
    for (const intj of COMMON_INTERJECTIONS) {
      expect(intj.text).toBeTruthy();
      expect(intj.emotion).toBeTruthy();
      expect(typeof intj.text).toBe("string");
      expect(typeof intj.emotion).toBe("string");
    }
  });

  it("has no duplicate texts", () => {
    const texts = COMMON_INTERJECTIONS.map(i => i.text.toLowerCase());
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it("includes common anime interjections", () => {
    const texts = COMMON_INTERJECTIONS.map(i => i.text.toLowerCase());
    expect(texts).toContain("yes!");
    expect(texts).toContain("no!");
    expect(texts).toContain("what?!");
  });
});

// ─── Script Cost Advisor Tests ──────────────────────────────────────────

import {
  analyzeScriptCost,
  generateBudgetSuggestions,
  estimateEpisodeCost,
} from "./script-cost-advisor";

// We need to test the internal functions too
import {
  splitIntoScenes,
  classifyScene,
  getCostLevel,
} from "./script-cost-advisor";

describe("Script Cost Advisor — splitIntoScenes", () => {
  it("splits screenplay-format text by scene headers", () => {
    const script = `INT. CLASSROOM - DAY
The students are studying.

EXT. SCHOOLYARD - DAY
The bell rings and students rush out.

INT. HALLWAY - NIGHT
A shadowy figure lurks in the darkness.`;
    const scenes = splitIntoScenes(script);
    expect(scenes.length).toBe(3);
  });

  it("splits paragraph-based text by double newlines", () => {
    const script = `The hero stood at the edge of the cliff, looking down at the valley below.

"We need to move now," she said, drawing her sword.

Meanwhile, in the castle, the villain was preparing his final attack.`;
    const scenes = splitIntoScenes(script);
    expect(scenes.length).toBe(3);
  });

  it("returns single scene for short text", () => {
    const scenes = splitIntoScenes("A short scene description.");
    expect(scenes.length).toBe(1);
  });
});

describe("Script Cost Advisor — classifyScene", () => {
  it("classifies action scenes", () => {
    expect(classifyScene("The hero attacks with a powerful sword slash, dodging the enemy's counterattack")).toBe("action");
  });

  it("classifies dialogue scenes", () => {
    expect(classifyScene('"I need to tell you something important," she said softly. He replied, "What is it?"')).toBe("dialogue");
  });

  it("classifies establishing scenes", () => {
    expect(classifyScene("A wide panorama of the city skyline at sunset, establishing the urban landscape")).toBe("establishing");
  });

  it("classifies reaction scenes", () => {
    expect(classifyScene("Close-up on her face as she gasped in shock, eyes widening with surprise")).toBe("reaction");
  });

  it("classifies transition scenes", () => {
    expect(classifyScene("Meanwhile, three hours later, the scene transitions to the next day")).toBe("transition");
  });

  it("classifies montage scenes", () => {
    expect(classifyScene("A training montage showing a series of rapid preparation sequences and flashback memories")).toBe("montage");
  });

  it("defaults to dialogue for ambiguous text", () => {
    expect(classifyScene("The character walks through the room")).toBe("dialogue");
  });
});

describe("Script Cost Advisor — getCostLevel", () => {
  it("returns low for cheap scenes", () => {
    expect(getCostLevel(5)).toBe("low");
    expect(getCostLevel(8)).toBe("low");
  });

  it("returns medium for moderate scenes", () => {
    expect(getCostLevel(9)).toBe("medium");
    expect(getCostLevel(15)).toBe("medium");
  });

  it("returns high for expensive scenes", () => {
    expect(getCostLevel(16)).toBe("high");
    expect(getCostLevel(50)).toBe("high");
  });
});

describe("Script Cost Advisor — analyzeScriptCost", () => {
  it("returns complete breakdown for a multi-scene script", () => {
    const script = `The hero draws his sword and attacks the enemy with a powerful slash.

"We need to retreat," the captain said. "There are too many of them," she replied.

A wide panorama of the battlefield at sunset.`;

    const result = analyzeScriptCost(script);
    expect(result.scenes.length).toBeGreaterThanOrEqual(2);
    expect(result.totalEstimatedCost).toBeGreaterThan(0);
    expect(result.averageCostPerScene).toBeGreaterThan(0);
    expect(result.costDistribution).toBeDefined();
    expect(typeof result.costDistribution.low).toBe("number");
    expect(typeof result.costDistribution.medium).toBe("number");
    expect(typeof result.costDistribution.high).toBe("number");
  });

  it("each scene has required fields", () => {
    const result = analyzeScriptCost("The hero fights the villain in an epic battle with swords clashing.");
    for (const scene of result.scenes) {
      expect(scene.sceneIndex).toBeDefined();
      expect(scene.sceneText).toBeTruthy();
      expect(scene.estimatedSceneType).toBeTruthy();
      expect(scene.estimatedCost).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(scene.costLevel);
      expect(scene.heatmapColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(scene.panelCount).toBeGreaterThan(0);
    }
  });

  it("generates budget suggestions for expensive scripts", () => {
    const script = `The hero attacks with a devastating combo, slashing and dodging through a crowd of enemies in an epic battle sequence.

A training montage showing the hero practicing sword techniques, running through obstacles, and sparring with multiple opponents over several weeks of preparation.`;

    const result = analyzeScriptCost(script);
    // At least one scene should be action or montage (expensive)
    const expensiveScenes = result.scenes.filter(s => s.costLevel === "high");
    if (expensiveScenes.length > 0) {
      expect(result.budgetSuggestions.length).toBeGreaterThan(0);
    }
  });
});

describe("Script Cost Advisor — estimateEpisodeCost", () => {
  it("returns breakdown with all cost categories", () => {
    const scenes = analyzeScriptCost(
      'The hero said "hello" and then attacked the enemy with a sword slash.'
    ).scenes;
    const estimate = estimateEpisodeCost(scenes);

    expect(estimate.totalCredits).toBeGreaterThan(0);
    expect(estimate.breakdown.panelGeneration).toBeGreaterThan(0);
    expect(estimate.breakdown.videoMotion).toBeGreaterThan(0);
    expect(estimate.breakdown.assembly).toBe(5);
  });
});

// ─── Scene-Type Optimizer Tests ─────────────────────────────────────────

import {
  optimizeSceneTypes,
  recordSuggestionOutcome,
  getAcceptanceRates,
  resetAcceptanceTracker,
  COST_PER_PANEL,
  type SceneInput,
} from "./scene-type-optimizer";

describe("Scene-Type Optimizer — optimizeSceneTypes", () => {
  it("suggests downgrading low-motion action to reaction", () => {
    const scenes: SceneInput[] = [
      {
        sceneId: 1,
        sceneType: "action",
        description: "Character reacts to explosion",
        panelCount: 4,
        motionIntensity: 0.2,
        characterCount: 1,
      },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].suggestedType).toBe("reaction");
    expect(result.suggestions[0].savingsEstimate).toBeGreaterThan(0);
    expect(result.suggestions[0].confidence).toBeGreaterThan(0.5);
  });

  it("suggests downgrading short montage to transition", () => {
    const scenes: SceneInput[] = [
      {
        sceneId: 2,
        sceneType: "montage",
        description: "Quick time skip",
        panelCount: 2,
      },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(result.suggestions.length).toBe(1);
    expect(result.suggestions[0].suggestedType).toBe("transition");
  });

  it("does not suggest downgrading high-motion action", () => {
    const scenes: SceneInput[] = [
      {
        sceneId: 3,
        sceneType: "action",
        description: "Epic sword fight",
        panelCount: 6,
        motionIntensity: 0.9,
        characterCount: 4,
      },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(result.suggestions.length).toBe(0);
  });

  it("does not suggest downgrading already-cheap scene types", () => {
    const scenes: SceneInput[] = [
      { sceneId: 4, sceneType: "transition", description: "Fade to black", panelCount: 1 },
      { sceneId: 5, sceneType: "establishing", description: "City skyline", panelCount: 2 },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(result.suggestions.length).toBe(0);
  });

  it("calculates total potential savings", () => {
    const scenes: SceneInput[] = [
      { sceneId: 1, sceneType: "action", description: "Low motion", panelCount: 4, motionIntensity: 0.1, characterCount: 1 },
      { sceneId: 2, sceneType: "montage", description: "Short", panelCount: 2 },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(result.totalPotentialSavings).toBeGreaterThan(0);
    expect(result.optimizableSceneCount).toBe(2);
    expect(result.totalSceneCount).toBe(2);
  });

  it("returns quality impact assessment", () => {
    const scenes: SceneInput[] = [
      { sceneId: 1, sceneType: "action", description: "Low motion", panelCount: 4, motionIntensity: 0.2, characterCount: 1 },
    ];

    const result = optimizeSceneTypes(scenes);
    expect(["none", "minimal", "noticeable"]).toContain(result.suggestions[0].qualityImpact);
  });
});

describe("Scene-Type Optimizer — acceptance tracking", () => {
  beforeEach(() => {
    resetAcceptanceTracker();
  });

  it("tracks accepted suggestions", () => {
    recordSuggestionOutcome("action", "reaction", true);
    recordSuggestionOutcome("action", "reaction", true);
    recordSuggestionOutcome("action", "reaction", false);

    const rates = getAcceptanceRates();
    const actionRate = rates.find(r => r.suggestionType === "action→reaction");
    expect(actionRate).toBeDefined();
    expect(actionRate!.accepted).toBe(2);
    expect(actionRate!.rejected).toBe(1);
    expect(actionRate!.acceptanceRate).toBe(67);
  });

  it("returns empty array when no outcomes recorded", () => {
    expect(getAcceptanceRates()).toEqual([]);
  });

  it("sorts by acceptance rate descending", () => {
    recordSuggestionOutcome("action", "reaction", true);
    recordSuggestionOutcome("montage", "transition", false);

    const rates = getAcceptanceRates();
    expect(rates[0].acceptanceRate).toBeGreaterThanOrEqual(rates[rates.length - 1].acceptanceRate);
  });
});

describe("Scene-Type Optimizer — COST_PER_PANEL", () => {
  it("action is the most expensive", () => {
    expect(COST_PER_PANEL.action).toBeGreaterThan(COST_PER_PANEL.dialogue);
    expect(COST_PER_PANEL.action).toBeGreaterThan(COST_PER_PANEL.reaction);
    expect(COST_PER_PANEL.action).toBeGreaterThan(COST_PER_PANEL.establishing);
  });

  it("transition is the cheapest", () => {
    for (const [type, cost] of Object.entries(COST_PER_PANEL)) {
      if (type !== "transition") {
        expect(cost).toBeGreaterThanOrEqual(COST_PER_PANEL.transition);
      }
    }
  });
});
