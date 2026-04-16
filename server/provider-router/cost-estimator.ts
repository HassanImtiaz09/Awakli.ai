/**
 * Cost Estimator — Calculates credit and USD costs for generation requests.
 * Uses adapter-level cost estimation + credit conversion.
 */
import { getAdapter, getProviderInfo } from "./registry";
import type { GenerationParams, Modality, ProviderTier } from "./types";
import { usdToCredits } from "./types";

export interface CostEstimate {
  providerId: string;
  estimatedUsd: number;
  estimatedCredits: number;
}

/**
 * Estimate cost for a single generation on a specific provider.
 */
export function estimateCost(
  providerId: string,
  params: GenerationParams,
): CostEstimate {
  const adapter = getAdapter(providerId);
  if (!adapter) {
    // Fallback: use provider pricing from DB (will be resolved at execution time)
    return { providerId, estimatedUsd: 0, estimatedCredits: 0 };
  }
  const estimatedUsd = adapter.estimateCostUsd(params);
  const estimatedCredits = usdToCredits(estimatedUsd);
  return { providerId, estimatedUsd, estimatedCredits };
}

/**
 * Estimate cost across multiple providers for comparison.
 */
export function estimateCostMultiple(
  providerIds: string[],
  params: GenerationParams,
): CostEstimate[] {
  return providerIds.map((id) => estimateCost(id, params));
}

/**
 * Estimate batch cost for a full episode (multiple generation steps).
 */
export function estimateBatchCost(
  steps: Array<{ providerId: string; params: GenerationParams }>,
): { totalUsd: number; totalCredits: number; breakdown: CostEstimate[] } {
  const breakdown = steps.map((s) => estimateCost(s.providerId, s.params));
  const totalUsd = breakdown.reduce((sum, e) => sum + e.estimatedUsd, 0);
  const totalCredits = breakdown.reduce((sum, e) => sum + e.estimatedCredits, 0);
  return { totalUsd, totalCredits, breakdown };
}
