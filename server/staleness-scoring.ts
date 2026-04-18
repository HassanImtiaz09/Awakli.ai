/**
 * Prompt 23 — Staleness Scoring
 *
 * Computes a 0-1 staleness score per sample based on age, provider version gap,
 * and ESG drift. Flags samples for refresh when stale.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface StalenessInput {
  sampleId: number;
  publishedAt: number;     // timestamp ms
  provider: string;
  archetypeId: string;
  tier: number;
  currentStaleness: number;
}

export interface StalenessResult {
  sampleId: number;
  stalenessScore: number;
  daysSincePublication: number;
  providerVersionGap: boolean;
  esgDrift: number;
  flaggedForRefresh: boolean;  // ≥0.7
  showOutdatedBadge: boolean;  // ≥0.9
  refreshPriority: "none" | "low" | "medium" | "high" | "critical";
}

export interface RefreshBudget {
  yearlyBudgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  quarterlyAllocation: number;
  eventTriggeredReserve: number;
  estimatedSamplesRemaining: number;
}

export type RefreshTrigger =
  | "quarterly_cycle"
  | "provider_version_bump"
  | "lora_pipeline_change"
  | "controlnet_mode_change"
  | "esg_severe_gap_trend";

export interface RefreshEvent {
  trigger: RefreshTrigger;
  affectedSamples: number;
  estimatedCostUsd: number;
  deadline: string; // "14 days", "next quarter", etc.
  description: string;
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Staleness formula weights */
export const STALENESS_WEIGHTS = {
  ageFactor: 0.01,          // naturally stales over ~3 months (100 days → 1.0)
  providerVersionGap: 0.3,  // major jump on version bumps
  esgDrift: 0.2,            // jumps when creator experience drifts
} as const;

/** Staleness thresholds */
export const STALENESS_THRESHOLDS = {
  flagForRefresh: 0.7,
  showOutdatedBadge: 0.9,
} as const;

/** Annual refresh budget */
export const ANNUAL_BUDGET_USD = 6000;
export const QUARTERLY_ALLOCATION_USD = ANNUAL_BUDGET_USD * 0.6 / 4; // 60% for quarterly
export const EVENT_RESERVE_USD = ANNUAL_BUDGET_USD * 0.4; // 40% for event-triggered

/** Average cost per sample generation */
export const AVG_COST_PER_SAMPLE = 2.50;

/** Provider version registry (simulated) */
export const PROVIDER_VERSIONS: Record<string, { current: string; previous: string[] }> = {
  kling_2_6: { current: "2.6", previous: ["2.5", "2.4", "2.0"] },
  runway_gen3: { current: "3.0", previous: ["2.5", "2.0"] },
  runway_act_two: { current: "2.0", previous: ["1.0"] },  // Act-Two (successor to Act-One)
  wan_26: { current: "2.6", previous: ["2.1", "2.0"] },  // Wan 2.6 via fal.ai
  animatediff_v3: { current: "3.0", previous: ["2.1", "2.0"] },
  stable_video_xt: { current: "1.1", previous: ["1.0"] },
  elevenlabs_turbo: { current: "2.5", previous: ["2.0", "1.5"] },
  cartesia_sonic: { current: "1.0", previous: [] },
  fish_audio: { current: "1.2", previous: ["1.0"] },
};

// ─── Core Computation ──────────────────────────────────────────────────

/**
 * Check if a provider has shipped a newer version since the sample was published.
 */
export function checkProviderVersionGap(
  provider: string,
  publishedAt: number,
): boolean {
  const versions = PROVIDER_VERSIONS[provider];
  if (!versions) return false;
  // Simulated: if the provider has previous versions, assume a gap exists
  // for samples older than 60 days
  const daysSince = (Date.now() - publishedAt) / 86400000;
  return versions.previous.length > 0 && daysSince > 60;
}

/**
 * Compute the staleness score for a single sample.
 *
 * staleness = min(1.0,
 *   0.01 * days_since_publication +
 *   0.3 * provider_version_gap +
 *   0.2 * esg_drift
 * )
 */
