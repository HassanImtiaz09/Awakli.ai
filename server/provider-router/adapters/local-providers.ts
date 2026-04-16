/**
 * Local Provider Adapters — 6 self-hosted GPU model adapters
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Each adapter implements ProviderAdapter via createLocalAdapter factory:
 * 1. local_animatediff — Draft video generation (AnimateDiff v3, 768p, 8fps)
 * 2. local_svd — Video interpolation (SVD XT 1.1, 1024p, 14fps)
 * 3. local_rife — Frame interpolation (RIFE v4.22, 8fps→24fps)
 * 4. local_controlnet — Structural conditioning (ControlNet v1.1 canny/lineart)
 * 5. local_ip_adapter — Character consistency (IP-Adapter FaceID)
 * 6. local_realesrgan — Image/frame upscaling (Real-ESRGAN x4plus anime)
 */
import type { GenerationParams, VideoParams, ImageParams, AdapterResult } from "../types";
import { registerAdapter } from "../registry";
import { createLocalAdapter } from "../local-infra/base-local-adapter";
import { estimateLocalProviderCost } from "../local-infra/gpu-cost-model";
import type { InferenceJobInput, InferenceJobResult } from "../local-infra/types";

// ─── 1. LocalAnimateDiffAdapter — Draft Video Generation ────────────────
// AnimateDiff v3 + anime Motion LoRA, base: Anything V5
// modality: video, max_resolution: 768p, max_duration: 5s, fps: 8
registerAdapter(createLocalAdapter({
  providerId: "local_animatediff",
  modelType: "animatediff",

  validate(params: GenerationParams): string[] {
    const v = params as VideoParams;
    const errors: string[] = [];
    if (!v.prompt) errors.push("prompt required");
    if (v.durationSeconds && v.durationSeconds > 5) errors.push("max 5s for local_animatediff");
    if (v.resolution && !["480p", "512p", "768p"].includes(v.resolution)) {
      errors.push("local_animatediff supports 480p, 512p, 768p");
    }
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const v = params as VideoParams;
    return {
      model_type: "animatediff",
      model_version: modelVersion,
      params: {
        prompt: v.prompt,
        negative_prompt: v.negativePrompt ?? "low quality, blurry, distorted",
        num_frames: Math.ceil(((v.durationSeconds ?? 3) * 8)), // 8fps
        width: v.resolution === "768p" ? 768 : 512,
        height: v.resolution === "768p" ? 432 : 288,
        guidance_scale: v.cfgScale ?? 7.5,
        seed: v.seed ?? -1,
        first_frame_url: v.imageUrl,
        motion_module: "mm_sd_v15_v3",
        base_model: "anything_v5",
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const v = params as VideoParams;
    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    return {
      storageUrl: url,
      mimeType: "video/mp4",
      durationSeconds: v.durationSeconds ?? 3,
      isDraft: true, // AnimateDiff produces draft quality
      metadata: {
        jobId: jobResult.jobId,
        model: "animatediff_v3",
        fps: 8,
        resolution: v.resolution ?? "512p",
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_animatediff", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));

// ─── 2. LocalSvdAdapter — Video Interpolation ───────────────────────────
// SVD XT 1.1, start+end frame → intermediate frames
// modality: video, max_resolution: 1024p, max_duration: 4s, fps: 14
registerAdapter(createLocalAdapter({
  providerId: "local_svd",
  modelType: "svd",

  validate(params: GenerationParams): string[] {
    const v = params as VideoParams;
    const errors: string[] = [];
    if (!v.imageUrl) errors.push("imageUrl (start frame) required for SVD");
    if (v.durationSeconds && v.durationSeconds > 4) errors.push("max 4s for local_svd");
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const v = params as VideoParams;
    return {
      model_type: "svd",
      model_version: modelVersion,
      params: {
        image_url: v.imageUrl,
        prompt: v.prompt ?? "",
        num_frames: Math.ceil((v.durationSeconds ?? 4) * 14), // 14fps
        width: 1024,
        height: 576,
        motion_bucket_id: 127,
        noise_aug_strength: 0.02,
        seed: v.seed ?? -1,
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const v = params as VideoParams;
    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    return {
      storageUrl: url,
      mimeType: "video/mp4",
      durationSeconds: v.durationSeconds ?? 4,
      metadata: {
        jobId: jobResult.jobId,
        model: "svd_xt_11",
        fps: 14,
        resolution: "1024p",
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_svd", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));

// ─── 3. LocalRifeAdapter — Frame Interpolation ──────────────────────────
// RIFE v4.22, 8fps→24fps post-processing
// modality: video_postprocess (treated as "video" in provider system)
interface RifeParams {
  prompt: string;
  imageUrl?: string;
  frameUrls?: string[];
  upscaleFactor?: number;
  inputFps?: number;
  outputFps?: number;
}

registerAdapter(createLocalAdapter({
  providerId: "local_rife",
  modelType: "rife",

  validate(params: GenerationParams): string[] {
    const r = params as unknown as RifeParams;
    const errors: string[] = [];
    if (!r.frameUrls?.length && !r.imageUrl) errors.push("frameUrls or imageUrl (video) required for RIFE");
    const factor = r.upscaleFactor ?? 3;
    if (![2, 3, 4].includes(factor)) errors.push("upscaleFactor must be 2, 3, or 4");
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const r = params as unknown as RifeParams;
    return {
      model_type: "rife",
      model_version: modelVersion,
      params: {
        frame_urls: r.frameUrls,
        video_url: (r as unknown as VideoParams).imageUrl,
        upscale_factor: r.upscaleFactor ?? 3,
        input_fps: r.inputFps ?? 8,
        output_fps: r.outputFps ?? 24,
        model_variant: "rife_v4.22",
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const r = params as unknown as RifeParams;
    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    return {
      storageUrl: url,
      mimeType: "video/mp4",
      metadata: {
        jobId: jobResult.jobId,
        model: "rife_v422",
        inputFps: r.inputFps ?? 8,
        outputFps: r.outputFps ?? 24,
        upscaleFactor: r.upscaleFactor ?? 3,
        frameCount: jobResult.output?.frames?.length,
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_rife", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));

// ─── 4. LocalControlNetAdapter — Structural Conditioning ────────────────
// ControlNet v1.1 Canny/Lineart + base model Anything V5
// modality: image, max_resolution: 1024x1024
interface ControlNetParams extends ImageParams {
  controlType?: "canny" | "lineart" | "lineart_anime" | "depth";
  controlImageUrl?: string;
  controlStrength?: number;
}

registerAdapter(createLocalAdapter({
  providerId: "local_controlnet",
  modelType: "controlnet",

  validate(params: GenerationParams): string[] {
    const c = params as ControlNetParams;
    const errors: string[] = [];
    if (!c.prompt) errors.push("prompt required");
    if (!c.controlImageUrl && !c.imageUrl) errors.push("controlImageUrl or imageUrl required for ControlNet");
    const validTypes = ["canny", "lineart", "lineart_anime", "depth"];
    if (c.controlType && !validTypes.includes(c.controlType)) {
      errors.push(`controlType must be one of: ${validTypes.join(", ")}`);
    }
    if (c.width && c.width > 1024) errors.push("max width 1024 for local_controlnet");
    if (c.height && c.height > 1024) errors.push("max height 1024 for local_controlnet");
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const c = params as ControlNetParams;
    return {
      model_type: "controlnet",
      model_version: modelVersion,
      params: {
        prompt: c.prompt,
        negative_prompt: c.negativePrompt ?? "low quality, blurry",
        control_image_url: c.controlImageUrl ?? c.imageUrl,
        control_type: c.controlType ?? "lineart_anime",
        control_strength: c.controlStrength ?? 0.8,
        width: c.width ?? 1024,
        height: c.height ?? 1024,
        guidance_scale: c.guidanceScale ?? 7.5,
        num_images: c.numImages ?? 1,
        seed: c.seed ?? -1,
        base_model: "anything_v5",
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const c = params as ControlNetParams;
    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    return {
      storageUrl: url,
      mimeType: "image/png",
      metadata: {
        jobId: jobResult.jobId,
        model: "controlnet_v11",
        controlType: c.controlType ?? "lineart_anime",
        controlStrength: c.controlStrength ?? 0.8,
        resolution: `${c.width ?? 1024}x${c.height ?? 1024}`,
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_controlnet", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));

// ─── 5. LocalIpAdapterAdapter — Character Consistency ───────────────────
// IP-Adapter FaceID, produces conditioning embedding
// variants: faceid, plus, full_face, embedding_dim: 512
interface IpAdapterParams extends ImageParams {
  referenceImageUrls?: string[];
  variant?: "faceid" | "plus" | "full_face";
  embeddingOnly?: boolean;
}

registerAdapter(createLocalAdapter({
  providerId: "local_ip_adapter",
  modelType: "ip_adapter",

  validate(params: GenerationParams): string[] {
    const ip = params as IpAdapterParams;
    const errors: string[] = [];
    if (!ip.referenceImageUrls?.length && !ip.imageUrl) {
      errors.push("referenceImageUrls or imageUrl required for IP-Adapter");
    }
    const validVariants = ["faceid", "plus", "full_face"];
    if (ip.variant && !validVariants.includes(ip.variant)) {
      errors.push(`variant must be one of: ${validVariants.join(", ")}`);
    }
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const ip = params as IpAdapterParams;
    return {
      model_type: "ip_adapter",
      model_version: modelVersion,
      params: {
        prompt: ip.prompt ?? "",
        negative_prompt: ip.negativePrompt ?? "low quality, blurry",
        reference_image_urls: ip.referenceImageUrls ?? (ip.imageUrl ? [ip.imageUrl] : []),
        variant: ip.variant ?? "faceid",
        embedding_only: ip.embeddingOnly ?? false,
        width: ip.width ?? 1024,
        height: ip.height ?? 1024,
        guidance_scale: ip.guidanceScale ?? 7.5,
        seed: ip.seed ?? -1,
        base_model: "anything_v5",
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const ip = params as IpAdapterParams;

    // If embedding-only mode, return the embedding as metadata
    if (ip.embeddingOnly && jobResult.output?.embedding) {
      return {
        storageUrl: "", // No image output in embedding-only mode
        mimeType: "application/json",
        metadata: {
          jobId: jobResult.jobId,
          model: "ip_adapter_faceid",
          variant: ip.variant ?? "faceid",
          embedding: jobResult.output.embedding,
          embeddingDim: jobResult.output.embedding.length,
          wasColdStart: jobResult.wasColdStart,
        },
      };
    }

    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    return {
      storageUrl: url,
      mimeType: "image/png",
      metadata: {
        jobId: jobResult.jobId,
        model: "ip_adapter_faceid",
        variant: ip.variant ?? "faceid",
        resolution: `${ip.width ?? 1024}x${ip.height ?? 1024}`,
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_ip_adapter", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));

// ─── 6. LocalRealesrganAdapter — Image/Frame Upscaling ──────────────────
// realesrgan-x4plus-anime variant
// modality: image_postprocess (treated as "image" in provider system)
interface RealesrganParams extends ImageParams {
  upscaleFactor?: 2 | 4;
  inputImageUrl?: string;
}

registerAdapter(createLocalAdapter({
  providerId: "local_realesrgan",
  modelType: "realesrgan",

  validate(params: GenerationParams): string[] {
    const r = params as RealesrganParams;
    const errors: string[] = [];
    if (!r.inputImageUrl && !r.imageUrl) errors.push("inputImageUrl or imageUrl required for Real-ESRGAN");
    if (r.upscaleFactor && ![2, 4].includes(r.upscaleFactor)) {
      errors.push("upscaleFactor must be 2 or 4");
    }
    // Check output wouldn't exceed 4K
    const factor = r.upscaleFactor ?? 4;
    const outW = (r.width ?? 512) * factor;
    const outH = (r.height ?? 512) * factor;
    if (outW > 4096 || outH > 4096) {
      errors.push(`Output ${outW}x${outH} exceeds 4K limit (4096x4096)`);
    }
    return errors;
  },

  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput {
    const r = params as RealesrganParams;
    return {
      model_type: "realesrgan",
      model_version: modelVersion,
      params: {
        image_url: r.inputImageUrl ?? r.imageUrl,
        upscale_factor: r.upscaleFactor ?? 4,
        model_variant: "realesrgan-x4plus-anime",
        tile_size: 512, // Process in tiles to manage VRAM
        half_precision: true,
      },
    };
  },

  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult {
    const r = params as RealesrganParams;
    const url = jobResult.output?.url ?? jobResult.output?.urls?.[0] ?? "";
    const factor = r.upscaleFactor ?? 4;
    return {
      storageUrl: url,
      mimeType: "image/png",
      metadata: {
        jobId: jobResult.jobId,
        model: "realesrgan_x4plus_anime",
        upscaleFactor: factor,
        inputResolution: `${r.width ?? 512}x${r.height ?? 512}`,
        outputResolution: `${(r.width ?? 512) * factor}x${(r.height ?? 512) * factor}`,
        wasColdStart: jobResult.wasColdStart,
      },
    };
  },

  estimateCostUsd(params: GenerationParams): number {
    return estimateLocalProviderCost("local_realesrgan", params as unknown as Record<string, unknown>).marginCostUsd;
  },
}));
