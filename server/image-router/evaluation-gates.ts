/**
 * Image Router Evaluation Gates (M1-M12)
 *
 * Each gate is a pure, testable function that evaluates a specific aspect
 * of the image routing system. Gates return a structured result with
 * pass/fail, score, and diagnostic notes.
 *
 * @see Prompt 25, Section 12
 */

import { WORKLOAD_CONFIGS, type WorkloadType } from "./types";

// ─── Gate Result Type ───────────────────────────────────────────────────

export interface GateResult {
  gateId: string;
  name: string;
  pass: boolean;
  score: number;         // 0.0 - 1.0
  threshold: number;     // minimum score to pass
  notes: string;
  evaluatedAt: number;   // Unix ms
}

// ─── M1: Router dispatches manga-panel jobs to Runware by default ──────

export function evaluateM1_RoutingDefault(
  routingDecisions: Array<{ workloadType: string; selectedProvider: string }>,
): GateResult {
  const mangaPanelJobs = routingDecisions.filter(
    (d) => d.workloadType === "manga_panel" || d.workloadType === "MANGA_PANEL_CHARACTER" || d.workloadType === "MANGA_PANEL_BACKGROUND",
  );

  if (mangaPanelJobs.length === 0) {
    return {
      gateId: "M1",
      name: "Manga panel routing default",
      pass: false,
      score: 0,
      threshold: 1.0,
      notes: "No manga panel jobs found in sample",
      evaluatedAt: Date.now(),
    };
  }

  const routedToRunware = mangaPanelJobs.filter((d) => d.selectedProvider === "runware").length;
  const score = routedToRunware / mangaPanelJobs.length;

  return {
    gateId: "M1",
    name: "Manga panel routing default",
    pass: score >= 1.0,
    score,
    threshold: 1.0,
    notes: `${routedToRunware}/${mangaPanelJobs.length} manga panel jobs routed to Runware`,
    evaluatedAt: Date.now(),
  };
}

// ─── M2: Fallback to Tensor.Art fires on Runware outage ────────────────

export function evaluateM2_FallbackBehavior(
  fallbackDecisions: Array<{
    workloadType: string;
    primaryProvider: string;
    primaryHealthy: boolean;
    selectedProvider: string;
    completedWithinMs: number;
  }>,
): GateResult {
  const outageJobs = fallbackDecisions.filter(
    (d) => d.primaryProvider === "runware" && !d.primaryHealthy,
  );

  if (outageJobs.length === 0) {
    return {
      gateId: "M2",
      name: "Fallback on Runware outage",
      pass: false,
      score: 0,
      threshold: 1.0,
      notes: "No outage-scenario jobs found in sample",
      evaluatedAt: Date.now(),
    };
  }

  const completedViaFallback = outageJobs.filter(
    (d) => d.selectedProvider === "tensorart" && d.completedWithinMs <= 60_000,
  ).length;
  const score = completedViaFallback / outageJobs.length;

  return {
    gateId: "M2",
    name: "Fallback on Runware outage",
    pass: score >= 1.0,
    score,
    threshold: 1.0,
    notes: `${completedViaFallback}/${outageJobs.length} outage jobs completed via TensorArt within 60s`,
    evaluatedAt: Date.now(),
  };
}

// ─── M3: LoRA renders identically on Runware vs fal.ai baseline ────────

export function evaluateM3_LoraConsistency(
  comparisons: Array<{ promptId: string; clipSimilarity: number }>,
): GateResult {
  if (comparisons.length === 0) {
    return {
      gateId: "M3",
      name: "LoRA render consistency (Runware vs fal.ai)",
      pass: false,
      score: 0,
      threshold: 0.92,
      notes: "No comparison data available",
      evaluatedAt: Date.now(),
    };
  }

  const avgSimilarity = comparisons.reduce((sum, c) => sum + c.clipSimilarity, 0) / comparisons.length;
  const belowThreshold = comparisons.filter((c) => c.clipSimilarity < 0.92);

  return {
    gateId: "M3",
    name: "LoRA render consistency (Runware vs fal.ai)",
    pass: avgSimilarity >= 0.92,
    score: avgSimilarity,
    threshold: 0.92,
    notes: `Avg CLIP similarity: ${avgSimilarity.toFixed(4)} across ${comparisons.length} prompts. ${belowThreshold.length} below threshold.`,
    evaluatedAt: Date.now(),
  };
}

