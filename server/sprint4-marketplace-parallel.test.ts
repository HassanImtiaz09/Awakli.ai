/**
 * Sprint 4 Tests — LoRA Marketplace & Parallel Slice Scheduler
 */
import { describe, it, expect, beforeEach } from "vitest";

// ─── LoRA Marketplace Tests ─────────────────────────────────────────────

import {
  calculateRevenueShare,
  calculateTrainingSavings,
  CREATOR_REVENUE_SHARE,
  FULL_TRAINING_COST,
  BASE_LORA_TRAINING_COST,
  BASE_LORA_SAVINGS,
} from "./lora-marketplace";

describe("LoRA Marketplace — Revenue Share", () => {
  it("calculates 70/30 split correctly", () => {
    const result = calculateRevenueShare(1000);
    expect(result.creatorEarnings).toBe(700);
    expect(result.platformFee).toBe(300);
  });

  it("handles zero price", () => {
    const result = calculateRevenueShare(0);
    expect(result.creatorEarnings).toBe(0);
    expect(result.platformFee).toBe(0);
  });

  it("rounds correctly for odd amounts", () => {
    const result = calculateRevenueShare(999);
    expect(result.creatorEarnings + result.platformFee).toBe(999);
    expect(result.creatorEarnings).toBe(Math.round(999 * CREATOR_REVENUE_SHARE));
  });

  it("handles small amounts", () => {
    const result = calculateRevenueShare(1);
    expect(result.creatorEarnings + result.platformFee).toBe(1);
  });
});

describe("LoRA Marketplace — Training Savings", () => {
  it("shows full cost when no base LoRA", () => {
    const result = calculateTrainingSavings();
    expect(result.fullCost).toBe(FULL_TRAINING_COST);
    expect(result.withBaseCost).toBe(FULL_TRAINING_COST);
    expect(result.savings).toBe(0);
    expect(result.savingsPercent).toBe(0);
  });

  it("shows 75% savings when using base LoRA", () => {
    const result = calculateTrainingSavings(42);
    expect(result.fullCost).toBe(FULL_TRAINING_COST);
    expect(result.withBaseCost).toBe(BASE_LORA_TRAINING_COST);
    expect(result.savings).toBe(BASE_LORA_SAVINGS);
    expect(result.savingsPercent).toBe(75);
  });

  it("constants are consistent", () => {
    expect(FULL_TRAINING_COST - BASE_LORA_TRAINING_COST).toBe(BASE_LORA_SAVINGS);
  });
});

// ─── Parallel Slice Scheduler Tests ─────────────────────────────────────

import {
  buildDependencyGraph,
  getReadySlices,
  markSliceStarted,
  markSliceComplete,
  markSliceFailed,
  cancelEpisode,
  getSchedulerStatus,
  getGraphForVisualization,
  cleanupGraph,
  getActiveEpisodes,
  DEFAULT_MAX_CONCURRENCY,
  type SliceInput,
} from "./parallel-slice-scheduler";

describe("Parallel Slice Scheduler — Dependency Graph", () => {
  beforeEach(() => {
    // Clean up any previous test graphs
    for (const ep of getActiveEpisodes()) {
      cleanupGraph(ep);
    }
  });

  it("builds a graph with correct node count", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 8 },
      { sliceId: 2, sceneIndex: 0, characterIds: [10], importance: 7 },
      { sliceId: 3, sceneIndex: 1, characterIds: [20], importance: 5 },
    ];

    const graph = buildDependencyGraph(100, slices);
    expect(graph.totalSlices).toBe(3);
    expect(graph.episodeId).toBe(100);
    expect(graph.maxConcurrency).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it("creates sequential dependencies within same scene", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 2, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 3, sceneIndex: 0, characterIds: [], importance: 5 },
    ];

    const graph = buildDependencyGraph(101, slices);
    const node2 = graph.nodes.get(2)!;
    const node3 = graph.nodes.get(3)!;

    expect(node2.dependsOn).toContain(1);
    expect(node3.dependsOn).toContain(2);
  });

  it("creates character continuity dependencies across scenes", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 5 },
      { sliceId: 2, sceneIndex: 1, characterIds: [10], importance: 5 },
    ];

    const graph = buildDependencyGraph(102, slices);
    const node2 = graph.nodes.get(2)!;
    expect(node2.dependsOn).toContain(1);
  });

  it("allows parallel execution for independent scenes", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 8 },
      { sliceId: 2, sceneIndex: 1, characterIds: [20], importance: 6 },
      { sliceId: 3, sceneIndex: 2, characterIds: [30], importance: 4 },
    ];

    const graph = buildDependencyGraph(103, slices);
    // All three slices should be independent (different scenes, different characters)
    const node1 = graph.nodes.get(1)!;
    const node2 = graph.nodes.get(2)!;
    const node3 = graph.nodes.get(3)!;

    expect(node1.dependsOn).toHaveLength(0);
    expect(node2.dependsOn).toHaveLength(0);
    expect(node3.dependsOn).toHaveLength(0);
  });
});

