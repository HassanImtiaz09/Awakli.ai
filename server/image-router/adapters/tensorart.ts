/**
 * TensorArt Adapter — Fallback image generation provider.
 *
 * TensorArt is the secondary/fallback provider for standard quality workloads.
 * It uses a credit-based billing system and supports a wide model marketplace.
 *
 * API: REST (https://api.tensor.art/v1)
 * Auth: Bearer token
 * Pricing: Credit-based (~0.5 credits/image ≈ $0.005/image for standard)
 * ControlNet: Limited (via model-specific workflows)
 * LoRA: Via model marketplace (not custom URL injection)
 *
 * @see Prompt 25, Section 6.2
 */
import type {
  ImageProviderAdapter,
  ImageGenerateParams,
  ImageAdapterResult,
  WorkloadType,
} from "../types";

// ─── TensorArt API Types ────────────────────────────────────────────────

interface TensorArtCreateJobRequest {
  request_id?: string;
  stages: Array<{
    type: "INPUT_INITIALIZE" | "DIFFUSION" | "IMAGE_TO_UPSCALER";
    inputInitialize?: {
      seed: number;
      count: number;
    };
    diffusion?: {
      width: number;
      height: number;
      prompts: Array<{ text: string; weight?: number }>;
      negativePrompts?: Array<{ text: string; weight?: number }>;
      sdModel: string;
      sdVae?: string;
      steps: number;
      cfgScale: number;
      sampler: string;
      clipSkip?: number;
      lora?: Array<{
        loraModel: string;
        weight: number;
      }>;
    };
  }>;
}

interface TensorArtJobResponse {
  job: {
    id: string;
    status: "WAITING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
    successInfo?: {
      images: Array<{
        url: string;
        width: number;
        height: number;
        seed: number;
      }>;
    };
    failedInfo?: {
      reason: string;
    };
    credits?: number;
  };
}

// ─── Cost Estimation ────────────────────────────────────────────────────

/**
 * TensorArt pricing: credit-based.
 * ~0.5 credits/standard image ≈ $0.005/image.
 * ~1.0 credits/HD image ≈ $0.010/image.
 * Credit-to-USD rate: ~$0.01/credit.
 */
const CREDIT_TO_USD = 0.01;
const STANDARD_CREDITS = 0.5;
const HD_CREDITS = 1.0;

// ─── Adapter Implementation ─────────────────────────────────────────────

export class TensorArtAdapter implements ImageProviderAdapter {
  readonly providerId = "tensorart";
  readonly displayName = "TensorArt";

  private readonly baseUrl = "https://api.tensor.art/v1";
  private readonly defaultModel = "600423083519508503"; // SDXL base on TensorArt
  private readonly defaultSteps = 25;
  private readonly defaultSampler = "Euler a";
  private readonly pollIntervalMs = 3000;
  private readonly maxPollAttempts = 40; // 40 * 3s = 120s max

  supportsWorkload(workload: WorkloadType): boolean {
    // TensorArt supports all workloads but is best for standard quality
    return true;
  }

  supportsControlNet(): boolean {
    // TensorArt has limited ControlNet via workflows, not direct API
    return false;
  }

  supportsLoRA(): boolean {
    // TensorArt supports LoRA via marketplace models, not custom URLs
    return false;
  }

  validateParams(params: ImageGenerateParams): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!params.prompt || params.prompt.trim().length === 0) {
      errors.push("prompt is required");
    }
    if (params.prompt && params.prompt.length > 1500) {
      errors.push("prompt must be under 1500 characters");
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
    // TensorArt doesn't support custom ControlNet or LoRA URLs
    if (params.controlNetModel) {
      errors.push("TensorArt does not support direct ControlNet; use Runware instead");
    }
    if (params.loraModelUrl) {
      errors.push("TensorArt does not support custom LoRA URLs; use Runware instead");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  estimateCostUsd(params: ImageGenerateParams): number {
    const isHD = params.width > 1024 || params.height > 1024;
    const creditsPerImage = isHD ? HD_CREDITS : STANDARD_CREDITS;
    return creditsPerImage * CREDIT_TO_USD * params.numImages;
  }

  async generate(
    params: ImageGenerateParams,
    apiKey: string,
    timeoutMs: number = 120_000,
  ): Promise<ImageAdapterResult> {
    // Step 1: Create the job
    const createBody: TensorArtCreateJobRequest = {
      stages: [
        {
          type: "INPUT_INITIALIZE",
          inputInitialize: {
            seed: params.seed ?? Math.floor(Math.random() * 2147483647),
            count: params.numImages,
          },
        },
        {
          type: "DIFFUSION",
          diffusion: {
            width: params.width,
            height: params.height,
            prompts: [{ text: params.prompt }],
            negativePrompts: params.negativePrompt
              ? [{ text: params.negativePrompt }]
              : undefined,
            sdModel: this.defaultModel,
            steps: this.defaultSteps,
            cfgScale: params.guidanceScale ?? 7.0,
            sampler: this.defaultSampler,
          },
        },
      ],
    };

    const createResponse = await fetch(`${this.baseUrl}/jobs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text().catch(() => "");
      if (createResponse.status === 429) {
        throw new Error(`[TensorArt] Rate limited: ${errText}`);
      }
      throw new Error(`[TensorArt] Create job failed ${createResponse.status}: ${errText}`);
    }

    const createData = await createResponse.json() as TensorArtJobResponse;
    const jobId = createData.job?.id;
    if (!jobId) {
      throw new Error("[TensorArt] No job ID in create response");
    }

    // Step 2: Poll for completion
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeoutMs && attempts < this.maxPollAttempts) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      attempts++;

      const pollResponse = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!pollResponse.ok) continue;

      const pollData = await pollResponse.json() as TensorArtJobResponse;
      const job = pollData.job;

      if (job.status === "SUCCESS" && job.successInfo?.images?.length) {
        const firstImage = job.successInfo.images[0];
        return {
          imageUrl: firstImage.url,
          mimeType: "image/png",
          actualCostUsd: (job.credits ?? this.estimateCostUsd(params) / CREDIT_TO_USD) * CREDIT_TO_USD,
          providerTaskId: jobId,
          metadata: {
            model: this.defaultModel,
            steps: this.defaultSteps,
            seed: firstImage.seed,
            credits: job.credits,
            pollAttempts: attempts,
          },
        };
      }

      if (job.status === "FAILED") {
        throw new Error(`[TensorArt] Job failed: ${job.failedInfo?.reason ?? "unknown"}`);
      }

      if (job.status === "CANCELLED") {
        throw new Error("[TensorArt] Job was cancelled");
      }
    }

    throw new Error(`[TensorArt] Job timed out after ${attempts} poll attempts`);
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────

export const tensorArtAdapter = new TensorArtAdapter();