export function computeStalenessScore(
  input: StalenessInput,
  esgDrift = 0,
): StalenessResult {
  const daysSincePublication = Math.max(0, (Date.now() - input.publishedAt) / 86400000);
  const providerVersionGap = checkProviderVersionGap(input.provider, input.publishedAt);

  const rawScore =
    STALENESS_WEIGHTS.ageFactor * daysSincePublication +
    STALENESS_WEIGHTS.providerVersionGap * (providerVersionGap ? 1 : 0) +
    STALENESS_WEIGHTS.esgDrift * Math.abs(esgDrift);

  const stalenessScore = Math.min(1.0, Math.round(rawScore * 100) / 100);

  const flaggedForRefresh = stalenessScore >= STALENESS_THRESHOLDS.flagForRefresh;
  const showOutdatedBadge = stalenessScore >= STALENESS_THRESHOLDS.showOutdatedBadge;

  let refreshPriority: StalenessResult["refreshPriority"] = "none";
  if (stalenessScore >= 0.9) refreshPriority = "critical";
  else if (stalenessScore >= 0.7) refreshPriority = "high";
  else if (stalenessScore >= 0.5) refreshPriority = "medium";
  else if (stalenessScore >= 0.3) refreshPriority = "low";

  return {
    sampleId: input.sampleId,
    stalenessScore,
    daysSincePublication: Math.round(daysSincePublication),
    providerVersionGap,
    esgDrift: Math.round(Math.abs(esgDrift) * 100) / 100,
    flaggedForRefresh,
    showOutdatedBadge,
    refreshPriority,
  };
}

/**
 * Flag all stale samples from a batch.
 */
export function flagStaleSamples(
  inputs: StalenessInput[],
  esgDriftMap: Record<string, number> = {},
): StalenessResult[] {
  return inputs
    .map(input => {
      const key = `${input.archetypeId}_${input.tier}`;
      const esgDrift = esgDriftMap[key] ?? 0;
      return computeStalenessScore(input, esgDrift);
    })
    .sort((a, b) => b.stalenessScore - a.stalenessScore);
}

// ─── Refresh Budget ────────────────────────────────────────────────────

/**
 * Compute the current refresh budget status.
 */
export function computeRefreshBudget(spentUsd: number): RefreshBudget {
  const remainingUsd = Math.max(0, ANNUAL_BUDGET_USD - spentUsd);
  return {
    yearlyBudgetUsd: ANNUAL_BUDGET_USD,
    spentUsd: Math.round(spentUsd * 100) / 100,
    remainingUsd: Math.round(remainingUsd * 100) / 100,
    quarterlyAllocation: Math.round(QUARTERLY_ALLOCATION_USD * 100) / 100,
    eventTriggeredReserve: Math.round(EVENT_RESERVE_USD * 100) / 100,
    estimatedSamplesRemaining: Math.floor(remainingUsd / AVG_COST_PER_SAMPLE),
  };
}

/**
 * Generate refresh events based on triggers.
 */
export function generateRefreshEvents(
  staleSamples: StalenessResult[],
  triggers: RefreshTrigger[] = [],
): RefreshEvent[] {
  const events: RefreshEvent[] = [];

  // Quarterly cycle
  if (triggers.includes("quarterly_cycle")) {
    events.push({
      trigger: "quarterly_cycle",
      affectedSamples: 216,
      estimatedCostUsd: 216 * AVG_COST_PER_SAMPLE,
      deadline: "next quarter",
      description: "Full sample library re-generation using latest production pipeline versions.",
    });
  }

  // Provider version bump
  if (triggers.includes("provider_version_bump")) {
    const providerSamples = staleSamples.filter(s => s.providerVersionGap);
    events.push({
      trigger: "provider_version_bump",
      affectedSamples: providerSamples.length,
      estimatedCostUsd: providerSamples.length * AVG_COST_PER_SAMPLE,
      deadline: "14 days",
      description: "Provider has shipped a newer version. Affected samples must be re-generated.",
    });
  }

  // LoRA pipeline change
  if (triggers.includes("lora_pipeline_change")) {
    events.push({
      trigger: "lora_pipeline_change",
      affectedSamples: 144, // all visual samples
      estimatedCostUsd: 144 * AVG_COST_PER_SAMPLE,
      deadline: "14 days",
      description: "LoRA training config updated. All character samples must be re-generated.",
    });
  }

  // ControlNet mode change
  if (triggers.includes("controlnet_mode_change")) {
    const affectedCount = Math.ceil(144 * 0.5); // ~50% of visual samples
    events.push({
      trigger: "controlnet_mode_change",
      affectedSamples: affectedCount,
      estimatedCostUsd: affectedCount * AVG_COST_PER_SAMPLE,
      deadline: "14 days",
      description: "ControlNet default strength updated. Affected visual samples must be re-generated.",
    });
  }

  // ESG severe gap trend
  if (triggers.includes("esg_severe_gap_trend")) {
    const criticalSamples = staleSamples.filter(s => s.refreshPriority === "critical");
    events.push({
      trigger: "esg_severe_gap_trend",
      affectedSamples: criticalSamples.length || 5,
      estimatedCostUsd: (criticalSamples.length || 5) * AVG_COST_PER_SAMPLE,
      deadline: "immediate",
      description: "ESG > 1.5 for 2+ weeks on specific archetype×tier combinations. Emergency refresh triggered.",
    });
  }

  return events;
}
