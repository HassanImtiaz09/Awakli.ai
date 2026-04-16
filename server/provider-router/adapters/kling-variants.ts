/**
 * Kling Variant Adapters — 1.6, 2.6, 3 Omni
 * All share the same API shape, differ in model_name and pricing.
 */
import type {
  ProviderAdapter, GenerationParams, VideoParams, ExecutionContext, AdapterResult,
} from "../types";
import { ProviderError } from "../types";
import { registerAdapter } from "../registry";
import {
  imageToVideo, textToVideo, pollTaskUntilDone,
  type KlingImageToVideoParams, type KlingTextToVideoParams,
} from "../../kling";

function mapKlingError(code: number, message: string, providerId: string): ProviderError {
  if (code === 1001 || code === 1002) return new ProviderError("INVALID_PARAMS", message, providerId, false, false);
  if (code === 1003 || code === 1004) return new ProviderError("RATE_LIMITED", message, providerId);
  if (code === 1005) return new ProviderError("CONTENT_VIOLATION", message, providerId, false, false);
  return new ProviderError("TRANSIENT", message, providerId);
}

function mapGenericError(err: unknown, providerId: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out")) return new ProviderError("TIMEOUT", msg, providerId);
  if (msg.includes("rate limit") || msg.includes("429")) return new ProviderError("RATE_LIMITED", msg, providerId);
  if (msg.includes("content") || msg.includes("nsfw") || msg.includes("policy")) return new ProviderError("CONTENT_VIOLATION", msg, providerId, false, false);
  return new ProviderError("TRANSIENT", msg, providerId);
}

async function executeKling(
  providerId: string, modelName: string, params: VideoParams, ctx: ExecutionContext,
): Promise<AdapterResult> {
  try {
    let taskId: string;
    let taskType: "image2video" | "text2video";
    const duration = String(params.durationSeconds ?? 5) as "5" | "10";
    const mode = params.mode ?? "pro";

    if (params.imageUrl) {
      const kp: KlingImageToVideoParams = {
        image: params.imageUrl, prompt: params.prompt, duration, mode, modelName,
        negativePrompt: params.negativePrompt, cfgScale: params.cfgScale,
      };
      const r = await imageToVideo(kp);
      if (r.code !== 0) throw mapKlingError(r.code, r.message, providerId);
      taskId = r.data.task_id; taskType = "image2video";
    } else {
      const kp: KlingTextToVideoParams = {
        prompt: params.prompt, duration, mode, modelName,
        negativePrompt: params.negativePrompt, cfgScale: params.cfgScale,
      };
      const r = await textToVideo(kp);
      if (r.code !== 0) throw mapKlingError(r.code, r.message, providerId);
      taskId = r.data.task_id; taskType = "text2video";
    }

    const final = await pollTaskUntilDone(taskId, { type: taskType, maxWaitMs: ctx.timeout });
    const videos = final.data?.task_result?.videos;
    if (!videos?.length) throw new ProviderError("TRANSIENT", "No videos returned", providerId);
    return {
      storageUrl: videos[0].url, mimeType: "video/mp4",
      durationSeconds: parseFloat(videos[0].duration) || undefined,
      metadata: { taskId, videoId: videos[0].id, model: modelName, mode },
    };
  } catch (err) { throw mapGenericError(err, providerId); }
}

// ─── Kling 1.6 ──────────────────────────────────────────────────────────
class Kling16Adapter implements ProviderAdapter {
  readonly providerId = "kling_16";
  validateParams(p: GenerationParams) {
    const v = p as VideoParams; const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 5) e.push("max 5s for Kling 1.6");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }
  estimateCostUsd(p: GenerationParams) { return Math.ceil(((p as VideoParams).durationSeconds ?? 5) / 5) * 0.028; }
  execute(p: GenerationParams, ctx: ExecutionContext) { return executeKling(this.providerId, "kling-v1-6", p as VideoParams, ctx); }
}

// ─── Kling 2.6 ──────────────────────────────────────────────────────────
class Kling26Adapter implements ProviderAdapter {
  readonly providerId = "kling_26";
  validateParams(p: GenerationParams) {
    const v = p as VideoParams; const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) e.push("max 10s for Kling 2.6");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }
  estimateCostUsd(p: GenerationParams) { return Math.ceil(((p as VideoParams).durationSeconds ?? 5) / 5) * 0.070; }
  execute(p: GenerationParams, ctx: ExecutionContext) { return executeKling(this.providerId, "kling-v2-6", p as VideoParams, ctx); }
}

// ─── Kling 3 Omni ───────────────────────────────────────────────────────
class Kling3OmniAdapter implements ProviderAdapter {
  readonly providerId = "kling_3_omni";
  validateParams(p: GenerationParams) {
    const v = p as VideoParams; const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) e.push("max 10s for Kling 3 Omni");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }
  estimateCostUsd(p: GenerationParams) { return Math.ceil(((p as VideoParams).durationSeconds ?? 5) / 5) * 0.140; }
  async execute(p: GenerationParams, ctx: ExecutionContext) {
    // Kling 3 Omni uses the omni-video endpoint for lip sync
    const v = p as VideoParams;
    if (v.elementIds?.length) {
      // Use omni-video endpoint (lip sync mode)
      // For now, fall back to standard i2v until omni endpoint is wired
      return executeKling(this.providerId, "kling-v3-omni", v, ctx);
    }
    return executeKling(this.providerId, "kling-v3-omni", v, ctx);
  }
}

registerAdapter(new Kling16Adapter());
registerAdapter(new Kling26Adapter());
registerAdapter(new Kling3OmniAdapter());
