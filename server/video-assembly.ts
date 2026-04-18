/**
 * Video Assembly Module — uses ffmpeg to concatenate video clips with
 * panel-to-panel transitions (xfade), overlay voice clips at correct
 * timestamps, and mix background music.
 *
 * Transition types:
 *   cut            → hard cut (concat demuxer, no filter)
 *   fade           → fade through black (xfade=fadeblack)
 *   dissolve       → pixel dissolve (xfade=dissolve)
 *   cross-dissolve → smooth cross-fade (xfade=fade)
 *
 * When every transition is "cut" the fast concat-demuxer path is used.
 * Otherwise a complex xfade filter graph is built so adjacent clips
 * overlap by `transitionDuration` seconds.
 *
 * ─── Pipeline Hardening (post-Seraphis Recognition) ─────────────────────
 *
 * Three production rules are enforced:
 *
 * 1. SAFE AUDIO MIXING: Never use bare `amix`. Voice overlay uses the
 *    sequential overlay approach (one clip at a time onto a silence base
 *    with `weights=1 1:normalize=0`). Music mixing uses explicit weights.
 *
 * 2. VOICE VALIDATION GATE: After building the voice track, every dialogue
 *    timecode is validated to be above -30 LUFS before proceeding to
 *    final mux. If any timecode fails, assembly halts with a clear error.
 *
 * 3. ROBUST LIP SYNC: Optional lip sync step pads audio to >=3s, uses
 *    floor(duration_ms)-50 for sound_end_time, and validates face-audio
 *    overlap >=2s before submitting to Kling.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";

// Pipeline modules (post-Seraphis Recognition hardening)
import {
  buildVoiceTrack,
  muxVideoWithAudio,
  type VoicePlacement,
} from "./pipeline/audioMixer";
import {
  validateVoicePresence,
  assertVoicePresence,
  type DialogueTimecode,
} from "./pipeline/voiceValidator";
import {
  processLipSyncBatch,
  type LipSyncPanelInput,
  type LipSyncBatchResult,
} from "./pipeline/lipSyncProcessor";

const execFileAsync = promisify(execFile);

// ─── Public types ──────────────────────────────────────────────────────

export type TransitionType = "cut" | "fade" | "dissolve" | "cross-dissolve";

export interface VideoClip {
  url: string;
  panelId: number;
  panelNumber: number | null;
  duration: number;
  hasNativeAudio: boolean;
}

export interface TransitionSpec {
  /** Transition type for the *outgoing* edge of this clip (between this clip and the next). */
  type: TransitionType;
  /** Duration in seconds (0.2–2.0). Ignored for "cut". */
  duration: number;
}

export interface VoiceClip {
  url: string;
  panelId: number;
  duration: number;
  text: string;
}

export interface MusicTrack {
  url: string;
  duration: number;
  isFallback: boolean;
}

export interface AssemblyInput {
  videoClips: VideoClip[];
  voiceClips: VoiceClip[];
  musicTrack: MusicTrack | null;
  episodeTitle: string;
  /** One entry per videoClip (same order). If omitted, all cuts. */
  transitions?: TransitionSpec[];
  /** Enable lip sync for dialogue panels (requires Kling API credentials) */
  enableLipSync?: boolean;
  /** S3 upload function for lip sync (required if enableLipSync is true) */
  uploadFn?: (localPath: string, s3Key: string, contentType: string) => Promise<string>;
  /** Voice validation threshold in LUFS (default: -30) */
  voiceValidationThresholdLufs?: number;
  /** Skip voice validation gate (not recommended, default: false) */
  skipVoiceValidation?: boolean;
}

export interface AssemblyResult {
  videoBuffer: Buffer;
  totalDuration: number;
  resolution: string;
  format: string;
  /** Lip sync results (if enableLipSync was true) */
  lipSyncResult?: LipSyncBatchResult;
  /** Voice validation results */
  voiceValidation?: {
    allPassed: boolean;
    totalChecked: number;
    passedCount: number;
    failedCount: number;
    summary: string;
  };
}

