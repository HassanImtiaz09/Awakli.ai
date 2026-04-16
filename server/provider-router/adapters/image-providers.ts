/**
 * Image Provider Adapters — FLUX 1.1 Pro, SDXL Lightning, Midjourney v7,
 * Ideogram 3, Recraft v3
 */
import type { ProviderAdapter, GenerationParams, ImageParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { registerAdapter, getActiveApiKey } from "../registry";

// ─── Helper: Generic REST image adapter factory ──────────────────────────
function createImageAdapter(config: {
  providerId: string;
  modelName: string;
  baseUrl: string;
  costPerImage: number;
  maxWidth: number;
  maxHeight: number;
  submitEndpoint: string;
  buildBody: (i: ImageParams, model: string) => Record<string, unknown>;
  authHeader: (key: string) => Record<string, string>;
  isSync: boolean;
  extractImageUrl?: (resp: Record<string, unknown>) => string | null;
  pollEndpoint?: string;
  isComplete?: (task: Record<string, unknown>) => boolean;
  extractPollResult?: (task: Record<string, unknown>) => string | null;
}): ProviderAdapter {
  return {
    providerId: config.providerId,
    validateParams(p: GenerationParams) {
      const i = p as ImageParams; const errors: string[] = [];
      if (!i.prompt) errors.push("prompt required");
      if (i.width && i.width > config.maxWidth) errors.push(`max width ${config.maxWidth}`);
      if (i.height && i.height > config.maxHeight) errors.push(`max height ${config.maxHeight}`);
      return { valid: !errors.length, errors: errors.length ? errors : undefined };
    },
    estimateCostUsd(p: GenerationParams) {
      const i = p as ImageParams;
      return config.costPerImage * (i.numImages ?? 1);
    },
    async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
      const i = p as ImageParams;
      const keyInfo = await getActiveApiKey(config.providerId);
      if (!keyInfo) throw new ProviderError("UNKNOWN", `No API key for ${config.providerId}`, config.providerId, false, false);

      const body = config.buildBody(i, config.modelName);
      const resp = await fetch(`${config.baseUrl}${config.submitEndpoint}`, {
        method: "POST",
        headers: { ...config.authHeader(keyInfo.decryptedKey), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctx.timeout ? AbortSignal.timeout(config.isSync ? ctx.timeout : Math.min(ctx.timeout, 30_000)) : undefined,
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => "");
        if (resp.status === 429) throw new ProviderError("RATE_LIMITED", errBody, config.providerId);
        if (resp.status === 422) throw new ProviderError("CONTENT_VIOLATION", errBody, config.providerId, false, false);
        throw new ProviderError("TRANSIENT", `${config.providerId} ${resp.status}: ${errBody}`, config.providerId);
      }

      const data = await resp.json() as Record<string, unknown>;

      if (config.isSync && config.extractImageUrl) {
        const url = config.extractImageUrl(data);
        if (url) return { storageUrl: url, mimeType: "image/png", metadata: { model: config.modelName } };
        throw new ProviderError("TRANSIENT", "No image URL in response", config.providerId);
      }

      // Async: poll for completion
      if (config.pollEndpoint) {
        const taskId = String(data.id ?? data.task_id ?? data.request_id ?? "");
        const maxWait = ctx.timeout ?? 120_000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
          await new Promise(r => setTimeout(r, 3000));
          const poll = await fetch(`${config.baseUrl}${config.pollEndpoint}`.replace("{taskId}", taskId), {
            headers: config.authHeader(keyInfo.decryptedKey),
          });
          if (!poll.ok) continue;
          const task = await poll.json() as Record<string, unknown>;
          if (config.isComplete?.(task)) {
            const url = config.extractPollResult?.(task);
            if (url) return { storageUrl: url, mimeType: "image/png", metadata: { taskId, model: config.modelName } };
          }
        }
        throw new ProviderError("TIMEOUT", `${config.providerId} task timed out`, config.providerId);
      }

      throw new ProviderError("TRANSIENT", "No image URL in response", config.providerId);
    },
  };
}

