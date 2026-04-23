/**
 * Cost Assessment Framework (A1)
 *
 * Reads raw benchmark CSV data and produces:
 * 1. Per-provider cost comparison (single-layer)
 * 2. Per-pipeline cost breakdown (end-to-end)
 * 3. Cost extrapolation to 1/3/5/7/15-minute durations
 * 4. Margin analysis at $19/$35/$49 retail tiers
 * 5. Decision recommendation based on quality floor + margin target
 *
 * This module is invoked after all benchmarks complete (A1 ticket).
 */

import fs from "fs";
import path from "path";
import {
  extrapolateCost,
  calculateMargin,
  writeCostMatrix,
  writeMarginAnalysis,
} from "../runner-base.js";

const REPORT_DIR = path.join(process.cwd(), "server/benchmarks/report");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderComparison {
  provider: string;
  model: string;
  mode: string;
  avgCostPerSecond: number;
  avgWallClockMs: number;
  avgQueueTimeMs: number;
  successRate: number;
  clipCount: number;
}

export interface PipelineSummary {
  variant: string;
  totalCost3Min: number;
  costPerMinute: number;
  costPer5Min: number;
  costPer7Min: number;
  costPer15Min: number;
  components: {
    component: string;
    provider: string;
    costUsd: number;
    percentOfTotal: number;
  }[];
  margins: {
    retailPrice: number;
    marginUsd: number;
    marginPercent: number;
    meetsTarget: boolean;
  }[];
  recommendation: string;
}

export interface BenchmarkReport {
  generatedAt: string;
  singleLayerComparison: ProviderComparison[];
  pipelineSummaries: PipelineSummary[];
  costMatrix: Record<string, Record<string, number>>;
  overallRecommendation: string;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCsv(filePath: string): Record<string, string>[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? "";
    });
    return row;
  });
}

// ─── Single-Layer Analysis ───────────────────────────────────────────────────

export function analyzeSingleLayer(): ProviderComparison[] {
  const clipResults = parseCsv(path.join(REPORT_DIR, "clip-results.csv"));
  if (clipResults.length === 0) return [];

  // Group by provider + model + mode
  const groups: Record<string, typeof clipResults> = {};
  for (const row of clipResults) {
    const key = `${row.provider}|${row.model}|${row.mode}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return Object.entries(groups).map(([key, rows]) => {
    const [provider, model, mode] = key.split("|");
    const successRows = rows.filter((r) => r.status === "success");
    const totalCost = successRows.reduce((sum, r) => sum + parseFloat(r.cost_usd || "0"), 0);
    const totalDuration = successRows.reduce((sum, r) => sum + parseFloat(r.duration_sec || "0"), 0);
    const totalWallClock = successRows.reduce((sum, r) => sum + parseFloat(r.wall_clock_ms || "0"), 0);
    const totalQueueTime = successRows.reduce((sum, r) => sum + parseFloat(r.queue_time_ms || "0"), 0);

    return {
      provider,
      model,
      mode,
      avgCostPerSecond: totalDuration > 0 ? totalCost / totalDuration : 0,
      avgWallClockMs: successRows.length > 0 ? totalWallClock / successRows.length : 0,
      avgQueueTimeMs: successRows.length > 0 ? totalQueueTime / successRows.length : 0,
      successRate: rows.length > 0 ? successRows.length / rows.length : 0,
      clipCount: rows.length,
    };
  });
}

// ─── Pipeline Analysis ───────────────────────────────────────────────────────

export function analyzePipelines(): PipelineSummary[] {
  const pipelineResults = parseCsv(path.join(REPORT_DIR, "pipeline-results.csv"));
  const componentResults = parseCsv(path.join(REPORT_DIR, "component-breakdown.csv"));
  if (pipelineResults.length === 0) return [];

  const RETAIL_TIERS = [19, 35, 49];
  const MARGIN_TARGET_MIN = 40; // 40% minimum gross margin

  return pipelineResults.map((row) => {
    const totalCost3Min = parseFloat(row.total_cost_usd || "0");
    const durationSec = parseFloat(row.total_duration_sec || "180");
    const durationMin = durationSec / 60;
    const costPerMinute = totalCost3Min / durationMin;

    // Get component breakdown for this pipeline
    const pipelineComponents = componentResults
      .filter((c) => c.pipeline_id === row.pipeline_id)
      .map((c) => ({
        component: c.component,
        provider: c.provider,
        costUsd: parseFloat(c.cost_usd || "0"),
        percentOfTotal: parseFloat(c.percent_of_total || "0"),
      }));

    // Calculate margins at each tier (using 5-min extrapolated cost)
    const costPer5Min = extrapolateCost(totalCost3Min, durationMin, 5);
    const margins = RETAIL_TIERS.map((price) => {
      const { marginUsd, marginPercent } = calculateMargin(costPer5Min, price);
      return {
        retailPrice: price,
        marginUsd,
        marginPercent,
        meetsTarget: marginPercent >= MARGIN_TARGET_MIN,
      };
    });

    // Generate recommendation
    const meetsTierCount = margins.filter((m) => m.meetsTarget).length;
    let recommendation: string;
    if (meetsTierCount === 0) {
      recommendation = "REJECT — Does not meet 40% margin target at any retail tier.";
    } else if (meetsTierCount === 1) {
      recommendation = `CONDITIONAL — Only meets margin target at $${margins.find((m) => m.meetsTarget)?.retailPrice} tier.`;
    } else if (meetsTierCount === 2) {
      recommendation = "VIABLE — Meets margin target at 2 of 3 retail tiers.";
    } else {
      recommendation = "STRONG — Meets margin target at all retail tiers.";
    }

    return {
      variant: row.variant,
      totalCost3Min,
      costPerMinute,
      costPer5Min,
      costPer7Min: extrapolateCost(totalCost3Min, durationMin, 7),
      costPer15Min: extrapolateCost(totalCost3Min, durationMin, 15),
      components: pipelineComponents,
      margins,
      recommendation,
    };
  });
}

// ─── Full Report Generation ──────────────────────────────────────────────────

export function generateFullReport(): BenchmarkReport {
  const singleLayerComparison = analyzeSingleLayer();
  const pipelineSummaries = analyzePipelines();

  // Build cost matrix
  const costMatrix: Record<string, Record<string, number>> = {};
  for (const p of pipelineSummaries) {
    costMatrix[p.variant] = {
      "1min": extrapolateCost(p.totalCost3Min, 3, 1),
      "3min": p.totalCost3Min,
      "5min": p.costPer5Min,
      "7min": p.costPer7Min,
      "15min": p.costPer15Min,
    };
  }

  // Overall recommendation
  const viablePipelines = pipelineSummaries.filter(
    (p) => p.margins.some((m) => m.meetsTarget && m.retailPrice <= 35)
  );

  let overallRecommendation: string;
  if (viablePipelines.length === 0) {
    overallRecommendation =
      "No pipeline meets the 40% margin target at the $35 retail tier. Consider raising the retail price to $49, or further optimising the decomposed pipeline costs.";
  } else {
    const cheapest = viablePipelines.reduce((a, b) =>
      a.costPer5Min < b.costPer5Min ? a : b
    );
    overallRecommendation = `Recommended pipeline: ${cheapest.variant} at $${cheapest.costPer5Min.toFixed(2)}/5min. ${cheapest.recommendation} Quality panel (A2) must confirm it meets the 0.5-point quality floor before adoption.`;
  }

  // Write derived CSVs
  writeCostMatrix();
  writeMarginAnalysis([19, 35, 49]);

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    singleLayerComparison,
    pipelineSummaries,
    costMatrix,
    overallRecommendation,
  };

  // Write full report as JSON
  const reportPath = path.join(REPORT_DIR, "benchmark-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Full benchmark report written to ${reportPath}`);

  return report;
}

