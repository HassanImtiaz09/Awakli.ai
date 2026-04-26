/**
 * A1: Transition Layer — FFmpeg-based transitions between clips
 *
 * Four transition types:
 *   1. crossfade     — Smooth blend between two clips (default, 0.5s)
 *   2. dip_to_black  — Fade out → black → fade in (dramatic scene changes)
 *   3. soft_fade     — Gentle opacity fade (emotional/nostalgic moments)
 *   4. audio_cross   — Audio crossfade only, hard video cut (dialogue continuity)
 *
 * An LLM call classifies each slice boundary into one of the four types
 * based on the adjacent slice types and narrative context.
 *
 * IMPORTANT: Silent video clips (e.g. from Vidu Q3) may lack an audio track.
 * All transition functions normalise inputs by adding a silent audio track
 * when one is missing, so acrossfade/xfade filters always have valid [N:a] refs.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

export type TransitionType = "crossfade" | "dip_to_black" | "soft_fade" | "audio_cross";

export interface TransitionSpec {
  fromSliceId: number;
  toSliceId: number;
  type: TransitionType;
  durationMs: number;
  reason: string;
}

// ─── Audio Normalisation Helper ──────────────────────────────────────────

/**
 * Check whether a file contains an audio stream.
 */
async function hasAudioStream(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath}"`
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Ensure a clip has an audio track. If it's video-only, mux in a silent
 * stereo AAC track matching the video duration. Returns the path to a
 * clip that is guaranteed to have both video and audio.
 */
async function ensureAudio(clipPath: string, workDir: string): Promise<string> {
  if (await hasAudioStream(clipPath)) return clipPath;

  const base = path.basename(clipPath, ".mp4");
  const outPath = path.join(workDir, `${base}_audio.mp4`);

  // Already normalised in a previous call
  if (fs.existsSync(outPath)) return outPath;

  await execAsync(
    `ffmpeg -hide_banner -y ` +
    `-i "${clipPath}" ` +
    `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 ` +
    `-c:v copy -c:a aac -b:a 192k -shortest ` +
    `"${outPath}"`,
    { maxBuffer: 50 * 1024 * 1024 }
  );

  return outPath;
}

// ─── Rule-Based Transition Classification ─────────────────────────────────

/**
 * Classify the transition type between two adjacent slices using rules.
 * This is the fast path — no LLM call needed for most boundaries.
 *
 * Rules:
 *   - establishing → dialogue: crossfade (scene introduction)
 *   - dialogue → dialogue (same character): audio_cross (continuity)
 *   - dialogue → dialogue (different character): crossfade
 *   - action → anything: dip_to_black (dramatic)
 *   - anything → action: dip_to_black (dramatic)
 *   - dialogue → establishing: soft_fade (reflective pause)
 *   - establishing → establishing: soft_fade (montage)
 */
export function classifyTransition(
  fromSlice: { type: string; dialogue?: { character: string } | null },
  toSlice: { type: string; dialogue?: { character: string } | null }
): { type: TransitionType; durationMs: number; reason: string } {
  const from = fromSlice.type;
  const to = toSlice.type;

  // Action boundaries are always dramatic
  if (from.includes("action") || to.includes("action")) {
    return { type: "dip_to_black", durationMs: 800, reason: "Action boundary — dramatic cut" };
  }

  // Same character dialogue continuity
  if (from === "dialogue_closeup" && to === "dialogue_closeup") {
    const sameChar = fromSlice.dialogue?.character === toSlice.dialogue?.character;
    if (sameChar) {
      return { type: "audio_cross", durationMs: 300, reason: "Same character dialogue — audio continuity" };
    }
    return { type: "crossfade", durationMs: 500, reason: "Character switch — smooth blend" };
  }

  // Establishing → dialogue
  if (from.includes("establishing") && to === "dialogue_closeup") {
    return { type: "crossfade", durationMs: 600, reason: "Scene introduction — establishing to dialogue" };
  }

  // Dialogue → establishing (reflective)
  if (from === "dialogue_closeup" && to.includes("establishing")) {
    return { type: "soft_fade", durationMs: 700, reason: "Reflective pause — dialogue to establishing" };
  }

  // Establishing → establishing (montage)
  if (from.includes("establishing") && to.includes("establishing")) {
    return { type: "soft_fade", durationMs: 500, reason: "Montage sequence — establishing to establishing" };
  }

  // Default
  return { type: "crossfade", durationMs: 500, reason: "Default transition" };
}