describe("Parallel Slice Scheduler — Ready Slices", () => {
  beforeEach(() => {
    for (const ep of getActiveEpisodes()) {
      cleanupGraph(ep);
    }
  });

  it("returns root nodes as ready initially", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 8 },
      { sliceId: 2, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 3, sceneIndex: 1, characterIds: [], importance: 6 },
    ];

    buildDependencyGraph(200, slices);
    const ready = getReadySlices(200);

    // Slice 1 and 3 should be ready (roots), slice 2 depends on 1
    expect(ready).toContain(1);
    expect(ready).toContain(3);
    expect(ready).not.toContain(2);
  });

  it("sorts ready slices by importance (highest first)", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 3 },
      { sliceId: 2, sceneIndex: 1, characterIds: [20], importance: 9 },
      { sliceId: 3, sceneIndex: 2, characterIds: [30], importance: 6 },
    ];

    buildDependencyGraph(201, slices);
    const ready = getReadySlices(201);

    expect(ready[0]).toBe(2); // importance 9
    expect(ready[1]).toBe(3); // importance 6
    expect(ready[2]).toBe(1); // importance 3
  });

  it("respects concurrency limit", () => {
    const slices: SliceInput[] = Array.from({ length: 10 }, (_, i) => ({
      sliceId: i + 1,
      sceneIndex: i,
      characterIds: [],
      importance: 5,
    }));

    buildDependencyGraph(202, slices, 3);
    const ready = getReadySlices(202);
    expect(ready.length).toBeLessThanOrEqual(3);
  });

  it("unblocks dependents after completion", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 2, sceneIndex: 0, characterIds: [], importance: 5 },
    ];

    buildDependencyGraph(203, slices);

    // Initially only slice 1 is ready
    let ready = getReadySlices(203);
    expect(ready).toContain(1);
    expect(ready).not.toContain(2);

    // Start and complete slice 1
    markSliceStarted(203, 1);
    markSliceComplete(203, 1);

    // Now slice 2 should be ready
    ready = getReadySlices(203);
    expect(ready).toContain(2);
  });
});

describe("Parallel Slice Scheduler — Lifecycle", () => {
  beforeEach(() => {
    for (const ep of getActiveEpisodes()) {
      cleanupGraph(ep);
    }
  });

  it("tracks status transitions correctly", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
    ];

    buildDependencyGraph(300, slices);

    let status = getSchedulerStatus(300)!;
    expect(status.pending).toBe(1);
    expect(status.generating).toBe(0);

    markSliceStarted(300, 1);
    status = getSchedulerStatus(300)!;
    expect(status.pending).toBe(0);
    expect(status.generating).toBe(1);

    markSliceComplete(300, 1);
    status = getSchedulerStatus(300)!;
    expect(status.complete).toBe(1);
    expect(status.progressPercent).toBe(100);
  });

  it("handles failure correctly", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
    ];

    buildDependencyGraph(301, slices);
    markSliceStarted(301, 1);
    markSliceFailed(301, 1, "GPU timeout");

    const status = getSchedulerStatus(301)!;
    expect(status.failed).toBe(1);
  });

  it("cancels pending slices", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 2, sceneIndex: 0, characterIds: [], importance: 5 },
      { sliceId: 3, sceneIndex: 1, characterIds: [], importance: 5 },
    ];

    buildDependencyGraph(302, slices);
    markSliceStarted(302, 1);

    const cancelled = cancelEpisode(302);
    expect(cancelled).toBe(2); // slices 2 and 3

    const status = getSchedulerStatus(302)!;
    expect(status.cancelled).toBe(2);
    expect(status.generating).toBe(1); // slice 1 still generating
  });

  it("returns null status for unknown episode", () => {
    expect(getSchedulerStatus(999)).toBeNull();
  });

  it("returns empty ready slices for unknown episode", () => {
    expect(getReadySlices(999)).toEqual([]);
  });
});

describe("Parallel Slice Scheduler — Graph Visualization", () => {
  beforeEach(() => {
    for (const ep of getActiveEpisodes()) {
      cleanupGraph(ep);
    }
  });

  it("returns nodes and edges for visualization", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 8 },
      { sliceId: 2, sceneIndex: 0, characterIds: [10], importance: 5 },
      { sliceId: 3, sceneIndex: 1, characterIds: [10], importance: 6 },
    ];

    buildDependencyGraph(400, slices);
    const viz = getGraphForVisualization(400)!;

    expect(viz.nodes.length).toBe(3);
    expect(viz.edges.length).toBeGreaterThan(0);
    expect(viz.parallelLanes.length).toBeGreaterThan(0);
  });

  it("computes parallel lanes correctly", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [10], importance: 8 },
      { sliceId: 2, sceneIndex: 1, characterIds: [20], importance: 6 },
      { sliceId: 3, sceneIndex: 2, characterIds: [30], importance: 4 },
    ];

    buildDependencyGraph(401, slices);
    const viz = getGraphForVisualization(401)!;

    // All independent, should be in the same lane (level 0)
    expect(viz.parallelLanes.length).toBe(1);
    expect(viz.parallelLanes[0].length).toBe(3);
  });

  it("returns null for unknown episode", () => {
    expect(getGraphForVisualization(999)).toBeNull();
  });
});

describe("Parallel Slice Scheduler — Cleanup", () => {
  it("removes graph from memory", () => {
    const slices: SliceInput[] = [
      { sliceId: 1, sceneIndex: 0, characterIds: [], importance: 5 },
    ];

    buildDependencyGraph(500, slices);
    expect(getActiveEpisodes()).toContain(500);

    cleanupGraph(500);
    expect(getActiveEpisodes()).not.toContain(500);
    expect(getSchedulerStatus(500)).toBeNull();
  });

  it("returns false for non-existent graph", () => {
    expect(cleanupGraph(999)).toBe(false);
  });
});