// ─── FFmpeg xfade mapping ──────────────────────────────────────────────

/** Map our transition names to ffmpeg xfade transition names */
export function mapTransitionToXfade(t: TransitionType): string | null {
  switch (t) {
    case "cut":             return null;        // no xfade
    case "fade":            return "fadeblack";  // fade through black
    case "dissolve":        return "dissolve";   // pixel dissolve
    case "cross-dissolve":  return "fade";       // smooth cross-fade
    default:                return null;
  }
}

/** Clamp transition duration to safe range */
export function clampDuration(d: number): number {
  return Math.max(0.2, Math.min(2.0, d));
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

export async function getMediaDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-show_entries", "format=duration",
      "-of", "csv=p=0",
      filePath,
    ]);
    return parseFloat(stdout.trim()) || 5;
  } catch {
    return 5;
  }
}

/**
 * Normalize a video clip to consistent format for concatenation / xfade:
 * - Scale to 1920×1080 (pad if needed)
 * - 24 fps, yuv420p
 * - Always include an audio track (silent if missing)
 */
async function normalizeClip(inputPath: string, outputPath: string): Promise<void> {
  let hasAudio = false;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      inputPath,
    ]);
    hasAudio = stdout.trim().length > 0;
  } catch {
    hasAudio = false;
  }

  if (hasAudio) {
    await execFileAsync("ffmpeg", [
      "-y", "-i", inputPath,
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-r", "24",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      outputPath,
    ], { timeout: 120000 });
  } else {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
      "-r", "24",
      "-c:v", "libx264", "-preset", "fast", "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest",
      "-map", "0:v:0", "-map", "1:a:0",
      outputPath,
    ], { timeout: 120000 });
  }
}

// ─── Concat demuxer (fast path — all cuts) ─────────────────────────────

async function concatenateClips(clipPaths: string[], outputPath: string): Promise<void> {
  const listFile = outputPath.replace(".mp4", "-list.txt");
  const listContent = clipPaths.map(p => `file '${p}'`).join("\n");
  await fs.writeFile(listFile, listContent);

  await execFileAsync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0",
    "-i", listFile,
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-pix_fmt", "yuv420p",
    outputPath,
  ], { timeout: 300000 });

  await fs.unlink(listFile).catch(() => {});
}

// ─── xfade filter graph builder ────────────────────────────────────────

/**
 * Build an ffmpeg command that chains xfade (video) and acrossfade (audio)
 * filters for every non-cut transition.
 *
 * The algorithm works iteratively:
 *   result_0 = clip[0]
 *   result_i = xfade(result_{i-1}, clip[i])   for i = 1..N-1
 *
 * For "cut" transitions between two clips, we use a zero-duration xfade=fade
 * which is effectively a hard cut but keeps the filter chain continuous.
 *
 * Returns { args, totalDuration } where args is the full ffmpeg argument list.
 */
