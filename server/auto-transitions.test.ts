/**
 * Tests for Scene-Aware Auto-Transitions
 *
 * Covers:
 * - Scene boundary detection (different sceneNumber → fade)
 * - Within-scene transitions (same sceneNumber → cross-dissolve)
 * - Last panel always gets cut
 * - Edge cases: empty, single panel, all same scene, all different scenes
 * - Summary counts accuracy
 * - tRPC endpoint registration
 */

import { describe, it, expect } from "vitest";
import {
  computeAutoTransitions,
  AUTO_TRANSITION_DEFAULTS,
  type PanelForAutoTransition,
} from "./auto-transitions";

// ─── computeAutoTransitions ────────────────────────────────────────────

describe("computeAutoTransitions", () => {
  it("returns empty summary for no panels", () => {
    const result = computeAutoTransitions([]);
    expect(result.totalPanels).toBe(0);
    expect(result.sceneBoundaries).toBe(0);
    expect(result.withinScene).toBe(0);
    expect(result.lastPanel).toBe(0);
    expect(result.assignments).toHaveLength(0);
  });

  it("assigns cut to a single panel (last panel rule)", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.totalPanels).toBe(1);
    expect(result.lastPanel).toBe(1);
    expect(result.sceneBoundaries).toBe(0);
    expect(result.withinScene).toBe(0);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({
      panelId: 1,
      transition: "cut",
      reason: "last_panel",
    });
  });

  it("assigns cross-dissolve within the same scene", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
      { id: 2, panelNumber: 2, sceneNumber: 1 },
      { id: 3, panelNumber: 3, sceneNumber: 1 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.totalPanels).toBe(3);
    expect(result.withinScene).toBe(2);
    expect(result.sceneBoundaries).toBe(0);
    expect(result.lastPanel).toBe(1);

    // First two panels → cross-dissolve (within scene)
    expect(result.assignments[0]).toMatchObject({
      panelId: 1,
      transition: "cross-dissolve",
      transitionDuration: AUTO_TRANSITION_DEFAULTS.withinScene.duration,
      reason: "within_scene",
    });
    expect(result.assignments[1]).toMatchObject({
      panelId: 2,
      transition: "cross-dissolve",
      reason: "within_scene",
    });
    // Last panel → cut
    expect(result.assignments[2]).toMatchObject({
      panelId: 3,
      transition: "cut",
      reason: "last_panel",
    });
  });

  it("assigns fade at scene boundaries", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
      { id: 2, panelNumber: 2, sceneNumber: 2 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.sceneBoundaries).toBe(1);
    expect(result.withinScene).toBe(0);

    expect(result.assignments[0]).toMatchObject({
      panelId: 1,
      transition: "fade",
      transitionDuration: AUTO_TRANSITION_DEFAULTS.sceneBoundary.duration,
      reason: "scene_boundary",
    });
    expect(result.assignments[1]).toMatchObject({
      panelId: 2,
      transition: "cut",
      reason: "last_panel",
    });
  });

  it("handles mixed scenes correctly", () => {
    // Scene 1: panels 1,2,3 | Scene 2: panels 4,5 | Scene 3: panel 6
    const panels: PanelForAutoTransition[] = [
      { id: 10, panelNumber: 1, sceneNumber: 1 },
      { id: 20, panelNumber: 2, sceneNumber: 1 },
      { id: 30, panelNumber: 3, sceneNumber: 1 },
      { id: 40, panelNumber: 4, sceneNumber: 2 },
      { id: 50, panelNumber: 5, sceneNumber: 2 },
      { id: 60, panelNumber: 6, sceneNumber: 3 },
    ];
    const result = computeAutoTransitions(panels);

    expect(result.totalPanels).toBe(6);
    expect(result.sceneBoundaries).toBe(2);  // 1→2 and 2→3
    expect(result.withinScene).toBe(3);       // P1→P2, P2→P3 in scene 1, P4→P5 in scene 2
    expect(result.lastPanel).toBe(1);

    // P1 → P2: same scene → cross-dissolve
    expect(result.assignments[0]).toMatchObject({
      panelId: 10,
      transition: "cross-dissolve",
      reason: "within_scene",
    });
    // P2 → P3: same scene → cross-dissolve
    expect(result.assignments[1]).toMatchObject({
      panelId: 20,
      transition: "cross-dissolve",
      reason: "within_scene",
    });
    // P3 → P4: scene boundary → fade
    expect(result.assignments[2]).toMatchObject({
      panelId: 30,
      transition: "fade",
      reason: "scene_boundary",
    });
    // P4 → P5: same scene → cross-dissolve
    expect(result.assignments[3]).toMatchObject({
      panelId: 40,
      transition: "cross-dissolve",
      reason: "within_scene",
    });
    // P5 → P6: scene boundary → fade
    expect(result.assignments[4]).toMatchObject({
      panelId: 50,
      transition: "fade",
      reason: "scene_boundary",
    });
    // P6: last panel → cut
    expect(result.assignments[5]).toMatchObject({
      panelId: 60,
      transition: "cut",
      reason: "last_panel",
    });
  });

  it("handles all different scenes (every transition is a boundary)", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
      { id: 2, panelNumber: 2, sceneNumber: 2 },
      { id: 3, panelNumber: 3, sceneNumber: 3 },
      { id: 4, panelNumber: 4, sceneNumber: 4 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.sceneBoundaries).toBe(3);
    expect(result.withinScene).toBe(0);
    expect(result.lastPanel).toBe(1);

    // All non-last panels should be fade
    for (let i = 0; i < 3; i++) {
      expect(result.assignments[i].transition).toBe("fade");
      expect(result.assignments[i].reason).toBe("scene_boundary");
    }
    expect(result.assignments[3].transition).toBe("cut");
  });

  it("uses correct default durations", () => {
    expect(AUTO_TRANSITION_DEFAULTS.sceneBoundary.transition).toBe("fade");
    expect(AUTO_TRANSITION_DEFAULTS.sceneBoundary.duration).toBe(0.8);
    expect(AUTO_TRANSITION_DEFAULTS.withinScene.transition).toBe("cross-dissolve");
    expect(AUTO_TRANSITION_DEFAULTS.withinScene.duration).toBe(0.5);
  });

  it("preserves panel metadata in assignments", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 42, panelNumber: 7, sceneNumber: 3 },
      { id: 43, panelNumber: 8, sceneNumber: 3 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.assignments[0].panelId).toBe(42);
    expect(result.assignments[0].panelNumber).toBe(7);
    expect(result.assignments[0].sceneNumber).toBe(3);
    expect(result.assignments[1].panelId).toBe(43);
    expect(result.assignments[1].panelNumber).toBe(8);
  });

  it("summary counts add up correctly", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
      { id: 2, panelNumber: 2, sceneNumber: 1 },
      { id: 3, panelNumber: 3, sceneNumber: 2 },
      { id: 4, panelNumber: 4, sceneNumber: 2 },
      { id: 5, panelNumber: 5, sceneNumber: 3 },
    ];
    const result = computeAutoTransitions(panels);
    // sceneBoundaries + withinScene + lastPanel should equal totalPanels
    expect(result.sceneBoundaries + result.withinScene + result.lastPanel).toBe(result.totalPanels);
  });

  it("handles two panels in the same scene", () => {
    const panels: PanelForAutoTransition[] = [
      { id: 1, panelNumber: 1, sceneNumber: 1 },
      { id: 2, panelNumber: 2, sceneNumber: 1 },
    ];
    const result = computeAutoTransitions(panels);
    expect(result.withinScene).toBe(1);
    expect(result.sceneBoundaries).toBe(0);
    expect(result.assignments[0].transition).toBe("cross-dissolve");
    expect(result.assignments[1].transition).toBe("cut");
  });

  it("handles many panels across many scenes (stress test)", () => {
    // 20 panels across 5 scenes (4 panels each)
    const panels: PanelForAutoTransition[] = [];
    for (let s = 1; s <= 5; s++) {
      for (let p = 1; p <= 4; p++) {
        const num = (s - 1) * 4 + p;
        panels.push({ id: num, panelNumber: num, sceneNumber: s });
      }
    }
    const result = computeAutoTransitions(panels);
    expect(result.totalPanels).toBe(20);
    expect(result.sceneBoundaries).toBe(4);  // 4 boundaries between 5 scenes
    expect(result.withinScene).toBe(15);      // 3 within-scene per scene × 5 scenes = 15
    expect(result.lastPanel).toBe(1);
    expect(result.assignments).toHaveLength(20);
  });
});

// ─── tRPC endpoint registration ────────────────────────────────────────

describe("Auto-transition tRPC endpoints", () => {
  it("transitionsRouter has autoAssign and autoAssignPreview procedures", async () => {
    const { transitionsRouter } = await import("./routers-transitions");
    const procedures = Object.keys((transitionsRouter as any)._def.procedures);
    expect(procedures).toContain("autoAssign");
    expect(procedures).toContain("autoAssignPreview");
  });

  it("autoAssign and autoAssignPreview are registered in main appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys((appRouter as any)._def.procedures);
    expect(procedures).toContain("transitions.autoAssign");
    expect(procedures).toContain("transitions.autoAssignPreview");
  });
});
