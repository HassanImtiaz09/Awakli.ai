/**
 * Video Provider Adapters — Pika 2.2, Minimax Video-02, Luma Ray3,
 * Hailuo Director, Vidu 2.5, Wan 2.1
 *
 * Each follows the same pattern: validate → estimate → execute via REST API.
 * All use the registry's getActiveApiKey for credential management.
 */
import type { ProviderAdapter, GenerationParams, VideoParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { registerAdapter, getActiveApiKey } from "../registry";

// ─── Helper: Generic REST video adapter factory ──────────────────────────
function createVideoAdapter(config: {
  providerId: string;
  modelName: string;
  baseUrl: string;
  maxDuration: number;
  costPer5s: number;
  submitEndpoint: string;
  pollEndpoint: string;
  buildSubmitBody: (v: VideoParams, model: string) => Record<string, unknown>;
  extractTaskId: (resp: Record<string, unknown>) => string;
  extractResult: (task: Record<string, unknown>) => { url: string; duration?: number } | null;
  isComplete: (task: Record<string, unknown>) => boolean;
  isFailed: (task: Record<string, unknown>) => boolean;
  getError: (task: Record<string, unknown>) => string;
  authHeader: (key: string) => Record<string, string>;
}): ProviderAdapter {
  return {
    providerId: config.providerId,
    validateParams(p: GenerationParams) {
      const v = p as VideoParams; const errors: string[] = [];
      if (!v.prompt) errors.push("prompt required");
      if (v.durationSeconds && v.durationSeconds > config.maxDuration) errors.push(`max ${config.maxDuration}s for ${config.providerId}`);
      return { valid: !errors.length, errors: errors.length ? errors : undefined };
    },
    estimateCostUsd(p: GenerationParams) {
      return Math.ceil(((p as VideoParams).durationSeconds ?? 5) / 5) * config.costPer5s;
    },
    async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
      const v = p as VideoParams;
      const keyInfo = await getActiveApiKey(config.providerId);
      if (!keyInfo) throw new ProviderError("UNKNOWN", `No API key for ${config.providerId}`, config.providerId, false, false);
      const apiKey = keyInfo.decryptedKey;

      const body = config.buildSubmitBody(v, config.modelName);
      const resp = await fetch(`${config.baseUrl}${config.submitEndpoint}`, {
        method: "POST",
        headers: { ...config.authHeader(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        if (resp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, config.providerId);
        throw new ProviderError("TRANSIENT", `${config.providerId} ${resp.status}: ${errBody}`, config.providerId);
      }

      const data = await resp.json() as Record<string, unknown>;
      const taskId = config.extractTaskId(data);
      const maxWait = ctx.timeout ?? 300_000;
      const start = Date.now();

      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, 5000));
        const poll = await fetch(`${config.baseUrl}${config.pollEndpoint}`.replace("{taskId}", taskId), {
          headers: config.authHeader(keyInfo.decryptedKey),
        });
        if (!poll.ok) continue;
        const task = await poll.json() as Record<string, unknown>;
        if (config.isComplete(task)) {
          const result = config.extractResult(task);
          if (result) return { storageUrl: result.url, mimeType: "video/mp4", durationSeconds: result.duration ?? v.durationSeconds ?? 5, metadata: { taskId, model: config.modelName } };
        }
        if (config.isFailed(task)) throw new ProviderError("TRANSIENT", config.getError(task), config.providerId);
      }
      throw new ProviderError("TIMEOUT", `${config.providerId} task timed out`, config.providerId);
    },
  };
}

// ─── Pika 2.2 (via Fal.ai) ──────────────────────────────────────────────
// Queue pattern: POST queue.fal.run/{model} → poll status → GET result
// Pricing: $0.20 (5s) / $0.30 (10s) per video
// Auth: Authorization: Key {FAL_API_KEY}
const PIKA_FAL_MODEL = "fal-ai/pika/v2.2/image-to-video";

