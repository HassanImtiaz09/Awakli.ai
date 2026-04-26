/**
 * D5 Support · Keyframe Extractor
 *
 * Extracts 3 keyframes per slice (start, mid, end) at 720p using FFmpeg.
 * These frames feed into the D5 multimodal LLM visual reviewer.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export interface SliceKeyframes {
  sliceId: number;
  startFrame: string;   // absolute path to PNG
  midFrame: string;
  endFrame: string;
}

export interface KeyframeExtractionOptions {
  videoPath: string;
  slices: Array<{
    sliceId: number;
    startSec: number;
    durationSec: number;
  }>;
  /** Title card offset in seconds (frames are extracted relative to content start) */
  titleCardDurationSec: number;
  /** Output directory for extracted frames */
  outputDir: string;
  /** Output resolution width (default: 1280 for 720p) */
  width?: number;
  /** Output resolution height (default: 720) */
  height?: number;
}

export function extractKeyframes(options: KeyframeExtractionOptions): SliceKeyframes[] {
  const {
    videoPath,
    slices,
    titleCardDurationSec,
    outputDir,
    width = 1280,
    height = 720,
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const results: SliceKeyframes[] = [];

  for (const slice of slices) {
    const absoluteStart = titleCardDurationSec + slice.startSec;
    const absoluteMid = absoluteStart + (slice.durationSec / 2);
    const absoluteEnd = absoluteStart + slice.durationSec - 0.1; // slightly before end to avoid black frame

    const startFrame = path.join(outputDir, `slice_${slice.sliceId}_start.png`);
    const midFrame = path.join(outputDir, `slice_${slice.sliceId}_mid.png`);
    const endFrame = path.join(outputDir, `slice_${slice.sliceId}_end.png`);

    const extractFrame = (timeSec: number, outPath: string) => {
      try {
        execSync(
          `ffmpeg -y -ss ${timeSec.toFixed(2)} -i "${videoPath}" -vframes 1 -vf "scale=${width}:${height}" -q:v 2 "${outPath}" 2>/dev/null`,
          { timeout: 10000 }
        );
      } catch {
        // If extraction fails, create a placeholder note
        console.warn(`  [keyframe-extractor] Failed to extract frame at ${timeSec.toFixed(2)}s for slice ${slice.sliceId}`);
      }
    };

    extractFrame(absoluteStart + 0.1, startFrame);  // 0.1s after start to avoid transition
    extractFrame(absoluteMid, midFrame);
    extractFrame(absoluteEnd, endFrame);

    results.push({
      sliceId: slice.sliceId,
      startFrame: fs.existsSync(startFrame) ? startFrame : "",
      midFrame: fs.existsSync(midFrame) ? midFrame : "",
      endFrame: fs.existsSync(endFrame) ? endFrame : "",
    });
  }

  return results;
}

/**
 * Convert extracted keyframes to base64 data URIs for LLM vision input.
 */
export function keyframesToBase64(keyframes: SliceKeyframes[]): Array<{
  sliceId: number;
  frames: Array<{ position: "start" | "mid" | "end"; base64: string; mimeType: string }>;
}> {
  return keyframes.map((kf) => ({
    sliceId: kf.sliceId,
    frames: (["start", "mid", "end"] as const)
      .map((pos) => {
        const filePath = kf[`${pos}Frame`];
        if (!filePath || !fs.existsSync(filePath)) return null;
        const buffer = fs.readFileSync(filePath);
        return {
          position: pos,
          base64: buffer.toString("base64"),
          mimeType: "image/png",
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  }));
}