export function buildXfadeFilterGraph(
  clipPaths: string[],
  clipDurations: number[],
  transitions: TransitionSpec[],
): { args: string[]; totalDuration: number; videoLabel: string; audioLabel: string } {
  const n = clipPaths.length;
  if (n < 2) throw new Error("Need at least 2 clips for xfade");

  // Build inputs
  const inputs: string[] = [];
  for (const p of clipPaths) {
    inputs.push("-i", p);
  }

  const videoFilters: string[] = [];
  const audioFilters: string[] = [];

  // Track cumulative offset: the point in the output timeline where
  // each clip's *start* falls, accounting for transition overlaps.
  let cumulativeOffset = 0;
  const clipOffsets: number[] = [0];

  for (let i = 1; i < n; i++) {
    const t = transitions[i - 1]; // transition between clip i-1 and clip i
    const xfadeName = mapTransitionToXfade(t.type);
    const dur = t.type === "cut" ? 0 : clampDuration(t.duration);

    // The xfade offset is relative to the *first input* of this xfade pair.
    // For the first pair, the first input is [0:v]; for subsequent pairs,
    // it's the output of the previous xfade.
    //
    // offset = duration of clip i-1 minus the transition overlap
    const prevClipDur = clipDurations[i - 1];
    const offset = cumulativeOffset + prevClipDur - dur;

    const prevVideoLabel = i === 1 ? "[0:v]" : `[vfade${i - 1}]`;
    const currVideoLabel = `[${i}:v]`;
    const outVideoLabel = i === n - 1 ? "[vout]" : `[vfade${i}]`;

    const prevAudioLabel = i === 1 ? "[0:a]" : `[afade${i - 1}]`;
    const currAudioLabel = `[${i}:a]`;
    const outAudioLabel = i === n - 1 ? "[aout]" : `[afade${i}]`;

    if (xfadeName && dur > 0) {
      // Video: xfade with the specified transition
      videoFilters.push(
        `${prevVideoLabel}${currVideoLabel}xfade=transition=${xfadeName}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)}${outVideoLabel}`
      );
      // Audio: crossfade to match
      audioFilters.push(
        `${prevAudioLabel}${currAudioLabel}acrossfade=d=${dur.toFixed(3)}:c1=tri:c2=tri${outAudioLabel}`
      );
    } else {
      // Cut: use concat filter for this pair to avoid issues with zero-duration xfade
      videoFilters.push(
        `${prevVideoLabel}${currVideoLabel}xfade=transition=fade:duration=0.05:offset=${(offset - 0.05).toFixed(3)}${outVideoLabel}`
      );
      audioFilters.push(
        `${prevAudioLabel}${currAudioLabel}acrossfade=d=0.05:c1=tri:c2=tri${outAudioLabel}`
      );
    }

    cumulativeOffset = offset;
    clipOffsets.push(cumulativeOffset);
  }

  // Calculate total duration
  const lastClipDur = clipDurations[n - 1];
  const totalDuration = cumulativeOffset + lastClipDur;

  const filterComplex = [...videoFilters, ...audioFilters].join(";");

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
  ];

  return { args, totalDuration, videoLabel: "[vout]", audioLabel: "[aout]" };
}

/**
 * Calculate the start time of each clip in the final output,
 * accounting for transition overlaps. Used for voice clip placement.
 */
export function calculateClipStartTimes(
  clipDurations: number[],
  transitions: TransitionSpec[],
): number[] {
  const startTimes: number[] = [0];
  let cumulative = 0;

  for (let i = 1; i < clipDurations.length; i++) {
    const t = transitions[i - 1];
    const dur = t.type === "cut" ? 0.05 : clampDuration(t.duration);
    cumulative += clipDurations[i - 1] - dur;
    startTimes.push(cumulative);
  }

  return startTimes;
}

/**
 * Calculate total output duration accounting for transition overlaps.
 */
export function calculateTotalDuration(
  clipDurations: number[],
  transitions: TransitionSpec[],
): number {
  if (clipDurations.length === 0) return 0;
  if (clipDurations.length === 1) return clipDurations[0];

  const startTimes = calculateClipStartTimes(clipDurations, transitions);
  const lastIdx = clipDurations.length - 1;
  return startTimes[lastIdx] + clipDurations[lastIdx];
}

// ─── xfade assembly ────────────────────────────────────────────────────

async function assembleWithTransitions(
  clipPaths: string[],
  clipDurations: number[],
  transitions: TransitionSpec[],
  outputPath: string,
): Promise<void> {
  const { args } = buildXfadeFilterGraph(clipPaths, clipDurations, transitions);
  args.push(outputPath);

  await execFileAsync("ffmpeg", args, { timeout: 600000, maxBuffer: 50 * 1024 * 1024 });
}

