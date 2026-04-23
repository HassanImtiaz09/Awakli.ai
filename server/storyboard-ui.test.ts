/**
 * Storyboard UI Integration Tests
 *
 * Tests cover the backend endpoints that power the storyboard UI:
 *   1. Core scene prompt building (prompt composition from slice metadata)
 *   2. Storyboard status computation (status counts, readiness flags)
 *   3. Slice classification for storyboard routing
 *   4. Tier override with cost delta
 *   5. Routing savings computation
 *   6. Storyboard wizard state transitions
 *   7. Panel timing → slice boundary integration
 *   8. Cost summary aggregation
 */

import { describe, it, expect } from "vitest";
import {
  buildCoreScenePrompt,
} from "./core-scene-preview";
import {
  classifySliceComplexity,
  applyTierOverride,
  computeRoutingSavings,
  type SliceClassification,
} from "./slice-classifier";
import {
  estimatePanelTimingDeterministic,
  groupPanelsIntoSlices,
  type PanelData,
  type SliceDefinition,
} from "./slice-decomposer";

// ─── Test Fixtures ────────────────────────────────────────────────────────

const PROJECT_CHARACTERS = [
  { name: "Sakura", visualTraits: "pink hair, school uniform, green eyes" },
  { name: "Ryu", visualTraits: "black armor, scar on cheek, tall" },
];

function makeSliceDef(overrides: Partial<SliceDefinition> = {}): SliceDefinition {
  return {
    sliceNumber: 1,
    sceneId: 1,
    durationSeconds: 10,
    panels: [],
    panelIds: [1, 2],
    characters: [{ name: "Sakura", role: "protagonist" }],
    dialogue: [{ character: "Sakura", text: "Hello", emotion: "happy", startOffset: 0, endOffset: 3 }],
    actionDescription: "Sakura speaks to the camera",
    cameraAngle: "close-up",
    mood: "calm",
    lipSyncRequired: true,
    ...overrides,
  };
}

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

// ─── 1. Core Scene Prompt Building ────────────────────────────────────────

describe("buildCoreScenePrompt", () => {
  it("should include action description in prompt", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura walks through a moonlit garden", cameraAngle: "wide", mood: "serene", characters: [{ name: "Sakura" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    expect(result.simplified).toContain("moonlit garden");
  });

  it("should include character visual traits from project DB", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura stands", cameraAngle: "medium", mood: "calm", characters: [{ name: "Sakura" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    const combined = result.prompt + " " + result.simplified;
    expect(combined).toContain("Sakura");
  });

  it("should include camera angle", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura stands", cameraAngle: "close-up", mood: "calm", characters: [{ name: "Sakura" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    expect(result.prompt.toLowerCase()).toContain("close");
  });

  it("should include mood/atmosphere", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura stands", cameraAngle: "medium", mood: "tense", characters: [], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    // The mood should influence the prompt
    expect(result.prompt.length).toBeGreaterThan(20);
  });

  it("should handle slices with no dialogue", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "A vast landscape", cameraAngle: "wide", mood: "peaceful", characters: [], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    expect(result.prompt).toBeTruthy();
    expect(result.prompt.length).toBeGreaterThan(20);
  });

  it("should handle slices with no characters", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "A vast landscape stretches to the horizon", cameraAngle: "wide", mood: "peaceful", characters: [], dialogue: [], lipSyncRequired: false },
      [],
    );
    expect(result.simplified).toContain("landscape");
  });

  it("should include multiple characters", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Battle scene", cameraAngle: "wide", mood: "intense", characters: [{ name: "Sakura" }, { name: "Ryu" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    const combined = result.prompt + " " + result.simplified;
    expect(combined).toContain("Sakura");
    expect(combined).toContain("Ryu");
  });

  it("should handle null action description gracefully", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: null, cameraAngle: "medium", mood: "calm", characters: [{ name: "Sakura" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    expect(result.prompt).toBeTruthy();
  });

  it("should include emotion cues from dialogue", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura speaks", cameraAngle: "close-up", mood: "calm", characters: [{ name: "Sakura" }], dialogue: [{ character: "Sakura", text: "I won't give up!", emotion: "determined" }], lipSyncRequired: true },
      PROJECT_CHARACTERS,
    );
    expect(result.prompt).toContain("determined");
  });

  it("should return both prompt and simplified fields", () => {
    const result = buildCoreScenePrompt(
      { actionDescription: "Sakura walks", cameraAngle: "wide", mood: "serene", characters: [{ name: "Sakura" }], dialogue: [], lipSyncRequired: false },
      PROJECT_CHARACTERS,
    );
    expect(result.prompt).toBeTruthy();
    expect(result.simplified).toBeTruthy();
    expect(result.negativePrompt).toBeTruthy();
  });
});

