/**
 * H1 · durationCheck
 *
 * Fail if runtime is not within ±5s of (sliceCount × 10s) + (titleCard + endCard).
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface DurationCheckOptions {
  videoPath: string;
  sliceCount: number;
  sliceDurationSec?: number;    // default 10
  titleCardDurationSec: number;
  endCardDurationSec: number;
  toleranceSec?: number;        // default 5
}

export function runDurationCheck(options: DurationCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    sliceCount,
    sliceDurationSec = 10,
    titleCardDurationSec,
    endCardDurationSec,
    toleranceSec = 5,
  } = options;

  try {
    const durationOut = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();

    const actualDuration = parseFloat(durationOut);
    const expectedDuration = (sliceCount * sliceDurationSec) + titleCardDurationSec + endCardDurationSec;
    const diff = Math.abs(actualDuration - expectedDuration);
    const passed = diff <= toleranceSec;

    return {
      checkName: "duration_check",
      passed,
      details: passed
        ? `Duration ${actualDuration.toFixed(1)}s within ±${toleranceSec}s of expected ${expectedDuration.toFixed(1)}s (diff: ${diff.toFixed(1)}s)`
        : `Duration ${actualDuration.toFixed(1)}s deviates ${diff.toFixed(1)}s from expected ${expectedDuration.toFixed(1)}s (tolerance: ±${toleranceSec}s)`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Duration check passed" }
        : { target: "slice_identify_missing", reason: `Duration off by ${diff.toFixed(1)}s — identify missing/extra slice` },
      metrics: {
        actualDurationSec: actualDuration,
        expectedDurationSec: expectedDuration,
        diffSec: diff,
        sliceCount,
      },
    };
  } catch (err: any) {
    return {
      checkName: "duration_check",
      passed: false,
      details: `Duration check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "slice_identify_missing", reason: "Duration check errored — investigate" },
      metrics: { error: true },
    };
  }
}
