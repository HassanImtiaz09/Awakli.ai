import { describe, it, expect } from "vitest";
import {
  computeImprovementTrend,
  buildFrameFixSummaries,
  analyzeDiminishingReturns,
  identifyWeakFeatures,
  assessRetrainingUrgency,
  generateRetrainingRecommendation,
  MIN_ATTEMPTS_FOR_RECOMMENDATION,
  IMPROVEMENT_PLATEAU_THRESHOLD,
  WEAK_FEATURE_THRESHOLD,
  HIGH_REMAINING_DRIFT,
  CRITICAL_REMAINING_DRIFT,
  FEATURE_LABELS,
  type FixAttemptRecord,
  type DiminishingReturnsAnalysis,
} from "./lora-retraining-recommendation";

// ─── Helpers ────────────────────────────────────────────────────────────

function makeAttempt(overrides: Partial<FixAttemptRecord> = {}): FixAttemptRecord {
  return {
    jobId: 1,
    generationId: 100,
    frameIndex: 0,
    episodeId: 1,
    originalDriftScore: 0.35,
    newDriftScore: 0.20,
    driftImprovement: 0.15,
    boostedLoraStrength: 0.85,
    boostDelta: 0.10,
    targetFeatures: ["face", "hair"],
    severity: "critical",
    status: "completed",
    queuedAt: Date.now(),
    ...overrides,
  };
}

function makeDiminishingAttempts(genId: number, count: number): FixAttemptRecord[] {
  const attempts: FixAttemptRecord[] = [];
  let currentDrift = 0.40;
  for (let i = 0; i < count; i++) {
    // Each attempt improves less than the previous
    const improvement = Math.max(0.005, 0.12 - i * 0.04);
    const newDrift = currentDrift - improvement;
    attempts.push(makeAttempt({
      jobId: genId * 100 + i,
      generationId: genId,
      originalDriftScore: currentDrift,
      newDriftScore: Math.round(newDrift * 10000) / 10000,
      driftImprovement: Math.round(improvement * 10000) / 10000,
      boostedLoraStrength: 0.75 + i * 0.05,
      boostDelta: 0.05,
      targetFeatures: ["face", "hair"],
      queuedAt: Date.now() + i * 60000,
    }));
    currentDrift = newDrift;
  }
  return attempts;
}

// ─── Constants ──────────────────────────────────────────────────────────

describe("Constants", () => {
  it("MIN_ATTEMPTS_FOR_RECOMMENDATION should be 3", () => {
    expect(MIN_ATTEMPTS_FOR_RECOMMENDATION).toBe(3);
  });

  it("IMPROVEMENT_PLATEAU_THRESHOLD should be 0.02", () => {
    expect(IMPROVEMENT_PLATEAU_THRESHOLD).toBe(0.02);
  });

  it("WEAK_FEATURE_THRESHOLD should be 0.15", () => {
    expect(WEAK_FEATURE_THRESHOLD).toBe(0.15);
  });

  it("FEATURE_LABELS should have all 5 features", () => {
    expect(Object.keys(FEATURE_LABELS)).toHaveLength(5);
    expect(FEATURE_LABELS.face).toBe("Facial Features");
    expect(FEATURE_LABELS.hair).toBe("Hair Style & Color");
    expect(FEATURE_LABELS.outfit).toBe("Outfit & Clothing");
    expect(FEATURE_LABELS.colorPalette).toBe("Color Palette");
    expect(FEATURE_LABELS.bodyProportion).toBe("Body Proportions");
  });
});

// ─── computeImprovementTrend ────────────────────────────────────────────