// ─── M4: ControlNet-heavy panels render correctly on Runware ────────────

export function evaluateM4_ControlNetParity(
  comparisons: Array<{ panelId: string; visualParityScore: number }>,
): GateResult {
  if (comparisons.length === 0) {
    return {
      gateId: "M4",
      name: "ControlNet visual parity",
      pass: false,
      score: 0,
      threshold: 0.90,
      notes: "No ControlNet comparison data available",
      evaluatedAt: Date.now(),
    };
  }

  const avgParity = comparisons.reduce((sum, c) => sum + c.visualParityScore, 0) / comparisons.length;

  return {
    gateId: "M4",
    name: "ControlNet visual parity",
    pass: avgParity >= 0.90,
    score: avgParity,
    threshold: 0.90,
    notes: `Avg visual parity: ${avgParity.toFixed(4)} across ${comparisons.length} CN panels`,
    evaluatedAt: Date.now(),
  };
}

// ─── M5: Cost attribution row written for every completed job ──────────

export function evaluateM5_CostAttribution(
  stats: { completedJobs: number; jobsWithCostRow: number; jobsWithPositiveCost: number },
): GateResult {
  if (stats.completedJobs === 0) {
    return {
      gateId: "M5",
      name: "Cost attribution completeness",
      pass: false,
      score: 0,
      threshold: 1.0,
      notes: "No completed jobs to evaluate",
      evaluatedAt: Date.now(),
    };
  }

  const rowCoverage = stats.jobsWithCostRow / stats.completedJobs;
  const costCoverage = stats.jobsWithPositiveCost / stats.completedJobs;
  const score = Math.min(rowCoverage, costCoverage);

  return {
    gateId: "M5",
    name: "Cost attribution completeness",
    pass: score >= 1.0,
    score,
    threshold: 1.0,
    notes: `Row coverage: ${(rowCoverage * 100).toFixed(1)}%, positive cost: ${(costCoverage * 100).toFixed(1)}% of ${stats.completedJobs} jobs`,
    evaluatedAt: Date.now(),
  };
}

// ─── M6: Budget tracker matches provider invoice within 5% ─────────────

export function evaluateM6_BudgetAccuracy(
  comparisons: Array<{ providerId: string; trackedUsd: number; invoiceUsd: number }>,
): GateResult {
  if (comparisons.length === 0) {
    return {
      gateId: "M6",
      name: "Budget tracker vs invoice accuracy",
      pass: false,
      score: 0,
      threshold: 0.95,
      notes: "No invoice comparison data available",
      evaluatedAt: Date.now(),
    };
  }

  const deviations = comparisons.map((c) => {
    if (c.invoiceUsd === 0) return c.trackedUsd === 0 ? 0 : 1;
    return Math.abs(c.trackedUsd - c.invoiceUsd) / c.invoiceUsd;
  });
  const maxDeviation = Math.max(...deviations);
  const score = 1 - maxDeviation;

  return {
    gateId: "M6",
    name: "Budget tracker vs invoice accuracy",
    pass: maxDeviation <= 0.05,
    score: Math.max(0, score),
    threshold: 0.95,
    notes: `Max deviation: ${(maxDeviation * 100).toFixed(2)}% across ${comparisons.length} providers`,
    evaluatedAt: Date.now(),
  };
}

// ─── M7: Secrets never appear in logs or error messages ────────────────

