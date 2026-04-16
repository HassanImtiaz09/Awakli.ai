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
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { nanoid } from "nanoid";

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
}

export interface AssemblyResult {
  videoBuffer: Buffer;
  totalDuration: number;
  resolution: string;
  format: string;
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

// ─── Voice overlay ─────────────────────────────────────────────────────

async function overlayVoiceClips(
  videoPath: string,
  voiceClips: { path: string; startTime: number; duration: number }[],
  outputPath: string,
): Promise<void> {
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

// ─── Music mix ─────────────────────────────────────────────────────────

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
    `[1:a]volume=${musicVolume},aloop=loop=-1:size=2e+09,atrim=0:${videoDuration}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[out]`,
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

    // Step 4: Download voice clips and calculate timestamps
    let currentPath = concatPath;
    if (input.voiceClips.length > 0) {
      const voiceData: { path: string; startTime: number; duration: number }[] = [];

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

        voiceData.push({ path: voicePath, startTime, duration: actualDuration });
      }

      const voiceMixPath = path.join(tmpDir, "with-voice.mp4");
      console.log(`[Assembly] Overlaying ${voiceData.length} voice clips`);
      await overlayVoiceClips(currentPath, voiceData, voiceMixPath);
      currentPath = voiceMixPath;
    }

    // Step 5: Mix background music
    if (input.musicTrack && !input.musicTrack.isFallback && input.musicTrack.duration > 0) {
      const musicPath = path.join(tmpDir, "bgm.mp3");
      console.log("[Assembly] Downloading background music");
      await downloadFile(input.musicTrack.url, musicPath);

      const finalWithMusic = path.join(tmpDir, "with-music.mp4");
      console.log("[Assembly] Mixing background music");
      await mixBackgroundMusic(currentPath, musicPath, finalWithMusic);
      currentPath = finalWithMusic;
    }

    // Step 6: Read final video
    const finalBuffer = await fs.readFile(currentPath);
    const totalDuration = await getMediaDuration(currentPath);

    console.log(`[Assembly] Complete: ${finalBuffer.length} bytes, ${totalDuration.toFixed(1)}s`);

    return {
      videoBuffer: finalBuffer,
      totalDuration,
      resolution: "1920x1080",
      format: "mp4",
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