describe("computeImprovementTrend", () => {
  it("returns zero values for empty input", () => {
    const result = computeImprovementTrend([]);
    expect(result.slope).toBe(0);
    expect(result.avgImprovement).toBe(0);
    expect(result.latestImprovement).toBe(0);
    expect(result.dataPoints).toBe(0);
    expect(result.isDiminishing).toBe(false);
    expect(result.perAttemptImprovements).toHaveLength(0);
  });

  it("handles single data point", () => {
    const result = computeImprovementTrend([makeAttempt({ driftImprovement: 0.10 })]);
    expect(result.dataPoints).toBe(1);
    expect(result.avgImprovement).toBe(0.10);
    expect(result.latestImprovement).toBe(0.10);
    expect(result.slope).toBe(0);
    expect(result.isDiminishing).toBe(false);
    expect(result.perAttemptImprovements).toHaveLength(1);
  });

  it("detects diminishing trend with declining improvements", () => {
    const attempts = [
      makeAttempt({ driftImprovement: 0.15, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.08, queuedAt: 2000 }),
      makeAttempt({ driftImprovement: 0.01, queuedAt: 3000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.isDiminishing).toBe(true);
    expect(result.slope).toBeLessThan(0);
    expect(result.latestImprovement).toBe(0.01);
    expect(result.dataPoints).toBe(3);
  });

  it("does not flag improving trend as diminishing", () => {
    const attempts = [
      makeAttempt({ driftImprovement: 0.05, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.10, queuedAt: 2000 }),
      makeAttempt({ driftImprovement: 0.15, queuedAt: 3000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.isDiminishing).toBe(false);
    expect(result.slope).toBeGreaterThan(0);
  });

  it("handles flat trend correctly", () => {
    const attempts = [
      makeAttempt({ driftImprovement: 0.05, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.05, queuedAt: 2000 }),
      makeAttempt({ driftImprovement: 0.05, queuedAt: 3000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.slope).toBe(0);
    expect(result.avgImprovement).toBe(0.05);
    expect(result.isDiminishing).toBe(false);
  });

  it("computes cumulative improvements correctly", () => {
    const attempts = [
      makeAttempt({ driftImprovement: 0.10, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.05, queuedAt: 2000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.perAttemptImprovements[0].cumulativeImprovement).toBe(0.10);
    expect(result.perAttemptImprovements[1].cumulativeImprovement).toBe(0.15);
  });

  it("sorts by queuedAt before computing", () => {
    const attempts = [
      makeAttempt({ driftImprovement: 0.01, queuedAt: 3000 }),
      makeAttempt({ driftImprovement: 0.15, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.08, queuedAt: 2000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.perAttemptImprovements[0].improvement).toBe(0.15);
    expect(result.perAttemptImprovements[1].improvement).toBe(0.08);
    expect(result.perAttemptImprovements[2].improvement).toBe(0.01);
  });

  it("handles null driftImprovement as 0", () => {
    const attempts = [
      makeAttempt({ driftImprovement: null, queuedAt: 1000 }),
      makeAttempt({ driftImprovement: 0.05, queuedAt: 2000 }),
    ];
    const result = computeImprovementTrend(attempts);
    expect(result.perAttemptImprovements[0].improvement).toBe(0);
    expect(result.avgImprovement).toBeCloseTo(0.025, 4);
  });
});

// ─── buildFrameFixSummaries ─────────────────────────────────────────────

describe("buildFrameFixSummaries", () => {
  it("returns empty array for no attempts", () => {
    expect(buildFrameFixSummaries([])).toHaveLength(0);
  });

  it("groups attempts by generationId", () => {
    const attempts = [
      makeAttempt({ generationId: 100, jobId: 1 }),
      makeAttempt({ generationId: 100, jobId: 2 }),
      makeAttempt({ generationId: 200, jobId: 3 }),
    ];
    const summaries = buildFrameFixSummaries(attempts);
    expect(summaries).toHaveLength(2);
    const gen100 = summaries.find(s => s.generationId === 100);
    const gen200 = summaries.find(s => s.generationId === 200);
    expect(gen100?.attempts).toHaveLength(2);
    expect(gen200?.attempts).toHaveLength(1);
  });

  it("detects diminishing returns within a frame", () => {
    const attempts = makeDiminishingAttempts(100, 4);
    const summaries = buildFrameFixSummaries(attempts);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].isDiminishing).toBe(true);
  });

  it("computes totalImprovement from first to last drift", () => {
    const attempts = [
      makeAttempt({
        generationId: 100, jobId: 1,
        originalDriftScore: 0.40, newDriftScore: 0.30, driftImprovement: 0.10,
        queuedAt: 1000,
      }),
      makeAttempt({
        generationId: 100, jobId: 2,
        originalDriftScore: 0.30, newDriftScore: 0.22, driftImprovement: 0.08,
        queuedAt: 2000,
      }),
    ];
    const summaries = buildFrameFixSummaries(attempts);
    // totalImprovement = 0.40 - 0.22 = 0.18
    expect(summaries[0].totalImprovement).toBeCloseTo(0.18, 3);
  });

  it("filters completed attempts correctly", () => {
    const attempts = [
      makeAttempt({ generationId: 100, jobId: 1, status: "completed" }),
      makeAttempt({ generationId: 100, jobId: 2, status: "failed" }),
      makeAttempt({ generationId: 100, jobId: 3, status: "queued" }),
    ];
    const summaries = buildFrameFixSummaries(attempts);
    expect(summaries[0].completedAttempts).toHaveLength(1);
    expect(summaries[0].attempts).toHaveLength(3);
  });

  it("handles frame with no completed attempts", () => {
    const attempts = [
      makeAttempt({ generationId: 100, status: "queued", newDriftScore: null, driftImprovement: null }),
    ];
    const summaries = buildFrameFixSummaries(attempts);
    expect(summaries[0].latestDriftScore).toBeNull();
    expect(summaries[0].completedAttempts).toHaveLength(0);
  });
});

// ─── analyzeDiminishingReturns ──────────────────────────────────────────

describe("analyzeDiminishingReturns", () => {
  it("returns zero stats for empty input", () => {
    const result = analyzeDiminishingReturns([]);
    expect(result.totalFramesAnalyzed).toBe(0);
    expect(result.framesWithMultipleAttempts).toBe(0);
    expect(result.framesWithDiminishingReturns).toBe(0);
    expect(result.avgRemainingDrift).toBe(0);
    expect(result.maxRemainingDrift).toBe(0);
  });

  it("counts frames with multiple attempts correctly", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
      ...makeDiminishingAttempts(200, 3),
      makeAttempt({ generationId: 300, jobId: 999 }), // only 1 attempt
    ];
    const result = analyzeDiminishingReturns(attempts);
    expect(result.totalFramesAnalyzed).toBe(3);
    expect(result.framesWithMultipleAttempts).toBe(2); // gen 100 and 200 have 3+ completed
  });

  it("detects diminishing returns across frames", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
      ...makeDiminishingAttempts(200, 4),
    ];
    const result = analyzeDiminishingReturns(attempts);
    expect(result.framesWithDiminishingReturns).toBeGreaterThanOrEqual(1);
  });

  it("computes remaining drift stats", () => {
    const attempts = [
      makeAttempt({ generationId: 100, newDriftScore: 0.15 }),
      makeAttempt({ generationId: 200, newDriftScore: 0.25 }),
    ];
    const result = analyzeDiminishingReturns(attempts);
    expect(result.avgRemainingDrift).toBeCloseTo(0.20, 2);
    expect(result.maxRemainingDrift).toBeCloseTo(0.25, 2);
  });

  it("handles frames with null newDriftScore", () => {
    const attempts = [
      makeAttempt({ generationId: 100, newDriftScore: null, status: "queued" }),
    ];
    const result = analyzeDiminishingReturns(attempts);
    expect(result.avgRemainingDrift).toBe(0);
    expect(result.maxRemainingDrift).toBe(0);
  });
});

// ─── identifyWeakFeatures ───────────────────────────────────────────────

describe("identifyWeakFeatures", () => {
  it("returns empty for no attempts", () => {
    expect(identifyWeakFeatures([])).toHaveLength(0);
  });

  it("identifies features targeted multiple times", () => {
    const attempts = [
      makeAttempt({ jobId: 1, targetFeatures: ["face", "hair"], queuedAt: 1000 }),
      makeAttempt({ jobId: 2, targetFeatures: ["face", "outfit"], queuedAt: 2000 }),
      makeAttempt({ jobId: 3, targetFeatures: ["face"], queuedAt: 3000 }),
    ];
    const weak = identifyWeakFeatures(attempts);
    const faceFeature = weak.find(f => f.feature === "face");
    expect(faceFeature).toBeDefined();
    expect(faceFeature!.fixAttemptCount).toBe(3);
  });

  it("provides reference image suggestions for weak features", () => {
    const attempts = [
      makeAttempt({ jobId: 1, targetFeatures: ["face"], queuedAt: 1000 }),
      makeAttempt({ jobId: 2, targetFeatures: ["face"], queuedAt: 2000 }),
      makeAttempt({ jobId: 3, targetFeatures: ["face"], queuedAt: 3000 }),
    ];
    const weak = identifyWeakFeatures(attempts);
    const faceFeature = weak.find(f => f.feature === "face");
    expect(faceFeature?.referenceImageSuggestions.length).toBeGreaterThan(0);
    expect(faceFeature?.referenceImageSuggestions[0]).toHaveProperty("type");
    expect(faceFeature?.referenceImageSuggestions[0]).toHaveProperty("description");
    expect(faceFeature?.referenceImageSuggestions[0]).toHaveProperty("priority");
  });

  it("sorts weak features by fix attempt count descending", () => {
    const attempts = [
      makeAttempt({ jobId: 1, targetFeatures: ["face", "hair"], queuedAt: 1000 }),
      makeAttempt({ jobId: 2, targetFeatures: ["face", "hair"], queuedAt: 2000 }),
      makeAttempt({ jobId: 3, targetFeatures: ["face"], queuedAt: 3000 }),
    ];
    const weak = identifyWeakFeatures(attempts);
    if (weak.length >= 2) {
      expect(weak[0].fixAttemptCount).toBeGreaterThanOrEqual(weak[1].fixAttemptCount);
    }
  });

  it("handles null targetFeatures gracefully", () => {
    const attempts = [
      makeAttempt({ jobId: 1, targetFeatures: null }),
      makeAttempt({ jobId: 2, targetFeatures: null }),
    ];
    const weak = identifyWeakFeatures(attempts);
    // No features targeted, so no weak features
    expect(weak).toHaveLength(0);
  });

  it("includes label from FEATURE_LABELS", () => {
    const attempts = [
      makeAttempt({ jobId: 1, targetFeatures: ["colorPalette"], queuedAt: 1000 }),
      makeAttempt({ jobId: 2, targetFeatures: ["colorPalette"], queuedAt: 2000 }),
      makeAttempt({ jobId: 3, targetFeatures: ["colorPalette"], queuedAt: 3000 }),
    ];
    const weak = identifyWeakFeatures(attempts);
    const cp = weak.find(f => f.feature === "colorPalette");
    expect(cp?.label).toBe("Color Palette");
  });
});

// ─── assessRetrainingUrgency ────────────────────────────────────────────

describe("assessRetrainingUrgency", () => {
  const baseAnalysis: DiminishingReturnsAnalysis = {
    totalFramesAnalyzed: 5,
    framesWithMultipleAttempts: 0,
    framesWithDiminishingReturns: 0,
    overallTrend: {
      slope: 0,
      avgImprovement: 0.05,
      latestImprovement: 0.05,
      dataPoints: 0,
      isDiminishing: false,
      perAttemptImprovements: [],
    },
    frameSummaries: [],
    avgRemainingDrift: 0.10,
    maxRemainingDrift: 0.15,
  };

  it("returns 'recommended' for mild cases", () => {
    expect(assessRetrainingUrgency(baseAnalysis)).toBe("recommended");
  });

  it("returns 'strongly_recommended' when 2+ frames have diminishing returns", () => {
    expect(assessRetrainingUrgency({
      ...baseAnalysis,
      framesWithDiminishingReturns: 2,
    })).toBe("strongly_recommended");
  });

  it("returns 'strongly_recommended' when avg remaining drift >= HIGH_REMAINING_DRIFT", () => {
    expect(assessRetrainingUrgency({
      ...baseAnalysis,
      avgRemainingDrift: HIGH_REMAINING_DRIFT,
    })).toBe("strongly_recommended");
  });

  it("returns 'strongly_recommended' when 3+ multi-attempt frames and trend is diminishing", () => {
    expect(assessRetrainingUrgency({
      ...baseAnalysis,
      framesWithMultipleAttempts: 3,
      overallTrend: { ...baseAnalysis.overallTrend, isDiminishing: true },
    })).toBe("strongly_recommended");
  });

  it("returns 'critical' when 3+ diminishing frames AND high remaining drift", () => {
    expect(assessRetrainingUrgency({
      ...baseAnalysis,
      framesWithDiminishingReturns: 3,
      avgRemainingDrift: CRITICAL_REMAINING_DRIFT,
    })).toBe("critical");
  });

  it("returns 'strongly_recommended' not 'critical' when only one condition met", () => {
    // 3 diminishing but low drift
    expect(assessRetrainingUrgency({
      ...baseAnalysis,
      framesWithDiminishingReturns: 3,
      avgRemainingDrift: 0.10,
    })).toBe("strongly_recommended");
  });
});

// ─── generateRetrainingRecommendation ───────────────────────────────────

describe("generateRetrainingRecommendation", () => {
  it("returns null for empty attempts", () => {
    expect(generateRetrainingRecommendation([])).toBeNull();
  });

  it("returns null when no multi-attempt frames and low drift", () => {
    const attempts = [
      makeAttempt({
        generationId: 100, newDriftScore: 0.05, driftImprovement: 0.30,
      }),
    ];
    const result = generateRetrainingRecommendation(attempts);
    // Single attempt with low remaining drift — no recommendation needed
    expect(result).toBeNull();
  });

  it("returns recommendation when frames have diminishing returns", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
      ...makeDiminishingAttempts(200, 4),
    ];
    const result = generateRetrainingRecommendation(attempts);
    expect(result).not.toBeNull();
    expect(result!.shouldRetrain).toBe(true);
    expect(["recommended", "strongly_recommended", "critical"]).toContain(result!.urgency);
  });

  it("includes weak features in recommendation", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
    ];
    const result = generateRetrainingRecommendation(attempts);
    if (result) {
      // face and hair are targeted in makeDiminishingAttempts
      const faceWeak = result.weakFeatures.find(f => f.feature === "face");
      expect(faceWeak).toBeDefined();
    }
  });

  it("includes summary and explanation strings", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
    ];
    const result = generateRetrainingRecommendation(attempts);
    if (result) {
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.explanation.length).toBeGreaterThan(0);
    }
  });

  it("includes analysis with correct frame counts", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
      makeAttempt({ generationId: 200, jobId: 999 }),
    ];
    const result = generateRetrainingRecommendation(attempts);
    if (result) {
      expect(result.analysis.totalFramesAnalyzed).toBe(2);
    }
  });

  it("estimates retraining impact between 0 and 0.8", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
      ...makeDiminishingAttempts(200, 4),
    ];
    const result = generateRetrainingRecommendation(attempts);
    if (result) {
      expect(result.estimatedRetrainingImpact).toBeGreaterThanOrEqual(0);
      expect(result.estimatedRetrainingImpact).toBeLessThanOrEqual(0.8);
    }
  });

  it("counts total suggested images", () => {
    const attempts = [
      ...makeDiminishingAttempts(100, 4),
    ];
    const result = generateRetrainingRecommendation(attempts);
    if (result && result.weakFeatures.length > 0) {
      expect(result.totalSuggestedImages).toBeGreaterThan(0);
    }
  });

  it("returns recommendation when remaining drift is high even with few attempts", () => {
    // 2 frames each with 1 attempt but high remaining drift
    const attempts = [
      makeAttempt({ generationId: 100, newDriftScore: 0.25, driftImprovement: 0.10 }),
      makeAttempt({ generationId: 200, newDriftScore: 0.30, driftImprovement: 0.05 }),
    ];
    const result = generateRetrainingRecommendation(attempts);
    // Should recommend because avgRemainingDrift > WEAK_FEATURE_THRESHOLD
    expect(result).not.toBeNull();
    if (result) {
      expect(result.shouldRetrain).toBe(true);
    }
  });
});
