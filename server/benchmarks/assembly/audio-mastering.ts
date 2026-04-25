/**
 * Q3: Audio Mastering — FFmpeg loudnorm pass for final output
 *
 * Target specifications:
 *   - Integrated loudness: -16 LUFS
 *   - Loudness range: 8 LU
 *   - True peak: -1.5 dBTP
 *   - Output: 192 kbps AAC stereo
 *
 * Uses FFmpeg's two-pass loudnorm filter for broadcast-quality normalization.
 * First pass measures the input, second pass applies correction.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export interface MasteringOptions {
  integratedLoudness?: number;  // Target LUFS (default: -16)
  loudnessRange?: number;       // Target LU range (default: 8)
  truePeak?: number;            // Target dBTP (default: -1.5)
  bitrate?: string;             // AAC bitrate (default: "192k")
  sampleRate?: number;          // Sample rate (default: 48000)
}

const DEFAULT_OPTIONS: Required<MasteringOptions> = {
  integratedLoudness: -16,
  loudnessRange: 8,
  truePeak: -1.5,
  bitrate: "192k",
  sampleRate: 48000,
};

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

/**
 * Two-pass loudnorm mastering on a video file's audio track.
 *
 * Pass 1: Measure the input audio characteristics
 * Pass 2: Apply loudnorm with measured values for precise normalization
 *
 * @param inputPath - Path to the input video/audio file
 * @param outputPath - Path for the mastered output
 * @param options - Mastering target specifications
 * @returns Path to the mastered output file
 */
export async function masterAudio(
  inputPath: string,
  outputPath: string,
  options: MasteringOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // ─── Pass 1: Measure ─────────────────────────────────────────────────────
  const measureCmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-i", JSON.stringify(inputPath),
    "-af", `loudnorm=I=${opts.integratedLoudness}:LRA=${opts.loudnessRange}:TP=${opts.truePeak}:print_format=json`,
    "-f", "null", "/dev/null",
  ].join(" ");

  console.log(`  [Q3] Pass 1: Measuring loudness...`);
  const { stderr: measureOutput } = await execAsync(measureCmd, { maxBuffer: 10 * 1024 * 1024 });

  // Parse the JSON measurement from FFmpeg's stderr
  const jsonMatch = measureOutput.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Q3: Failed to parse loudnorm measurement from FFmpeg output");
  }

  const measurement: LoudnormMeasurement = JSON.parse(jsonMatch[0]);
  console.log(`  [Q3] Measured: I=${measurement.input_i} LUFS, TP=${measurement.input_tp} dBTP, LRA=${measurement.input_lra} LU`);

  // ─── Pass 2: Apply ────────────────────────────────────────────────────────
  const loudnormFilter = [
    `loudnorm=I=${opts.integratedLoudness}`,
    `LRA=${opts.loudnessRange}`,
    `TP=${opts.truePeak}`,
    `measured_I=${measurement.input_i}`,
    `measured_TP=${measurement.input_tp}`,
    `measured_LRA=${measurement.input_lra}`,
    `measured_thresh=${measurement.input_thresh}`,
    `offset=${measurement.target_offset}`,
    `linear=true`,
  ].join(":");

  const applyCmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-i", JSON.stringify(inputPath),
    "-c:v", "copy",                          // Copy video stream unchanged
    "-af", JSON.stringify(loudnormFilter),
    "-ar", String(opts.sampleRate),
    "-c:a", "aac",
    "-b:a", opts.bitrate,
    "-ac", "2",                               // Stereo
    JSON.stringify(outputPath),
  ].join(" ");

  console.log(`  [Q3] Pass 2: Applying loudnorm (target: ${opts.integratedLoudness} LUFS, ${opts.truePeak} dBTP)...`);
  await execAsync(applyCmd, { maxBuffer: 10 * 1024 * 1024 });

  // Verify output exists
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Q3: Mastered output not found at ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`  [Q3] Mastered: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return outputPath;
}

/**
 * Master audio from a URL: download, process, return local path.
 * Useful for processing S3-hosted clips before final assembly.
 */
export async function masterAudioFromUrl(
  url: string,
  workDir: string,
  filename: string,
  options: MasteringOptions = {}
): Promise<string> {
  const inputPath = path.join(workDir, `raw_${filename}`);
  const outputPath = path.join(workDir, `mastered_${filename}`);

  // Download
  console.log(`  [Q3] Downloading: ${url.slice(0, 80)}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Q3: Download failed: ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(inputPath, buffer);

  // Master
  await masterAudio(inputPath, outputPath, options);

  // Clean up raw file
  try { fs.unlinkSync(inputPath); } catch { /* ignore */ }

  return outputPath;
}

/**
 * Verify audio loudness of a file (measurement only, no modification).
 * Returns the measured LUFS, true peak, and loudness range.
 */
export async function measureLoudness(filePath: string): Promise<{
  integratedLoudness: number;
  truePeak: number;
  loudnessRange: number;
}> {
  const cmd = [
    "ffmpeg", "-hide_banner",
    "-i", JSON.stringify(filePath),
    "-af", "loudnorm=I=-16:LRA=8:TP=-1.5:print_format=json",
    "-f", "null", "/dev/null",
  ].join(" ");

  const { stderr } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
  const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to measure loudness");

  const m = JSON.parse(jsonMatch[0]);
  return {
    integratedLoudness: parseFloat(m.input_i),
    truePeak: parseFloat(m.input_tp),
    loudnessRange: parseFloat(m.input_lra),
  };
}
