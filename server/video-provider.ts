/**
 * Video Provider Abstraction Layer
 *
 * Routes video generation requests through fal.ai (primary) with fallback
 * to direct Kling API. Both backends return a unified VideoGenerationResult.
 *
 * Key difference:
 * - fal.ai: synchronous subscribe (polls internally, returns final result)
 * - Direct Kling: async submit + manual polling (returns task_id, caller polls)
 *
 * This layer normalises both into a single async call that returns the video URL.
 */

import {
  falTextToVideo, falImageToVideo, falOmniVideo, falLipSync,
  isFalAvailable,
  type FalTextToVideoParams,
  type FalImageToVideoParams,
  type FalOmniVideoParams,
  type FalLipSyncParams,
  type FalVideoResult,
} from "./fal-video";
import { imageToVideo, omniVideo, queryTask } from "./kling";

// ─── Unified Result ─────────────────────────────────────────────────────────

export interface VideoGenerationResult {
  videoUrl: string;
  durationSeconds: number;
  provider: "fal.ai" | "kling_direct";
  model: string;
  requestId?: string;
  hasAudio?: boolean;
  hasLipSync?: boolean;
}

// ─── Provider Selection ─────────────────────────────────────────────────────

type ProviderBackend = "fal.ai" | "kling_direct";

function selectProvider(): ProviderBackend {
  if (isFalAvailable()) return "fal.ai";
  return "kling_direct";
}

// ─── Kling Direct Polling Helper ────────────────────────────────────────────

async function pollKlingTask(
  taskId: string,
  taskType: "image2video" | "text2video" | "omni-video",
  maxPollMs = 10 * 60 * 1000,
  intervalMs = 8000,
): Promise<{ videoUrl: string; duration: number }> {
  const start = Date.now();
  let interval = intervalMs;

  while (Date.now() - start < maxPollMs) {
    const status = await queryTask(taskId, taskType);
    if (status.data?.task_status === "succeed") {
      const video = status.data.task_result?.videos?.[0];
      if (video?.url) {
        return { videoUrl: video.url, duration: Number(video.duration) || 10 };
      }
      throw new Error(`[kling_direct] Task succeeded but no video URL in result`);
    }
    if (status.data?.task_status === "failed") {
      throw new Error(`[kling_direct] Task ${taskId} failed: ${status.data?.task_status_msg || "unknown"}`);
    }
    await new Promise(r => setTimeout(r, interval));
    interval = Math.min(interval * 1.2, 15000); // gradual backoff
  }
  throw new Error(`[kling_direct] Task ${taskId} timed out after ${maxPollMs / 1000}s`);
}

// ─── Omni Video (Tier 1: Dialogue + Lip Sync) ──────────────────────────────

export interface OmniVideoRequest {
  prompt: string;
  imageUrl: string;
  elementList?: Array<{ element_id: number }>;
  sound?: "on" | "off";
  duration?: "5" | "10";
  mode?: "std" | "pro";
  aspectRatio?: string;
}

export async function generateOmniVideo(req: OmniVideoRequest): Promise<VideoGenerationResult> {
  const backend = selectProvider();
  console.log(`[video-provider] Omni video via ${backend}`);

  if (backend === "fal.ai") {
    try {
      const params: FalOmniVideoParams = {
        prompt: req.prompt,
        imageUrl: req.imageUrl,
        duration: req.duration ?? "10",
        mode: req.mode ?? "pro",
        generateAudio: req.sound === "on",
        aspectRatio: (req.aspectRatio ?? "16:9") as "16:9" | "9:16" | "1:1",
        elements: req.elementList?.map(el => ({
          frontalImageUrl: String(el.element_id),
        })),
      };
      const result = await falOmniVideo(params);
      return {
        videoUrl: result.videoUrl,
        durationSeconds: parseInt(req.duration ?? "10"),
        provider: "fal.ai",
        model: "kling-v3-omni",
        requestId: result.requestId,
        hasAudio: req.sound === "on",
        hasLipSync: true,
      };
    } catch (err) {
      console.warn(`[video-provider] fal.ai omni failed, falling back to kling_direct:`, err);
      // Fall through to direct Kling
    }
  }

  // Direct Kling fallback
  const result = await omniVideo({
    prompt: req.prompt,
    imageList: [{ image_url: req.imageUrl, type: "first_frame" }],
    elementList: req.elementList,
    sound: req.sound ?? "on",
    duration: req.duration ?? "10",
    mode: req.mode ?? "pro",
    modelName: "kling-video-o1",
    aspectRatio: (req.aspectRatio ?? "16:9") as "16:9" | "9:16" | "1:1",
  });

  if (result.code !== 0 || !result.data?.task_id) {
    throw new Error(`[kling_direct] Omni submission failed: code=${result.code}`);
  }

  const polled = await pollKlingTask(result.data.task_id, "omni-video");
  return {
    videoUrl: polled.videoUrl,
    durationSeconds: polled.duration,
    provider: "kling_direct",
    model: "kling-v3-omni",
    hasAudio: req.sound === "on",
    hasLipSync: true,
  };
}

