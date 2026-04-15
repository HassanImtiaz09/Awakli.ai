import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PanelScriptData, SceneClassification } from "./scene-classifier";

// ─── Mock DB ──────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createModelRoutingStat: vi.fn().mockResolvedValue(1),
  getModelRoutingStatsByEpisode: vi.fn().mockResolvedValue([]),
  getModelRoutingStatsByRun: vi.fn().mockResolvedValue(null),
  getRoutingDataByRun: vi.fn().mockResolvedValue([]),
  updatePipelineAssetRouting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          tier: 2,
          reasoning: "Complex action scene with multiple characters",
          face_visible: true,
          lip_sync_needed: false,
          lip_sync_beneficial: true,
        }),
      },
    }],
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────

import {
  applyDeterministicRules,
  classifyScene,
  calculateCost,
  calculateV3OmniCost,
  MODEL_MAP,
} from "./scene-classifier";

// ─── Deterministic Rules Tests ───────────────────────────────────────────

describe("Scene Classifier — Deterministic Rules", () => {
  it("Rule 3: transition panel → Tier 4", () => {
    const panel: PanelScriptData = {
      panelId: 1,
      visualDescription: "Fade to black",
      sceneType: "transition",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(4);
    expect(result!.model).toBe("v1-6");
    expect(result!.deterministic).toBe(true);
    expect(result!.classificationCostUsd).toBe(0);
  });

  it("Rule 3: transition + Sakuga → Tier 2 (override)", () => {
    const panel: PanelScriptData = {
      panelId: 2,
      visualDescription: "Epic transition with sakuga animation",
      sceneType: "transition",
      animationStyle: "sakuga",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(2);
    expect(result!.reasoning).toContain("Sakuga override");
  });

  it("Rule 2: extreme close-up with dialogue → Tier 1", () => {
    const panel: PanelScriptData = {
      panelId: 3,
      visualDescription: "Character's eyes fill the frame",
      cameraAngle: "extreme-close-up",
      dialogue: [{ character: "Akira", text: "I will never give up!", emotion: "determined" }],
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
    expect(result!.lipSyncNeeded).toBe(true);
    expect(result!.model).toBe("v3-omni");
  });

  it("Rule 1: no dialogue + wide shot → Tier 3", () => {
    const panel: PanelScriptData = {
      panelId: 4,
      visualDescription: "Establishing shot of Tokyo skyline at sunset",
      cameraAngle: "wide",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(3);
    expect(result!.hasDialogue).toBe(false);
    expect(result!.lipSyncNeeded).toBe(false);
  });

  it("Rule 1: no dialogue + birds-eye → Tier 3", () => {
    const panel: PanelScriptData = {
      panelId: 5,
      visualDescription: "Aerial view of the battlefield",
      cameraAngle: "birds-eye",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(3);
  });

  it("Rule 1: no dialogue + wide + Sakuga → Tier 2 (override)", () => {
    const panel: PanelScriptData = {
      panelId: 6,
      visualDescription: "Sweeping wide shot with sakuga quality",
      cameraAngle: "wide",
      animationStyle: "sakuga",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(2);
  });

  it("No rule match: medium shot with dialogue → returns null (needs LLM)", () => {
    const panel: PanelScriptData = {
      panelId: 7,
      visualDescription: "Two characters talking in a room",
      cameraAngle: "medium",
      dialogue: [{ character: "Yuki", text: "What do you think?", emotion: "curious" }],
    };
    const result = applyDeterministicRules(panel);
    expect(result).toBeNull(); // Needs LLM classification
  });

  it("No rule match: close-up without dialogue → returns null", () => {
    const panel: PanelScriptData = {
      panelId: 8,
      visualDescription: "Character staring pensively",
      cameraAngle: "close-up",
    };
    const result = applyDeterministicRules(panel);
    expect(result).toBeNull();
  });

  it("Handles string dialogue format", () => {
    const panel: PanelScriptData = {
      panelId: 9,
      visualDescription: "Character speaking",
      cameraAngle: "extreme-close-up",
      dialogue: "I will find you!" as any,
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(1);
    expect(result!.hasDialogue).toBe(true);
  });

  it("Empty dialogue array → no dialogue", () => {
    const panel: PanelScriptData = {
      panelId: 10,
      visualDescription: "Empty scene",
      cameraAngle: "wide",
      dialogue: [],
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(3);
    expect(result!.hasDialogue).toBe(false);
  });
});

// ─── LLM Classifier Tests ────────────────────────────────────────────────

describe("Scene Classifier — LLM Classification", () => {
  it("classifyScene falls back to LLM for medium shot with dialogue", async () => {
    const panel: PanelScriptData = {
      panelId: 11,
      visualDescription: "Two characters arguing in a coffee shop",
      cameraAngle: "medium",
      dialogue: [
        { character: "Akira", text: "You don't understand!", emotion: "angry" },
        { character: "Yuki", text: "I understand perfectly.", emotion: "calm" },
      ],
    };

    const result = await classifyScene(panel);
    expect(result).toBeDefined();
    expect(result.tier).toBeGreaterThanOrEqual(1);
    expect(result.tier).toBeLessThanOrEqual(4);
    expect(result.deterministic).toBe(false);
    expect(result.classificationCostUsd).toBe(0.005);
    // LLM returns tier 2, but face size heuristic for medium shot with 2 chars
    // gives faceSize ~8%, which is < 10%, so stays at tier 2 or gets bumped to 1
    // depending on the face size
  });

  it("classifyScene returns deterministic result when rules match", async () => {
    const panel: PanelScriptData = {
      panelId: 12,
      visualDescription: "Title card fade",
      sceneType: "transition",
    };

    const result = await classifyScene(panel);
    expect(result.tier).toBe(4);
    expect(result.deterministic).toBe(true);
    expect(result.classificationCostUsd).toBe(0);
  });

  it("classifyScene applies Sakuga override after LLM classification", async () => {
    // Mock LLM to return tier 3
    const { invokeLLM } = await import("./_core/llm");
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            tier: 3,
            reasoning: "Slow establishing shot",
            face_visible: false,
            lip_sync_needed: false,
            lip_sync_beneficial: false,
          }),
        },
      }],
    });

    const panel: PanelScriptData = {
      panelId: 13,
      visualDescription: "Slow pan across the city",
      cameraAngle: "medium",
      animationStyle: "sakuga",
    };

    const result = await classifyScene(panel);
    expect(result.tier).toBe(2); // Sakuga override from 3 → 2
    expect(result.reasoning).toContain("Sakuga override");
  });
});

// ─── Cost Calculation Tests ──────────────────────────────────────────────

describe("Cost Calculations", () => {
  it("calculateCost returns correct cost for each tier (pro mode, 5s)", () => {
    expect(calculateCost(1, 5, "pro")).toBeCloseTo(0.63, 2);
    expect(calculateCost(2, 5, "pro")).toBeCloseTo(0.42, 2);
    expect(calculateCost(3, 5, "pro")).toBeCloseTo(0.28, 2);
    expect(calculateCost(4, 5, "pro")).toBeCloseTo(0.175, 2);
  });

  it("calculateCost returns correct cost for std mode", () => {
    expect(calculateCost(1, 5, "std")).toBeCloseTo(0.315, 2);
    expect(calculateCost(2, 5, "std")).toBeCloseTo(0.21, 2);
  });

  it("calculateV3OmniCost returns V3 Omni cost for comparison", () => {
    const v3Cost = calculateV3OmniCost(5, "pro");
    expect(v3Cost).toBeCloseTo(0.63, 2);
  });

  it("Tier 4 is ~72% cheaper than Tier 1 for same duration", () => {
    const t1 = calculateCost(1, 5, "pro");
    const t4 = calculateCost(4, 5, "pro");
    const savings = ((t1 - t4) / t1) * 100;
    expect(savings).toBeGreaterThan(70);
  });

  it("calculateCost handles different durations", () => {
    const cost5s = calculateCost(2, 5, "pro");
    const cost10s = calculateCost(2, 10, "pro");
    expect(cost10s).toBeCloseTo(cost5s * 2, 2);
  });

  it("calculateCost falls back to tier 2 for invalid tier", () => {
    const cost = calculateCost(99, 5, "pro");
    expect(cost).toBeCloseTo(calculateCost(2, 5, "pro"), 2);
  });
});

// ─── MODEL_MAP Tests ─────────────────────────────────────────────────────

describe("MODEL_MAP", () => {
  it("has 4 tiers", () => {
    expect(Object.keys(MODEL_MAP)).toHaveLength(4);
  });

  it("tier 1 is V3 Omni", () => {
    expect(MODEL_MAP[1].model).toBe("v3-omni");
    expect(MODEL_MAP[1].modelName).toBe("kling-video-o1");
  });

  it("tier 2 is V2.6", () => {
    expect(MODEL_MAP[2].model).toBe("v2-6");
    expect(MODEL_MAP[2].modelName).toBe("kling-v2-6");
  });

  it("tier 3 is V2.1", () => {
    expect(MODEL_MAP[3].model).toBe("v2-1");
    expect(MODEL_MAP[3].modelName).toBe("kling-v2-1");
  });

  it("tier 4 is V1.6", () => {
    expect(MODEL_MAP[4].model).toBe("v1-6");
    expect(MODEL_MAP[4].modelName).toBe("kling-v1-6");
  });

  it("costs decrease from tier 1 to tier 4", () => {
    expect(MODEL_MAP[1].costPerSecPro).toBeGreaterThan(MODEL_MAP[2].costPerSecPro);
    expect(MODEL_MAP[2].costPerSecPro).toBeGreaterThan(MODEL_MAP[3].costPerSecPro);
    expect(MODEL_MAP[3].costPerSecPro).toBeGreaterThan(MODEL_MAP[4].costPerSecPro);
  });
});

// ─── tRPC Router Tests ───────────────────────────────────────────────────

describe("Model Routing tRPC Router", () => {
  it("modelRoutingRouter exports all expected procedures", async () => {
    const { modelRoutingRouter } = await import("./routers-model-routing");
    const procedures = Object.keys(modelRoutingRouter._def.procedures);
    expect(procedures).toContain("classifyPanel");
    expect(procedures).toContain("getStatsByEpisode");
    expect(procedures).toContain("getStatsByRun");
    expect(procedures).toContain("getRoutingBreakdown");
    expect(procedures).toContain("overrideModel");
    expect(procedures).toContain("getCostComparison");
    expect(procedures).toContain("getModelInfo");
  });

  it("modelRoutingRouter is registered in the main appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures.some(p => p.startsWith("modelRouting."))).toBe(true);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────

describe("Edge Cases", () => {
  it("handles panel with no visual description", async () => {
    const panel: PanelScriptData = {
      panelId: 20,
      visualDescription: "",
      sceneType: "transition",
    };
    const result = await classifyScene(panel);
    expect(result).toBeDefined();
    expect(result.tier).toBe(4);
  });

  it("handles panel with undefined camera angle", async () => {
    const panel: PanelScriptData = {
      panelId: 21,
      visualDescription: "A mysterious scene",
    };
    const result = applyDeterministicRules(panel);
    expect(result).toBeNull(); // No deterministic rule matches without camera angle
  });

  it("handles panel with empty string dialogue", () => {
    const panel: PanelScriptData = {
      panelId: 22,
      visualDescription: "Silent scene",
      cameraAngle: "wide",
      dialogue: [{ text: "" }],
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.hasDialogue).toBe(false); // Empty text = no dialogue
  });

  it("handles mixed case camera angles", () => {
    const panel: PanelScriptData = {
      panelId: 23,
      visualDescription: "Scene",
      cameraAngle: "Wide",
    };
    const result = applyDeterministicRules(panel);
    expect(result).not.toBeNull();
    expect(result!.tier).toBe(3);
  });
});
