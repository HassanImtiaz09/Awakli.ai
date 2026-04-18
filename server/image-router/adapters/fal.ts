/**
 * Fal.ai Adapter — High-throughput image generation provider.
 *
 * Fal.ai is the preferred provider for thumbnails, UI assets, and video frames
 * because of its fast inference times and low per-image cost.
 * Also used for background art when ControlNet is not needed.
 *
 * API: REST (https://queue.fal.run)
 * Auth: Bearer token (FAL_API_KEY)
 * Pricing: ~$0.01/image (SDXL), ~$0.03/image (Flux)
 * ControlNet: Not supported via this adapter
 * LoRA: Supported via model URL parameter
 *
 * @see Prompt 25, Section 6.3
 */
import type {
  ImageProviderAdapter,
  ImageGenerateParams,
  ImageAdapterResult,
  WorkloadType,
} from "../types";

// ─── Fal.ai API Types ──────────────────────────────────────────────────

interface FalSubmitResponse {
  request_id: string;
  response_url: string;
  status_url: string;
  cancel_url: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_url?: string;
  logs?: Array<{ message: string; timestamp: string }>;
}

interface FalResultResponse {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  timings?: {
    inference: number;
  };
  seed?: number;
  has_nsfw_concepts?: boolean[];
}

// ─── Model Endpoints ────────────────────────────────────────────────────

/**
 * Fal.ai model endpoints, ordered by quality/cost tradeoff.
 */
const FAL_MODELS = {
  /** Fast, cheap — ideal for thumbnails and UI assets */
  turbo: "fal-ai/fast-sdxl",
  /** Standard quality — good for backgrounds */
  standard: "fal-ai/flux/schnell",
  /** High quality — for character sheets and panels */
  quality: "fal-ai/flux/dev",
} as const;

type FalModelTier = keyof typeof FAL_MODELS;

/**
 * Map workload types to fal model tiers.
 */
const WORKLOAD_MODEL_MAP: Record<WorkloadType, FalModelTier> = {
  manga_panel: "quality",
  character_sheet: "quality",
  background_art: "standard",
  cover_art: "quality",
  thumbnail: "turbo",
  ui_asset: "turbo",
};

// ─── Cost Estimation ────────────────────────────────────────────────────

/**
 * Fal.ai pricing per image by model tier.
 */
const COST_PER_IMAGE: Record<FalModelTier, number> = {
  turbo: 0.005,    // ~$0.005/image
  standard: 0.01,  // ~$0.01/image
  quality: 0.03,   // ~$0.03/image
};

const HIGH_RES_MULTIPLIER = 1.5; // >1024px on either dimension

// ─── Adapter Implementation ─────────────────────────────────────────────

export class FalAdapter implements ImageProviderAdapter {
  readonly providerId = "fal";
  readonly displayName = "Fal.ai";

  private readonly pollIntervalMs = 1500;
  private readonly maxPollAttempts = 60; // 60 * 1.5s = 90s max

  supportsWorkload(workload: WorkloadType): boolean {
    // Fal supports all workloads
    return true;
  }

  supportsControlNet(): boolean {
    // Fal doesn't support ControlNet via this adapter
    return false;
  }

  supportsLoRA(): boolean {
    // Fal supports LoRA via model URL for Flux models
    return true;
  }

  /**
   * Get the fal model endpoint for a given workload type.
   */
  getModelForWorkload(workload: WorkloadType): { endpoint: string; tier: FalModelTier } {
    const tier = WORKLOAD_MODEL_MAP[workload] ?? "standard";
    return { endpoint: FAL_MODELS[tier], tier };
  }

