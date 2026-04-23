/**
 * fal.ai Video Generation Module
 *
 * Drop-in replacement for kling.ts that routes Kling V3 video generation
 * through fal.ai's pay-as-you-go infrastructure. Provides the same interface
 * (imageToVideo, textToVideo, omniVideo, lip sync) but uses the @fal-ai/client
 * SDK instead of direct Kling API calls.
 *
 * Benefits over direct Kling API:
 * - Pay-as-you-go (no $4,200 prepaid deposit)
 * - Same pricing ($0.14/s Pro, $0.084/s Standard)
 * - Serverless queue with built-in retry
 * - No JWT token management
 */

import { fal } from "@fal-ai/client";
import { ENV } from "./_core/env";

// ─── Configuration ──────────────────────────────────────────────────────────

function ensureFalConfigured(): void {
  const key = ENV.falApiKey;
  if (!key) {
    throw new Error("FAL_API_KEY not configured. Get one from https://fal.ai/dashboard/keys");
  }
  fal.config({ credentials: key });
}

// ─── fal.ai Model Endpoints ────────────────────────────────────────────────

export const FAL_KLING_ENDPOINTS = {
  v3StandardI2V: "fal-ai/kling-video/v3/standard/image-to-video",
  v3StandardT2V: "fal-ai/kling-video/v3/standard/text-to-video",
  v3ProI2V: "fal-ai/kling-video/v3/pro/image-to-video",
  v3ProT2V: "fal-ai/kling-video/v3/pro/text-to-video",
  lipSyncAudio: "fal-ai/kling-video/lipsync/audio-to-video",
  lipSyncText: "fal-ai/kling-video/lipsync/text-to-video",
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FalImageToVideoParams {
  /** URL of the source manga/image panel */
  image: string;
  /** Optional end-frame image URL */
  imageTail?: string;
  /** Motion/animation prompt */
  prompt: string;
  /** Negative prompt */
  negativePrompt?: string;
  /** Video duration: "5" or "10" seconds */
  duration?: "5" | "10";
  /** Generation mode: "std" (standard) or "pro" (higher quality) */
  mode?: "std" | "pro";
  /** Whether to generate native audio */
  generateAudio?: boolean;
  /** CFG scale 0-1 */
  cfgScale?: number;
  /** Character consistency elements */
  elements?: FalElementInput[];
}

export interface FalTextToVideoParams {
  /** Text prompt describing the video */
  prompt: string;
  /** Negative prompt */
  negativePrompt?: string;
  /** Video duration: "5" or "10" seconds */
  duration?: "5" | "10";
  /** Generation mode */
  mode?: "std" | "pro";
  /** Whether to generate native audio */
  generateAudio?: boolean;
  /** CFG scale 0-1 */
  cfgScale?: number;
  /** Character consistency elements */
  elements?: FalElementInput[];
}

export interface FalOmniVideoParams {
  /** Text prompt — include dialogue in quotes for lip sync */
  prompt?: string;
  /** Multi-shot prompts for storyboard narration */
  multiPrompt?: Array<{ index: number; prompt: string; duration: string }>;
  /** Source image URL (for image-to-video) */
  imageUrl?: string;
  /** End frame image URL */
  endImageUrl?: string;
  /** Video duration: "3" to "15" */
  duration?: string;
  /** Generation mode */
  mode?: "std" | "pro";
  /** Whether to generate native audio (lip sync) */
  generateAudio?: boolean;
  /** Aspect ratio */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Multi-shot type */
  shotType?: "customize" | "intelligent";
  /** Character consistency elements */
  elements?: FalElementInput[];
  /** CFG scale */
  cfgScale?: number;
}

export interface FalLipSyncParams {
  /** URL of the source video (.mp4/.mov, 2-10s, 720p/1080p) */
  videoUrl: string;
  /** URL of the audio file (2-60s, ≤5MB) */
  audioUrl: string;
  /** Language: "zh" or "en" */
  language?: "zh" | "en";
  /** Voice speed: 0.8 to 2.0 */
  voiceSpeed?: number;
}

export interface FalElementInput {
  /** Front-facing reference image URL */
  frontalImageUrl: string;
  /** Additional reference image URLs */
  referenceImageUrls?: string[];
  /** Reference video URL (alternative to images) */
  videoUrl?: string;
}

export interface FalVideoResult {
  /** Public URL of the generated video */
  videoUrl: string;
  /** Content type */
  contentType: string;
  /** File size in bytes */
  fileSize?: number;
  /** fal.ai request ID (for tracking) */
  requestId: string;
}

// ─── Core Generation Functions ──────────────────────────────────────────────

/**
 * Image-to-video generation via fal.ai Kling V3.
 * Drop-in replacement for kling.imageToVideo().
 */
export async function falImageToVideo(
  params: FalImageToVideoParams
): Promise<FalVideoResult> {
  ensureFalConfigured();

  const endpoint = params.mode === "pro"
    ? FAL_KLING_ENDPOINTS.v3ProI2V
    : FAL_KLING_ENDPOINTS.v3StandardI2V;

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    start_image_url: params.image,
    duration: params.duration ?? "5",
    generate_audio: params.generateAudio ?? false,
  };

  if (params.imageTail) input.end_image_url = params.imageTail;
  if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
  if (params.cfgScale !== undefined) input.cfg_scale = params.cfgScale;
  if (params.elements?.length) {
    input.elements = params.elements.map(el => ({
      frontal_image_url: el.frontalImageUrl,
      reference_image_urls: el.referenceImageUrls ?? [],
      ...(el.videoUrl ? { video_url: el.videoUrl } : {}),
    }));
  }

  console.log(`[fal.ai] Submitting image-to-video (${params.mode ?? "std"}, ${params.duration ?? "5"}s)...`);

  const result = await fal.subscribe(endpoint as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
    onQueueUpdate: (update: any) => {
      if (update.status === "IN_PROGRESS") {
        update.logs?.forEach((log: { message: string }) =>
          console.log(`[fal.ai] ${log.message}`)
        );
      }
    },
  });

  const video = (result.data as any)?.video;
  if (!video?.url) {
    throw new Error(`[fal.ai] Image-to-video returned no video output`);
  }

  console.log(`[fal.ai] Video generated: ${video.url} (${video.file_size ?? "?"} bytes)`);

  return {
    videoUrl: video.url,
    contentType: video.content_type ?? "video/mp4",
    fileSize: video.file_size,
    requestId: (result as any).requestId ?? "",
  };
}

