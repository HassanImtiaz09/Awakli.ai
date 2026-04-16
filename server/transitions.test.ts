/**
 * Tests for Panel-to-Panel Transitions
 *
 * Covers:
 * - FFmpeg xfade filter mapping
 * - Duration clamping
 * - xfade filter graph generation
 * - Clip start time calculations with transition overlaps
 * - Total duration calculations
 * - Edge cases (single clip, all cuts, mixed transitions)
 * - tRPC router registration
 */

import { describe, it, expect } from "vitest";
import {
  mapTransitionToXfade,
  clampDuration,
  buildXfadeFilterGraph,
  calculateClipStartTimes,
  calculateTotalDuration,
  type TransitionSpec,
  type TransitionType,
} from "./video-assembly";

// ─── mapTransitionToXfade ──────────────────────────────────────────────

describe("mapTransitionToXfade", () => {
  it("maps cut to null (no xfade)", () => {
    expect(mapTransitionToXfade("cut")).toBeNull();
  });

  it("maps fade to fadeblack", () => {
    expect(mapTransitionToXfade("fade")).toBe("fadeblack");
  });

  it("maps dissolve to dissolve", () => {
    expect(mapTransitionToXfade("dissolve")).toBe("dissolve");
  });

  it("maps cross-dissolve to fade", () => {
    expect(mapTransitionToXfade("cross-dissolve")).toBe("fade");
  });

  it("returns null for unknown transition types", () => {
    expect(mapTransitionToXfade("unknown" as TransitionType)).toBeNull();
  });
});

// ─── clampDuration ─────────────────────────────────────────────────────

describe("clampDuration", () => {
  it("clamps below minimum to 0.2", () => {
    expect(clampDuration(0.05)).toBe(0.2);
    expect(clampDuration(0)).toBe(0.2);
    expect(clampDuration(-1)).toBe(0.2);
  });

  it("clamps above maximum to 2.0", () => {
    expect(clampDuration(3.0)).toBe(2.0);
    expect(clampDuration(10)).toBe(2.0);
  });

  it("passes through valid durations", () => {
    expect(clampDuration(0.5)).toBe(0.5);
    expect(clampDuration(1.0)).toBe(1.0);
    expect(clampDuration(0.2)).toBe(0.2);
    expect(clampDuration(2.0)).toBe(2.0);
  });
});

// ─── calculateClipStartTimes ───────────────────────────────────────────

describe("calculateClipStartTimes", () => {
  it("returns [0] for a single clip", () => {
    const result = calculateClipStartTimes([5], []);
    expect(result).toEqual([0]);
  });

  it("calculates start times with all cuts (minimal overlap)", () => {
    const durations = [5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "cut", duration: 0.5 },
      { type: "cut", duration: 0.5 },
    ];
    const result = calculateClipStartTimes(durations, transitions);
    // Cut uses 0.05s overlap
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(4.95, 2);
    expect(result[2]).toBeCloseTo(9.9, 2);
  });

  it("calculates start times with cross-dissolve transitions", () => {
    const durations = [5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "cross-dissolve", duration: 0.5 },
      { type: "cross-dissolve", duration: 0.5 },
    ];
    const result = calculateClipStartTimes(durations, transitions);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(4.5, 2);  // 5 - 0.5
    expect(result[2]).toBeCloseTo(9.0, 2);  // 4.5 + 5 - 0.5
  });

  it("calculates start times with mixed transitions", () => {
    const durations = [5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "fade", duration: 0.8 },
      { type: "cut", duration: 0.5 },
    ];
    const result = calculateClipStartTimes(durations, transitions);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(4.2, 2);  // 5 - 0.8
    expect(result[2]).toBeCloseTo(9.15, 2); // 4.2 + 5 - 0.05 (cut)
  });

  it("handles long transition durations (clamped)", () => {
    const durations = [5, 5];
    const transitions: TransitionSpec[] = [
      { type: "dissolve", duration: 3.0 }, // clamped to 2.0
    ];
    const result = calculateClipStartTimes(durations, transitions);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(3.0, 2); // 5 - 2.0 (clamped)
  });
});