/**
 * Generate transition specs for an entire script.
 */
export function generateTransitionPlan(
  slices: Array<{ sliceId: number; type: string; dialogue?: { character: string; text: string; emotion: string } | null }>
): TransitionSpec[] {
  const specs: TransitionSpec[] = [];

  for (let i = 0; i < slices.length - 1; i++) {
    const from = slices[i];
    const to = slices[i + 1];
    const { type, durationMs, reason } = classifyTransition(from, to);

    specs.push({
      fromSliceId: from.sliceId,
      toSliceId: to.sliceId,
      type,
      durationMs,
      reason,
    });
  }

  return specs;
}

// ─── FFmpeg Transition Implementations ────────────────────────────────────

/**
 * Get the duration of a media file in seconds.
 */
async function getClipDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout.trim());
}

/**
 * Apply a crossfade transition between two video clips.
 * Uses FFmpeg's xfade + acrossfade filters.
 */
export async function applyCrossfade(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  durationSec: number = 0.5,
  workDir?: string
): Promise<string> {
  const wd = workDir ?? path.dirname(outputPath);
  const c1 = await ensureAudio(clip1Path, wd);
  const c2 = await ensureAudio(clip2Path, wd);

  const clip1Duration = await getClipDuration(c1);
  const offset = Math.max(0, clip1Duration - durationSec);

  const filterComplex =
    `[0:v][1:v]xfade=transition=fade:duration=${durationSec}:offset=${offset}[v];` +
    `[0:a][1:a]acrossfade=d=${durationSec}[a]`;

  const cmd =
    `ffmpeg -hide_banner -y ` +
    `-i "${c1}" ` +
    `-i "${c2}" ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "[v]" -map "[a]" ` +
    `-c:v libx264 -preset fast -crf 18 ` +
    `-c:a aac -b:a 192k ` +
    `"${outputPath}"`;

  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  return outputPath;
}

/**
 * Apply a dip-to-black transition (fade out → black → fade in).
 */
export async function applyDipToBlack(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  durationSec: number = 0.8,
  workDir?: string
): Promise<string> {
  const wd = workDir ?? path.dirname(outputPath);
  const c1 = await ensureAudio(clip1Path, wd);
  const c2 = await ensureAudio(clip2Path, wd);

  const clip1Duration = await getClipDuration(c1);
  const offset = Math.max(0, clip1Duration - durationSec);

  const filterComplex =
    `[0:v][1:v]xfade=transition=fadeblack:duration=${durationSec}:offset=${offset}[v];` +
    `[0:a][1:a]acrossfade=d=${durationSec}[a]`;

  const cmd =
    `ffmpeg -hide_banner -y ` +
    `-i "${c1}" ` +
    `-i "${c2}" ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "[v]" -map "[a]" ` +
    `-c:v libx264 -preset fast -crf 18 ` +
    `-c:a aac -b:a 192k ` +
    `"${outputPath}"`;

  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  return outputPath;
}

/**
 * Apply a soft fade transition (gentle opacity blend).
 */
export async function applySoftFade(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  durationSec: number = 0.7,
  workDir?: string
): Promise<string> {
  const wd = workDir ?? path.dirname(outputPath);
  const c1 = await ensureAudio(clip1Path, wd);
  const c2 = await ensureAudio(clip2Path, wd);

  const clip1Duration = await getClipDuration(c1);
  const offset = Math.max(0, clip1Duration - durationSec);

  const filterComplex =
    `[0:v][1:v]xfade=transition=smoothleft:duration=${durationSec}:offset=${offset}[v];` +
    `[0:a][1:a]acrossfade=d=${durationSec}[a]`;

  const cmd =
    `ffmpeg -hide_banner -y ` +
    `-i "${c1}" ` +
    `-i "${c2}" ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "[v]" -map "[a]" ` +
    `-c:v libx264 -preset fast -crf 18 ` +
    `-c:a aac -b:a 192k ` +
    `"${outputPath}"`;

  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  return outputPath;
}

/**
 * Apply an audio-only crossfade with hard video cut.
 */
