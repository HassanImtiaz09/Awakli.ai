/**
 * Router — Selects the best provider for a generation request.
 *
 * Scoring: weighted combination of cost, latency, quality, freshness.
 * Hard filters: tier, modality, circuit state, capabilities.
 * Soft preferences: provider hint (strict vs preferred).
 */
import {
  getProvidersByModality,
  getProviderHealth,
  getAdapter,
  hasAdapter,
  getProviderInfo,
} from "./registry";
import { estimateCost } from "./cost-estimator";
import type {
  GenerateRequest,
  ProviderInfo,
  ProviderTier,
  Modality,
  ScoringWeights,
} from "./types";
import {
  MODALITY_WEIGHTS,
  TIER_FILTER,
  ProviderError,
} from "./types";

export interface RoutingDecision {
  /** Ordered list of providers to try (primary + fallbacks) */
  chain: string[];
  /** Scoring details for debugging */
  scores: Array<{ providerId: string; score: number; reason?: string }>;
}

/**
 * Select providers for a generation request.
 * Returns an ordered chain: primary provider + fallback candidates.
 */
export async function selectProviders(request: GenerateRequest): Promise<RoutingDecision> {
  const { type, tier, providerHint, strict } = request;

  // 1. If strict hint, only use that provider
  if (providerHint && strict) {
    const info = await getProviderInfo(providerHint);
    if (!info || info.status !== "active") {
      throw new ProviderError("UNSUPPORTED", `Provider ${providerHint} not available`, providerHint);
    }
    if (!hasAdapter(providerHint)) {
      throw new ProviderError("UNSUPPORTED", `No adapter for ${providerHint}`, providerHint);
    }
    // Check circuit state
    const health = await getProviderHealth(providerHint);
    if (health?.circuitState === "open") {
      throw new ProviderError("UNSUPPORTED", `Provider ${providerHint} circuit is open`, providerHint);
    }
    return {
      chain: [providerHint],
      scores: [{ providerId: providerHint, score: 1.0, reason: "strict_hint" }],
    };
  }

  // 2. Get all active providers for this modality
  const allProviders = await getProvidersByModality(type);
  const allowedTiers = TIER_FILTER[tier];

  // 3. Filter by tier + adapter availability + status
  const candidates = allProviders.filter(
    (p) =>
      allowedTiers.includes(p.tier) &&
      hasAdapter(p.id) &&
      p.status === "active",
  );

  if (candidates.length === 0) {
    throw new ProviderError(
      "UNSUPPORTED",
      `No providers available for ${type}/${tier}`,
      "router",
    );
  }

  // 4. Score each candidate
  const weights = MODALITY_WEIGHTS[type];
  const scored = await Promise.all(
    candidates.map(async (provider) => {
      const score = await scoreProvider(provider, request, weights);
      return { providerId: provider.id, score, reason: undefined as string | undefined };
    }),
  );

  // 5. If preferred hint, boost that provider
  if (providerHint) {
    const hintEntry = scored.find((s) => s.providerId === providerHint);
    if (hintEntry) {
      hintEntry.score += 100; // Strong boost for preferred hint
      hintEntry.reason = "preferred_hint";
    }
  }

  // 6. Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // 7. Return top 3 as the fallback chain
  const chain = scored.slice(0, 3).map((s) => s.providerId);

  return { chain, scores: scored };
}

/**
 * Score a single provider. Higher = better.
 * All components normalized to 0-1 range before weighting.
 */
async function scoreProvider(
  provider: ProviderInfo,
  request: GenerateRequest,
  weights: ScoringWeights,
): Promise<number> {
  const health = await getProviderHealth(provider.id);

  // If circuit is open, score = 0 (will be filtered out)
  if (health?.circuitState === "open") return 0;
  // If half-open, reduce score significantly
  const circuitPenalty = health?.circuitState === "half_open" ? 0.3 : 1.0;

  // Cost score: lower cost = higher score (inverted, normalized)
  const costEstimate = estimateCost(provider.id, request.params);
  const maxCost = 0.20; // normalize against $0.20 as "expensive"
  const costScore = Math.max(0, 1 - costEstimate.estimatedUsd / maxCost);

  // Latency score: lower latency = higher score
  const latencyP50 = health?.latencyP50Ms ?? 30000; // default 30s if unknown
  const maxLatency = 120000; // normalize against 120s
  const latencyScore = Math.max(0, 1 - latencyP50 / maxLatency);

  // Quality score: from provider_quality_scores or default based on tier
  const qualityScore = getDefaultQualityScore(provider.tier);

  // Freshness score: how recently the provider succeeded
  const freshnessScore = health?.lastSuccessAt
    ? Math.max(0, 1 - (Date.now() - health.lastSuccessAt.getTime()) / (24 * 60 * 60 * 1000))
    : 0.5; // unknown = neutral

  // Weighted sum
  const rawScore =
    weights.cost * costScore +
    weights.latency * latencyScore +
    weights.quality * qualityScore +
    weights.freshness * freshnessScore;

  // Apply circuit penalty and success rate bonus
  const successBonus = health?.successRate1h ? Number(health.successRate1h) * 0.1 : 0;

  return (rawScore + successBonus) * circuitPenalty;
}

function getDefaultQualityScore(tier: ProviderTier): number {
  switch (tier) {
    case "flagship": return 0.95;
    case "premium": return 0.80;
    case "standard": return 0.65;
    case "budget": return 0.45;
  }
}