registerAdapter({
  providerId: "pika_22",

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (!v.imageUrl) errors.push("image_url required for Pika 2.2");
    if (v.durationSeconds && v.durationSeconds > 10) errors.push("max 10s for pika_22");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  },

  estimateCostUsd(p: GenerationParams) {
    const v = p as VideoParams;
    const duration = v.durationSeconds ?? 5;
    return duration > 5 ? 0.30 : 0.20;
  },

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    const keyInfo = await getActiveApiKey("pika_22");
    if (!keyInfo) throw new ProviderError("UNKNOWN", "No API key for pika_22", "pika_22", false, false);
    const apiKey = keyInfo.decryptedKey;

    const queueUrl = `https://queue.fal.run/${PIKA_FAL_MODEL}`;

    // Build request body per Fal.ai Pika 2.2 API schema
    const body: Record<string, unknown> = {
      image_url: v.imageUrl,
      prompt: v.prompt,
      duration: String(v.durationSeconds ?? 5), // Fal.ai Pika expects string enum "5" | "10"
    };

    // Submit to Fal.ai queue
    const submitResp = await fetch(queueUrl, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
    });

    if (!submitResp.ok) {
      const errBody = await submitResp.text().catch(() => "");
      if (submitResp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, "pika_22");
      if (submitResp.status === 422) throw new ProviderError("CONTENT_VIOLATION", errBody, "pika_22", false, false);
      throw new ProviderError("TRANSIENT", `pika_22 ${submitResp.status}: ${errBody}`, "pika_22");
    }

    const submitData = await submitResp.json() as Record<string, unknown>;
    const requestId = String(submitData.request_id ?? "");
    const statusUrl = String(submitData.status_url ?? `${queueUrl}/requests/${requestId}/status`);
    const responseUrl = String(submitData.response_url ?? `${queueUrl}/requests/${requestId}`);

    if (!requestId) {
      throw new ProviderError("TRANSIENT", "No request_id in Fal.ai queue response", "pika_22");
    }

    // Poll for completion
    const maxWait = ctx.timeout ?? 300_000;
    const start = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      try {
        const statusResp = await fetch(statusUrl, {
          headers: { "Authorization": `Key ${apiKey}` },
        });

        if (!statusResp.ok) continue;
        const statusData = await statusResp.json() as Record<string, unknown>;
        const status = String(statusData.status ?? "");

        if (status === "COMPLETED") {
          const resultResp = await fetch(responseUrl, {
            headers: { "Authorization": `Key ${apiKey}` },
          });

          if (!resultResp.ok) {
            throw new ProviderError("TRANSIENT", `Failed to fetch Pika result: ${resultResp.status}`, "pika_22");
          }

          const resultData = await resultResp.json() as Record<string, unknown>;
          const video = resultData.video as Record<string, unknown> | undefined;
          const videoUrl = video?.url ? String(video.url) : null;

          if (!videoUrl) {
            throw new ProviderError("TRANSIENT", "No video URL in Pika result", "pika_22");
          }

          return {
            storageUrl: videoUrl,
            mimeType: "video/mp4",
            durationSeconds: v.durationSeconds ?? 5,
            metadata: {
              requestId,
              model: PIKA_FAL_MODEL,
            },
          };
        }

        if (status === "FAILED") {
          const errorMsg = String(statusData.error ?? "Pika task failed on Fal.ai");
          throw new ProviderError("TRANSIENT", errorMsg, "pika_22");
        }

        // IN_QUEUE or IN_PROGRESS — continue polling
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        // Network errors during polling — continue
      }
    }

    throw new ProviderError("TIMEOUT", "pika_22 task timed out on Fal.ai", "pika_22");
  },
});