// ─── calculateTotalDuration ────────────────────────────────────────────

describe("calculateTotalDuration", () => {
  it("returns 0 for empty clip array", () => {
    expect(calculateTotalDuration([], [])).toBe(0);
  });

  it("returns single clip duration", () => {
    expect(calculateTotalDuration([5], [])).toBe(5);
  });

  it("calculates total with all cuts", () => {
    const durations = [5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "cut", duration: 0.5 },
      { type: "cut", duration: 0.5 },
    ];
    const total = calculateTotalDuration(durations, transitions);
    // 3 clips × 5s = 15s, minus 2 × 0.05s overlap = 14.9s
    expect(total).toBeCloseTo(14.9, 1);
  });

  it("calculates total with cross-dissolve transitions (shorter than all-cuts)", () => {
    const durations = [5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "cross-dissolve", duration: 0.5 },
      { type: "cross-dissolve", duration: 0.5 },
    ];
    const total = calculateTotalDuration(durations, transitions);
    // 3 clips × 5s = 15s, minus 2 × 0.5s overlap = 14s
    expect(total).toBeCloseTo(14.0, 1);
  });

  it("calculates total with fade transitions", () => {
    const durations = [5, 5];
    const transitions: TransitionSpec[] = [
      { type: "fade", duration: 1.0 },
    ];
    const total = calculateTotalDuration(durations, transitions);
    // 2 clips × 5s = 10s, minus 1.0s overlap = 9s
    expect(total).toBeCloseTo(9.0, 1);
  });

  it("longer transitions produce shorter total duration", () => {
    const durations = [5, 5, 5];
    const shortTransitions: TransitionSpec[] = [
      { type: "cross-dissolve", duration: 0.3 },
      { type: "cross-dissolve", duration: 0.3 },
    ];
    const longTransitions: TransitionSpec[] = [
      { type: "cross-dissolve", duration: 1.5 },
      { type: "cross-dissolve", duration: 1.5 },
    ];
    const shortTotal = calculateTotalDuration(durations, shortTransitions);
    const longTotal = calculateTotalDuration(durations, longTransitions);
    expect(longTotal).toBeLessThan(shortTotal);
  });
});

// ─── buildXfadeFilterGraph ─────────────────────────────────────────────

describe("buildXfadeFilterGraph", () => {
  it("throws for less than 2 clips", () => {
    expect(() =>
      buildXfadeFilterGraph(
        ["/tmp/a.mp4"],
        [5],
        [{ type: "cut", duration: 0.5 }]
      )
    ).toThrow("Need at least 2 clips");
  });

  it("generates correct input arguments for 2 clips", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "cross-dissolve", duration: 0.5 }]
    );

    // Should have -i for each clip
    expect(args).toContain("-i");
    expect(args).toContain("/tmp/a.mp4");
    expect(args).toContain("/tmp/b.mp4");
  });

  it("generates filter_complex with xfade for cross-dissolve", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "cross-dissolve", duration: 0.5 }]
    );

    const filterIdx = args.indexOf("-filter_complex");
    expect(filterIdx).toBeGreaterThan(-1);
    const filterStr = args[filterIdx + 1];
    expect(filterStr).toContain("xfade=transition=fade");
    expect(filterStr).toContain("duration=0.500");
    expect(filterStr).toContain("acrossfade");
  });

  it("generates filter_complex with fadeblack for fade transition", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "fade", duration: 0.8 }]
    );

    const filterIdx = args.indexOf("-filter_complex");
    const filterStr = args[filterIdx + 1];
    expect(filterStr).toContain("xfade=transition=fadeblack");
    expect(filterStr).toContain("duration=0.800");
  });

  it("generates filter_complex with dissolve for dissolve transition", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "dissolve", duration: 0.6 }]
    );

    const filterIdx = args.indexOf("-filter_complex");
    const filterStr = args[filterIdx + 1];
    expect(filterStr).toContain("xfade=transition=dissolve");
    expect(filterStr).toContain("duration=0.600");
  });

  it("uses minimal xfade for cut transitions", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "cut", duration: 0.5 }]
    );

    const filterIdx = args.indexOf("-filter_complex");
    const filterStr = args[filterIdx + 1];
    // Cut uses a 0.05s fade as a near-instant transition
    expect(filterStr).toContain("duration=0.05");
  });

  it("generates chained xfade for 3+ clips", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4", "/tmp/c.mp4"],
      [5, 5, 5],
      [
        { type: "cross-dissolve", duration: 0.5 },
        { type: "fade", duration: 0.8 },
      ]
    );

    const filterIdx = args.indexOf("-filter_complex");
    const filterStr = args[filterIdx + 1];

    // Should have 2 xfade filters chained
    const xfadeCount = (filterStr.match(/xfade=/g) || []).length;
    expect(xfadeCount).toBe(2);

    // Should have 2 acrossfade filters
    const acrossfadeCount = (filterStr.match(/acrossfade=/g) || []).length;
    expect(acrossfadeCount).toBe(2);

    // Final labels should be [vout] and [aout]
    expect(filterStr).toContain("[vout]");
    expect(filterStr).toContain("[aout]");
  });

  it("maps output to [vout] and [aout]", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "cross-dissolve", duration: 0.5 }]
    );

    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
    expect(args).toContain("[aout]");
  });

  it("includes codec settings in output args", () => {
    const { args } = buildXfadeFilterGraph(
      ["/tmp/a.mp4", "/tmp/b.mp4"],
      [5, 5],
      [{ type: "cross-dissolve", duration: 0.5 }]
    );

    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
  });
});

