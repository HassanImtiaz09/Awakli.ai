/**
 * MiniMax Music 2.6 Service Module
 *
 * Provides music generation, lyrics generation, and cover creation
 * using the MiniMax Music API (https://platform.minimax.io).
 */

import { ENV } from "./_core/env";
import { storagePut } from "./storage";

const BASE_URL = "https://api.minimax.io/v1";

// ─── Types ──────────────────────────────────────────────────────────

export interface MusicGenerationOptions {
  /** Style/mood description (1-2000 chars) */
  prompt: string;
  /** Song lyrics with structure tags. Required for non-instrumental. */
  lyrics?: string;
  /** Generate instrumental only (no vocals). Default: false */
  instrumental?: boolean;
  /** Auto-generate lyrics from prompt. Default: false */
  autoLyrics?: boolean;
  /** Use paid model for higher quality/RPM. Default: false (uses free tier) */
  usePaidModel?: boolean;
  /** Output format: "mp3" | "wav". Default: "mp3" */
  format?: "mp3" | "wav";
  /** Sample rate. Default: 44100 */
  sampleRate?: number;
  /** Bitrate. Default: 256000 */
  bitrate?: number;
}

export interface MusicCoverOptions {
  /** Target cover style description (10-300 chars) */
  prompt: string;
  /** Reference audio URL */
  audioUrl?: string;
  /** Reference audio as base64 */
  audioBase64?: string;
  /** Optional lyrics override (10-1000 chars) */
  lyrics?: string;
  /** Use paid model. Default: false */
  usePaidModel?: boolean;
  /** Output format. Default: "mp3" */
  format?: "mp3" | "wav";
}

export interface LyricsGenerationOptions {
  /** Song theme/style description (up to 2000 chars) */
  prompt: string;
  /** Generation mode. Default: "write_full_song" */
  mode?: "write_full_song" | "edit";
  /** Existing lyrics for edit mode */
  lyrics?: string;
  /** Song title (preserved in output if provided) */
  title?: string;
}

export interface MusicResult {
  /** URL to the generated audio (expires in 24h) */
  audioUrl: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Sample rate */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Bitrate */
  bitrate: number;
  /** S3 URL if uploaded */
  s3Url?: string;
}

export interface LyricsResult {
  /** Generated song title */
  songTitle: string;
  /** Style tags (comma-separated) */
  styleTags: string;
  /** Generated lyrics with structure tags */
  lyrics: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = ENV.minimaxApiKey;
  if (!key) throw new Error("MINIMAX_API_KEY is not configured");
  return key;
}

