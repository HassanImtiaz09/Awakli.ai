/**
 * H1 · watermarkCheck
 *
 * Pixel-region check on the brand-watermark bottom-right corner.
 * Only applies to Apprentice tier projects.
 * For non-Apprentice tiers, this check always passes.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import type { HarnessCheckResult } from "../types.js";

export interface WatermarkCheckOptions {
  videoPath: string;
  /** Whether this is an Apprentice tier project that requires watermark */
  requireWatermark: boolean;
  /** Temp directory for extracted frames */
  tempDir: string;
  /** Region to check: bottom-right corner (pixels from edge) */
  regionSize?: number;
  /** Minimum non-black pixel percentage in the watermark region (default: 5%) */
  minNonBlackPct?: number;
}

export function runWatermarkCheck(options: WatermarkCheckOptions): HarnessCheckResult {
  const start = Date.now();
  const {
    videoPath,
    requireWatermark,
    tempDir,
    regionSize = 100,
    minNonBlackPct = 5,
  } = options;

  // Skip for non-Apprentice tiers
  if (!requireWatermark) {
    return {
      checkName: "watermark_check",
      passed: true,
      details: "Watermark not required for this tier — skipped",
      durationMs: Date.now() - start,
      routingHint: { target: "none", reason: "Watermark not required" },
    };
  }

  try {
    fs.mkdirSync(tempDir, { recursive: true });

    // Extract a frame from the middle of the video
    const durationOut = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}" 2>/dev/null`
    ).toString().trim();
    const midpoint = parseFloat(durationOut) / 2;

    const framePath = path.join(tempDir, "watermark_check_frame.png");
    execSync(
      `ffmpeg -y -ss ${midpoint.toFixed(2)} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" 2>/dev/null`,
      { timeout: 10000 }
    );

    if (!fs.existsSync(framePath)) {
      return {
        checkName: "watermark_check",
        passed: false,
        details: "Could not extract frame for watermark check",
        durationMs: Date.now() - start,
        routingHint: { target: "assembly_reencode", reason: "Frame extraction failed — re-encode with watermark" },
      };
    }

    // Crop bottom-right region and check for non-black pixels
    const cropPath = path.join(tempDir, "watermark_region.png");
    execSync(
      `ffmpeg -y -i "${framePath}" -vf "crop=${regionSize}:${regionSize}:iw-${regionSize}:ih-${regionSize}" "${cropPath}" 2>/dev/null`,
      { timeout: 10000 }
    );

    // Use Python to check pixel content in the cropped region
    const pythonScript = `
import cv2, sys
img = cv2.imread("${cropPath}")
if img is None:
    print("0")
    sys.exit(0)
total = img.shape[0] * img.shape[1]
# Count non-black pixels (any channel > 20)
import numpy as np
non_black = np.sum(np.any(img > 20, axis=2))
pct = (non_black / total) * 100
print(f"{pct:.2f}")
`;
    const scriptPath = path.join(tempDir, "watermark_check.py");
    fs.writeFileSync(scriptPath, pythonScript);
    const pctStr = execSync(`python3 "${scriptPath}" 2>/dev/null`, { timeout: 10000 }).toString().trim();
    const nonBlackPct = parseFloat(pctStr) || 0;

    const passed = nonBlackPct >= minNonBlackPct;

    return {
      checkName: "watermark_check",
      passed,
      details: passed
        ? `Watermark region has ${nonBlackPct.toFixed(1)}% non-black pixels (≥${minNonBlackPct}% required)`
        : `Watermark region has only ${nonBlackPct.toFixed(1)}% non-black pixels (<${minNonBlackPct}% — watermark likely missing)`,
      durationMs: Date.now() - start,
      routingHint: passed
        ? { target: "none", reason: "Watermark check passed" }
        : { target: "assembly_reencode", reason: "Watermark missing — re-encode with watermark applied" },
      metrics: { nonBlackPct, regionSize, requireWatermark },
    };
  } catch (err: any) {
    return {
      checkName: "watermark_check",
      passed: false,
      details: `Watermark check error: ${err.message?.slice(0, 200)}`,
      durationMs: Date.now() - start,
      routingHint: { target: "assembly_reencode", reason: "Watermark check errored — re-encode" },
      metrics: { error: true },
    };
  }
}
