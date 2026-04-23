/**
 * fal.ai-backed Kling V3 Adapters
 *
 * These adapters route Kling V3 video generation through fal.ai's
 * pay-as-you-go infrastructure. They register as separate provider IDs
 * (fal_kling_v3_std, fal_kling_v3_pro, fal_kling_v3_lipsync) so the
 * provider-router can select them alongside direct Kling adapters.
 *
 * Pricing matches official Kling API rates:
 * - Standard: $0.084/s (5s=$0.42, 10s=$0.84)
 * - Pro: $0.14/s (5s=$0.70, 10s=$1.40)
 * - Lip Sync (audio-to-video): $0.14/s
 */
import type {
  ProviderAdapter, GenerationParams, VideoParams, ExecutionContext, AdapterResult,
} from "../types";
import { ProviderError } from "../types";
import { registerAdapter } from "../registry";
import {
  falImageToVideo, falTextToVideo, falOmniVideo, falLipSync,
  isFalAvailable,
  type FalImageToVideoParams,
  type FalTextToVideoParams,
  type FalOmniVideoParams,
  type FalLipSyncParams,
} from "../../fal-video";

function mapFalError(err: unknown, providerId: string): ProviderError {
  if (err instanceof ProviderError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("timed out") || msg.includes("TIMEOUT")) return new ProviderError("TIMEOUT", msg, providerId);
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("Too Many")) return new ProviderError("RATE_LIMITED", msg, providerId);
  if (msg.includes("content") || msg.includes("nsfw") || msg.includes("policy") || msg.includes("CONTENT_MODERATION")) return new ProviderError("CONTENT_VIOLATION", msg, providerId, false, false);
  if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) return new ProviderError("INVALID_PARAMS", msg, providerId, false, false);
  if (msg.includes("not configured") || msg.includes("FAL_API_KEY")) return new ProviderError("INVALID_PARAMS", msg, providerId, false, false);
  return new ProviderError("TRANSIENT", msg, providerId);
}

// ─── fal.ai Kling V3 Standard ──────────────────────────────────────────────

class FalKlingV3StandardAdapter implements ProviderAdapter {
  readonly providerId = "fal_kling_v3_std";

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) e.push("max 10s for Kling V3 Standard");
    if (!isFalAvailable()) e.push("FAL_API_KEY not configured");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }

  estimateCostUsd(p: GenerationParams) {
    const dur = (p as VideoParams).durationSeconds ?? 5;
    return dur * 0.084; // $0.084/s standard
  }

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    try {
      const duration = String(v.durationSeconds ?? 5) as "5" | "10";

      if (v.imageUrl) {
        const params: FalImageToVideoParams = {
          image: v.imageUrl,
          prompt: v.prompt,
          duration,
          mode: "std",
          negativePrompt: v.negativePrompt,
          cfgScale: v.cfgScale,
        };
        const result = await falImageToVideo(params);
        return {
          storageUrl: result.videoUrl,
          mimeType: "video/mp4",
          durationSeconds: parseInt(duration),
          metadata: { requestId: result.requestId, model: "kling-v3-standard", mode: "std", provider: "fal.ai" },
        };
      } else {
        const params: FalTextToVideoParams = {
          prompt: v.prompt,
          duration,
          mode: "std",
          negativePrompt: v.negativePrompt,
          cfgScale: v.cfgScale,
        };
        const result = await falTextToVideo(params);
        return {
          storageUrl: result.videoUrl,
          mimeType: "video/mp4",
          durationSeconds: parseInt(duration),
          metadata: { requestId: result.requestId, model: "kling-v3-standard", mode: "std", provider: "fal.ai" },
        };
      }
    } catch (err) {
      throw mapFalError(err, this.providerId);
    }
  }
}

// ─── fal.ai Kling V3 Pro ───────────────────────────────────────────────────

