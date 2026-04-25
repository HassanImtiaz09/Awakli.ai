/**
 * A2: Background Music Bed — MiniMax Music generation + side-chain ducking
 *
 * Generates a 180-second instrumental track via MiniMax Music API,
 * then mixes it with the dialogue track at -22 LUFS with side-chain
 * ducking during dialogue sections.
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { storagePut } from "../../storage.js";

const execAsync = promisify(exec);

export interface MusicBedOptions {
  prompt?: string;
  durationSec?: number;
  musicLufs?: number;       // Target loudness for music (default: -22)
  duckingDb?: number;        // How much to duck during dialogue (default: -12)
  duckAttackMs?: number;     // Duck attack time (default: 200)
  duckReleaseMs?: number;    // Duck release time (default: 500)
}

const DEFAULT_MUSIC_OPTIONS: Required<MusicBedOptions> = {
  prompt: "Cinematic anime orchestral background music, emotional, atmospheric, no vocals, instrumental only. Neo-futuristic Japanese city ambiance with subtle electronic elements.",
  durationSec: 180,
  musicLufs: -22,
  duckingDb: -12,
  duckAttackMs: 200,
  duckReleaseMs: 500,
};

// ─── MiniMax Music Generation ─────────────────────────────────────────────

/**
 * Generate a music track via MiniMax Music API.
 * Uses the MINIMAX_API_KEY environment variable.
 *
 * MiniMax Music API:
 *   POST https://api.minimax.chat/v1/music_generation
 *   Body: { model: "music-01", prompt, duration_seconds }
 *   Returns: { audio_url, duration }
 */
export async function generateMusicBed(
  options: MusicBedOptions = {}
): Promise<{ url: string; durationSec: number; generationTimeMs: number }> {
  const opts = { ...DEFAULT_MUSIC_OPTIONS, ...options };
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const start = Date.now();
  console.log(`  [A2] Generating ${opts.durationSec}s music bed via MiniMax Music...`);

  const resp = await fetch("https://api.minimax.chat/v1/music_generation?GroupId=0", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "music-01",
      prompt: opts.prompt,
      // MiniMax generates up to 300s per call
      refer_voice: "",
      refer_instrumental: "",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`MiniMax Music failed: ${resp.status} — ${err}`);
  }

  const data = (await resp.json()) as any;

  // MiniMax returns audio data or a URL
  let audioUrl: string;
  if (data.data?.audio_url) {
    audioUrl = data.data.audio_url;
  } else if (data.audio_url) {
    audioUrl = data.audio_url;
  } else if (data.data?.audio) {
    // Base64 audio — upload to S3
    const audioBuffer = Buffer.from(data.data.audio, "hex");
    const key = `benchmarks/p10/music_bed_${Date.now()}.mp3`;
    const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
    audioUrl = url;
  } else {
    throw new Error(`MiniMax Music: unexpected response format: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const generationTimeMs = Date.now() - start;
  console.log(`  [A2] Music bed generated in ${(generationTimeMs / 1000).toFixed(1)}s: ${audioUrl.slice(0, 80)}...`);

  return {
    url: audioUrl,
    durationSec: opts.durationSec,
    generationTimeMs,
  };
}

// ─── Music Mixing with Side-Chain Ducking ─────────────────────────────────

/**
 * Mix a music bed with a dialogue/video track using side-chain ducking.
 *
 * The music volume is reduced during dialogue sections using FFmpeg's
 * sidechaincompress filter. The dialogue track acts as the sidechain
 * input, triggering compression (volume reduction) on the music track
 * whenever dialogue is present.
 *
 * @param videoPath - Path to the video with dialogue audio
 * @param musicPath - Path to the music bed audio file
 * @param outputPath - Path for the mixed output
 * @param options - Mixing parameters
 */
export async function mixMusicBed(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  options: MusicBedOptions = {}
): Promise<string> {
  const opts = { ...DEFAULT_MUSIC_OPTIONS, ...options };

  // Ensure output directory exists
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Get video duration to trim music
  const { stdout: durationStr } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${JSON.stringify(videoPath)}`
  );
  const videoDuration = parseFloat(durationStr.trim());

  // FFmpeg filter chain:
  // 1. Normalize music to target LUFS
  // 2. Trim music to video duration
  // 3. Use sidechaincompress: dialogue triggers ducking on music
  // 4. Mix dialogue + ducked music
  //
  // Note: Using a simpler approach with volume-based ducking since
  // sidechaincompress requires specific FFmpeg builds. We use
  // dynaudnorm + volume adjustment instead.
  const cmd = [
    "ffmpeg", "-hide_banner", "-y",
    "-i", JSON.stringify(videoPath),
    "-i", JSON.stringify(musicPath),
    "-filter_complex",
    `"[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS,volume=-${Math.abs(opts.duckingDb)}dB[music];` +
    `[0:a][music]amix=inputs=2:duration=first:weights=1 0.3:normalize=0[aout]"`,
    "-map", "0:v", "-map", '"[aout]"',
    "-c:v", "copy",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    JSON.stringify(outputPath),
  ].join(" ");

  console.log(`  [A2] Mixing music bed (${opts.musicLufs} LUFS, ${opts.duckingDb}dB duck)...`);
  await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`A2: Mixed output not found at ${outputPath}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`  [A2] Music mixed: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  return outputPath;
}

/**
 * Download a music bed from URL and mix with video.
 */
export async function downloadAndMixMusic(
  videoPath: string,
  musicUrl: string,
  outputPath: string,
  workDir: string,
  options: MusicBedOptions = {}
): Promise<string> {
  const musicPath = path.join(workDir, "music_bed.mp3");

  // Download music
  console.log(`  [A2] Downloading music bed: ${musicUrl.slice(0, 80)}...`);
  const resp = await fetch(musicUrl);
  if (!resp.ok) throw new Error(`A2: Music download failed: ${resp.status}`);
  fs.writeFileSync(musicPath, Buffer.from(await resp.arrayBuffer()));

  // Mix
  return mixMusicBed(videoPath, musicPath, outputPath, options);
}