  validateParams(params: ImageGenerateParams): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!params.prompt || params.prompt.trim().length === 0) {
      errors.push("prompt is required");
    }
    if (params.prompt && params.prompt.length > 2000) {
      errors.push("prompt must be under 2000 characters");
    }
    if (params.width < 64 || params.width > 2048) {
      errors.push("width must be between 64 and 2048");
    }
    if (params.height < 64 || params.height > 2048) {
      errors.push("height must be between 64 and 2048");
    }
    if (params.numImages < 1 || params.numImages > 4) {
      errors.push("numImages must be between 1 and 4");
    }
    if (params.controlNetModel) {
      errors.push("Fal.ai adapter does not support ControlNet; use Runware instead");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  estimateCostUsd(params: ImageGenerateParams, workloadType?: WorkloadType): number {
    const tier = workloadType ? WORKLOAD_MODEL_MAP[workloadType] : "standard";
    let cost = COST_PER_IMAGE[tier];

    if (params.width > 1024 || params.height > 1024) {
      cost *= HIGH_RES_MULTIPLIER;
    }

    return cost * params.numImages;
  }

  async generate(
    params: ImageGenerateParams,
    apiKey: string,
    timeoutMs: number = 90_000,
    workloadType?: WorkloadType,
  ): Promise<ImageAdapterResult> {
    const { endpoint, tier } = this.getModelForWorkload(workloadType ?? "thumbnail");

    // Build the request body
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      image_size: {
        width: params.width,
        height: params.height,
      },
      num_images: params.numImages,
      seed: params.seed,
      guidance_scale: params.guidanceScale ?? 7.5,
      num_inference_steps: tier === "turbo" ? 4 : tier === "standard" ? 4 : 28,
      enable_safety_checker: true,
    };

    // Add LoRA if specified (Flux models support this)
    if (params.loraModelUrl) {
      body.loras = [{
        path: params.loraModelUrl,
        scale: params.loraWeight ?? 0.8,
      }];
    }

    // Step 1: Submit to queue
    const submitResponse = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (!submitResponse.ok) {
      const errText = await submitResponse.text().catch(() => "");
      if (submitResponse.status === 429) {
        throw new Error(`[Fal] Rate limited: ${errText}`);
      }
      if (submitResponse.status === 422) {
        throw new Error(`[Fal] Content violation: ${errText}`);
      }
      throw new Error(`[Fal] Submit failed ${submitResponse.status}: ${errText}`);
    }

    const submitData = await submitResponse.json() as FalSubmitResponse;
    const requestId = submitData.request_id;
    if (!requestId) {
      throw new Error("[Fal] No request_id in submit response");
    }

    // Step 2: Poll for completion
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeoutMs && attempts < this.maxPollAttempts) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      attempts++;

      const statusResponse = await fetch(submitData.status_url, {
        headers: { "Authorization": `Key ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json() as FalStatusResponse;

      if (statusData.status === "COMPLETED") {
        // Fetch the result
        const resultResponse = await fetch(submitData.response_url, {
          headers: { "Authorization": `Key ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });

        if (!resultResponse.ok) {
          throw new Error(`[Fal] Failed to fetch result: ${resultResponse.status}`);
        }

        const resultData = await resultResponse.json() as FalResultResponse;

        if (!resultData.images || resultData.images.length === 0) {
          throw new Error("[Fal] No images in result");
        }

        const firstImage = resultData.images[0];
        const estimatedCost = this.estimateCostUsd(params, workloadType);

        return {
          imageUrl: firstImage.url,
          mimeType: firstImage.content_type || "image/png",
          actualCostUsd: estimatedCost,
          providerTaskId: requestId,
          metadata: {
            model: endpoint,
            tier,
            seed: resultData.seed,
            inferenceTimeMs: resultData.timings?.inference
              ? Math.round(resultData.timings.inference * 1000)
              : undefined,
            hasNsfw: resultData.has_nsfw_concepts?.[0] ?? false,
            pollAttempts: attempts,
          },
        };
      }

      if (statusData.status === "FAILED") {
        throw new Error(`[Fal] Generation failed`);
      }
    }

    throw new Error(`[Fal] Job timed out after ${attempts} poll attempts`);
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────

export const falAdapter = new FalAdapter();

// ─── Re-export constants for testing ────────────────────────────────────

export { FAL_MODELS, WORKLOAD_MODEL_MAP, COST_PER_IMAGE };
