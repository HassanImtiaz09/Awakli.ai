/**
 * Prompt 22 — Structural Fidelity Measurement
 *
 * Measures how faithfully the generated anime frame preserves the structural
 * layout of the original manga lineart.
 *
 * Metrics:
 *   • SSIM (Structural Similarity Index) — lineart vs generated frame edges
 *   • Edge Overlap % — matching edge pixels / total lineart pixels
 *   • SSIM Improvement — conditioned vs unconditioned generation
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type FidelityGrade = "pass" | "review" | "fail";

export interface SSIMResult {
  score: number;
  grade: FidelityGrade;
}

export interface EdgeOverlapResult {
  overlapPercent: number;
  matchingPixels: number;
  totalLineartPixels: number;
  grade: FidelityGrade;
}

export interface SSIMImprovementResult {
  conditionedSSIM: number;
  unconditionedSSIM: number;
  improvement: number;
  grade: FidelityGrade;
}

export interface FidelityReport {
  ssim: SSIMResult;
  edgeOverlap: EdgeOverlapResult;
  ssimImprovement: SSIMImprovementResult;
  overallGrade: FidelityGrade;
  overallScore: number;       // 0-100 composite score
  recommendation: string;
  controlnetMode: string;
  conditioningStrength: number;
  panelIndex: number;
  timestamp: number;
}

export interface BatchFidelityReport {
  totalPanels: number;
  passCount: number;
  reviewCount: number;
  failCount: number;
  avgSSIM: number;
  avgEdgeOverlap: number;
  avgImprovement: number;
  avgOverallScore: number;
  panels: FidelityReport[];
}

// ─── Constants ──────────────────────────────────────────────────────────

export const SSIM_THRESHOLDS = {
  pass: 0.65,
  review: 0.50,
} as const;

export const EDGE_OVERLAP_THRESHOLDS = {
  pass: 40,   // percent
  review: 25, // percent
} as const;

export const SSIM_IMPROVEMENT_THRESHOLDS = {
  pass: 0.10,
  review: 0.05,
} as const;

// ─── Grading ────────────────────────────────────────────────────────────

export function gradeSSIM(score: number): FidelityGrade {
  if (score >= SSIM_THRESHOLDS.pass) return "pass";
  if (score >= SSIM_THRESHOLDS.review) return "review";
  return "fail";
}

export function gradeEdgeOverlap(overlapPercent: number): FidelityGrade {
  if (overlapPercent >= EDGE_OVERLAP_THRESHOLDS.pass) return "pass";
  if (overlapPercent >= EDGE_OVERLAP_THRESHOLDS.review) return "review";
  return "fail";
}

export function gradeSSIMImprovement(improvement: number): FidelityGrade {
  if (improvement >= SSIM_IMPROVEMENT_THRESHOLDS.pass) return "pass";
  if (improvement >= SSIM_IMPROVEMENT_THRESHOLDS.review) return "review";
  return "fail";
}

export function computeOverallGrade(
  ssimGrade: FidelityGrade,
  edgeGrade: FidelityGrade,
  improvementGrade: FidelityGrade,
): FidelityGrade {
  const grades = [ssimGrade, edgeGrade, improvementGrade];
  if (grades.includes("fail")) return "fail";
  if (grades.includes("review")) return "review";
  return "pass";
}

/**
 * Compute a 0-100 composite score from the three metrics.
 * Weights: SSIM 40%, Edge Overlap 35%, SSIM Improvement 25%
 */
export function computeOverallScore(
  ssimScore: number,
  edgeOverlapPercent: number,
  ssimImprovement: number,
): number {
  const ssimNorm = Math.min(1, ssimScore) * 100;                    // 0-100
  const edgeNorm = Math.min(100, edgeOverlapPercent);                // 0-100
  const improvNorm = Math.min(1, ssimImprovement / 0.2) * 100;      // 0-100 (0.2 = max expected)

  const composite = ssimNorm * 0.40 + edgeNorm * 0.35 + improvNorm * 0.25;
  return Math.round(Math.max(0, Math.min(100, composite)));
}

export function getRecommendation(overallGrade: FidelityGrade, overallScore: number): string {
  if (overallGrade === "pass") {
    return "Structural fidelity is excellent. The generated frame closely follows the manga lineart.";
  }
  if (overallGrade === "review") {
    if (overallScore >= 55) {
      return "Moderate structural fidelity. Consider increasing conditioning strength by 0.05-0.10 for tighter adherence.";
    }
    return "Structural fidelity needs attention. Try switching to a different ControlNet mode or increasing conditioning strength.";
  }
  if (overallScore >= 30) {
    return "Low structural fidelity. Recommend re-extracting lineart with a different method and increasing conditioning strength to 0.7+.";
  }
  return "Very low structural fidelity. The lineart extraction may have quality issues. Re-extract and verify the lineart before re-generating.";
}