// ─── Voice overlay (SAFE: sequential overlay approach) ────────────────
//
// RULE: Never use bare `amix` for sparse voice placement.
// The old implementation used `amix=inputs=N+1` which divides each
// input's amplitude by (N+1). For 6 inputs, each voice was at 1/6 volume.
//
// The new implementation uses the pipeline/audioMixer module which:
//   1. Creates a silence base track
//   2. Overlays each voice clip one at a time using
//      `amix=inputs=2:weights=1 1:normalize=0`
//   3. Normalizes each voice to -14 LUFS before overlay
//
// This preserves the full amplitude of every voice clip.

async function overlayVoiceClipsSafe(
  videoPath: string,
  voiceClips: { path: string; startTime: number; duration: number; label?: string }[],
  outputPath: string,
  workDir: string,
): Promise<void> {
  if (voiceClips.length === 0) {
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  // Get video duration for the voice track length
  const videoDuration = await getMediaDuration(videoPath);

  // Convert to VoicePlacement format for the safe mixer
  const placements: VoicePlacement[] = voiceClips.map((vc, i) => ({
    filePath: vc.path,
    startTimeSeconds: vc.startTime,
    durationSeconds: vc.duration,
    targetLufs: -14, // Normalize all voices to -14 LUFS
    label: vc.label || `voice_${i}`,
  }));

  // Build voice track using sequential overlay (safe approach)
  const voiceWorkDir = path.join(workDir, "voice-mix");
  const voiceTrackPath = await buildVoiceTrack(placements, videoDuration, voiceWorkDir);

  // Mux voice track onto video
  await muxVideoWithAudio(videoPath, voiceTrackPath, outputPath);
}

/**
 * @deprecated Use overlayVoiceClipsSafe instead. This function uses bare `amix`
 * which divides amplitude by the number of inputs, causing inaudible dialogue.
 * Kept only for reference — DO NOT USE in production.
 */
async function overlayVoiceClips_UNSAFE(
  videoPath: string,
  voiceClips: { path: string; startTime: number; duration: number }[],
  outputPath: string,
): Promise<void> {
  console.warn(
    "[Assembly] WARNING: overlayVoiceClips_UNSAFE called — this uses bare amix " +
    "which divides amplitude by N inputs. Use overlayVoiceClipsSafe instead."
  );
  if (voiceClips.length === 0) {
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  const inputs = ["-i", videoPath];
  const filterParts: string[] = [];

  for (let i = 0; i < voiceClips.length; i++) {
    inputs.push("-i", voiceClips[i].path);
    filterParts.push(
      `[${i + 1}:a]adelay=${Math.round(voiceClips[i].startTime * 1000)}|${Math.round(voiceClips[i].startTime * 1000)}[voice${i}]`
    );
  }

  const voiceLabels = voiceClips.map((_, i) => `[voice${i}]`).join("");
  filterParts.push(
    `[0:a]${voiceLabels}amix=inputs=${voiceClips.length + 1}:duration=longest:dropout_transition=2[mixed]`
  );

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex", filterParts.join(";"),
    "-map", "0:v",
    "-map", "[mixed]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    outputPath,
  ], { timeout: 300000 });
}

// ─── Music mix (SAFE: explicit weights, no normalization) ─────────────
//
// RULE: Always use `weights=1 1:normalize=0` with amix.
// The old implementation used bare `amix=inputs=2:duration=first` which
// halves both the voice and music amplitude.

async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  musicVolume: number = 0.15,
): Promise<void> {
  const videoDuration = await getMediaDuration(videoPath);

  await execFileAsync("ffmpeg", [
    "-y",
    "-i", videoPath,
    "-i", musicPath,
    "-filter_complex",
    // SAFE: weights=1 1:normalize=0 prevents amplitude division
    `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e+09,atrim=0:${videoDuration}[bgm];` +
    `[0:a][bgm]amix=inputs=2:duration=first:weights=1 1:normalize=0:dropout_transition=3[out]`,
    "-map", "0:v",
    "-map", "[out]",
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outputPath,
  ], { timeout: 300000 });
}

