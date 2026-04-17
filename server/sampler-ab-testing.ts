/**
 * Prompt 23 — Sampler A/B Testing
 *
 * Manages cohort assignment (80% sampler, 20% control) and
 * computes primary + guardrail metrics for the sampler experiment.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export type Cohort = "control" | "sampler";

export interface CohortAssignment {
  userId: number;
  cohort: Cohort;
  enrolledAt: number;
  exitedAt: number | null;
}

export interface PrimaryMetrics {
  cohort: Cohort;
  badReviewRate: number;      // 1-2 star reviews per 100 scenes
  supportTicketRate: number;  // tickets per 100 scenes
  regenerationRate: number;   // regen count per 100 scenes
  avgESG: number;             // average ESG score
  tierUpgradeRate: number;    // % of scenes where creator upgraded tier
  netCreditSpend: number;     // average credits per creator
}

export interface GuardrailMetrics {
  cohort: Cohort;
  activationRate: number;     // % completed first project
  timeToFirstOutput: number;  // seconds
  anchorSkipRate: number;     // % who skip the anchor survey (sampler only)
  tier1SelectionRate: number; // % of tier 1 selections
}

export interface ABTestResult {
  control: PrimaryMetrics;
  sampler: PrimaryMetrics;
  controlGuardrails: GuardrailMetrics;
  samplerGuardrails: GuardrailMetrics;
  primaryMetricDeltas: {
    badReviewRate: number;
    supportTicketRate: number;
    regenerationRate: number;
    avgESG: number;
    tierUpgradeRate: number;
    netCreditSpend: number;
  };
  guardrailViolations: string[];
  recommendation: "continue" | "graduate_sampler" | "pause_experiment" | "rollback";
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Sampler gets 80% of new users, control gets 20% */
export const SAMPLER_RATIO = 0.80;
export const CONTROL_RATIO = 0.20;

/** Primary metric targets (sampler should improve by at least these amounts) */
export const PRIMARY_TARGETS = {
  badReviewRateReduction: 0.25,     // ≥25% reduction
  supportTicketRateReduction: 0.30, // ≥30% reduction
  regenerationRateReduction: 0.15,  // ≥15% reduction
  avgESGReduction: 0.3,             // ≥0.3 reduction
  tierUpgradeRateMax: 0.10,         // neutral or +5-10%
  netCreditSpendTolerance: 0.05,    // ±5%
} as const;

/** Guardrail thresholds (must not regress beyond these) */
export const GUARDRAIL_THRESHOLDS = {
  activationRateMaxDrop: 0.02,      // no more than 2% drop
  timeToFirstOutputMaxAdd: 30,      // no more than 30 seconds added
  anchorSkipRateMax: 0.20,          // at least 80% complete the anchor
  tier1SelectionRateMin: 0.30,      // tier 1 must stay above 30%
} as const;

// ─── Cohort Assignment ─────────────────────────────────────────────────

/**
 * Assign a new user to a cohort.
 * Uses deterministic hash for reproducibility.
 */
export function assignCohort(userId: number): Cohort {
  // Simple hash-based assignment for deterministic 80/20 split
  const hash = (userId * 2654435761) >>> 0; // Knuth multiplicative hash
  const bucket = (hash % 100) / 100;
  return bucket < SAMPLER_RATIO ? "sampler" : "control";
}

/**
 * Verify cohort distribution matches expected ratio within tolerance.
 */
export function verifyCohortDistribution(
  assignments: CohortAssignment[],
  tolerance = 0.03,
): { valid: boolean; actualSamplerRatio: number; expectedRatio: number; deviation: number } {
  const samplerCount = assignments.filter(a => a.cohort === "sampler").length;
  const total = assignments.length || 1;
  const actualSamplerRatio = samplerCount / total;
  const deviation = Math.abs(actualSamplerRatio - SAMPLER_RATIO);

  return {
    valid: deviation <= tolerance,
    actualSamplerRatio: Math.round(actualSamplerRatio * 1000) / 1000,
    expectedRatio: SAMPLER_RATIO,
    deviation: Math.round(deviation * 1000) / 1000,
  };
}

// ─── Metrics Computation ───────────────────────────────────────────────

export interface CohortData {
  totalScenes: number;
  badReviews: number;       // 1-2 star count
  supportTickets: number;
  regenerations: number;
  totalESG: number;
  tierUpgrades: number;
  totalCredits: number;
  creatorCount: number;
  completedFirstProject: number;
  avgTimeToFirstOutput: number;
  anchorSkips: number;      // sampler only
  tier1Selections: number;
}

/**
 * Compute primary metrics for a cohort.
 */
export function computePrimaryMetrics(cohort: Cohort, data: CohortData): PrimaryMetrics {
  const scenePer100 = data.totalScenes > 0 ? 100 / data.totalScenes : 0;

  return {
    cohort,
    badReviewRate: Math.round(data.badReviews * scenePer100 * 100) / 100,
    supportTicketRate: Math.round(data.supportTickets * scenePer100 * 100) / 100,
    regenerationRate: Math.round(data.regenerations * scenePer100 * 100) / 100,
    avgESG: data.totalScenes > 0
      ? Math.round((data.totalESG / data.totalScenes) * 100) / 100
      : 0,
    tierUpgradeRate: data.totalScenes > 0
      ? Math.round((data.tierUpgrades / data.totalScenes) * 100) / 100
      : 0,
    netCreditSpend: data.creatorCount > 0
      ? Math.round((data.totalCredits / data.creatorCount) * 100) / 100
      : 0,
  };
}