/**
 * Text-to-video generation via fal.ai Kling V3.
 * Drop-in replacement for kling.textToVideo().
 */
export async function falTextToVideo(
  params: FalTextToVideoParams
): Promise<FalVideoResult> {
  ensureFalConfigured();

  const endpoint = params.mode === "pro"
    ? FAL_KLING_ENDPOINTS.v3ProT2V
    : FAL_KLING_ENDPOINTS.v3StandardT2V;

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    duration: params.duration ?? "5",
    generate_audio: params.generateAudio ?? false,
  };

  if (params.negativePrompt) input.negative_prompt = params.negativePrompt;
  if (params.cfgScale !== undefined) input.cfg_scale = params.cfgScale;
  if (params.elements?.length) {
    input.elements = params.elements.map(el => ({
      frontal_image_url: el.frontalImageUrl,
      reference_image_urls: el.referenceImageUrls ?? [],
      ...(el.videoUrl ? { video_url: el.videoUrl } : {}),
    }));
  }

  console.log(`[fal.ai] Submitting text-to-video (${params.mode ?? "std"}, ${params.duration ?? "5"}s)...`);

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    pollInterval: 5000,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs?.forEach((log: { message: string }) =>
          console.log(`[fal.ai] ${log.message}`)
        );
      }
    },
  });

  const video = (result.data as any)?.video;
  if (!video?.url) {
    throw new Error(`[fal.ai] Text-to-video returned no video output`);
  }

  console.log(`[fal.ai] Video generated: ${video.url}`);

  return {
    videoUrl: video.url,
    contentType: video.content_type ?? "video/mp4",
    fileSize: video.file_size,
    requestId: (result as any).requestId ?? "",
  };
}

/**
 * Omni-video generation via fal.ai Kling V3 Pro with native audio + lip sync.
 * Drop-in replacement for kling.omniVideo() — uses the Pro image-to-video
 * endpoint with generate_audio=true for native lip sync.
 *
 * Note: fal.ai doesn't expose a separate "omni-video" endpoint. Instead,
 * we use the V3 Pro endpoint with generate_audio=true and elements for
 * character consistency, which achieves the same result.
 */
export async function falOmniVideo(
  params: FalOmniVideoParams
): Promise<FalVideoResult> {
  ensureFalConfigured();

  // Determine endpoint based on whether we have an image
  const isI2V = !!params.imageUrl;
  const endpoint = isI2V
    ? FAL_KLING_ENDPOINTS.v3ProI2V
    : FAL_KLING_ENDPOINTS.v3ProT2V;

  const input: Record<string, unknown> = {
    prompt: params.prompt ?? "",
    duration: params.duration ?? "10",
    generate_audio: params.generateAudio ?? true,
  };

  if (params.imageUrl) input.start_image_url = params.imageUrl;
  if (params.endImageUrl) input.end_image_url = params.endImageUrl;
  if (params.cfgScale !== undefined) input.cfg_scale = params.cfgScale;
  if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;

  // Multi-shot prompts
  if (params.multiPrompt?.length) {
    input.multi_prompt = params.multiPrompt.map(mp => ({
      index: mp.index,
      prompt: mp.prompt,
      duration: mp.duration,
    }));
    if (params.shotType) input.shot_type = params.shotType;
  }

  // Character consistency elements
  if (params.elements?.length) {
    input.elements = params.elements.map(el => ({
      frontal_image_url: el.frontalImageUrl,
      reference_image_urls: el.referenceImageUrls ?? [],
      ...(el.videoUrl ? { video_url: el.videoUrl } : {}),
    }));
  }

  console.log(`[fal.ai] Submitting omni-video (Pro, ${params.duration ?? "10"}s, audio=${params.generateAudio ?? true})...`);

  const result = await fal.subscribe(endpoint, {
    input,
    logs: true,
    pollInterval: 5000,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs?.forEach((log: { message: string }) =>
          console.log(`[fal.ai] ${log.message}`)
        );
      }
    },
  });

  const video = (result.data as any)?.video;
  if (!video?.url) {
    throw new Error(`[fal.ai] Omni-video returned no video output`);
  }

  console.log(`[fal.ai] Omni-video generated: ${video.url} (with audio)`);

  return {
    videoUrl: video.url,
    contentType: video.content_type ?? "video/mp4",
    fileSize: video.file_size,
    requestId: (result as any).requestId ?? "",
  };
}

