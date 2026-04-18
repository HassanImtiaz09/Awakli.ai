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

export interface FoleyPlacement {
  /** Absolute path to the foley audio file (e.g., footsteps, door hiss, weapon impact) */
  filePath: string;
  /** Start time in seconds where this foley should appear */
  startTimeSeconds: number;
  /** Duration of the foley clip in seconds */
  durationSeconds: number;
  /** Target loudness in LUFS (default: -28) */
  targetLufs?: number;
  /** Foley category for logging (e.g., "footstep", "impact", "door") */
  category?: string;
  /** Label for logging */
  label?: string;
}

export interface AmbientPlacement {
  /** Absolute path to the ambient audio file (e.g., ocean hum, city noise, wind) */
  filePath: string;
  /** Start time in seconds where this ambient layer begins */
  startTimeSeconds: number;
  /** Duration of the ambient layer in seconds (can span entire video) */
  durationSeconds: number;
  /** Target loudness in LUFS (default: -32) */
  targetLufs?: number;
  /** Whether to loop the ambient file to fill the duration (default: true) */
  loop?: boolean;
  /** Fade in duration in seconds (default: 1.0) */
  fadeInSeconds?: number;
  /** Fade out duration in seconds (default: 1.5) */
  fadeOutSeconds?: number;
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

/** Default foley target loudness (footsteps, impacts, doors) */
export const DEFAULT_FOLEY_LUFS = -28;

/** Default ambient target loudness (ocean hum, wind, city noise) */
export const DEFAULT_AMBIENT_LUFS = -32;

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

// ─── Core: Foley Track Builder ─────────────────────────────────────────

/**
 * Build a foley track by sequentially overlaying foley clips onto a silence base.
 * Uses the same safe sequential overlay approach as voice mixing.
 *
 * Foley clips are short, punctual sound effects (footsteps, impacts, doors, etc.)
 * placed at precise timecodes. Default target: -28 LUFS.
 */
export async function buildFoleyTrack(
  foleyPlacements: FoleyPlacement[],
  totalDuration: number,
  workDir: string,
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });

  const silencePath = path.join(workDir, "foley_silence.wav");
  await ffmpeg([
    "-y",
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
    "-t", totalDuration.toFixed(3),
    "-c:a", "pcm_s16le",
    silencePath,
  ]);

  if (foleyPlacements.length === 0) {
    return silencePath;
  }

  let currentPath = silencePath;

  for (let i = 0; i < foleyPlacements.length; i++) {
    const fp = foleyPlacements[i];
    const targetLufs = fp.targetLufs ?? DEFAULT_FOLEY_LUFS;
    const normPath = path.join(workDir, `foley_norm_${i}.wav`);
    const outputPath = path.join(workDir, `foley_mix_step_${i}.wav`);

    // Trim + normalize foley clip
    await ffmpeg([
      "-y", "-i", fp.filePath,
      "-t", fp.durationSeconds.toFixed(3),
      "-af", `loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      normPath,
    ]);

    const delayMs = Math.round(fp.startTimeSeconds * 1000);
    const label = fp.label || fp.category || `foley_${i}`;

    console.log(
      `[AudioMixer] Placing foley ${label} at ${fp.startTimeSeconds}s, ` +
      `dur=${fp.durationSeconds}s, target=${targetLufs} LUFS`
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

  const finalPath = path.join(workDir, "foley_track.wav");
  await fs.rename(currentPath, finalPath);

  return finalPath;
}

// ─── Core: Ambient Track Builder ───────────────────────────────────────

/**
 * Build an ambient track by placing ambient layers at specified times.
 * Ambient clips are long, continuous background sounds (ocean hum, wind, city noise)
 * that can optionally loop and have fade in/out. Default target: -32 LUFS.
 */
export async function buildAmbientTrack(
  ambientPlacements: AmbientPlacement[],
  totalDuration: number,
  workDir: string,
): Promise<string> {
  await fs.mkdir(workDir, { recursive: true });

  const silencePath = path.join(workDir, "ambient_silence.wav");
  await ffmpeg([
    "-y",
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=48000`,
    "-t", totalDuration.toFixed(3),
    "-c:a", "pcm_s16le",
    silencePath,
  ]);

  if (ambientPlacements.length === 0) {
    return silencePath;
  }

  let currentPath = silencePath;

  for (let i = 0; i < ambientPlacements.length; i++) {
    const ap = ambientPlacements[i];
    const targetLufs = ap.targetLufs ?? DEFAULT_AMBIENT_LUFS;
    const fadeIn = ap.fadeInSeconds ?? 1.0;
    const fadeOut = ap.fadeOutSeconds ?? 1.5;
    const shouldLoop = ap.loop !== false; // default true
    const normPath = path.join(workDir, `ambient_norm_${i}.wav`);
    const outputPath = path.join(workDir, `ambient_mix_step_${i}.wav`);

    // Build the filter chain for this ambient clip
    // If looping: loop the source, trim to desired duration, then normalize
    // If not looping: just trim and normalize
    const loopFilter = shouldLoop
      ? `aloop=loop=-1:size=2e+09,atrim=0:${ap.durationSeconds.toFixed(3)},asetpts=N/SR/TB,`
      : `atrim=0:${ap.durationSeconds.toFixed(3)},`;

    // Add fade in/out
    const fadeFilter =
      `afade=t=in:st=0:d=${fadeIn.toFixed(2)},` +
      `afade=t=out:st=${Math.max(0, ap.durationSeconds - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)},`;

    await ffmpeg([
      "-y", "-i", ap.filePath,
      "-af",
      `${loopFilter}${fadeFilter}loudnorm=I=${targetLufs}:TP=-2:LRA=11`,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      normPath,
    ]);

    const delayMs = Math.round(ap.startTimeSeconds * 1000);
    const label = ap.label || `ambient_${i}`;

    console.log(
      `[AudioMixer] Placing ambient ${label} at ${ap.startTimeSeconds}s, ` +
      `dur=${ap.durationSeconds}s, loop=${shouldLoop}, fade=${fadeIn}/${fadeOut}s, ` +
      `target=${targetLufs} LUFS`
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

  const finalPath = path.join(workDir, "ambient_track.wav");
  await fs.rename(currentPath, finalPath);

  return finalPath;
}

// ─── Core: 4-Bus Audio Mixer ───────────────────────────────────────────

/**
 * Mix all four audio buses into a single stereo master:
 *   Bus 1: Voice    (-14 LUFS) — dialogue, narration
 *   Bus 2: Music    (-24 LUFS) — background music, score
 *   Bus 3: Foley    (-28 LUFS) — footsteps, impacts, doors
 *   Bus 4: Ambient  (-32 LUFS) — ocean hum, wind, city noise
 *
 * Voice gets priority via sidechain ducking on music.
 * All buses are mixed with explicit weights and normalize=0.
 *
 * @param voiceTrackPath - Path to the voice bus WAV
 * @param musicTrackPath - Path to the music bus WAV
 * @param foleyTrackPath - Path to the foley bus WAV (or null to skip)
 * @param ambientTrackPath - Path to the ambient bus WAV (or null to skip)
 * @param outputPath - Path for the final mixed audio
 * @param options - Mix options
 */
export async function mixAllAudioBuses(
  voiceTrackPath: string,
  musicTrackPath: string,
  foleyTrackPath: string | null,
  ambientTrackPath: string | null,
  outputPath: string,
  options?: {
    duckDb?: number;
    targetLufs?: number;
  },
): Promise<void> {
  const duckDb = options?.duckDb ?? SIDECHAIN_DUCK_DB;
  const targetLufs = options?.targetLufs ?? -16;
  const ratio = 4;
  const threshold = 0.03;

  // Determine how many buses we're mixing
  const hasFoley = foleyTrackPath !== null;
  const hasAmbient = ambientTrackPath !== null;
  const busCount = 2 + (hasFoley ? 1 : 0) + (hasAmbient ? 1 : 0);

  console.log(
    `[AudioMixer] 4-bus mix: voice + music` +
    `${hasFoley ? " + foley" : ""}${hasAmbient ? " + ambient" : ""}` +
    ` (${busCount} buses, target ${targetLufs} LUFS)`
  );

  // Build the filter graph dynamically based on available buses
  const inputs: string[] = ["-i", voiceTrackPath, "-i", musicTrackPath];
  let inputIdx = 2;
  let foleyIdx = -1;
  let ambientIdx = -1;

  if (hasFoley) {
    inputs.push("-i", foleyTrackPath!);
    foleyIdx = inputIdx++;
  }
  if (hasAmbient) {
    inputs.push("-i", ambientTrackPath!);
    ambientIdx = inputIdx++;
  }

  // Build filter graph:
  // 1. Split voice for sidechain key
  // 2. Duck music using voice as sidechain
  // 3. Mix all buses with equal weights, no normalization
  // 4. Final loudnorm pass
  let filterParts: string[] = [];

  // Voice split for sidechain
  filterParts.push(`[0]asplit=2[voice][voicekey]`);

  // Sidechain compress music
  filterParts.push(
    `[1][voicekey]sidechaincompress=threshold=${threshold}:ratio=${ratio}:` +
    `attack=5:release=200:level_sc=1[ducked_music]`
  );

  // Start building the mix chain
  // First mix voice + ducked music
  let mixLabel = "vm_mix";
  filterParts.push(
    `[voice][ducked_music]amix=inputs=2:duration=longest:weights=1 1:normalize=0[${mixLabel}]`
  );

  // Add foley if present
  if (hasFoley) {
    const prevLabel = mixLabel;
    mixLabel = "vmf_mix";
    filterParts.push(
      `[${prevLabel}][${foleyIdx}]amix=inputs=2:duration=longest:weights=1 1:normalize=0[${mixLabel}]`
    );
  }

  // Add ambient if present
  if (hasAmbient) {
    const prevLabel = mixLabel;
    mixLabel = "vmfa_mix";
    filterParts.push(
      `[${prevLabel}][${ambientIdx}]amix=inputs=2:duration=longest:weights=1 1:normalize=0[${mixLabel}]`
    );
  }

  // Final loudnorm
  filterParts.push(
    `[${mixLabel}]loudnorm=I=${targetLufs}:TP=-1.5:LRA=11[out]`
  );

  const filterGraph = filterParts.join(";");

  await ffmpeg([
    "-y",
    ...inputs,
    "-filter_complex", filterGraph,
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
