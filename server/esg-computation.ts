/**
 * Prompt 23 — Expectation-Satisfaction Gap (ESG) Computation
 *
 * Measures how well what the creator got matched what they expected.
 * Low ESG = good (output met/exceeded expectation).
 * High ESG = bad (output fell short of expectation).
 */

// ─── Types ─────────────────────────────────────────────────────────────

export type RoutingAction = "none" | "monitor" | "investigate" | "act";

export interface ESGResult {
  expectationTier: number;
  actualTier: number;
  expectedSatisfaction: number;
  satisfactionScore: number;
  esg: number;
  routingAction: RoutingAction;
  interpretation: string;
}

export interface ESGTrend {
  period: string; // "30d" | "90d"
  avgESG: number;
  totalScenes: number;
  goodCount: number;    // ESG ≤ 0
  monitorCount: number; // 0 < ESG ≤ 0.5
  investigateCount: number; // 0.5 < ESG ≤ 1.5
  actCount: number;     // ESG > 1.5
  trend: "improving" | "stable" | "declining";
}

export interface AnchorHistogramEntry {
  tier: number;
  count: number;
  percentage: number;
}

export interface GapAnalysisEntry {
  sceneType: string;
  avgAnchoredTier: number;
  avgSelectedTier: number;
  gap: number;
  suggestion: string;
}

export interface ExpectationReportCard {
  userId: number;
  generatedAt: number; // timestamp
  personalESG: {
    avg30d: number;
    avg90d: number;
    platformAvg: number;
    trend: "improving" | "stable" | "declining";
  };
  anchorHistogram: AnchorHistogramEntry[];
  spendHistogram: AnchorHistogramEntry[];
  gapAnalysis: GapAnalysisEntry[];
  topExceeded: { sceneType: string; avgESG: number }[];
  bottomFellShort: { sceneType: string; avgESG: number }[];
  totalScenes: number;
}

// ─── Constants ─────────────────────────────────────────────────────────

/**
 * Baseline satisfaction scores per tier.
 * These represent the expected satisfaction for a "typical" output at each tier.
 * Derived from governance data and historical creator ratings.
 */
export const BASELINE_SATISFACTION: Record<number, number> = {
  1: 2.5,
  2: 3.0,
  3: 3.5,
  4: 4.0,
  5: 4.5,
};

/** ESG routing thresholds */
export const ESG_THRESHOLDS = {
  good: 0,        // ESG ≤ 0
  monitor: 0.5,   // 0 < ESG ≤ 0.5
  investigate: 1.5, // 0.5 < ESG ≤ 1.5
  // ESG > 1.5 → act
} as const;

/** ESG interpretation labels */
export const ESG_INTERPRETATIONS: Record<RoutingAction, string> = {
  none: "Output met or exceeded expectations",
  monitor: "Mild expectation gap — within acceptable range",
  investigate: "Meaningful expectation gap — sample library should be reviewed",
  act: "Severe expectation gap — proactive creator outreach triggered",
};

// ─── Core Computation ──────────────────────────────────────────────────

/**
 * Get the baseline expected satisfaction for a given tier.
 */
export function getBaselineSatisfaction(tier: number): number {
  return BASELINE_SATISFACTION[tier] ?? 3.0;
}

/**
 * Classify the ESG routing action based on the gap value.
 */
export function classifyESGRouting(esg: number): RoutingAction {
  if (esg <= ESG_THRESHOLDS.good) return "none";
  if (esg <= ESG_THRESHOLDS.monitor) return "monitor";
  if (esg <= ESG_THRESHOLDS.investigate) return "investigate";
  return "act";
}

/**
 * Compute the Expectation-Satisfaction Gap for a single scene.
 *
 * ESG = expected_satisfaction − satisfaction_score
 * - Negative ESG = output exceeded expectations (good)
 * - Positive ESG = output fell short (bad)
 */
export function computeESG(
  expectationTier: number,
  actualTier: number,
  satisfactionScore: number,
): ESGResult {
  const expectedSatisfaction = getBaselineSatisfaction(actualTier);
  const esg = Math.round((expectedSatisfaction - satisfactionScore) * 100) / 100;
  const routingAction = classifyESGRouting(esg);

  return {
    expectationTier,
    actualTier,
    expectedSatisfaction,
    satisfactionScore,
    esg,
    routingAction,
    interpretation: ESG_INTERPRETATIONS[routingAction],
  };
}

// ─── Trend Computation ─────────────────────────────────────────────────

export interface ESGRecord {
  esg: number;
  routingAction: RoutingAction;
  createdAt: number; // timestamp ms
}

/**
 * Compute ESG trend for a given period.
 */
export function computeESGTrend(
  records: ESGRecord[],
  periodDays: number,
): ESGTrend {
  const now = Date.now();
  const cutoff = now - periodDays * 86400000;
  const filtered = records.filter(r => r.createdAt >= cutoff);

  if (filtered.length === 0) {
    return {
      period: `${periodDays}d`,
      avgESG: 0,
      totalScenes: 0,
      goodCount: 0,
      monitorCount: 0,
      investigateCount: 0,
      actCount: 0,
      trend: "stable",
    };
  }

  const avgESG = Math.round(
    (filtered.reduce((sum, r) => sum + r.esg, 0) / filtered.length) * 100
  ) / 100;

  const goodCount = filtered.filter(r => r.routingAction === "none").length;
  const monitorCount = filtered.filter(r => r.routingAction === "monitor").length;
  const investigateCount = filtered.filter(r => r.routingAction === "investigate").length;
  const actCount = filtered.filter(r => r.routingAction === "act").length;

  // Determine trend by comparing first half vs second half
  const midpoint = cutoff + (now - cutoff) / 2;
  const firstHalf = filtered.filter(r => r.createdAt < midpoint);
  const secondHalf = filtered.filter(r => r.createdAt >= midpoint);

  let trend: "improving" | "stable" | "declining" = "stable";
  if (firstHalf.length > 0 && secondHalf.length > 0) {
    const firstAvg = firstHalf.reduce((s, r) => s + r.esg, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, r) => s + r.esg, 0) / secondHalf.length;
    const delta = secondAvg - firstAvg;
    if (delta < -0.15) trend = "improving"; // ESG going down = improving
    else if (delta > 0.15) trend = "declining"; // ESG going up = declining
  }

  return {
    period: `${periodDays}d`,
    avgESG,
    totalScenes: filtered.length,
    goodCount,
    monitorCount,
    investigateCount,
    actCount,
    trend,
  };
}