/**
 * Audio-to-video lip sync via fal.ai Kling Lipsync endpoint.
 * Takes an existing video + audio file and syncs lip movements.
 */
export async function falLipSync(
  params: FalLipSyncParams
): Promise<FalVideoResult> {
  ensureFalConfigured();

  const input: Record<string, unknown> = {
    video_url: params.videoUrl,
    audio_url: params.audioUrl,
  } as any;

  if (params.language) input.language = params.language;
  if (params.voiceSpeed !== undefined) input.voice_speed = params.voiceSpeed;

  console.log(`[fal.ai] Submitting lip sync (lang=${params.language ?? "en"})...`);

  const result = await fal.subscribe(FAL_KLING_ENDPOINTS.lipSyncAudio as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
    onQueueUpdate: (update: any) => {
      if (update.status === "IN_PROGRESS") {
        update.logs?.forEach((log: { message: string }) =>
          console.log(`[fal.ai] ${log.message}`)
        );
      }
    },
  });

  const video = (result.data as any)?.video;
  if (!video?.url) {
    throw new Error(`[fal.ai] Lip sync returned no video output`);
  }

  console.log(`[fal.ai] Lip-synced video: ${video.url}`);

  return {
    videoUrl: video.url,
    contentType: video.content_type ?? "video/mp4",
    fileSize: video.file_size,
    requestId: (result as any).requestId ?? "",
  };
}

// ─── Adapter Bridge ─────────────────────────────────────────────────────────
// These functions provide a kling.ts-compatible interface for easy migration.

/**
 * Bridge: fal.ai image-to-video with kling.ts-compatible return shape.
 * Returns { videoUrl, videoId, duration, taskId } matching kling.generateVideoFromImage().
 */
export async function generateVideoFromImage(
  params: FalImageToVideoParams & {
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { onProgress, ...createParams } = params;
  const startTime = Date.now();

  if (onProgress) onProgress("submitted", 0);

  const result = await falImageToVideo(createParams);

  if (onProgress) onProgress("succeed", Date.now() - startTime);

  return {
    videoUrl: result.videoUrl,
    videoId: result.requestId,
    duration: params.duration ?? "5",
    taskId: result.requestId,
  };
}

/**
 * Bridge: fal.ai text-to-video with kling.ts-compatible return shape.
 */
export async function generateVideoFromText(
  params: FalTextToVideoParams & {
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { onProgress, ...createParams } = params;
  const startTime = Date.now();

  if (onProgress) onProgress("submitted", 0);

  const result = await falTextToVideo(createParams);

  if (onProgress) onProgress("succeed", Date.now() - startTime);

  return {
    videoUrl: result.videoUrl,
    videoId: result.requestId,
    duration: params.duration ?? "5",
    taskId: result.requestId,
  };
}

/**
 * Bridge: fal.ai omni-video with kling.ts-compatible return shape.
 */
export async function generateOmniVideo(
  params: FalOmniVideoParams & {
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { onProgress, ...createParams } = params;
  const startTime = Date.now();

  if (onProgress) onProgress("submitted", 0);

  const result = await falOmniVideo(createParams);

  if (onProgress) onProgress("succeed", Date.now() - startTime);

  return {
    videoUrl: result.videoUrl,
    videoId: result.requestId,
    duration: params.duration ?? "10",
    taskId: result.requestId,
  };
}

// ─── Provider Selection ─────────────────────────────────────────────────────

export type VideoProvider = "fal" | "kling_direct";

/**
 * Get the active video generation provider.
 * Defaults to fal.ai. Falls back to direct Kling API if FAL_API_KEY is missing.
 */
export function getActiveVideoProvider(): VideoProvider {
  if (ENV.falApiKey) return "fal";
  if (ENV.klingAccessKey && ENV.klingSecretKey) return "kling_direct";
  throw new Error("No video generation provider configured. Set FAL_API_KEY or KLING_ACCESS_KEY + KLING_SECRET_KEY.");
}

/**
 * Check if fal.ai is available as the video provider.
 */
export function isFalAvailable(): boolean {
  return !!ENV.falApiKey;
}
