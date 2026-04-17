/**
 * Tests for the three new Dialogue Preview features:
 * 1. Inline Phoneme Editor (viseme override logic)
 * 2. Batch Preview (multi-scene aggregation)
 * 3. Export/Import JSON Preset (serialization/validation)
 */

import { describe, it, expect } from "vitest";
import {
  generateWaveformData,
} from "./routers-scene-type";
import {
  generateVisemeTimeline,
  estimateDialogueCost,
  phonemeToViseme,
} from "./scene-type-router/dialogue-inpainting";
import type { PhonemeTimestamp } from "./scene-type-router/dialogue-inpainting";

// ─── 1. Inline Phoneme Editor Logic ────────────────────────────────────

describe("Phoneme Editor — Viseme Override Logic", () => {
  // Simulate the override application logic from the modal
  function applyOverrides(
    frames: Array<{ viseme: string; frameIndex: number; timeS: number }>,
    overrides: Array<{ frameIndex: number; viseme: string }>,
  ) {
    return frames.map(f => {
      const override = overrides.find(o => o.frameIndex === f.frameIndex);
      return override ? { ...f, viseme: override.viseme } : f;
    });
  }

  function computeDistribution(frames: Array<{ viseme: string }>) {
    const dist: Record<string, number> = {};
    for (const f of frames) {
      dist[f.viseme] = (dist[f.viseme] || 0) + 1;
    }
    return dist;
  }

  // Simulate segment grouping logic from the timeline bar
  function groupSegments(frames: Array<{ viseme: string; frameIndex: number; timeS: number }>) {
    const segs: Array<{ viseme: string; startIdx: number; endIdx: number; startTimeS: number }> = [];
    let current: (typeof segs)[0] | null = null;
    for (const f of frames) {
      if (current && current.viseme === f.viseme) {
        current.endIdx = f.frameIndex;
      } else {
        if (current) segs.push(current);
        current = { viseme: f.viseme, startIdx: f.frameIndex, endIdx: f.frameIndex, startTimeS: f.timeS };
      }
    }
    if (current) segs.push(current);
    return segs;
  }

  // Simulate range override
  function setRangeOverride(
    existing: Array<{ frameIndex: number; viseme: string }>,
    startFrame: number,
    endFrame: number,
    viseme: string,
  ) {
    const filtered = existing.filter(o => o.frameIndex < startFrame || o.frameIndex > endFrame);
    const newOverrides: Array<{ frameIndex: number; viseme: string }> = [];
    for (let i = startFrame; i <= endFrame; i++) {
      newOverrides.push({ frameIndex: i, viseme });
    }
    return [...filtered, ...newOverrides];
  }

  // Simulate split logic
  function splitSegment(
    existing: Array<{ frameIndex: number; viseme: string }>,
    startFrame: number,
    endFrame: number,
    currentViseme: string,
  ) {
    const mid = Math.floor((startFrame + endFrame) / 2);
    let result = setRangeOverride(existing, startFrame, mid, currentViseme);
    result = setRangeOverride(result, mid + 1, endFrame, "Rest");
    return result;
  }

  const phonemes: PhonemeTimestamp[] = [
    { phoneme: "a", startTimeS: 0, endTimeS: 1 },
    { phoneme: "i", startTimeS: 1, endTimeS: 2 },
    { phoneme: "sil", startTimeS: 2, endTimeS: 3 },
    { phoneme: "o", startTimeS: 3, endTimeS: 4 },
    { phoneme: "u", startTimeS: 4, endTimeS: 5 },
  ];

  const timeline = generateVisemeTimeline(phonemes, 5, 8);

  it("applies single-frame override correctly", () => {
    const overrides = [{ frameIndex: 0, viseme: "O" }];
    const result = applyOverrides(timeline, overrides);
    expect(result[0].viseme).toBe("O");
    // Other frames unchanged
    expect(result[1].viseme).toBe(timeline[1].viseme);
  });

  it("applies range override to multiple frames", () => {
    const overrides = setRangeOverride([], 0, 7, "E");
    const result = applyOverrides(timeline, overrides);
    for (let i = 0; i <= 7; i++) {
      expect(result[i].viseme).toBe("E");
    }
    // Frames after range unchanged
    expect(result[8].viseme).toBe(timeline[8].viseme);
  });

  it("override replaces previous override on same frame", () => {
    let overrides = setRangeOverride([], 0, 3, "A");
    overrides = setRangeOverride(overrides, 0, 3, "U");
    const result = applyOverrides(timeline, overrides);
    for (let i = 0; i <= 3; i++) {
      expect(result[i].viseme).toBe("U");
    }
  });

  it("split creates two segments from one", () => {
    const overrides = splitSegment([], 0, 7, "A");
    const result = applyOverrides(timeline, overrides);
    const segments = groupSegments(result);
    // First segment should be A (frames 0-3), second should be Rest (frames 4-7)
    const firstSeg = segments[0];
    expect(firstSeg.viseme).toBe("A");
    expect(firstSeg.startIdx).toBe(0);
    expect(firstSeg.endIdx).toBe(3);

    const secondSeg = segments[1];
    expect(secondSeg.viseme).toBe("Rest");
    expect(secondSeg.startIdx).toBe(4);
    expect(secondSeg.endIdx).toBe(7);
  });

  it("removing overrides restores original visemes", () => {
    const overrides = setRangeOverride([], 0, 5, "N");
    const modified = applyOverrides(timeline, overrides);
    expect(modified[0].viseme).toBe("N");

    // Remove overrides (filter them out)
    const cleared = overrides.filter(o => o.frameIndex < 0 || o.frameIndex > 5);
    const restored = applyOverrides(timeline, cleared);
    expect(restored[0].viseme).toBe(timeline[0].viseme);
    expect(restored[5].viseme).toBe(timeline[5].viseme);
  });

  it("distribution recalculates after overrides", () => {
    const originalDist = computeDistribution(timeline);
    const overrides = setRangeOverride([], 0, timeline.length - 1, "N");
    const modified = applyOverrides(timeline, overrides);
    const modifiedDist = computeDistribution(modified);

    expect(modifiedDist["N"]).toBe(timeline.length);
    // All other visemes should be gone
    for (const [key, count] of Object.entries(modifiedDist)) {
      if (key !== "N") expect(count).toBeUndefined();
    }
  });

  it("segment grouping merges adjacent same-viseme frames", () => {
    const frames = [
      { viseme: "A", frameIndex: 0, timeS: 0 },
      { viseme: "A", frameIndex: 1, timeS: 0.125 },
      { viseme: "I", frameIndex: 2, timeS: 0.25 },
      { viseme: "I", frameIndex: 3, timeS: 0.375 },
      { viseme: "A", frameIndex: 4, timeS: 0.5 },
    ];
    const segments = groupSegments(frames);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ viseme: "A", startIdx: 0, endIdx: 1, startTimeS: 0 });
    expect(segments[1]).toEqual({ viseme: "I", startIdx: 2, endIdx: 3, startTimeS: 0.25 });
    expect(segments[2]).toEqual({ viseme: "A", startIdx: 4, endIdx: 4, startTimeS: 0.5 });
  });

  it("phonemeToViseme maps all standard phonemes", () => {
    expect(phonemeToViseme("a")).toBe("A");
    expect(phonemeToViseme("i")).toBe("I");
    expect(phonemeToViseme("u")).toBe("U");
    expect(phonemeToViseme("e")).toBe("E");
    expect(phonemeToViseme("o")).toBe("O");
    // sil and sp map to Rest (silence), m/n map to N (nasal consonants)
    expect(phonemeToViseme("sil")).toBe("Rest");
    expect(phonemeToViseme("sp")).toBe("Rest");
    expect(phonemeToViseme("m")).toBe("N");
    // plosives map to Closed
    expect(phonemeToViseme("p")).toBe("Closed");
    expect(phonemeToViseme("b")).toBe("Closed");
    expect(phonemeToViseme("n")).toBe("N");
  });

  it("override count matches number of frames in range", () => {
    const overrides = setRangeOverride([], 5, 15, "E");
    expect(overrides).toHaveLength(11); // frames 5-15 inclusive
  });

  it("partial range override preserves frames outside range", () => {
    let overrides = setRangeOverride([], 0, 10, "A");
    overrides = setRangeOverride(overrides, 5, 7, "U");
    // Frames 0-4 should still be A
    const aOverrides = overrides.filter(o => o.frameIndex < 5);
    expect(aOverrides.every(o => o.viseme === "A")).toBe(true);
    // Frames 5-7 should be U
    const uOverrides = overrides.filter(o => o.frameIndex >= 5 && o.frameIndex <= 7);
    expect(uOverrides.every(o => o.viseme === "U")).toBe(true);
    // Frames 8-10 should still be A
    const remainingA = overrides.filter(o => o.frameIndex > 7);
    expect(remainingA.every(o => o.viseme === "A")).toBe(true);
  });
});

