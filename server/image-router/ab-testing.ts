/**
 * A/B Testing Engine for Image Generation Providers.
 *
 * Enables controlled experiments that route a percentage of jobs to a variant
 * provider while the rest go to a control provider. Collects quality, cost,
 * and latency metrics per arm, and computes statistical significance.
 *
 * @see Prompt 29
 */
import { randomUUID } from "crypto";

// ─── Types ─────────────────────────────────────────────────────────────

export type ExperimentStatus = "draft" | "running" | "paused" | "completed" | "cancelled";

export interface ABExperiment {
  id: string;
  name: string;
  description: string;
  /** Provider ID for the control arm (current default) */
  controlProvider: string;
  /** Provider ID for the variant arm (challenger) */
  variantProvider: string;
  /** Percentage of traffic routed to the variant (0-100) */
  trafficSplitPercent: number;
  /** Which workload types this experiment applies to (empty = all) */
  workloadTypes: string[];
  status: ExperimentStatus;
  /** Minimum sample size per arm before significance can be computed */
  minSampleSize: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface ABExperimentResult {
  id: string;
  experimentId: string;
  arm: "control" | "variant";
  providerId: string;
  jobId: string;
  workloadType: string;
  latencyMs: number;
  costUsd: number;
  /** Quality score from 0-100 (computed by evaluation gates or manual review) */
  qualityScore: number | null;
  succeeded: boolean;
  createdAt: Date;
}

export interface ArmStats {
  arm: "control" | "variant";
  providerId: string;
  sampleSize: number;
  successRate: number;
  avgLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgQualityScore: number | null;
}

export interface ExperimentComparison {
  experiment: ABExperiment;
  control: ArmStats;
  variant: ArmStats;
  /** Statistical significance for success rate difference */
  successRateSignificance: SignificanceResult;
  /** Statistical significance for latency difference */
  latencySignificance: SignificanceResult;
  /** Statistical significance for cost difference */
  costSignificance: SignificanceResult;
  /** Overall recommendation */
  recommendation: "variant_better" | "control_better" | "no_difference" | "insufficient_data";
}

export interface SignificanceResult {
  /** Z-score for the comparison */
  zScore: number;
  /** Two-tailed p-value */
  pValue: number;
  /** Whether the result is statistically significant at alpha=0.05 */
  isSignificant: boolean;
  /** Confidence level as percentage (e.g. 95) */
  confidenceLevel: number;
  /** Effect size (difference between arms) */
  effectSize: number;
}

// ─── Traffic Splitter ──────────────────────────────────────────────────

/**
 * Determine which arm a job should be routed to for a given experiment.
 * Uses deterministic hashing based on job ID for reproducibility.
 */
export function assignArm(
  experimentId: string,
  jobId: string,
  trafficSplitPercent: number,
): "control" | "variant" {
  // Simple hash-based assignment for deterministic routing
  const hash = simpleHash(`${experimentId}:${jobId}`);
  const bucket = hash % 100;
  return bucket < trafficSplitPercent ? "variant" : "control";
}

/**
 * Check if a job matches an active experiment's workload filter.
 */
export function matchesExperiment(
  experiment: ABExperiment,
  workloadType: string,
): boolean {
  if (experiment.status !== "running") return false;
  if (experiment.workloadTypes.length === 0) return true; // All workloads
  return experiment.workloadTypes.includes(workloadType);
}

/**
 * Route a job through the A/B testing system.
 * Returns the provider to use and the experiment arm assignment.
 */
export function routeWithExperiment(
  experiment: ABExperiment,
  jobId: string,
  workloadType: string,
): { providerId: string; arm: "control" | "variant"; experimentId: string } | null {
  if (!matchesExperiment(experiment, workloadType)) {
    return null;
  }

  const arm = assignArm(experiment.id, jobId, experiment.trafficSplitPercent);
  return {
    providerId: arm === "control" ? experiment.controlProvider : experiment.variantProvider,
    arm,
    experimentId: experiment.id,
  };
}

// ─── Result Collection ─────────────────────────────────────────────────

/**
 * Compute aggregate statistics for one arm of an experiment.
 */
export function computeArmStats(
  results: ABExperimentResult[],
  arm: "control" | "variant",
): ArmStats {
  const armResults = results.filter((r) => r.arm === arm);

  if (armResults.length === 0) {
    return {
      arm,
      providerId: "",
      sampleSize: 0,
      successRate: 0,
      avgLatencyMs: 0,
      medianLatencyMs: 0,
      p95LatencyMs: 0,
      avgCostUsd: 0,
      totalCostUsd: 0,
      avgQualityScore: null,
    };
  }

  const providerId = armResults[0].providerId;
  const successCount = armResults.filter((r) => r.succeeded).length;
  const latencies = armResults.map((r) => r.latencyMs).sort((a, b) => a - b);
  const costs = armResults.map((r) => r.costUsd);
  const qualityScores = armResults
    .map((r) => r.qualityScore)
    .filter((q): q is number => q !== null);

  return {
    arm,
    providerId,
    sampleSize: armResults.length,
    successRate: armResults.length > 0 ? successCount / armResults.length : 0,
    avgLatencyMs: mean(latencies),
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgCostUsd: mean(costs),
    totalCostUsd: sum(costs),
    avgQualityScore: qualityScores.length > 0 ? mean(qualityScores) : null,
  };
}

// ─── Statistical Significance ──────────────────────────────────────────

/**
 * Two-proportion Z-test for success rate comparison.
 */
export function proportionZTest(
  successA: number,
  nA: number,
  successB: number,
  nB: number,
): SignificanceResult {
  if (nA === 0 || nB === 0) {
    return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0, effectSize: 0 };
  }

