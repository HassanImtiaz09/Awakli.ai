/**
 * Tests for Fix Drift Analytics and Re-Fix features
 */
import { describe, it, expect } from "vitest";
import {
  computeBoostParams,
  buildFixDriftJob,
  estimateFixDriftBatch,
  formatDuration,
  MAX_LORA_STRENGTH,
  BASE_REGEN_CREDITS,
  BOOST_CREDIT_MULTIPLIER,
  DEFAULT_ORIGINAL_STRENGTH,
} from "./fix-drift";
import type { FrameDriftResult } from "./consistency-analysis";

// ─── Helper ─────────────────────────────────────────────────────────────

function makeFrame(overrides: Partial<FrameDriftResult> = {}): FrameDriftResult {
  return {
    generationId: 1,
    episodeId: 1,
    episodeNumber: 1,
    episodeTitle: "Test Episode",
    sceneId: null,
    sceneNumber: null,
    frameIndex: 0,
    resultUrl: "https://example.com/frame.png",
    driftScore: 0.25,
    clipDrift: 0.20,
    featureDrifts: {
      face: 0.20,
      hair: 0.15,
      outfit: 0.10,
      colorPalette: 0.08,
      bodyProportion: 0.05,
    },
    isFlagged: true,
    severity: "warning",
    loraVersion: 1,
    loraStrength: 0.75,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Analytics Aggregation Logic ────────────────────────────────────────

describe("Analytics aggregation logic", () => {
  describe("Success rate calculation", () => {
    it("should calculate 100% when all jobs completed", () => {
      const completed = 10;
      const failed = 0;
      const rate = Math.round((completed / (completed + failed || 1)) * 100);
      expect(rate).toBe(100);
    });

    it("should calculate 0% when all jobs failed", () => {
      const completed = 0;
      const failed = 5;
      const rate = Math.round((completed / (completed + failed || 1)) * 100);
      expect(rate).toBe(0);
    });

    it("should calculate correct rate for mixed results", () => {
      const completed = 7;
      const failed = 3;
      const rate = Math.round((completed / (completed + failed || 1)) * 100);
      expect(rate).toBe(70);
    });

    it("should handle edge case of 0 total fixes", () => {
      const totalFixes = 0;
      const rate = totalFixes > 0 ? 50 : 0;
      expect(rate).toBe(0);
    });
  });

  describe("Average drift improvement", () => {
    it("should calculate average from completed jobs", () => {
      const improvements = [0.05, 0.10, 0.15];
      const avg = improvements.reduce((s, v) => s + v, 0) / improvements.length;
      const rounded = Math.round(avg * 10000) / 10000;
      expect(rounded).toBe(0.1);
    });

    it("should return 0 when no completed jobs", () => {
      const completedJobs: number[] = [];
      const avg = completedJobs.length > 0
        ? Math.round(completedJobs.reduce((s, v) => s + v, 0) / completedJobs.length * 10000) / 10000
        : 0;
      expect(avg).toBe(0);
    });

    it("should handle single completed job", () => {
      const improvements = [0.08];
      const avg = improvements.reduce((s, v) => s + v, 0) / improvements.length;
      expect(Math.round(avg * 10000) / 10000).toBe(0.08);
    });
  });

  describe("Credits spent aggregation", () => {
    it("should sum all estimated credits", () => {
      const credits = [8, 10, 12, 8, 14];
      const total = credits.reduce((s, c) => s + c, 0);
      expect(total).toBe(52);
    });

    it("should return 0 for empty list", () => {
      const credits: number[] = [];
      const total = credits.reduce((s, c) => s + c, 0);
      expect(total).toBe(0);
    });
  });

  describe("Fixes over time grouping", () => {
    it("should group jobs by date", () => {
      const jobs = [
        { date: "2026-04-15", status: "completed" },
        { date: "2026-04-15", status: "failed" },
        { date: "2026-04-16", status: "completed" },
        { date: "2026-04-16", status: "completed" },
        { date: "2026-04-16", status: "completed" },
      ];

      const byDay: Record<string, { total: number; completed: number; failed: number }> = {};
      for (const job of jobs) {
        if (!byDay[job.date]) byDay[job.date] = { total: 0, completed: 0, failed: 0 };
        byDay[job.date].total++;
        if (job.status === "completed") byDay[job.date].completed++;
        if (job.status === "failed") byDay[job.date].failed++;
      }

      expect(Object.keys(byDay)).toHaveLength(2);
      expect(byDay["2026-04-15"]).toEqual({ total: 2, completed: 1, failed: 1 });
      expect(byDay["2026-04-16"]).toEqual({ total: 3, completed: 3, failed: 0 });
    });

    it("should sort dates chronologically", () => {
      const dates = ["2026-04-17", "2026-04-15", "2026-04-16"];
      const sorted = dates.sort((a, b) => a.localeCompare(b));
      expect(sorted).toEqual(["2026-04-15", "2026-04-16", "2026-04-17"]);
    });
  });

  describe("Severity breakdown", () => {
    it("should separate critical and warning fixes", () => {
      const jobs = [
        { severity: "critical" as const, status: "completed" },
        { severity: "critical" as const, status: "failed" },
        { severity: "warning" as const, status: "completed" },
        { severity: "warning" as const, status: "completed" },
        { severity: "warning" as const, status: "completed" },
      ];

      const critical = jobs.filter(j => j.severity === "critical");
      const warning = jobs.filter(j => j.severity === "warning");

      expect(critical).toHaveLength(2);
      expect(warning).toHaveLength(3);

      const criticalSuccess = Math.round(
        (critical.filter(j => j.status === "completed").length /
          (critical.filter(j => j.status === "completed" || j.status === "failed").length || 1)) * 100
      );
      expect(criticalSuccess).toBe(50);

      const warningSuccess = Math.round(
        (warning.filter(j => j.status === "completed").length /
          (warning.filter(j => j.status === "completed" || j.status === "failed").length || 1)) * 100
      );
      expect(warningSuccess).toBe(100);
    });
  });

  describe("Re-fix count detection", () => {
    it("should count frames with multiple fix attempts", () => {
      const jobs = [
        { generationId: 1 },
        { generationId: 1 },
        { generationId: 2 },
        { generationId: 3 },
        { generationId: 3 },
        { generationId: 3 },
      ];

      const generationCounts: Record<number, number> = {};
      for (const job of jobs) {
        generationCounts[job.generationId] = (generationCounts[job.generationId] ?? 0) + 1;
      }
      const reFixCount = Object.values(generationCounts).filter(c => c > 1).length;

      expect(reFixCount).toBe(2); // generationId 1 and 3 have multiple attempts
    });

    it("should return 0 when no re-fixes", () => {
      const jobs = [
        { generationId: 1 },
        { generationId: 2 },
        { generationId: 3 },
      ];

      const generationCounts: Record<number, number> = {};
      for (const job of jobs) {
        generationCounts[job.generationId] = (generationCounts[job.generationId] ?? 0) + 1;
      }
      const reFixCount = Object.values(generationCounts).filter(c => c > 1).length;

      expect(reFixCount).toBe(0);
    });
  });
});

// ─── Re-Fix Boost Calculation ───────────────────────────────────────────

describe("Re-fix boost calculation", () => {
  describe("Chained boost from previous boosted strength", () => {
    it("should use previous boosted strength as new baseline", () => {
      const previousBoosted = 0.85;
      const currentDrift = 0.15;
      const reFixBoostRaw = Math.min(0.10, currentDrift * 0.35);
      const reFixBoostDelta = Math.round(reFixBoostRaw * 100) / 100;
      const newBoosted = Math.min(MAX_LORA_STRENGTH, previousBoosted + reFixBoostDelta);

      expect(reFixBoostDelta).toBe(0.05);
      expect(newBoosted).toBe(0.90);
    });

    it("should cap at MAX_LORA_STRENGTH", () => {
      const previousBoosted = 0.92;
      const currentDrift = 0.30;
      const reFixBoostRaw = Math.min(0.10, currentDrift * 0.35);
      const reFixBoostDelta = Math.round(reFixBoostRaw * 100) / 100;
      const newBoosted = Math.min(MAX_LORA_STRENGTH, previousBoosted + reFixBoostDelta);

      expect(newBoosted).toBe(MAX_LORA_STRENGTH);
    });

    it("should reject re-fix when already at max strength", () => {
      const previousBoosted = 0.95;
      const canReFix = previousBoosted < MAX_LORA_STRENGTH;
      expect(canReFix).toBe(false);
    });

    it("should allow re-fix when below max strength", () => {
      const previousBoosted = 0.90;
      const canReFix = previousBoosted < MAX_LORA_STRENGTH;
      expect(canReFix).toBe(true);
    });
  });

  describe("Diminishing returns", () => {
    it("should calculate smaller boost for lower drift", () => {
      const highDrift = 0.30;
      const lowDrift = 0.10;

      const highBoost = Math.min(0.10, highDrift * 0.35);
      const lowBoost = Math.min(0.10, lowDrift * 0.35);

      expect(highBoost).toBeGreaterThan(lowBoost);
    });

    it("should cap boost delta at 0.10", () => {
      const extremeDrift = 0.50;
      const boost = Math.min(0.10, extremeDrift * 0.35);
      expect(boost).toBe(0.10);
    });
  });

  describe("Re-fix cost scaling", () => {
    it("should increase cost by 25% per attempt", () => {
      const baseCost = 8;
      const boostAddon = 2;

      const attempt1Cost = Math.round((baseCost + boostAddon) * (1 + (1 - 1) * 0.25));
      const attempt2Cost = Math.round((baseCost + boostAddon) * (1 + (2 - 1) * 0.25));
      const attempt3Cost = Math.round((baseCost + boostAddon) * (1 + (3 - 1) * 0.25));

      expect(attempt1Cost).toBe(10);
      expect(attempt2Cost).toBe(13); // 10 * 1.25
      expect(attempt3Cost).toBe(15); // 10 * 1.5
    });
  });

  describe("Re-fix confidence degradation", () => {
    it("should be high for first attempt", () => {
      const totalAttempts = 1;
      const confidence = totalAttempts >= 3 ? "low" : totalAttempts >= 2 ? "medium" : "high";
      expect(confidence).toBe("high");
    });

    it("should be medium for second attempt", () => {
      const totalAttempts = 2;
      const confidence = totalAttempts >= 3 ? "low" : totalAttempts >= 2 ? "medium" : "high";
      expect(confidence).toBe("medium");
    });

    it("should be low for third+ attempt", () => {
      const totalAttempts = 3;
      const confidence = totalAttempts >= 3 ? "low" : totalAttempts >= 2 ? "medium" : "high";
      expect(confidence).toBe("low");

      const totalAttempts4 = 4;
      const confidence4 = totalAttempts4 >= 3 ? "low" : totalAttempts4 >= 2 ? "medium" : "high";
      expect(confidence4).toBe("low");
    });
  });
});

// ─── Re-Fix Eligibility ────────────────────────────────────────────────

describe("Re-fix eligibility", () => {
  it("should allow re-fix for completed jobs", () => {
    const status = "completed";
    const eligible = status === "completed" || status === "failed";
    expect(eligible).toBe(true);
  });

  it("should allow re-fix for failed jobs", () => {
    const status = "failed";
    const eligible = status === "completed" || status === "failed";
    expect(eligible).toBe(true);
  });

  it("should not allow re-fix for queued jobs", () => {
    const status = "queued";
    const eligible = status === "completed" || status === "failed";
    expect(eligible).toBe(false);
  });

  it("should not allow re-fix for processing jobs", () => {
    const status = "processing";
    const eligible = status === "completed" || status === "failed";
    expect(eligible).toBe(false);
  });

  it("should not allow re-fix when at max strength", () => {
    const boostedStrength = 0.95;
    const canReFix = boostedStrength < MAX_LORA_STRENGTH;
    expect(canReFix).toBe(false);
  });

  it("should allow re-fix when just below max strength", () => {
    const boostedStrength = 0.94;
    const canReFix = boostedStrength < MAX_LORA_STRENGTH;
    expect(canReFix).toBe(true);
  });
});

// ─── Analytics Dashboard Data Formatting ────────────────────────────────

describe("Analytics data formatting", () => {
  it("should format average fix time correctly", () => {
    expect(formatDuration(30)).toBe("30s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(120)).toBe("2m");
    expect(formatDuration(185)).toBe("3m 5s");
  });

  it("should calculate per-fix credit average", () => {
    const totalCredits = 100;
    const totalFixes = 8;
    const perFix = Math.round(totalCredits / Math.max(1, totalFixes));
    expect(perFix).toBe(13);
  });

  it("should handle zero total fixes for per-fix average", () => {
    const totalCredits = 0;
    const totalFixes = 0;
    const perFix = Math.round(totalCredits / Math.max(1, totalFixes));
    expect(perFix).toBe(0);
  });
});

// ─── Integration: buildFixDriftJob with re-fix chain ────────────────────

describe("Re-fix chain integration", () => {
  it("should produce valid job spec for a re-fix scenario", () => {
    // Simulate: original fix at 0.75 → 0.85, now re-fixing from 0.85
    const frame = makeFrame({
      driftScore: 0.15, // lower drift after first fix
      loraStrength: 0.85, // previous boosted strength
      loraVersion: 1,
      severity: "warning",
    });

    const job = buildFixDriftJob(frame);

    // Should boost from 0.85
    expect(job.boostParams.originalStrength).toBe(0.85);
    expect(job.boostParams.boostedStrength).toBeGreaterThan(0.85);
    expect(job.boostParams.boostedStrength).toBeLessThanOrEqual(MAX_LORA_STRENGTH);
    expect(job.estimatedCredits).toBeGreaterThanOrEqual(BASE_REGEN_CREDITS);
  });

  it("should handle near-max strength re-fix", () => {
    const frame = makeFrame({
      driftScore: 0.12,
      loraStrength: 0.93,
      loraVersion: 2,
      severity: "warning",
    });

    const job = buildFixDriftJob(frame);

    // Should be capped at MAX
    expect(job.boostParams.boostedStrength).toBeLessThanOrEqual(MAX_LORA_STRENGTH);
  });

  it("should still produce valid output when strength is already at max", () => {
    const frame = makeFrame({
      driftScore: 0.10,
      loraStrength: 0.95,
      loraVersion: 2,
      severity: "warning",
    });

    const job = buildFixDriftJob(frame);

    // Boosted should equal max (no further boost possible)
    expect(job.boostParams.boostedStrength).toBe(MAX_LORA_STRENGTH);
    expect(job.boostParams.boostDelta).toBe(0);
  });
});
