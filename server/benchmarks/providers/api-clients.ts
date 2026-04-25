/**
 * Shared API Client Helpers for Benchmark Providers
 *
 * Real HTTP implementations for every provider used in the benchmark.
 * Each function returns { url, queueTimeMs?, generationTimeMs? }.
 *
 * These are standalone — they do NOT import from server/_core or the
 * main app modules, so they can run independently via the CLI.
 */

import { fal } from "@fal-ai/client";
import Replicate from "replicate";
import { storagePut } from "../../storage.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GenerationOutput {
  url: string;
  queueTimeMs?: number;
  generationTimeMs?: number;
}

// ─── fal.ai Configuration ───────────────────────────────────────────────────

let falConfigured = false;
function ensureFalConfigured(): void {
  if (falConfigured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY not set");
  fal.config({ credentials: key });
  falConfigured = true;
}

// ─── Kling JWT Auth (for Direct API) ────────────────────────────────────────

async function generateKlingJwt(): Promise<string> {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("KLING_ACCESS_KEY / KLING_SECRET_KEY not set");

  const { createHmac } = await import("crypto");
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5, iat: now };

  const encode = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signature = createHmac("sha256", secretKey)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

async function klingDirectRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  timeoutMs = 30000
): Promise<T> {
  const token = await generateKlingJwt();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api-singapore.klingai.com${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kling ${method} ${path}: ${res.status} — ${text}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface KlingTaskResp {
  code: number;
  message: string;
  data: {
    task_id: string;
    task_status: string;
    task_status_msg?: string;
    task_result?: { videos: Array<{ id: string; url: string; duration: string }> };
  };
}

async function klingPollUntilDone(
  taskId: string,
  type: "image2video" | "text2video" | "omni-video",
  maxWaitMs = 10 * 60 * 1000
): Promise<KlingTaskResp> {
  const start = Date.now();
  let interval = 5000;
  while (true) {
    if (Date.now() - start > maxWaitMs) throw new Error(`Kling task ${taskId} timed out`);
    const r = await klingDirectRequest<KlingTaskResp>("GET", `/v1/videos/${type}/${taskId}`);
    if (r.data.task_status === "succeed") return r;
    if (r.data.task_status === "failed") throw new Error(`Kling task failed: ${r.data.task_status_msg}`);
    await new Promise((resolve) => setTimeout(resolve, interval));
    interval = Math.min(interval * 1.5, 30000);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION
// ═══════════════════════════════════════════════════════════════════════════

// ─── Kling V3 Omni via fal.ai ──────────────────────────────────────────────

export async function klingOmniViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: string;
  audio: boolean;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    duration: params.duration,
    generate_audio: params.audio,
  };
  if (params.imageUrl) input.start_image_url = params.imageUrl;

  const result = await fal.subscribe("fal-ai/kling-video/v3/pro/image-to-video" as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Kling Omni returned no video");

  return {
    url: video.url,
    generationTimeMs: Date.now() - start,
  };
}

// ─── Kling V3 Omni via Atlas Cloud ──────────────────────────────────────────

export async function klingOmniViaAtlas(params: {
  imageUrl?: string;
  prompt: string;
  duration: string;
  audio: boolean;
}): Promise<GenerationOutput> {
  const apiKey = process.env.ATLAS_CLOUD_API_KEY;
  if (!apiKey) throw new Error("ATLAS_CLOUD_API_KEY not set");
  const start = Date.now();

  // Atlas Cloud uses an OpenAI-compatible video generation endpoint
  const body: Record<string, unknown> = {
    model: "kling-video/v3/pro/image-to-video",
    prompt: params.prompt,
    duration: params.duration,
    generate_audio: params.audio,
  };
  if (params.imageUrl) body.start_image_url = params.imageUrl;

  const submitResp = await fetch("https://api.atlascloud.ai/v1/video/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!submitResp.ok) {
    const err = await submitResp.text().catch(() => "");
    throw new Error(`Atlas Cloud submit failed: ${submitResp.status} — ${err}`);
  }

  const submitData = (await submitResp.json()) as any;
  const taskId = submitData.id ?? submitData.task_id ?? submitData.data?.id;
  if (!taskId) throw new Error("Atlas Cloud: no task ID in response");

  // Poll for completion
  const maxWait = 10 * 60 * 1000;
  let interval = 5000;
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    const pollResp = await fetch(`https://api.atlascloud.ai/v1/video/generations/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!pollResp.ok) continue;
    const pollData = (await pollResp.json()) as any;
    const status = pollData.status ?? pollData.data?.status;
    if (status === "succeeded" || status === "completed") {
      const videoUrl = pollData.output?.url ?? pollData.data?.output?.url ?? pollData.video_url ?? pollData.url;
      if (!videoUrl) throw new Error("Atlas Cloud: succeeded but no video URL");
      return { url: videoUrl, generationTimeMs: Date.now() - start };
    }
    if (status === "failed") throw new Error(`Atlas Cloud task failed: ${JSON.stringify(pollData)}`);
    interval = Math.min(interval * 1.5, 30000);
  }
  throw new Error("Atlas Cloud: timed out");
}

// ─── Kling V3 Omni via Direct API ──────────────────────────────────────────

export async function klingOmniViaDirect(params: {
  imageUrl?: string;
  prompt: string;
  duration: string;
  audio: boolean;
}): Promise<GenerationOutput> {
  const start = Date.now();

  const body: Record<string, unknown> = {
    model_name: "kling-video-o1",
    prompt: params.prompt,
    duration: params.duration,
    mode: "pro",
    sound: params.audio ? "on" : "off",
  };
  if (params.imageUrl) {
    body.image_list = [{ image_url: params.imageUrl, type: "first_frame" }];
  }

  const createResp = await klingDirectRequest<KlingTaskResp>("POST", "/v1/videos/omni-video", body);
  if (createResp.code !== 0) throw new Error(`Kling direct omni failed: ${createResp.message}`);

  const taskId = createResp.data.task_id;
  const finalResp = await klingPollUntilDone(taskId, "omni-video");
  const videos = finalResp.data.task_result?.videos;
  if (!videos?.length) throw new Error("Kling direct omni: no videos returned");

  return { url: videos[0].url, generationTimeMs: Date.now() - start };
}

// ─── Kling V3 Standard via fal.ai ──────────────────────────────────────────

export async function klingStandardViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    duration: params.duration,
    generate_audio: false,
  };
  if (params.imageUrl) input.start_image_url = params.imageUrl;

  const result = await fal.subscribe("fal-ai/kling-video/v3/standard/image-to-video" as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Kling Standard returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── Wan 2.2 via fal.ai ────────────────────────────────────────────────────

export async function wan22ViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: number;
  resolution?: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  // Calculate num_frames: 16fps × duration, clamped 17-161
  const numFrames = Math.min(161, Math.max(17, Math.round(16 * params.duration)));

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    num_frames: numFrames,
    frames_per_second: 16,
    resolution: params.resolution ?? "720p",
    aspect_ratio: "16:9",
    num_inference_steps: 27,
    enable_prompt_expansion: false,
    acceleration: "regular",
    guidance_scale: 3.5,
    interpolator_model: "film",
    num_interpolated_frames: 1,
    adjust_fps_for_interpolation: true,
    video_quality: "high",
  };
  if (params.imageUrl) input.image_url = params.imageUrl;

  const result = await fal.subscribe("fal-ai/wan/v2.2-a14b/image-to-video" as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Wan 2.2 returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── Wan 2.2 via Replicate ──────────────────────────────────────────────────

export async function wan22ViaReplicate(params: {
  imageUrl?: string;
  prompt: string;
  duration: number;
}): Promise<GenerationOutput> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) throw new Error("REPLICATE_API_TOKEN not set");
  const start = Date.now();

  const replicate = new Replicate({ auth: apiToken });

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    sample_steps: 30,
  };
  if (params.imageUrl) input.image = params.imageUrl;

  const output = await replicate.run("wan-video/wan-2.2-i2v-a14b", { input });

  // Replicate returns a FileOutput object with .url()
  let videoUrl: string;
  if (output && typeof output === "object" && "url" in output && typeof (output as any).url === "function") {
    videoUrl = (output as any).url();
  } else if (typeof output === "string") {
    videoUrl = output;
  } else {
    throw new Error(`Replicate Wan 2.2: unexpected output type: ${typeof output}`);
  }

  return { url: videoUrl, generationTimeMs: Date.now() - start };
}

// ─── Wan 2.5 via fal.ai ────────────────────────────────────────────────────

export async function wan25ViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: number;
  resolution?: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    resolution: params.resolution ?? "1080p",
    duration: String(Math.min(10, Math.max(5, params.duration))), // "5" or "10"
    aspect_ratio: "16:9",
    negative_prompt: "low resolution, error, worst quality, low quality, defects, blurry",
    enable_prompt_expansion: false,
    enable_safety_checker: false,
  };
  if (params.imageUrl) input.image_url = params.imageUrl;

  // Use text-to-video or image-to-video based on whether an image is provided
  const modelId = params.imageUrl
    ? "fal-ai/wan-25-preview/image-to-video"
    : "fal-ai/wan-25-preview/text-to-video";

  const result = await fal.subscribe(modelId as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Wan 2.5 returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── Wan 2.7 via fal.ai ───────────────────────────────────────────────────

export async function wan27ViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: number;
  resolution?: string;
  audioUrl?: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    resolution: params.resolution ?? "720p",
    duration: Math.min(15, Math.max(2, params.duration)), // number 2-15
    aspect_ratio: "16:9",
    negative_prompt: "low resolution, error, worst quality, low quality, defects, blurry",
    enable_prompt_expansion: false,
    enable_safety_checker: false,
  };
  if (params.imageUrl) input.image_url = params.imageUrl;
  if (params.audioUrl) input.audio_url = params.audioUrl;

  const modelId = params.imageUrl
    ? "fal-ai/wan/v2.7/image-to-video"
    : "fal-ai/wan/v2.7/text-to-video";

  const result = await fal.subscribe(modelId as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Wan 2.7 returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── Veo 3.1 Lite via fal.ai ──────────────────────────────────────────────

export async function veo31LiteViaFal(params: {
  imageUrl: string;
  prompt: string;
  duration?: "4s" | "6s" | "8s";
  resolution?: "720p" | "1080p";
  generateAudio?: boolean;
  safetyTolerance?: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    image_url: params.imageUrl,
    duration: params.duration ?? "8s",
    aspect_ratio: "16:9",
    resolution: params.resolution ?? "720p",
    generate_audio: params.generateAudio ?? true,
    safety_tolerance: params.safetyTolerance ?? "4",
  };

  const result = await fal.subscribe("fal-ai/veo3.1/lite/image-to-video" as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Veo 3.1 Lite returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── Hunyuan V1.5 via fal.ai ───────────────────────────────────────────────

export async function hunyuanViaFal(params: {
  imageUrl?: string;
  prompt: string;
  duration: number;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    num_frames: Math.min(129, Math.max(17, Math.round(24 * params.duration))),
    width: 1280,
    height: 720,
    num_inference_steps: 50,
    guidance_scale: 7.0,
    flow_shift: 7.0,
    seed: -1,
  };
  if (params.imageUrl) input.image_url = params.imageUrl;

  const result = await fal.subscribe("fal-ai/hunyuan-video" as any, {
    input: input as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Hunyuan returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ═══════════════════════════════════════════════════════════════════════════
// HEDRA CHARACTER-3
// ═══════════════════════════════════════════════════════════════════════════

export async function hedraCharacter3(params: {
  imageUrl: string;
  audioUrl: string;
  prompt: string;
  durationMs: number;
}): Promise<GenerationOutput> {
  const apiKey = process.env.HEDRA_API_KEY;
  if (!apiKey) throw new Error("HEDRA_API_KEY not set");
  const start = Date.now();
  const baseUrl = "https://api.hedra.com/web-app/public";
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };

  // Step 1: Create and upload audio asset
  const audioAssetResp = await fetch(`${baseUrl}/assets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `benchmark-audio-${Date.now()}.mp3`, type: "audio" }),
  });
  if (!audioAssetResp.ok) throw new Error(`Hedra audio asset create failed: ${audioAssetResp.status}`);
  const audioAsset = (await audioAssetResp.json()) as any;
  const audioAssetId = audioAsset.id ?? audioAsset.asset_id;

  // Download audio from URL and upload to Hedra
  const audioData = await fetch(params.audioUrl);
  const audioBlob = await audioData.blob();
  const audioForm = new FormData();
  audioForm.append("file", audioBlob, "audio.mp3");

  const audioUploadResp = await fetch(`${baseUrl}/assets/${audioAssetId}/upload`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: audioForm,
  });
  if (!audioUploadResp.ok) throw new Error(`Hedra audio upload failed: ${audioUploadResp.status}`);

  // Step 2: Create and upload image asset
  const imageAssetResp = await fetch(`${baseUrl}/assets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: `benchmark-image-${Date.now()}.png`, type: "image" }),
  });
  if (!imageAssetResp.ok) throw new Error(`Hedra image asset create failed: ${imageAssetResp.status}`);
  const imageAsset = (await imageAssetResp.json()) as any;
  const imageAssetId = imageAsset.id ?? imageAsset.asset_id;

  const imageData = await fetch(params.imageUrl);
  const imageBlob = await imageData.blob();
  const imageForm = new FormData();
  imageForm.append("file", imageBlob, "portrait.png");

  const imageUploadResp = await fetch(`${baseUrl}/assets/${imageAssetId}/upload`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: imageForm,
  });
  if (!imageUploadResp.ok) throw new Error(`Hedra image upload failed: ${imageUploadResp.status}`);

  // Step 3: Generate avatar video
  const genResp = await fetch(`${baseUrl}/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "video",
      ai_model_id: "26f0fc66-152b-40ab-abed-76c43df99bc8", // Hedra Avatar (Character-3)
      start_keyframe_id: imageAssetId,
      audio_id: audioAssetId,
      generated_video_inputs: {
        text_prompt: params.prompt,
        aspect_ratio: "16:9",
        resolution: "720p",
        duration_ms: params.durationMs,
      },
    }),
  });
  if (!genResp.ok) {
    const err = await genResp.text().catch(() => "");
    throw new Error(`Hedra generation failed: ${genResp.status} — ${err}`);
  }
  const genData = (await genResp.json()) as any;
  const generationId = genData.id ?? genData.generation_id;

  // Step 4: Poll for completion
  const maxWait = 10 * 60 * 1000;
  let interval = 5000;
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    const statusResp = await fetch(`${baseUrl}/generations/${generationId}/status`, {
      headers: { "X-API-Key": apiKey },
    });
    if (!statusResp.ok) continue;
    const statusData = (await statusResp.json()) as any;
    if (statusData.status === "complete" || statusData.status === "completed") {
      // Get the video URL from the asset
      const videoAssetId = statusData.asset_id ?? statusData.output_asset_id;
      if (videoAssetId) {
        const assetResp = await fetch(`${baseUrl}/assets/${videoAssetId}`, {
          headers: { "X-API-Key": apiKey },
        });
        if (assetResp.ok) {
          const assetData = (await assetResp.json()) as any;
          const videoUrl = assetData.url ?? assetData.download_url;
          if (videoUrl) return { url: videoUrl, generationTimeMs: Date.now() - start };
        }
      }
      // Fallback: check if URL is directly in status response
      const directUrl = statusData.url ?? statusData.video_url ?? statusData.output_url;
      if (directUrl) return { url: directUrl, generationTimeMs: Date.now() - start };
      throw new Error("Hedra: completed but no video URL found");
    }
    if (statusData.status === "failed" || statusData.status === "error") {
      throw new Error(`Hedra generation failed: ${JSON.stringify(statusData)}`);
    }
    interval = Math.min(interval * 1.5, 30000);
  }
  throw new Error("Hedra: timed out");
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH
// ═══════════════════════════════════════════════════════════════════════════

