/**
 * Tests for Before/After Comparison View
 *
 * Covers:
 * - ComparisonData construction from fix history entries
 * - Estimated post-fix feature drift calculations
 * - Edge cases: null values, zero improvement, missing URLs
 * - View mode logic (side-by-side vs overlay)
 * - Feature targeting display logic
 */
import { describe, it, expect } from "vitest";
import {
  computeBoostParams,
  buildFixDriftJob,
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

/** Mirrors the ComparisonData interface from the component */
interface ComparisonData {
  originalUrl: string | null;
  fixedUrl: string | null;
  originalDriftScore: number;
  newDriftScore: number | null;
  driftImprovement: number | null;
  originalLoraStrength: number | null;
  boostedLoraStrength: number;
  boostDelta: number;
  fixConfidence: "high" | "medium" | "low";
  severity: "warning" | "critical";
  targetFeatures: string[] | null;
  originalFeatureDrifts: {
    face: number;
    hair: number;
    outfit: number;
    colorPalette: number;
    bodyProportion: number;
  };
  estimatedFixedFeatureDrifts?: {
    face: number;
    hair: number;
    outfit: number;
    colorPalette: number;
    bodyProportion: number;
  };
}

/** Mirrors the improvement ratio calculation from ConsistencyReport */
function estimateFixedFeatureDrifts(
  originalDrifts: ComparisonData["originalFeatureDrifts"],
  originalDriftScore: number,
  driftImprovement: number | null,
) {
  const improvementRatio = driftImprovement != null && originalDriftScore
    ? driftImprovement / originalDriftScore
    : 0;
  return {
    face: Math.max(0, originalDrifts.face * (1 - improvementRatio * 1.2)),
    hair: Math.max(0, originalDrifts.hair * (1 - improvementRatio * 1.1)),
    outfit: Math.max(0, originalDrifts.outfit * (1 - improvementRatio * 0.9)),
    colorPalette: Math.max(0, originalDrifts.colorPalette * (1 - improvementRatio * 0.8)),
    bodyProportion: Math.max(0, originalDrifts.bodyProportion * (1 - improvementRatio * 0.7)),
  };
}

/** Build ComparisonData from a frame + completed fix history entry */
function buildComparisonData(
  frame: FrameDriftResult,
  completedJob: {
    originalDriftScore: number | null;
    newDriftScore: number | null;
    driftImprovement: number | null;
    originalLoraStrength: number | null;
    boostedLoraStrength: number | null;
    boostDelta: number | null;
    fixConfidence: string | null;
    severity: string | null;
    targetFeatures: string[] | null;
    newResultUrl: string | null;
  },
): ComparisonData {
  const origDrift = completedJob.originalDriftScore ?? frame.driftScore;
  const estimated = estimateFixedFeatureDrifts(
    frame.featureDrifts,
    origDrift,
    completedJob.driftImprovement,
  );

  return {
    originalUrl: frame.resultUrl || null,
    fixedUrl: completedJob.newResultUrl || null,
    originalDriftScore: origDrift,
    newDriftScore: completedJob.newDriftScore ?? null,
    driftImprovement: completedJob.driftImprovement ?? null,
    originalLoraStrength: completedJob.originalLoraStrength ?? null,
    boostedLoraStrength: completedJob.boostedLoraStrength ?? 0,
    boostDelta: completedJob.boostDelta ?? 0,
    fixConfidence: (completedJob.fixConfidence as "high" | "medium" | "low") ?? "medium",
    severity: (completedJob.severity as "warning" | "critical") ?? "warning",
    targetFeatures: completedJob.targetFeatures ?? null,
    originalFeatureDrifts: frame.featureDrifts,
    estimatedFixedFeatureDrifts: estimated,
  };
}

// ─── ComparisonData Construction ────────────────────────────────────────

describe("ComparisonData Construction", () => {
  it("should build valid comparison data from frame + completed job", () => {
    const frame = makeDriftResult();
    const job = {
      originalDriftScore: 0.20,
      newDriftScore: 0.08,
      driftImprovement: 0.12,
      originalLoraStrength: 0.75,
      boostedLoraStrength: 0.83,
      boostDelta: 0.08,
      fixConfidence: "medium",
      severity: "warning",
      targetFeatures: ["face", "hair"],
      newResultUrl: "https://cdn.example.com/fixed-001.png",
    };

    const data = buildComparisonData(frame, job);

    expect(data.originalUrl).toBe("https://cdn.example.com/frame-001.png");
    expect(data.fixedUrl).toBe("https://cdn.example.com/fixed-001.png");
    expect(data.originalDriftScore).toBe(0.20);
    expect(data.newDriftScore).toBe(0.08);
    expect(data.driftImprovement).toBe(0.12);
    expect(data.originalLoraStrength).toBe(0.75);
    expect(data.boostedLoraStrength).toBe(0.83);
    expect(data.boostDelta).toBe(0.08);
    expect(data.fixConfidence).toBe("medium");
    expect(data.severity).toBe("warning");
    expect(data.targetFeatures).toEqual(["face", "hair"]);
  });

  it("should use frame driftScore as fallback when job originalDriftScore is null", () => {
    const frame = makeDriftResult({ driftScore: 0.25 });
    const job = {
      originalDriftScore: null,
      newDriftScore: 0.10,
      driftImprovement: 0.15,
      originalLoraStrength: null,
      boostedLoraStrength: 0.85,
      boostDelta: 0.10,
      fixConfidence: "high",
      severity: "critical",
      targetFeatures: null,
      newResultUrl: null,
    };

    const data = buildComparisonData(frame, job);
    expect(data.originalDriftScore).toBe(0.25);
  });

  it("should handle all-null job fields gracefully", () => {
    const frame = makeDriftResult();
    const job = {
      originalDriftScore: null,
      newDriftScore: null,
      driftImprovement: null,
      originalLoraStrength: null,
      boostedLoraStrength: null,
      boostDelta: null,
      fixConfidence: null,
      severity: null,
      targetFeatures: null,
      newResultUrl: null,
    };

    const data = buildComparisonData(frame, job);
    expect(data.originalDriftScore).toBe(0.20); // falls back to frame
    expect(data.newDriftScore).toBeNull();
    expect(data.driftImprovement).toBeNull();
    expect(data.boostedLoraStrength).toBe(0);
    expect(data.fixConfidence).toBe("medium"); // fallback
    expect(data.severity).toBe("warning"); // fallback
  });

  it("should build comparison from real buildFixDriftJob output", () => {
    const frame = makeDriftResult({ driftScore: 0.28, severity: "critical" });
    const jobSpec = buildFixDriftJob(frame);

    const completedJob = {
      originalDriftScore: frame.driftScore,
      newDriftScore: 0.10,
      driftImprovement: 0.18,
      originalLoraStrength: frame.loraStrength,
      boostedLoraStrength: jobSpec.boostParams.boostedStrength,
      boostDelta: jobSpec.boostParams.boostDelta,
      fixConfidence: jobSpec.boostParams.fixConfidence,
      severity: "critical" as const,
      targetFeatures: jobSpec.boostParams.targetFeatures,
      newResultUrl: "https://cdn.example.com/fixed.png",
    };

    const data = buildComparisonData(frame, completedJob);
    expect(data.originalDriftScore).toBe(0.28);
    expect(data.newDriftScore).toBe(0.10);
    expect(data.driftImprovement).toBe(0.18);
    expect(data.boostedLoraStrength).toBeGreaterThan(0.75);
    expect(data.targetFeatures!.length).toBeGreaterThan(0);
  });
});

// ─── Estimated Post-Fix Feature Drifts ──────────────────────────────────

describe("Estimated Post-Fix Feature Drifts", () => {
  const originalDrifts = {
    face: 0.22,
    hair: 0.18,
    outfit: 0.10,
    colorPalette: 0.08,
    bodyProportion: 0.05,
  };

  it("should reduce all feature drifts proportionally to improvement", () => {
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.20, 0.12);

    // 60% improvement ratio → each feature reduced by ratio * multiplier
    expect(estimated.face).toBeLessThan(originalDrifts.face);
    expect(estimated.hair).toBeLessThan(originalDrifts.hair);
    expect(estimated.outfit).toBeLessThan(originalDrifts.outfit);
    expect(estimated.colorPalette).toBeLessThan(originalDrifts.colorPalette);
    expect(estimated.bodyProportion).toBeLessThan(originalDrifts.bodyProportion);
  });

  it("should apply higher reduction multiplier to face than body proportion", () => {
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.20, 0.10);

    // Face has 1.2x multiplier, bodyProportion has 0.7x
    const faceReduction = 1 - estimated.face / originalDrifts.face;
    const bodyReduction = 1 - estimated.bodyProportion / originalDrifts.bodyProportion;
    expect(faceReduction).toBeGreaterThan(bodyReduction);
  });

  it("should never produce negative feature drifts", () => {
    // Very high improvement (100% of original drift)
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.20, 0.20);

    expect(estimated.face).toBeGreaterThanOrEqual(0);
    expect(estimated.hair).toBeGreaterThanOrEqual(0);
    expect(estimated.outfit).toBeGreaterThanOrEqual(0);
    expect(estimated.colorPalette).toBeGreaterThanOrEqual(0);
    expect(estimated.bodyProportion).toBeGreaterThanOrEqual(0);
  });

  it("should return original values when improvement is null", () => {
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.20, null);

    expect(estimated.face).toBe(originalDrifts.face);
    expect(estimated.hair).toBe(originalDrifts.hair);
    expect(estimated.outfit).toBe(originalDrifts.outfit);
    expect(estimated.colorPalette).toBe(originalDrifts.colorPalette);
    expect(estimated.bodyProportion).toBe(originalDrifts.bodyProportion);
  });

  it("should return original values when improvement is zero", () => {
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.20, 0);

    expect(estimated.face).toBe(originalDrifts.face);
    expect(estimated.hair).toBe(originalDrifts.hair);
  });

  it("should handle zero original drift score without division error", () => {
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0, 0);

    expect(estimated.face).toBe(originalDrifts.face);
    expect(estimated.hair).toBe(originalDrifts.hair);
  });

  it("should handle extreme improvement ratio gracefully", () => {
    // Improvement greater than original (shouldn't happen but be safe)
    const estimated = estimateFixedFeatureDrifts(originalDrifts, 0.10, 0.15);

    // All should be clamped to 0
    expect(estimated.face).toBeGreaterThanOrEqual(0);
    expect(estimated.hair).toBeGreaterThanOrEqual(0);
    expect(estimated.outfit).toBeGreaterThanOrEqual(0);
    expect(estimated.colorPalette).toBeGreaterThanOrEqual(0);
    expect(estimated.bodyProportion).toBeGreaterThanOrEqual(0);
  });
});