// ─── Summary Table (for console / quick review) ──────────────────────────────

export function printSummaryTable(): void {
  const summaries = analyzePipelines();
  if (summaries.length === 0) {
    console.log("No pipeline results available yet.");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║           AWAKLI COST BENCHMARK — PIPELINE SUMMARY          ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║ Pipeline        │ 3min     │ 5min     │ $/min   │ Verdict  ║");
  console.log("╠═════════════════╪══════════╪══════════╪═════════╪══════════╣");

  for (const s of summaries) {
    const variant = s.variant.padEnd(15);
    const cost3 = `$${s.totalCost3Min.toFixed(2)}`.padEnd(8);
    const cost5 = `$${s.costPer5Min.toFixed(2)}`.padEnd(8);
    const cpm = `$${s.costPerMinute.toFixed(2)}`.padEnd(7);
    const verdict = s.margins.some((m) => m.meetsTarget && m.retailPrice <= 35)
      ? "✓ PASS"
      : "✗ FAIL";
    console.log(`║ ${variant} │ ${cost3} │ ${cost5} │ ${cpm} │ ${verdict.padEnd(8)} ║`);
  }

  console.log("╠═════════════════╧══════════╧══════════╧═════════╧══════════╣");

  // Margin table
  console.log("║                                                              ║");
  console.log("║ MARGIN ANALYSIS (5-min video, 40% target)                    ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║ Pipeline        │ @$19     │ @$35     │ @$49     │          ║");
  console.log("╠═════════════════╪══════════╪══════════╪══════════╪══════════╣");

  for (const s of summaries) {
    const variant = s.variant.padEnd(15);
    const m19 = s.margins.find((m) => m.retailPrice === 19);
    const m35 = s.margins.find((m) => m.retailPrice === 35);
    const m49 = s.margins.find((m) => m.retailPrice === 49);

    const fmt = (m: typeof m19) =>
      m ? `${m.marginPercent.toFixed(0)}%${m.meetsTarget ? " ✓" : ""}`.padEnd(8) : "N/A     ";

    console.log(`║ ${variant} │ ${fmt(m19)} │ ${fmt(m35)} │ ${fmt(m49)} │          ║`);
  }

  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}