// ─── Edge cases ────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles very short clips with transitions", () => {
    const durations = [1, 1];
    const transitions: TransitionSpec[] = [
      { type: "cross-dissolve", duration: 0.5 },
    ];
    const total = calculateTotalDuration(durations, transitions);
    expect(total).toBeCloseTo(1.5, 1); // 1 + 1 - 0.5
    expect(total).toBeGreaterThan(0);
  });

  it("handles many clips (10+)", () => {
    const n = 12;
    const durations = Array(n).fill(5);
    const transitions: TransitionSpec[] = Array(n - 1).fill({
      type: "cross-dissolve" as TransitionType,
      duration: 0.5,
    });
    const total = calculateTotalDuration(durations, transitions);
    // 12 × 5 = 60, minus 11 × 0.5 = 54.5
    expect(total).toBeCloseTo(54.5, 1);
  });

  it("handles alternating transition types", () => {
    const durations = [5, 5, 5, 5];
    const transitions: TransitionSpec[] = [
      { type: "fade", duration: 0.8 },
      { type: "cut", duration: 0.5 },
      { type: "cross-dissolve", duration: 0.5 },
    ];
    const startTimes = calculateClipStartTimes(durations, transitions);
    expect(startTimes).toHaveLength(4);
    // Each start time should be after the previous
    for (let i = 1; i < startTimes.length; i++) {
      expect(startTimes[i]).toBeGreaterThan(startTimes[i - 1]);
    }
  });
});

// ─── tRPC router registration ──────────────────────────────────────────

describe("Transitions tRPC router", () => {
  it("exports transitionsRouter with expected procedures", async () => {
    const { transitionsRouter } = await import("./routers-transitions");
    expect(transitionsRouter).toBeDefined();

    // Check procedure names exist
    const procedures = Object.keys((transitionsRouter as any)._def.procedures);
    expect(procedures).toContain("getByEpisode");
    expect(procedures).toContain("updatePanel");
    expect(procedures).toContain("batchUpdate");
    expect(procedures).toContain("applyToAll");
    expect(procedures).toContain("previewDuration");
    expect(procedures).toContain("getTypes");
  });

  it("is registered in the main appRouter", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys((appRouter as any)._def.procedures);
    // transitions.getByEpisode etc. should be flattened
    const transitionProcs = procedures.filter(p => p.startsWith("transitions."));
    expect(transitionProcs.length).toBeGreaterThanOrEqual(6);
  });
});
