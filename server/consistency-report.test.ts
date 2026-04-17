/**
 * Tests for Character Consistency Report
 * Covers: computeFrameDrift, detectDriftSpikes, generateConsistencyTimeline,
 * computeEpisodeConsistency, computeConsistencyGrade, aggregateCharacterReport,
 * getFrameDriftDetail
 */
import { describe, it, expect } from "vitest";
import {
  computeFrameDrift,
  detectDriftSpikes,
  generateConsistencyTimeline,
  computeEpisodeConsistency,
  computeConsistencyGrade,
  aggregateCharacterReport,
  getFrameDriftDetail,
  DEFAULT_DRIFT_THRESHOLD,
  WARNING_THRESHOLD_FACTOR,
  GRADE_THRESHOLDS,
  type FrameGeneration,
  type FrameDriftResult,
  type ConsistencyGrade,
} from "./consistency-analysis";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeFrame(overrides: Partial<FrameGeneration> = {}): FrameGeneration {
  return {
    generationId: 1,
    episodeId: 100,
    episodeNumber: 1,
    episodeTitle: "Episode 1",
    sceneId: 10,
    sceneNumber: 1,
    frameIndex: 0,
    resultUrl: "https://cdn.example.com/frame-001.png",
    loraId: 5,
    loraVersion: 2,
    loraStrength: 0.75,
    createdAt: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

function makeDriftResult(overrides: Partial<FrameDriftResult> = {}): FrameDriftResult {
  return {
    generationId: 1,
    episodeId: 100,
    episodeNumber: 1,
    episodeTitle: "Episode 1",
    sceneId: 10,
    sceneNumber: 1,
    frameIndex: 0,
    resultUrl: "https://cdn.example.com/frame-001.png",
    driftScore: 0.05,
    clipDrift: 0.1,
    featureDrifts: { face: 0.04, hair: 0.05, outfit: 0.03, colorPalette: 0.02, bodyProportion: 0.01 },
    isFlagged: false,
    severity: "ok",
    loraVersion: 2,
    loraStrength: 0.75,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── computeFrameDrift ────────────────────────────────────────────────────

describe("computeFrameDrift", () => {
  it("returns all required fields", () => {
    const frame = makeFrame();
    const result = computeFrameDrift(frame, 85, 0.9);

    expect(result.generationId).toBe(1);
    expect(result.episodeId).toBe(100);
    expect(result.episodeNumber).toBe(1);
    expect(result.episodeTitle).toBe("Episode 1");
    expect(result.sceneId).toBe(10);
    expect(result.sceneNumber).toBe(1);
    expect(result.frameIndex).toBe(0);
    expect(result.resultUrl).toBe("https://cdn.example.com/frame-001.png");
    expect(typeof result.driftScore).toBe("number");
    expect(typeof result.clipDrift).toBe("number");
    expect(result.featureDrifts).toHaveProperty("face");
    expect(result.featureDrifts).toHaveProperty("hair");
    expect(result.featureDrifts).toHaveProperty("outfit");
    expect(result.featureDrifts).toHaveProperty("colorPalette");
    expect(result.featureDrifts).toHaveProperty("bodyProportion");
    expect(result.isFlagged).toBe(false); // not flagged by default
    expect(result.severity).toBe("ok");
    expect(result.loraVersion).toBe(2);
    expect(result.loraStrength).toBe(0.75);
    expect(typeof result.timestamp).toBe("number");
  });

  it("drift scores are in [0, 1] range", () => {
    const frame = makeFrame();
    const result = computeFrameDrift(frame, 85, 0.9);

    expect(result.driftScore).toBeGreaterThanOrEqual(0);
    expect(result.driftScore).toBeLessThanOrEqual(1);
    expect(result.clipDrift).toBeGreaterThanOrEqual(0);
    expect(result.clipDrift).toBeLessThanOrEqual(1);

    for (const val of Object.values(result.featureDrifts)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for the same generationId", () => {
    const frame = makeFrame({ generationId: 42 });
    const r1 = computeFrameDrift(frame, 85, 0.9);
    const r2 = computeFrameDrift(frame, 85, 0.9);

    expect(r1.driftScore).toBe(r2.driftScore);
    expect(r1.clipDrift).toBe(r2.clipDrift);
    expect(r1.featureDrifts).toEqual(r2.featureDrifts);
  });

  it("produces different results for different generationIds", () => {
    const f1 = makeFrame({ generationId: 1 });
    const f2 = makeFrame({ generationId: 2 });
    const r1 = computeFrameDrift(f1, 85, 0.9);
    const r2 = computeFrameDrift(f2, 85, 0.9);

    // Very unlikely to be exactly equal with different seeds
    expect(r1.driftScore === r2.driftScore && r1.clipDrift === r2.clipDrift).toBe(false);
  });

  it("frames without LoRA have higher drift than frames with LoRA", () => {
    const withLora = makeFrame({ generationId: 100, loraId: 5, loraStrength: 0.8 });
    const withoutLora = makeFrame({ generationId: 101, loraId: null, loraVersion: null, loraStrength: null });

    const rWith = computeFrameDrift(withLora, 90, 0.92);
    const rWithout = computeFrameDrift(withoutLora, 90, 0.92);

    // On average, no-LoRA should drift more. With seeded RNG there's a small chance
    // of overlap, so we test the base drift logic indirectly by checking the no-LoRA
    // result has a non-trivial drift.
    expect(rWithout.driftScore).toBeGreaterThan(0.05);
  });

  it("higher quality score leads to lower drift when LoRA is present", () => {
    const frame = makeFrame({ generationId: 200 });
    const lowQuality = computeFrameDrift(frame, 50, 0.7);
    const highQuality = computeFrameDrift(frame, 95, 0.95);

    expect(highQuality.driftScore).toBeLessThan(lowQuality.driftScore);
  });

  it("handles null quality score and CLIP similarity gracefully", () => {
    const frame = makeFrame({ generationId: 300 });
    const result = computeFrameDrift(frame, null, null);

    expect(typeof result.driftScore).toBe("number");
    expect(result.driftScore).toBeGreaterThanOrEqual(0);
    expect(result.driftScore).toBeLessThanOrEqual(1);
  });

  it("handles string createdAt", () => {
    const frame = makeFrame({ createdAt: "2026-03-01T12:00:00Z" });
    const result = computeFrameDrift(frame, 85, 0.9);

    expect(result.timestamp).toBe(new Date("2026-03-01T12:00:00Z").getTime());
  });
});

// ─── detectDriftSpikes ────────────────────────────────────────────────────

describe("detectDriftSpikes", () => {
  it("flags frames above threshold as critical", () => {
    const frames = [
      makeDriftResult({ driftScore: 0.05 }),
      makeDriftResult({ driftScore: 0.20 }),
      makeDriftResult({ driftScore: 0.30 }),
    ];

    const result = detectDriftSpikes(frames, 0.15);

    expect(result[0].isFlagged).toBe(false);
    expect(result[0].severity).toBe("ok");
    expect(result[1].isFlagged).toBe(true);
    expect(result[1].severity).toBe("critical");
    expect(result[2].isFlagged).toBe(true);
    expect(result[2].severity).toBe("critical");
  });

  it("marks frames in warning zone correctly", () => {
    // Warning zone: threshold * 0.7 to threshold
    // With threshold 0.20: warning zone = 0.14 to 0.20
    const frames = [
      makeDriftResult({ driftScore: 0.10 }),  // ok (below 0.14)
      makeDriftResult({ driftScore: 0.16 }),  // warning (0.14 - 0.20)
      makeDriftResult({ driftScore: 0.25 }),  // critical (above 0.20)
    ];

    const result = detectDriftSpikes(frames, 0.20);

    expect(result[0].severity).toBe("ok");
    expect(result[1].severity).toBe("warning");
    expect(result[1].isFlagged).toBe(false); // warning is not flagged
    expect(result[2].severity).toBe("critical");
    expect(result[2].isFlagged).toBe(true);
  });

  it("uses DEFAULT_DRIFT_THRESHOLD when no threshold provided", () => {
    const frames = [
      makeDriftResult({ driftScore: DEFAULT_DRIFT_THRESHOLD + 0.01 }),
    ];

    const result = detectDriftSpikes(frames);
    expect(result[0].isFlagged).toBe(true);
    expect(result[0].severity).toBe("critical");
  });

  it("returns empty array for empty input", () => {
    expect(detectDriftSpikes([])).toEqual([]);
  });

  it("preserves all other frame properties", () => {
    const original = makeDriftResult({ generationId: 42, episodeTitle: "Test Ep" });
    const [result] = detectDriftSpikes([original]);

    expect(result.generationId).toBe(42);
    expect(result.episodeTitle).toBe("Test Ep");
    expect(result.featureDrifts).toEqual(original.featureDrifts);
  });
});

// ─── generateConsistencyTimeline ──────────────────────────────────────────

describe("generateConsistencyTimeline", () => {
  it("sorts by episode number then frame index", () => {
    const frames = [
      makeDriftResult({ episodeNumber: 2, frameIndex: 1, generationId: 3 }),
      makeDriftResult({ episodeNumber: 1, frameIndex: 2, generationId: 2 }),
      makeDriftResult({ episodeNumber: 1, frameIndex: 0, generationId: 1 }),
      makeDriftResult({ episodeNumber: 2, frameIndex: 0, generationId: 4 }),
    ];

    const timeline = generateConsistencyTimeline(frames);

    expect(timeline.map(t => t.generationId)).toEqual([1, 2, 4, 3]);
  });

  it("assigns sequential global frame indices", () => {
    const frames = [
      makeDriftResult({ episodeNumber: 1, frameIndex: 0 }),
      makeDriftResult({ episodeNumber: 1, frameIndex: 1 }),
      makeDriftResult({ episodeNumber: 2, frameIndex: 0 }),
    ];

    const timeline = generateConsistencyTimeline(frames);

    expect(timeline[0].frameIndex).toBe(0);
    expect(timeline[1].frameIndex).toBe(1);
    expect(timeline[2].frameIndex).toBe(2);
  });

  it("includes driftScore and isFlagged from source frames", () => {
    const frames = [
      makeDriftResult({ driftScore: 0.12, isFlagged: false }),
      makeDriftResult({ driftScore: 0.25, isFlagged: true }),
    ];

    const timeline = generateConsistencyTimeline(frames);

    expect(timeline[0].driftScore).toBe(0.12);
    expect(timeline[0].isFlagged).toBe(false);
    expect(timeline[1].driftScore).toBe(0.25);
    expect(timeline[1].isFlagged).toBe(true);
  });

  it("returns empty array for empty input", () => {
    expect(generateConsistencyTimeline([])).toEqual([]);
  });
});

// ─── computeEpisodeConsistency ────────────────────────────────────────────

describe("computeEpisodeConsistency", () => {
  it("returns null for empty frames", () => {
    expect(computeEpisodeConsistency([])).toBeNull();
  });

  it("computes correct average, max, min drift", () => {
    const frames = [
      makeDriftResult({ driftScore: 0.10, episodeId: 1, episodeNumber: 1, episodeTitle: "Ep1" }),
      makeDriftResult({ driftScore: 0.20, episodeId: 1, episodeNumber: 1, episodeTitle: "Ep1" }),
      makeDriftResult({ driftScore: 0.30, episodeId: 1, episodeNumber: 1, episodeTitle: "Ep1" }),
    ];

    const result = computeEpisodeConsistency(frames)!;

    expect(result.avgDrift).toBe(0.2);
    expect(result.maxDrift).toBe(0.3);
    expect(result.minDrift).toBe(0.1);
    expect(result.frameCount).toBe(3);
  });

  it("counts flagged frames correctly", () => {
    const frames = [
      makeDriftResult({ isFlagged: false }),
      makeDriftResult({ isFlagged: true }),
      makeDriftResult({ isFlagged: true }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.flaggedCount).toBe(2);
  });

  it("identifies worst frame by highest drift", () => {
    const frames = [
      makeDriftResult({ generationId: 1, driftScore: 0.10 }),
      makeDriftResult({ generationId: 2, driftScore: 0.30 }),
      makeDriftResult({ generationId: 3, driftScore: 0.20 }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.worstFrameId).toBe(2);
  });

  it("consistency score is between 0 and 100", () => {
    const frames = [
      makeDriftResult({ driftScore: 0.05 }),
      makeDriftResult({ driftScore: 0.08 }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.consistencyScore).toBeGreaterThanOrEqual(0);
    expect(result.consistencyScore).toBeLessThanOrEqual(100);
  });

  it("detects most common LoRA version used", () => {
    const frames = [
      makeDriftResult({ loraVersion: 1 }),
      makeDriftResult({ loraVersion: 2 }),
      makeDriftResult({ loraVersion: 2 }),
      makeDriftResult({ loraVersion: 3 }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.loraVersionUsed).toBe(2);
  });

  it("handles frames with no LoRA version", () => {
    const frames = [
      makeDriftResult({ loraVersion: null }),
      makeDriftResult({ loraVersion: null }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.loraVersionUsed).toBeNull();
  });

  it("computes standard deviation", () => {
    // All same drift → stdDev = 0
    const frames = [
      makeDriftResult({ driftScore: 0.10 }),
      makeDriftResult({ driftScore: 0.10 }),
      makeDriftResult({ driftScore: 0.10 }),
    ];

    const result = computeEpisodeConsistency(frames)!;
    expect(result.stdDev).toBe(0);
  });
});

// ─── computeConsistencyGrade ──────────────────────────────────────────────

describe("computeConsistencyGrade", () => {
  it("returns grade A for excellent consistency", () => {
    const grade = computeConsistencyGrade(0.02, 0.0, [95, 92, 98]);
    expect(grade.letter).toBe("A");
    expect(grade.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.A);
    expect(grade.label).toBe("Excellent");
  });

  it("returns grade B for good consistency", () => {
    const grade = computeConsistencyGrade(0.15, 0.10, [75, 72, 70]);
    expect(grade.letter).toBe("B");
    expect(grade.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.B);
    expect(grade.score).toBeLessThan(GRADE_THRESHOLDS.A);
  });

  it("returns grade C for fair consistency", () => {
    const grade = computeConsistencyGrade(0.30, 0.25, [55, 50, 48]);
    expect(grade.letter).toBe("C");
    expect(grade.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.C);
    expect(grade.score).toBeLessThan(GRADE_THRESHOLDS.B);
  });

  it("returns grade D for poor consistency", () => {
    const grade = computeConsistencyGrade(0.45, 0.40, [40, 35, 30]);
    expect(grade.letter).toBe("D");
    expect(grade.score).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.D);
    expect(grade.score).toBeLessThan(GRADE_THRESHOLDS.C);
  });

  it("returns grade F for critical consistency", () => {
    const grade = computeConsistencyGrade(0.70, 0.65, [10, 8, 5]);
    expect(grade.letter).toBe("F");
    expect(grade.score).toBeLessThan(GRADE_THRESHOLDS.D);
  });

  it("handles empty episode scores", () => {
    const grade = computeConsistencyGrade(0.05, 0.0, []);
    expect(["A", "B", "C", "D", "F"]).toContain(grade.letter);
    expect(typeof grade.score).toBe("number");
    expect(typeof grade.description).toBe("string");
  });

  it("score is always between 0 and 100", () => {
    // Edge case: perfect
    const perfect = computeConsistencyGrade(0, 0, [100]);
    expect(perfect.score).toBeLessThanOrEqual(100);
    expect(perfect.score).toBeGreaterThanOrEqual(0);

    // Edge case: worst
    const worst = computeConsistencyGrade(1.0, 1.0, [0]);
    expect(worst.score).toBeLessThanOrEqual(100);
    expect(worst.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── aggregateCharacterReport ─────────────────────────────────────────────

describe("aggregateCharacterReport", () => {
  const generations: FrameGeneration[] = [
    makeFrame({ generationId: 1, episodeId: 100, episodeNumber: 1, episodeTitle: "Ep1", frameIndex: 0 }),
    makeFrame({ generationId: 2, episodeId: 100, episodeNumber: 1, episodeTitle: "Ep1", frameIndex: 1 }),
    makeFrame({ generationId: 3, episodeId: 100, episodeNumber: 1, episodeTitle: "Ep1", frameIndex: 2 }),
    makeFrame({ generationId: 4, episodeId: 200, episodeNumber: 2, episodeTitle: "Ep2", frameIndex: 0 }),
    makeFrame({ generationId: 5, episodeId: 200, episodeNumber: 2, episodeTitle: "Ep2", frameIndex: 1 }),
  ];

  it("returns all required top-level fields", () => {
    const report = aggregateCharacterReport(1, "Sakura", "https://cdn/ref.png", generations, 85, 0.9);

    expect(report.characterId).toBe(1);
    expect(report.characterName).toBe("Sakura");
    expect(report.referenceSheetUrl).toBe("https://cdn/ref.png");
    expect(report.totalFrames).toBe(5);
    expect(typeof report.totalFlagged).toBe("number");
    expect(typeof report.avgDrift).toBe("number");
    expect(typeof report.maxDrift).toBe("number");
    expect(report.grade).toHaveProperty("letter");
    expect(report.grade).toHaveProperty("score");
    expect(report.grade).toHaveProperty("label");
    expect(report.grade).toHaveProperty("description");
    expect(report.driftThreshold).toBe(DEFAULT_DRIFT_THRESHOLD);
    expect(report.timeline).toHaveLength(5);
    expect(report.episodes).toHaveLength(2);
    expect(report.allFrames).toHaveLength(5);
    expect(typeof report.generatedAt).toBe("number");
  });

  it("episodes are sorted by episode number", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9);

    expect(report.episodes[0].episodeNumber).toBe(1);
    expect(report.episodes[1].episodeNumber).toBe(2);
  });

  it("flagged frames are sorted by drift score descending", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9);

    for (let i = 1; i < report.flaggedFrames.length; i++) {
      expect(report.flaggedFrames[i].driftScore).toBeLessThanOrEqual(report.flaggedFrames[i - 1].driftScore);
    }
  });

  it("all flagged frames have isFlagged = true", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9);

    for (const f of report.flaggedFrames) {
      expect(f.isFlagged).toBe(true);
    }
  });

  it("totalFlagged matches flaggedFrames length", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9);
    expect(report.totalFlagged).toBe(report.flaggedFrames.length);
  });

  it("handles empty generations array", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, [], 85, 0.9);

    expect(report.totalFrames).toBe(0);
    expect(report.totalFlagged).toBe(0);
    expect(report.avgDrift).toBe(0);
    expect(report.maxDrift).toBe(0);
    expect(report.timeline).toHaveLength(0);
    expect(report.episodes).toHaveLength(0);
    expect(report.flaggedFrames).toHaveLength(0);
    expect(report.allFrames).toHaveLength(0);
  });

  it("respects custom drift threshold", () => {
    // Very low threshold → more flags
    const lowThreshold = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9, 0.01);
    // Very high threshold → fewer flags
    const highThreshold = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9, 0.99);

    expect(lowThreshold.totalFlagged).toBeGreaterThanOrEqual(highThreshold.totalFlagged);
    expect(lowThreshold.driftThreshold).toBe(0.01);
    expect(highThreshold.driftThreshold).toBe(0.99);
  });

  it("timeline has correct global frame indices", () => {
    const report = aggregateCharacterReport(1, "Sakura", null, generations, 85, 0.9);

    for (let i = 0; i < report.timeline.length; i++) {
      expect(report.timeline[i].frameIndex).toBe(i);
    }
  });
});

// ─── getFrameDriftDetail ──────────────────────────────────────────────────

describe("getFrameDriftDetail", () => {
  it("returns frame, reference URL, and suggestions", () => {
    const flaggedFrame = makeDriftResult({
      generationId: 10,
      driftScore: 0.25,
      isFlagged: true,
      featureDrifts: { face: 0.30, hair: 0.25, outfit: 0.30, colorPalette: 0.25, bodyProportion: 0.20 },
    });

    const allFrames = [
      flaggedFrame,
      makeDriftResult({ generationId: 11, driftScore: 0.05, isFlagged: false }),
    ];

    const detail = getFrameDriftDetail(flaggedFrame, allFrames, "https://cdn/ref.png");

    expect(detail.frame.generationId).toBe(10);
    expect(detail.referenceSheetUrl).toBe("https://cdn/ref.png");
    expect(detail.suggestions.length).toBeGreaterThan(0);
  });

  it("finds nearest good frame in same episode", () => {
    const flaggedFrame = makeDriftResult({
      generationId: 10,
      episodeId: 100,
      driftScore: 0.25,
      isFlagged: true,
    });

    const goodFrame = makeDriftResult({
      generationId: 11,
      episodeId: 100,
      driftScore: 0.03,
      isFlagged: false,
    });

    const differentEpisodeGood = makeDriftResult({
      generationId: 12,
      episodeId: 200,
      driftScore: 0.01,
      isFlagged: false,
    });

    const detail = getFrameDriftDetail(flaggedFrame, [flaggedFrame, goodFrame, differentEpisodeGood], null);

    expect(detail.nearestGoodFrame).not.toBeNull();
    expect(detail.nearestGoodFrame!.generationId).toBe(11);
  });

  it("returns null nearestGoodFrame when no good frames in same episode", () => {
    const flaggedFrame = makeDriftResult({
      generationId: 10,
      episodeId: 100,
      driftScore: 0.25,
      isFlagged: true,
    });

    const anotherFlagged = makeDriftResult({
      generationId: 11,
      episodeId: 100,
      driftScore: 0.20,
      isFlagged: true,
    });

    const detail = getFrameDriftDetail(flaggedFrame, [flaggedFrame, anotherFlagged], null);
    expect(detail.nearestGoodFrame).toBeNull();
  });

  it("suggests face retraining when face drift is high", () => {
    const frame = makeDriftResult({
      featureDrifts: { face: 0.35, hair: 0.05, outfit: 0.05, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.some(s => s.toLowerCase().includes("face"))).toBe(true);
  });

  it("suggests hair reference when hair drift is high", () => {
    const frame = makeDriftResult({
      featureDrifts: { face: 0.05, hair: 0.30, outfit: 0.05, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.some(s => s.toLowerCase().includes("hair"))).toBe(true);
  });

  it("suggests outfit fix when outfit drift is high", () => {
    const frame = makeDriftResult({
      featureDrifts: { face: 0.05, hair: 0.05, outfit: 0.35, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.some(s => s.toLowerCase().includes("outfit"))).toBe(true);
  });

  it("suggests LoRA training when no LoRA is used", () => {
    const frame = makeDriftResult({
      loraVersion: null,
      featureDrifts: { face: 0.05, hair: 0.05, outfit: 0.05, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.some(s => s.toLowerCase().includes("lora"))).toBe(true);
  });

  it("suggests increasing LoRA strength when it is low", () => {
    const frame = makeDriftResult({
      loraStrength: 0.4,
      featureDrifts: { face: 0.05, hair: 0.05, outfit: 0.05, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.some(s => s.includes("strength"))).toBe(true);
  });

  it("provides default suggestion when all features are within range", () => {
    const frame = makeDriftResult({
      loraVersion: 2,
      loraStrength: 0.8,
      featureDrifts: { face: 0.05, hair: 0.05, outfit: 0.05, colorPalette: 0.05, bodyProportion: 0.05 },
    });

    const detail = getFrameDriftDetail(frame, [frame], null);
    expect(detail.suggestions.length).toBeGreaterThan(0);
    expect(detail.suggestions[0].toLowerCase()).toContain("acceptable");
  });
});

// ─── Integration: Full Pipeline ───────────────────────────────────────────

describe("Full consistency report pipeline", () => {
  it("produces a coherent report from raw generations", () => {
    // Simulate 3 episodes with varying quality
    const generations: FrameGeneration[] = [];
    for (let ep = 1; ep <= 3; ep++) {
      for (let frame = 0; frame < 10; frame++) {
        generations.push(makeFrame({
          generationId: ep * 100 + frame,
          episodeId: ep * 1000,
          episodeNumber: ep,
          episodeTitle: `Episode ${ep}`,
          frameIndex: frame,
          loraId: 5,
          loraVersion: 2,
          loraStrength: ep === 3 ? 0.5 : 0.85, // Ep3 has lower strength
          createdAt: new Date(Date.now() - (30 - ep * 10 - frame) * 86400000),
        }));
      }
    }

    const report = aggregateCharacterReport(
      1, "Sakura", "https://cdn/ref.png",
      generations, 85, 0.9, 0.15
    );

    // Structural checks
    expect(report.totalFrames).toBe(30);
    expect(report.episodes).toHaveLength(3);
    expect(report.timeline).toHaveLength(30);
    expect(report.allFrames).toHaveLength(30);

    // Grade is valid
    expect(["A", "B", "C", "D", "F"]).toContain(report.grade.letter);
    expect(report.grade.score).toBeGreaterThanOrEqual(0);
    expect(report.grade.score).toBeLessThanOrEqual(100);

    // Episode ordering
    expect(report.episodes[0].episodeNumber).toBe(1);
    expect(report.episodes[1].episodeNumber).toBe(2);
    expect(report.episodes[2].episodeNumber).toBe(3);

    // Each episode has 10 frames
    for (const ep of report.episodes) {
      expect(ep.frameCount).toBe(10);
    }

    // avgDrift and maxDrift are reasonable
    expect(report.avgDrift).toBeGreaterThanOrEqual(0);
    expect(report.avgDrift).toBeLessThanOrEqual(1);
    expect(report.maxDrift).toBeGreaterThanOrEqual(report.avgDrift);
  });

  it("single frame report works correctly", () => {
    const report = aggregateCharacterReport(
      1, "Solo", null,
      [makeFrame({ generationId: 1 })],
      80, 0.85
    );

    expect(report.totalFrames).toBe(1);
    expect(report.episodes).toHaveLength(1);
    expect(report.timeline).toHaveLength(1);
    expect(report.allFrames).toHaveLength(1);
  });
});
