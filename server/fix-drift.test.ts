/**
 * Tests for Fix Drift Module
 * Covers: computeBoostParams, buildFixDriftJob, estimateFixDriftBatch,
 * simulateFixDriftStatus, formatDuration, edge cases
 */
import { describe, it, expect } from "vitest";
import {
  computeBoostParams,
  buildFixDriftJob,
  estimateFixDriftBatch,
  simulateFixDriftStatus,
  formatDuration,
  BASE_REGEN_CREDITS,
  BOOST_CREDIT_MULTIPLIER,
  BASE_REGEN_SECONDS,
  MAX_LORA_STRENGTH,
  MIN_LORA_STRENGTH,
  DEFAULT_ORIGINAL_STRENGTH,
  FEATURE_TARGET_THRESHOLD,
  type BoostParams,
  type FixDriftJobSpec,
  type FixDriftBatchEstimate,
  type FixDriftJobStatus,
} from "./fix-drift";
import type { FrameDriftResult } from "./consistency-analysis";

// ─── Helpers ──────────────────────────────────────────────────────────────

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
    driftScore: 0.20,
    clipDrift: 0.16,
    featureDrifts: {
      face: 0.22,
      hair: 0.18,
      outfit: 0.10,
      colorPalette: 0.08,
      bodyProportion: 0.05,
    },
    isFlagged: true,
    severity: "warning",
    loraVersion: 2,
    loraStrength: 0.75,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── computeBoostParams ──────────────────────────────────────────────────

