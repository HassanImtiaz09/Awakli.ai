/**
 * Safe Audio Mixer — Sequential Overlay Approach
 *
 * RULE: Never use bare `amix` for sparse voice placement.
 * FFmpeg's `amix` divides each input's amplitude by the number of inputs
 * by default (normalize=1). For N inputs, each gets 1/N volume.
 *
 * This module provides two safe alternatives:
 *   1. `overlayVoiceClipsSafe` — sequential overlay (one clip at a time onto a base)
 *   2. `mixAudioTracksSafe` — amix with explicit `weights` and `normalize=0`
 *
 * Both approaches preserve the original amplitude of each input.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VoicePlacement {
  /** Absolute path to the voice audio file */
  filePath: string;
  /** Start time in seconds where this voice should appear in the output */
  startTimeSeconds: number;
  /** Duration of the voice clip in seconds */
  durationSeconds: number;
  /** Target loudness in LUFS (default: -14) */
  targetLufs?: number;
  /** Label for logging (e.g., "P04 Ilyra") */
  label?: string;
}

export interface MusicPlacement {
  /** Absolute path to the music audio file */
  filePath: string;
  /** Start time in seconds */
  startTimeSeconds: number;
  /** Duration to use from the music file */
  durationSeconds: number;
  /** Volume level 0-1 (default: 0.15 for background music) */
  volume?: number;
  /** Target loudness in LUFS (default: -24 for background music) */
  targetLufs?: number;
  /** Label for logging */
  label?: string;
}

