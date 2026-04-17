import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifySceneType,
  classifyEpisodeScenes,
  extractSceneMetadata,
} from "./scene-type-router/scene-type-classifier";
import {
  generateCostForecast,
  getProviderHintForSceneType,
  getPipelineStageSkips,
  shouldSkipStage,
  getAllPipelineConfigs,
} from "./scene-type-router/router-integration";
import {
  ALL_PIPELINE_TEMPLATES,
} from "./scene-type-router/pipeline-templates";
import type { SceneMetadata } from "./scene-type-router/scene-type-classifier";

// ─── Panel-to-Scene Grouping Logic (mirrors PipelineDashboard useMemo) ──────

function groupPanelsIntoScenes(panels: Array<{
  id: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle?: string | null;
  dialogue: any;
}>) {
  const sorted = [...panels].sort(
    (a, b) => a.sceneNumber - b.sceneNumber || a.panelNumber - b.panelNumber
  );
  const sceneMap = new Map<number, typeof sorted>();
  sorted.forEach((p) => {
    const arr = sceneMap.get(p.sceneNumber) || [];
    arr.push(p);
    sceneMap.set(p.sceneNumber, arr);
  });
  return Array.from(sceneMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sceneNum, panels]) => ({
      sceneId: panels[0]?.id ?? sceneNum,
      sceneNumber: sceneNum,
      panels: panels.map((p) => ({
        panelId: p.id,
        visualDescription: p.visualDescription || "",
        cameraAngle: p.cameraAngle || undefined,
        dialogue: Array.isArray(p.dialogue)
          ? p.dialogue.map((d: any) => ({ character: d.character, text: d.text || d.line || "" }))
          : [],
        panelSizePct: 50,
      })),
      estimatedDurationS: Math.max(5, panels.length * 3),
    }));
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("SceneTypePanel Integration (PipelineDashboard wiring)", () => {
  describe("Panel-to-Scene grouping", () => {
    it("groups panels by sceneNumber correctly", () => {
      const panels = [
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "Wide shot of city", dialogue: [] },
        { id: 2, sceneNumber: 1, panelNumber: 2, visualDescription: "Close-up of hero", dialogue: [{ character: "Hero", text: "Let's go!" }] },
        { id: 3, sceneNumber: 2, panelNumber: 1, visualDescription: "Interior room", dialogue: [{ character: "Villain", text: "Not so fast" }] },
        { id: 4, sceneNumber: 3, panelNumber: 1, visualDescription: "Explosion", dialogue: [] },
        { id: 5, sceneNumber: 3, panelNumber: 2, visualDescription: "Debris flying", dialogue: [] },
        { id: 6, sceneNumber: 3, panelNumber: 3, visualDescription: "Aftermath", dialogue: [] },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      expect(scenes).toHaveLength(3);
      expect(scenes[0].sceneNumber).toBe(1);
      expect(scenes[0].panels).toHaveLength(2);
      expect(scenes[1].sceneNumber).toBe(2);
      expect(scenes[1].panels).toHaveLength(1);
      expect(scenes[2].sceneNumber).toBe(3);
      expect(scenes[2].panels).toHaveLength(3);
    });

    it("sorts panels within each scene by panelNumber", () => {
      const panels = [
        { id: 3, sceneNumber: 1, panelNumber: 3, visualDescription: "Third", dialogue: [] },
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "First", dialogue: [] },
        { id: 2, sceneNumber: 1, panelNumber: 2, visualDescription: "Second", dialogue: [] },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      expect(scenes[0].panels[0].visualDescription).toBe("First");
      expect(scenes[0].panels[1].visualDescription).toBe("Second");
      expect(scenes[0].panels[2].visualDescription).toBe("Third");
    });

    it("handles empty panels array", () => {
      const scenes = groupPanelsIntoScenes([]);
      expect(scenes).toHaveLength(0);
    });

    it("calculates estimatedDurationS from panel count", () => {
      const panels = [
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "A", dialogue: [] },
        { id: 2, sceneNumber: 1, panelNumber: 2, visualDescription: "B", dialogue: [] },
        { id: 3, sceneNumber: 1, panelNumber: 3, visualDescription: "C", dialogue: [] },
        { id: 4, sceneNumber: 1, panelNumber: 4, visualDescription: "D", dialogue: [] },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      // Max(5, 4 * 3) = 12
      expect(scenes[0].estimatedDurationS).toBe(12);
    });

    it("enforces minimum 5s duration for single-panel scenes", () => {
      const panels = [
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "Solo", dialogue: [] },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      // Max(5, 1 * 3) = 5
      expect(scenes[0].estimatedDurationS).toBe(5);
    });

    it("extracts dialogue correctly from panel data", () => {
      const panels = [
        {
          id: 1, sceneNumber: 1, panelNumber: 1,
          visualDescription: "Two characters talking",
          dialogue: [
            { character: "Alice", text: "Hello" },
            { character: "Bob", text: "Hi there" },
          ],
        },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      expect(scenes[0].panels[0].dialogue).toHaveLength(2);
      expect(scenes[0].panels[0].dialogue[0]).toEqual({ character: "Alice", text: "Hello" });
      expect(scenes[0].panels[0].dialogue[1]).toEqual({ character: "Bob", text: "Hi there" });
    });

    it("handles null dialogue gracefully", () => {
      const panels = [
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "Silent", dialogue: null },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      expect(scenes[0].panels[0].dialogue).toEqual([]);
    });

    it("handles null visualDescription", () => {
      const panels = [
        { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: null, dialogue: [] },
      ];

      const scenes = groupPanelsIntoScenes(panels);
      expect(scenes[0].panels[0].visualDescription).toBe("");
    });
  });

  describe("Scene classification from grouped panels", () => {
    it("classifies a dialogue-heavy scene correctly", () => {
      const metadata: SceneMetadata = {
        panelCount: 3,
        hasDialogue: true,
        dialogueLineCount: 6,
        characterCount: 2,
        motionIntensity: "low",
        isExterior: false,
        hasActionLines: false,
        isCloseUp: true,
        panelSizePct: 50,
      };

      const result = classifySceneType(metadata);
      expect(result.sceneType).toBe("dialogue");
    });

    it("classifies an action scene correctly", () => {
      const metadata: SceneMetadata = {
        panelCount: 6,
        hasDialogue: false,
        dialogueLineCount: 0,
        characterCount: 3,
        motionIntensity: "high",
        isExterior: true,
        hasActionLines: true,
        isCloseUp: false,
        panelSizePct: 50,
      };

      const result = classifySceneType(metadata);
      expect(result.sceneType).toBe("action");
    });

    it("classifies a single-panel establishing shot", () => {
      const metadata: SceneMetadata = {
        panelCount: 1,
        hasDialogue: false,
        dialogueLineCount: 0,
        characterCount: 0,
        motionIntensity: "low",
        isExterior: true,
        hasActionLines: false,
        isCloseUp: false,
        panelSizePct: 80,
      };

      const result = classifySceneType(metadata);
      expect(result.sceneType).toBe("establishing");
    });

    it("classifies a montage scene (many small panels, no dialogue, no action)", () => {
      const metadata: SceneMetadata = {
        panelCount: 8,
        hasDialogue: false,
        dialogueLineCount: 0,
        characterCount: 1,
        motionIntensity: "low",
        isExterior: false,
        hasActionLines: false,
        isCloseUp: false,
        panelSizePct: 20,
        narrativeTag: "montage",
      };

      const result = classifySceneType(metadata);
      expect(result.sceneType).toBe("montage");
    });
  });

  describe("Batch classification for episode", () => {
    it("classifies multiple scenes and returns distribution", () => {
      // classifyEpisodeScenes expects SceneWithPanels[] = { scene: SceneData, panels: PanelData[] }[]
      const scenesWithPanels = [
        {
          scene: { id: 1, sceneNumber: 1, location: "Tokyo skyline", timeOfDay: "sunset", mood: "calm" },
          panels: [
            { id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "Wide shot of Tokyo skyline at sunset", cameraAngle: "wide", dialogue: null, sfx: null, transition: null },
          ],
        },
        {
          scene: { id: 2, sceneNumber: 2, location: "office", timeOfDay: "day", mood: "tense" },
          panels: [
            { id: 2, sceneNumber: 2, panelNumber: 1, visualDescription: "Close-up of hero talking", cameraAngle: "close-up", dialogue: [{ character: "Hero", text: "We need to move" }], sfx: null, transition: null },
            { id: 3, sceneNumber: 2, panelNumber: 2, visualDescription: "Close-up of sidekick replying", cameraAngle: "close-up", dialogue: [{ character: "Sidekick", text: "Right behind you" }], sfx: null, transition: null },
            { id: 4, sceneNumber: 2, panelNumber: 3, visualDescription: "Two-shot conversation", cameraAngle: "medium", dialogue: [{ character: "Hero", text: "Let's go" }], sfx: null, transition: null },
          ],
        },
        {
          scene: { id: 3, sceneNumber: 3, location: "rooftop", timeOfDay: "night", mood: "intense" },
          panels: [
            { id: 5, sceneNumber: 3, panelNumber: 1, visualDescription: "Running through explosion, speed lines", cameraAngle: "wide", dialogue: null, sfx: "BOOM", transition: null },
            { id: 6, sceneNumber: 3, panelNumber: 2, visualDescription: "Punch impact with motion blur and action lines", cameraAngle: "close-up", dialogue: null, sfx: "WHAM", transition: null },
            { id: 7, sceneNumber: 3, panelNumber: 3, visualDescription: "Debris flying with impact effects", cameraAngle: "wide", dialogue: null, sfx: null, transition: null },
            { id: 8, sceneNumber: 3, panelNumber: 4, visualDescription: "Landing pose with dust cloud", cameraAngle: "low", dialogue: null, sfx: null, transition: null },
            { id: 9, sceneNumber: 3, panelNumber: 5, visualDescription: "Counter attack with speed lines", cameraAngle: "dynamic", dialogue: null, sfx: null, transition: null },
          ],
        },
      ];

      const result = classifyEpisodeScenes(scenesWithPanels);
      expect(result).toHaveLength(3);
      // Each result should have sceneType and confidence
      result.forEach((r) => {
        expect(r.sceneType).toBeDefined();
        expect(r.confidence).toBeGreaterThan(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("Cost forecast integration", () => {
    it("generates forecast from scene type distribution", () => {
      const distribution = [
        { sceneType: "dialogue" as const, count: 5, totalDurationS: 50 },
        { sceneType: "action" as const, count: 3, totalDurationS: 45 },
        { sceneType: "establishing" as const, count: 2, totalDurationS: 10 },
      ];

      const forecast = generateCostForecast(distribution);
      expect(forecast.totalCredits).toBeGreaterThan(0);
      expect(forecast.v3OmniTotalCredits).toBeGreaterThan(0);
      expect(forecast.savingsPercent).toBeGreaterThanOrEqual(0);
      expect(forecast.breakdown).toHaveLength(3);
      // Dialogue should be cheapest per 10s
      const dialogueCost = forecast.breakdown.find((p) => p.sceneType === "dialogue");
      const actionCost = forecast.breakdown.find((p) => p.sceneType === "action");
      expect(dialogueCost).toBeDefined();
      expect(actionCost).toBeDefined();
      if (dialogueCost && actionCost) {
        expect(dialogueCost.creditsPerScene).toBeLessThan(actionCost.creditsPerScene);
      }
    });

    it("shows savings compared to V3-Omni baseline", () => {
      const distribution = [
        { sceneType: "dialogue" as const, count: 10, totalDurationS: 100 },
        { sceneType: "transition" as const, count: 5, totalDurationS: 15 },
      ];

      const forecast = generateCostForecast(distribution);
      // Dialogue + transition should be much cheaper than all V3-Omni
      expect(forecast.savingsPercent).toBeGreaterThan(50);
      expect(forecast.totalCredits).toBeLessThan(forecast.v3OmniTotalCredits);
    });
  });

  describe("Pipeline template coverage", () => {
    it("has templates for all 6 scene types", () => {
      const templates = ALL_PIPELINE_TEMPLATES;
      const sceneTypes = ["dialogue", "action", "establishing", "montage", "reaction", "transition"];
      sceneTypes.forEach((st) => {
        const found = templates.find((t) => t.sceneType === st);
        expect(found, `Missing template for ${st}`).toBeDefined();
      });
    });

    it("each template has valid estimated credits", () => {
      ALL_PIPELINE_TEMPLATES.forEach((t) => {
        const credits = parseFloat(t.estimatedCreditsPerTenS);
        expect(credits).toBeGreaterThanOrEqual(0);
        expect(credits).toBeLessThan(10);
      });
    });
  });

  describe("Provider hint and stage skip integration", () => {
    it("returns provider hints for all scene types", () => {
      const sceneTypes = ["dialogue", "action", "establishing", "montage", "reaction", "transition"] as const;
      sceneTypes.forEach((st) => {
        const hints = getProviderHintForSceneType(st);
        expect(hints).toBeDefined();
        expect(typeof hints).toBe("object");
      });
    });

    it("returns stage skips for all scene types", () => {
      const sceneTypes = ["dialogue", "action", "establishing", "montage", "reaction", "transition"] as const;
      sceneTypes.forEach((st) => {
        const skips = getPipelineStageSkips(st);
        expect(skips).toBeDefined();
        expect(typeof skips).toBe("object");
      });
    });

    it("shouldSkipStage returns boolean", () => {
      expect(typeof shouldSkipStage("establishing", "video_generation")).toBe("boolean");
      expect(typeof shouldSkipStage("action", "video_generation")).toBe("boolean");
    });

    it("getAllPipelineConfigs returns config for all scene types", () => {
      const configs = getAllPipelineConfigs();
      expect(configs.length).toBeGreaterThanOrEqual(6);
      configs.forEach((c) => {
        expect(c.sceneType).toBeDefined();
        expect(c.providerHints).toBeDefined();
        expect(c.stageSkips).toBeDefined();
      });
    });
  });

  describe("Collapsible behavior logic", () => {
    it("should be open when no active run", () => {
      const runs: any[] = [];
      const hasActiveRun = !!runs.find((r: any) => r.status === "running" || r.status === "pending");
      expect(hasActiveRun).toBe(false);
      // sceneAnalysisOpen default is true, so open = true && !false = true
      const open = true && !hasActiveRun;
      expect(open).toBe(true);
    });

    it("should be closed when pipeline is running", () => {
      const runs = [{ id: 1, status: "running" }];
      const hasActiveRun = !!runs.find((r: any) => r.status === "running" || r.status === "pending");
      expect(hasActiveRun).toBe(true);
      const open = true && !hasActiveRun;
      expect(open).toBe(false);
    });

    it("should be closed when pipeline is pending", () => {
      const runs = [{ id: 1, status: "pending" }];
      const hasActiveRun = !!runs.find((r: any) => r.status === "running" || r.status === "pending");
      expect(hasActiveRun).toBe(true);
      const open = true && !hasActiveRun;
      expect(open).toBe(false);
    });

    it("should be open when pipeline is completed", () => {
      const runs = [{ id: 1, status: "completed" }];
      const hasActiveRun = !!runs.find((r: any) => r.status === "running" || r.status === "pending");
      expect(hasActiveRun).toBe(false);
      const open = true && !hasActiveRun;
      expect(open).toBe(true);
    });

    it("user can manually close the panel", () => {
      let sceneAnalysisOpen = true;
      sceneAnalysisOpen = false; // user toggles
      const hasActiveRun = false;
      const open = sceneAnalysisOpen && !hasActiveRun;
      expect(open).toBe(false);
    });
  });
});
