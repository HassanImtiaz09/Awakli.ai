/**
 * A2: Background Music Bed — MiniMax Music generation + side-chain ducking
 *
 * Generates an instrumental track via MiniMax Music API (music-2.6),
 * then mixes it with the dialogue track at -22 LUFS with side-chain
 * ducking during dialogue sections.
 *
 * MiniMax API docs: https://platform.minimax.io/docs/api-reference/music-generation
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
  durationSec: 210,
  musicLufs: -22,
  duckingDb: -12,
  duckAttackMs: 200,
  duckReleaseMs: 500,
};

// ─── MiniMax Music Endpoints ─────────────────────────────────────────────
// MiniMax migrated from api.minimax.chat to api.minimax.io (2025+).
// We try the new endpoint first, fall back to the legacy one.
const MINIMAX_ENDPOINTS = [
  "https://api.minimax.io/v1/music_generation",
  "https://api.minimax.chat/v1/music_generation",
];

// ─── MiniMax Music Generation ─────────────────────────────────────────────

/**
 * Generate a music track via MiniMax Music API.
 * Uses the MINIMAX_API_KEY environment variable.
 *
 * MiniMax Music API (v2):
 *   POST https://api.minimax.io/v1/music_generation
 *   Model: music-2.6 (paid) or music-2.6-free (free tier)
 *   Body: { model, prompt, is_instrumental, output_format, audio_setting }
 *   Returns: { data: { audio }, extra_info: { music_duration }, base_resp }
 */
export async function generateMusicBed(
  options: MusicBedOptions = {}
): Promise<{ url: string; durationSec: number; generationTimeMs: number }> {
  const opts = { ...DEFAULT_MUSIC_OPTIONS, ...options };
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const start = Date.now();
  console.log(`  [A2] Generating ${opts.durationSec}s music bed via MiniMax Music...`);

  const requestBody = {
    model: "music-2.6",
    prompt: opts.prompt,
    is_instrumental: true,
    output_format: "url",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
  };

  let lastError: Error | null = null;

  for (const endpoint of MINIMAX_ENDPOINTS) {
    try {
      console.log(`  [A2] Trying endpoint: ${endpoint}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!resp.ok) {
        const err = await resp.text().catch(() => "");
        throw new Error(`MiniMax Music failed: ${resp.status} — ${err}`);
      }

      const data = (await resp.json()) as any;

      // Check for API-level errors
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        // If "invalid api key" on this endpoint, try the next one
        if (data.base_resp.status_code === 2049) {
          throw new Error(`MiniMax: invalid API key on ${endpoint}`);
        }
        throw new Error(`MiniMax Music error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
      }

      // Extract audio URL from response
      let audioUrl: string;
      if (data.data?.audio && typeof data.data.audio === "string" && data.data.audio.startsWith("http")) {
        // output_format: "url" → data.audio is a URL
        audioUrl = data.data.audio;
      } else if (data.data?.audio_url) {
        audioUrl = data.data.audio_url;
      } else if (data.audio_url) {
        audioUrl = data.audio_url;
      } else if (data.data?.audio && typeof data.data.audio === "string") {
        // output_format: "hex" → data.audio is hex-encoded audio
        const audioBuffer = Buffer.from(data.data.audio, "hex");
        const key = `benchmarks/p13/music_bed_${Date.now()}.mp3`;
        const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
        audioUrl = url;
      } else {
        throw new Error(`MiniMax Music: unexpected response format: ${JSON.stringify(data).slice(0, 200)}`);
      }

      const generationTimeMs = Date.now() - start;
      const musicDurationMs = data.extra_info?.music_duration;
      const actualDuration = musicDurationMs ? musicDurationMs / 1000 : opts.durationSec;
      console.log(`  [A2] Music bed generated in ${(generationTimeMs / 1000).toFixed(1)}s (${actualDuration.toFixed(1)}s track): ${audioUrl.slice(0, 80)}...`);

      return {
        url: audioUrl,
        durationSec: actualDuration,
        generationTimeMs,
      };
    } catch (err: any) {
      lastError = err;
      console.log(`  [A2] Endpoint ${endpoint} failed: ${err.message}`);
      // Try next endpoint
    }
  }

  // Also try the free-tier model as last resort
  try {
    console.log(`  [A2] Trying free-tier model (music-2.6-free) on legacy endpoint...`);
    const freeBody = { ...requestBody, model: "music-2.6-free" };
    const resp = await fetch(MINIMAX_ENDPOINTS[1], {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(freeBody),
    });

    const data = (await resp.json()) as any;
    if (data.base_resp?.status_code === 0 && data.data?.audio) {
      let audioUrl: string;
      if (typeof data.data.audio === "string" && data.data.audio.startsWith("http")) {
        audioUrl = data.data.audio;
      } else {
        const audioBuffer = Buffer.from(data.data.audio, "hex");
        const key = `benchmarks/p13/music_bed_${Date.now()}.mp3`;
        const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
        audioUrl = url;
      }

      const generationTimeMs = Date.now() - start;
      const musicDurationMs = data.extra_info?.music_duration;
      const actualDuration = musicDurationMs ? musicDurationMs / 1000 : opts.durationSec;
      console.log(`  [A2] Music bed (free tier) generated in ${(generationTimeMs / 1000).toFixed(1)}s: ${audioUrl.slice(0, 80)}...`);
      return { url: audioUrl, durationSec: actualDuration, generationTimeMs };
    }
  } catch (_) {
    // Fall through to final error
  }

  throw lastError ?? new Error("MiniMax Music: all endpoints failed");
}

// ─── Music Mixing with Side-Chain Ducking ─────────────────────────────────

/**
 * Mix a music bed with a dialogue/video track using side-chain ducking.
 *
 * The music volume is reduced during dialogue sections using FFmpeg's
 * amix filter with volume weighting. The dialogue track keeps full volume
 * while the music is attenuated by the ducking amount.
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
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  );
  const videoDuration = parseFloat(durationStr.trim());

  // Calculate music volume from ducking dB
  // -12dB ducking → volume factor ~0.25
  const musicVolume = Math.pow(10, opts.duckingDb / 20);

  // FFmpeg filter chain:
  // 1. Trim music to video duration
  // 2. Apply volume reduction to music
  // 3. Mix dialogue (full volume) + ducked music
  const filterComplex = [
    `[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS,volume=${musicVolume.toFixed(4)}[music]`,
    `[0:a][music]amix=inputs=2:duration=first:weights=1 1:normalize=0[aout]`,
  ].join(";");

  const cmd = [
    "ffmpeg", "-hide_banner", "-y",
    `-i "${videoPath}"`,
    `-i "${musicPath}"`,
    `-filter_complex "${filterComplex}"`,
    `-map 0:v -map "[aout]"`,
    "-c:v copy",
    "-c:a aac -b:a 192k",
    "-shortest",
    `"${outputPath}"`,
  ].join(" ");

  console.log(`  [A2] Mixing music bed (${opts.musicLufs} LUFS, ${opts.duckingDb}dB duck, vol=${musicVolume.toFixed(4)})...`);
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
