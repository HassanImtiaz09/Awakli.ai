/**
 * LoRA Retraining Recommendation Module
 *
 * Detects diminishing returns across multiple re-fix attempts on frames
 * and generates actionable LoRA retraining recommendations with specific
 * reference image suggestions per weak feature.
 */

import type { FeatureDrift } from "./consistency-analysis";

// ─── Types ──────────────────────────────────────────────────────────────

export interface FixAttemptRecord {
  jobId: number;
  generationId: number;
  frameIndex: number;
  episodeId: number;
  originalDriftScore: number;
  newDriftScore: number | null;
  driftImprovement: number | null;
  boostedLoraStrength: number;
  boostDelta: number;
  targetFeatures: string[] | null;
  severity: "warning" | "critical";
  status: "queued" | "processing" | "completed" | "failed";
  queuedAt: number; // ms since epoch
}

export interface FrameFixSummary {
  generationId: number;
  frameIndex: number;
  episodeId: number;
  attempts: FixAttemptRecord[];
  completedAttempts: FixAttemptRecord[];
  /** Per-attempt improvement deltas (positive = improved) */
  improvementDeltas: number[];
  /** Whether improvement is declining across attempts */
  isDiminishing: boolean;
  /** Latest drift score after most recent completed fix */
  latestDriftScore: number | null;
  /** Total improvement from first to last completed fix */
  totalImprovement: number;
}

export interface ImprovementTrend {
  /** Slope of improvement across attempts (negative = diminishing) */
  slope: number;
  /** Average improvement per attempt */
  avgImprovement: number;
  /** Improvement of the most recent attempt */
  latestImprovement: number;
  /** Number of data points */
  dataPoints: number;
  /** Whether the trend is clearly diminishing */
  isDiminishing: boolean;
  /** Per-attempt improvements for visualization */
  perAttemptImprovements: Array<{
    attempt: number;
    improvement: number;
    cumulativeImprovement: number;
  }>;
}

export interface WeakFeature {
  feature: keyof FeatureDrift;
  /** Human-readable label */
  label: string;
  /** Average drift for this feature across all analyzed frames */
  avgDrift: number;
  /** How many frames have this feature flagged as high-drift */
  affectedFrameCount: number;
  /** How many fix attempts targeted this feature */
  fixAttemptCount: number;
  /** Whether this feature improved after fixes */
  improvedAfterFix: boolean;
  /** Specific reference image suggestions */
  referenceImageSuggestions: ReferenceImageSuggestion[];
}

export interface ReferenceImageSuggestion {
  /** Type of reference image needed */
  type: "angle" | "detail" | "lighting" | "expression" | "full_body" | "color_reference";
  /** Human-readable description */
  description: string;
  /** Priority: 1 = highest */
  priority: number;
}

export type RetrainingUrgency = "recommended" | "strongly_recommended" | "critical";

export interface DiminishingReturnsAnalysis {
  /** Total frames analyzed */
  totalFramesAnalyzed: number;
  /** Frames with 3+ fix attempts */
  framesWithMultipleAttempts: number;
  /** Frames showing diminishing returns */
  framesWithDiminishingReturns: number;
  /** Overall improvement trend across all multi-attempt frames */
  overallTrend: ImprovementTrend;
  /** Per-frame summaries */
  frameSummaries: FrameFixSummary[];
  /** Average remaining drift after all fixes */
  avgRemainingDrift: number;
  /** Maximum remaining drift */
  maxRemainingDrift: number;
}