async function minimaxRequest(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`MiniMax API HTTP error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.base_resp?.status_code !== 0) {
    const code = data.base_resp?.status_code;
    const msg = data.base_resp?.status_msg || "Unknown error";
    throw new Error(`MiniMax API error ${code}: ${msg}`);
  }

  return data;
}

// ─── Music Generation ───────────────────────────────────────────────

/**
 * Generate music from a prompt and optional lyrics.
 * This is a synchronous API — it blocks until the audio is ready.
 * Typical generation time: 30-90 seconds.
 */
export async function generateMusic(options: MusicGenerationOptions): Promise<MusicResult> {
  const model = options.usePaidModel ? "music-2.6" : "music-2.6-free";
  const format = options.format || "mp3";

  const body: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    output_format: "url",
    audio_setting: {
      sample_rate: options.sampleRate || 44100,
      bitrate: options.bitrate || 256000,
      format,
    },
    is_instrumental: options.instrumental ?? false,
    lyrics_optimizer: options.autoLyrics ?? false,
  };

  if (options.lyrics && !options.instrumental) {
    body.lyrics = options.lyrics;
  }

  const data = await minimaxRequest("/music_generation", body);

  const audioUrl = data.data?.audio;
  if (!audioUrl) {
    throw new Error("MiniMax returned no audio data");
  }

  return {
    audioUrl,
    durationMs: data.extra_info?.music_duration || 0,
    sizeBytes: data.extra_info?.music_size || 0,
    sampleRate: data.extra_info?.music_sample_rate || 44100,
    channels: data.extra_info?.music_channel || 2,
    bitrate: data.extra_info?.bitrate || 256000,
  };
}

/**
 * Generate music and upload to S3 for permanent storage.
 * Returns both the temporary MiniMax URL and the permanent S3 URL.
 */
export async function generateMusicAndUpload(
  options: MusicGenerationOptions,
  s3Key: string
): Promise<MusicResult> {
  const result = await generateMusic(options);

  // Download from MiniMax temporary URL
  const audioRes = await fetch(result.audioUrl);
  if (!audioRes.ok) {
    throw new Error(`Failed to download audio from MiniMax: ${audioRes.status}`);
  }
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

  // Upload to S3
  const format = options.format || "mp3";
  const contentType = format === "wav" ? "audio/wav" : "audio/mpeg";
  const { url: s3Url } = await storagePut(s3Key, audioBuffer, contentType);

  return {
    ...result,
    s3Url,
  };
}

// ─── Cover Generation ───────────────────────────────────────────────

/**
 * Generate a cover version from a reference audio.
 */
export async function generateCover(options: MusicCoverOptions): Promise<MusicResult> {
  const model = options.usePaidModel ? "music-cover" : "music-cover-free";
  const format = options.format || "mp3";

  const body: Record<string, unknown> = {
    model,
    prompt: options.prompt,
    output_format: "url",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format,
    },
  };

  if (options.audioUrl) body.audio_url = options.audioUrl;
  if (options.audioBase64) body.audio_base64 = options.audioBase64;
  if (options.lyrics) body.lyrics = options.lyrics;

  const data = await minimaxRequest("/music_generation", body);

  const audioUrl = data.data?.audio;
  if (!audioUrl) {
    throw new Error("MiniMax returned no audio data for cover");
  }

  return {
    audioUrl,
    durationMs: data.extra_info?.music_duration || 0,
    sizeBytes: data.extra_info?.music_size || 0,
    sampleRate: data.extra_info?.music_sample_rate || 44100,
    channels: data.extra_info?.music_channel || 2,
    bitrate: data.extra_info?.bitrate || 256000,
  };
}

// ─── Lyrics Generation ──────────────────────────────────────────────

/**
 * Generate song lyrics from a prompt.
 * Can also edit/continue existing lyrics.
 */
export async function generateLyrics(options: LyricsGenerationOptions): Promise<LyricsResult> {
  const body: Record<string, unknown> = {
    mode: options.mode || "write_full_song",
    prompt: options.prompt,
  };

  if (options.lyrics) body.lyrics = options.lyrics;
  if (options.title) body.title = options.title;

  const data = await minimaxRequest("/lyrics_generation", body);

  return {
    songTitle: data.song_title || "",
    styleTags: data.style_tags || "",
    lyrics: data.lyrics || "",
  };
}

// ─── Anime Soundtrack Helpers ───────────────────────────────────────

/**
 * Generate an anime opening/ending theme based on the manga's genre and mood.
 */
export async function generateAnimeTheme(opts: {
  genre: string;
  mood: string;
  title?: string;
  instrumental?: boolean;
}): Promise<MusicResult> {
  const prompt = `Anime ${opts.mood} theme song, ${opts.genre} style, cinematic, Japanese animation soundtrack${opts.title ? `, for "${opts.title}"` : ""}`;

  if (opts.instrumental) {
    return generateMusic({
      prompt,
      instrumental: true,
    });
  }

  // Generate lyrics first, then music
  const lyrics = await generateLyrics({
    prompt: `Anime theme song lyrics. Genre: ${opts.genre}. Mood: ${opts.mood}. ${opts.title ? `Title: ${opts.title}.` : ""} Style: dramatic, emotional, suitable for anime opening.`,
  });

  return generateMusic({
    prompt: `${lyrics.styleTags}, anime opening, cinematic`,
    lyrics: lyrics.lyrics,
  });
}

/**
 * Generate background music for an anime scene.
 */
export async function generateSceneBGM(opts: {
  sceneDescription: string;
  mood: string;
  durationHint?: string;
}): Promise<MusicResult> {
  const prompt = `Anime background music, ${opts.mood}, ${opts.sceneDescription}, cinematic orchestral${opts.durationHint ? `, ${opts.durationHint}` : ""}`;

  return generateMusic({
    prompt,
    instrumental: true,
  });
}

/**
 * Generate a complete anime soundtrack package:
 * - Opening theme (with vocals)
 * - Background music (instrumental)
 * - Ending theme (instrumental)
 *
 * Returns all three tracks with S3 URLs.
 */
export async function generateAnimeSoundtrackPackage(opts: {
  projectId: number;
  genre: string;
  mood: string;
  title: string;
}): Promise<{
  opening: MusicResult;
  bgm: MusicResult;
  ending: MusicResult;
}> {
  const prefix = `projects/${opts.projectId}/soundtrack`;

  // Generate all three tracks (sequentially to avoid rate limits)
  const opening = await generateMusicAndUpload(
    {
      prompt: `Anime opening theme, ${opts.genre}, ${opts.mood}, energetic, cinematic, Japanese animation, for "${opts.title}"`,
      instrumental: false,
      autoLyrics: true,
    },
    `${prefix}/opening-${Date.now()}.mp3`
  );

  const bgm = await generateMusicAndUpload(
    {
      prompt: `Anime background music, ${opts.genre}, ${opts.mood}, atmospheric, emotional, cinematic orchestral, for "${opts.title}"`,
      instrumental: true,
    },
    `${prefix}/bgm-${Date.now()}.mp3`
  );

  const ending = await generateMusicAndUpload(
    {
      prompt: `Anime ending theme, ${opts.genre}, ${opts.mood}, melancholic, reflective, gentle, Japanese animation, for "${opts.title}"`,
      instrumental: true,
    },
    `${prefix}/ending-${Date.now()}.mp3`
  );

  return { opening, bgm, ending };
}