// ─── Minimax Video-02 ───────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "minimax_video02",
  modelName: "video-02",
  baseUrl: "https://api.minimax.chat/v1",
  maxDuration: 10,
  costPer5s: 0.060,
  submitEndpoint: "/video_generation",
  pollEndpoint: "/query/video_generation?task_id={taskId}",
  buildSubmitBody: (v, model) => ({
    model, prompt: v.prompt, first_frame_image: v.imageUrl,
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).task_id ?? ""),
  extractResult: (t) => {
    const fileId = (t as Record<string, unknown>).file_id;
    return fileId ? { url: `https://api.minimax.chat/v1/files/retrieve?file_id=${fileId}` } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "Success",
  isFailed: (t) => (t as Record<string, unknown>).status === "Failed",
  getError: (t) => String((t as Record<string, unknown>).base_resp ?? "Minimax task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Luma Ray3 ──────────────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "luma_ray3",
  modelName: "ray-3",
  baseUrl: "https://api.lumalabs.ai/dream-machine/v1",
  maxDuration: 10,
  costPer5s: 0.060,
  submitEndpoint: "/generations",
  pollEndpoint: "/generations/{taskId}",
  buildSubmitBody: (v) => ({
    prompt: v.prompt,
    keyframes: v.imageUrl ? { frame0: { type: "image", url: v.imageUrl } } : undefined,
    aspect_ratio: v.aspectRatio ?? "16:9",
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).id ?? ""),
  extractResult: (t) => {
    const assets = (t as Record<string, unknown>).assets as Record<string, unknown> | undefined;
    const url = assets?.video;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).state === "completed",
  isFailed: (t) => (t as Record<string, unknown>).state === "failed",
  getError: (t) => String((t as Record<string, unknown>).failure_reason ?? "Luma task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Hailuo Director (via Fal.ai) ──────────────────────────────────────
// Queue pattern: POST queue.fal.run/{model} → poll status → GET result
// Pricing: ~$0.04/5s
// Auth: Authorization: Key {FAL_API_KEY}
const HAILUO_FAL_MODEL = "fal-ai/minimax/hailuo-02/standard/image-to-video";

registerAdapter({
  providerId: "hailuo_director",

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (!v.imageUrl) errors.push("image_url required for hailuo_director");
    if (v.durationSeconds && v.durationSeconds > 10) errors.push("max 10s for hailuo_director");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  },

  estimateCostUsd(p: GenerationParams) {
    const v = p as VideoParams;
    const duration = v.durationSeconds ?? 6;
    return duration > 6 ? 0.06 : 0.04;
  },

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    const keyInfo = await getActiveApiKey("hailuo_director");
    if (!keyInfo) throw new ProviderError("UNKNOWN", "No API key for hailuo_director", "hailuo_director", false, false);
    const apiKey = keyInfo.decryptedKey;

    const queueUrl = `https://queue.fal.run/${HAILUO_FAL_MODEL}`;
    const body: Record<string, unknown> = {
      image_url: v.imageUrl,
      prompt: v.prompt,
      duration: String(v.durationSeconds ?? 6), // "6" | "10"
      resolution: "768P",
    };

    const submitResp = await fetch(queueUrl, {
      method: "POST",
      headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
    });

    if (!submitResp.ok) {
      const errBody = await submitResp.text().catch(() => "");
      if (submitResp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, "hailuo_director");
      if (submitResp.status === 422) throw new ProviderError("CONTENT_VIOLATION", errBody, "hailuo_director", false, false);
      throw new ProviderError("TRANSIENT", `hailuo_director ${submitResp.status}: ${errBody}`, "hailuo_director");
    }

    const submitData = await submitResp.json() as Record<string, unknown>;
    const requestId = String(submitData.request_id ?? "");
    const statusUrl = String(submitData.status_url ?? `${queueUrl}/requests/${requestId}/status`);
    const responseUrl = String(submitData.response_url ?? `${queueUrl}/requests/${requestId}`);
    if (!requestId) throw new ProviderError("TRANSIENT", "No request_id in Fal.ai queue response", "hailuo_director");

    const maxWait = ctx.timeout ?? 300_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const statusResp = await fetch(statusUrl, { headers: { "Authorization": `Key ${apiKey}` } });
        if (!statusResp.ok) continue;
        const statusData = await statusResp.json() as Record<string, unknown>;
        const status = String(statusData.status ?? "");
        if (status === "COMPLETED") {
          const resultResp = await fetch(responseUrl, { headers: { "Authorization": `Key ${apiKey}` } });
          if (!resultResp.ok) throw new ProviderError("TRANSIENT", `Failed to fetch Hailuo result: ${resultResp.status}`, "hailuo_director");
          const resultData = await resultResp.json() as Record<string, unknown>;
          const video = resultData.video as Record<string, unknown> | undefined;
          const videoUrl = video?.url ? String(video.url) : null;
          if (!videoUrl) throw new ProviderError("TRANSIENT", "No video URL in Hailuo result", "hailuo_director");
          return { storageUrl: videoUrl, mimeType: "video/mp4", durationSeconds: v.durationSeconds ?? 6, metadata: { requestId, model: HAILUO_FAL_MODEL } };
        }
        if (status === "FAILED") throw new ProviderError("TRANSIENT", String(statusData.error ?? "Hailuo task failed on Fal.ai"), "hailuo_director");
      } catch (err) {
        if (err instanceof ProviderError) throw err;
      }
    }
    throw new ProviderError("TIMEOUT", "hailuo_director task timed out on Fal.ai", "hailuo_director");
  },
});

