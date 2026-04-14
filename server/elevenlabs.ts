/**
 * ElevenLabs Voice Generation Service
 *
 * Provides text-to-speech, voice cloning, voice library browsing,
 * and voice management functions using the ElevenLabs API v1.
 */

import { ENV } from "./_core/env";

const BASE_URL = "https://api.elevenlabs.io/v1";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string; // "premade" | "cloned" | "generated" | "professional"
  description: string | null;
  preview_url: string | null;
  labels: Record<string, string>;
  fine_tuning?: {
    is_allowed_to_fine_tune: boolean;
    state: Record<string, string>;
  };
}

export interface VoiceSettings {
  stability: number;       // 0.0 - 1.0 (lower = more variable/expressive)
  similarity_boost: number; // 0.0 - 1.0 (higher = more similar to original)
  style?: number;           // 0.0 - 1.0 (style exaggeration, v2 models only)
  use_speaker_boost?: boolean;
}

export interface TTSOptions {
  voiceId: string;
  text: string;
  modelId?: string;
  voiceSettings?: Partial<VoiceSettings>;
  outputFormat?: string;
}

export interface SharedVoice {
  voice_id: string;
  name: string;
  description: string | null;
  preview_url: string | null;
  category: string;
  labels: Record<string, string>;
  accent?: string;
  age?: string;
  gender?: string;
  use_case?: string;
  language?: string;
}

export interface SharedVoicesResponse {
  voices: SharedVoice[];
  has_more: boolean;
  last_sort_id: string | null;
}

// ─── Default Settings ───────────────────────────────────────────────────────

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

// Recommended models
export const MODELS = {
  MULTILINGUAL_V2: "eleven_multilingual_v2",  // Best quality, multilingual
  TURBO_V2_5: "eleven_turbo_v2_5",            // Fast, English-optimized
  TURBO_V2: "eleven_turbo_v2",                // Fastest, English only
  MONOLINGUAL_V1: "eleven_monolingual_v1",    // Legacy
} as const;

// Anime-style voice presets for character archetypes
export const VOICE_PRESETS = {
  heroic: { stability: 0.4, similarity_boost: 0.8, style: 0.3 },
  villain: { stability: 0.3, similarity_boost: 0.7, style: 0.5 },
  narrator: { stability: 0.7, similarity_boost: 0.8, style: 0.1 },
  cute: { stability: 0.5, similarity_boost: 0.9, style: 0.2 },
  elderly: { stability: 0.6, similarity_boost: 0.7, style: 0.2 },
  robot: { stability: 0.8, similarity_boost: 0.5, style: 0.0 },
} as const;

// ─── Helper ─────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = ENV.elevenLabsApiKey;
  if (!key) {
    throw new Error("ELEVENLABS_API_KEY is not configured. Add it in Settings → Secrets.");
  }
  return key;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const key = getApiKey();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": key,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorBody}`
    );
  }

  return response.json() as Promise<T>;
}

async function apiRequestRaw(
  path: string,
  options: RequestInit = {}
): Promise<Buffer> {
  const key = getApiKey();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "xi-api-key": key,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(
      `ElevenLabs API error (${response.status}): ${errorBody}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Text-to-Speech ─────────────────────────────────────────────────────────

/**
 * Generate speech audio from text using a specific voice.
 * Returns raw audio buffer (mp3 by default).
 */
export async function textToSpeech(options: TTSOptions): Promise<Buffer> {
  const {
    voiceId,
    text,
    modelId = MODELS.MULTILINGUAL_V2,
    voiceSettings,
    outputFormat = "mp3_44100_128",
  } = options;

  const settings: VoiceSettings = {
    ...DEFAULT_VOICE_SETTINGS,
    ...voiceSettings,
  };

  const audioBuffer = await apiRequestRaw(
    `/text-to-speech/${voiceId}?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          style: settings.style,
          use_speaker_boost: settings.use_speaker_boost,
        },
      }),
    }
  );

  return audioBuffer;
}

/**
 * Generate speech with streaming (returns a ReadableStream).
 * Useful for real-time playback.
 */
export async function textToSpeechStream(
  options: TTSOptions
): Promise<ReadableStream<Uint8Array>> {
  const key = getApiKey();
  const {
    voiceId,
    text,
    modelId = MODELS.TURBO_V2_5,
    voiceSettings,
    outputFormat = "mp3_44100_128",
  } = options;

  const settings: VoiceSettings = {
    ...DEFAULT_VOICE_SETTINGS,
    ...voiceSettings,
  };

  const response = await fetch(
    `${BASE_URL}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          style: settings.style,
          use_speaker_boost: settings.use_speaker_boost,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs streaming error (${response.status}): ${errorBody}`);
  }

  if (!response.body) {
    throw new Error("ElevenLabs streaming: no response body");
  }

  return response.body;
}

// ─── Voice Library ──────────────────────────────────────────────────────────

/**
 * List all voices in the user's library (premade + cloned).
 */
export async function listVoices(): Promise<ElevenLabsVoice[]> {
  const data = await apiRequest<{ voices: ElevenLabsVoice[] }>("/voices");
  return data.voices;
}

