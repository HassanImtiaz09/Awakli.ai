/**
 * H1 · durationCheck
 *
 * Fail if runtime is not within ±toleranceSec of the computed expected duration.
 *
 * Expected duration = sum(actualClipDurations) - totalTransitionOverlap + titleCard + endCard
 *
 * When actualClipDurations are not provided, falls back to sliceCount × sliceDurationSec.
 * This accounts for the fact that video generators (Vidu Q3, Veo 3.1 Lite) often produce
 * clips shorter than the requested duration (e.g., 8s instead of 10s).
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface DurationCheckOptions {
  videoPath: string;
  sliceCount: number;
  sliceDurationSec?: number;          // default 10 — used only if actualClipDurations not provided
  titleCardDurationSec: number;
  endCardDurationSec: number;
  toleranceSec?: number;              // default 5
  actualClipDurations?: number[];     // measured durations of each clip (in seconds)
  transitionOverlapSec?: number;      // total seconds lost to transition overlaps
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
    actualClipDurations,
    transitionOverlapSec = 0,
  } = options;

  try {
    const durationOut = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();

    const actualDuration = parseFloat(durationOut);

    // Compute expected duration from actual clip durations if available
    let contentDuration: number;
    let durationSource: string;
    if (actualClipDurations && actualClipDurations.length > 0) {
      contentDuration = actualClipDurations.reduce((sum, d) => sum + d, 0);
      durationSource = `measured (${actualClipDurations.length} clips)`;
    } else {
      contentDuration = sliceCount * sliceDurationSec;
      durationSource = `estimated (${sliceCount} × ${sliceDurationSec}s)`;
    }

    const expectedDuration = contentDuration - transitionOverlapSec + titleCardDurationSec + endCardDurationSec;
    const diff = Math.abs(actualDuration - expectedDuration);
    const passed = diff <= toleranceSec;

    return {
      checkName: "duration_check",
      passed,
      details: passed
        ? `Duration ${actualDuration.toFixed(1)}s within ±${toleranceSec}s of expected ${expectedDuration.toFixed(1)}s [${durationSource}] (diff: ${diff.toFixed(1)}s)`
        : `Duration ${actualDuration.toFixed(1)}s deviates ${diff.toFixed(1)}s from expected ${expectedDuration.toFixed(1)}s [${durationSource}] (tolerance: ±${toleranceSec}s)`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Duration check passed" }
        : { target: "slice_identify_missing", reason: `Duration off by ${diff.toFixed(1)}s — identify missing/extra slice` },
      metrics: {
        actualDurationSec: actualDuration,
        expectedDurationSec: expectedDuration,
        contentDurationSec: contentDuration,
        transitionOverlapSec,
        diffSec: diff,
        sliceCount,
        durationSource,
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