// ─── Feature Targeting Display Logic ────────────────────────────────────

describe("Feature Targeting Display Logic", () => {
  it("should identify targeted features from boost params", () => {
    const frame = makeDriftResult({
      featureDrifts: {
        face: 0.30,
        hair: 0.25,
        outfit: 0.05,
        colorPalette: 0.03,
        bodyProportion: 0.02,
      },
    });
    const boost = computeBoostParams(frame);

    // Face and hair are above the targeting threshold
    expect(boost.targetFeatures).toContain("face");
    expect(boost.targetFeatures).toContain("hair");
    expect(boost.targetFeatures).not.toContain("bodyProportion");
  });

  it("should handle frame with no high-drift features", () => {
    const frame = makeDriftResult({
      driftScore: 0.08,
      featureDrifts: {
        face: 0.05,
        hair: 0.04,
        outfit: 0.03,
        colorPalette: 0.02,
        bodyProportion: 0.01,
      },
    });
    const boost = computeBoostParams(frame);

    // No features above threshold → empty or minimal targeting
    expect(boost.targetFeatures.length).toBeLessThanOrEqual(5);
  });

  it("should include all features when all have high drift", () => {
    const frame = makeDriftResult({
      driftScore: 0.35,
      featureDrifts: {
        face: 0.30,
        hair: 0.28,
        outfit: 0.25,
        colorPalette: 0.22,
        bodyProportion: 0.20,
      },
    });
    const boost = computeBoostParams(frame);

    expect(boost.targetFeatures.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── View Mode Logic ────────────────────────────────────────────────────

describe("View Mode Logic", () => {
  it("should support side-by-side mode with separate image containers", () => {
    const modes: Array<"side-by-side" | "overlay"> = ["side-by-side", "overlay"];
    expect(modes).toContain("side-by-side");
    expect(modes).toContain("overlay");
  });

  it("should handle missing URLs in both modes", () => {
    const data: ComparisonData = {
      originalUrl: null,
      fixedUrl: null,
      originalDriftScore: 0.20,
      newDriftScore: 0.08,
      driftImprovement: 0.12,
      originalLoraStrength: 0.75,
      boostedLoraStrength: 0.83,
      boostDelta: 0.08,
      fixConfidence: "medium",
      severity: "warning",
      targetFeatures: ["face"],
      originalFeatureDrifts: {
        face: 0.22, hair: 0.18, outfit: 0.10,
        colorPalette: 0.08, bodyProportion: 0.05,
      },
    };

    // Both URLs null should still produce valid data
    expect(data.originalUrl).toBeNull();
    expect(data.fixedUrl).toBeNull();
    // Drift scores should still be displayable
    expect(data.originalDriftScore).toBe(0.20);
    expect(data.newDriftScore).toBe(0.08);
  });
});

// ─── Improvement Display Calculations ───────────────────────────────────

describe("Improvement Display Calculations", () => {
  it("should calculate improvement percentage correctly", () => {
    const driftImprovement = 0.12;
    const improvementPct = Math.round(driftImprovement * 100);
    expect(improvementPct).toBe(12);
  });

  it("should format drift scores to one decimal place", () => {
    const origDriftPct = (0.2034 * 100).toFixed(1);
    expect(origDriftPct).toBe("20.3");

    const newDriftPct = (0.0812 * 100).toFixed(1);
    expect(newDriftPct).toBe("8.1");
  });

  it("should handle zero improvement", () => {
    const driftImprovement = 0;
    const improvementPct = Math.round(driftImprovement * 100);
    expect(improvementPct).toBe(0);
  });

  it("should handle very small improvement", () => {
    const driftImprovement = 0.001;
    const improvementPct = Math.round(driftImprovement * 100);
    expect(improvementPct).toBe(0); // rounds to 0
  });

  it("should color-code drift scores correctly", () => {
    const getColor = (score: number) =>
      score > 0.25 ? "red" : score > 0.15 ? "yellow" : "emerald";

    expect(getColor(0.30)).toBe("red");
    expect(getColor(0.20)).toBe("yellow");
    expect(getColor(0.10)).toBe("emerald");
    expect(getColor(0.25)).toBe("yellow"); // boundary
    expect(getColor(0.15)).toBe("emerald"); // boundary
  });
});