// ─── FLUX 1.1 Pro (via Fal.ai) ──────────────────────────────────────────
registerAdapter(createImageAdapter({
  providerId: "flux_11_pro",
  modelName: "flux-pro-1.1",
  baseUrl: "https://fal.run",
  costPerImage: 0.040,
  maxWidth: 2048,
  maxHeight: 2048,
  submitEndpoint: "/fal-ai/flux-pro/v1.1",
  isSync: true,
  buildBody: (i) => ({
    prompt: i.prompt,
    image_size: { width: i.width ?? 1024, height: i.height ?? 1024 },
    num_images: i.numImages ?? 1,
    guidance_scale: i.guidanceScale ?? 3.5,
    seed: i.seed,
    sync_mode: true,
  }),
  extractImageUrl: (r) => {
    const images = (r as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined;
    return images?.[0]?.url ? String(images[0].url) : null;
  },
  authHeader: (key) => ({ "Authorization": `Key ${key}` }),
}));

// ─── SDXL Lightning (via Fal.ai) ────────────────────────────────────────
registerAdapter(createImageAdapter({
  providerId: "sdxl_lightning",
  modelName: "sdxl-lightning",
  baseUrl: "https://fal.run",
  costPerImage: 0.003,
  maxWidth: 2048,
  maxHeight: 2048,
  submitEndpoint: "/fal-ai/fast-lightning-sdxl",
  isSync: true,
  buildBody: (i) => ({
    prompt: i.prompt, negative_prompt: i.negativePrompt,
    image_size: { width: i.width ?? 1024, height: i.height ?? 1024 },
    num_images: i.numImages ?? 1, guidance_scale: i.guidanceScale ?? 1.5,
    seed: i.seed,
  }),
  extractImageUrl: (r) => {
    const images = (r as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined;
    return images?.[0]?.url ? String(images[0].url) : null;
  },
  authHeader: (key) => ({ "Authorization": `Key ${key}` }),
}));

// ─── Midjourney v7 (via proxy API) ──────────────────────────────────────
registerAdapter(createImageAdapter({
  providerId: "midjourney_v7",
  modelName: "midjourney-v7",
  baseUrl: "https://api.mymidjourney.ai/api/v1",
  costPerImage: 0.080,
  maxWidth: 2048,
  maxHeight: 2048,
  submitEndpoint: "/imagine",
  isSync: false,
  pollEndpoint: "/message/{taskId}",
  buildBody: (i) => ({
    prompt: i.prompt, aspect_ratio: `${i.width ?? 1024}:${i.height ?? 1024}`,
  }),
  isComplete: (t) => (t as Record<string, unknown>).status === "DONE",
  extractPollResult: (t) => {
    const uri = (t as Record<string, unknown>).uri;
    return uri ? String(uri) : null;
  },
  authHeader: (key) => ({ "Authorization": `Bearer ${key}` }),
}));

// ─── Ideogram 3 (via Fal.ai) ───────────────────────────────────────────────
// Sync pattern: POST fal.run/fal-ai/ideogram/v3
// Pricing: ~$0.06/image
// Auth: Authorization: Key {FAL_API_KEY}
registerAdapter(createImageAdapter({
  providerId: "ideogram_3",
  modelName: "ideogram-v3",
  baseUrl: "https://fal.run",
  costPerImage: 0.060,
  maxWidth: 2048,
  maxHeight: 2048,
  submitEndpoint: "/fal-ai/ideogram/v3",
  isSync: true,
  buildBody: (i) => ({
    prompt: i.prompt,
    image_size: i.width && i.height ? { width: i.width, height: i.height } : "square_hd",
    num_images: i.numImages ?? 1,
    expand_prompt: true,
    rendering_speed: "BALANCED",
  }),
  extractImageUrl: (r) => {
    const images = (r as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined;
    return images?.[0]?.url ? String(images[0].url) : null;
  },
  authHeader: (key) => ({ "Authorization": `Key ${key}` }),
}));

// ─── Recraft v3 (via Fal.ai) ───────────────────────────────────────────────
// Sync pattern: POST fal.run/fal-ai/recraft/v3/text-to-image
// Pricing: ~$0.04/image
// Auth: Authorization: Key {FAL_API_KEY}
registerAdapter(createImageAdapter({
  providerId: "recraft_v3",
  modelName: "recraft-v3",
  baseUrl: "https://fal.run",
  costPerImage: 0.040,
  maxWidth: 2048,
  maxHeight: 2048,
  submitEndpoint: "/fal-ai/recraft/v3/text-to-image",
  isSync: true,
  buildBody: (i) => ({
    prompt: i.prompt,
    image_size: i.width && i.height ? { width: i.width, height: i.height } : "square_hd",
    style: "digital_illustration",
  }),
  extractImageUrl: (r) => {
    const images = (r as Record<string, unknown>).images as Array<Record<string, unknown>> | undefined;
    return images?.[0]?.url ? String(images[0].url) : null;
  },
  authHeader: (key) => ({ "Authorization": `Key ${key}` }),
}));
