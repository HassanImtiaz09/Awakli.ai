import { describe, it, expect } from "vitest";
import {
  generateComparisonPrompts,
  compareLoraVersions,
  computeOverallScore,
  determinePromptWinner,
  generateRecommendation,
  type ComparisonSummary,
} from "./lora-training-pipeline";

// ─── generateComparisonPrompts ──────────────────────────────────────────

describe("generateComparisonPrompts", () => {
  it("generates 5 standard prompts with trigger word", () => {
    const prompts = generateComparisonPrompts("sks_hiro");
    expect(prompts).toHaveLength(5);
    expect(prompts.every(p => p.prompt.includes("sks_hiro"))).toBe(true);
  });

  it("includes all 5 categories: portrait, action, emotion, group, lighting", () => {
    const prompts = generateComparisonPrompts("sks_test");
    const categories = prompts.map(p => p.category);
    expect(categories).toContain("portrait");
    expect(categories).toContain("action");
    expect(categories).toContain("emotion");
    expect(categories).toContain("group");
    expect(categories).toContain("lighting");
  });

  it("adds a 6th custom prompt when customPrompt is provided", () => {
    const prompts = generateComparisonPrompts("sks_hiro", "sitting on a bench");
    expect(prompts).toHaveLength(6);
    expect(prompts[5].category).toBe("custom");
    expect(prompts[5].prompt).toContain("sks_hiro");
    expect(prompts[5].prompt).toContain("sitting on a bench");
  });

  it("does not duplicate trigger word if custom prompt already contains it", () => {
    const prompts = generateComparisonPrompts("sks_hiro", "sks_hiro sitting on a bench");
    expect(prompts[5].prompt).toBe("sks_hiro sitting on a bench");
    // Should not have "sks_hiro, sks_hiro sitting..."
    expect(prompts[5].prompt.indexOf("sks_hiro")).toBe(0);
    expect(prompts[5].prompt.lastIndexOf("sks_hiro")).toBe(0);
  });

  it("each prompt has a unique id", () => {
    const prompts = generateComparisonPrompts("sks_test", "custom test");
    const ids = prompts.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each prompt has a non-empty label", () => {
    const prompts = generateComparisonPrompts("sks_test");
    expect(prompts.every(p => p.label.length > 0)).toBe(true);
  });
});

// ─── computeOverallScore ────────────────────────────────────────────────

describe("computeOverallScore", () => {
  it("returns weighted composite: CLIP 50%, Style 30%, Detail 20%", () => {
    const score = computeOverallScore(0.9, 0.8, 0.7);
    // 0.9*0.5 + 0.8*0.3 + 0.7*0.2 = 0.45 + 0.24 + 0.14 = 0.83 → 83
    expect(score).toBe(83);
  });

  it("returns 100 for perfect scores", () => {
    const score = computeOverallScore(1.0, 1.0, 1.0);
    expect(score).toBe(100);
  });

  it("returns 0 for zero scores", () => {
    const score = computeOverallScore(0, 0, 0);
    expect(score).toBe(0);
  });

  it("rounds to nearest integer", () => {
    const score = computeOverallScore(0.855, 0.855, 0.855);
    // 0.855 * 1.0 = 0.855 → 86 (rounded)
    expect(score).toBe(86);
  });
});

// ─── determinePromptWinner ──────────────────────────────────────────────

describe("determinePromptWinner", () => {
  it("returns 'A' when A leads by 2+ points", () => {
    expect(determinePromptWinner(85, 82)).toBe("A");
    expect(determinePromptWinner(90, 80)).toBe("A");
  });

  it("returns 'B' when B leads by 2+ points", () => {
    expect(determinePromptWinner(80, 83)).toBe("B");
    expect(determinePromptWinner(70, 90)).toBe("B");
  });

  it("returns 'tie' when difference is less than 2 points", () => {
    expect(determinePromptWinner(85, 84)).toBe("tie");
    expect(determinePromptWinner(85, 85)).toBe("tie");
    expect(determinePromptWinner(84, 85)).toBe("tie");
  });

  it("returns 'A' at exactly 2 point difference", () => {
    expect(determinePromptWinner(84, 82)).toBe("A");
  });

  it("returns 'B' at exactly -2 point difference", () => {
    expect(determinePromptWinner(82, 84)).toBe("B");
  });
});

// ─── generateRecommendation ─────────────────────────────────────────────