describe("computeBoostParams", () => {
  it("returns all required fields", () => {
    const frame = makeDriftResult();
    const result = computeBoostParams(frame);

    expect(result).toHaveProperty("originalStrength");
    expect(result).toHaveProperty("boostedStrength");
    expect(result).toHaveProperty("boostDelta");
    expect(result).toHaveProperty("targetFeatures");
    expect(result).toHaveProperty("negativePromptAdditions");
    expect(result).toHaveProperty("fixConfidence");
  });

  it("uses frame loraStrength as original strength", () => {
    const frame = makeDriftResult({ loraStrength: 0.60 });
    const result = computeBoostParams(frame);
    expect(result.originalStrength).toBe(0.60);
  });

  it("uses DEFAULT_ORIGINAL_STRENGTH when loraStrength is null", () => {
    const frame = makeDriftResult({ loraStrength: null });
    const result = computeBoostParams(frame);
    expect(result.originalStrength).toBe(DEFAULT_ORIGINAL_STRENGTH);
  });

  it("boost delta scales with drift score", () => {
    const low = computeBoostParams(makeDriftResult({ driftScore: 0.10 }));
    const mid = computeBoostParams(makeDriftResult({ driftScore: 0.25 }));
    const high = computeBoostParams(makeDriftResult({ driftScore: 0.40 }));

    expect(low.boostDelta).toBeLessThan(mid.boostDelta);
    expect(mid.boostDelta).toBeLessThanOrEqual(high.boostDelta);
  });

  it("caps boost delta at 0.15", () => {
    const extreme = computeBoostParams(makeDriftResult({ driftScore: 0.80 }));
    // rawBoost = min(0.15, 0.80 * 0.4) = min(0.15, 0.32) = 0.15
    expect(extreme.boostDelta).toBeLessThanOrEqual(0.15);
  });

  it("clamps boosted strength to MAX_LORA_STRENGTH", () => {
    const frame = makeDriftResult({ loraStrength: 0.90, driftScore: 0.40 });
    const result = computeBoostParams(frame);
    expect(result.boostedStrength).toBeLessThanOrEqual(MAX_LORA_STRENGTH);
  });

  it("clamps boosted strength to MIN_LORA_STRENGTH", () => {
    const frame = makeDriftResult({ loraStrength: 0.45, driftScore: 0.01 });
    const result = computeBoostParams(frame);
    expect(result.boostedStrength).toBeGreaterThanOrEqual(MIN_LORA_STRENGTH);
  });

  it("boostedStrength >= originalStrength", () => {
    const frame = makeDriftResult({ loraStrength: 0.70, driftScore: 0.20 });
    const result = computeBoostParams(frame);
    expect(result.boostedStrength).toBeGreaterThanOrEqual(result.originalStrength);
  });

  it("targets features with drift >= FEATURE_TARGET_THRESHOLD", () => {
    const frame = makeDriftResult({
      featureDrifts: {
        face: 0.30,       // above threshold
        hair: 0.20,       // above threshold
        outfit: 0.10,     // below threshold
        colorPalette: 0.05, // below threshold
        bodyProportion: 0.02, // below threshold
      },
    });
    const result = computeBoostParams(frame);
    expect(result.targetFeatures).toContain("face");
    expect(result.targetFeatures).toContain("hair");
    expect(result.targetFeatures).not.toContain("outfit");
    expect(result.targetFeatures).not.toContain("colorPalette");
    expect(result.targetFeatures).not.toContain("bodyProportion");
  });

  it("adds negative prompt additions for targeted features", () => {
    const frame = makeDriftResult({
      featureDrifts: {
        face: 0.30,
        hair: 0.05,
        outfit: 0.25,
        colorPalette: 0.05,
        bodyProportion: 0.05,
      },
    });
    const result = computeBoostParams(frame);
    expect(result.negativePromptAdditions.length).toBe(2); // face + outfit
    expect(result.negativePromptAdditions.some(s => s.includes("face"))).toBe(true);
    expect(result.negativePromptAdditions.some(s => s.includes("clothing"))).toBe(true);
  });

  it("returns high confidence for low drift with LoRA", () => {
    const frame = makeDriftResult({ driftScore: 0.15, loraVersion: 3 });
    const result = computeBoostParams(frame);
    expect(result.fixConfidence).toBe("high");
  });

  it("returns medium confidence for moderate drift with LoRA", () => {
    const frame = makeDriftResult({ driftScore: 0.25, loraVersion: 2 });
    const result = computeBoostParams(frame);
    expect(result.fixConfidence).toBe("medium");
  });

  it("returns low confidence for severe drift", () => {
    const frame = makeDriftResult({ driftScore: 0.40, loraVersion: 2 });
    const result = computeBoostParams(frame);
    expect(result.fixConfidence).toBe("low");
  });

  it("returns low confidence when no LoRA version", () => {
    const frame = makeDriftResult({ driftScore: 0.15, loraVersion: null });
    const result = computeBoostParams(frame);
    expect(result.fixConfidence).toBe("low");
  });

  it("handles zero drift score", () => {
    const frame = makeDriftResult({ driftScore: 0 });
    const result = computeBoostParams(frame);
    expect(result.boostDelta).toBe(0);
    expect(result.boostedStrength).toBe(result.originalStrength);
  });

  it("handles all features above threshold", () => {
    const frame = makeDriftResult({
      featureDrifts: {
        face: 0.30,
        hair: 0.25,
        outfit: 0.20,
        colorPalette: 0.22,
        bodyProportion: 0.19,
      },
    });
    const result = computeBoostParams(frame);
    expect(result.targetFeatures.length).toBe(5);
    expect(result.negativePromptAdditions.length).toBe(5);
  });

  it("handles no features above threshold", () => {
    const frame = makeDriftResult({
      featureDrifts: {
        face: 0.05,
        hair: 0.03,
        outfit: 0.02,
        colorPalette: 0.01,
        bodyProportion: 0.01,
      },
    });
    const result = computeBoostParams(frame);
    expect(result.targetFeatures.length).toBe(0);
    expect(result.negativePromptAdditions.length).toBe(0);
  });
});

// ─── buildFixDriftJob ────────────────────────────────────────────────────