export async function applyAudioCross(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  durationSec: number = 0.3,
  workDir?: string
): Promise<string> {
  const wd = workDir ?? path.dirname(outputPath);
  const c1 = await ensureAudio(clip1Path, wd);
  const c2 = await ensureAudio(clip2Path, wd);

  // Hard video cut at the boundary, audio crossfade
  const filterComplex =
    `[0:v][1:v]concat=n=2:v=1:a=0[v];` +
    `[0:a][1:a]acrossfade=d=${durationSec}[a]`;

  const cmd =
    `ffmpeg -hide_banner -y ` +
    `-i "${c1}" ` +
    `-i "${c2}" ` +
    `-filter_complex "${filterComplex}" ` +
    `-map "[v]" -map "[a]" ` +
    `-c:v libx264 -preset fast -crf 18 ` +
    `-c:a aac -b:a 192k ` +
    `"${outputPath}"`;

  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
  return outputPath;
}

/**
 * Apply a transition between two clips based on the transition spec.
 */
export async function applyTransition(
  clip1Path: string,
  clip2Path: string,
  outputPath: string,
  spec: TransitionSpec,
  workDir?: string
): Promise<string> {
  const durationSec = spec.durationMs / 1000;

  switch (spec.type) {
    case "crossfade":
      return applyCrossfade(clip1Path, clip2Path, outputPath, durationSec, workDir);
    case "dip_to_black":
      return applyDipToBlack(clip1Path, clip2Path, outputPath, durationSec, workDir);
    case "soft_fade":
      return applySoftFade(clip1Path, clip2Path, outputPath, durationSec, workDir);
    case "audio_cross":
      return applyAudioCross(clip1Path, clip2Path, outputPath, durationSec, workDir);
    default:
      return applyCrossfade(clip1Path, clip2Path, outputPath, durationSec, workDir);
  }
}

/**
 * Concatenate all clips in order with transitions applied.
 * Downloads clips from URLs, applies transitions sequentially, returns final output path.
 */
export async function assembleWithTransitions(
  clips: Array<{ sliceId: number; url: string }>,
  transitions: TransitionSpec[],
  workDir: string,
  outputFilename: string = "assembled.mp4"
): Promise<string> {
  if (clips.length === 0) throw new Error("No clips to assemble");
  if (clips.length === 1) {
    // Single clip — just download it
    const outPath = path.join(workDir, outputFilename);
    const resp = await fetch(clips[0].url);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    fs.writeFileSync(outPath, Buffer.from(await resp.arrayBuffer()));
    return outPath;
  }

  // Download all clips
  console.log(`  [A1] Downloading ${clips.length} clips...`);
  const localPaths: string[] = [];
  for (const clip of clips) {
    const localPath = path.join(workDir, `clip_${clip.sliceId}.mp4`);
    const resp = await fetch(clip.url);
    if (!resp.ok) throw new Error(`Download clip ${clip.sliceId} failed: ${resp.status}`);
    fs.writeFileSync(localPath, Buffer.from(await resp.arrayBuffer()));
    localPaths.push(localPath);
  }

  // Apply transitions sequentially
  console.log(`  [A1] Applying ${transitions.length} transitions...`);
  let currentPath = localPaths[0];

  for (let i = 0; i < transitions.length && i < localPaths.length - 1; i++) {
    const nextPath = localPaths[i + 1];
    const outPath = path.join(workDir, `trans_${i}.mp4`);
    const spec = transitions[i];

    console.log(`  [A1] Transition ${i + 1}/${transitions.length}: ${spec.type} (${spec.durationMs}ms) — ${spec.reason}`);
    try {
      currentPath = await applyTransition(currentPath, nextPath, outPath, spec, workDir);
    } catch (err: any) {
      console.warn(`  [A1] Transition ${i + 1} failed: ${err.message?.slice(0, 120)} — falling back to concat`);
      // Fallback: simple concatenation
      const concatList = path.join(workDir, `concat_${i}.txt`);
      fs.writeFileSync(concatList, `file '${currentPath}'\nfile '${nextPath}'\n`);
      await execAsync(`ffmpeg -hide_banner -y -f concat -safe 0 -i "${concatList}" -c copy "${outPath}"`);
      currentPath = outPath;
    }
  }

  // Rename final output
  const finalPath = path.join(workDir, outputFilename);
  if (currentPath !== finalPath) {
    fs.copyFileSync(currentPath, finalPath);
  }

  console.log(`  [A1] Assembly complete: ${finalPath}`);
  return finalPath;
}
