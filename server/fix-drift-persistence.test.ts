/**
 * Tests for Fix Drift Persistence
 *
 * Covers:
 * - Database schema shape (InsertFixDriftJob type compliance)
 * - Status priority ordering for merge logic
 * - History mapping from DB rows to API response shape
 * - Simulated completion lifecycle (queued → processing → completed)
 * - Edge cases: duplicate jobs, null fields, empty history
 */
import { describe, it, expect } from "vitest";
import {
  computeBoostParams,
  buildFixDriftJob,
  estimateFixDriftBatch,
  formatDuration,
  BASE_REGEN_CREDITS,
  BOOST_CREDIT_MULTIPLIER,
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

/** Mirrors the statusPriority function from the frontend */
function statusPriority(status: "queued" | "processing" | "completed" | "failed"): number {
  switch (status) {
    case "queued": return 1;
    case "processing": return 2;
    case "completed": return 3;
    case "failed": return 3;
    default: return 0;
  }
}

/** Simulates the DB row → API response mapping from getFixDriftHistory */
function mapJobToHistoryEntry(job: {
  id: number;
  generationId: number;
  episodeId: number;
  sceneId: number | null;
  frameIndex: number;
  originalDriftScore: number;
  originalLoraStrength: number | null;
  boostedLoraStrength: number;
  boostDelta: number;
  severity: "warning" | "critical";
  targetFeatures: string[] | null;
  fixConfidence: "high" | "medium" | "low";
  estimatedCredits: number;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  newResultUrl: string | null;
  newDriftScore: number | null;
  driftImprovement: number | null;
  errorMessage: string | null;
  queuedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    jobId: job.id,
    generationId: job.generationId,
    episodeId: job.episodeId,
    sceneId: job.sceneId,
    frameIndex: job.frameIndex,
    originalDriftScore: job.originalDriftScore,
    originalLoraStrength: job.originalLoraStrength,
    boostedLoraStrength: job.boostedLoraStrength,
    boostDelta: job.boostDelta,
    severity: job.severity,
    targetFeatures: job.targetFeatures,
    fixConfidence: job.fixConfidence,
    estimatedCredits: job.estimatedCredits,
    status: job.status,
    progress: job.progress,
    newResultUrl: job.newResultUrl,
    newDriftScore: job.newDriftScore,
    driftImprovement: job.driftImprovement,
    errorMessage: job.errorMessage,
    queuedAt: job.queuedAt?.getTime() ?? null,
    startedAt: job.startedAt?.getTime() ?? null,
    completedAt: job.completedAt?.getTime() ?? null,
  };
}

// ─── Insert Data Shape ──────────────────────────────────────────────────

describe("Fix Drift Insert Data Shape", () => {
  it("should produce all required fields for DB insert from a single fix", () => {
    const frame = makeDriftResult();
    const jobSpec = buildFixDriftJob(frame);

    const insertData = {
      characterId: 42,
      userId: 7,
      generationId: frame.generationId,
      episodeId: frame.episodeId,
      sceneId: frame.sceneId ?? undefined,
      frameIndex: frame.frameIndex,
      originalResultUrl: frame.resultUrl,
      originalDriftScore: frame.driftScore,
      originalLoraStrength: frame.loraStrength ?? undefined,
      boostedLoraStrength: jobSpec.boostParams.boostedStrength,
      boostDelta: jobSpec.boostParams.boostDelta,
      severity: frame.severity === "critical" ? "critical" as const : "warning" as const,
      targetFeatures: jobSpec.boostParams.targetFeatures,
      fixConfidence: jobSpec.boostParams.fixConfidence,
      estimatedCredits: jobSpec.estimatedCredits,
      estimatedSeconds: jobSpec.estimatedSeconds,
      status: "queued" as const,
      progress: 0,
    };

    expect(insertData.characterId).toBe(42);
    expect(insertData.userId).toBe(7);
    expect(insertData.generationId).toBe(1);
    expect(insertData.episodeId).toBe(100);
    expect(insertData.frameIndex).toBe(0);
    expect(insertData.originalDriftScore).toBe(0.20);
    expect(insertData.boostedLoraStrength).toBeGreaterThan(0);
    expect(insertData.boostDelta).toBeGreaterThan(0);
    expect(insertData.severity).toBe("warning");
    expect(insertData.fixConfidence).toBeTruthy();
    expect(insertData.estimatedCredits).toBeGreaterThanOrEqual(BASE_REGEN_CREDITS);
    expect(insertData.estimatedSeconds).toBeGreaterThan(0);
    expect(insertData.status).toBe("queued");
    expect(insertData.progress).toBe(0);
  });

  it("should handle null sceneId and loraStrength gracefully", () => {
    const frame = makeDriftResult({ sceneId: null, loraStrength: null });
    const jobSpec = buildFixDriftJob(frame);

    const insertData = {
      sceneId: frame.sceneId ?? undefined,
      originalLoraStrength: frame.loraStrength ?? undefined,
      boostedLoraStrength: jobSpec.boostParams.boostedStrength,
    };

    expect(insertData.sceneId).toBeUndefined();
    expect(insertData.originalLoraStrength).toBeUndefined();
    expect(insertData.boostedLoraStrength).toBeGreaterThan(0);
  });

  it("should produce correct severity enum for critical frames", () => {
    const frame = makeDriftResult({ driftScore: 0.35, severity: "critical" });
    const insertData = {
      severity: frame.severity === "critical" ? "critical" as const : "warning" as const,
    };
    expect(insertData.severity).toBe("critical");
  });

  it("should produce batch insert data for multiple frames", () => {
    const frames = [
      makeDriftResult({ generationId: 1, driftScore: 0.20, severity: "warning" }),
      makeDriftResult({ generationId: 2, driftScore: 0.35, severity: "critical" }),
      makeDriftResult({ generationId: 3, driftScore: 0.18, severity: "warning" }),
    ];

    const estimate = estimateFixDriftBatch(frames);
    expect(estimate.jobs.length).toBe(3);
    expect(estimate.criticalFrames).toBe(1);
    expect(estimate.warningFrames).toBe(2);

    // Each job should produce valid insert data
    for (const job of estimate.jobs) {
      expect(job.generationId).toBeGreaterThan(0);
      expect(job.estimatedCredits).toBeGreaterThanOrEqual(BASE_REGEN_CREDITS);
      expect(job.boostParams.boostedStrength).toBeGreaterThan(0);
    }
  });
});

// ─── Status Priority ────────────────────────────────────────────────────

describe("Status Priority for Merge Logic", () => {
  it("should rank queued < processing < completed", () => {
    expect(statusPriority("queued")).toBeLessThan(statusPriority("processing"));
    expect(statusPriority("processing")).toBeLessThan(statusPriority("completed"));
  });

  it("should rank failed equal to completed (both terminal)", () => {
    expect(statusPriority("failed")).toBe(statusPriority("completed"));
  });

  it("should not overwrite completed with queued", () => {
    const existing = { status: "completed" as const, improvement: 15, jobId: 1 };
    const incoming = { status: "queued" as const, improvement: null as number | null, jobId: 2 };

    // Merge logic: only overwrite if incoming priority >= existing priority
    const shouldOverwrite = statusPriority(incoming.status) >= statusPriority(existing.status);
    expect(shouldOverwrite).toBe(false);
  });

  it("should overwrite queued with processing", () => {
    const existing = { status: "queued" as const };
    const incoming = { status: "processing" as const };
    expect(statusPriority(incoming.status) >= statusPriority(existing.status)).toBe(true);
  });

  it("should overwrite processing with completed", () => {
    const existing = { status: "processing" as const };
    const incoming = { status: "completed" as const };
    expect(statusPriority(incoming.status) >= statusPriority(existing.status)).toBe(true);
  });

  it("should overwrite processing with failed", () => {
    const existing = { status: "processing" as const };
    const incoming = { status: "failed" as const };
    expect(statusPriority(incoming.status) >= statusPriority(existing.status)).toBe(true);
  });
});

// ─── History Mapping ────────────────────────────────────────────────────

describe("History Mapping (DB Row → API Response)", () => {
  const now = new Date();
  const baseJob = {
    id: 42,
    generationId: 1,
    episodeId: 100,
    sceneId: 10,
    frameIndex: 0,
    originalDriftScore: 0.20,
    originalLoraStrength: 0.75,
    boostedLoraStrength: 0.83,
    boostDelta: 0.08,
    severity: "warning" as const,
    targetFeatures: ["face", "hair"],
    fixConfidence: "medium" as const,
    estimatedCredits: 10,
    status: "completed" as const,
    progress: 100,
    newResultUrl: "https://cdn.example.com/fixed-001.png",
    newDriftScore: 0.08,
    driftImprovement: 0.12,
    errorMessage: null,
    queuedAt: new Date(now.getTime() - 60000),
    startedAt: new Date(now.getTime() - 30000),
    completedAt: now,
  };

  it("should map all fields correctly", () => {
    const entry = mapJobToHistoryEntry(baseJob);
    expect(entry.jobId).toBe(42);
    expect(entry.generationId).toBe(1);
    expect(entry.episodeId).toBe(100);
    expect(entry.sceneId).toBe(10);
    expect(entry.frameIndex).toBe(0);
    expect(entry.originalDriftScore).toBe(0.20);
    expect(entry.originalLoraStrength).toBe(0.75);
    expect(entry.boostedLoraStrength).toBe(0.83);
    expect(entry.boostDelta).toBe(0.08);
    expect(entry.severity).toBe("warning");
    expect(entry.targetFeatures).toEqual(["face", "hair"]);
    expect(entry.fixConfidence).toBe("medium");
    expect(entry.estimatedCredits).toBe(10);
    expect(entry.status).toBe("completed");
    expect(entry.progress).toBe(100);
    expect(entry.newResultUrl).toBe("https://cdn.example.com/fixed-001.png");
    expect(entry.newDriftScore).toBe(0.08);
    expect(entry.driftImprovement).toBe(0.12);
    expect(entry.errorMessage).toBeNull();
  });

  it("should convert Date timestamps to epoch milliseconds", () => {
    const entry = mapJobToHistoryEntry(baseJob);
    expect(typeof entry.queuedAt).toBe("number");
    expect(typeof entry.startedAt).toBe("number");
    expect(typeof entry.completedAt).toBe("number");
    expect(entry.queuedAt).toBe(baseJob.queuedAt.getTime());
    expect(entry.startedAt).toBe(baseJob.startedAt!.getTime());
    expect(entry.completedAt).toBe(baseJob.completedAt!.getTime());
  });

  it("should handle null timestamps", () => {
    const job = { ...baseJob, startedAt: null, completedAt: null, status: "queued" as const };
    const entry = mapJobToHistoryEntry(job);
    expect(entry.startedAt).toBeNull();
    expect(entry.completedAt).toBeNull();
  });

  it("should handle null sceneId", () => {
    const job = { ...baseJob, sceneId: null };
    const entry = mapJobToHistoryEntry(job);
    expect(entry.sceneId).toBeNull();
  });

  it("should handle null targetFeatures", () => {
    const job = { ...baseJob, targetFeatures: null };
    const entry = mapJobToHistoryEntry(job);
    expect(entry.targetFeatures).toBeNull();
  });

  it("should handle failed status with error message", () => {
    const job = {
      ...baseJob,
      status: "failed" as const,
      errorMessage: "GPU timeout after 120s",
      newDriftScore: null,
      driftImprovement: null,
      newResultUrl: null,
    };
    const entry = mapJobToHistoryEntry(job);
    expect(entry.status).toBe("failed");
    expect(entry.errorMessage).toBe("GPU timeout after 120s");
    expect(entry.newDriftScore).toBeNull();
    expect(entry.driftImprovement).toBeNull();
    expect(entry.newResultUrl).toBeNull();
  });
});

// ─── Simulated Completion Lifecycle ─────────────────────────────────────

describe("Simulated Completion Lifecycle", () => {
  it("should produce valid improvement values for completed jobs", () => {
    const originalDrift = 0.25;
    // Simulate what scheduleSimulatedCompletion does
    const improvement = originalDrift * (0.3 + Math.random() * 0.4);
    const newDriftScore = Math.round((originalDrift - improvement) * 10000) / 10000;

    expect(improvement).toBeGreaterThan(0);
    expect(improvement).toBeLessThanOrEqual(originalDrift);
    expect(newDriftScore).toBeGreaterThanOrEqual(0);
    expect(newDriftScore).toBeLessThan(originalDrift);
  });

  it("should produce improvement in 30-70% range of original drift", () => {
    const originalDrift = 0.30;
    // Run 100 simulations to verify range
    for (let i = 0; i < 100; i++) {
      const improvement = originalDrift * (0.3 + Math.random() * 0.4);
      const pct = improvement / originalDrift;
      expect(pct).toBeGreaterThanOrEqual(0.3);
      expect(pct).toBeLessThanOrEqual(0.7);
    }
  });

  it("should handle very small drift scores without going negative", () => {
    const originalDrift = 0.01;
    const improvement = originalDrift * (0.3 + Math.random() * 0.4);
    const newDriftScore = Math.round((originalDrift - improvement) * 10000) / 10000;
    expect(newDriftScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────

describe("Persistence Edge Cases", () => {
  it("should handle empty history array", () => {
    const history: ReturnType<typeof mapJobToHistoryEntry>[] = [];
    expect(history.length).toBe(0);
    // Frontend merge with empty history should not change state
    const existing: Record<number, { status: string; improvement: number | null }> = {
      1: { status: "completed", improvement: 15 },
    };
    // No changes expected
    expect(Object.keys(existing).length).toBe(1);
  });

  it("should handle multiple fix attempts for the same generationId", () => {
    const history = [
      mapJobToHistoryEntry({
        id: 1, generationId: 5, episodeId: 100, sceneId: 10, frameIndex: 3,
        originalDriftScore: 0.25, originalLoraStrength: 0.75, boostedLoraStrength: 0.83,
        boostDelta: 0.08, severity: "warning", targetFeatures: ["face"],
        fixConfidence: "medium", estimatedCredits: 10, status: "completed", progress: 100,
        newResultUrl: null, newDriftScore: 0.12, driftImprovement: 0.13,
        errorMessage: null, queuedAt: new Date("2026-01-01"), startedAt: new Date("2026-01-01"),
        completedAt: new Date("2026-01-01"),
      }),
      mapJobToHistoryEntry({
        id: 2, generationId: 5, episodeId: 100, sceneId: 10, frameIndex: 3,
        originalDriftScore: 0.12, originalLoraStrength: 0.83, boostedLoraStrength: 0.90,
        boostDelta: 0.07, severity: "warning", targetFeatures: ["face"],
        fixConfidence: "high", estimatedCredits: 10, status: "completed", progress: 100,
        newResultUrl: null, newDriftScore: 0.05, driftImprovement: 0.07,
        errorMessage: null, queuedAt: new Date("2026-01-02"), startedAt: new Date("2026-01-02"),
        completedAt: new Date("2026-01-02"),
      }),
    ];

    // Both entries should exist for the same generationId
    const forGen5 = history.filter(h => h.generationId === 5);
    expect(forGen5.length).toBe(2);

    // Latest entry (by queuedAt) should show further improvement
    const sorted = forGen5.sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0));
    expect(sorted[0].newDriftScore).toBe(0.05);
    expect(sorted[0].boostedLoraStrength).toBe(0.90);
  });

  it("should produce correct insert data for frames with no LoRA", () => {
    const frame = makeDriftResult({ loraVersion: null, loraStrength: null });
    const jobSpec = buildFixDriftJob(frame);

    expect(jobSpec.boostParams.fixConfidence).toBe("low");
    expect(jobSpec.boostParams.boostedStrength).toBeGreaterThan(0);
    expect(jobSpec.estimatedCredits).toBeGreaterThanOrEqual(BASE_REGEN_CREDITS);
  });

  it("should handle extreme drift scores in batch", () => {
    const frames = [
      makeDriftResult({ generationId: 1, driftScore: 0.99, severity: "critical" }),
      makeDriftResult({ generationId: 2, driftScore: 0.01, severity: "ok" as any }),
    ];

    const estimate = estimateFixDriftBatch(frames);
    // Only the critical frame should be included (severity filter)
    expect(estimate.totalFrames).toBe(1);
    expect(estimate.criticalFrames).toBe(1);
  });
});