describe("buildFixDriftJob", () => {
  it("returns all required fields", () => {
    const frame = makeDriftResult();
    const job = buildFixDriftJob(frame);

    expect(job).toHaveProperty("generationId");
    expect(job).toHaveProperty("episodeId");
    expect(job).toHaveProperty("sceneId");
    expect(job).toHaveProperty("frameIndex");
    expect(job).toHaveProperty("originalResultUrl");
    expect(job).toHaveProperty("driftScore");
    expect(job).toHaveProperty("severity");
    expect(job).toHaveProperty("boostParams");
    expect(job).toHaveProperty("estimatedCredits");
    expect(job).toHaveProperty("estimatedSeconds");
  });

  it("preserves frame identity fields", () => {
    const frame = makeDriftResult({
      generationId: 42,
      episodeId: 200,
      sceneId: 15,
      frameIndex: 7,
      resultUrl: "https://cdn.example.com/test.png",
    });
    const job = buildFixDriftJob(frame);

    expect(job.generationId).toBe(42);
    expect(job.episodeId).toBe(200);
    expect(job.sceneId).toBe(15);
    expect(job.frameIndex).toBe(7);
    expect(job.originalResultUrl).toBe("https://cdn.example.com/test.png");
  });

  it("maps severity correctly", () => {
    const warning = buildFixDriftJob(makeDriftResult({ severity: "warning" }));
    expect(warning.severity).toBe("warning");

    const critical = buildFixDriftJob(makeDriftResult({ severity: "critical" }));
    expect(critical.severity).toBe("critical");
  });

  it("credits include base + boost addon", () => {
    const frame = makeDriftResult({ driftScore: 0.20, loraStrength: 0.75 });
    const job = buildFixDriftJob(frame);

    expect(job.estimatedCredits).toBeGreaterThanOrEqual(BASE_REGEN_CREDITS);
  });

  it("higher drift = more credits", () => {
    const lowDrift = buildFixDriftJob(makeDriftResult({ driftScore: 0.10 }));
    const highDrift = buildFixDriftJob(makeDriftResult({ driftScore: 0.40 }));

    expect(highDrift.estimatedCredits).toBeGreaterThanOrEqual(lowDrift.estimatedCredits);
  });

  it("estimated seconds are positive and reasonable", () => {
    const job = buildFixDriftJob(makeDriftResult());
    expect(job.estimatedSeconds).toBeGreaterThan(0);
    expect(job.estimatedSeconds).toBeLessThan(300); // under 5 min for single frame
  });

  it("higher drift = longer estimated time", () => {
    const lowDrift = buildFixDriftJob(makeDriftResult({ driftScore: 0.10 }));
    const highDrift = buildFixDriftJob(makeDriftResult({ driftScore: 0.40 }));

    expect(highDrift.estimatedSeconds).toBeGreaterThanOrEqual(lowDrift.estimatedSeconds);
  });

  it("handles null sceneId", () => {
    const frame = makeDriftResult({ sceneId: null });
    const job = buildFixDriftJob(frame);
    expect(job.sceneId).toBeNull();
  });
});

// ─── estimateFixDriftBatch ───────────────────────────────────────────────

describe("estimateFixDriftBatch", () => {
  it("returns all required fields", () => {
    const frames = [makeDriftResult()];
    const estimate = estimateFixDriftBatch(frames);

    expect(estimate).toHaveProperty("totalFrames");
    expect(estimate).toHaveProperty("criticalFrames");
    expect(estimate).toHaveProperty("warningFrames");
    expect(estimate).toHaveProperty("totalEstimatedCredits");
    expect(estimate).toHaveProperty("totalEstimatedSeconds");
    expect(estimate).toHaveProperty("avgBoostDelta");
    expect(estimate).toHaveProperty("jobs");
  });

  it("filters out non-flagged frames", () => {
    const frames = [
      makeDriftResult({ severity: "warning", generationId: 1 }),
      makeDriftResult({ severity: "ok", generationId: 2 }),
      makeDriftResult({ severity: "critical", generationId: 3 }),
    ];
    const estimate = estimateFixDriftBatch(frames);

    expect(estimate.totalFrames).toBe(2);
    expect(estimate.jobs.length).toBe(2);
  });

  it("counts critical and warning frames correctly", () => {
    const frames = [
      makeDriftResult({ severity: "critical", generationId: 1 }),
      makeDriftResult({ severity: "critical", generationId: 2 }),
      makeDriftResult({ severity: "warning", generationId: 3 }),
    ];
    const estimate = estimateFixDriftBatch(frames);

    expect(estimate.criticalFrames).toBe(2);
    expect(estimate.warningFrames).toBe(1);
  });

  it("aggregates credits and time correctly", () => {
    const frames = [
      makeDriftResult({ severity: "warning", generationId: 1, driftScore: 0.20 }),
      makeDriftResult({ severity: "warning", generationId: 2, driftScore: 0.20 }),
    ];
    const estimate = estimateFixDriftBatch(frames);

    const singleJob = buildFixDriftJob(frames[0]);
    expect(estimate.totalEstimatedCredits).toBe(singleJob.estimatedCredits * 2);
    expect(estimate.totalEstimatedSeconds).toBe(singleJob.estimatedSeconds * 2);
  });

  it("handles empty array", () => {
    const estimate = estimateFixDriftBatch([]);
    expect(estimate.totalFrames).toBe(0);
    expect(estimate.criticalFrames).toBe(0);
    expect(estimate.warningFrames).toBe(0);
    expect(estimate.totalEstimatedCredits).toBe(0);
    expect(estimate.totalEstimatedSeconds).toBe(0);
    expect(estimate.avgBoostDelta).toBe(0);
    expect(estimate.jobs.length).toBe(0);
  });

  it("handles all ok frames (none flagged)", () => {
    const frames = [
      makeDriftResult({ severity: "ok", generationId: 1 }),
      makeDriftResult({ severity: "ok", generationId: 2 }),
    ];
    const estimate = estimateFixDriftBatch(frames);
    expect(estimate.totalFrames).toBe(0);
    expect(estimate.jobs.length).toBe(0);
  });

  it("computes average boost delta", () => {
    const frames = [
      makeDriftResult({ severity: "warning", generationId: 1, driftScore: 0.20 }),
      makeDriftResult({ severity: "critical", generationId: 2, driftScore: 0.40 }),
    ];
    const estimate = estimateFixDriftBatch(frames);

    expect(estimate.avgBoostDelta).toBeGreaterThan(0);
    expect(estimate.avgBoostDelta).toBeLessThanOrEqual(0.15);
  });
});