// ─── ElevenLabs TTS ─────────────────────────────────────────────────────────

export async function elevenLabsTTS(params: {
  text: string;
  voiceId?: string;
}): Promise<GenerationOutput> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
  const start = Date.now();

  const voiceId = params.voiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel (default)
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${resp.status} — ${err}`);
  }

  const audioBuffer = Buffer.from(await resp.arrayBuffer());
  const key = `benchmark/tts/elevenlabs-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const { url } = await storagePut(key, audioBuffer, "audio/mpeg");

  return { url, generationTimeMs: Date.now() - start };
}

// ─── Cartesia TTS ───────────────────────────────────────────────────────────

export async function cartesiaTTS(params: {
  text: string;
  voiceId?: string;
}): Promise<GenerationOutput> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error("CARTESIA_API_KEY not set");
  const start = Date.now();

  const resp = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Cartesia-Version": "2026-03-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: "sonic-2",
      transcript: params.text,
      voice: { mode: "id", id: params.voiceId ?? "a0e99841-438c-4a64-b679-ae501e7d6091" },
      output_format: { container: "mp3", encoding: "pcm_f32le", sample_rate: 44100 },
      language: "en",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Cartesia TTS failed: ${resp.status} — ${err}`);
  }

  const audioBuffer = Buffer.from(await resp.arrayBuffer());
  const key = `benchmark/tts/cartesia-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const { url } = await storagePut(key, audioBuffer, "audio/mpeg");

  return { url, generationTimeMs: Date.now() - start };
}