// ─── Simulation ─────────────────────────────────────────────────────────

/**
 * Simulate SSIM computation between lineart and generated frame edges.
 * In production, this would use actual pixel-level comparison.
 */
export function simulateSSIM(
  conditioningStrength: number,
  controlnetMode: string,
): SSIMResult {
  // Higher conditioning strength → higher SSIM
  // lineart_anime mode gets a small bonus
  const modeBonus = controlnetMode === "lineart_anime" ? 0.05 :
                    controlnetMode === "lineart" ? 0.03 : 0;
  const baseSSIM = 0.35 + conditioningStrength * 0.45 + modeBonus;
  const noise = (Math.random() - 0.5) * 0.08;
  const score = Math.round(Math.max(0.1, Math.min(0.98, baseSSIM + noise)) * 1000) / 1000;

  return {
    score,
    grade: gradeSSIM(score),
  };
}

/**
 * Simulate edge overlap computation.
 */
export function simulateEdgeOverlap(
  conditioningStrength: number,
  edgeDensity: number,
): EdgeOverlapResult {
  // Higher strength → more overlap; higher edge density → slightly less overlap (more to match)
  const baseOverlap = 15 + conditioningStrength * 50 - edgeDensity * 20;
  const noise = (Math.random() - 0.5) * 10;
  const overlapPercent = Math.round(Math.max(5, Math.min(95, baseOverlap + noise)) * 10) / 10;

  const totalLineartPixels = Math.round(500000 * edgeDensity);
  const matchingPixels = Math.round(totalLineartPixels * overlapPercent / 100);

  return {
    overlapPercent,
    matchingPixels,
    totalLineartPixels,
    grade: gradeEdgeOverlap(overlapPercent),
  };
}

/**
 * Simulate SSIM improvement (conditioned vs unconditioned).
 */
export function simulateSSIMImprovement(
  conditionedSSIM: number,
): SSIMImprovementResult {
  // Unconditioned SSIM is typically 0.25-0.45 (random structural match)
  const unconditionedSSIM = Math.round((0.25 + Math.random() * 0.20) * 1000) / 1000;
  const improvement = Math.round(Math.max(0, conditionedSSIM - unconditionedSSIM) * 1000) / 1000;

  return {
    conditionedSSIM,
    unconditionedSSIM,
    improvement,
    grade: gradeSSIMImprovement(improvement),
  };
}

// ─── Full Measurement ───────────────────────────────────────────────────

export function measureFidelity(
  panelIndex: number,
  conditioningStrength: number,
  controlnetMode: string,
  edgeDensity: number = 0.12,
): FidelityReport {
  const ssim = simulateSSIM(conditioningStrength, controlnetMode);
  const edgeOverlap = simulateEdgeOverlap(conditioningStrength, edgeDensity);
  const ssimImprovement = simulateSSIMImprovement(ssim.score);

  const overallGrade = computeOverallGrade(ssim.grade, edgeOverlap.grade, ssimImprovement.grade);
  const overallScore = computeOverallScore(ssim.score, edgeOverlap.overlapPercent, ssimImprovement.improvement);
  const recommendation = getRecommendation(overallGrade, overallScore);

  return {
    ssim,
    edgeOverlap,
    ssimImprovement,
    overallGrade,
    overallScore,
    recommendation,
    controlnetMode,
    conditioningStrength,
    panelIndex,
    timestamp: Date.now(),
  };
}

/**
 * Measure fidelity for a batch of panels.
 */
export function measureBatchFidelity(
  panels: Array<{ panelIndex: number; conditioningStrength: number; controlnetMode: string; edgeDensity?: number }>,
): BatchFidelityReport {
  const reports = panels.map(p =>
    measureFidelity(p.panelIndex, p.conditioningStrength, p.controlnetMode, p.edgeDensity)
  );

  const passCount = reports.filter(r => r.overallGrade === "pass").length;
  const reviewCount = reports.filter(r => r.overallGrade === "review").length;
  const failCount = reports.filter(r => r.overallGrade === "fail").length;

  const avg = (arr: number[]) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

  return {
    totalPanels: reports.length,
    passCount,
    reviewCount,
    failCount,
    avgSSIM: Math.round(avg(reports.map(r => r.ssim.score)) * 1000) / 1000,
    avgEdgeOverlap: Math.round(avg(reports.map(r => r.edgeOverlap.overlapPercent)) * 10) / 10,
    avgImprovement: Math.round(avg(reports.map(r => r.ssimImprovement.improvement)) * 1000) / 1000,
    avgOverallScore: Math.round(avg(reports.map(r => r.overallScore))),
    panels: reports,
  };
}
