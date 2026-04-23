/**
 * Milestone 9: Episode Analytics — Tests
 *
 * Tests for recordEpisodeView, updateViewProgress, getEpisodeViewStats,
 * getViewsTimeSeries, getDeviceBreakdown, getTopCountries, and the
 * combined getEpisodeAnalyticsDashboard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ────────────────────────────────────────────────────────────

const mockInsert = vi.fn();
const mockValues = vi.fn();
const mockUpdate = vi.fn();
const mockSet = vi.fn();
const mockWhere = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockInnerJoin = vi.fn();
const mockGroupBy = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

function makeChain(result: any = []) {
  const chain: any = {
    values: mockValues,
    set: mockSet,
    where: mockWhere,
    from: mockFrom,
    innerJoin: mockInnerJoin,
    groupBy: mockGroupBy,
    orderBy: mockOrderBy,
    limit: mockLimit,
    then: (resolve: any) => resolve(result),
    [Symbol.toStringTag]: "Promise",
  };
  mockInsert.mockReturnValue(chain);
  mockValues.mockReturnValue(chain);
  mockUpdate.mockReturnValue(chain);
  mockSet.mockReturnValue(chain);
  mockWhere.mockReturnValue(chain);
  mockSelect.mockReturnValue(chain);
  mockFrom.mockReturnValue(chain);
  mockInnerJoin.mockReturnValue(chain);
  mockGroupBy.mockReturnValue(chain);
  mockOrderBy.mockReturnValue(chain);
  mockLimit.mockReturnValue(chain);
  return chain;
}

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  })),
}));

vi.mock("./observability/logger", () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  recordEpisodeView,
  updateViewProgress,
  getEpisodeViewStats,
  getViewsTimeSeries,
  getDeviceBreakdown,
  getTopCountries,
  getEpisodeAnalyticsDashboard,
  hashIp,
  detectDevice,
} from "./episode-analytics";

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Episode Analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeChain([]);
  });

  // ─── hashIp ─────────────────────────────────────────────────────────

  describe("hashIp", () => {
    it("returns a 16-char hex string", () => {
      const hash = hashIp("192.168.1.1");
      expect(hash).toHaveLength(16);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it("returns same hash for same IP", () => {
      expect(hashIp("10.0.0.1")).toBe(hashIp("10.0.0.1"));
    });

    it("returns different hash for different IPs", () => {
      expect(hashIp("10.0.0.1")).not.toBe(hashIp("10.0.0.2"));
    });
  });

  // ─── detectDevice ──────────────────────────────────────────────────

  describe("detectDevice", () => {
    it("detects desktop from Windows UA", () => {
      expect(detectDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    });

    it("detects desktop from Macintosh UA", () => {
      expect(detectDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("desktop");
    });

    it("detects mobile from iPhone UA", () => {
      expect(detectDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)")).toBe("mobile");
    });

    it("detects mobile from Android mobile UA", () => {
      expect(detectDevice("Mozilla/5.0 (Linux; Android 13) Mobile")).toBe("mobile");
    });

    it("detects tablet from iPad UA", () => {
      expect(detectDevice("Mozilla/5.0 (iPad; CPU OS 16_0)")).toBe("tablet");
    });

    it("returns unknown for empty UA", () => {
      expect(detectDevice("")).toBe("unknown");
    });

    it("returns unknown for bot UA", () => {
      expect(detectDevice("Googlebot/2.1")).toBe("unknown");
    });

    it("detects desktop from Linux UA", () => {
      expect(detectDevice("Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop");
    });

    it("detects desktop from ChromeOS UA", () => {
      expect(detectDevice("Mozilla/5.0 (X11; CrOS x86_64)")).toBe("desktop");
    });
  });

  // ─── recordEpisodeView ─────────────────────────────────────────────

  describe("recordEpisodeView", () => {
    it("inserts a view record with correct fields", async () => {
      makeChain();
      const result = await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
        viewerUserId: 5,
        viewerIp: "192.168.1.1",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)",
        watchDurationSeconds: 120,
        completionPercent: 45,
        country: "US",
        referrer: "https://twitter.com",
      });

      expect(result).toBe(true);
      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 1,
          projectId: 10,
          viewerUserId: 5,
          device: "mobile",
          completionPercent: 45,
          country: "US",
          referrer: "https://twitter.com",
        }),
      );
    });

    it("hashes the IP address", async () => {
      makeChain();
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
        viewerIp: "10.0.0.1",
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.viewerIpHash).toBe(hashIp("10.0.0.1"));
      expect(call.viewerIpHash).not.toBe("10.0.0.1");
    });

    it("handles null viewerIp", async () => {
      makeChain();
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.viewerIpHash).toBeNull();
    });

    it("clamps completionPercent to 0-100", async () => {
      makeChain();
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
        completionPercent: 150,
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.completionPercent).toBe(100);
    });

    it("defaults watchDurationSeconds to 0", async () => {
      makeChain();
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.watchDurationSeconds).toBe(0);
    });

    it("truncates referrer to 512 chars", async () => {
      makeChain();
      const longReferrer = "https://example.com/" + "a".repeat(600);
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
        referrer: longReferrer,
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.referrer.length).toBeLessThanOrEqual(512);
    });

    it("truncates country to 2 chars", async () => {
      makeChain();
      await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
        country: "USA",
      });

      const call = mockValues.mock.calls[0][0];
      expect(call.country).toBe("US");
    });

    it("returns false on db error", async () => {
      mockInsert.mockImplementation(() => { throw new Error("DB error"); });
      const result = await recordEpisodeView({
        episodeId: 1,
        projectId: 10,
      });
      expect(result).toBe(false);
    });
  });

  // ─── updateViewProgress ────────────────────────────────────────────

  describe("updateViewProgress", () => {
    it("updates watch duration and completion", async () => {
      makeChain();
      const result = await updateViewProgress(42, 300, 75);

      expect(result).toBe(true);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          watchDurationSeconds: 300,
          completionPercent: 75,
        }),
      );
    });

    it("clamps completionPercent to 0-100", async () => {
      makeChain();
      await updateViewProgress(42, 300, 120);

      const call = mockSet.mock.calls[0][0];
      expect(call.completionPercent).toBe(100);
    });

    it("clamps negative completionPercent to 0", async () => {
      makeChain();
      await updateViewProgress(42, 300, -10);

      const call = mockSet.mock.calls[0][0];
      expect(call.completionPercent).toBe(0);
    });

    it("returns false on db error", async () => {
      mockUpdate.mockImplementation(() => { throw new Error("DB error"); });
      const result = await updateViewProgress(42, 300, 75);
      expect(result).toBe(false);
    });
  });

  // ─── getEpisodeViewStats ──────────────────────────────────────────

  describe("getEpisodeViewStats", () => {
    it("returns empty array when no data", async () => {
      makeChain([]);
      const result = await getEpisodeViewStats(1);
      expect(result).toEqual([]);
    });

    it("maps rows correctly with fallback title", async () => {
      makeChain([
        {
          episodeId: 5,
          episodeTitle: null,
          episodeNumber: 3,
          totalViews: 100,
          uniqueViewers: 80,
          avgWatchDuration: 125.7,
          avgCompletionPercent: 67.3,
          viewsToday: 5,
          viewsThisWeek: 25,
        },
      ]);

      const result = await getEpisodeViewStats(1);
      expect(result).toHaveLength(1);
      expect(result[0].episodeTitle).toBe("Episode 5");
      expect(result[0].avgWatchDuration).toBe(126); // rounded
      expect(result[0].avgCompletionPercent).toBe(67); // rounded
    });

    it("preserves episode title when present", async () => {
      makeChain([
        {
          episodeId: 1,
          episodeTitle: "The Beginning",
          episodeNumber: 1,
          totalViews: 50,
          uniqueViewers: 40,
          avgWatchDuration: 200,
          avgCompletionPercent: 85,
          viewsToday: 2,
          viewsThisWeek: 10,
        },
      ]);

      const result = await getEpisodeViewStats(1);
      expect(result[0].episodeTitle).toBe("The Beginning");
    });
  });

  // ─── getViewsTimeSeries ───────────────────────────────────────────

  describe("getViewsTimeSeries", () => {
    it("returns array with correct length for days parameter", async () => {
      makeChain([]);
      const result = await getViewsTimeSeries(1, 7);
      expect(result).toHaveLength(7);
    });

    it("fills missing dates with 0 views", async () => {
      makeChain([]);
      const result = await getViewsTimeSeries(1, 3);
      expect(result.every(p => p.views === 0)).toBe(true);
    });

    it("returns dates in YYYY-MM-DD format", async () => {
      makeChain([]);
      const result = await getViewsTimeSeries(1, 5);
      result.forEach(p => {
        expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it("returns dates in ascending order", async () => {
      makeChain([]);
      const result = await getViewsTimeSeries(1, 10);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].date > result[i - 1].date).toBe(true);
      }
    });
  });

  // ─── getDeviceBreakdown ───────────────────────────────────────────

  describe("getDeviceBreakdown", () => {
    it("returns empty array when no data", async () => {
      makeChain([]);
      const result = await getDeviceBreakdown(1);
      expect(result).toEqual([]);
    });

    it("calculates percentages correctly", async () => {
      makeChain([
        { device: "desktop", count: 60 },
        { device: "mobile", count: 30 },
        { device: "tablet", count: 10 },
      ]);

      const result = await getDeviceBreakdown(1);
      expect(result).toHaveLength(3);
      expect(result[0].device).toBe("desktop");
      expect(result[0].percentage).toBe(60);
      expect(result[1].percentage).toBe(30);
      expect(result[2].percentage).toBe(10);
    });

    it("handles null device as 'unknown'", async () => {
      makeChain([{ device: null, count: 5 }]);

      const result = await getDeviceBreakdown(1);
      expect(result[0].device).toBe("unknown");
    });
  });

  // ─── getTopCountries ──────────────────────────────────────────────

  describe("getTopCountries", () => {
    it("returns empty array when no data", async () => {
      makeChain([]);
      const result = await getTopCountries(1);
      expect(result).toEqual([]);
    });

    it("calculates percentages correctly", async () => {
      makeChain([
        { country: "US", count: 50 },
        { country: "JP", count: 30 },
        { country: "GB", count: 20 },
      ]);

      const result = await getTopCountries(1);
      expect(result).toHaveLength(3);
      expect(result[0].country).toBe("US");
      expect(result[0].percentage).toBe(50);
      expect(result[1].country).toBe("JP");
      expect(result[1].percentage).toBe(30);
    });

    it("handles null country as 'Unknown'", async () => {
      makeChain([{ country: null, count: 10 }]);

      const result = await getTopCountries(1);
      expect(result[0].country).toBe("Unknown");
    });
  });

  // ─── getEpisodeAnalyticsDashboard ─────────────────────────────────

  describe("getEpisodeAnalyticsDashboard", () => {
    it("returns zero-value dashboard when no data", async () => {
      makeChain([]);
      const result = await getEpisodeAnalyticsDashboard(1, 30);

      expect(result.totalEpisodeViews).toBe(0);
      expect(result.totalUniqueViewers).toBe(0);
      expect(result.avgWatchDuration).toBe(0);
      expect(result.avgCompletionPercent).toBe(0);
      expect(result.episodeStats).toEqual([]);
      expect(result.viewsTimeSeries).toHaveLength(30);
      expect(result.deviceBreakdown).toEqual([]);
      expect(result.topCountries).toEqual([]);
    });

    it("aggregates episode stats into totals", async () => {
      // Mock the first call (getEpisodeViewStats) to return episode data
      const chain = makeChain([
        {
          episodeId: 1,
          episodeTitle: "Ep 1",
          episodeNumber: 1,
          totalViews: 100,
          uniqueViewers: 80,
          avgWatchDuration: 200,
          avgCompletionPercent: 70,
          viewsToday: 5,
          viewsThisWeek: 20,
        },
        {
          episodeId: 2,
          episodeTitle: "Ep 2",
          episodeNumber: 2,
          totalViews: 50,
          uniqueViewers: 40,
          avgWatchDuration: 150,
          avgCompletionPercent: 60,
          viewsToday: 3,
          viewsThisWeek: 10,
        },
      ]);

      const result = await getEpisodeAnalyticsDashboard(1, 7);

      expect(result.totalEpisodeViews).toBe(150);
      expect(result.totalUniqueViewers).toBe(120);
      expect(result.avgWatchDuration).toBe(175); // (200+150)/2
      expect(result.avgCompletionPercent).toBe(65); // (70+60)/2
      expect(result.episodeStats).toHaveLength(2);
    });
  });
});