// ─── Vidu 2.5 ───────────────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "vidu_25",
  modelName: "vidu-2.5",
  baseUrl: "https://api.vidu.com/v1",
  maxDuration: 8,
  costPer5s: 0.045,
  submitEndpoint: "/generations",
  pollEndpoint: "/generations/{taskId}",
  buildSubmitBody: (v, model) => ({
    model, prompt: v.prompt, image_url: v.imageUrl,
    duration: v.durationSeconds ?? 5, aspect_ratio: v.aspectRatio ?? "16:9",
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).id ?? ""),
  extractResult: (t) => {
    const url = (t as Record<string, unknown>).video_url;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "completed",
  isFailed: (t) => (t as Record<string, unknown>).status === "failed",
  getError: (t) => String((t as Record<string, unknown>).error ?? "Vidu task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Wan 2.6 (via Fal.ai Queue API) ────────────────────────────────────
// Fal.ai model: fal-ai/wan-i2v (image-to-video) or fal-ai/wan-t2v (text-to-video)
// Pro model (motion LoRA capable): fal-ai/wan-pro
// Queue pattern: POST queue.fal.run/{model} → poll status → GET result
// Pricing (v1.1): $0.10/sec (720p), $0.15/sec (1080p), ~$0.05/sec (Flash)
// Auth: Authorization: Key {FAL_API_KEY}
const WAN_FAL_MODEL_I2V = "fal-ai/wan-i2v";
const WAN_FAL_MODEL_T2V = "fal-ai/wan-t2v";
const WAN_FAL_MODEL_PRO = "fal-ai/wan-pro";  // Motion LoRA capable endpoint

registerAdapter({
  providerId: "wan_21",  // Legacy Wan 2.1 adapter (kept for backward compat)

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) errors.push("max 10s for Wan");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  },

  estimateCostUsd(p: GenerationParams) {
    // Wan on Fal.ai (v1.1 pricing): $0.10/sec (720p), $0.15/sec (1080p)
    const v = p as VideoParams;
    const duration = v.durationSeconds ?? 5;
    const resolution = v.resolution ?? "720p";
    const perSecond = resolution === "1080p" ? 0.15 : 0.10;
    return duration * perSecond;
  },

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    const keyInfo = await getActiveApiKey("wan_21");
    if (!keyInfo) throw new ProviderError("UNKNOWN", "No API key for wan_21", "wan_21", false, false);
    const apiKey = keyInfo.decryptedKey;

    // Choose model based on whether an image is provided
    const model = v.imageUrl ? WAN_FAL_MODEL_I2V : WAN_FAL_MODEL_T2V;
    const queueUrl = `https://queue.fal.run/${model}`;

    // Build request body per Fal.ai Wan API schema
    const body: Record<string, unknown> = {
      prompt: v.prompt,
      resolution: v.resolution ?? "720p",
      aspect_ratio: v.aspectRatio ?? "16:9",
      num_frames: 81, // ~5s at 16fps
      frames_per_second: 16,
      enable_safety_checker: true,
      enable_prompt_expansion: true,
    };
    if (v.imageUrl) {
      body.image_url = v.imageUrl;
    }
    if (v.negativePrompt) {
      body.negative_prompt = v.negativePrompt;
    }
    if (v.seed !== undefined) {
      body.seed = v.seed;
    }

    // Submit to Fal.ai queue
    const submitResp = await fetch(queueUrl, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
    });

    if (!submitResp.ok) {
      const errBody = await submitResp.text().catch(() => "");
      if (submitResp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, "wan_21");
      if (submitResp.status === 422) throw new ProviderError("CONTENT_VIOLATION", errBody, "wan_21", false, false);
      throw new ProviderError("TRANSIENT", `wan_21 ${submitResp.status}: ${errBody}`, "wan_21");
    }

    const submitData = await submitResp.json() as Record<string, unknown>;
    const requestId = String(submitData.request_id ?? "");
    const statusUrl = String(submitData.status_url ?? `${queueUrl}/requests/${requestId}/status`);
    const responseUrl = String(submitData.response_url ?? `${queueUrl}/requests/${requestId}`);

    if (!requestId) {
      throw new ProviderError("TRANSIENT", "No request_id in Fal.ai queue response", "wan_21");
    }

    // Poll for completion
    const maxWait = ctx.timeout ?? 300_000;
    const start = Date.now();
    const pollInterval = 5_000; // 5 seconds

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      try {
        const statusResp = await fetch(statusUrl, {
          headers: { "Authorization": `Key ${apiKey}` },
        });

        if (!statusResp.ok) continue;
        const statusData = await statusResp.json() as Record<string, unknown>;
        const status = String(statusData.status ?? "");

        if (status === "COMPLETED") {
          // Fetch the result
          const resultResp = await fetch(responseUrl, {
            headers: { "Authorization": `Key ${apiKey}` },
          });

          if (!resultResp.ok) {
            throw new ProviderError("TRANSIENT", `Failed to fetch Wan result: ${resultResp.status}`, "wan_21");
          }

          const resultData = await resultResp.json() as Record<string, unknown>;
          const video = resultData.video as Record<string, unknown> | undefined;
          const videoUrl = video?.url ? String(video.url) : null;

          if (!videoUrl) {
            throw new ProviderError("TRANSIENT", "No video URL in Wan result", "wan_21");
          }

          return {
            storageUrl: videoUrl,
            mimeType: "video/mp4",
            durationSeconds: v.durationSeconds ?? 5,
            metadata: {
              requestId,
              model,
              seed: resultData.seed,
              timings: resultData.timings,
            },
          };
        }

        if (status === "FAILED") {
          const errorMsg = String(statusData.error ?? "Wan task failed on Fal.ai");
          throw new ProviderError("TRANSIENT", errorMsg, "wan_21");
        }

        // IN_QUEUE or IN_PROGRESS — continue polling
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        // Network errors during polling — continue
      }
    }

    throw new ProviderError("TIMEOUT", "wan_21 task timed out on Fal.ai", "wan_21");
  },
});