// ─── OpenAI TTS ─────────────────────────────────────────────────────────────

export async function openaiTTS(params: {
  text: string;
  voice?: string;
}): Promise<GenerationOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const start = Date.now();

  // Use the platform's built-in Forge proxy for OpenAI TTS
  const baseUrl = process.env.BUILT_IN_FORGE_API_URL?.replace(/\/+$/, "") ?? "https://api.openai.com";
  const authKey = process.env.BUILT_IN_FORGE_API_KEY ?? apiKey;

  const resp = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: params.text,
      voice: params.voice ?? "alloy",
      response_format: "mp3",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`OpenAI TTS failed: ${resp.status} — ${err}`);
  }

  const audioBuffer = Buffer.from(await resp.arrayBuffer());
  const key = `benchmark/tts/openai-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
  const { url } = await storagePut(key, audioBuffer, "audio/mpeg");

  return { url, generationTimeMs: Date.now() - start };
}

// ═══════════════════════════════════════════════════════════════════════════
// LIP SYNC
// ═══════════════════════════════════════════════════════════════════════════

// ─── LatentSync via fal.ai ──────────────────────────────────────────────────

export async function latentSyncViaFal(params: {
  videoUrl: string;
  audioUrl: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const result = await fal.subscribe("fal-ai/latentsync" as any, {
    input: {
      video_url: params.videoUrl,
      audio_url: params.audioUrl,
    } as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai LatentSync returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── MuseTalk via fal.ai ────────────────────────────────────────────────────

export async function museTalkViaFal(params: {
  videoUrl: string;
  audioUrl: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const result = await fal.subscribe("fal-ai/musetalk" as any, {
    input: {
      video_url: params.videoUrl,
      audio_url: params.audioUrl,
    } as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai MuseTalk returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}

// ─── MuseTalk via Replicate ─────────────────────────────────────────────────

export async function museTalkViaReplicate(params: {
  videoUrl: string;
  audioUrl: string;
}): Promise<GenerationOutput> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) throw new Error("REPLICATE_API_TOKEN not set");
  const start = Date.now();

  const replicate = new Replicate({ auth: apiToken });

  const output = await replicate.run("douwantech/musetalk", {
    input: {
      video: params.videoUrl,
      audio: params.audioUrl,
    },
  });

  let videoUrl: string;
  if (output && typeof output === "object" && "url" in output && typeof (output as any).url === "function") {
    videoUrl = (output as any).url();
  } else if (typeof output === "string") {
    videoUrl = output;
  } else {
    throw new Error(`Replicate MuseTalk: unexpected output type: ${typeof output}`);
  }

  return { url: videoUrl, generationTimeMs: Date.now() - start };
}

// ─── Kling Lip Sync via fal.ai ─────────────────────────────────────────────

export async function klingLipSyncViaFal(params: {
  videoUrl: string;
  audioUrl: string;
  language?: string;
}): Promise<GenerationOutput> {
  ensureFalConfigured();
  const start = Date.now();

  const result = await fal.subscribe("fal-ai/kling-video/lipsync/audio-to-video" as any, {
    input: {
      video_url: params.videoUrl,
      audio_url: params.audioUrl,
      language: params.language ?? "en",
    } as any,
    logs: true,
    pollInterval: 5000,
  });

  const video = (result.data as any)?.video;
  if (!video?.url) throw new Error("fal.ai Kling Lip Sync returned no video");

  return { url: video.url, generationTimeMs: Date.now() - start };
}