// ─── simulateFixDriftStatus ──────────────────────────────────────────────

describe("simulateFixDriftStatus", () => {
  it("returns all required fields", () => {
    const status = simulateFixDriftStatus(42, 0.25);

    expect(status).toHaveProperty("generationId");
    expect(status).toHaveProperty("status");
    expect(status).toHaveProperty("progress");
    expect(status).toHaveProperty("newResultUrl");
    expect(status).toHaveProperty("newDriftScore");
    expect(status).toHaveProperty("driftImprovement");
    expect(status).toHaveProperty("errorMessage");
    expect(status).toHaveProperty("startedAt");
    expect(status).toHaveProperty("completedAt");
  });

  it("returns completed status", () => {
    const status = simulateFixDriftStatus(42, 0.25);
    expect(status.status).toBe("completed");
    expect(status.progress).toBe(100);
  });

  it("preserves generationId", () => {
    const status = simulateFixDriftStatus(99, 0.30);
    expect(status.generationId).toBe(99);
  });

  it("new drift score is lower than original", () => {
    const status = simulateFixDriftStatus(1, 0.30);
    expect(status.newDriftScore).not.toBeNull();
    expect(status.newDriftScore!).toBeLessThan(0.30);
    expect(status.newDriftScore!).toBeGreaterThanOrEqual(0);
  });

  it("drift improvement is positive", () => {
    const status = simulateFixDriftStatus(1, 0.25);
    expect(status.driftImprovement).not.toBeNull();
    expect(status.driftImprovement!).toBeGreaterThan(0);
  });

  it("improvement is 30-70% of original drift", () => {
    // Run multiple times to check range (statistical test)
    for (let i = 0; i < 20; i++) {
      const status = simulateFixDriftStatus(i, 0.30);
      const improvementPct = status.driftImprovement! / 0.30;
      expect(improvementPct).toBeGreaterThanOrEqual(0.29); // slight tolerance
      expect(improvementPct).toBeLessThanOrEqual(0.71);
    }
  });

  it("has no error message on success", () => {
    const status = simulateFixDriftStatus(1, 0.20);
    expect(status.errorMessage).toBeNull();
  });

  it("has timestamps", () => {
    const status = simulateFixDriftStatus(1, 0.20);
    expect(status.startedAt).not.toBeNull();
    expect(status.completedAt).not.toBeNull();
    expect(status.completedAt!).toBeGreaterThanOrEqual(status.startedAt!);
  });
});

