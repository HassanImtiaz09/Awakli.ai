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

// ─── Pika 2.2 ───────────────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "pika_22",
  modelName: "pika-2.2",
  baseUrl: "https://api.pika.art/v1",
  maxDuration: 10,
  costPer5s: 0.050,
  submitEndpoint: "/generate",
  pollEndpoint: "/tasks/{taskId}",
  buildSubmitBody: (v, model) => ({
    model, prompt: v.prompt, image_url: v.imageUrl, duration: v.durationSeconds ?? 5,
    aspect_ratio: v.aspectRatio ?? "16:9", negative_prompt: v.negativePrompt,
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).task_id ?? ""),
  extractResult: (t) => {
    const output = (t as Record<string, unknown>).output as Record<string, unknown> | undefined;
    const url = output?.video_url ?? output?.url;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "completed",
  isFailed: (t) => (t as Record<string, unknown>).status === "failed",
  getError: (t) => String((t as Record<string, unknown>).error ?? "Pika task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

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

// ─── Hailuo Director ────────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "hailuo_director",
  modelName: "hailuo-director",
  baseUrl: "https://api.hailuo.ai/v1",
  maxDuration: 10,
  costPer5s: 0.040,
  submitEndpoint: "/video/generations",
  pollEndpoint: "/video/generations/{taskId}",
  buildSubmitBody: (v, model) => ({
    model, prompt: v.prompt, image: v.imageUrl,
    duration: v.durationSeconds ?? 5,
  }),
  extractTaskId: (r) => String(((r as Record<string, unknown>).data as Record<string, unknown>)?.id ?? ""),
  extractResult: (t) => {
    const data = (t as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const url = data?.video_url;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => ((t as Record<string, unknown>).data as Record<string, unknown>)?.status === "completed",
  isFailed: (t) => ((t as Record<string, unknown>).data as Record<string, unknown>)?.status === "failed",
  getError: (t) => String(((t as Record<string, unknown>).data as Record<string, unknown>)?.error ?? "Hailuo task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

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

// ─── Wan 2.1 ────────────────────────────────────────────────────────────
registerAdapter(createVideoAdapter({
  providerId: "wan_21",
  modelName: "wan-2.1",
  baseUrl: "https://api.wan.video/v1",
  maxDuration: 10,
  costPer5s: 0.035,
  submitEndpoint: "/generations",
  pollEndpoint: "/generations/{taskId}",
  buildSubmitBody: (v, model) => ({
    model, prompt: v.prompt, image: v.imageUrl,
    duration: v.durationSeconds ?? 5, resolution: "1080p",
  }),
  extractTaskId: (r) => String((r as Record<string, unknown>).task_id ?? ""),
  extractResult: (t) => {
    const url = (t as Record<string, unknown>).output_url;
    return url ? { url: String(url) } : null;
  },
  isComplete: (t) => (t as Record<string, unknown>).status === "success",
  isFailed: (t) => (t as Record<string, unknown>).status === "failed",
  getError: (t) => String((t as Record<string, unknown>).error ?? "Wan task failed"),
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));
