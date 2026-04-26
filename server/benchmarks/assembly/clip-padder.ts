/**
 * clip-padder.ts
 *
 * Post-generation helper that extends short clips to a target duration.
 *
 * Strategy:
 *   1. Measure actual clip duration via ffprobe
 *   2. If clip is already ≥ target (within tolerance), return as-is
 *   3. Otherwise, generate a short extension clip using the same provider
 *   4. Concatenate original + extension with a brief crossfade
 *   5. Trim to exactly the target duration
 *
 * This solves the Vidu Q3 (max 8s) and Veo 3.1 Lite (max 8s) gap when
 * the fixture expects 10s per slice.
 */

import { execSync } from "child_process";
import path from "path";
import fs from "fs";

export interface ClipPadOptions {
  /** Path to the generated clip (local file) */
  clipPath: string;
  /** Target duration in seconds */
  targetDurationSec: number;
  /** Tolerance in seconds — if actual >= target - tolerance, skip padding */
  toleranceSec?: number;
  /** Working directory for temp files */
  workDir: string;
  /** Crossfade duration in seconds between original and extension (default: 0.5) */
  crossfadeSec?: number;
  /**
   * Optional callback to generate an extension clip.
   * Receives the deficit in seconds and returns a local file path.
   * If not provided, the clip is extended by speed-ramping the last segment.
   */
  generateExtension?: (deficitSec: number) => Promise<string>;
}

export interface ClipPadResult {
  /** Final output path (may be same as input if no padding needed) */
  outputPath: string;
  /** Original clip duration */
  originalDurationSec: number;
  /** Final clip duration */
  finalDurationSec: number;
  /** Whether padding was applied */
  padded: boolean;
  /** Method used: "none" | "speed_ramp" | "extension_clip" */
  method: "none" | "speed_ramp" | "extension_clip";
}

/**
 * Measure video duration via ffprobe.
 */
export function measureDuration(filePath: string): number {
  const raw = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
    { encoding: "utf-8", timeout: 15_000 }
  ).trim();
  const dur = parseFloat(raw);
  if (isNaN(dur) || dur <= 0) throw new Error(`ffprobe returned invalid duration: ${raw}`);
  return dur;
}

/**
 * Pad a clip to the target duration.
 */
