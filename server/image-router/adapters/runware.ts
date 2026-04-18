/**
 * Runware Adapter — Primary image generation provider.
 *
 * Runware is the primary provider for manga panels, character sheets, and cover art
 * because it supports ControlNet (canny, openpose, depth) and custom LoRA injection.
 *
 * API: REST (https://api.runware.ai/v1)
 * Auth: Bearer token
 * Pricing: ~$0.002/step, typical image ~$0.004-0.008
 * ControlNet: canny, openpose, depth, scribble, softedge, lineart
 * LoRA: Custom safetensors URL injection
 *
 * @see Prompt 25, Section 6.1
 */
import type {
  ImageProviderAdapter,
  ImageGenerateParams,
  ImageAdapterResult,
  WorkloadType,
} from "../types";

// ─── Runware API Types ──────────────────────────────────────────────────

interface RunwareImageRequest {
  taskType: "imageInference";
  taskUUID?: string;
  positivePrompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  numberResults: number;
  model: string;
  steps?: number;
  CFGScale?: number;
  seed?: number;
  scheduler?: string;
  outputFormat?: string;
  // ControlNet
  controlNet?: Array<{
    model: string;
    guideImage: string;
    weight: number;
    startStep?: number;
    endStep?: number;
  }>;
  // LoRA
  lora?: Array<{
    model: string;
    weight: number;
  }>;
}

interface RunwareImageResponse {
  data: Array<{
    taskType: string;
    taskUUID: string;
    imageUUID: string;
    imageURL: string;
    cost: number;
  }>;
}

// ─── ControlNet Model Mapping ───────────────────────────────────────────

const CONTROLNET_MODELS: Record<string, string> = {
  canny: "civitai:38784@44716",
  openpose: "civitai:25252@29458",
  depth: "civitai:38784@44717",
  scribble: "civitai:38784@44718",
  softedge: "civitai:38784@44719",
  lineart: "civitai:38784@44720",
};

// ─── Cost Estimation ────────────────────────────────────────────────────

/**
 * Runware pricing: ~$0.002/step, default 20 steps = $0.04/image.
 * ControlNet adds ~$0.005/image.
 * LoRA adds ~$0.003/image.
 */
const BASE_COST_PER_IMAGE = 0.004;
const CONTROLNET_SURCHARGE = 0.005;
const LORA_SURCHARGE = 0.003;
const HIGH_RES_MULTIPLIER = 1.5; // >1024px on either dimension

// ─── Adapter Implementation ─────────────────────────────────────────────

export class RunwareAdapter implements ImageProviderAdapter {
  readonly providerId = "runware";
  readonly displayName = "Runware";

  private readonly baseUrl = "https://api.runware.ai/v1";
  private readonly defaultModel = "civitai:101055@128078"; // SDXL base
  private readonly defaultSteps = 20;
  private readonly defaultScheduler = "FlowMatchEulerDiscreteScheduler";

  supportsWorkload(workload: WorkloadType): boolean {
    // Runware supports all workload types
    return true;
  }

  supportsControlNet(): boolean {
    return true;
  }

  supportsLoRA(): boolean {
    return true;
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
    if (params.controlNetModel && !CONTROLNET_MODELS[params.controlNetModel]) {
      errors.push(`unsupported ControlNet model: ${params.controlNetModel}. Supported: ${Object.keys(CONTROLNET_MODELS).join(", ")}`);
    }
    if (params.controlNetModel && !params.controlNetImageUrl) {
      errors.push("controlNetImageUrl is required when controlNetModel is specified");
    }
    if (params.controlNetStrength !== undefined && (params.controlNetStrength < 0 || params.controlNetStrength > 1)) {
      errors.push("controlNetStrength must be between 0 and 1");
    }
    if (params.loraWeight !== undefined && (params.loraWeight < 0 || params.loraWeight > 1)) {
      errors.push("loraWeight must be between 0 and 1");
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  estimateCostUsd(params: ImageGenerateParams): number {
    let cost = BASE_COST_PER_IMAGE;

    // ControlNet surcharge
    if (params.controlNetModel) {
      cost += CONTROLNET_SURCHARGE;
    }

    // LoRA surcharge
    if (params.loraModelUrl) {
      cost += LORA_SURCHARGE;
    }

    // High-res multiplier
    if (params.width > 1024 || params.height > 1024) {
      cost *= HIGH_RES_MULTIPLIER;
    }

    return cost * params.numImages;
  }

  async generate(
    params: ImageGenerateParams,
    apiKey: string,
    timeoutMs: number = 60_000,
  ): Promise<ImageAdapterResult> {
    // Build the request body
    const body: RunwareImageRequest[] = [{
      taskType: "imageInference",
      positivePrompt: params.prompt,
      negativePrompt: params.negativePrompt,
      width: params.width,
      height: params.height,
      numberResults: params.numImages,
      model: this.defaultModel,
      steps: this.defaultSteps,
      CFGScale: params.guidanceScale ?? 7.5,
      seed: params.seed,
      scheduler: this.defaultScheduler,
      outputFormat: "WEBP",
    }];

    // Add ControlNet if specified
    if (params.controlNetModel && params.controlNetImageUrl) {
      const cnModelId = CONTROLNET_MODELS[params.controlNetModel];
      if (cnModelId) {
        body[0].controlNet = [{
          model: cnModelId,
          guideImage: params.controlNetImageUrl,
          weight: params.controlNetStrength ?? 0.75,
        }];
      }
    }

    // Add LoRA if specified
    if (params.loraModelUrl) {
      body[0].lora = [{
        model: params.loraModelUrl,
        weight: params.loraWeight ?? 0.8,
      }];
    }

    // Make the API call
    const response = await fetch(`${this.baseUrl}/image`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      if (response.status === 429) {
        throw new Error(`[Runware] Rate limited: ${errText}`);
      }
      if (response.status === 422) {
        throw new Error(`[Runware] Content violation: ${errText}`);
      }
      throw new Error(`[Runware] API error ${response.status}: ${errText}`);
    }

    const data = await response.json() as RunwareImageResponse;

    if (!data.data || data.data.length === 0) {
      throw new Error("[Runware] No images in response");
    }

    const firstImage = data.data[0];

    return {
      imageUrl: firstImage.imageURL,
      mimeType: "image/webp",
      actualCostUsd: firstImage.cost ?? this.estimateCostUsd(params),
      providerTaskId: firstImage.taskUUID,
      metadata: {
        imageUUID: firstImage.imageUUID,
        model: this.defaultModel,
        steps: this.defaultSteps,
        hasControlNet: !!params.controlNetModel,
        hasLoRA: !!params.loraModelUrl,
      },
    };
  }
}

// ─── Singleton Export ───────────────────────────────────────────────────

export const runwareAdapter = new RunwareAdapter();
