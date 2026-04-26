/**
 * H1 · silenceCheck
 *
 * FFmpeg silencedetect at -30dB threshold.
 * FAIL if any silent stretch > 1 second is found outside title/end card regions.
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface SilenceCheckOptions {
  /** Path to the assembled video file */
  videoPath: string;
  /** Duration of the title card in seconds (excluded from silence check) */
  titleCardDurationSec: number;
  /** Duration of the end card in seconds (excluded from silence check) */
  endCardDurationSec: number;
  /** Total video duration in seconds (used to compute end-card boundary) */
  totalDurationSec?: number;
  /** Silence threshold in dB (default: -30) */
  thresholdDb?: number;
  /** Minimum silence duration to flag, in seconds (default: 1.0) */
  minSilenceSec?: number;
}

interface SilentStretch {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export function runSilenceCheck(options: SilenceCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    titleCardDurationSec,
    endCardDurationSec,
    thresholdDb = -30,
    minSilenceSec = 1.0,
  } = options;

  try {
    // Get total duration if not provided
    let totalDuration = options.totalDurationSec;
    if (!totalDuration) {
      const durationOut = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" 2>/dev/null`
      ).toString().trim();
      totalDuration = parseFloat(durationOut);
    }

    // Run FFmpeg silencedetect
    const silenceOutput = execSync(
      `ffmpeg -i "${videoPath}" -af silencedetect=noise=${thresholdDb}dB:d=${minSilenceSec} -f null - 2>&1 || true`,
      { timeout: 30000 }
    ).toString();

    // Parse silence_start / silence_end pairs
    const silentStretches: SilentStretch[] = [];
    const startRegex = /silence_start:\s*([\d.]+)/g;
    const endRegex = /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g;

    const starts: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = startRegex.exec(silenceOutput)) !== null) {
      starts.push(parseFloat(match[1]));
    }

    let idx = 0;
    while ((match = endRegex.exec(silenceOutput)) !== null) {
      const endSec = parseFloat(match[1]);
      const durationSec = parseFloat(match[2]);
      const startSec = starts[idx] ?? endSec - durationSec;
      silentStretches.push({ startSec, endSec, durationSec });
      idx++;
    }

    // Filter out stretches that fall entirely within title or end card regions
    const contentStart = titleCardDurationSec;
    const contentEnd = totalDuration - endCardDurationSec;

    const contentSilences = silentStretches.filter((s) => {
      // Stretch overlaps with content region
      return s.endSec > contentStart && s.startSec < contentEnd && s.durationSec > minSilenceSec;
    });

    const passed = contentSilences.length === 0;

    return {
      checkName: "silence_check",
      passed,
      details: passed
        ? `No silent stretches > ${minSilenceSec}s found in content region (${contentStart.toFixed(1)}s–${contentEnd.toFixed(1)}s)`
        : `Found ${contentSilences.length} silent stretch(es) > ${minSilenceSec}s in content region: ${contentSilences.map((s) => `${s.startSec.toFixed(1)}–${s.endSec.toFixed(1)}s (${s.durationSec.toFixed(1)}s)`).join(", ")}`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Silence check passed" }
        : { target: "a1_music_bed", reason: `${contentSilences.length} silent gap(s) detected — re-run music bed` },
      metrics: {
        silentStretchCount: contentSilences.length,
        longestSilenceSec: contentSilences.length > 0
          ? Math.max(...contentSilences.map((s) => s.durationSec))
          : 0,
        thresholdDb,
      },
    };
  } catch (err: any) {
    return {
      checkName: "silence_check",
      passed: false,
      details: `Silence check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "a1_music_bed", reason: "Silence check errored — assume music bed issue" },
      metrics: { error: true },
    };
  }
}
