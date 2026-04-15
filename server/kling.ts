/**
 * Kling AI Service Module
 * Provides image-to-video, text-to-video, omni-video (V3 Omni with native lip sync),
 * task polling, and account info.
 * Uses JWT (HS256) authentication with access key / secret key.
 */

import { ENV } from "./_core/env";

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_URL = "https://api-singapore.klingai.com";
const TOKEN_TTL_SECONDS = 1800; // 30 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

export interface KlingImageToVideoParams {
  /** URL of the source manga/image panel */
  image: string;
  /** Optional end-frame image URL for controlled transitions */
  imageTail?: string;
  /** Motion/animation prompt (max 2500 chars) */
  prompt: string;
  /** Negative prompt to avoid unwanted elements */
  negativePrompt?: string;
  /** Video duration: "5" or "10" seconds */
  duration?: "5" | "10";
  /** Generation mode: "std" (standard) or "pro" (higher quality) */
  mode?: "std" | "pro";
  /** Model version */
  modelName?: string;
  /** Whether to generate sound */
  sound?: "on" | "off";
  /** Flexibility: 0-1, higher = more prompt adherence */
  cfgScale?: number;
  /** Optional callback URL for async notification */
  callbackUrl?: string;
  /** Optional external task ID for tracking */
  externalTaskId?: string;
}

export interface KlingTextToVideoParams {
  /** Text prompt describing the video */
  prompt: string;
  /** Negative prompt */
  negativePrompt?: string;
  /** Video duration: "5" or "10" seconds */
  duration?: "5" | "10";
  /** Generation mode */
  mode?: "std" | "pro";
  /** Model version */
  modelName?: string;
  /** Whether to generate sound */
  sound?: "on" | "off";
  /** Flexibility: 0-1 */
  cfgScale?: number;
  /** Optional callback URL */
  callbackUrl?: string;
  /** Optional external task ID */
  externalTaskId?: string;
}

/**
 * Kling V3 Omni Video parameters.
 * Uses the unified /v1/videos/omni-video endpoint with native audio + lip sync.
 * Supports image-to-video, text-to-video, multi-shot storyboard, and element references.
 */
export interface KlingOmniVideoParams {
  /** Text prompt — include character dialogue in quotes for native lip sync */
  prompt?: string;
  /** Model: "kling-video-o1" (default) or "kling-v3-omni" */
  modelName?: "kling-video-o1" | "kling-v3-omni";
  /** Enable native audio + lip sync generation */
  sound?: "on" | "off";
  /** Video duration in seconds: "3" to "15" */
  duration?: string;
  /** Generation mode: "std" or "pro" */
  mode?: "std" | "pro";
  /** Aspect ratio */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  /** Enable multi-shot storyboard narration */
  multiShot?: boolean;
  /** Shot type when multiShot is true */
  shotType?: "customize" | "intelligence";
  /** Multi-shot prompts: array of {index, prompt, duration} */
  multiPrompt?: Array<{ index: number; prompt: string; duration: string }>;
  /** Reference images */
  imageList?: Array<{ image_url: string; type?: "first_frame" | "end_frame" }>;
  /** Element references for character consistency */
  elementList?: Array<{ element_id: number }>;
  /** Reference videos */
  videoList?: Array<{ video_url: string; refer_type?: "feature" | "base"; keep_original_sound?: "yes" | "no" }>;
  /** Optional callback URL */
  callbackUrl?: string;
  /** Optional external task ID */
  externalTaskId?: string;
}

export interface KlingTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_info?: {
      external_task_id?: string;
    };
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    created_at: number;
    updated_at: number;
  };
}

export interface KlingVideoResult {
  id: string;
  url: string;
  watermark_url?: string;
  duration: string;
}

export interface KlingTaskQueryResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_info?: {
      external_task_id?: string;
    };
    task_result?: {
      videos: KlingVideoResult[];
    };
    created_at: number;
    updated_at: number;
  };
}

export interface KlingAccountInfo {
  code: number;
  message: string;
  data: {
    id?: string;
    balance?: number;
    [key: string]: unknown;
  };
}

// ─── JWT Token Generation ────────────────────────────────────────────────────

/**
 * Generate a JWT token for Kling AI API authentication.
 * Uses HS256 with the access key as issuer and secret key for signing.
 */
async function generateToken(): Promise<string> {
  const accessKey = ENV.klingAccessKey;
  const secretKey = ENV.klingSecretKey;

  if (!accessKey || !secretKey) {
    throw new Error("Kling AI credentials not configured (KLING_ACCESS_KEY, KLING_SECRET_KEY)");
  }

  // Build JWT manually using Web Crypto API (no external dependency)
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: accessKey,
    exp: now + TOKEN_TTL_SECONDS,
    nbf: now - 5,
    iat: now,
  };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  // Use Node.js crypto for HMAC-SHA256
  const { createHmac } = await import("crypto");
  const signature = createHmac("sha256", secretKey)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