// ─── Main assembly ─────────────────────────────────────────────────────

export async function assembleVideo(input: AssemblyInput): Promise<AssemblyResult> {
  const tmpDir = path.join(os.tmpdir(), `awakli-assembly-${nanoid(8)}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    console.log(
      `[Assembly] Starting in ${tmpDir} with ${input.videoClips.length} clips, ` +
      `${input.voiceClips.length} voice clips, transitions: ${input.transitions ? "yes" : "all-cut"}`
    );

    // Sort video clips by panel number
    const sortedClips = [...input.videoClips].sort(
      (a, b) => (a.panelNumber || 0) - (b.panelNumber || 0)
    );

    // Build matching transitions array (sorted same as clips)
    const defaultTransitions: TransitionSpec[] = sortedClips.map(() => ({
      type: "cut" as TransitionType,
      duration: 0.5,
    }));

    let transitions = defaultTransitions;
    if (input.transitions && input.transitions.length > 0) {
      // Match transitions to sorted clips by panelId order
      const panelIdOrder = input.videoClips.map(c => c.panelId);
      const sortedPanelIds = sortedClips.map(c => c.panelId);
      transitions = sortedPanelIds.map(pid => {
        const origIdx = panelIdOrder.indexOf(pid);
        return origIdx >= 0 && input.transitions![origIdx]
          ? input.transitions![origIdx]
          : { type: "cut" as TransitionType, duration: 0.5 };
      });
    }

    // Step 1: Download all video clips
    const downloadedClips: string[] = [];
    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
      console.log(`[Assembly] Downloading clip ${i + 1}/${sortedClips.length}: panel ${clip.panelId}`);
      await downloadFile(clip.url, clipPath);
      downloadedClips.push(clipPath);
    }

    // Step 2: Normalize all clips
    const normalizedClips: string[] = [];
    const actualDurations: number[] = [];
    for (let i = 0; i < downloadedClips.length; i++) {
      const normPath = path.join(tmpDir, `norm-${i}.mp4`);
      console.log(`[Assembly] Normalizing clip ${i + 1}/${downloadedClips.length}`);
      await normalizeClip(downloadedClips[i], normPath);
      normalizedClips.push(normPath);
      const dur = await getMediaDuration(normPath);
      actualDurations.push(dur);
    }

    // Step 3: Concatenate / assemble with transitions
    const concatPath = path.join(tmpDir, "concat.mp4");

    // Check if any non-cut transitions exist
    const hasRealTransitions = transitions.some(
      (t, i) => i < transitions.length - 1 && t.type !== "cut"
    );

    if (normalizedClips.length === 1) {
      // Single clip — just copy
      await fs.copyFile(normalizedClips[0], concatPath);
      console.log("[Assembly] Single clip — no transitions needed");
    } else if (!hasRealTransitions) {
      // All cuts — use fast concat demuxer
      console.log(`[Assembly] All cuts — using fast concat for ${normalizedClips.length} clips`);
      await concatenateClips(normalizedClips, concatPath);
    } else {
      // Build xfade filter graph
      // Transitions array: entry i is the transition *after* clip i (between clip i and clip i+1)
      // So we only use transitions[0..n-2]
      const edgeTransitions = transitions.slice(0, transitions.length - 1);

      // Validate: transition duration must be less than both adjacent clip durations
      for (let i = 0; i < edgeTransitions.length; i++) {
        const t = edgeTransitions[i];
        if (t.type !== "cut") {
          const maxDur = Math.min(actualDurations[i], actualDurations[i + 1]) - 0.1;
          if (clampDuration(t.duration) > maxDur) {
            edgeTransitions[i] = { ...t, duration: Math.max(0.2, maxDur) };
          }
        }
      }

      const transitionSummary = edgeTransitions
        .filter(t => t.type !== "cut")
        .map(t => `${t.type}(${t.duration.toFixed(1)}s)`)
        .join(", ");
      console.log(
        `[Assembly] Building xfade graph: ${normalizedClips.length} clips, ` +
        `transitions: ${transitionSummary || "none"}`
      );

      await assembleWithTransitions(normalizedClips, actualDurations, edgeTransitions, concatPath);
    }

    // Step 4: Optional lip sync for dialogue panels
    let lipSyncResult: LipSyncBatchResult | undefined;
    const lipSyncedClipPaths = new Map<number, string>(); // panelId → lip-synced clip path

    if (input.enableLipSync && input.voiceClips.length > 0 && input.uploadFn) {
      console.log(`[Assembly] Running lip sync for ${input.voiceClips.length} dialogue panels`);

      const lipSyncWorkDir = path.join(tmpDir, "lipsync");
      const lipSyncInputs: LipSyncPanelInput[] = [];

      // Download voice clips for lip sync
      for (let i = 0; i < input.voiceClips.length; i++) {
        const vc = input.voiceClips[i];
        const voicePath = path.join(tmpDir, `voice-lipsync-${i}.mp3`);
        await downloadFile(vc.url, voicePath);

        // Find the corresponding normalized video clip
        const clipIdx = sortedClips.findIndex(c => c.panelId === vc.panelId);
        if (clipIdx >= 0) {
          lipSyncInputs.push({
            panelId: vc.panelId,
            character: vc.text.split(":")[0]?.trim() || "Unknown",
            dialogueText: vc.text,
            videoClipPath: normalizedClips[clipIdx],
            voiceAudioPath: voicePath,
          });
        }
      }

      if (lipSyncInputs.length > 0) {
        lipSyncResult = await processLipSyncBatch(
          lipSyncInputs,
          lipSyncWorkDir,
          input.uploadFn,
        );

        // Replace normalized clips with lip-synced versions where successful
        for (const panel of lipSyncResult.panels) {
          if (panel.success && panel.outputPath) {
            const clipIdx = sortedClips.findIndex(c => c.panelId === panel.panelId);
            if (clipIdx >= 0) {
              // Re-normalize the lip-synced clip to match format
              const reNormPath = path.join(tmpDir, `lipsync-norm-${clipIdx}.mp4`);
              await normalizeClip(panel.outputPath, reNormPath);
              normalizedClips[clipIdx] = reNormPath;
              actualDurations[clipIdx] = await getMediaDuration(reNormPath);
              lipSyncedClipPaths.set(panel.panelId as number, reNormPath);
              console.log(`[Assembly] Replaced clip ${clipIdx} with lip-synced version for panel ${panel.panelId}`);
            }
          }
        }

        // If lip sync replaced clips, re-concatenate
        if (lipSyncedClipPaths.size > 0) {
          console.log(`[Assembly] Re-concatenating with ${lipSyncedClipPaths.size} lip-synced clips`);
          if (normalizedClips.length === 1) {
            await fs.copyFile(normalizedClips[0], concatPath);
          } else if (!hasRealTransitions) {
            await concatenateClips(normalizedClips, concatPath);
          } else {
            const edgeTrans = transitions.slice(0, transitions.length - 1);
            await assembleWithTransitions(normalizedClips, actualDurations, edgeTrans, concatPath);
          }
        }
      }
    }

    // Step 5: Download voice clips and build voice track (SAFE sequential overlay)
    let currentPath = concatPath;
    let voiceValidationResult: AssemblyResult["voiceValidation"] | undefined;

    if (input.voiceClips.length > 0) {
      const voiceData: { path: string; startTime: number; duration: number; label?: string }[] = [];

      // Calculate start times accounting for transition overlaps
      const edgeTransitions = transitions.slice(0, transitions.length - 1);
      const panelStartTimes = calculateClipStartTimes(actualDurations, edgeTransitions);

      // Map panelId → start time
      const panelStartMap: Record<number, number> = {};
      for (let i = 0; i < sortedClips.length; i++) {
        panelStartMap[sortedClips[i].panelId] = panelStartTimes[i];
      }

      for (let i = 0; i < input.voiceClips.length; i++) {
        const vc = input.voiceClips[i];
        const voicePath = path.join(tmpDir, `voice-${i}.mp3`);
        console.log(`[Assembly] Downloading voice clip ${i + 1}/${input.voiceClips.length}: panel ${vc.panelId}`);
        await downloadFile(vc.url, voicePath);

        const startTime = panelStartMap[vc.panelId] ?? 0;
        const actualDuration = await getMediaDuration(voicePath);

        voiceData.push({
          path: voicePath,
          startTime,
          duration: actualDuration,
          label: `P${String(vc.panelId).padStart(2, "0")} ${vc.text.substring(0, 30)}`,
        });
      }

      // Use SAFE sequential overlay (not bare amix)
      const voiceMixPath = path.join(tmpDir, "with-voice.mp4");
      console.log(`[Assembly] Overlaying ${voiceData.length} voice clips (safe sequential overlay)`);
      await overlayVoiceClipsSafe(currentPath, voiceData, voiceMixPath, tmpDir);
      currentPath = voiceMixPath;

      // VOICE VALIDATION GATE: Check every dialogue timecode
      if (!input.skipVoiceValidation) {
        const threshold = input.voiceValidationThresholdLufs ?? -30;
        const dialogueTimecodes: DialogueTimecode[] = voiceData.map((vd, i) => ({
          panelId: input.voiceClips[i].panelId,
          character: input.voiceClips[i].text.split(":")[0]?.trim(),
          text: input.voiceClips[i].text,
          startTimeSeconds: vd.startTime,
          measureDurationSeconds: Math.max(vd.duration, 2.0),
        }));

        console.log(`[Assembly] Running voice validation gate (threshold: ${threshold} LUFS)`);
        const validation = await validateVoicePresence(currentPath, dialogueTimecodes, threshold);

        voiceValidationResult = {
          allPassed: validation.allPassed,
          totalChecked: validation.totalChecked,
          passedCount: validation.passedCount,
          failedCount: validation.failedCount,
          summary: validation.summary,
        };

        if (!validation.allPassed) {
          console.error(`[Assembly] VOICE VALIDATION FAILED: ${validation.summary}`);
          // Use assertVoicePresence to throw a detailed error
          await assertVoicePresence(currentPath, dialogueTimecodes, threshold);
        } else {
          console.log(`[Assembly] Voice validation PASSED: ${validation.summary}`);
        }
      }
    }

    // Step 6: Mix background music
    if (input.musicTrack && !input.musicTrack.isFallback && input.musicTrack.duration > 0) {
      const musicPath = path.join(tmpDir, "bgm.mp3");
      console.log("[Assembly] Downloading background music");
      await downloadFile(input.musicTrack.url, musicPath);

      const finalWithMusic = path.join(tmpDir, "with-music.mp4");
      console.log("[Assembly] Mixing background music");
      await mixBackgroundMusic(currentPath, musicPath, finalWithMusic);
      currentPath = finalWithMusic;
    }

    // Step 7: Read final video
    const finalBuffer = await fs.readFile(currentPath);
    const totalDuration = await getMediaDuration(currentPath);

    console.log(`[Assembly] Complete: ${finalBuffer.length} bytes, ${totalDuration.toFixed(1)}s`);

    return {
      videoBuffer: finalBuffer,
      totalDuration,
      resolution: "1920x1080",
      format: "mp4",
      lipSyncResult,
      voiceValidation: voiceValidationResult,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