// ─── Wan 2.6 Pro (Motion LoRA capable, via fal-ai/wan-pro) ─────────────
// This adapter routes to the Pro endpoint which accepts motion_lora parameter.
// Used by Premium/Studio/Enterprise tiers for motion-LoRA-enhanced generation.
registerAdapter({
  providerId: "wan_26",

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) errors.push("max 10s for Wan 2.6 Pro");
    return { valid: !errors.length, errors: errors.length ? errors : undefined };
  },

  estimateCostUsd(p: GenerationParams) {
    // Wan 2.6 Pro on Fal.ai (v1.1 pricing): $0.10/sec (720p), $0.15/sec (1080p), ~$0.05/sec (Flash)
    const v = p as VideoParams;
    const duration = v.durationSeconds ?? 5;
    const resolution = v.resolution ?? "720p";
    const perSecond = resolution === "1080p" ? 0.15 : resolution === "480p" ? 0.05 : 0.10;
    return duration * perSecond;
  },

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    const keyInfo = await getActiveApiKey("wan_26");
    if (!keyInfo) throw new ProviderError("UNKNOWN", "No API key for wan_26", "wan_26", false, false);
    const apiKey = keyInfo.decryptedKey;

    const queueUrl = `https://queue.fal.run/${WAN_FAL_MODEL_PRO}`;

    // Build request body — Pro endpoint accepts motion_lora parameter
    const body: Record<string, unknown> = {
      prompt: v.prompt,
      resolution: v.resolution ?? "720p",
      aspect_ratio: v.aspectRatio ?? "16:9",
      num_frames: 81,
      frames_per_second: 16,
      enable_safety_checker: true,
      enable_prompt_expansion: true,
    };
    if (v.imageUrl) body.image_url = v.imageUrl;
    if (v.negativePrompt) body.negative_prompt = v.negativePrompt;
    if (v.seed !== undefined) body.seed = v.seed;

    // Motion LoRA injection — pass URL to trained artifact
    const meta = v as unknown as Record<string, unknown>;
    if (meta.motionLoraUrl) {
      body.motion_lora = {
        url: meta.motionLoraUrl,
        weight: meta.motionLoraWeight ?? 0.60,
      };
    }

    const submitResp = await fetch(queueUrl, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctx.timeout ? AbortSignal.timeout(Math.min(ctx.timeout, 30_000)) : undefined,
    });

    if (!submitResp.ok) {
      const errBody = await submitResp.text().catch(() => "");
      if (submitResp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, "wan_26");
      if (submitResp.status === 422) throw new ProviderError("CONTENT_VIOLATION", errBody, "wan_26", false, false);
      throw new ProviderError("TRANSIENT", `wan_26 ${submitResp.status}: ${errBody}`, "wan_26");
    }

    const submitData = await submitResp.json() as Record<string, unknown>;
    const requestId = String(submitData.request_id ?? "");
    const statusUrl = String(submitData.status_url ?? `${queueUrl}/requests/${requestId}/status`);
    const responseUrl = String(submitData.response_url ?? `${queueUrl}/requests/${requestId}`);

    if (!requestId) {
      throw new ProviderError("TRANSIENT", "No request_id in Fal.ai queue response", "wan_26");
    }

    const maxWait = ctx.timeout ?? 300_000;
    const start = Date.now();
    const pollInterval = 5_000;

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      try {
        const statusResp = await fetch(statusUrl, {
          headers: { "Authorization": `Key ${apiKey}` },
        });

        if (!statusResp.ok) continue;
        const statusData = await statusResp.json() as Record<string, unknown>;
        const status = String(statusData.status ?? "");

        if (status === "COMPLETED") {
          const resultResp = await fetch(responseUrl, {
            headers: { "Authorization": `Key ${apiKey}` },
          });

          if (!resultResp.ok) {
            throw new ProviderError("TRANSIENT", `Failed to fetch Wan 2.6 result: ${resultResp.status}`, "wan_26");
          }

          const resultData = await resultResp.json() as Record<string, unknown>;
          const video = resultData.video as Record<string, unknown> | undefined;
          const videoUrl = video?.url ? String(video.url) : null;

          if (!videoUrl) {
            throw new ProviderError("TRANSIENT", "No video URL in Wan 2.6 result", "wan_26");
          }

          return {
            storageUrl: videoUrl,
            mimeType: "video/mp4",
            durationSeconds: v.durationSeconds ?? 5,
            metadata: {
              requestId,
              model: WAN_FAL_MODEL_PRO,
              motionLoraApplied: !!meta.motionLoraUrl,
              seed: resultData.seed,
              timings: resultData.timings,
            },
          };
        }

        if (status === "FAILED") {
          const errorMsg = String(statusData.error ?? "Wan 2.6 Pro task failed on Fal.ai");
          throw new ProviderError("TRANSIENT", errorMsg, "wan_26");
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;
      }
    }

    throw new ProviderError("TIMEOUT", "wan_26 task timed out on Fal.ai", "wan_26");
  },
});