export async function padClipToTarget(options: ClipPadOptions): Promise<ClipPadResult> {
  const {
    clipPath,
    targetDurationSec,
    toleranceSec = 1.0,
    workDir,
    crossfadeSec = 0.5,
    generateExtension,
  } = options;

  // 1. Measure actual duration
  const originalDuration = measureDuration(clipPath);

  // 2. Check if padding is needed
  const deficit = targetDurationSec - originalDuration;
  if (deficit <= toleranceSec) {
    return {
      outputPath: clipPath,
      originalDurationSec: originalDuration,
      finalDurationSec: originalDuration,
      padded: false,
      method: "none",
    };
  }

  console.log(`  [clip-padder] Clip is ${originalDuration.toFixed(1)}s, target ${targetDurationSec}s (deficit: ${deficit.toFixed(1)}s)`);
  fs.mkdirSync(workDir, { recursive: true });

  const baseName = path.basename(clipPath, path.extname(clipPath));
  const paddedPath = path.join(workDir, `${baseName}_padded.mp4`);

  // 3. Try extension clip if callback provided
  if (generateExtension) {
    try {
      // Request a clip long enough to cover the deficit + crossfade overlap
      const extensionNeeded = deficit + crossfadeSec;
      console.log(`  [clip-padder] Generating extension clip (${extensionNeeded.toFixed(1)}s needed)...`);
      const extensionPath = await generateExtension(extensionNeeded);

      if (extensionPath && fs.existsSync(extensionPath)) {
        const extDuration = measureDuration(extensionPath);
        console.log(`  [clip-padder] Extension clip: ${extDuration.toFixed(1)}s`);

        // Concatenate with crossfade
        const totalBeforeTrim = originalDuration + extDuration - crossfadeSec;
        const xfadeOffset = originalDuration - crossfadeSec;

        // Check if both clips have audio
        const hasAudio1 = checkHasAudio(clipPath);
        const hasAudio2 = checkHasAudio(extensionPath);

        let filterComplex: string;
        if (hasAudio1 && hasAudio2) {
          filterComplex = [
            `[0:v][1:v]xfade=transition=fade:duration=${crossfadeSec}:offset=${xfadeOffset}[vout]`,
            `[0:a][1:a]acrossfade=d=${crossfadeSec}:c1=tri:c2=tri[aout]`,
          ].join(";");
        } else {
          // Add silent audio to whichever is missing, then crossfade
          const ensured1 = hasAudio1 ? clipPath : ensureAudioTrack(clipPath, workDir);
          const ensured2 = hasAudio2 ? extensionPath : ensureAudioTrack(extensionPath, workDir);

          // Re-run with ensured files
          const concatPath = path.join(workDir, `${baseName}_concat.mp4`);
          execSync(
            `ffmpeg -hide_banner -y ` +
            `-i "${ensured1}" -i "${ensured2}" ` +
            `-filter_complex "[0:v][1:v]xfade=transition=fade:duration=${crossfadeSec}:offset=${xfadeOffset}[vout];[0:a][1:a]acrossfade=d=${crossfadeSec}:c1=tri:c2=tri[aout]" ` +
            `-map "[vout]" -map "[aout]" ` +
            `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k ` +
            `-t ${targetDurationSec} "${concatPath}"`,
            { encoding: "utf-8", timeout: 120_000 }
          );

          // Clean up temp ensured files
          if (ensured1 !== clipPath && fs.existsSync(ensured1)) fs.unlinkSync(ensured1);
          if (ensured2 !== extensionPath && fs.existsSync(ensured2)) fs.unlinkSync(ensured2);

          // Rename to final
          fs.renameSync(concatPath, paddedPath);
          const finalDuration = measureDuration(paddedPath);
          return {
            outputPath: paddedPath,
            originalDurationSec: originalDuration,
            finalDurationSec: finalDuration,
            padded: true,
            method: "extension_clip",
          };
        }

        execSync(
          `ffmpeg -hide_banner -y ` +
          `-i "${clipPath}" -i "${extensionPath}" ` +
          `-filter_complex "${filterComplex}" ` +
          `-map "[vout]" -map "[aout]" ` +
          `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k ` +
          `-t ${targetDurationSec} "${paddedPath}"`,
          { encoding: "utf-8", timeout: 120_000 }
        );

        const finalDuration = measureDuration(paddedPath);
        console.log(`  [clip-padder] Extension method: ${originalDuration.toFixed(1)}s + ${extDuration.toFixed(1)}s → ${finalDuration.toFixed(1)}s`);
        return {
          outputPath: paddedPath,
          originalDurationSec: originalDuration,
          finalDurationSec: finalDuration,
          padded: true,
          method: "extension_clip",
        };
      }
    } catch (err: any) {
      console.warn(`  [clip-padder] Extension clip failed, falling back to speed ramp: ${err.message?.slice(0, 100)}`);
    }
  }

  // 4. Fallback: Speed-ramp the clip to stretch it to target duration
  //    This slows the video down proportionally (e.g., 8s → 10s = 0.8x speed)
  const speedFactor = originalDuration / targetDurationSec;
  console.log(`  [clip-padder] Speed-ramp: ${speedFactor.toFixed(3)}x (${originalDuration.toFixed(1)}s → ${targetDurationSec}s)`);

  // PTS multiplier is the inverse of speed factor
  const ptsFactor = (1 / speedFactor).toFixed(6);
  // Audio tempo must be between 0.5 and 2.0
  const audioTempo = Math.max(0.5, Math.min(2.0, speedFactor));

  const hasAudio = checkHasAudio(clipPath);
  let filterComplex: string;
  if (hasAudio) {
    filterComplex = `[0:v]setpts=${ptsFactor}*PTS[vout];[0:a]atempo=${audioTempo.toFixed(6)}[aout]`;
  } else {
    // Add silent audio first
    const withAudio = ensureAudioTrack(clipPath, workDir);
    filterComplex = `[0:v]setpts=${ptsFactor}*PTS[vout];[0:a]atempo=${audioTempo.toFixed(6)}[aout]`;

    execSync(
      `ffmpeg -hide_banner -y -i "${withAudio}" ` +
      `-filter_complex "${filterComplex}" ` +
      `-map "[vout]" -map "[aout]" ` +
      `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k ` +
      `-t ${targetDurationSec} -r 24 "${paddedPath}"`,
      { encoding: "utf-8", timeout: 120_000 }
    );

    if (withAudio !== clipPath && fs.existsSync(withAudio)) fs.unlinkSync(withAudio);

    const finalDuration = measureDuration(paddedPath);
    console.log(`  [clip-padder] Speed-ramp result: ${finalDuration.toFixed(1)}s`);
    return {
      outputPath: paddedPath,
      originalDurationSec: originalDuration,
      finalDurationSec: finalDuration,
      padded: true,
      method: "speed_ramp",
    };
  }

  execSync(
    `ffmpeg -hide_banner -y -i "${clipPath}" ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "[vout]" -map "[aout]" ` +
    `-c:v libx264 -preset fast -crf 18 -c:a aac -b:a 192k ` +
    `-t ${targetDurationSec} -r 24 "${paddedPath}"`,
    { encoding: "utf-8", timeout: 120_000 }
  );

  const finalDuration = measureDuration(paddedPath);
  console.log(`  [clip-padder] Speed-ramp result: ${finalDuration.toFixed(1)}s`);
  return {
    outputPath: paddedPath,
    originalDurationSec: originalDuration,
    finalDurationSec: finalDuration,
    padded: true,
    method: "speed_ramp",
  };
}

/**
 * Check if a video file has an audio stream.
 */
function checkHasAudio(filePath: string): boolean {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 10_000 }
    ).trim();
    return out.includes("audio");
  } catch {
    return false;
  }
}

/**
 * Add a silent stereo AAC track to a video-only file.
 */
function ensureAudioTrack(filePath: string, workDir: string): string {
  if (checkHasAudio(filePath)) return filePath;

  const baseName = path.basename(filePath, path.extname(filePath));
  const withAudioPath = path.join(workDir, `${baseName}_with_audio.mp4`);

  execSync(
    `ffmpeg -hide_banner -y -i "${filePath}" ` +
    `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 ` +
    `-c:v copy -c:a aac -b:a 128k -shortest "${withAudioPath}"`,
    { encoding: "utf-8", timeout: 30_000 }
  );

  return withAudioPath;
}