// ─── formatDuration ──────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(1)).toBe("1s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes only (exact)", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(300)).toBe("5m");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(150)).toBe("2m 30s");
  });

  it("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

// ─── Constants ───────────────────────────────────────────────────────────

describe("exported constants", () => {
  it("BASE_REGEN_CREDITS is a positive number", () => {
    expect(BASE_REGEN_CREDITS).toBeGreaterThan(0);
  });

  it("BOOST_CREDIT_MULTIPLIER is a positive number", () => {
    expect(BOOST_CREDIT_MULTIPLIER).toBeGreaterThan(0);
  });

  it("BASE_REGEN_SECONDS is a positive number", () => {
    expect(BASE_REGEN_SECONDS).toBeGreaterThan(0);
  });

  it("MAX_LORA_STRENGTH > MIN_LORA_STRENGTH", () => {
    expect(MAX_LORA_STRENGTH).toBeGreaterThan(MIN_LORA_STRENGTH);
  });

  it("DEFAULT_ORIGINAL_STRENGTH is within valid range", () => {
    expect(DEFAULT_ORIGINAL_STRENGTH).toBeGreaterThanOrEqual(MIN_LORA_STRENGTH);
    expect(DEFAULT_ORIGINAL_STRENGTH).toBeLessThanOrEqual(MAX_LORA_STRENGTH);
  });

  it("FEATURE_TARGET_THRESHOLD is between 0 and 1", () => {
    expect(FEATURE_TARGET_THRESHOLD).toBeGreaterThan(0);
    expect(FEATURE_TARGET_THRESHOLD).toBeLessThan(1);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles frame with maximum drift score (1.0)", () => {
    const frame = makeDriftResult({ driftScore: 1.0 });
    const params = computeBoostParams(frame);
    expect(params.boostDelta).toBeLessThanOrEqual(0.15);
    expect(params.boostedStrength).toBeLessThanOrEqual(MAX_LORA_STRENGTH);

    const job = buildFixDriftJob(frame);
    expect(job.estimatedCredits).toBeGreaterThan(BASE_REGEN_CREDITS);
  });

  it("handles frame with very small drift score", () => {
    const frame = makeDriftResult({ driftScore: 0.001 });
    const params = computeBoostParams(frame);
    expect(params.boostDelta).toBeGreaterThanOrEqual(0);
    expect(params.boostedStrength).toBeGreaterThanOrEqual(MIN_LORA_STRENGTH);
  });

  it("handles frame with loraStrength at MAX_LORA_STRENGTH", () => {
    const frame = makeDriftResult({ loraStrength: MAX_LORA_STRENGTH, driftScore: 0.20 });
    const params = computeBoostParams(frame);
    expect(params.boostedStrength).toBe(MAX_LORA_STRENGTH);
    expect(params.boostDelta).toBe(0); // can't boost further
  });

  it("handles frame with loraStrength at MIN_LORA_STRENGTH", () => {
    const frame = makeDriftResult({ loraStrength: MIN_LORA_STRENGTH, driftScore: 0.20 });
    const params = computeBoostParams(frame);
    expect(params.boostedStrength).toBeGreaterThanOrEqual(MIN_LORA_STRENGTH);
    expect(params.boostDelta).toBeGreaterThanOrEqual(0);
  });

  it("batch with mixed severity levels", () => {
    const frames = [
      makeDriftResult({ severity: "ok", generationId: 1 }),
      makeDriftResult({ severity: "warning", generationId: 2 }),
      makeDriftResult({ severity: "critical", generationId: 3 }),
      makeDriftResult({ severity: "ok", generationId: 4 }),
      makeDriftResult({ severity: "warning", generationId: 5 }),
    ];
    const estimate = estimateFixDriftBatch(frames);
    expect(estimate.totalFrames).toBe(3); // 2 warning + 1 critical
    expect(estimate.criticalFrames).toBe(1);
    expect(estimate.warningFrames).toBe(2);
  });

  it("single frame batch", () => {
    const frames = [makeDriftResult({ severity: "critical", generationId: 1 })];
    const estimate = estimateFixDriftBatch(frames);
    expect(estimate.totalFrames).toBe(1);
    expect(estimate.jobs.length).toBe(1);
    expect(estimate.avgBoostDelta).toBeGreaterThan(0);
  });
});
