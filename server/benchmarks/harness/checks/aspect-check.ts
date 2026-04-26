/**
 * H1 · aspectCheck
 *
 * ffprobe resolution check.
 * FAIL if width != 1280 or height != 720 or aspect != 16:9.
 */

import { execSync } from "child_process";
import type { HarnessCheckResult } from "../types.js";

export interface AspectCheckOptions {
  videoPath: string;
  expectedWidth?: number;
  expectedHeight?: number;
}

export function runAspectCheck(options: AspectCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const { videoPath, expectedWidth = 1280, expectedHeight = 720 } = options;

  try {
    const probeOut = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,display_aspect_ratio -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();

    const parts = probeOut.split(",");
    const width = parseInt(parts[0]);
    const height = parseInt(parts[1]);
    const dar = parts[2] || "N/A";

    const widthOk = width === expectedWidth;
    const heightOk = height === expectedHeight;
    const aspectOk = Math.abs(width / height - 16 / 9) < 0.02;
    const passed = widthOk && heightOk && aspectOk;

    const issues: string[] = [];
    if (!widthOk) issues.push(`width ${width} != ${expectedWidth}`);
    if (!heightOk) issues.push(`height ${height} != ${expectedHeight}`);
    if (!aspectOk) issues.push(`aspect ${(width / height).toFixed(3)} != 1.778 (16:9)`);

    return {
      checkName: "aspect_check",
      passed,
      details: passed
        ? `Resolution ${width}x${height} (${dar}) — matches 1280x720 16:9`
        : `Resolution mismatch: ${issues.join("; ")}`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Aspect check passed" }
        : { target: "assembly_reencode", reason: `Resolution/aspect mismatch — re-encode assembly` },
      metrics: { width, height, dar, widthOk, heightOk, aspectOk },
    };
  } catch (err: any) {
    return {
      checkName: "aspect_check",
      passed: false,
      details: `Aspect check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "assembly_reencode", reason: "Aspect check errored — re-encode" },
      metrics: { error: true },
    };
  }
}