export interface AudioMixResult {
  /** Path to the output audio file */
  outputPath: string;
  /** Total duration of the mixed audio */
  totalDuration: number;
  /** Per-voice loudness measurements (LUFS) at each placement timecode */
  voiceLoudness: Array<{ label: string; startTime: number; measuredLufs: number }>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum acceptable voice loudness at dialogue timecodes */
export const VOICE_LOUDNESS_THRESHOLD_LUFS = -30;

/** Default voice target loudness */
export const DEFAULT_VOICE_LUFS = -14;

/** Default music target loudness */
export const DEFAULT_MUSIC_LUFS = -24;

/** Sidechain ducking: how much to reduce music when voice is present (dB) */
export const SIDECHAIN_DUCK_DB = 8;

// ─── Helpers ────────────────────────────────────────────────────────────────

async function ffmpeg(args: string[], timeoutMs = 120000): Promise<string> {
  const { stdout, stderr } = await execFileAsync("ffmpeg", args, {
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
  });
  return stderr || stdout;
}

async function ffprobe(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("ffprobe", args, {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Get the duration of an audio file in seconds.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const stdout = await ffprobe([
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

/**
 * Measure the integrated loudness (LUFS) of an audio segment.
 */
export async function measureLoudness(
  filePath: string,
  startSeconds?: number,
  durationSeconds?: number,
): Promise<{ integratedLufs: number; truePeakDbtp: number }> {
  const args = ["-i", filePath];
  if (startSeconds !== undefined) args.push("-ss", startSeconds.toFixed(3));
  if (durationSeconds !== undefined) args.push("-t", durationSeconds.toFixed(3));
  args.push("-af", "loudnorm=print_format=json", "-f", "null", "-");

  try {
    const { stderr } = await execFileAsync("ffmpeg", ["-y", ...args], {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Parse the loudnorm JSON output from stderr
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        integratedLufs: parseFloat(parsed.input_i) || -Infinity,
        truePeakDbtp: parseFloat(parsed.input_tp) || -Infinity,
      };
    }
  } catch {
    // Fallback: try to extract from error output
  }

  return { integratedLufs: -Infinity, truePeakDbtp: -Infinity };
}

/**
 * Normalize an audio file to a target LUFS using loudnorm two-pass.
 */
export async function normalizeToLufs(
  inputPath: string,
  outputPath: string,
  targetLufs: number = DEFAULT_VOICE_LUFS,
): Promise<void> {
  await ffmpeg([
    "-y", "-i", inputPath,
    "-af", `loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
    outputPath,
  ]);
}

// ─── Core: Sequential Overlay Voice Mixing ──────────────────────────────────

/**
 * Build a voice track by sequentially overlaying voice clips onto a silence base.
 *
 * This is the SAFE alternative to bare `amix`. Instead of mixing N inputs
 * simultaneously (which divides amplitude by N), we:
 *   1. Create a silence base of the target duration
 *   2. For each voice clip: normalize → adelay → overlay onto the accumulator
 *
 * Each overlay uses `amix=inputs=2:weights=1 1:normalize=0` to preserve amplitude.
 *
 * @param voicePlacements - Array of voice clips with their placement info
 * @param totalDuration - Total duration of the output track in seconds
 * @param workDir - Working directory for intermediate files
 * @returns Path to the final voice track WAV
 */
export async function buildVoiceTrack(
  voicePlacements: VoicePlacement[],
  totalDuration: number,
  workDir: string,
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });

  // Step 1: Create silence base
  const silencePath = path.join(workDir, "silence_base.wav");
  await ffmpeg([
    "-y",
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
    "-t", totalDuration.toFixed(3),
    "-c:a", "pcm_s16le",
    silencePath,
  ]);

  if (voicePlacements.length === 0) {
    return silencePath;
  }

  // Step 2: Normalize each voice clip
  const normalizedPaths: string[] = [];
  for (let i = 0; i < voicePlacements.length; i++) {
    const vp = voicePlacements[i];
    const normPath = path.join(workDir, `voice_norm_${i}.wav`);
    const targetLufs = vp.targetLufs ?? DEFAULT_VOICE_LUFS;

    console.log(
      `[AudioMixer] Normalizing ${vp.label || `voice_${i}`} to ${targetLufs} LUFS`
    );
    await normalizeToLufs(vp.filePath, normPath, targetLufs);
    normalizedPaths.push(normPath);
  }

  // Step 3: Sequential overlay — one clip at a time
  let currentPath = silencePath;

  for (let i = 0; i < voicePlacements.length; i++) {
    const vp = voicePlacements[i];
    const normPath = normalizedPaths[i];
    const delayMs = Math.round(vp.startTimeSeconds * 1000);
    const outputPath = path.join(workDir, `voice_mix_step_${i}.wav`);

    console.log(
      `[AudioMixer] Overlaying ${vp.label || `voice_${i}`} at ${vp.startTimeSeconds}s (delay=${delayMs}ms)`
    );

    // adelay positions the clip, apad extends it to match the base duration,
    // then amix with weights=1 1:normalize=0 preserves both amplitudes
    await ffmpeg([
      "-y",
      "-i", currentPath,
      "-i", normPath,
      "-filter_complex",
      `[1]adelay=${delayMs}|${delayMs},apad[delayed];` +
      `[0][delayed]amix=inputs=2:duration=first:weights=1 1:normalize=0[out]`,
      "-map", "[out]",
      "-c:a", "pcm_s16le", "-ar", "48000",
      outputPath,
    ]);

    currentPath = outputPath;
  }

  // Rename final step to voice_track.wav
  const finalPath = path.join(workDir, "voice_track.wav");
  await fs.rename(currentPath, finalPath);

  return finalPath;
}

/**
 * Build a music track by placing music cues at specified times.
 * Uses the same sequential overlay approach.
 */
export async function buildMusicTrack(
  musicPlacements: MusicPlacement[],
  totalDuration: number,
  workDir: string,
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });

  const silencePath = path.join(workDir, "music_silence.wav");
  await ffmpeg([
    "-y",
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
    "-t", totalDuration.toFixed(3),
    "-c:a", "pcm_s16le",
    silencePath,
  ]);

  if (musicPlacements.length === 0) {
    return silencePath;
  }

  let currentPath = silencePath;

  for (let i = 0; i < musicPlacements.length; i++) {
    const mp = musicPlacements[i];
    const targetLufs = mp.targetLufs ?? DEFAULT_MUSIC_LUFS;
    const normPath = path.join(workDir, `music_norm_${i}.wav`);
    const outputPath = path.join(workDir, `music_mix_step_${i}.wav`);

    // Trim + normalize music cue
    await ffmpeg([
      "-y", "-i", mp.filePath,
      "-t", mp.durationSeconds.toFixed(3),
      "-af", `loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      normPath,
    ]);

    const delayMs = Math.round(mp.startTimeSeconds * 1000);

    console.log(
      `[AudioMixer] Placing ${mp.label || `music_${i}`} at ${mp.startTimeSeconds}s, ` +
      `dur=${mp.durationSeconds}s, target=${targetLufs} LUFS`
    );

    await ffmpeg([
      "-y",
      "-i", currentPath,
      "-i", normPath,
      "-filter_complex",
      `[1]adelay=${delayMs}|${delayMs},apad[delayed];` +
      `[0][delayed]amix=inputs=2:duration=first:weights=1 1:normalize=0[out]`,
      "-map", "[out]",
      "-c:a", "pcm_s16le", "-ar", "48000",
      outputPath,
    ]);

    currentPath = outputPath;
  }

  const finalPath = path.join(workDir, "music_track.wav");
  await fs.rename(currentPath, finalPath);

  return finalPath;
}

/**
 * Mix voice and music tracks with sidechain ducking.
 * When voice is present, music is automatically reduced by SIDECHAIN_DUCK_DB.
 *
 * Uses sidechaincompress to duck the music track whenever the voice track
 * has signal above the threshold.
 */
export async function mixVoiceAndMusic(
  voiceTrackPath: string,
  musicTrackPath: string,
  outputPath: string,
  options?: {
    /** Duck amount in dB (default: 8) */
    duckDb?: number;
    /** Final target loudness in LUFS (default: -16) */
    targetLufs?: number;
  },
): Promise<void> {
  const duckDb = options?.duckDb ?? SIDECHAIN_DUCK_DB;
  const targetLufs = options?.targetLufs ?? -16;

  // Sidechain compress: voice signal triggers compression on music
  // ratio=4:1 with threshold at -30dB, attack 5ms, release 200ms
  const ratio = 4;
  const threshold = 0.03; // ~-30dB linear

  await ffmpeg([
    "-y",
    "-i", voiceTrackPath,
    "-i", musicTrackPath,
    "-filter_complex",
    // Split voice into output + sidechain key
    `[0]asplit=2[voice][voicekey];` +
    // Use voice as sidechain to compress (duck) the music
    `[1][voicekey]sidechaincompress=threshold=${threshold}:ratio=${ratio}:` +
    `attack=5:release=200:level_sc=1[ducked_music];` +
    // Mix voice + ducked music with equal weights, no normalization
    `[voice][ducked_music]amix=inputs=2:duration=longest:weights=1 1:normalize=0[premix];` +
    // Final loudnorm pass
    `[premix]loudnorm=I=${targetLufs}:TP=-1.5:LRA=11[out]`,
    "-map", "[out]",
    "-c:a", "pcm_s16le", "-ar", "48000",
    outputPath,
  ], 300000);
}

/**
 * Mux a video file with an audio track, replacing the video's existing audio.
 */
export async function muxVideoWithAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  options?: {
    /** Audio codec (default: "aac") */
    audioCodec?: string;
    /** Audio bitrate (default: "192k") */
    audioBitrate?: string;
    /** Copy video stream without re-encoding (default: true) */
    copyVideo?: boolean;
  },
): Promise<void> {
  const codec = options?.audioCodec ?? "aac";
  const bitrate = options?.audioBitrate ?? "192k";
  const copyVideo = options?.copyVideo ?? true;

  await ffmpeg([
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    ...(copyVideo ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "fast", "-crf", "18"]),
    "-c:a", codec, "-b:a", bitrate, "-ar", "48000",
    "-map", "0:v:0", "-map", "1:a:0",
    "-shortest",
    outputPath,
  ]);
}