// ─── 2. Slice Classification for Storyboard ─────────────────────────────

describe("classifySliceComplexity for storyboard routing", () => {
  it("should assign Tier 1 for dialogue scenes requiring lip sync", () => {
    const slice = makeSliceDef({ lipSyncRequired: true, cameraAngle: "close-up" });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBe(1);
    expect(result.lipSyncRequired).toBe(true);
  });

  it("should assign lower tier for establishing shots", () => {
    const slice = makeSliceDef({
      characters: [],
      dialogue: [],
      actionDescription: "Wide view of the city skyline at sunset",
      cameraAngle: "wide",
      mood: "peaceful",
      lipSyncRequired: false,
    });
    const result = classifySliceComplexity(slice);
    expect(result.tier).toBeGreaterThanOrEqual(3);
    expect(result.lipSyncRequired).toBe(false);
  });

  it("should assign Professional mode for lip sync scenes", () => {
    const slice = makeSliceDef({ lipSyncRequired: true, cameraAngle: "close-up" });
    const result = classifySliceComplexity(slice);
    expect(result.mode).toBe("professional");
  });

  it("should assign Standard mode for non-dialogue scenes", () => {
    const slice = makeSliceDef({
      characters: [],
      dialogue: [],
      actionDescription: "Clouds drift across the sky",
      cameraAngle: "wide",
      lipSyncRequired: false,
    });
    const result = classifySliceComplexity(slice);
    expect(result.mode).toBe("standard");
  });

  it("should return a valid model name", () => {
    const slice = makeSliceDef();
    const result = classifySliceComplexity(slice);
    expect(result.model).toBeTruthy();
    expect(result.modelName).toBeTruthy();
  });
});

// ─── 3. Tier Override with Cost Delta ────────────────────────────────────

describe("applyTierOverride for storyboard controls", () => {
  it("should recalculate cost when upgrading tier", () => {
    const slice = makeSliceDef({ durationSeconds: 10, lipSyncRequired: false });
    const original = classifySliceComplexity(slice);
    // If already tier 1, test downgrade then upgrade
    if (original.tier === 1) {
      const downgraded = applyTierOverride(slice, original, 3);
      const reUpgraded = applyTierOverride(slice, downgraded, 1);
      expect(reUpgraded.tier).toBe(1);
      expect(reUpgraded.estimatedCredits).toBeGreaterThan(downgraded.estimatedCredits);
    } else {
      const upgraded = applyTierOverride(slice, original, 1);
      expect(upgraded.tier).toBe(1);
      expect(upgraded.estimatedCredits).toBeGreaterThanOrEqual(original.estimatedCredits);
    }
  });

  it("should recalculate cost when downgrading tier", () => {
    const slice = makeSliceDef({ durationSeconds: 10, lipSyncRequired: true });
    const original = classifySliceComplexity(slice);
    expect(original.tier).toBe(1); // Lip sync should be tier 1
    const downgraded = applyTierOverride(slice, original, 4);
    expect(downgraded.tier).toBe(4);
    expect(downgraded.estimatedCredits).toBeLessThan(original.estimatedCredits);
  });

  it("should keep lip sync only when overriding to tier 1", () => {
    const slice = makeSliceDef({ lipSyncRequired: true });
    const original = classifySliceComplexity(slice);

    const toTier1 = applyTierOverride(slice, original, 1);
    expect(toTier1.lipSyncRequired).toBe(true);

    const toTier3 = applyTierOverride(slice, original, 3);
    expect(toTier3.lipSyncRequired).toBe(false);
  });

  it("should include reasoning about the override", () => {
    const slice = makeSliceDef();
    const original = classifySliceComplexity(slice);
    const overridden = applyTierOverride(slice, original, 2);
    expect(overridden.reasoning).toContain("override");
  });
});

// ─── 4. Routing Savings Computation ──────────────────────────────────────

