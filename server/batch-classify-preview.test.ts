import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyScene,
  classifyPanelsBatch,
  calculateCost,
  calculateV3OmniCost,
  MODEL_MAP,
  applyDeterministicRules,
  type PanelScriptData,
  type SceneClassification,
} from "./scene-classifier";

// ─── Scene Classifier Unit Tests ─────────────────────────────────────

describe("Batch Classification Preview", () => {

  // ─── Deterministic Rules ─────────────────────────────────────────

  describe("applyDeterministicRules", () => {
    it("classifies transition panels as Tier 4", () => {
      const panel: PanelScriptData = {
        panelId: 1,
        visualDescription: "Fade to black",
        sceneType: "transition",
      };
      const result = applyDeterministicRules(panel);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe(4);
      expect(result!.deterministic).toBe(true);
      expect(result!.classificationCostUsd).toBe(0);
    });

    it("upgrades sakuga transition panels to Tier 2", () => {
      const panel: PanelScriptData = {
        panelId: 2,
        visualDescription: "Sakuga transition",
        sceneType: "transition",
        animationStyle: "sakuga",
      };
      const result = applyDeterministicRules(panel);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe(2);
    });

    it("classifies wide shots without dialogue as Tier 3", () => {
      const panel: PanelScriptData = {
        panelId: 3,
        visualDescription: "Panoramic city view",
        cameraAngle: "wide",
      };
      const result = applyDeterministicRules(panel);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe(3);
      expect(result!.hasDialogue).toBe(false);
    });

    it("classifies extreme close-up with dialogue as Tier 1", () => {
      const panel: PanelScriptData = {
        panelId: 4,
        visualDescription: "Character face extreme close-up",
        cameraAngle: "extreme-close-up",
        dialogue: [{ character: "Hero", text: "I will protect you!" }],
      };
      const result = applyDeterministicRules(panel);
      expect(result).not.toBeNull();
      expect(result!.tier).toBe(1);
      expect(result!.lipSyncNeeded).toBe(true);
    });

    it("returns null for ambiguous panels (needs LLM)", () => {
      const panel: PanelScriptData = {
        panelId: 5,
        visualDescription: "Two characters talking in a medium shot",
        cameraAngle: "medium",
        dialogue: [{ character: "A", text: "Hello" }],
      };
      const result = applyDeterministicRules(panel);
      expect(result).toBeNull();
    });
  });

  // ─── Cost Calculation ────────────────────────────────────────────

  describe("calculateCost", () => {
    it("calculates Tier 1 pro cost correctly", () => {
      const cost = calculateCost(1, 5, "pro");
      expect(cost).toBeCloseTo(0.126 * 5, 3);
    });

    it("calculates Tier 4 std cost correctly", () => {
      const cost = calculateCost(4, 5, "std");
      expect(cost).toBeCloseTo(0.018 * 5, 3);
    });

    it("calculates V3 Omni cost for comparison", () => {
      const cost = calculateV3OmniCost(5, "pro");
      expect(cost).toBeCloseTo(0.126 * 5, 3);
    });

    it("shows savings for lower tiers", () => {
      const tier3Cost = calculateCost(3, 5, "pro");
      const v3Cost = calculateV3OmniCost(5, "pro");
      expect(tier3Cost).toBeLessThan(v3Cost);
      const savings = v3Cost - tier3Cost;
      expect(savings).toBeGreaterThan(0);
    });
  });

  // ─── MODEL_MAP ───────────────────────────────────────────────────

  describe("MODEL_MAP", () => {
    it("has 4 tiers", () => {
      expect(Object.keys(MODEL_MAP)).toHaveLength(4);
    });

    it("Tier 1 is the most expensive", () => {
      expect(MODEL_MAP[1].costPerSecPro).toBeGreaterThan(MODEL_MAP[2].costPerSecPro);
      expect(MODEL_MAP[2].costPerSecPro).toBeGreaterThan(MODEL_MAP[3].costPerSecPro);
      expect(MODEL_MAP[3].costPerSecPro).toBeGreaterThan(MODEL_MAP[4].costPerSecPro);
    });

    it("each tier has model and modelName", () => {
      for (const tier of [1, 2, 3, 4]) {
        const m = MODEL_MAP[tier];
        expect(m.model).toBeTruthy();
        expect(m.modelName).toBeTruthy();
        expect(m.costPerSecStd).toBeGreaterThan(0);
        expect(m.costPerSecPro).toBeGreaterThan(0);
      }
    });
  });

  // ─── classifyPanelsBatch ─────────────────────────────────────────

  describe("classifyPanelsBatch", () => {
    it("classifies deterministic panels without LLM calls", async () => {
      const panels: PanelScriptData[] = [
        { panelId: 1, visualDescription: "Fade to black", sceneType: "transition" },
        { panelId: 2, visualDescription: "Wide establishing shot of city", cameraAngle: "wide" },
        { panelId: 3, visualDescription: "Extreme close-up dialogue", cameraAngle: "extreme-close-up", dialogue: [{ text: "Hello" }] },
      ];

      const results = await classifyPanelsBatch(panels);
      expect(results).toHaveLength(3);

      // Transition → Tier 4
      expect(results[0].tier).toBe(4);
      expect(results[0].deterministic).toBe(true);

      // Wide no dialogue → Tier 3
      expect(results[1].tier).toBe(3);
      expect(results[1].deterministic).toBe(true);

      // Extreme close-up with dialogue → Tier 1
      expect(results[2].tier).toBe(1);
      expect(results[2].deterministic).toBe(true);
    });

    it("returns results in same order as input", async () => {
      const panels: PanelScriptData[] = [
        { panelId: 10, visualDescription: "Transition", sceneType: "transition" },
        { panelId: 20, visualDescription: "Wide shot", cameraAngle: "birds-eye" },
      ];

      const results = await classifyPanelsBatch(panels);
      expect(results).toHaveLength(2);
      // First panel should be transition (Tier 4)
      expect(results[0].tier).toBe(4);
      // Second panel should be wide (Tier 3)
      expect(results[1].tier).toBe(3);
    });

    it("handles empty panel array", async () => {
      const results = await classifyPanelsBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  // ─── Override Logic ──────────────────────────────────────────────

  describe("Override Logic (simulated)", () => {
    it("applies override to change tier and recalculate cost", () => {
      // Simulate what the batchClassifyPreview endpoint does
      const classification: SceneClassification = {
        tier: 3,
        model: "v2-1",
        modelName: "kling-v2-1",
        reasoning: "Deterministic: wide shot",
        hasDialogue: false,
        faceVisible: false,
        lipSyncNeeded: false,
        lipSyncBeneficial: false,
        deterministic: true,
        classificationCostUsd: 0,
      };

      // User overrides to Tier 1
      const forceTier = 1;
      const m = MODEL_MAP[forceTier as 1 | 2 | 3 | 4];
      const overridden = {
        ...classification,
        tier: forceTier as 1 | 2 | 3 | 4,
        model: m.model,
        modelName: m.modelName,
        reasoning: `User override → Tier ${forceTier} (original: Tier ${classification.tier})`,
      };

      expect(overridden.tier).toBe(1);
      expect(overridden.model).toBe("v3-omni");

      // Cost should be higher after upgrade
      const originalCost = calculateCost(3, 5, "pro");
      const overriddenCost = calculateCost(1, 5, "pro");
      expect(overriddenCost).toBeGreaterThan(originalCost);
    });

    it("preserves original classification when no override", () => {
      const classification: SceneClassification = {
        tier: 2,
        model: "v2-6",
        modelName: "kling-v2-6",
        reasoning: "LLM: action scene",
        hasDialogue: true,
        faceVisible: true,
        lipSyncNeeded: false,
        lipSyncBeneficial: true,
        deterministic: false,
        classificationCostUsd: 0.005,
      };

      const overrideMap: Record<string, number> = {};
      const panelId = "42";
      const forceTier = overrideMap[panelId];

      // No override → keep original
      expect(forceTier).toBeUndefined();
      expect(classification.tier).toBe(2);
    });
  });

  // ─── Aggregate Calculations ──────────────────────────────────────

  describe("Aggregate Cost Calculations", () => {
    it("calculates total cost and savings correctly", () => {
      const tiers = [1, 2, 3, 4, 3, 2, 1, 4, 3, 2];
      const durationSec = 5;
      const mode = "pro" as const;

      let totalCost = 0;
      let totalV3Cost = 0;
      const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

      for (const tier of tiers) {
        totalCost += calculateCost(tier, durationSec, mode);
        totalV3Cost += calculateV3OmniCost(durationSec, mode);
        tierCounts[tier]++;
      }

      expect(tierCounts).toEqual({ 1: 2, 2: 3, 3: 3, 4: 2 });
      expect(totalCost).toBeLessThan(totalV3Cost);

      const savings = totalV3Cost - totalCost;
      const savingsPercent = (savings / totalV3Cost) * 100;
      expect(savings).toBeGreaterThan(0);
      expect(savingsPercent).toBeGreaterThan(0);
      expect(savingsPercent).toBeLessThan(100);
    });

    it("shows 0% savings when all panels are Tier 1", () => {
      const tiers = [1, 1, 1, 1, 1];
      let totalCost = 0;
      let totalV3Cost = 0;

      for (const tier of tiers) {
        totalCost += calculateCost(tier, 5, "pro");
        totalV3Cost += calculateV3OmniCost(5, "pro");
      }

      const savings = totalV3Cost - totalCost;
      expect(savings).toBeCloseTo(0, 5);
    });

    it("shows maximum savings when all panels are Tier 4", () => {
      const tiers = [4, 4, 4, 4, 4];
      let totalCost = 0;
      let totalV3Cost = 0;

      for (const tier of tiers) {
        totalCost += calculateCost(tier, 5, "pro");
        totalV3Cost += calculateV3OmniCost(5, "pro");
      }

      const savingsPercent = ((totalV3Cost - totalCost) / totalV3Cost) * 100;
      expect(savingsPercent).toBeGreaterThan(50); // Tier 4 is much cheaper
    });
  });

  // ─── tRPC Endpoint Shape ─────────────────────────────────────────

  describe("batchClassifyPreview endpoint shape", () => {
    it("exports classifyPanelsBatch function", () => {
      expect(typeof classifyPanelsBatch).toBe("function");
    });

    it("exports classifyScene function", () => {
      expect(typeof classifyScene).toBe("function");
    });

    it("exports calculateCost function", () => {
      expect(typeof calculateCost).toBe("function");
    });

    it("exports calculateV3OmniCost function", () => {
      expect(typeof calculateV3OmniCost).toBe("function");
    });

    it("exports applyDeterministicRules function", () => {
      expect(typeof applyDeterministicRules).toBe("function");
    });

    it("MODEL_MAP has correct structure", () => {
      for (const tier of [1, 2, 3, 4]) {
        expect(MODEL_MAP[tier]).toHaveProperty("model");
        expect(MODEL_MAP[tier]).toHaveProperty("modelName");
        expect(MODEL_MAP[tier]).toHaveProperty("costPerSecStd");
        expect(MODEL_MAP[tier]).toHaveProperty("costPerSecPro");
      }
    });
  });

  // ─── SceneClassification Interface ───────────────────────────────

  describe("SceneClassification interface", () => {
    it("classifyScene returns all required fields", async () => {
      const panel: PanelScriptData = {
        panelId: 1,
        visualDescription: "Fade to black",
        sceneType: "transition",
      };

      const result = await classifyScene(panel);
      expect(result).toHaveProperty("tier");
      expect(result).toHaveProperty("model");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("reasoning");
      expect(result).toHaveProperty("hasDialogue");
      expect(result).toHaveProperty("faceVisible");
      expect(result).toHaveProperty("lipSyncNeeded");
      expect(result).toHaveProperty("lipSyncBeneficial");
      expect(result).toHaveProperty("deterministic");
      expect(result).toHaveProperty("classificationCostUsd");
      expect(result.tier).toBeGreaterThanOrEqual(1);
      expect(result.tier).toBeLessThanOrEqual(4);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("handles panel with empty visual description", async () => {
      const panel: PanelScriptData = {
        panelId: 1,
        visualDescription: "",
        sceneType: "transition",
      };
      const result = await classifyScene(panel);
      expect(result.tier).toBeDefined();
    });

    it("handles panel with string dialogue", async () => {
      const panel: PanelScriptData = {
        panelId: 1,
        visualDescription: "Character speaking",
        cameraAngle: "extreme-close-up",
        dialogue: "Hello world" as any,
      };
      const result = await classifyScene(panel);
      expect(result.hasDialogue).toBe(true);
    });

    it("handles panel with empty dialogue array", async () => {
      const panel: PanelScriptData = {
        panelId: 1,
        visualDescription: "Silent scene",
        cameraAngle: "wide",
        dialogue: [],
      };
      const result = await classifyScene(panel);
      expect(result.hasDialogue).toBe(false);
    });

    it("handles various camera angle formats", () => {
      const angles = ["wide", "Wide", "WIDE", "wide-shot", "wide_shot"];
      for (const angle of angles) {
        const panel: PanelScriptData = {
          panelId: 1,
          visualDescription: "Scene",
          cameraAngle: angle,
        };
        const result = applyDeterministicRules(panel);
        expect(result).not.toBeNull();
        expect(result!.tier).toBeLessThanOrEqual(3);
      }
    });
  });
});