describe("generateRecommendation", () => {
  it("returns A as winner when A has more wins", () => {
    const result = generateRecommendation(3, 1, 1, 85, 78, "v1", "v2");
    expect(result.winner).toBe("A");
    expect(result.recommendation).toContain("v1");
    expect(result.recommendation).toContain("outperforms");
  });

  it("returns B as winner when B has more wins", () => {
    const result = generateRecommendation(1, 4, 0, 75, 88, "v1", "v2");
    expect(result.winner).toBe("B");
    expect(result.recommendation).toContain("v2");
    expect(result.recommendation).toContain("outperforms");
  });

  it("uses average score as tiebreaker when wins are equal", () => {
    const result = generateRecommendation(2, 2, 1, 86, 82, "v1", "v2");
    expect(result.winner).toBe("A");
    expect(result.recommendation).toContain("slightly higher");
  });

  it("returns tie when wins and scores are nearly equal", () => {
    const result = generateRecommendation(2, 2, 1, 85.2, 85.5, "v1", "v2");
    expect(result.winner).toBe("tie");
    expect(result.recommendation).toContain("nearly identically");
  });

  it("returns tie with 0 confidence when no tests", () => {
    const result = generateRecommendation(0, 0, 0, 0, 0, "v1", "v2");
    expect(result.winner).toBe("tie");
    expect(result.confidence).toBe(0);
  });

  it("confidence is between 0 and 1", () => {
    const result = generateRecommendation(5, 0, 0, 95, 60, "v1", "v2");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("higher win ratio and score diff produce higher confidence", () => {
    const low = generateRecommendation(3, 2, 0, 82, 80, "v1", "v2");
    const high = generateRecommendation(5, 0, 0, 95, 60, "v1", "v2");
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});

// ─── compareLoraVersions (integration) ──────────────────────────────────

describe("compareLoraVersions", () => {
  const versionA = { id: 1, version: 1, qualityScore: 85, artifactPath: "/loras/char1/v1.safetensors" };
  const versionB = { id: 2, version: 2, qualityScore: 78, artifactPath: "/loras/char1/v2.safetensors" };

  it("returns a valid ComparisonSummary structure", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(result.versionAId).toBe(1);
    expect(result.versionBId).toBe(2);
    expect(result.versionALabel).toBe("v1");
    expect(result.versionBLabel).toBe("v2");
    expect(result.prompts).toHaveLength(5);
    expect(result.results).toHaveLength(5);
    expect(result.aggregated).toBeDefined();
  });

  it("generates 6 results when custom prompt is provided", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro", "custom test prompt");
    expect(result.prompts).toHaveLength(6);
    expect(result.results).toHaveLength(6);
  });

  it("each result has valid image URLs for both versions", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    for (const r of result.results) {
      expect(r.versionAImageUrl).toMatch(/^https:\/\/cdn\.awakli\.com\/lora-comparison\//);
      expect(r.versionBImageUrl).toMatch(/^https:\/\/cdn\.awakli\.com\/lora-comparison\//);
      expect(r.versionAImageUrl).not.toBe(r.versionBImageUrl);
    }
  });

  it("each result has metrics with all required fields", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    for (const r of result.results) {
      expect(r.metrics.clipSimilarityA).toBeGreaterThanOrEqual(0);
      expect(r.metrics.clipSimilarityA).toBeLessThanOrEqual(1);
      expect(r.metrics.clipSimilarityB).toBeGreaterThanOrEqual(0);
      expect(r.metrics.clipSimilarityB).toBeLessThanOrEqual(1);
      expect(r.metrics.styleConsistencyA).toBeGreaterThanOrEqual(0);
      expect(r.metrics.styleConsistencyB).toBeGreaterThanOrEqual(0);
      expect(r.metrics.detailPreservationA).toBeGreaterThanOrEqual(0);
      expect(r.metrics.detailPreservationB).toBeGreaterThanOrEqual(0);
      expect(r.metrics.overallScoreA).toBeGreaterThanOrEqual(0);
      expect(r.metrics.overallScoreA).toBeLessThanOrEqual(100);
      expect(r.metrics.overallScoreB).toBeGreaterThanOrEqual(0);
      expect(r.metrics.overallScoreB).toBeLessThanOrEqual(100);
      expect(["A", "B", "tie"]).toContain(r.winner);
    }
  });

  it("aggregated metrics are averages of per-prompt metrics", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    const n = result.results.length;
    const expectedAvgScoreA = result.results.reduce((s, r) => s + r.metrics.overallScoreA, 0) / n;
    expect(result.aggregated.avgScoreA).toBeCloseTo(expectedAvgScoreA, 0);
  });

  it("wins + ties equals total number of prompts", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(result.aggregated.winsA + result.aggregated.winsB + result.aggregated.ties).toBe(result.prompts.length);
  });

  it("overallWinner is one of A, B, or tie", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(["A", "B", "tie"]).toContain(result.aggregated.overallWinner);
  });

  it("confidence is between 0 and 1", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(result.aggregated.confidence).toBeGreaterThanOrEqual(0);
    expect(result.aggregated.confidence).toBeLessThanOrEqual(1);
  });

  it("recommendation is a non-empty string", () => {
    const result = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(result.aggregated.recommendation.length).toBeGreaterThan(0);
  });

  it("is deterministic — same inputs produce same outputs", () => {
    const r1 = compareLoraVersions(versionA, versionB, "sks_hiro");
    const r2 = compareLoraVersions(versionA, versionB, "sks_hiro");
    expect(r1.aggregated.avgScoreA).toBe(r2.aggregated.avgScoreA);
    expect(r1.aggregated.avgScoreB).toBe(r2.aggregated.avgScoreB);
    expect(r1.aggregated.overallWinner).toBe(r2.aggregated.overallWinner);
  });

  it("different quality scores produce different results", () => {
    const highQuality = { id: 10, version: 3, qualityScore: 95, artifactPath: "/loras/high.safetensors" };
    const lowQuality = { id: 11, version: 4, qualityScore: 50, artifactPath: "/loras/low.safetensors" };
    const result = compareLoraVersions(highQuality, lowQuality, "sks_test");
    // Higher quality version should generally score higher
    expect(result.aggregated.avgScoreA).toBeGreaterThan(result.aggregated.avgScoreB);
  });

  it("handles equal quality scores gracefully", () => {
    const v1 = { id: 20, version: 1, qualityScore: 80, artifactPath: "/loras/a.safetensors" };
    const v2 = { id: 21, version: 2, qualityScore: 80, artifactPath: "/loras/b.safetensors" };
    const result = compareLoraVersions(v1, v2, "sks_equal");
    // Should still produce valid results even with equal base quality
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.results.length).toBe(result.prompts.length);
  });

  it("handles very low quality scores (edge case)", () => {
    const v1 = { id: 30, version: 1, qualityScore: 5, artifactPath: "/loras/bad1.safetensors" };
    const v2 = { id: 31, version: 2, qualityScore: 10, artifactPath: "/loras/bad2.safetensors" };
    const result = compareLoraVersions(v1, v2, "sks_low");
    // Metrics should still be valid (clamped to 0-1 range)
    for (const r of result.results) {
      expect(r.metrics.clipSimilarityA).toBeGreaterThanOrEqual(0);
      expect(r.metrics.clipSimilarityB).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles very high quality scores (edge case)", () => {
    const v1 = { id: 40, version: 1, qualityScore: 99, artifactPath: "/loras/best1.safetensors" };
    const v2 = { id: 41, version: 2, qualityScore: 100, artifactPath: "/loras/best2.safetensors" };
    const result = compareLoraVersions(v1, v2, "sks_high");
    // Metrics should still be valid (clamped to 0-1 range)
    for (const r of result.results) {
      expect(r.metrics.clipSimilarityA).toBeLessThanOrEqual(1);
      expect(r.metrics.clipSimilarityB).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Router contract shape ──────────────────────────────────────────────

describe("compareVersions endpoint contract", () => {
  it("compareLoraVersions returns all fields expected by the frontend modal", () => {
    const vA = { id: 100, version: 3, qualityScore: 88, artifactPath: "/loras/v3.safetensors" };
    const vB = { id: 101, version: 4, qualityScore: 82, artifactPath: "/loras/v4.safetensors" };
    const result = compareLoraVersions(vA, vB, "sks_char");

    // Top-level fields
    expect(result).toHaveProperty("versionAId");
    expect(result).toHaveProperty("versionBId");
    expect(result).toHaveProperty("versionALabel");
    expect(result).toHaveProperty("versionBLabel");
    expect(result).toHaveProperty("prompts");
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("aggregated");

    // Aggregated fields
    const agg = result.aggregated;
    expect(agg).toHaveProperty("avgScoreA");
    expect(agg).toHaveProperty("avgScoreB");
    expect(agg).toHaveProperty("avgClipA");
    expect(agg).toHaveProperty("avgClipB");
    expect(agg).toHaveProperty("avgStyleA");
    expect(agg).toHaveProperty("avgStyleB");
    expect(agg).toHaveProperty("avgDetailA");
    expect(agg).toHaveProperty("avgDetailB");
    expect(agg).toHaveProperty("winsA");
    expect(agg).toHaveProperty("winsB");
    expect(agg).toHaveProperty("ties");
    expect(agg).toHaveProperty("overallWinner");
    expect(agg).toHaveProperty("confidence");
    expect(agg).toHaveProperty("recommendation");

    // Prompt fields
    for (const p of result.prompts) {
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("label");
      expect(p).toHaveProperty("prompt");
      expect(p).toHaveProperty("category");
    }

    // Result fields
    for (const r of result.results) {
      expect(r).toHaveProperty("promptId");
      expect(r).toHaveProperty("versionAImageUrl");
      expect(r).toHaveProperty("versionBImageUrl");
      expect(r).toHaveProperty("metrics");
      expect(r).toHaveProperty("winner");
    }
  });
});
