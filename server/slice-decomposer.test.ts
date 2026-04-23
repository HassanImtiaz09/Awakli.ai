/**
 * Slice Decomposer & Classifier — Comprehensive Tests
 *
 * Tests cover:
 *   1. Deterministic panel timing estimation
 *   2. Slice grouping (boundary logic, never split mid-dialogue)
 *   3. Character extraction from panels
 *   4. Dialogue extraction with timing offsets
 *   5. Slice complexity classification (tier assignment, lip sync detection)
 *   6. Tier override with cost recalculation
 *   7. Batch classification and routing summary
 *   8. Full decomposeScript pipeline (deterministic mode)
 *   9. Edge cases (empty panels, single panel, very long panels)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  estimatePanelTimingDeterministic,
  groupPanelsIntoSlices,
  extractSliceCharacters,
  extractSliceDialogue,
  decomposeScript,
  type PanelData,
  type PanelTiming,
} from "./slice-decomposer";
import {
  classifySliceComplexity,
  classifyAllSlices,
  applyTierOverride,
  computeRoutingSavings,
  type SliceClassification,
} from "./slice-classifier";
import type { SliceDefinition } from "./slice-decomposer";

// ─── Test Fixtures ────────────────────────────────────────────────────────

function makePanel(overrides: Partial<PanelData> = {}): PanelData {
  return {
    id: 1,
    sceneNumber: 1,
    panelNumber: 1,
    visualDescription: "A character standing in a room",
    cameraAngle: "medium",
    dialogue: null,
    sfx: null,
    transition: null,
    transitionDuration: null,
    ...overrides,
  };
}

function makeSlice(overrides: Partial<SliceDefinition> = {}): SliceDefinition {
  return {
    sliceNumber: 1,
    sceneId: 1,
    durationSeconds: 10,
    panels: [],
    panelIds: [],
    characters: [],
    dialogue: [],
    actionDescription: "A character standing in a room",
    cameraAngle: "medium",
    mood: "neutral",
    lipSyncRequired: false,
    ...overrides,
  };
}

// ─── 1. Deterministic Panel Timing ────────────────────────────────────────

describe("estimatePanelTimingDeterministic", () => {
  it("estimates dialogue panels based on word count", () => {
    const panel = makePanel({
      dialogue: [{ character: "Akira", text: "Hello, how are you doing today my friend?", emotion: "happy" }],
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.hasDialogue).toBe(true);
    expect(timing.wordCount).toBe(8);
    // 8 words / 2.5 wps = 3.2s + 0.5s pause = 3.7s
    expect(timing.estimatedDurationSeconds).toBeCloseTo(3.7, 1);
    expect(timing.reasoning).toContain("Dialogue");
  });

  it("estimates minimum duration for short dialogue", () => {
    const panel = makePanel({
      dialogue: [{ character: "Akira", text: "Yes", emotion: "neutral" }],
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.estimatedDurationSeconds).toBeGreaterThanOrEqual(2);
  });

  it("estimates action panels correctly", () => {
    const panel = makePanel({
      visualDescription: "Akira launches a powerful attack, explosions everywhere",
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.isActionHeavy).toBe(true);
    expect(timing.estimatedDurationSeconds).toBe(3);
    expect(timing.reasoning).toContain("Action");
  });

  it("estimates establishing shots correctly", () => {
    const panel = makePanel({
      visualDescription: "Wide establishing shot of the city skyline at sunset",
      cameraAngle: "wide",
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.isEstablishing).toBe(true);
    expect(timing.estimatedDurationSeconds).toBe(2.5);
  });

  it("estimates transition panels correctly", () => {
    const panel = makePanel({
      transition: "fade",
      visualDescription: "Fade to black",
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.estimatedDurationSeconds).toBe(1.5);
    expect(timing.reasoning).toContain("Transition");
  });

  it("uses custom transition duration when provided", () => {
    const panel = makePanel({
      transition: "dissolve",
      transitionDuration: 2.5,
      visualDescription: "Dissolve to next scene",
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.estimatedDurationSeconds).toBe(2.5);
  });

  it("defaults to static panel duration for generic panels", () => {
    const panel = makePanel({
      visualDescription: "A quiet room with a desk and chair",
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.estimatedDurationSeconds).toBe(2);
    expect(timing.reasoning).toContain("Static");
  });

  it("handles empty dialogue arrays", () => {
    const panel = makePanel({ dialogue: [] });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.hasDialogue).toBe(false);
    expect(timing.wordCount).toBe(0);
  });

  it("handles dialogue with empty text", () => {
    const panel = makePanel({
      dialogue: [{ character: "Akira", text: "", emotion: "neutral" }],
    });
    const timing = estimatePanelTimingDeterministic(panel);
    expect(timing.hasDialogue).toBe(false);
  });
});

// ─── 2. Slice Grouping ──────────────────────────────────────────────────

describe("groupPanelsIntoSlices", () => {
  it("groups panels into ~10-second slices", () => {
    // 5 panels at 2s each = 10s → should be 1 slice
    const panels = Array.from({ length: 5 }, (_, i) => makePanel({ id: i + 1, panelNumber: i + 1 }));
    const timings: PanelTiming[] = panels.map(p => ({
      panelId: p.id,
      estimatedDurationSeconds: 2,
      wordCount: 0,
      hasDialogue: false,
      isActionHeavy: false,
      isEstablishing: false,
      reasoning: "test",
    }));

    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBe(1);
    expect(slices[0].durationSeconds).toBe(10);
    expect(slices[0].panelIds).toHaveLength(5);
  });

  it("splits at scene boundaries when near target duration", () => {
    const panels = [
      makePanel({ id: 1, sceneNumber: 1, panelNumber: 1 }),
      makePanel({ id: 2, sceneNumber: 1, panelNumber: 2 }),
      makePanel({ id: 3, sceneNumber: 1, panelNumber: 3 }),
      makePanel({ id: 4, sceneNumber: 2, panelNumber: 1 }),  // Scene boundary
      makePanel({ id: 5, sceneNumber: 2, panelNumber: 2 }),
    ];
    const timings: PanelTiming[] = panels.map(p => ({
      panelId: p.id,
      estimatedDurationSeconds: 3,  // 3s each → 9s for scene 1, 6s for scene 2
      wordCount: 0,
      hasDialogue: false,
      isActionHeavy: false,
      isEstablishing: false,
      reasoning: "test",
    }));

    const slices = groupPanelsIntoSlices(panels, timings);
    // Should split at scene boundary: [1,2,3] (9s) and [4,5] (6s)
    expect(slices.length).toBe(2);
    expect(slices[0].panelIds).toEqual([1, 2, 3]);
    expect(slices[1].panelIds).toEqual([4, 5]);
  });

  it("never splits mid-dialogue within the same scene", () => {
    const panels = [
      makePanel({ id: 1, sceneNumber: 1, dialogue: [{ character: "A", text: "Hello there", emotion: "happy" }] }),
      makePanel({ id: 2, sceneNumber: 1, dialogue: [{ character: "B", text: "Hi, how are you?", emotion: "happy" }] }),
      makePanel({ id: 3, sceneNumber: 1, dialogue: [{ character: "A", text: "I am fine thanks", emotion: "neutral" }] }),
      makePanel({ id: 4, sceneNumber: 1, visualDescription: "Wide shot of the park" }),
    ];
    const timings: PanelTiming[] = [
      { panelId: 1, estimatedDurationSeconds: 3, wordCount: 2, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" },
      { panelId: 2, estimatedDurationSeconds: 4, wordCount: 4, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" },
      { panelId: 3, estimatedDurationSeconds: 4, wordCount: 5, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" },
      { panelId: 4, estimatedDurationSeconds: 2, wordCount: 0, hasDialogue: false, isActionHeavy: false, isEstablishing: false, reasoning: "test" },
    ];

    const slices = groupPanelsIntoSlices(panels, timings);
    // Total: 13s. Dialogue panels 1-3 should stay together (11s), panel 4 separate or with them
    // Since 11s < 15s (MAX), all dialogue panels should be in one slice
    expect(slices.length).toBeGreaterThanOrEqual(1);
    // Verify no slice splits between dialogue panels 1 and 3
    const firstSlice = slices[0];
    expect(firstSlice.panelIds).toContain(1);
    expect(firstSlice.panelIds).toContain(2);
    expect(firstSlice.panelIds).toContain(3);
  });

  it("handles empty panel array", () => {
    const slices = groupPanelsIntoSlices([], []);
    expect(slices).toEqual([]);
  });

  it("handles single panel", () => {
    const panels = [makePanel({ id: 1 })];
    const timings: PanelTiming[] = [{
      panelId: 1,
      estimatedDurationSeconds: 3,
      wordCount: 0,
      hasDialogue: false,
      isActionHeavy: false,
      isEstablishing: false,
      reasoning: "test",
    }];

    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBe(1);
    expect(slices[0].panelIds).toEqual([1]);
  });

  it("respects MAX_SLICE_DURATION (15s)", () => {
    // 4 panels at 5s each = 20s → should split
    const panels = Array.from({ length: 4 }, (_, i) => makePanel({ id: i + 1, panelNumber: i + 1 }));
    const timings: PanelTiming[] = panels.map(p => ({
      panelId: p.id,
      estimatedDurationSeconds: 5,
      wordCount: 0,
      hasDialogue: false,
      isActionHeavy: false,
      isEstablishing: false,
      reasoning: "test",
    }));

    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBeGreaterThanOrEqual(2);
    // No slice should exceed 15s
    for (const slice of slices) {
      expect(slice.durationSeconds).toBeLessThanOrEqual(15);
    }
  });
});

// ─── 3. Character Extraction ──────────────────────────────────────────────

describe("extractSliceCharacters", () => {
  it("extracts unique characters from dialogue", () => {
    const panels = [
      makePanel({ dialogue: [{ character: "Akira", text: "Hello", emotion: "happy" }] }),
      makePanel({ dialogue: [{ character: "Yuki", text: "Hi", emotion: "happy" }, { character: "Akira", text: "Again", emotion: "neutral" }] }),
    ];
    const characters = extractSliceCharacters(panels);
    expect(characters).toHaveLength(2);
    expect(characters.map(c => c.name)).toContain("Akira");
    expect(characters.map(c => c.name)).toContain("Yuki");
  });

  it("excludes narrator and unknown characters", () => {
    const panels = [
      makePanel({ dialogue: [{ character: "Narrator", text: "Once upon a time", emotion: "neutral" }] }),
      makePanel({ dialogue: [{ character: "?", text: "Unknown voice", emotion: "neutral" }] }),
      makePanel({ dialogue: [{ character: "Akira", text: "Hello", emotion: "happy" }] }),
    ];
    const characters = extractSliceCharacters(panels);
    expect(characters).toHaveLength(1);
    expect(characters[0].name).toBe("Akira");
  });

  it("handles panels with no dialogue", () => {
    const panels = [makePanel(), makePanel()];
    const characters = extractSliceCharacters(panels);
    expect(characters).toHaveLength(0);
  });

  it("deduplicates case-insensitively", () => {
    const panels = [
      makePanel({ dialogue: [{ character: "akira", text: "Hello", emotion: "happy" }] }),
      makePanel({ dialogue: [{ character: "Akira", text: "Again", emotion: "neutral" }] }),
    ];
    const characters = extractSliceCharacters(panels);
    expect(characters).toHaveLength(1);
  });
});

// ─── 4. Dialogue Extraction ──────────────────────────────────────────────

describe("extractSliceDialogue", () => {
  it("extracts dialogue with timing offsets", () => {
    const panels = [
      makePanel({ id: 1, dialogue: [{ character: "Akira", text: "Hello there friend", emotion: "happy" }] }),
      makePanel({ id: 2, dialogue: [{ character: "Yuki", text: "Hi", emotion: "neutral" }] }),
    ];
    const timingMap = new Map<number, PanelTiming>([
      [1, { panelId: 1, estimatedDurationSeconds: 3, wordCount: 3, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" }],
      [2, { panelId: 2, estimatedDurationSeconds: 2, wordCount: 1, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" }],
    ]);

    const dialogue = extractSliceDialogue(panels, timingMap);
    expect(dialogue).toHaveLength(2);
    expect(dialogue[0].character).toBe("Akira");
    expect(dialogue[0].startOffset).toBe(0);
    expect(dialogue[0].endOffset).toBeGreaterThan(0);
    expect(dialogue[1].character).toBe("Yuki");
    expect(dialogue[1].startOffset).toBe(3);  // After first panel's 3s duration
  });

  it("handles panels with no dialogue", () => {
    const panels = [makePanel({ id: 1 })];
    const timingMap = new Map<number, PanelTiming>([
      [1, { panelId: 1, estimatedDurationSeconds: 2, wordCount: 0, hasDialogue: false, isActionHeavy: false, isEstablishing: false, reasoning: "test" }],
    ]);

    const dialogue = extractSliceDialogue(panels, timingMap);
    expect(dialogue).toHaveLength(0);
  });

  it("distributes multiple dialogue lines within a panel", () => {
    const panels = [
      makePanel({
        id: 1,
        dialogue: [
          { character: "Akira", text: "Hello", emotion: "happy" },
          { character: "Yuki", text: "Hi there", emotion: "neutral" },
        ],
      }),
    ];
    const timingMap = new Map<number, PanelTiming>([
      [1, { panelId: 1, estimatedDurationSeconds: 4, wordCount: 3, hasDialogue: true, isActionHeavy: false, isEstablishing: false, reasoning: "test" }],
    ]);

    const dialogue = extractSliceDialogue(panels, timingMap);
    expect(dialogue).toHaveLength(2);
    expect(dialogue[0].startOffset).toBe(0);
    expect(dialogue[1].startOffset).toBe(2);  // 4s / 2 lines = 2s interval
  });
});

// ─── 5. Slice Complexity Classification ──────────────────────────────────

describe("classifySliceComplexity", () => {
  it("assigns Tier 1 for dialogue with close-up", () => {
    const slice = makeSlice({
      cameraAngle: "close-up",
      dialogue: [{ character: "Akira", text: "Hello", emotion: "happy", startOffset: 0, endOffset: 1 }],
      lipSyncRequired: true,
      characters: [{ name: "Akira" }],
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(1);
    expect(result.lipSyncRequired).toBe(true);
    expect(result.mode).toBe("professional");
    expect(result.reasoning).toContain("lip sync");
  });

  it("assigns Tier 1 for dialogue with medium shot", () => {
    const slice = makeSlice({
      cameraAngle: "medium",
      dialogue: [{ character: "Akira", text: "Hello", emotion: "happy", startOffset: 0, endOffset: 1 }],
      lipSyncRequired: true,
      characters: [{ name: "Akira" }],
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(1);
    expect(result.mode).toBe("professional");
  });

  it("assigns Tier 2 for dialogue with wide shot (face too small)", () => {
    const slice = makeSlice({
      cameraAngle: "wide",
      dialogue: [{ character: "Akira", text: "Hello", emotion: "happy", startOffset: 0, endOffset: 1 }],
      lipSyncRequired: true,
      characters: [{ name: "Akira" }],
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(2);
    expect(result.lipSyncRequired).toBe(false);
    expect(result.reasoning).toContain("wide shot");
  });

  it("assigns Tier 2 Professional for multi-character action", () => {
    const slice = makeSlice({
      actionDescription: "Two warriors clash swords in an intense battle",
      characters: [{ name: "Akira" }, { name: "Yuki" }],
      cameraAngle: "medium",
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(2);
    expect(result.mode).toBe("professional");
    expect(result.reasoning).toContain("Multi-character action");
  });

  it("assigns Tier 2 Standard for single-character action", () => {
    const slice = makeSlice({
      actionDescription: "Akira runs through the forest dodging obstacles",
      characters: [{ name: "Akira" }],
      cameraAngle: "medium",
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(2);
    expect(result.mode).toBe("standard");
  });

  it("assigns Tier 3 for establishing/wide shots", () => {
    const slice = makeSlice({
      actionDescription: "Panoramic view of the city at dawn",
      cameraAngle: "wide",
      characters: [],
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(3);
    expect(result.mode).toBe("standard");
  });

  it("assigns Tier 4 for transitions", () => {
    const slice = makeSlice({
      actionDescription: "Fade to black. Title card appears.",
      cameraAngle: "medium",
      characters: [],
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(4);
    expect(result.mode).toBe("standard");
    expect(result.reasoning).toContain("Transition");
  });

  it("calculates cost correctly", () => {
    const slice = makeSlice({ durationSeconds: 10 });
    const result = classifySliceComplexity(slice);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.estimatedCredits).toBeGreaterThan(0);
    // Credits should be roughly proportional to USD cost (within 10%)
    const ratio = result.estimatedCredits / result.estimatedCostUsd;
    expect(ratio).toBeGreaterThan(80);
    expect(ratio).toBeLessThan(120);
  });

  it("all classifications are deterministic", () => {
    const slice = makeSlice();
    const result = classifySliceComplexity(slice);
    expect(result.deterministic).toBe(true);
  });
});

// ─── 6. Tier Override ────────────────────────────────────────────────────

describe("applyTierOverride", () => {
  it("recalculates cost when upgrading tier", () => {
    const slice = makeSlice({ durationSeconds: 10 });
    const original = classifySliceComplexity(slice);
    const overridden = applyTierOverride(slice, original, 1);

    expect(overridden.tier).toBe(1);
    expect(overridden.estimatedCostUsd).toBeGreaterThanOrEqual(original.estimatedCostUsd);
  });

  it("warns when downgrading a lip-sync scene", () => {
    const slice = makeSlice({
      cameraAngle: "close-up",
      dialogue: [{ character: "Akira", text: "Hello", emotion: "happy", startOffset: 0, endOffset: 1 }],
      lipSyncRequired: true,
      characters: [{ name: "Akira" }],
    });
    const original = classifySliceComplexity(slice);
    expect(original.tier).toBe(1);

    const overridden = applyTierOverride(slice, original, 3);
    expect(overridden.tier).toBe(3);
    expect(overridden.reasoning).toContain("WARNING");
  });
});

// ─── 7. Batch Classification & Routing Summary ──────────────────────────

describe("classifyAllSlices", () => {
  it("produces correct tier distribution", () => {
    const slices = [
      makeSlice({ sliceNumber: 1, cameraAngle: "close-up", lipSyncRequired: true, dialogue: [{ character: "A", text: "Hi", emotion: "happy", startOffset: 0, endOffset: 1 }], characters: [{ name: "A" }] }),
      makeSlice({ sliceNumber: 2, actionDescription: "Explosion and battle scene", characters: [{ name: "A" }, { name: "B" }] }),
      makeSlice({ sliceNumber: 3, cameraAngle: "wide", actionDescription: "Panoramic city view" }),
      makeSlice({ sliceNumber: 4, actionDescription: "Fade to black. Title card." }),
    ];

    const { classifications, summary } = classifyAllSlices(slices);
    expect(classifications).toHaveLength(4);
    expect(summary.totalSlices).toBe(4);
    expect(summary.tierDistribution[1]).toBe(1);  // dialogue close-up
    expect(summary.tierDistribution[2]).toBe(1);  // multi-char action
    expect(summary.tierDistribution[3]).toBe(1);  // wide shot
    expect(summary.tierDistribution[4]).toBe(1);  // transition
  });

  it("calculates savings vs all-V3-Omni baseline", () => {
    const slices = [
      makeSlice({ sliceNumber: 1, durationSeconds: 10, actionDescription: "Fade to black. Title card." }),
      makeSlice({ sliceNumber: 2, durationSeconds: 10, cameraAngle: "wide", actionDescription: "Panoramic view" }),
    ];

    const { summary } = classifyAllSlices(slices);
    expect(summary.savingsUsd).toBeGreaterThan(0);
    expect(summary.savingsPercent).toBeGreaterThan(0);
    expect(summary.costIfAllV3OmniPro).toBeGreaterThan(summary.totalEstimatedCostUsd);
  });
});

// ─── 8. Routing Savings Computation ──────────────────────────────────────

describe("computeRoutingSavings", () => {
  it("returns cheaper when downgrading tier", () => {
    const slice = makeSlice({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 1, 4);
    expect(savings.direction).toBe("cheaper");
    expect(savings.costDeltaUsd).toBeLessThan(0);
  });

  it("returns more_expensive when upgrading tier", () => {
    const slice = makeSlice({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 4, 1);
    expect(savings.direction).toBe("more_expensive");
    expect(savings.costDeltaUsd).toBeGreaterThan(0);
  });

  it("returns same when tier unchanged", () => {
    const slice = makeSlice({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 2, 2);
    expect(savings.direction).toBe("same");
    expect(savings.costDeltaUsd).toBe(0);
  });
});

// ─── 9. Full Pipeline (Deterministic Mode) ──────────────────────────────

describe("decomposeScript (deterministic)", () => {
  it("decomposes a simple episode into slices", async () => {
    const panels: PanelData[] = [
      makePanel({ id: 1, sceneNumber: 1, panelNumber: 1, visualDescription: "Establishing shot of the city skyline", cameraAngle: "wide" }),
      makePanel({ id: 2, sceneNumber: 1, panelNumber: 2, dialogue: [{ character: "Akira", text: "This city never sleeps. Every night, the neon lights paint stories on the walls.", emotion: "contemplative" }], cameraAngle: "medium" }),
      makePanel({ id: 3, sceneNumber: 1, panelNumber: 3, dialogue: [{ character: "Yuki", text: "You always say that. But tonight feels different, doesn't it?", emotion: "curious" }], cameraAngle: "close-up" }),
      makePanel({ id: 4, sceneNumber: 2, panelNumber: 1, visualDescription: "Wide shot of a dark alley with rain", cameraAngle: "wide" }),
      makePanel({ id: 5, sceneNumber: 2, panelNumber: 2, visualDescription: "Akira draws his sword, ready for battle", cameraAngle: "medium" }),
      makePanel({ id: 6, sceneNumber: 2, panelNumber: 3, visualDescription: "Intense fight scene with explosions and clash of swords", cameraAngle: "medium" }),
      makePanel({ id: 7, sceneNumber: 3, panelNumber: 1, transition: "fade", visualDescription: "Fade to black" }),
    ];

    const result = await decomposeScript(panels, false);

    expect(result.slices.length).toBeGreaterThanOrEqual(1);
    expect(result.totalPanels).toBe(7);
    expect(result.totalDurationSeconds).toBeGreaterThan(0);
    expect(result.timingMethod).toBe("deterministic");
    expect(result.panelTimings).toHaveLength(7);

    // Verify all panels are accounted for
    const allPanelIds = result.slices.flatMap(s => s.panelIds);
    expect(allPanelIds).toHaveLength(7);
    expect(new Set(allPanelIds).size).toBe(7);

    // Verify slice numbering is sequential
    for (let i = 0; i < result.slices.length; i++) {
      expect(result.slices[i].sliceNumber).toBe(i + 1);
    }
  });

  it("handles empty panel array", async () => {
    const result = await decomposeScript([], false);
    expect(result.slices).toEqual([]);
    expect(result.totalDurationSeconds).toBe(0);
    expect(result.totalPanels).toBe(0);
  });

  it("handles single panel", async () => {
    const panels = [makePanel({ id: 1 })];
    const result = await decomposeScript(panels, false);
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].panelIds).toEqual([1]);
  });

  it("correctly extracts characters across slices", async () => {
    const panels: PanelData[] = [
      makePanel({ id: 1, dialogue: [{ character: "Akira", text: "Hello", emotion: "happy" }] }),
      makePanel({ id: 2, dialogue: [{ character: "Yuki", text: "Hi there", emotion: "neutral" }] }),
      makePanel({ id: 3, dialogue: [{ character: "Akira", text: "Let us go", emotion: "determined" }] }),
    ];

    const result = await decomposeScript(panels, false);
    // All panels should be in one slice (total ~6-7s)
    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].characters).toHaveLength(2);
    expect(result.slices[0].characters.map(c => c.name)).toContain("Akira");
    expect(result.slices[0].characters.map(c => c.name)).toContain("Yuki");
  });

  it("marks lip sync required when dialogue is present", async () => {
    const panels: PanelData[] = [
      makePanel({ id: 1, dialogue: [{ character: "Akira", text: "Hello", emotion: "happy" }] }),
      makePanel({ id: 2, visualDescription: "Wide shot of mountains" }),
    ];

    const result = await decomposeScript(panels, false);
    // First slice should have lip sync required
    const sliceWithDialogue = result.slices.find(s => s.dialogue.length > 0);
    expect(sliceWithDialogue?.lipSyncRequired).toBe(true);
  });
});

// ─── 10. Module Exports ──────────────────────────────────────────────────

describe("Module exports", () => {
  it("exports all required functions from slice-decomposer", () => {
    expect(typeof estimatePanelTimingDeterministic).toBe("function");
    expect(typeof groupPanelsIntoSlices).toBe("function");
    expect(typeof extractSliceCharacters).toBe("function");
    expect(typeof extractSliceDialogue).toBe("function");
    expect(typeof decomposeScript).toBe("function");
  });

  it("exports all required functions from slice-classifier", () => {
    expect(typeof classifySliceComplexity).toBe("function");
    expect(typeof classifyAllSlices).toBe("function");
    expect(typeof applyTierOverride).toBe("function");
    expect(typeof computeRoutingSavings).toBe("function");
  });
});
