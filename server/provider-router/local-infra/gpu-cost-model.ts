/**
 * GPU Cost Model — Per-second billing with configurable margin
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Formula:
 *   platformCostUsd = gpuSeconds * GPU_RATES[gpuType]
 *   costUsd = platformCostUsd * MARGIN_MULTIPLIER (1.30)
 *   costCredits = costUsd / CREDIT_COGS_RATE ($0.55)
 */
import {
  GPU_RATES,
  MARGIN_MULTIPLIER,
  CREDIT_COGS_RATE,
  LOCAL_MODEL_SPECS,
  type GpuType,
} from "./types";

export interface GpuCostEstimate {
  gpuType: GpuType;
  estimatedGpuSeconds: number;
  rawGpuCostUsd: number;
  marginCostUsd: number;
  costCredits: number;
}

/**
 * Estimate GPU cost for a local inference job.
 *
 * @param gpuType - GPU hardware type
 * @param gpuSeconds - Estimated GPU time in seconds
 * @returns Detailed cost breakdown
 */
export function estimateGpuCost(gpuType: GpuType, gpuSeconds: number): GpuCostEstimate {
  const rate = GPU_RATES[gpuType];
  if (!rate) throw new Error(`Unknown GPU type: ${gpuType}`);

  const rawGpuCostUsd = gpuSeconds * rate;
  const marginCostUsd = rawGpuCostUsd * MARGIN_MULTIPLIER;
  const costCredits = marginCostUsd / CREDIT_COGS_RATE;

  return {
    gpuType,
    estimatedGpuSeconds: gpuSeconds,
    rawGpuCostUsd: Math.round(rawGpuCostUsd * 1_000_000) / 1_000_000, // 6 decimal places
    marginCostUsd: Math.round(marginCostUsd * 1_000_000) / 1_000_000,
    costCredits: Math.round(costCredits * 10_000) / 10_000, // 4 decimal places
  };
}

/**
 * Estimate inference time for a model based on params.
 * Uses model specs + heuristics per model type.
 */
export function estimateInferenceTime(providerId: string, params: Record<string, unknown>): number {
  const spec = LOCAL_MODEL_SPECS[providerId];
  if (!spec) return 30; // fallback 30s

  switch (providerId) {
    case "local_animatediff": {
      // Duration-based: ~15s per second of output at 768p
      const duration = (params.durationSeconds as number) ?? 3;
      const resMultiplier = (params.resolution as string)?.includes("768") ? 1.0 : 0.7;
      return Math.max(spec.avgInferenceTimeSec.min, duration * 15 * resMultiplier);
    }

    case "local_svd": {
      // Duration-based: ~15s per second of output at 1024p
      const duration = (params.durationSeconds as number) ?? 4;
      return Math.max(spec.avgInferenceTimeSec.min, duration * 15);
    }

    case "local_rife": {
      // Frame-count based: ~0.1s per frame pair
      const frameCount = (params.frameCount as number) ?? 24;
      const factor = (params.upscaleFactor as number) ?? 3;
      return Math.max(spec.avgInferenceTimeSec.min, (frameCount * factor) * 0.08);
    }

    case "local_controlnet": {
      // Resolution-based: ~8s at 1024x1024
      const width = (params.width as number) ?? 1024;
      const height = (params.height as number) ?? 1024;
      const pixelMultiplier = (width * height) / (1024 * 1024);
      return Math.max(spec.avgInferenceTimeSec.min, 8 * pixelMultiplier);
    }

    case "local_ip_adapter": {
      // Fixed-ish: ~12s per embedding generation
      const numImages = (params.numReferenceImages as number) ?? 1;
      return Math.max(spec.avgInferenceTimeSec.min, 12 * numImages);
    }

    case "local_realesrgan": {
      // Resolution-based: ~1.5s per megapixel
      const width = (params.width as number) ?? 512;
      const height = (params.height as number) ?? 512;
      const factor = (params.upscaleFactor as number) ?? 4;
      const outputPixels = width * height * factor * factor;
      return Math.max(spec.avgInferenceTimeSec.min, (outputPixels / 1_000_000) * 1.5);
    }

    default:
      return (spec.avgInferenceTimeSec.min + spec.avgInferenceTimeSec.max) / 2;
  }
}

/**
 * Full cost estimate for a local provider: estimate time → compute cost.
 */
export function estimateLocalProviderCost(
  providerId: string,
  params: Record<string, unknown>,
  gpuTypeOverride?: GpuType,
): GpuCostEstimate {
  const spec = LOCAL_MODEL_SPECS[providerId];
  if (!spec) throw new Error(`Unknown local provider: ${providerId}`);

  const gpuType = gpuTypeOverride ?? spec.defaultGpuType;
  const gpuSeconds = estimateInferenceTime(providerId, params);
  return estimateGpuCost(gpuType, gpuSeconds);
}

/**
 * Calculate actual cost from GPU usage log data (for reconciliation).
 */
export function calculateActualCost(gpuType: GpuType, gpuSeconds: number): {
  rawCostUsd: number;
  marginCostUsd: number;
  costCredits: number;
} {
  const rate = GPU_RATES[gpuType];
  const rawCostUsd = gpuSeconds * rate;
  const marginCostUsd = rawCostUsd * MARGIN_MULTIPLIER;
  const costCredits = marginCostUsd / CREDIT_COGS_RATE;
  return {
    rawCostUsd: Math.round(rawCostUsd * 1_000_000) / 1_000_000,
    marginCostUsd: Math.round(marginCostUsd * 1_000_000) / 1_000_000,
    costCredits: Math.round(costCredits * 10_000) / 10_000,
  };
}

/**
 * Compare local vs API cost for a given operation.
 */
export function compareCosts(
  localProviderId: string,
  apiCostUsd: number,
  params: Record<string, unknown>,
): {
  localCostUsd: number;
  apiCostUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  recommendation: "local" | "api";
} {
  const localEstimate = estimateLocalProviderCost(localProviderId, params);
  const savingsUsd = apiCostUsd - localEstimate.marginCostUsd;
  const savingsPercent = apiCostUsd > 0 ? (savingsUsd / apiCostUsd) * 100 : 0;

  return {
    localCostUsd: localEstimate.marginCostUsd,
    apiCostUsd,
    savingsUsd: Math.round(savingsUsd * 1_000_000) / 1_000_000,
    savingsPercent: Math.round(savingsPercent * 100) / 100,
    recommendation: savingsUsd > 0 ? "local" : "api",
  };
}
