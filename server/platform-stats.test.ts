/**
 * Platform Stats — Vitest tests for the getPlatformStats db helper
 * and the formatCount utility used on the Create page.
 */
import { describe, it, expect, vi } from "vitest";

// ─── getPlatformStats export ──────────────────────────────────────────

describe("getPlatformStats", () => {
  it("exports getPlatformStats as a function", async () => {
    const mod = await import("./db");
    expect(typeof mod.getPlatformStats).toBe("function");
  });

  it("returns the correct shape with numeric fields", async () => {
    const { getPlatformStats } = await import("./db");
    const result = await getPlatformStats();

    expect(result).toHaveProperty("totalProjects");
    expect(result).toHaveProperty("totalPanels");
    expect(result).toHaveProperty("activeCreators");

    expect(typeof result.totalProjects).toBe("number");
    expect(typeof result.totalPanels).toBe("number");
    expect(typeof result.activeCreators).toBe("number");

    // All counts must be non-negative
    expect(result.totalProjects).toBeGreaterThanOrEqual(0);
    expect(result.totalPanels).toBeGreaterThanOrEqual(0);
    expect(result.activeCreators).toBeGreaterThanOrEqual(0);
  });

  it("activeCreators never exceeds totalProjects", async () => {
    const { getPlatformStats } = await import("./db");
    const result = await getPlatformStats();
    // Each creator has at least one project, so creators <= projects
    expect(result.activeCreators).toBeLessThanOrEqual(
      Math.max(result.totalProjects, 1)
    );
  });
});

// ─── formatViewCount utility ──────────────────────────────────────────

describe("formatViewCount (used for stat display)", () => {
  it("exports formatViewCount as a function", async () => {
    const mod = await import("./db");
    expect(typeof mod.formatViewCount).toBe("function");
  });

  it("formats numbers below 1000 as-is", async () => {
    const { formatViewCount } = await import("./db");
    expect(formatViewCount(0)).toBe("0");
    expect(formatViewCount(42)).toBe("42");
    expect(formatViewCount(999)).toBe("999");
  });

  it("formats thousands with K suffix", async () => {
    const { formatViewCount } = await import("./db");
    expect(formatViewCount(1000)).toBe("1.0K");
    expect(formatViewCount(1500)).toBe("1.5K");
    expect(formatViewCount(12345)).toBe("12.3K");
    expect(formatViewCount(999999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", async () => {
    const { formatViewCount } = await import("./db");
    expect(formatViewCount(1_000_000)).toBe("1.0M");
    expect(formatViewCount(2_500_000)).toBe("2.5M");
  });
});