class FalKlingV3ProAdapter implements ProviderAdapter {
  readonly providerId = "fal_kling_v3_pro";

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) e.push("max 10s for Kling V3 Pro");
    if (!isFalAvailable()) e.push("FAL_API_KEY not configured");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }

  estimateCostUsd(p: GenerationParams) {
    const dur = (p as VideoParams).durationSeconds ?? 5;
    return dur * 0.14; // $0.14/s pro
  }

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    try {
      const duration = String(v.durationSeconds ?? 5) as "5" | "10";

      if (v.imageUrl) {
        const params: FalImageToVideoParams = {
          image: v.imageUrl,
          prompt: v.prompt,
          duration,
          mode: "pro",
          negativePrompt: v.negativePrompt,
          cfgScale: v.cfgScale,
          generateAudio: v.generateAudio,
        };
        const result = await falImageToVideo(params);
        return {
          storageUrl: result.videoUrl,
          mimeType: "video/mp4",
          durationSeconds: parseInt(duration),
          metadata: { requestId: result.requestId, model: "kling-v3-pro", mode: "pro", provider: "fal.ai" },
        };
      } else {
        const params: FalTextToVideoParams = {
          prompt: v.prompt,
          duration,
          mode: "pro",
          negativePrompt: v.negativePrompt,
          cfgScale: v.cfgScale,
          generateAudio: v.generateAudio,
        };
        const result = await falTextToVideo(params);
        return {
          storageUrl: result.videoUrl,
          mimeType: "video/mp4",
          durationSeconds: parseInt(duration),
          metadata: { requestId: result.requestId, model: "kling-v3-pro", mode: "pro", provider: "fal.ai" },
        };
      }
    } catch (err) {
      throw mapFalError(err, this.providerId);
    }
  }
}

// ─── fal.ai Kling V3 Omni (Pro + Audio/Lip Sync) ──────────────────────────

class FalKlingV3OmniAdapter implements ProviderAdapter {
  readonly providerId = "fal_kling_v3_omni";

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const e: string[] = [];
    if (!v.prompt) e.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 10) e.push("max 10s for Kling V3 Omni");
    if (!isFalAvailable()) e.push("FAL_API_KEY not configured");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }

  estimateCostUsd(p: GenerationParams) {
    const dur = (p as VideoParams).durationSeconds ?? 10;
    return dur * 0.14; // $0.14/s pro with audio
  }

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    try {
      const duration = String(v.durationSeconds ?? 10);

      const params: FalOmniVideoParams = {
        prompt: v.prompt,
        imageUrl: v.imageUrl,
        duration,
        mode: "pro",
        generateAudio: true,
        aspectRatio: "16:9",
        elements: v.elementIds?.length
          ? v.elementIds.map(id => ({ frontalImageUrl: id }))
          : undefined,
      };

      const result = await falOmniVideo(params);
      return {
        storageUrl: result.videoUrl,
        mimeType: "video/mp4",
        durationSeconds: parseInt(duration),
        metadata: {
          requestId: result.requestId,
          model: "kling-v3-omni",
          mode: "pro",
          provider: "fal.ai",
          hasAudio: true,
          hasLipSync: true,
        },
      };
    } catch (err) {
      throw mapFalError(err, this.providerId);
    }
  }
}

// ─── fal.ai Kling Lip Sync (Post-process) ──────────────────────────────────

class FalKlingLipSyncAdapter implements ProviderAdapter {
  readonly providerId = "fal_kling_lipsync";

  validateParams(p: GenerationParams) {
    const v = p as VideoParams;
    const e: string[] = [];
    if (!v.videoUrl) e.push("videoUrl required for lip sync");
    if (!v.audioUrl) e.push("audioUrl required for lip sync");
    if (!isFalAvailable()) e.push("FAL_API_KEY not configured");
    return { valid: !e.length, errors: e.length ? e : undefined };
  }

  estimateCostUsd(p: GenerationParams) {
    const dur = (p as VideoParams).durationSeconds ?? 10;
    return dur * 0.14; // $0.14/s lip sync
  }

  async execute(p: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const v = p as VideoParams;
    try {
      const params: FalLipSyncParams = {
        videoUrl: v.videoUrl!,
        audioUrl: v.audioUrl!,
        language: "en",
      };

      const result = await falLipSync(params);
      return {
        storageUrl: result.videoUrl,
        mimeType: "video/mp4",
        durationSeconds: v.durationSeconds,
        metadata: {
          requestId: result.requestId,
          model: "kling-lipsync",
          provider: "fal.ai",
          hasLipSync: true,
        },
      };
    } catch (err) {
      throw mapFalError(err, this.providerId);
    }
  }
}

// ─── Register all fal.ai Kling adapters ─────────────────────────────────────

registerAdapter(new FalKlingV3StandardAdapter());
registerAdapter(new FalKlingV3ProAdapter());
registerAdapter(new FalKlingV3OmniAdapter());
registerAdapter(new FalKlingLipSyncAdapter());