// ─── Report Card Generation ────────────────────────────────────────────

export interface AnchorRecord {
  sceneType: string;
  anchoredTier: number;
  selectedTier: number | null;
  createdAt: number;
}

/**
 * Build the anchor histogram (where the creator anchors).
 */
export function buildAnchorHistogram(anchors: AnchorRecord[]): AnchorHistogramEntry[] {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of anchors) {
    counts[a.anchoredTier] = (counts[a.anchoredTier] ?? 0) + 1;
  }
  const total = anchors.length || 1;
  return Object.entries(counts).map(([tier, count]) => ({
    tier: Number(tier),
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

/**
 * Build the spend histogram (where the creator actually spends).
 */
export function buildSpendHistogram(anchors: AnchorRecord[]): AnchorHistogramEntry[] {
  const withSelection = anchors.filter(a => a.selectedTier != null);
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of withSelection) {
    counts[a.selectedTier!] = (counts[a.selectedTier!] ?? 0) + 1;
  }
  const total = withSelection.length || 1;
  return Object.entries(counts).map(([tier, count]) => ({
    tier: Number(tier),
    count,
    percentage: Math.round((count / total) * 100),
  }));
}

/**
 * Compute gap analysis per scene type.
 */
export function computeGapAnalysis(anchors: AnchorRecord[]): GapAnalysisEntry[] {
  const byScene = new Map<string, { anchoredTiers: number[]; selectedTiers: number[] }>();

  for (const a of anchors) {
    if (a.selectedTier == null) continue;
    const entry = byScene.get(a.sceneType) ?? { anchoredTiers: [], selectedTiers: [] };
    entry.anchoredTiers.push(a.anchoredTier);
    entry.selectedTiers.push(a.selectedTier);
    byScene.set(a.sceneType, entry);
  }

  return Array.from(byScene.entries()).map(([sceneType, data]) => {
    const avgAnchored = data.anchoredTiers.reduce((s, t) => s + t, 0) / data.anchoredTiers.length;
    const avgSelected = data.selectedTiers.reduce((s, t) => s + t, 0) / data.selectedTiers.length;
    const gap = Math.round((avgAnchored - avgSelected) * 100) / 100;

    let suggestion = "";
    if (gap > 1) {
      suggestion = `You often anchor to tier ${Math.round(avgAnchored)} but select tier ${Math.round(avgSelected)} — consider sampling tier ${Math.round((avgAnchored + avgSelected) / 2)} on your next ${sceneType} scene.`;
    } else if (gap > 0.5) {
      suggestion = `There is a moderate gap between your expectations and selections for ${sceneType} scenes. Reviewing tier samples may help calibrate.`;
    } else {
      suggestion = `Your expectations are well-calibrated for ${sceneType} scenes.`;
    }

    return {
      sceneType,
      avgAnchoredTier: Math.round(avgAnchored * 10) / 10,
      avgSelectedTier: Math.round(avgSelected * 10) / 10,
      gap,
      suggestion,
    };
  }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/**
 * Generate the full Expectation Report Card for a creator.
 */
export function generateExpectationReportCard(
  userId: number,
  esgRecords: ESGRecord[],
  anchorRecords: AnchorRecord[],
  platformAvgESG = 0.35,
): ExpectationReportCard {
  const trend30d = computeESGTrend(esgRecords, 30);
  const trend90d = computeESGTrend(esgRecords, 90);

  const anchorHistogram = buildAnchorHistogram(anchorRecords);
  const spendHistogram = buildSpendHistogram(anchorRecords);
  const gapAnalysis = computeGapAnalysis(anchorRecords);

  // Top 3 exceeded (lowest ESG by scene type)
  const bySceneESG = new Map<string, number[]>();
  for (const r of esgRecords) {
    // We need scene type from anchors — match by timestamp proximity
    const anchor = anchorRecords.find(a => Math.abs(a.createdAt - r.createdAt) < 60000);
    const sceneType = anchor?.sceneType ?? "unknown";
    const arr = bySceneESG.get(sceneType) ?? [];
    arr.push(r.esg);
    bySceneESG.set(sceneType, arr);
  }

  const sceneAvgESG = Array.from(bySceneESG.entries()).map(([sceneType, esgs]) => ({
    sceneType,
    avgESG: Math.round((esgs.reduce((s, e) => s + e, 0) / esgs.length) * 100) / 100,
  }));

  const sorted = [...sceneAvgESG].sort((a, b) => a.avgESG - b.avgESG);
  const topExceeded = sorted.slice(0, 3);
  const bottomFellShort = sorted.slice(-3).reverse();

  return {
    userId,
    generatedAt: Date.now(),
    personalESG: {
      avg30d: trend30d.avgESG,
      avg90d: trend90d.avgESG,
      platformAvg: platformAvgESG,
      trend: trend30d.trend,
    },
    anchorHistogram,
    spendHistogram,
    gapAnalysis,
    topExceeded,
    bottomFellShort,
    totalScenes: esgRecords.length,
  };
}
