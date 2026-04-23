/**
 * Milestone 8: Batch Assembly Queue — Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Dependencies ──────────────────────────────────────────────────

// Mock DB
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockInnerJoin = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();

const chainable = () => ({
  select: mockSelect,
  from: mockFrom,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
  innerJoin: mockInnerJoin,
  set: mockSet,
  values: mockValues,
});

mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
// mockWhere needs to be both thenable (for await) and have .orderBy/.limit
const makeWhereResult = (resolvedValue: unknown = []) => {
  const obj: any = {
    orderBy: mockOrderBy,
    limit: mockLimit,
    then: (resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve),
  };
  return obj;
};

mockWhere.mockImplementation(() => makeWhereResult([]));
mockOrderBy.mockImplementation(() => makeWhereResult([]));
mockInnerJoin.mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere, orderBy: mockOrderBy });
mockInsert.mockReturnValue({ values: mockValues });
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockValues.mockResolvedValue(undefined);
mockLimit.mockResolvedValue([]);

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
};

vi.mock("./db", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
  getUserSubscriptionTier: vi.fn(() => Promise.resolve("studio_pro")),
}));

vi.mock("../drizzle/schema", () => ({
  assemblyQueue: {
    id: "id",
    userId: "userId",
    episodeId: "episodeId",
    projectId: "projectId",
    batchId: "batchId",
    status: "status",
    priority: "priority",
    position: "position",
    error: "error",
    retryCount: "retryCount",
    estimatedCredits: "estimatedCredits",
    actualCredits: "actualCredits",
    queuedAt: "queuedAt",
    startedAt: "startedAt",
    completedAt: "completedAt",
  },
  episodes: {
    id: "id",
    title: "title",
    projectId: "projectId",
    videoUrl: "videoUrl",
  },
  videoSlices: {
    id: "id",
    episodeId: "episodeId",
    videoClipUrl: "videoClipUrl",
  },
  projects: {
    id: "id",
    title: "title",
    userId: "userId",
  },
}));

vi.mock("./video-assembler", () => ({
  assembleEpisodeWithCredits: vi.fn(() =>
    Promise.resolve({ videoUrl: "https://s3.example.com/assembled.mp4", duration: 120 }),
  ),
}));

vi.mock("./stream-delivery", () => ({
  deliverToStream: vi.fn(() => Promise.resolve()),
}));

vi.mock("./observability/logger", () => ({
  serverLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ type: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  asc: vi.fn((col: unknown) => ({ type: "asc", col })),
  desc: vi.fn((col: unknown) => ({ type: "desc", col })),
  inArray: vi.fn((...args: unknown[]) => ({ type: "inArray", args })),
  sql: Object.assign(vi.fn(), {
    raw: vi.fn(),
  }),
}));

// ─── Import Module Under Test ───────────────────────────────────────────

import {
  getBatchLimit,
  BATCH_LIMITS,
  validateEpisodesForBatch,
  enqueueBatchAssembly,
  getQueueDashboard,
  cancelQueueItem,
  retryFailedItem,
  getBatchEstimate,
} from "./batch-assembly-queue";
import { getUserSubscriptionTier } from "./db";

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Batch Assembly Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default chain behavior
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
    mockWhere.mockImplementation(() => makeWhereResult([]));
    mockOrderBy.mockImplementation(() => makeWhereResult([]));
    mockInnerJoin.mockReturnValue({ innerJoin: mockInnerJoin, where: mockWhere, orderBy: mockOrderBy });
    mockInsert.mockReturnValue({ values: mockValues });
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockValues.mockResolvedValue(undefined);
    mockLimit.mockResolvedValue([]);
  });

  // ─── getBatchLimit ──────────────────────────────────────────────────

  describe("getBatchLimit", () => {
    it("returns correct limits for all tiers", () => {
      expect(getBatchLimit("free_trial")).toBe(1);
      expect(getBatchLimit("creator")).toBe(3);
      expect(getBatchLimit("creator_pro")).toBe(5);
      expect(getBatchLimit("studio")).toBe(8);
      expect(getBatchLimit("studio_pro")).toBe(10);
      expect(getBatchLimit("enterprise")).toBe(20);
    });

    it("returns 1 for unknown tier", () => {
      expect(getBatchLimit("unknown_tier")).toBe(1);
    });

    it("BATCH_LIMITS has all expected tiers", () => {
      expect(Object.keys(BATCH_LIMITS)).toEqual([
        "free_trial",
        "creator",
        "creator_pro",
        "studio",
        "studio_pro",
        "enterprise",
      ]);
    });
  });

  // ─── validateEpisodesForBatch ─────────────────────────────────────

  describe("validateEpisodesForBatch", () => {
    it("returns errors when episode not found", async () => {
      // Episode lookup returns empty
      mockWhere.mockResolvedValueOnce([]);

      const result = await validateEpisodesForBatch(1, [999]);
      expect(result.valid).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reason).toContain("not found");
    });

    it("returns errors when no video slices", async () => {
      // Episode found
      mockWhere.mockResolvedValueOnce([{ id: 1, projectId: 10, videoUrl: null }]);
      // No slices
      mockWhere.mockResolvedValueOnce([]);

      const result = await validateEpisodesForBatch(1, [1]);
      expect(result.valid).toEqual([]);
      expect(result.errors[0].reason).toContain("No video slices");
    });

    it("returns errors when not all slices have video clips", async () => {
      // Episode found
      mockWhere.mockResolvedValueOnce([{ id: 1, projectId: 10, videoUrl: null }]);
      // Slices with one missing clip
      mockWhere.mockResolvedValueOnce([
        { id: 1, videoClipUrl: "https://example.com/clip1.mp4" },
        { id: 2, videoClipUrl: null },
      ]);

      const result = await validateEpisodesForBatch(1, [1]);
      expect(result.valid).toEqual([]);
      expect(result.errors[0].reason).toContain("1/2 slices");
    });

    it("returns errors when episode already in queue", async () => {
      // Episode found
      mockWhere.mockResolvedValueOnce([{ id: 1, projectId: 10, videoUrl: null }]);
      // All slices ready
      mockWhere.mockResolvedValueOnce([
        { id: 1, videoClipUrl: "https://example.com/clip1.mp4" },
      ]);
      // Already in queue
      mockWhere.mockResolvedValueOnce([{ id: 99 }]);

      const result = await validateEpisodesForBatch(1, [1]);
      expect(result.valid).toEqual([]);
      expect(result.errors[0].reason).toContain("already in the assembly queue");
    });

    it("validates successfully when all checks pass", async () => {
      // Episode found
      mockWhere.mockResolvedValueOnce([{ id: 1, projectId: 10, videoUrl: null }]);
      // All slices ready
      mockWhere.mockResolvedValueOnce([
        { id: 1, videoClipUrl: "https://example.com/clip1.mp4" },
        { id: 2, videoClipUrl: "https://example.com/clip2.mp4" },
      ]);
      // Not in queue
      mockWhere.mockResolvedValueOnce([]);

      const result = await validateEpisodesForBatch(1, [1]);
      expect(result.valid).toEqual([1]);
      expect(result.errors).toHaveLength(0);
    });

    it("handles multiple episodes with mixed results", async () => {
      // Episode 1: found
      mockWhere.mockResolvedValueOnce([{ id: 1, projectId: 10, videoUrl: null }]);
      // Episode 1: slices ready
      mockWhere.mockResolvedValueOnce([{ id: 1, videoClipUrl: "https://example.com/clip1.mp4" }]);
      // Episode 1: not in queue
      mockWhere.mockResolvedValueOnce([]);
      // Episode 2: not found
      mockWhere.mockResolvedValueOnce([]);

      const result = await validateEpisodesForBatch(1, [1, 2]);
      expect(result.valid).toEqual([1]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].episodeId).toBe(2);
    });
  });

  // ─── cancelQueueItem ──────────────────────────────────────────────

  describe("cancelQueueItem", () => {
    it("cancels a queued item successfully", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "queued", userId: 1 }]);
      mockWhere.mockResolvedValueOnce(undefined); // update

      const result = await cancelQueueItem(1, 1);
      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("rejects cancellation of non-queued items", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "assembling", userId: 1 }]);

      const result = await cancelQueueItem(1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("assembling");
    });

    it("returns error when item not found", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await cancelQueueItem(1, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("cannot cancel completed items", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "completed", userId: 1 }]);

      const result = await cancelQueueItem(1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("completed");
    });
  });

  // ─── retryFailedItem ──────────────────────────────────────────────

  describe("retryFailedItem", () => {
    it("retries a failed item successfully", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "failed", userId: 1 }]);
      mockWhere.mockResolvedValueOnce(undefined); // update

      const result = await retryFailedItem(1, 1);
      expect(result.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it("rejects retry of non-failed items", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "queued", userId: 1 }]);

      const result = await retryFailedItem(1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("queued");
    });

    it("returns error when item not found", async () => {
      mockWhere.mockResolvedValueOnce([]);

      const result = await retryFailedItem(1, 999);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("cannot retry assembling items", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, status: "assembling", userId: 1 }]);

      const result = await retryFailedItem(1, 1);
      expect(result.success).toBe(false);
      expect(result.error).toContain("assembling");
    });
  });

  // ─── getBatchEstimate ─────────────────────────────────────────────

  describe("getBatchEstimate", () => {
    it("returns correct estimate for single episode", async () => {
      // Episode lookup
      mockWhere.mockResolvedValueOnce([{ id: 1, title: "Episode 1" }]);
      // Slice count
      mockWhere.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const result = await getBatchEstimate(1, [1]);
      expect(result.episodeCount).toBe(1);
      expect(result.totalEstimatedCredits).toBe(2);
      expect(result.estimatedTotalMinutes).toBe(5);
      expect(result.perEpisode).toHaveLength(1);
      expect(result.perEpisode[0].sliceCount).toBe(3);
      expect(result.perEpisode[0].title).toBe("Episode 1");
    });

    it("returns correct estimate for multiple episodes", async () => {
      // Episode 1
      mockWhere.mockResolvedValueOnce([{ id: 1, title: "Ep 1" }]);
      mockWhere.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      // Episode 2
      mockWhere.mockResolvedValueOnce([{ id: 2, title: "Ep 2" }]);
      mockWhere.mockResolvedValueOnce([{ id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]);

      const result = await getBatchEstimate(1, [1, 2]);
      expect(result.episodeCount).toBe(2);
      expect(result.totalEstimatedCredits).toBe(4);
      expect(result.estimatedTotalMinutes).toBe(10);
      expect(result.perEpisode[0].sliceCount).toBe(2);
      expect(result.perEpisode[1].sliceCount).toBe(4);
    });

    it("handles missing episode title gracefully", async () => {
      mockWhere.mockResolvedValueOnce([{ id: 1, title: null }]);
      mockWhere.mockResolvedValueOnce([]);

      const result = await getBatchEstimate(1, [1]);
      expect(result.perEpisode[0].title).toBe("Episode 1");
    });
  });

  // ─── getQueueDashboard ────────────────────────────────────────────

  describe("getQueueDashboard", () => {
    it("returns empty dashboard when no items", async () => {
      mockOrderBy.mockImplementationOnce(() => makeWhereResult([]));

      const result = await getQueueDashboard(1);
      expect(result.items).toEqual([]);
      expect(result.totalQueued).toBe(0);
      expect(result.totalRunning).toBe(0);
      expect(result.totalCompleted).toBe(0);
      expect(result.totalFailed).toBe(0);
      expect(result.currentBatchId).toBeNull();
    });

    it("calculates status totals correctly", async () => {
      mockOrderBy.mockImplementationOnce(() => makeWhereResult([
        {
          id: 1, episodeId: 1, projectId: 10, episodeTitle: "Ep 1", projectTitle: "Proj",
          batchId: "abc123", status: "queued", position: 1, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: null, completedAt: null,
        },
        {
          id: 2, episodeId: 2, projectId: 10, episodeTitle: "Ep 2", projectTitle: "Proj",
          batchId: "abc123", status: "assembling", position: 2, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: new Date(), completedAt: null,
        },
        {
          id: 3, episodeId: 3, projectId: 10, episodeTitle: "Ep 3", projectTitle: "Proj",
          batchId: "abc123", status: "completed", position: 3, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: 2,
          queuedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
        },
        {
          id: 4, episodeId: 4, projectId: 10, episodeTitle: "Ep 4", projectTitle: "Proj",
          batchId: "abc123", status: "failed", position: 4, priority: 5,
          error: "Assembly failed", retryCount: 1, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: new Date(), completedAt: new Date(),
        },
      ]));

      const result = await getQueueDashboard(1);
      expect(result.totalQueued).toBe(1);
      expect(result.totalRunning).toBe(1);
      expect(result.totalCompleted).toBe(1);
      expect(result.totalFailed).toBe(1);
      expect(result.currentBatchId).toBe("abc123");
    });

    it("calculates estimated wait minutes for queued items", async () => {
      mockOrderBy.mockImplementationOnce(() => makeWhereResult([
        {
          id: 1, episodeId: 1, projectId: 10, episodeTitle: "Ep 1", projectTitle: "Proj",
          batchId: "abc123", status: "queued", position: 1, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: null, completedAt: null,
        },
        {
          id: 2, episodeId: 2, projectId: 10, episodeTitle: "Ep 2", projectTitle: "Proj",
          batchId: "abc123", status: "queued", position: 2, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: null, completedAt: null,
        },
      ]));

      const result = await getQueueDashboard(1);
      expect(result.items[0].estimatedWaitMinutes).toBe(5);
      expect(result.items[1].estimatedWaitMinutes).toBe(10);
    });

    it("handles null episode/project titles", async () => {
      mockOrderBy.mockImplementationOnce(() => makeWhereResult([
        {
          id: 1, episodeId: 5, projectId: 10, episodeTitle: null, projectTitle: null,
          batchId: "abc", status: "queued", position: 1, priority: 5,
          error: null, retryCount: 0, estimatedCredits: 2, actualCredits: null,
          queuedAt: new Date(), startedAt: null, completedAt: null,
        },
      ]));

      const result = await getQueueDashboard(1);
      expect(result.items[0].episodeTitle).toBe("Episode 5");
      expect(result.items[0].projectTitle).toBe("Project 10");
    });
  });

  // ─── Tier Gating Integration ──────────────────────────────────────

  describe("Tier gating", () => {
    it("enforces batch limits per tier", () => {
      // Verify the limits are strictly ordered
      const tiers = ["free_trial", "creator", "creator_pro", "studio", "studio_pro", "enterprise"];
      for (let i = 1; i < tiers.length; i++) {
        expect(getBatchLimit(tiers[i])).toBeGreaterThan(getBatchLimit(tiers[i - 1]));
      }
    });

    it("all tiers have positive limits", () => {
      for (const tier of Object.keys(BATCH_LIMITS)) {
        expect(BATCH_LIMITS[tier]).toBeGreaterThan(0);
      }
    });
  });
});
