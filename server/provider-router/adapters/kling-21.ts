/**
 * Kling 2.1 Adapter — Reference implementation
 * Wraps the existing kling.ts module into the ProviderAdapter interface.
 * NO business logic here — only API shape translation.
 */
import type {
  ProviderAdapter,
  GenerationParams,
  VideoParams,
  ExecutionContext,
  AdapterResult,
} from "../types";
import { ProviderError } from "../types";
import { registerAdapter } from "../registry";
import {
  imageToVideo,
  textToVideo,
  pollTaskUntilDone,
  type KlingImageToVideoParams,
  type KlingTextToVideoParams,
} from "../../kling";

export class Kling21Adapter implements ProviderAdapter {
  readonly providerId = "kling_21";

  validateParams(params: GenerationParams): { valid: boolean; errors?: string[] } {
    const p = params as VideoParams;
    const errors: string[] = [];
    if (!p.prompt) errors.push("prompt is required");
    if (p.durationSeconds && p.durationSeconds > 10) errors.push("max duration is 10s for Kling 2.1");
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  estimateCostUsd(params: GenerationParams): number {
    const p = params as VideoParams;
    const duration = p.durationSeconds ?? 5;
    const clips = Math.ceil(duration / 5);
    const mode = p.mode ?? "pro";
    // Kling 2.1: $0.042/5s clip (pro), $0.028/5s clip (std)
    const ratePerClip = mode === "pro" ? 0.042 : 0.028;
    return clips * ratePerClip;
  }

  async execute(params: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
    const p = params as VideoParams;
    const duration = String(p.durationSeconds ?? 5) as "5" | "10";
    const mode = p.mode ?? "pro";

    try {
      let taskId: string;
      let taskType: "image2video" | "text2video";

      if (p.imageUrl) {
        // Image-to-video
        const klingParams: KlingImageToVideoParams = {
          image: p.imageUrl,
          prompt: p.prompt,
          duration,
          mode,
          modelName: "kling-v2-1",
          negativePrompt: p.negativePrompt,
          cfgScale: p.cfgScale,
        };
        const result = await imageToVideo(klingParams);
        if (result.code !== 0) {
          throw this.mapKlingError(result.code, result.message);
        }
        taskId = result.data.task_id;
        taskType = "image2video";
      } else {
        // Text-to-video
        const klingParams: KlingTextToVideoParams = {
          prompt: p.prompt,
          duration,
          mode,
          modelName: "kling-v2-1",
          negativePrompt: p.negativePrompt,
          cfgScale: p.cfgScale,
        };
        const result = await textToVideo(klingParams);
        if (result.code !== 0) {
          throw this.mapKlingError(result.code, result.message);
        }
        taskId = result.data.task_id;
        taskType = "text2video";
      }

      // Poll until done
      const finalResult = await pollTaskUntilDone(taskId, {
        type: taskType,
        maxWaitMs: ctx.timeout,
      });

      const videos = finalResult.data?.task_result?.videos;
      if (!videos || videos.length === 0) {
        throw new ProviderError("TRANSIENT", "No videos returned", this.providerId);
      }

      const video = videos[0];
      return {
        storageUrl: video.url,
        mimeType: "video/mp4",
        durationSeconds: parseFloat(video.duration) || undefined,
        metadata: {
          taskId,
          videoId: video.id,
          model: "kling-v2-1",
          mode,
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // Map common Kling errors
      if (msg.includes("timed out")) {
        throw new ProviderError("TIMEOUT", msg, this.providerId);
      }
      if (msg.includes("rate limit") || msg.includes("429")) {
        throw new ProviderError("RATE_LIMITED", msg, this.providerId);
      }
      if (msg.includes("content") || msg.includes("nsfw") || msg.includes("policy")) {
        throw new ProviderError("CONTENT_VIOLATION", msg, this.providerId, false, false);
      }
      throw new ProviderError("TRANSIENT", msg, this.providerId);
    }
  }

  private mapKlingError(code: number, message: string): ProviderError {
    // Kling error codes: https://docs.qingque.cn/d/home/eZQBqmS5Ld-iR0U-cqhBfwXUg
    if (code === 1001 || code === 1002) {
      return new ProviderError("INVALID_PARAMS", message, this.providerId, false, false);
    }
    if (code === 1003 || code === 1004) {
      return new ProviderError("RATE_LIMITED", message, this.providerId);
    }
    if (code === 1005) {
      return new ProviderError("CONTENT_VIOLATION", message, this.providerId, false, false);
    }
    return new ProviderError("TRANSIENT", message, this.providerId);
  }
}

// Self-register
registerAdapter(new Kling21Adapter());