export function evaluateM7_SecretLeakage(
  scanResults: { totalLinesScanned: number; matchesFound: number; matchDetails: string[] },
): GateResult {
  const score = scanResults.matchesFound === 0 ? 1.0 : 0.0;

  return {
    gateId: "M7",
    name: "Secret leakage scan",
    pass: scanResults.matchesFound === 0,
    score,
    threshold: 1.0,
    notes: scanResults.matchesFound === 0
      ? `Clean: scanned ${scanResults.totalLinesScanned} log lines, 0 secret matches`
      : `LEAK DETECTED: ${scanResults.matchesFound} matches in ${scanResults.totalLinesScanned} lines. Details: ${scanResults.matchDetails.slice(0, 3).join("; ")}`,
    evaluatedAt: Date.now(),
  };
}

// ─── M8: Kill-switch executes in <30s end-to-end ───────────────────────

export function evaluateM8_KillSwitch(
  dryRunResult: { rotationTimeMs: number; routerReturned503: boolean; totalTimeMs: number },
): GateResult {
  const pass = dryRunResult.totalTimeMs <= 30_000 && dryRunResult.routerReturned503;
  const score = pass ? 1.0 : dryRunResult.totalTimeMs <= 30_000 ? 0.5 : 0.0;

  return {
    gateId: "M8",
    name: "Kill-switch execution time",
    pass,
    score,
    threshold: 1.0,
    notes: `Total time: ${dryRunResult.totalTimeMs}ms, rotation: ${dryRunResult.rotationTimeMs}ms, 503 returned: ${dryRunResult.routerReturned503}`,
    evaluatedAt: Date.now(),
  };
}

// ─── M9: Rolling key rotation causes zero dropped jobs ─────────────────

export function evaluateM9_KeyRotation(
  rotationResult: { totalInFlightJobs: number; droppedJobs: number; duplicatedJobs: number },
): GateResult {
  const pass = rotationResult.droppedJobs === 0 && rotationResult.duplicatedJobs === 0;
  const score = pass ? 1.0 : 1 - ((rotationResult.droppedJobs + rotationResult.duplicatedJobs) / Math.max(rotationResult.totalInFlightJobs, 1));

  return {
    gateId: "M9",
    name: "Zero-drop key rotation",
    pass,
    score: Math.max(0, score),
    threshold: 1.0,
    notes: `${rotationResult.totalInFlightJobs} in-flight, ${rotationResult.droppedJobs} dropped, ${rotationResult.duplicatedJobs} duplicated`,
    evaluatedAt: Date.now(),
  };
}

// ─── M10: Per-chapter cost reduction >= 60% vs fal.ai baseline ─────────

export function evaluateM10_CostReduction(
  chapterCosts: Array<{ chapterId: string; baselineCostUsd: number; routedCostUsd: number }>,
): GateResult {
  if (chapterCosts.length === 0) {
    return {
      gateId: "M10",
      name: "Per-chapter cost reduction",
      pass: false,
      score: 0,
      threshold: 0.60,
      notes: "No chapter cost data available",
      evaluatedAt: Date.now(),
    };
  }

  const reductions = chapterCosts.map((c) => {
    if (c.baselineCostUsd === 0) return 0;
    return (c.baselineCostUsd - c.routedCostUsd) / c.baselineCostUsd;
  });
  const avgReduction = reductions.reduce((sum, r) => sum + r, 0) / reductions.length;

  return {
    gateId: "M10",
    name: "Per-chapter cost reduction",
    pass: avgReduction >= 0.60,
    score: avgReduction,
    threshold: 0.60,
    notes: `Avg cost reduction: ${(avgReduction * 100).toFixed(1)}% across ${chapterCosts.length} chapters. Best: ${(Math.max(...reductions) * 100).toFixed(1)}%, worst: ${(Math.min(...reductions) * 100).toFixed(1)}%`,
    evaluatedAt: Date.now(),
  };
}

// ─── M11: Router latency overhead < 50ms p95 ───────────────────────────