/**
 * Compute guardrail metrics for a cohort.
 */
export function computeGuardrailMetrics(cohort: Cohort, data: CohortData): GuardrailMetrics {
  return {
    cohort,
    activationRate: data.creatorCount > 0
      ? Math.round((data.completedFirstProject / data.creatorCount) * 100) / 100
      : 0,
    timeToFirstOutput: Math.round(data.avgTimeToFirstOutput),
    anchorSkipRate: data.totalScenes > 0
      ? Math.round((data.anchorSkips / data.totalScenes) * 100) / 100
      : 0,
    tier1SelectionRate: data.totalScenes > 0
      ? Math.round((data.tier1Selections / data.totalScenes) * 100) / 100
      : 0,
  };
}

/**
 * Run the full A/B test analysis.
 */
export function computeABTestResult(
  controlData: CohortData,
  samplerData: CohortData,
): ABTestResult {
  const control = computePrimaryMetrics("control", controlData);
  const sampler = computePrimaryMetrics("sampler", samplerData);
  const controlGuardrails = computeGuardrailMetrics("control", controlData);
  const samplerGuardrails = computeGuardrailMetrics("sampler", samplerData);

  // Compute deltas (negative = sampler is better for rates that should decrease)
  const primaryMetricDeltas = {
    badReviewRate: sampler.badReviewRate - control.badReviewRate,
    supportTicketRate: sampler.supportTicketRate - control.supportTicketRate,
    regenerationRate: sampler.regenerationRate - control.regenerationRate,
    avgESG: sampler.avgESG - control.avgESG,
    tierUpgradeRate: sampler.tierUpgradeRate - control.tierUpgradeRate,
    netCreditSpend: control.netCreditSpend > 0
      ? (sampler.netCreditSpend - control.netCreditSpend) / control.netCreditSpend
      : 0,
  };

  // Check guardrail violations
  const guardrailViolations: string[] = [];

  const activationDrop = controlGuardrails.activationRate - samplerGuardrails.activationRate;
  if (activationDrop > GUARDRAIL_THRESHOLDS.activationRateMaxDrop) {
    guardrailViolations.push(`Activation rate dropped by ${(activationDrop * 100).toFixed(1)}% (max ${GUARDRAIL_THRESHOLDS.activationRateMaxDrop * 100}%)`);
  }

  const timeAdded = samplerGuardrails.timeToFirstOutput - controlGuardrails.timeToFirstOutput;
  if (timeAdded > GUARDRAIL_THRESHOLDS.timeToFirstOutputMaxAdd) {
    guardrailViolations.push(`Time-to-first-output increased by ${timeAdded}s (max ${GUARDRAIL_THRESHOLDS.timeToFirstOutputMaxAdd}s)`);
  }

  if (samplerGuardrails.anchorSkipRate > GUARDRAIL_THRESHOLDS.anchorSkipRateMax) {
    guardrailViolations.push(`Anchor skip rate is ${(samplerGuardrails.anchorSkipRate * 100).toFixed(1)}% (max ${GUARDRAIL_THRESHOLDS.anchorSkipRateMax * 100}%)`);
  }

  if (samplerGuardrails.tier1SelectionRate < GUARDRAIL_THRESHOLDS.tier1SelectionRateMin) {
    guardrailViolations.push(`Tier 1 selection rate is ${(samplerGuardrails.tier1SelectionRate * 100).toFixed(1)}% (min ${GUARDRAIL_THRESHOLDS.tier1SelectionRateMin * 100}%)`);
  }

  // Determine recommendation
  let recommendation: ABTestResult["recommendation"];
  if (guardrailViolations.length > 0) {
    recommendation = "pause_experiment";
  } else {
    // Count how many primary metrics improved significantly
    let significantImprovements = 0;
    if (primaryMetricDeltas.badReviewRate < -control.badReviewRate * PRIMARY_TARGETS.badReviewRateReduction) significantImprovements++;
    if (primaryMetricDeltas.supportTicketRate < -control.supportTicketRate * PRIMARY_TARGETS.supportTicketRateReduction) significantImprovements++;
    if (primaryMetricDeltas.regenerationRate < -control.regenerationRate * PRIMARY_TARGETS.regenerationRateReduction) significantImprovements++;
    if (primaryMetricDeltas.avgESG < -PRIMARY_TARGETS.avgESGReduction) significantImprovements++;

    if (significantImprovements >= 3) {
      recommendation = "graduate_sampler";
    } else if (significantImprovements >= 1) {
      recommendation = "continue";
    } else {
      recommendation = "rollback";
    }
  }

  return {
    control,
    sampler,
    controlGuardrails,
    samplerGuardrails,
    primaryMetricDeltas,
    guardrailViolations,
    recommendation,
  };
}