export interface RetrainingRecommendation {
  /** Whether retraining is recommended */
  shouldRetrain: boolean;
  /** Urgency level */
  urgency: RetrainingUrgency;
  /** Human-readable summary */
  summary: string;
  /** Detailed explanation */
  explanation: string;
  /** Weak features that need better reference data */
  weakFeatures: WeakFeature[];
  /** Diminishing returns analysis */
  analysis: DiminishingReturnsAnalysis;
  /** Estimated improvement from retraining (0-1) */
  estimatedRetrainingImpact: number;
  /** Total reference images suggested */
  totalSuggestedImages: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Minimum completed attempts before we can detect diminishing returns */
export const MIN_ATTEMPTS_FOR_RECOMMENDATION = 3;

/** If improvement drops below this per attempt, it's plateauing */
export const IMPROVEMENT_PLATEAU_THRESHOLD = 0.02;

/** Features with drift above this after fixes are "weak" */
export const WEAK_FEATURE_THRESHOLD = 0.15;

/** If remaining drift is above this, retraining is strongly recommended */
export const HIGH_REMAINING_DRIFT = 0.20;

/** If remaining drift is above this, retraining is critical */
export const CRITICAL_REMAINING_DRIFT = 0.30;

/** Feature labels for display */
export const FEATURE_LABELS: Record<keyof FeatureDrift, string> = {
  face: "Facial Features",
  hair: "Hair Style & Color",
  outfit: "Outfit & Clothing",
  colorPalette: "Color Palette",
  bodyProportion: "Body Proportions",
};

/** Reference image suggestions per feature */
const FEATURE_REFERENCE_SUGGESTIONS: Record<keyof FeatureDrift, ReferenceImageSuggestion[]> = {
  face: [
    { type: "angle", description: "Front-facing portrait with neutral expression", priority: 1 },
    { type: "angle", description: "3/4 view showing facial structure", priority: 2 },
    { type: "expression", description: "Key expressions (smile, serious, surprised)", priority: 3 },
    { type: "detail", description: "Close-up of distinctive facial marks or features", priority: 4 },
  ],
  hair: [
    { type: "angle", description: "Clear view of hairstyle from front and side", priority: 1 },
    { type: "detail", description: "Hair color reference in different lighting", priority: 2 },
    { type: "angle", description: "Back view showing hair length and style", priority: 3 },
  ],
  outfit: [
    { type: "full_body", description: "Full-body reference showing complete outfit", priority: 1 },
    { type: "detail", description: "Close-up of distinctive clothing details (buttons, patterns, accessories)", priority: 2 },
    { type: "color_reference", description: "Outfit color swatches for accurate reproduction", priority: 3 },
  ],
  colorPalette: [
    { type: "color_reference", description: "Character color palette sheet with exact values", priority: 1 },
    { type: "lighting", description: "Character in standard neutral lighting", priority: 2 },
    { type: "lighting", description: "Character in warm and cool lighting conditions", priority: 3 },
  ],
  bodyProportion: [
    { type: "full_body", description: "Full-body T-pose or A-pose reference", priority: 1 },
    { type: "full_body", description: "Height comparison chart with other characters", priority: 2 },
    { type: "angle", description: "Side profile showing body proportions", priority: 3 },
  ],
};

// ─── Core Functions ─────────────────────────────────────────────────────

/**
 * Compute per-attempt improvement deltas from a list of completed fix attempts.
 * Returns improvements in chronological order.
 */
export function computeImprovementTrend(
  completedAttempts: FixAttemptRecord[],
): ImprovementTrend {
  if (completedAttempts.length === 0) {
    return {
      slope: 0,
      avgImprovement: 0,
      latestImprovement: 0,
      dataPoints: 0,
      isDiminishing: false,
      perAttemptImprovements: [],
    };
  }

  // Sort by queuedAt chronologically
  const sorted = [...completedAttempts].sort((a, b) => a.queuedAt - b.queuedAt);

  const improvements = sorted.map(a => a.driftImprovement ?? 0);
  let cumulative = 0;
  const perAttemptImprovements = improvements.map((imp, idx) => {
    cumulative += imp;
    return {
      attempt: idx + 1,
      improvement: Math.round(imp * 10000) / 10000,
      cumulativeImprovement: Math.round(cumulative * 10000) / 10000,
    };
  });

  const avgImprovement = improvements.reduce((s, v) => s + v, 0) / improvements.length;
  const latestImprovement = improvements[improvements.length - 1];

  // Compute slope using simple linear regression on improvement values
  const n = improvements.length;
  let slope = 0;
  if (n >= 2) {
    const xMean = (n - 1) / 2;
    const yMean = avgImprovement;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (improvements[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }
    slope = denominator !== 0 ? numerator / denominator : 0;
  }

  // Diminishing if slope is negative and latest improvement is below threshold
  const isDiminishing = n >= 2 && (
    slope < -0.005 ||
    (latestImprovement < IMPROVEMENT_PLATEAU_THRESHOLD && n >= MIN_ATTEMPTS_FOR_RECOMMENDATION)
  );

  return {
    slope: Math.round(slope * 100000) / 100000,
    avgImprovement: Math.round(avgImprovement * 10000) / 10000,
    latestImprovement: Math.round(latestImprovement * 10000) / 10000,
    dataPoints: n,
    isDiminishing,
    perAttemptImprovements,
  };
}

/**
 * Group fix attempts by frame (generationId) and compute per-frame summaries.
 */
export function buildFrameFixSummaries(
  attempts: FixAttemptRecord[],
): FrameFixSummary[] {
  // Group by generationId
  const byFrame = new Map<number, FixAttemptRecord[]>();
  for (const attempt of attempts) {
    const existing = byFrame.get(attempt.generationId) ?? [];
    existing.push(attempt);
    byFrame.set(attempt.generationId, existing);
  }

  const summaries: FrameFixSummary[] = [];

  for (const [generationId, frameAttempts] of Array.from(byFrame.entries())) {
    const sorted = [...frameAttempts].sort((a, b) => a.queuedAt - b.queuedAt);
    const completed = sorted.filter(a => a.status === "completed");
    const improvementDeltas = completed.map(a => a.driftImprovement ?? 0);

    // Check if improvements are diminishing
    let isDiminishing = false;
    if (improvementDeltas.length >= 2) {
      // Compare last improvement to first
      const first = improvementDeltas[0];
      const last = improvementDeltas[improvementDeltas.length - 1];
      isDiminishing = last < first * 0.5 || last < IMPROVEMENT_PLATEAU_THRESHOLD;
    }

    const latestCompleted = completed[completed.length - 1];
    const latestDriftScore = latestCompleted?.newDriftScore ?? null;

    const firstOriginal = sorted[0]?.originalDriftScore ?? 0;
    const totalImprovement = latestDriftScore != null
      ? Math.round((firstOriginal - latestDriftScore) * 10000) / 10000
      : improvementDeltas.reduce((s, d) => s + d, 0);

    summaries.push({
      generationId,
      frameIndex: sorted[0].frameIndex,
      episodeId: sorted[0].episodeId,
      attempts: sorted,
      completedAttempts: completed,
      improvementDeltas,
      isDiminishing,
      latestDriftScore,
      totalImprovement: Math.round(totalImprovement * 10000) / 10000,
    });
  }

  return summaries;
}

/**
 * Analyze fix history for diminishing returns patterns.
 */
export function analyzeDiminishingReturns(
  attempts: FixAttemptRecord[],
): DiminishingReturnsAnalysis {
  const frameSummaries = buildFrameFixSummaries(attempts);

  const multiAttemptFrames = frameSummaries.filter(
    s => s.completedAttempts.length >= MIN_ATTEMPTS_FOR_RECOMMENDATION
  );
  const diminishingFrames = frameSummaries.filter(s => s.isDiminishing);

  // Compute overall trend from all completed attempts across multi-attempt frames
  const allCompleted = multiAttemptFrames.flatMap(s => s.completedAttempts);
  const overallTrend = computeImprovementTrend(allCompleted);

  // Remaining drift stats
  const remainingDrifts = frameSummaries
    .filter(s => s.latestDriftScore != null)
    .map(s => s.latestDriftScore!);

  const avgRemainingDrift = remainingDrifts.length > 0
    ? Math.round(remainingDrifts.reduce((s, d) => s + d, 0) / remainingDrifts.length * 10000) / 10000
    : 0;
  const maxRemainingDrift = remainingDrifts.length > 0
    ? Math.round(Math.max(...remainingDrifts) * 10000) / 10000
    : 0;

  return {
    totalFramesAnalyzed: frameSummaries.length,
    framesWithMultipleAttempts: multiAttemptFrames.length,
    framesWithDiminishingReturns: diminishingFrames.length,
    overallTrend,
    frameSummaries,
    avgRemainingDrift,
    maxRemainingDrift,
  };
}

/**
 * Identify features that consistently fail to improve despite multiple fix attempts.
 */
export function identifyWeakFeatures(
  attempts: FixAttemptRecord[],
): WeakFeature[] {
  // Count how often each feature appears in targetFeatures across all attempts
  const featureCounts: Record<string, { targeted: number; total: number }> = {};
  const featureKeys: Array<keyof FeatureDrift> = [
    "face", "hair", "outfit", "colorPalette", "bodyProportion",
  ];

  for (const key of featureKeys) {
    featureCounts[key] = { targeted: 0, total: 0 };
  }

  // Count targeting frequency
  const completedAttempts = attempts.filter(a => a.status === "completed");
  for (const attempt of attempts) {
    if (attempt.targetFeatures) {
      for (const feature of attempt.targetFeatures) {
        if (featureCounts[feature]) {
          featureCounts[feature].targeted++;
        }
      }
    }
  }

  // Estimate remaining per-feature drift from latest completed attempts
  // We use the overall drift improvement ratio as a proxy
  const frameSummaries = buildFrameFixSummaries(attempts);
  const featureDriftSums: Record<string, { sum: number; count: number }> = {};
  for (const key of featureKeys) {
    featureDriftSums[key] = { sum: 0, count: 0 };
  }

  // For each frame, estimate remaining feature drift based on overall improvement
  for (const summary of frameSummaries) {
    const latestDrift = summary.latestDriftScore;
    const originalDrift = summary.attempts[0]?.originalDriftScore ?? 0;
    const improvementRatio = originalDrift > 0 && latestDrift != null
      ? (originalDrift - latestDrift) / originalDrift
      : 0;

    // Features that were targeted but still have high drift are "weak"
    for (const key of featureKeys) {
      // Estimate: if a feature was targeted multiple times and improvement ratio is low,
      // the feature is likely still problematic
      const wasTargeted = summary.attempts.some(
        a => a.targetFeatures?.includes(key)
      );
      if (wasTargeted) {
        // Estimate remaining drift for this feature
        // Lower improvement ratio = higher remaining drift
        const estimatedRemaining = Math.max(0, 1 - improvementRatio) * 0.3;
        featureDriftSums[key].sum += estimatedRemaining;
        featureDriftSums[key].count++;
      }
    }
  }

  const weakFeatures: WeakFeature[] = [];

  for (const key of featureKeys) {
    const avgDrift = featureDriftSums[key].count > 0
      ? featureDriftSums[key].sum / featureDriftSums[key].count
      : 0;

    const isWeak = featureCounts[key].targeted >= 2 && avgDrift >= WEAK_FEATURE_THRESHOLD * 0.5;

    if (isWeak || featureCounts[key].targeted >= MIN_ATTEMPTS_FOR_RECOMMENDATION) {
      weakFeatures.push({
        feature: key,
        label: FEATURE_LABELS[key],
        avgDrift: Math.round(avgDrift * 10000) / 10000,
        affectedFrameCount: featureDriftSums[key].count,
        fixAttemptCount: featureCounts[key].targeted,
        improvedAfterFix: avgDrift < WEAK_FEATURE_THRESHOLD,
        referenceImageSuggestions: FEATURE_REFERENCE_SUGGESTIONS[key],
      });
    }
  }

  // Sort by fix attempt count descending (most problematic first)
  weakFeatures.sort((a, b) => b.fixAttemptCount - a.fixAttemptCount);

  return weakFeatures;
}

/**
 * Assess the urgency of retraining based on the analysis.
 */
export function assessRetrainingUrgency(
  analysis: DiminishingReturnsAnalysis,
): RetrainingUrgency {
  // Critical: many frames with diminishing returns AND high remaining drift
  if (
    analysis.framesWithDiminishingReturns >= 3 &&
    analysis.avgRemainingDrift >= CRITICAL_REMAINING_DRIFT
  ) {
    return "critical";
  }

  // Strongly recommended: some diminishing returns OR high remaining drift
  if (
    analysis.framesWithDiminishingReturns >= 2 ||
    analysis.avgRemainingDrift >= HIGH_REMAINING_DRIFT ||
    (analysis.framesWithMultipleAttempts >= 3 && analysis.overallTrend.isDiminishing)
  ) {
    return "strongly_recommended";
  }

  // Recommended: any diminishing returns detected
  return "recommended";
}

/**
 * Generate a complete retraining recommendation from fix history.
 */
export function generateRetrainingRecommendation(
  attempts: FixAttemptRecord[],
): RetrainingRecommendation | null {
  if (attempts.length === 0) return null;

  const analysis = analyzeDiminishingReturns(attempts);

  // Only recommend if there are frames with multiple attempts
  const hasMultiAttemptFrames = analysis.framesWithMultipleAttempts > 0;
  const hasDiminishingReturns = analysis.framesWithDiminishingReturns > 0;
  const hasHighRemainingDrift = analysis.avgRemainingDrift >= WEAK_FEATURE_THRESHOLD;

  // Need at least some signal to make a recommendation
  if (!hasMultiAttemptFrames && !hasHighRemainingDrift) return null;

  const shouldRetrain = hasDiminishingReturns || hasHighRemainingDrift;
  const urgency = shouldRetrain
    ? assessRetrainingUrgency(analysis)
    : "recommended";

  const weakFeatures = identifyWeakFeatures(attempts);

  // Estimate retraining impact based on how much drift remains
  const estimatedRetrainingImpact = Math.min(
    0.8,
    analysis.avgRemainingDrift * 2 + (analysis.framesWithDiminishingReturns * 0.1)
  );

  const totalSuggestedImages = weakFeatures.reduce(
    (s, f) => s + f.referenceImageSuggestions.length, 0
  );

  // Generate summary and explanation
  const summary = generateSummary(analysis, weakFeatures, urgency);
  const explanation = generateExplanation(analysis, weakFeatures);

  return {
    shouldRetrain,
    urgency,
    summary,
    explanation,
    weakFeatures,
    analysis,
    estimatedRetrainingImpact: Math.round(estimatedRetrainingImpact * 100) / 100,
    totalSuggestedImages,
  };
}

// ─── Summary Generators ─────────────────────────────────────────────────

function generateSummary(
  analysis: DiminishingReturnsAnalysis,
  weakFeatures: WeakFeature[],
  urgency: RetrainingUrgency,
): string {
  const urgencyPrefix = urgency === "critical"
    ? "Critical: "
    : urgency === "strongly_recommended"
      ? "Strongly recommended: "
      : "";

  if (analysis.framesWithDiminishingReturns > 0) {
    const featureNames = weakFeatures.slice(0, 3).map(f => f.label).join(", ");
    return `${urgencyPrefix}${analysis.framesWithDiminishingReturns} frame${
      analysis.framesWithDiminishingReturns > 1 ? "s" : ""
    } showing diminishing returns after multiple fix attempts. ${
      weakFeatures.length > 0
        ? `Weak features: ${featureNames}.`
        : "Consider retraining with more diverse reference images."
    }`;
  }

  if (analysis.avgRemainingDrift >= WEAK_FEATURE_THRESHOLD) {
    return `${urgencyPrefix}Average remaining drift of ${
      (analysis.avgRemainingDrift * 100).toFixed(1)
    }% after fixes suggests the current LoRA needs retraining with better reference data.`;
  }

  return `${urgencyPrefix}Multiple fix attempts detected. Retraining may improve consistency.`;
}

function generateExplanation(
  analysis: DiminishingReturnsAnalysis,
  weakFeatures: WeakFeature[],
): string {
  const parts: string[] = [];

  parts.push(
    `Analyzed ${analysis.totalFramesAnalyzed} frame${
      analysis.totalFramesAnalyzed > 1 ? "s" : ""
    } with fix history.`
  );

  if (analysis.framesWithMultipleAttempts > 0) {
    parts.push(
      `${analysis.framesWithMultipleAttempts} frame${
        analysis.framesWithMultipleAttempts > 1 ? "s have" : " has"
      } ${MIN_ATTEMPTS_FOR_RECOMMENDATION}+ completed fix attempts.`
    );
  }

  if (analysis.framesWithDiminishingReturns > 0) {
    parts.push(
      `${analysis.framesWithDiminishingReturns} frame${
        analysis.framesWithDiminishingReturns > 1 ? "s show" : " shows"
      } diminishing improvement — each successive fix yields less benefit.`
    );
  }

  if (analysis.overallTrend.isDiminishing && analysis.overallTrend.dataPoints >= 2) {
    parts.push(
      `Overall improvement trend is declining (slope: ${analysis.overallTrend.slope.toFixed(4)}).`
    );
  }

  if (weakFeatures.length > 0) {
    const featureList = weakFeatures.map(f =>
      `${f.label} (targeted ${f.fixAttemptCount}x across ${f.affectedFrameCount} frame${f.affectedFrameCount > 1 ? "s" : ""})`
    ).join("; ");
    parts.push(`Persistently weak features: ${featureList}.`);
  }

  parts.push(
    `Retraining the LoRA with additional reference images for the weak features will likely produce better results than further fix attempts.`
  );

  return parts.join(" ");
}