  const pA = successA / nA;
  const pB = successB / nB;
  const pPooled = (successA + successB) / (nA + nB);
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

  if (se === 0) {
    return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0, effectSize: pB - pA };
  }

  const z = (pB - pA) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    zScore: z,
    pValue,
    isSignificant: pValue < 0.05,
    confidenceLevel: (1 - pValue) * 100,
    effectSize: pB - pA,
  };
}

/**
 * Welch's t-test for comparing means (latency, cost).
 * Handles unequal variances and sample sizes.
 */
export function welchTTest(
  valuesA: number[],
  valuesB: number[],
): SignificanceResult {
  const nA = valuesA.length;
  const nB = valuesB.length;

  if (nA < 2 || nB < 2) {
    return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0, effectSize: 0 };
  }

  const meanA = mean(valuesA);
  const meanB = mean(valuesB);
  const varA = variance(valuesA);
  const varB = variance(valuesB);

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) {
    return { zScore: 0, pValue: 1, isSignificant: false, confidenceLevel: 0, effectSize: meanB - meanA };
  }

  const t = (meanB - meanA) / se;

  // Welch-Satterthwaite degrees of freedom
  const dfNum = (varA / nA + varB / nB) ** 2;
  const dfDen = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = dfDen > 0 ? dfNum / dfDen : 1;

  // Approximate p-value using normal distribution for large df
  const pValue = df > 30
    ? 2 * (1 - normalCDF(Math.abs(t)))
    : approximateTDistPValue(Math.abs(t), df);

  return {
    zScore: t,
    pValue,
    isSignificant: pValue < 0.05,
    confidenceLevel: (1 - pValue) * 100,
    effectSize: meanB - meanA,
  };
}

/**
 * Generate a full comparison between control and variant arms.
 */
