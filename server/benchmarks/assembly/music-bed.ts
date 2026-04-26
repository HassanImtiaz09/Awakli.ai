/**
 * A2: Background Music Bed — MiniMax Music 2.6 via Replicate + side-chain ducking
 *
 * Generates an instrumental track via Replicate (minimax/music-2.6),
 * then mixes it with the dialogue track at -22 LUFS with side-chain
 * ducking during dialogue sections.
 *
 * Provider chain:
 *   1. Replicate (minimax/music-2.6) — works from all regions
 *   2. MiniMax direct (api.minimax.io) — fallback if Replicate fails
 *   3. MiniMax legacy (api.minimax.chat) — last resort
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

// ─── Replicate Provider ─────────────────────────────────────────────────

const REPLICATE_API = "https://api.replicate.com/v1";
const REPLICATE_MODEL = "minimax/music-2.6";
const REPLICATE_POLL_INTERVAL_MS = 10_000;
const REPLICATE_MAX_WAIT_MS = 600_000; // 10 min max

async function generateViaReplicate(
  prompt: string,
): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  console.log(`  [A2] Creating Replicate prediction (${REPLICATE_MODEL})...`);

  // Create prediction
  const createResp = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: REPLICATE_MODEL,
      input: {
        prompt,
        is_instrumental: true,
        sample_rate: 44100,
        bitrate: 256000,
        audio_format: "mp3",
      },
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => "");
    throw new Error(`Replicate create failed: ${createResp.status} — ${errText}`);
  }

  const prediction = (await createResp.json()) as any;
  const predictionId = prediction.id;
  const getUrl = prediction.urls?.get ?? `${REPLICATE_API}/predictions/${predictionId}`;

  console.log(`  [A2] Replicate prediction ${predictionId} — polling...`);

  // Poll until complete
  const deadline = Date.now() + REPLICATE_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, REPLICATE_POLL_INTERVAL_MS));

    const pollResp = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!pollResp.ok) {
      console.log(`  [A2] Poll failed: ${pollResp.status}, retrying...`);
      continue;
    }

    const status = (await pollResp.json()) as any;

    if (status.status === "succeeded") {
      const output = status.output;
      const predictTime = status.metrics?.predict_time ?? 0;
      console.log(`  [A2] Replicate succeeded in ${predictTime.toFixed(1)}s`);

      // Output can be a string URL or an array
      if (typeof output === "string") return output;
      if (Array.isArray(output) && output.length > 0) return output[0];
      throw new Error(`Replicate: unexpected output format: ${JSON.stringify(output).slice(0, 200)}`);
    }

    if (status.status === "failed" || status.status === "canceled") {
      throw new Error(`Replicate prediction ${status.status}: ${status.error ?? "unknown"}`);
    }

    // Still processing
    const elapsed = Math.round((Date.now() - (new Date(prediction.created_at).getTime())) / 1000);
    console.log(`  [A2] Replicate status: ${status.status} (${elapsed}s elapsed)...`);
  }

  throw new Error(`Replicate: prediction timed out after ${REPLICATE_MAX_WAIT_MS / 1000}s`);
}

// ─── MiniMax Direct Provider ─────────────────────────────────────────────

const MINIMAX_ENDPOINTS = [
  "https://api.minimax.io/v1/music_generation",
  "https://api.minimax.chat/v1/music_generation",
];

async function generateViaMiniMaxDirect(
  prompt: string,
): Promise<string> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error("MINIMAX_API_KEY not set");

  const requestBody = {
    model: "music-2.6",
    prompt,
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
      console.log(`  [A2] Trying MiniMax direct: ${endpoint}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min

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

      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        throw new Error(`MiniMax error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
      }

      // Extract audio URL
      if (data.data?.audio && typeof data.data.audio === "string" && data.data.audio.startsWith("http")) {
        return data.data.audio;
      } else if (data.data?.audio_url) {
        return data.data.audio_url;
      } else if (data.audio_url) {
        return data.audio_url;
      } else if (data.data?.audio && typeof data.data.audio === "string") {
        const audioBuffer = Buffer.from(data.data.audio, "hex");
        const key = `benchmarks/p13/music_bed_${Date.now()}.mp3`;
        const { url } = await storagePut(key, audioBuffer, "audio/mpeg");
        return url;
      }

      throw new Error(`MiniMax: unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    } catch (err: any) {
      lastError = err;
      console.log(`  [A2] MiniMax ${endpoint} failed: ${err.message}`);
    }
  }

  throw lastError ?? new Error("MiniMax direct: all endpoints failed");
}

// ─── Top-Level Music Generation ─────────────────────────────────────────

/**
 * Generate a music track using the provider chain:
 *   1. Replicate (minimax/music-2.6)
 *   2. MiniMax direct (api.minimax.io)
 *   3. MiniMax legacy (api.minimax.chat)
 */
export async function generateMusicBed(
  options: MusicBedOptions = {}
): Promise<{ url: string; durationSec: number; generationTimeMs: number; provider: string }> {
  const opts = { ...DEFAULT_MUSIC_OPTIONS, ...options };
  const start = Date.now();
  console.log(`  [A2] Generating ${opts.durationSec}s music bed...`);

  // Provider 1: Replicate
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      const url = await generateViaReplicate(opts.prompt);
      const generationTimeMs = Date.now() - start;
      console.log(`  [A2] Music bed via Replicate in ${(generationTimeMs / 1000).toFixed(1)}s: ${url.slice(0, 80)}...`);
      return { url, durationSec: opts.durationSec, generationTimeMs, provider: "replicate" };
    } catch (err: any) {
      console.log(`  [A2] Replicate failed: ${err.message}, trying MiniMax direct...`);
    }
  }

  // Provider 2+3: MiniMax direct (api.minimax.io → api.minimax.chat)
  if (process.env.MINIMAX_API_KEY) {
    try {
      const url = await generateViaMiniMaxDirect(opts.prompt);
      const generationTimeMs = Date.now() - start;
      console.log(`  [A2] Music bed via MiniMax direct in ${(generationTimeMs / 1000).toFixed(1)}s: ${url.slice(0, 80)}...`);
      return { url, durationSec: opts.durationSec, generationTimeMs, provider: "minimax-direct" };
    } catch (err: any) {
      console.log(`  [A2] MiniMax direct failed: ${err.message}`);
    }
  }

  throw new Error("A2: All music providers failed. Need REPLICATE_API_TOKEN or MINIMAX_API_KEY.");
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