async function klingRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 30000
): Promise<T> {
  const token = await generateToken();
  const url = `${BASE_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kling API ${method} ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    const json = (await res.json()) as T;
    return json;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create an image-to-video generation task.
 * This is the core manga-to-anime conversion endpoint.
 */
export async function imageToVideo(
  params: KlingImageToVideoParams
): Promise<KlingTaskResponse> {
  const body: Record<string, unknown> = {
    model_name: params.modelName ?? "kling-v2-6",
    image: params.image,
    prompt: params.prompt,
    duration: params.duration ?? "5",
    mode: params.mode ?? "pro",
    sound: params.sound ?? "off",
  };

  if (params.imageTail) body.image_tail = params.imageTail;
  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.cfgScale !== undefined) body.cfg_scale = params.cfgScale;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.externalTaskId) body.external_task_id = params.externalTaskId;

  return klingRequest<KlingTaskResponse>("POST", "/v1/videos/image2video", body);
}

/**
 * Create a text-to-video generation task.
 * Useful for generating establishing shots or transitions from text descriptions.
 */
export async function textToVideo(
  params: KlingTextToVideoParams
): Promise<KlingTaskResponse> {
  const body: Record<string, unknown> = {
    model_name: params.modelName ?? "kling-v2-6",
    prompt: params.prompt,
    duration: params.duration ?? "5",
    mode: params.mode ?? "std",
    sound: params.sound ?? "off",
  };

  if (params.negativePrompt) body.negative_prompt = params.negativePrompt;
  if (params.cfgScale !== undefined) body.cfg_scale = params.cfgScale;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.externalTaskId) body.external_task_id = params.externalTaskId;

  return klingRequest<KlingTaskResponse>("POST", "/v1/videos/text2video", body);
}

/**
 * Query the status of a video generation task.
 * Poll this endpoint until task_status is "succeed" or "failed".
 */
export async function queryTask(
  taskId: string,
  type: "image2video" | "text2video" | "omni-video" = "image2video"
): Promise<KlingTaskQueryResponse> {
  return klingRequest<KlingTaskQueryResponse>("GET", `/v1/videos/${type}/${taskId}`);
}

/**
 * Poll a task until completion with exponential backoff.
 * Returns the final task result or throws on failure/timeout.
 */
export async function pollTaskUntilDone(
  taskId: string,
  options: {
    type?: "image2video" | "text2video" | "omni-video";
    maxWaitMs?: number;
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    onProgress?: (status: string, elapsed: number) => void;
  } = {}
): Promise<KlingTaskQueryResponse> {
  const {
    type = "image2video",
    maxWaitMs = 10 * 60 * 1000, // 10 minutes max
    initialIntervalMs = 5000,
    maxIntervalMs = 30000,
    onProgress,
  } = options;

  const startTime = Date.now();
  let interval = initialIntervalMs;

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > maxWaitMs) {
      throw new Error(`Kling task ${taskId} timed out after ${Math.round(elapsed / 1000)}s`);
    }

    const result = await queryTask(taskId, type);
    const status = result.data?.task_status;

    if (onProgress) {
      onProgress(status, elapsed);
    }

    if (status === "succeed") {
      return result;
    }

    if (status === "failed") {
      throw new Error(
        `Kling task ${taskId} failed: ${result.data?.task_status_msg ?? "unknown error"}`
      );
    }

    // Wait with exponential backoff
    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * 1.5, maxIntervalMs);
  }
}

/**
 * Full image-to-video pipeline: submit task → poll → return video URL.
 * This is the main function for manga-to-anime conversion.
 */
export async function generateVideoFromImage(
  params: KlingImageToVideoParams & {
    maxWaitMs?: number;
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { maxWaitMs, onProgress, ...createParams } = params;

  // Step 1: Submit the task
  const createResult = await imageToVideo(createParams);
  if (createResult.code !== 0) {
    throw new Error(`Kling image2video creation failed: ${createResult.message}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling] Image-to-video task created: ${taskId}`);

  // Step 2: Poll until done
  const finalResult = await pollTaskUntilDone(taskId, {
    type: "image2video",
    maxWaitMs,
    onProgress,
  });

  // Step 3: Extract video URL
  const videos = finalResult.data?.task_result?.videos;
  if (!videos || videos.length === 0) {
    throw new Error(`Kling task ${taskId} succeeded but returned no videos`);
  }

  const video = videos[0];
  console.log(`[Kling] Video generated: ${video.url} (${video.duration}s)`);

  return {
    videoUrl: video.url,
    videoId: video.id,
    duration: video.duration,
    taskId,
  };
}

/**
 * Full text-to-video pipeline: submit task → poll → return video URL.
 * Useful for generating transitions, establishing shots, or abstract sequences.
 */
export async function generateVideoFromText(
  params: KlingTextToVideoParams & {
    maxWaitMs?: number;
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { maxWaitMs, onProgress, ...createParams } = params;

  const createResult = await textToVideo(createParams);
  if (createResult.code !== 0) {
    throw new Error(`Kling text2video creation failed: ${createResult.message}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling] Text-to-video task created: ${taskId}`);

  const finalResult = await pollTaskUntilDone(taskId, {
    type: "text2video",
    maxWaitMs,
    onProgress,
  });

  const videos = finalResult.data?.task_result?.videos;
  if (!videos || videos.length === 0) {
    throw new Error(`Kling task ${taskId} succeeded but returned no videos`);
  }

  const video = videos[0];
  console.log(`[Kling] Video generated: ${video.url} (${video.duration}s)`);

  return {
    videoUrl: video.url,
    videoId: video.id,
    duration: video.duration,
    taskId,
  };
}

/**
 * Create an Omni-Video generation task using Kling V3 Omni.
 * This is the unified endpoint that handles image-to-video, text-to-video,
 * multi-shot storyboard, and native audio with lip sync — all in one call.
 *
 * Key features over image2video/text2video:
 * - Native audio-visual synchronization (lip sync built in)
 * - Duration up to 15 seconds (vs 10s on v2.6)
 * - Multi-shot storyboard narration
 * - Element/character consistency references
 */
export async function omniVideo(
  params: KlingOmniVideoParams
): Promise<KlingTaskResponse> {
  const body: Record<string, unknown> = {
    model_name: params.modelName ?? "kling-video-o1",
    sound: params.sound ?? "on",
    duration: params.duration ?? "5",
    mode: params.mode ?? "pro",
  };

  if (params.prompt) body.prompt = params.prompt;
  if (params.aspectRatio) body.aspect_ratio = params.aspectRatio;
  if (params.multiShot !== undefined) body.multi_shot = params.multiShot;
  if (params.shotType) body.shot_type = params.shotType;
  if (params.multiPrompt) body.multi_prompt = params.multiPrompt;
  if (params.imageList) body.image_list = params.imageList;
  if (params.elementList) body.element_list = params.elementList;
  if (params.videoList) body.video_list = params.videoList;
  if (params.callbackUrl) body.callback_url = params.callbackUrl;
  if (params.externalTaskId) body.external_task_id = params.externalTaskId;

  return klingRequest<KlingTaskResponse>("POST", "/v1/videos/omni-video", body);
}

/**
 * Full Omni-Video pipeline: submit task → poll → return video URL.
 * Generates video with native audio and lip sync in a single pass.
 */
export async function generateOmniVideo(
  params: KlingOmniVideoParams & {
    maxWaitMs?: number;
    onProgress?: (status: string, elapsed: number) => void;
  }
): Promise<{ videoUrl: string; videoId: string; duration: string; taskId: string }> {
  const { maxWaitMs, onProgress, ...createParams } = params;

  const createResult = await omniVideo(createParams);
  if (createResult.code !== 0) {
    throw new Error(`Kling omni-video creation failed: ${createResult.message}`);
  }

  const taskId = createResult.data.task_id;
  console.log(`[Kling] Omni-video task created: ${taskId} (sound: ${createParams.sound ?? "on"})`);

  const finalResult = await pollTaskUntilDone(taskId, {
    type: "omni-video",
    maxWaitMs: maxWaitMs ?? 12 * 60 * 1000, // 12 min default (longer for omni)
    onProgress,
  });

  const videos = finalResult.data?.task_result?.videos;
  if (!videos || videos.length === 0) {
    throw new Error(`Kling omni-video task ${taskId} succeeded but returned no videos`);
  }

  const video = videos[0];
  console.log(`[Kling] Omni-video generated: ${video.url} (${video.duration}s, with audio)`);

  return {
    videoUrl: video.url,
    videoId: video.id,
    duration: video.duration,
    taskId,
  };
}

/**
 * Get account info to validate API keys and check balance.
 */
export async function getAccountInfo(): Promise<KlingAccountInfo> {
  return klingRequest<KlingAccountInfo>("GET", "/v1/account/info");
}

/**
 * Validate that the Kling AI credentials are configured and working.
 */
export async function validateCredentials(): Promise<{
  valid: boolean;
  accountInfo?: KlingAccountInfo["data"];
  error?: string;
}> {
  try {
    const info = await getAccountInfo();
    if (info.code === 0) {
      return { valid: true, accountInfo: info.data };
    }
    return { valid: false, error: `API returned code ${info.code}: ${info.message}` };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