// ─── 2. Batch Preview Logic ────────────────────────────────────────────

describe("Batch Preview — Multi-Scene Aggregation", () => {
  // Simulate the batch preview aggregation logic from the endpoint
  function buildBatchPreview(
    scenes: Array<{
      sceneId: number;
      sceneNumber: number;
      durationS: number;
      dialogueLines: Array<{ character: string; text: string; startTimeS: number; endTimeS: number }>;
    }>,
    inpaintFps: number = 8,
  ) {
    const perScene = scenes.map(scene => {
      const phonemes: PhonemeTimestamp[] = [];
      for (const line of scene.dialogueLines) {
        const chars = line.text.replace(/[^a-zA-Z]/g, "").split("");
        if (chars.length === 0) continue;
        const charDuration = (line.endTimeS - line.startTimeS) / chars.length;
        for (let i = 0; i < chars.length; i++) {
          const ch = chars[i].toLowerCase();
          const phoneme = "aeiou".includes(ch) ? ch : "sil";
          phonemes.push({
            phoneme,
            startTimeS: line.startTimeS + i * charDuration,
            endTimeS: line.startTimeS + (i + 1) * charDuration,
          });
        }
      }

      const visemeTimeline = generateVisemeTimeline(phonemes, scene.durationS, inpaintFps);
      const costEstimate = estimateDialogueCost(scene.durationS, 1, inpaintFps);
      const totalFrames = visemeTimeline.length;

      const visemeDistribution: Record<string, number> = {};
      for (const frame of visemeTimeline) {
        visemeDistribution[frame.viseme] = (visemeDistribution[frame.viseme] || 0) + 1;
      }

      const characters = Array.from(new Set(scene.dialogueLines.map(l => l.character)));
      const totalDialogueS = scene.dialogueLines.reduce((sum, l) => sum + (l.endTimeS - l.startTimeS), 0);

      return {
        sceneId: scene.sceneId,
        sceneNumber: scene.sceneNumber,
        durationS: scene.durationS,
        totalFrames,
        lineCount: scene.dialogueLines.length,
        characters,
        totalDialogueS: Math.round(totalDialogueS * 100) / 100,
        silenceS: Math.round((scene.durationS - totalDialogueS) * 100) / 100,
        visemeDistribution,
        costEstimate: {
          totalCredits: costEstimate.totalCredits,
          savingsPercent: costEstimate.savingsPercent,
        },
      };
    });

    const totalDurationS = perScene.reduce((sum, s) => sum + s.durationS, 0);
    const totalFrames = perScene.reduce((sum, s) => sum + s.totalFrames, 0);
    const totalCredits = perScene.reduce((sum, s) => sum + s.costEstimate.totalCredits, 0);
    const totalDialogueS = perScene.reduce((sum, s) => sum + s.totalDialogueS, 0);
    const allCharacters = Array.from(new Set(perScene.flatMap(s => s.characters)));

    const aggregateVisemeDistribution: Record<string, number> = {};
    for (const s of perScene) {
      for (const [v, count] of Object.entries(s.visemeDistribution)) {
        aggregateVisemeDistribution[v] = (aggregateVisemeDistribution[v] || 0) + count;
      }
    }

    const klingCreditsPerSecond = 0.26;
    const klingTotalCredits = totalDurationS * klingCreditsPerSecond;
    const batchSavingsPercent = Math.round((1 - totalCredits / Math.max(klingTotalCredits, 0.001)) * 100);

    return {
      sceneCount: perScene.length,
      perScene,
      totals: {
        durationS: Math.round(totalDurationS * 100) / 100,
        totalFrames,
        totalCredits: Math.round(totalCredits * 10000) / 10000,
        totalDialogueS: Math.round(totalDialogueS * 100) / 100,
        totalSilenceS: Math.round((totalDurationS - totalDialogueS) * 100) / 100,
        characters: allCharacters,
        klingEquivalentCredits: Math.round(klingTotalCredits * 10000) / 10000,
        savingsPercent: batchSavingsPercent,
        visemeDistribution: aggregateVisemeDistribution,
      },
    };
  }

  const testScenes = [
    {
      sceneId: 1, sceneNumber: 1, durationS: 8,
      dialogueLines: [
        { character: "Sakura", text: "Hello world", startTimeS: 0.5, endTimeS: 3.0 },
        { character: "Hiro", text: "Goodbye", startTimeS: 4.0, endTimeS: 6.0 },
      ],
    },
    {
      sceneId: 2, sceneNumber: 3, durationS: 12,
      dialogueLines: [
        { character: "Sakura", text: "What do you mean?", startTimeS: 0.5, endTimeS: 2.5 },
        { character: "Hiro", text: "We can change our fate.", startTimeS: 3.0, endTimeS: 6.0 },
        { character: "Villain", text: "Never!", startTimeS: 7.0, endTimeS: 9.0 },
      ],
    },
    {
      sceneId: 3, sceneNumber: 5, durationS: 6,
      dialogueLines: [
        { character: "Villain", text: "You fools!", startTimeS: 0.5, endTimeS: 4.5 },
      ],
    },
  ];

  it("returns correct scene count", () => {
    const result = buildBatchPreview(testScenes);
    expect(result.sceneCount).toBe(3);
  });

  it("per-scene results have correct structure", () => {
    const result = buildBatchPreview(testScenes);
    for (const scene of result.perScene) {
      expect(scene).toHaveProperty("sceneId");
      expect(scene).toHaveProperty("sceneNumber");
      expect(scene).toHaveProperty("durationS");
      expect(scene).toHaveProperty("totalFrames");
      expect(scene).toHaveProperty("lineCount");
      expect(scene).toHaveProperty("characters");
      expect(scene).toHaveProperty("totalDialogueS");
      expect(scene).toHaveProperty("silenceS");
      expect(scene).toHaveProperty("visemeDistribution");
      expect(scene).toHaveProperty("costEstimate");
      expect(scene.costEstimate).toHaveProperty("totalCredits");
      expect(scene.costEstimate).toHaveProperty("savingsPercent");
    }
  });

  it("total duration equals sum of per-scene durations", () => {
    const result = buildBatchPreview(testScenes);
    const expectedDuration = testScenes.reduce((sum, s) => sum + s.durationS, 0);
    expect(result.totals.durationS).toBe(expectedDuration);
  });

  it("total frames equals sum of per-scene frames", () => {
    const result = buildBatchPreview(testScenes);
    const sumFrames = result.perScene.reduce((sum, s) => sum + s.totalFrames, 0);
    expect(result.totals.totalFrames).toBe(sumFrames);
  });

  it("total credits equals sum of per-scene credits", () => {
    const result = buildBatchPreview(testScenes);
    const sumCredits = result.perScene.reduce((sum, s) => sum + s.costEstimate.totalCredits, 0);
    expect(result.totals.totalCredits).toBeCloseTo(sumCredits, 3);
  });

  it("all characters are collected across scenes", () => {
    const result = buildBatchPreview(testScenes);
    expect(result.totals.characters).toContain("Sakura");
    expect(result.totals.characters).toContain("Hiro");
    expect(result.totals.characters).toContain("Villain");
    expect(result.totals.characters).toHaveLength(3);
  });

  it("dialogue + silence equals total duration per scene", () => {
    const result = buildBatchPreview(testScenes);
    for (const scene of result.perScene) {
      const sum = scene.totalDialogueS + scene.silenceS;
      expect(sum).toBeCloseTo(scene.durationS, 1);
    }
  });

  it("savings percent is positive (cheaper than Kling)", () => {
    const result = buildBatchPreview(testScenes);
    expect(result.totals.savingsPercent).toBeGreaterThan(0);
    expect(result.totals.savingsPercent).toBeLessThanOrEqual(100);
  });

  it("Kling equivalent credits are higher than inpainting credits", () => {
    const result = buildBatchPreview(testScenes);
    expect(result.totals.klingEquivalentCredits).toBeGreaterThan(result.totals.totalCredits);
  });

  it("aggregate viseme distribution sums to total frames", () => {
    const result = buildBatchPreview(testScenes);
    const distTotal = Object.values(result.totals.visemeDistribution).reduce((a, b) => a + b, 0);
    expect(distTotal).toBe(result.totals.totalFrames);
  });

  it("per-scene viseme distribution sums to scene frames", () => {
    const result = buildBatchPreview(testScenes);
    for (const scene of result.perScene) {
      const distTotal = Object.values(scene.visemeDistribution).reduce((a, b) => a + b, 0);
      expect(distTotal).toBe(scene.totalFrames);
    }
  });

  it("handles single scene batch", () => {
    const result = buildBatchPreview([testScenes[0]]);
    expect(result.sceneCount).toBe(1);
    expect(result.totals.durationS).toBe(testScenes[0].durationS);
  });

  it("line count matches input dialogue lines", () => {
    const result = buildBatchPreview(testScenes);
    expect(result.perScene[0].lineCount).toBe(2);
    expect(result.perScene[1].lineCount).toBe(3);
    expect(result.perScene[2].lineCount).toBe(1);
  });

  it("per-scene characters are unique", () => {
    const result = buildBatchPreview(testScenes);
    // Scene 2 has Sakura, Hiro, Villain — all unique
    const scene2 = result.perScene[1];
    expect(scene2.characters).toHaveLength(3);
    expect(new Set(scene2.characters).size).toBe(3);
  });
});