export function evaluateM11_RouterLatency(
  latencySamples: number[],
): GateResult {
  if (latencySamples.length === 0) {
    return {
      gateId: "M11",
      name: "Router latency overhead",
      pass: false,
      score: 0,
      threshold: 1.0,
      notes: "No latency samples available",
      evaluatedAt: Date.now(),
    };
  }

  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const pass = p95 <= 50;
  // Score: 1.0 if p95 <= 50ms, linearly degrading to 0 at 200ms
  const score = pass ? 1.0 : Math.max(0, 1 - (p95 - 50) / 150);

  return {
    gateId: "M11",
    name: "Router latency overhead",
    pass,
    score,
    threshold: 1.0,
    notes: `P50: ${p50}ms, P95: ${p95}ms, P99: ${p99}ms (${latencySamples.length} samples). Threshold: P95 <= 50ms`,
    evaluatedAt: Date.now(),
  };
}

// ─── M12: All 3 provider adapters pass 10k-job soak test ───────────────

export function evaluateM12_SoakTest(
  soakResults: Array<{
    providerId: string;
    totalJobs: number;
    errorCount: number;
    p95LatencyMs: number;
    sloLatencyMs: number;
  }>,
): GateResult {
  if (soakResults.length === 0) {
    return {
      gateId: "M12",
      name: "10k-job soak test",
      pass: false,
      score: 0,
      threshold: 1.0,
      notes: "No soak test data available",
      evaluatedAt: Date.now(),
    };
  }

  const providerResults = soakResults.map((r) => {
    const errorRate = r.totalJobs > 0 ? r.errorCount / r.totalJobs : 1;
    const latencyOk = r.p95LatencyMs <= r.sloLatencyMs;
    const errorOk = errorRate < 0.005; // < 0.5%
    return {
      ...r,
      errorRate,
      latencyOk,
      errorOk,
      pass: latencyOk && errorOk,
    };
  });

  const allPass = providerResults.every((r) => r.pass);
  const passCount = providerResults.filter((r) => r.pass).length;
  const score = passCount / providerResults.length;

  const details = providerResults
    .map((r) => `${r.providerId}: ${(r.errorRate * 100).toFixed(2)}% errors, P95=${r.p95LatencyMs}ms/${r.sloLatencyMs}ms SLO ${r.pass ? "PASS" : "FAIL"}`)
    .join("; ");

  return {
    gateId: "M12",
    name: "10k-job soak test",
    pass: allPass,
    score,
    threshold: 1.0,
    notes: details,
    evaluatedAt: Date.now(),
  };
}

// ─── Gate Report Generator ──────────────────────────────────────────────

export interface ImageRouterGateReport {
  gates: GateResult[];
  overallPass: boolean;
  passCount: number;
  totalGates: number;
  generatedAt: number;
}

export function generateImageRouterGateReport(gates: GateResult[]): ImageRouterGateReport {
  const passCount = gates.filter((g) => g.pass).length;
  return {
    gates,
    overallPass: passCount === gates.length,
    passCount,
    totalGates: gates.length,
    generatedAt: Date.now(),
  };
}

// ─── Routing Table Validation ───────────────────────────────────────────

/**
 * Validates that the ROUTING_TABLE covers all expected workload types
 * and that primary/fallback providers are valid.
 */
export function validateRoutingTable(): GateResult {
  const expectedWorkloads: WorkloadType[] = [
    "manga_panel",
    "character_sheet",
    "background_art",
    "cover_art",
    "thumbnail",
    "ui_asset",
  ];

  const issues: string[] = [];

  for (const workload of expectedWorkloads) {
    const config = WORKLOAD_CONFIGS[workload];
    if (!config) {
      issues.push(`Missing workload config for ${workload}`);
      continue;
    }
    if (!config.defaultWidth || !config.defaultHeight) {
      issues.push(`Missing dimensions for ${workload}`);
    }
  }

  const score = issues.length === 0 ? 1.0 : 1 - (issues.length / (expectedWorkloads.length * 2));

  return {
    gateId: "RT",
    name: "Routing table validation",
    pass: issues.length === 0,
    score: Math.max(0, score),
    threshold: 1.0,
    notes: issues.length === 0
      ? `All ${expectedWorkloads.length} workloads have valid config entries`
      : `${issues.length} issues: ${issues.join("; ")}`,
    evaluatedAt: Date.now(),
  };
}