// ─── Image-to-Video (Tier 2/3/4: Visual scenes) ────────────────────────────

export interface ImageToVideoRequest {
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  duration?: "5" | "10";
  mode?: "std" | "pro";
  modelName?: string;
}

export async function generateImageToVideo(req: ImageToVideoRequest): Promise<VideoGenerationResult> {
  const backend = selectProvider();
  console.log(`[video-provider] Image-to-video via ${backend}`);

  if (backend === "fal.ai") {
    try {
      const params: FalImageToVideoParams = {
        image: req.imageUrl,
        prompt: req.prompt,
        duration: req.duration ?? "10",
        mode: req.mode ?? "pro",
        negativePrompt: req.negativePrompt,
      };
      const result = await falImageToVideo(params);
      return {
        videoUrl: result.videoUrl,
        durationSeconds: parseInt(req.duration ?? "10"),
        provider: "fal.ai",
        model: `kling-v3-${req.mode ?? "pro"}`,
        requestId: result.requestId,
        hasAudio: false,
        hasLipSync: false,
      };
    } catch (err) {
      console.warn(`[video-provider] fal.ai i2v failed, falling back to kling_direct:`, err);
    }
  }

  // Direct Kling fallback
  const result = await imageToVideo({
    image: req.imageUrl,
    prompt: req.prompt,
    negativePrompt: req.negativePrompt ?? "static, still image, blurry, low quality, distorted",
    duration: req.duration ?? "10",
    mode: req.mode ?? "pro",
    modelName: req.modelName,
  });

  if (result.code !== 0 || !result.data?.task_id) {
    throw new Error(`[kling_direct] Image2Video submission failed: code=${result.code}`);
  }

  const polled = await pollKlingTask(result.data.task_id, "image2video");
  return {
    videoUrl: polled.videoUrl,
    durationSeconds: polled.duration,
    provider: "kling_direct",
    model: `kling-${req.modelName ?? "v3"}-${req.mode ?? "pro"}`,
    hasAudio: false,
    hasLipSync: false,
  };
}

// ─── Text-to-Video ──────────────────────────────────────────────────────────

export interface TextToVideoRequest {
  prompt: string;
  negativePrompt?: string;
  duration?: "5" | "10";
  mode?: "std" | "pro";
}

export async function generateTextToVideo(req: TextToVideoRequest): Promise<VideoGenerationResult> {
  const backend = selectProvider();
  console.log(`[video-provider] Text-to-video via ${backend}`);

  if (backend === "fal.ai") {
    try {
      const params: FalTextToVideoParams = {
        prompt: req.prompt,
        duration: req.duration ?? "10",
        mode: req.mode ?? "pro",
        negativePrompt: req.negativePrompt,
      };
      const result = await falTextToVideo(params);
      return {
        videoUrl: result.videoUrl,
        durationSeconds: parseInt(req.duration ?? "10"),
        provider: "fal.ai",
        model: `kling-v3-${req.mode ?? "pro"}`,
        requestId: result.requestId,
        hasAudio: false,
        hasLipSync: false,
      };
    } catch (err) {
      console.warn(`[video-provider] fal.ai t2v failed, falling back to kling_direct:`, err);
    }
  }

  // No direct Kling fallback for text-to-video in the current pipeline
  throw new Error(`[video-provider] Text-to-video failed on all backends`);
}

// ─── Lip Sync (Post-process) ────────────────────────────────────────────────

export interface LipSyncRequest {
  videoUrl: string;
  audioUrl: string;
  language?: string;
}

export async function generateLipSync(req: LipSyncRequest): Promise<VideoGenerationResult> {
  const backend = selectProvider();
  console.log(`[video-provider] Lip sync via ${backend}`);

  if (backend === "fal.ai") {
    try {
      const params: FalLipSyncParams = {
        videoUrl: req.videoUrl,
        audioUrl: req.audioUrl,
        language: (req.language ?? "en") as "en" | "zh",
      };
      const result = await falLipSync(params);
      return {
        videoUrl: result.videoUrl,
        durationSeconds: 10,
        provider: "fal.ai",
        model: "kling-lipsync",
        requestId: result.requestId,
        hasAudio: true,
        hasLipSync: true,
      };
    } catch (err) {
      console.warn(`[video-provider] fal.ai lip sync failed:`, err);
    }
  }

  throw new Error(`[video-provider] Lip sync failed on all backends`);
}

// ─── Utility: Get current provider info ─────────────────────────────────────

export function getCurrentVideoProvider(): { backend: ProviderBackend; available: boolean } {
  const backend = selectProvider();
  return { backend, available: true };
}