/**
 * Get a specific voice by ID.
 */
export async function getVoice(voiceId: string): Promise<ElevenLabsVoice> {
  return apiRequest<ElevenLabsVoice>(`/voices/${voiceId}`);
}

/**
 * Browse shared voices from the ElevenLabs voice library.
 * Useful for letting users pick character voices.
 */
export async function browseSharedVoices(options?: {
  gender?: "male" | "female";
  age?: "young" | "middle_aged" | "old";
  accent?: string;
  language?: string;
  use_case?: string;
  search?: string;
  page_size?: number;
  sort?: "trending" | "latest" | "most_users" | "most_characters";
}): Promise<SharedVoicesResponse> {
  const params = new URLSearchParams();
  if (options?.gender) params.set("gender", options.gender);
  if (options?.age) params.set("age", options.age);
  if (options?.accent) params.set("accent", options.accent);
  if (options?.language) params.set("language", options.language);
  if (options?.use_case) params.set("use_case", options.use_case);
  if (options?.search) params.set("search", options.search);
  if (options?.page_size) params.set("page_size", options.page_size.toString());
  if (options?.sort) params.set("sort", options.sort);

  const query = params.toString();
  return apiRequest<SharedVoicesResponse>(
    `/shared-voices${query ? `?${query}` : ""}`
  );
}

/**
 * Add a shared voice to the user's library.
 */
export async function addSharedVoice(
  publicUserId: string,
  voiceId: string,
  newName: string
): Promise<{ voice_id: string }> {
  return apiRequest<{ voice_id: string }>(
    `/voices/add/${publicUserId}/${voiceId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_name: newName }),
    }
  );
}

// ─── Voice Cloning ──────────────────────────────────────────────────────────

/**
 * Create an instant voice clone from audio samples.
 * Requires at least one audio file.
 */
export async function instantVoiceClone(options: {
  name: string;
  description?: string;
  audioUrls: string[];  // URLs to audio files
  labels?: Record<string, string>;
}): Promise<{ voice_id: string }> {
  const key = getApiKey();

  // Download audio files and create FormData
  const formData = new FormData();
  formData.append("name", options.name);
  if (options.description) {
    formData.append("description", options.description);
  }
  if (options.labels) {
    formData.append("labels", JSON.stringify(options.labels));
  }

  // Download each audio URL and add as file
  for (let i = 0; i < options.audioUrls.length; i++) {
    const audioResponse = await fetch(options.audioUrls[i]);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio from ${options.audioUrls[i]}`);
    }
    const audioBlob = await audioResponse.blob();
    formData.append("files", audioBlob, `sample_${i}.mp3`);
  }

  const response = await fetch(`${BASE_URL}/voices/add`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs clone error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<{ voice_id: string }>;
}

/**
 * Delete a cloned voice.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  await apiRequest(`/voices/${voiceId}`, { method: "DELETE" });
}

// ─── User Info ──────────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  tier: string;
  character_count: number;
  character_limit: number;
  can_extend_character_limit: boolean;
  allowed_to_extend: boolean;
  next_character_count_reset_unix: number;
  voice_limit: number;
  max_voice_add_edits: number;
  voice_add_edit_counter: number;
  professional_voice_limit: number;
  can_extend_voice_limit: boolean;
  can_use_instant_voice_cloning: boolean;
  can_use_professional_voice_cloning: boolean;
  currency: string;
  status: string;
}

/**
 * Get the current subscription info (useful for checking quotas).
 */
export async function getSubscription(): Promise<SubscriptionInfo> {
  return apiRequest<SubscriptionInfo>("/user/subscription");
}

/**
 * Get remaining character count for the current billing period.
 */
export async function getRemainingCharacters(): Promise<{
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}> {
  const sub = await getSubscription();
  const remaining = sub.character_limit - sub.character_count;
  return {
    used: sub.character_count,
    limit: sub.character_limit,
    remaining,
    percentUsed: Math.round((sub.character_count / sub.character_limit) * 100),
  };
}

// ─── Convenience: Generate & Upload ─────────────────────────────────────────

/**
 * Generate speech and upload to S3 storage.
 * Returns the S3 URL of the generated audio.
 */
export async function generateAndUploadVoice(options: {
  voiceId: string;
  text: string;
  storageKey: string;
  modelId?: string;
  voiceSettings?: Partial<VoiceSettings>;
}): Promise<{ url: string; key: string; durationEstimate: number }> {
  const { storagePut } = await import("./storage");

  const audioBuffer = await textToSpeech({
    voiceId: options.voiceId,
    text: options.text,
    modelId: options.modelId,
    voiceSettings: options.voiceSettings,
  });

  const { url, key } = await storagePut(
    options.storageKey,
    audioBuffer,
    "audio/mpeg"
  );

  // Rough estimate: ~150 words per minute, ~5 chars per word
  const wordCount = options.text.split(/\s+/).length;
  const durationEstimate = Math.max(1, Math.round((wordCount / 150) * 60));

  return { url, key, durationEstimate };
}