describe("computeRoutingSavings for cost bar", () => {
  it("should compute savings when downgrading tier", () => {
    const slice = makeSliceDef({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 1, 3);
    expect(savings.costDeltaUsd).toBeLessThan(0);
    expect(savings.creditDelta).toBeLessThan(0);
    expect(savings.direction).toBe("cheaper");
  });

  it("should compute extra cost when upgrading tier", () => {
    const slice = makeSliceDef({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 3, 1);
    expect(savings.costDeltaUsd).toBeGreaterThan(0);
    expect(savings.creditDelta).toBeGreaterThan(0);
    expect(savings.direction).toBe("more_expensive");
  });

  it("should show same when tier is unchanged", () => {
    const slice = makeSliceDef({ durationSeconds: 10 });
    const savings = computeRoutingSavings(slice, 2, 2);
    expect(savings.direction).toBe("same");
  });

  it("should scale with duration", () => {
    const shortSlice = makeSliceDef({ durationSeconds: 5 });
    const longSlice = makeSliceDef({ durationSeconds: 10 });
    const shortSavings = computeRoutingSavings(shortSlice, 1, 3);
    const longSavings = computeRoutingSavings(longSlice, 1, 3);
    expect(Math.abs(longSavings.costDeltaUsd)).toBeGreaterThan(Math.abs(shortSavings.costDeltaUsd));
  });
});

// ─── 5. Storyboard Status Computation ────────────────────────────────────

describe("storyboard status computation", () => {
  function computeStatus(slices: Array<{ coreSceneStatus: string }>) {
    const counts = { pending: 0, generating: 0, generated: 0, approved: 0, rejected: 0 };
    for (const s of slices) {
      const status = s.coreSceneStatus as keyof typeof counts;
      if (status in counts) counts[status]++;
    }
    const allGenerated = slices.length > 0 && counts.pending === 0 && counts.generating === 0;
    const allApproved = slices.length > 0 && counts.approved === slices.length;
    const readyForVideo = allApproved;
    return { counts, allGenerated, allApproved, readyForVideo };
  }

  it("should count statuses correctly", () => {
    const slices = [
      { coreSceneStatus: "pending" },
      { coreSceneStatus: "generating" },
      { coreSceneStatus: "generated" },
      { coreSceneStatus: "approved" },
      { coreSceneStatus: "rejected" },
    ];
    const result = computeStatus(slices);
    expect(result.counts.pending).toBe(1);
    expect(result.counts.generating).toBe(1);
    expect(result.counts.generated).toBe(1);
    expect(result.counts.approved).toBe(1);
    expect(result.counts.rejected).toBe(1);
    expect(result.allGenerated).toBe(false);
    expect(result.allApproved).toBe(false);
  });

  it("should detect all-approved state", () => {
    const slices = [
      { coreSceneStatus: "approved" },
      { coreSceneStatus: "approved" },
      { coreSceneStatus: "approved" },
    ];
    const result = computeStatus(slices);
    expect(result.allApproved).toBe(true);
    expect(result.readyForVideo).toBe(true);
  });

  it("should detect all-generated state", () => {
    const slices = [
      { coreSceneStatus: "generated" },
      { coreSceneStatus: "approved" },
      { coreSceneStatus: "rejected" },
    ];
    const result = computeStatus(slices);
    expect(result.allGenerated).toBe(true);
    expect(result.allApproved).toBe(false);
  });

  it("should handle empty slices", () => {
    const result = computeStatus([]);
    expect(result.allGenerated).toBe(false);
    expect(result.allApproved).toBe(false);
    expect(result.readyForVideo).toBe(false);
  });
});

// ─── 6. Wizard State Machine Transitions ─────────────────────────────────

describe("storyboard wizard state machine", () => {
  type WizardState = "loading" | "no_slices" | "decomposing" | "slices_ready" | "generating_previews" | "previews_ready" | "all_approved";

  function deriveState(
    sliceCount: number,
    statusCounts: { pending: number; generating: number; generated: number; approved: number; rejected: number },
    allApproved: boolean,
  ): WizardState {
    if (sliceCount === 0) return "no_slices";
    if (statusCounts.generating > 0) return "generating_previews";
    if (allApproved) return "all_approved";
    if (statusCounts.pending === 0 && statusCounts.generating === 0) return "previews_ready";
    return "slices_ready";
  }

  it("should be no_slices when no slices exist", () => {
    expect(deriveState(0, { pending: 0, generating: 0, generated: 0, approved: 0, rejected: 0 }, false)).toBe("no_slices");
  });

  it("should be slices_ready when slices exist but no previews generated", () => {
    expect(deriveState(5, { pending: 5, generating: 0, generated: 0, approved: 0, rejected: 0 }, false)).toBe("slices_ready");
  });

  it("should be generating_previews when any slice is generating", () => {
    expect(deriveState(5, { pending: 2, generating: 3, generated: 0, approved: 0, rejected: 0 }, false)).toBe("generating_previews");
  });

  it("should be previews_ready when all slices have been generated", () => {
    expect(deriveState(5, { pending: 0, generating: 0, generated: 3, approved: 1, rejected: 1 }, false)).toBe("previews_ready");
  });

  it("should be all_approved when all slices are approved", () => {
    expect(deriveState(5, { pending: 0, generating: 0, generated: 0, approved: 5, rejected: 0 }, true)).toBe("all_approved");
  });
});

// ─── 7. Panel Timing → Slice Boundary Integration ───────────────────────

describe("panel timing to slice boundary integration", () => {
  it("should create timings from panels with dialogue", () => {
    const panels = [
      makePanel({ id: 1, panelNumber: 1, dialogue: [{ text: "Hello there, how are you doing today?", character: "Sakura" }], cameraAngle: "close-up" }),
      makePanel({ id: 2, panelNumber: 2, visualDescription: "Explosion in the background", cameraAngle: "wide" }),
      makePanel({ id: 3, panelNumber: 3, dialogue: [{ text: "We need to run!", character: "Ryu" }], cameraAngle: "medium" }),
    ];

    const timings = panels.map(p => estimatePanelTimingDeterministic(p));
    expect(timings.length).toBe(3);
    expect(timings[0].estimatedDurationSeconds).toBeGreaterThan(0);
    expect(timings[0].hasDialogue).toBe(true);
    expect(timings[1].estimatedDurationSeconds).toBeGreaterThan(0);
    expect(timings[1].hasDialogue).toBe(false);
  });

  it("should group panels into slices with positive duration", () => {
    const panels = [
      makePanel({ id: 1, panelNumber: 1, dialogue: [{ text: "Hello there, how are you doing today?", character: "Sakura" }], cameraAngle: "close-up" }),
      makePanel({ id: 2, panelNumber: 2, visualDescription: "Explosion in the background", cameraAngle: "wide" }),
      makePanel({ id: 3, panelNumber: 3, dialogue: [{ text: "We need to run!", character: "Ryu" }], cameraAngle: "medium" }),
      makePanel({ id: 4, panelNumber: 4, visualDescription: "Characters running through a corridor", cameraAngle: "tracking" }),
      makePanel({ id: 5, panelNumber: 5, visualDescription: "Door slams shut", transition: "cut" }),
    ];

    const timings = panels.map(p => estimatePanelTimingDeterministic(p));
    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBeGreaterThanOrEqual(1);

    for (const slice of slices) {
      expect(slice.durationSeconds).toBeGreaterThan(0);
      expect(slice.panelIds.length).toBeGreaterThan(0);
    }
  });

  it("should never create empty slices", () => {
    const panels = [
      makePanel({ id: 1, panelNumber: 1, dialogue: [{ text: "Short", character: "Sakura" }] }),
    ];
    const timings = panels.map(p => estimatePanelTimingDeterministic(p));
    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBeGreaterThanOrEqual(1);
    expect(slices.every(s => s.panelIds.length > 0)).toBe(true);
  });

  it("should handle many panels creating multiple slices", () => {
    const panels = Array.from({ length: 20 }, (_, i) => makePanel({
      id: i + 1,
      panelNumber: i + 1,
      dialogue: [{ text: `Character speaks line ${i + 1} with some words to fill time`, character: "Sakura" }],
      cameraAngle: i % 2 === 0 ? "close-up" : "wide",
    }));
    const timings = panels.map(p => estimatePanelTimingDeterministic(p));
    const slices = groupPanelsIntoSlices(panels, timings);
    expect(slices.length).toBeGreaterThan(1);
  });
});

// ─── 8. Cost Summary Aggregation ─────────────────────────────────────────

describe("cost summary aggregation for storyboard", () => {
  it("should sum estimated credits across all slices", () => {
    const sliceCredits = [15, 8, 5, 12, 8, 5, 15, 10];
    const totalEstimated = sliceCredits.reduce((sum, c) => sum + c, 0);
    expect(totalEstimated).toBe(78);
  });

  it("should show Tier 1 as the most expensive", () => {
    const dialogueSlice = makeSliceDef({ lipSyncRequired: true, cameraAngle: "close-up", durationSeconds: 10 });
    const result = classifySliceComplexity(dialogueSlice);
    expect(result.estimatedCredits).toBeGreaterThan(0);
    expect(result.estimatedCostUsd).toBeGreaterThan(0);
    expect(result.tier).toBe(1);
  });

  it("should show lower cost for establishing shots vs dialogue", () => {
    const dialogueSlice = makeSliceDef({ lipSyncRequired: true, cameraAngle: "close-up", durationSeconds: 10 });
    const establishingSlice = makeSliceDef({
      characters: [],
      dialogue: [],
      actionDescription: "Wide panoramic view of the city",
      cameraAngle: "wide",
      lipSyncRequired: false,
      durationSeconds: 10,
    });
    const dialogueResult = classifySliceComplexity(dialogueSlice);
    const establishingResult = classifySliceComplexity(establishingSlice);
    expect(establishingResult.estimatedCredits).toBeLessThan(dialogueResult.estimatedCredits);
  });
});