export function generateComparison(
  experiment: ABExperiment,
  results: ABExperimentResult[],
): ExperimentComparison {
  const controlResults = results.filter((r) => r.arm === "control");
  const variantResults = results.filter((r) => r.arm === "variant");

  const control = computeArmStats(results, "control");
  const variant = computeArmStats(results, "variant");

  // Success rate significance (two-proportion Z-test)
  const controlSuccesses = controlResults.filter((r) => r.succeeded).length;
  const variantSuccesses = variantResults.filter((r) => r.succeeded).length;
  const successRateSignificance = proportionZTest(
    controlSuccesses,
    controlResults.length,
    variantSuccesses,
    variantResults.length,
  );

  // Latency significance (Welch's t-test, lower is better)
  const controlLatencies = controlResults.map((r) => r.latencyMs);
  const variantLatencies = variantResults.map((r) => r.latencyMs);
  const latencySignificance = welchTTest(controlLatencies, variantLatencies);

  // Cost significance (Welch's t-test, lower is better)
  const controlCosts = controlResults.map((r) => r.costUsd);
  const variantCosts = variantResults.map((r) => r.costUsd);
  const costSignificance = welchTTest(controlCosts, variantCosts);

  // Overall recommendation
  let recommendation: ExperimentComparison["recommendation"] = "insufficient_data";

  if (control.sampleSize >= experiment.minSampleSize && variant.sampleSize >= experiment.minSampleSize) {
    let variantWins = 0;
    let controlWins = 0;

    // Success rate: higher is better
    if (successRateSignificance.isSignificant) {
      if (successRateSignificance.effectSize > 0) variantWins++;
      else controlWins++;
    }

    // Latency: lower is better for variant
    if (latencySignificance.isSignificant) {
      if (latencySignificance.effectSize < 0) variantWins++;
      else controlWins++;
    }

    // Cost: lower is better for variant
    if (costSignificance.isSignificant) {
      if (costSignificance.effectSize < 0) variantWins++;
      else controlWins++;
    }

    if (variantWins > controlWins) recommendation = "variant_better";
    else if (controlWins > variantWins) recommendation = "control_better";
    else recommendation = "no_difference";
  }

  return {
    experiment,
    control,
    variant,
    successRateSignificance,
    latencySignificance,
    costSignificance,
    recommendation,
  };
}

// ─── Experiment Factory ────────────────────────────────────────────────

export function createExperiment(params: {
  name: string;
  description?: string;
  controlProvider: string;
  variantProvider: string;
  trafficSplitPercent: number;
  workloadTypes?: string[];
  minSampleSize?: number;
}): ABExperiment {
  return {
    id: randomUUID(),
    name: params.name,
    description: params.description ?? "",
    controlProvider: params.controlProvider,
    variantProvider: params.variantProvider,
    trafficSplitPercent: Math.max(1, Math.min(99, params.trafficSplitPercent)),
    workloadTypes: params.workloadTypes ?? [],
    status: "draft",
    minSampleSize: params.minSampleSize ?? 30,
    createdAt: new Date(),
    startedAt: null,
    endedAt: null,
  };
}

export function createExperimentResult(params: {
  experimentId: string;
  arm: "control" | "variant";
  providerId: string;
  jobId: string;
  workloadType: string;
  latencyMs: number;
  costUsd: number;
  qualityScore?: number | null;
  succeeded: boolean;
}): ABExperimentResult {
  return {
    id: randomUUID(),
    experimentId: params.experimentId,
    arm: params.arm,
    providerId: params.providerId,
    jobId: params.jobId,
    workloadType: params.workloadType,
    latencyMs: params.latencyMs,
    costUsd: params.costUsd,
    qualityScore: params.qualityScore ?? null,
    succeeded: params.succeeded,
    createdAt: new Date(),
  };
}

// ─── Math Helpers ──────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Approximate t-distribution p-value for small df.
 * Uses a simple approximation that converges to normal for large df.
 */
function approximateTDistPValue(t: number, df: number): number {
  // For df > 30, use normal approximation
  if (df > 30) return 2 * (1 - normalCDF(t));

  // Simple approximation for smaller df
  const x = df / (df + t * t);
  // Regularized incomplete beta function approximation
  const p = 1 - 0.5 * Math.pow(x, df / 2);
  return Math.max(0, Math.min(1, 2 * (1 - normalCDF(t * Math.sqrt((df - 1) / df)))));
}