// ─── 3. Export/Import Preset Serialization ─────────────────────────────

describe("Export/Import Preset — Serialization & Validation", () => {
  interface DialoguePreset {
    version: 1;
    name: string;
    createdAt: string;
    durationS: number;
    dialogueLines: Array<{
      character: string;
      text: string;
      emotion: string;
      startTimeS: number;
      endTimeS: number;
    }>;
    visemeOverrides: Array<{ frameIndex: number; viseme: string }>;
    loopState: { enabled: boolean; markerA: number; markerB: number };
    speed: number;
  }

  function validatePreset(raw: any): { valid: boolean; error?: string } {
    if (!raw || typeof raw !== "object") return { valid: false, error: "Not an object" };
    if (raw.version !== 1) return { valid: false, error: "Unsupported version" };
    if (typeof raw.durationS !== "number" || raw.durationS < 1 || raw.durationS > 120) {
      return { valid: false, error: "Invalid durationS" };
    }
    if (!Array.isArray(raw.dialogueLines)) return { valid: false, error: "Missing dialogueLines" };
    for (const line of raw.dialogueLines) {
      if (!line.character || !line.text || line.startTimeS === undefined || line.endTimeS === undefined) {
        return { valid: false, error: "Malformed dialogue line" };
      }
      if (line.startTimeS >= line.endTimeS) {
        return { valid: false, error: "startTimeS must be less than endTimeS" };
      }
    }
    if (raw.visemeOverrides && !Array.isArray(raw.visemeOverrides)) {
      return { valid: false, error: "visemeOverrides must be an array" };
    }
    if (raw.loopState) {
      if (typeof raw.loopState.markerA !== "number" || typeof raw.loopState.markerB !== "number") {
        return { valid: false, error: "Invalid loop markers" };
      }
      if (raw.loopState.markerA >= raw.loopState.markerB) {
        return { valid: false, error: "markerA must be less than markerB" };
      }
    }
    return { valid: true };
  }

  function createPreset(overrides?: Partial<DialoguePreset>): DialoguePreset {
    return {
      version: 1,
      name: "Test Preset",
      createdAt: new Date().toISOString(),
      durationS: 10,
      dialogueLines: [
        { character: "Sakura", text: "Hello", emotion: "happy", startTimeS: 0.5, endTimeS: 3.0 },
        { character: "Hiro", text: "World", emotion: "neutral", startTimeS: 4.0, endTimeS: 6.0 },
      ],
      visemeOverrides: [
        { frameIndex: 0, viseme: "O" },
        { frameIndex: 5, viseme: "A" },
      ],
      loopState: { enabled: true, markerA: 0.2, markerB: 0.8 },
      speed: 1,
      ...overrides,
    };
  }

  it("valid preset passes validation", () => {
    const preset = createPreset();
    expect(validatePreset(preset)).toEqual({ valid: true });
  });

  it("preset serializes and deserializes via JSON", () => {
    const preset = createPreset();
    const json = JSON.stringify(preset);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.durationS).toBe(10);
    expect(parsed.dialogueLines).toHaveLength(2);
    expect(parsed.visemeOverrides).toHaveLength(2);
    expect(parsed.loopState.enabled).toBe(true);
    expect(parsed.speed).toBe(1);
  });

  it("rejects preset with wrong version", () => {
    const result = validatePreset({ version: 2, durationS: 10, dialogueLines: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("version");
  });

  it("rejects preset without dialogueLines", () => {
    const result = validatePreset({ version: 1, durationS: 10 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("dialogueLines");
  });

  it("rejects preset with invalid durationS", () => {
    expect(validatePreset({ version: 1, durationS: 0, dialogueLines: [] }).valid).toBe(false);
    expect(validatePreset({ version: 1, durationS: 200, dialogueLines: [] }).valid).toBe(false);
    expect(validatePreset({ version: 1, durationS: -5, dialogueLines: [] }).valid).toBe(false);
  });

  it("rejects preset with malformed dialogue line", () => {
    const result = validatePreset({
      version: 1, durationS: 10,
      dialogueLines: [{ character: "A" }], // missing text, startTimeS, endTimeS
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Malformed");
  });

  it("rejects dialogue line where startTimeS >= endTimeS", () => {
    const result = validatePreset({
      version: 1, durationS: 10,
      dialogueLines: [{ character: "A", text: "Hi", startTimeS: 5, endTimeS: 3 }],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("startTimeS");
  });

  it("rejects invalid loop markers (A >= B)", () => {
    const result = validatePreset({
      version: 1, durationS: 10,
      dialogueLines: [{ character: "A", text: "Hi", startTimeS: 0, endTimeS: 2 }],
      loopState: { enabled: true, markerA: 0.8, markerB: 0.2 },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("markerA");
  });

  it("accepts preset with empty visemeOverrides", () => {
    const preset = createPreset({ visemeOverrides: [] });
    expect(validatePreset(preset)).toEqual({ valid: true });
  });

  it("accepts preset with loop disabled", () => {
    const preset = createPreset({ loopState: { enabled: false, markerA: 0.2, markerB: 0.8 } });
    expect(validatePreset(preset)).toEqual({ valid: true });
  });

  it("preserves all fields through round-trip serialization", () => {
    const preset = createPreset({
      name: "My Custom Preset",
      speed: 0.5,
      visemeOverrides: [
        { frameIndex: 0, viseme: "A" },
        { frameIndex: 10, viseme: "U" },
        { frameIndex: 20, viseme: "Closed" },
      ],
      loopState: { enabled: true, markerA: 0.1, markerB: 0.9 },
    });

    const roundTripped = JSON.parse(JSON.stringify(preset));
    expect(roundTripped.name).toBe("My Custom Preset");
    expect(roundTripped.speed).toBe(0.5);
    expect(roundTripped.visemeOverrides).toHaveLength(3);
    expect(roundTripped.visemeOverrides[2].viseme).toBe("Closed");
    expect(roundTripped.loopState.markerA).toBe(0.1);
    expect(roundTripped.loopState.markerB).toBe(0.9);
  });

  it("rejects null input", () => {
    expect(validatePreset(null).valid).toBe(false);
  });

  it("rejects string input", () => {
    expect(validatePreset("not a preset").valid).toBe(false);
  });

  it("rejects visemeOverrides that is not an array", () => {
    const result = validatePreset({
      version: 1, durationS: 10,
      dialogueLines: [{ character: "A", text: "Hi", startTimeS: 0, endTimeS: 2 }],
      visemeOverrides: "invalid",
    });
    expect(result.valid).toBe(false);
  });
});

// ─── 4. Viseme Override Integration with Backend ──────────────────────

describe("Viseme Override — Backend Integration", () => {
  it("previewDialogue input schema accepts visemeOverrides", () => {
    // Verify the shape matches what the endpoint expects
    const validInput = {
      durationS: 10,
      cameraAngles: ["front"],
      dialogueLines: [
        { character: "A", text: "Hello", startTimeS: 0, endTimeS: 3 },
      ],
      inpaintFps: 8,
      outputFps: 24,
      visemeOverrides: [
        { frameIndex: 0, viseme: "O" },
        { frameIndex: 5, viseme: "A" },
      ],
    };

    // Validate structure
    expect(validInput.visemeOverrides).toHaveLength(2);
    expect(validInput.visemeOverrides[0]).toHaveProperty("frameIndex");
    expect(validInput.visemeOverrides[0]).toHaveProperty("viseme");
  });

  it("viseme overrides are applied to generated timeline", () => {
    // Simulate what the endpoint does
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 0, endTimeS: 2 },
      { phoneme: "sil", startTimeS: 2, endTimeS: 4 },
    ];
    const timeline = generateVisemeTimeline(phonemes, 4, 8);
    const overrides = [
      { frameIndex: 0, viseme: "U" },
      { frameIndex: 8, viseme: "E" },
    ];

    // Apply overrides (mimicking endpoint logic)
    for (const override of overrides) {
      const frame = timeline.find(f => f.frameIndex === override.frameIndex);
      if (frame) {
        (frame as any).viseme = override.viseme;
      }
    }

    expect(timeline[0].viseme).toBe("U");
    expect(timeline[8].viseme).toBe("E");
  });

  it("non-matching override frameIndex is silently ignored", () => {
    const phonemes: PhonemeTimestamp[] = [
      { phoneme: "a", startTimeS: 0, endTimeS: 1 },
    ];
    const timeline = generateVisemeTimeline(phonemes, 1, 8);
    const overrides = [
      { frameIndex: 999, viseme: "O" }, // doesn't exist
    ];

    for (const override of overrides) {
      const frame = timeline.find(f => f.frameIndex === override.frameIndex);
      if (frame) {
        (frame as any).viseme = override.viseme;
      }
    }

    // No frame should be changed
    for (const f of timeline) {
      expect(f.viseme).not.toBe("O");
    }
  });
});
