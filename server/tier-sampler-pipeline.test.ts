import { describe, it, expect } from "vitest";
import {
  VISUAL_ARCHETYPES,
  AUDIO_ARCHETYPES,
  ALL_ARCHETYPES,
  getSamplesForArchetype,
  generateSampleBatchSpec,
  getArchetypeById,
  getArchetypesForSceneType,
  GENRE_VARIANTS,
  TIER_LABELS,
  QUALITY_TIERS,
  labelCandidate,
  simulateSampleGeneration,
  getSamplesForVoice,
  FAILURE_MODES,
  FAILURE_MODE_LABELS,
} from "./tier-sampler-catalog";
import {
  computeESG,
  classifyESGRouting,
  getBaselineSatisfaction,
  computeESGTrend,
  buildAnchorHistogram,
  buildSpendHistogram,
  computeGapAnalysis,
  generateExpectationReportCard,
  ESG_THRESHOLDS,
  type ESGRecord,
  type AnchorRecord,
} from "./esg-computation";
import {
  assignCohort,
  verifyCohortDistribution,
  computePrimaryMetrics,
  computeGuardrailMetrics,
  computeABTestResult,
  SAMPLER_RATIO,
  type CohortData,
  type CohortAssignment,
} from "./sampler-ab-testing";
import {
  computeStalenessScore,
  flagStaleSamples,
  computeRefreshBudget,
  checkProviderVersionGap,
  generateRefreshEvents,
  STALENESS_THRESHOLDS,
  type StalenessInput,
} from "./staleness-scoring";
import {
  submitForReview,
  recordVote,
  checkUnanimousApproval,
  vetoSample,
  computeGovernanceStats,
  getDefaultCommittee,
  COMMITTEE_ROLES,
  type ReviewSubmission,
  type ReviewRecord,
  type Vote,
} from "./governance-workflow";

// ═══════════════════════════════════════════════════════════════════════
// 1. Tier Sampler Catalog
// ═══════════════════════════════════════════════════════════════════════

describe("Tier Sampler Catalog", () => {
  describe("VISUAL_ARCHETYPES", () => {
    it("should have 12 visual archetypes", () => {
      expect(VISUAL_ARCHETYPES.length).toBe(12);
    });

    it("each archetype should have id, name, sceneType, description", () => {
      for (const a of VISUAL_ARCHETYPES) {
        expect(a.id).toBeTruthy();
        expect(a.name).toBeTruthy();
        expect(a.sceneType).toBeTruthy();
        expect(a.description).toBeTruthy();
      }
    });
  });

  describe("AUDIO_ARCHETYPES", () => {
    it("should have 8 audio archetypes", () => {
      expect(AUDIO_ARCHETYPES.length).toBe(8);
    });

    it("each archetype should have id, name, sampleLine, purpose", () => {
      for (const a of AUDIO_ARCHETYPES) {
        expect(a.id).toBeTruthy();
        expect(a.name).toBeTruthy();
        expect(a.sampleLine).toBeTruthy();
        expect(a.purpose).toBeTruthy();
      }
    });
  });

  describe("getSamplesForArchetype", () => {
    it("should return a SampleRetrievalResult with successes and failures", () => {
      const result = getSamplesForArchetype("V01", 3, "action");
      expect(result.archetypeId).toBe("V01");
      expect(result.tier).toBe(3);
      expect(result.genreVariant).toBe("action");
      expect(result.successes).toBeDefined();
      expect(result.failures).toBeDefined();
    });

    it("should include provider and quality info in candidates", () => {
      const result = getSamplesForArchetype("V01", 4, "action");
      for (const c of result.successes) {
        expect(c.provider).toBeTruthy();
        expect(typeof c.qualityScore).toBe("number");
        expect(c.qualityScore).toBeGreaterThanOrEqual(1);
        expect(c.qualityScore).toBeLessThanOrEqual(5);
      }
    });

    it("should return empty arrays for unknown archetype", () => {
      const result = getSamplesForArchetype("UNKNOWN", 3, "action");
      expect(result.successes).toEqual([]);
      expect(result.failures).toEqual([]);
    });
  });

  describe("generateSampleBatchSpec", () => {
    it("should return batch specification", () => {
      const spec = generateSampleBatchSpec();
      expect(spec.archetypes.length).toBeGreaterThan(0);
      expect(spec.tiers).toEqual([1, 2, 3, 4, 5]);
      expect(spec.totalTargets).toBeGreaterThan(0);
      expect(spec.overGenerationFactor).toBe(6);
      expect(spec.estimatedTotalCandidates).toBe(spec.totalTargets * 6);
      expect(spec.estimatedCostUsd).toBeGreaterThan(0);
    });

    it("should accept custom archetypes and tiers", () => {
      const spec = generateSampleBatchSpec(["V01", "V02"], [3, 4]);
      expect(spec.archetypes).toEqual(["V01", "V02"]);
      expect(spec.tiers).toEqual([3, 4]);
    });
  });

  describe("getArchetypeById", () => {
    it("should find a visual archetype", () => {
      const a = getArchetypeById("V01");
      expect(a).toBeTruthy();
      expect(a!.name).toContain("Dialogue");
    });

    it("should find an audio archetype", () => {
      const a = getArchetypeById("A01");
      expect(a).toBeTruthy();
      expect(a!.name).toBe("Neutral");
    });

    it("should return undefined for unknown id", () => {
      expect(getArchetypeById("NONEXISTENT")).toBeUndefined();
    });
  });

  describe("getArchetypesForSceneType", () => {
    it("should return archetypes matching dialogue scene type", () => {
      const archetypes = getArchetypesForSceneType("dialogue");
      expect(archetypes.length).toBe(3); // V01, V02, V03
      for (const a of archetypes) {
        expect(a.sceneType).toBe("dialogue");
      }
    });

    it("should return empty for unknown scene type", () => {
      expect(getArchetypesForSceneType("nonexistent")).toEqual([]);
    });
  });

  describe("simulateSampleGeneration", () => {
    it("should generate the requested number of candidates", () => {
      const candidates = simulateSampleGeneration("V01", 3, "kling_2_6", "action", 8);
      expect(candidates.length).toBe(8);
    });

    it("should include all required fields", () => {
      const candidates = simulateSampleGeneration("V01", 4, "kling_2_6", "action", 3);
      for (const c of candidates) {
        expect(c.archetypeId).toBe("V01");
        expect(c.tier).toBe(4);
        expect(c.provider).toBe("kling_2_6");
        expect(c.genreVariant).toBe("action");
        expect(typeof c.seed).toBe("number");
        expect(typeof c.qualityScore).toBe("number");
        expect(c.storageUrl).toBeTruthy();
      }
    });
  });

  describe("labelCandidate", () => {
    it("should add outcomeClass and isRepresentative", () => {
      const candidates = simulateSampleGeneration("V01", 3, "kling_2_6", "action", 1);
      const labeled = labelCandidate(candidates[0]);
      expect(["success", "partial_success", "expected_failure"]).toContain(labeled.outcomeClass);
      expect(typeof labeled.isRepresentative).toBe("boolean");
    });
  });

  describe("TIER_LABELS", () => {
    it("should have labels for all 5 tiers", () => {
      for (const t of QUALITY_TIERS) {
        expect(TIER_LABELS[t]).toBeTruthy();
      }
    });
  });

  describe("FAILURE_MODES", () => {
    it("should have labels for all failure modes", () => {
      for (const mode of FAILURE_MODES) {
        expect(FAILURE_MODE_LABELS[mode]).toBeTruthy();
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. ESG Computation
// ═══════════════════════════════════════════════════════════════════════

describe("ESG Computation", () => {
  describe("computeESG", () => {
    it("should compute ESG from expectation tier, actual tier, and satisfaction", () => {
      // computeESG(expectationTier, actualTier, satisfactionScore)
      const result = computeESG(4, 3, 3.0);
      expect(typeof result.esg).toBe("number");
      expect(result.routingAction).toBeTruthy();
      expect(result.interpretation).toBeTruthy();
      expect(result.expectationTier).toBe(4);
      expect(result.actualTier).toBe(3);
    });

    it("should have negative ESG when satisfaction exceeds baseline (good)", () => {
      // Tier 3 baseline is ~3.0, satisfaction 4.5 → ESG < 0
      const result = computeESG(3, 3, 4.5);
      expect(result.esg).toBeLessThan(0);
    });

    it("should have positive ESG when satisfaction below baseline (bad)", () => {
      // Tier 5 baseline is ~4.5, satisfaction 2.0 → ESG > 0
      const result = computeESG(5, 5, 2.0);
      expect(result.esg).toBeGreaterThan(0);
    });

    it("should be near zero when satisfaction matches baseline", () => {
      const baseline = getBaselineSatisfaction(3);
      const result = computeESG(3, 3, baseline);
      expect(Math.abs(result.esg)).toBeLessThan(0.01);
    });
  });

  describe("classifyESGRouting", () => {
    it("should return 'none' for small ESG values", () => {
      expect(classifyESGRouting(-0.5)).toBe("none");
      expect(classifyESGRouting(0)).toBe("none");
    });

    it("should return 'act' for large positive ESG", () => {
      // ESG > 1.5 triggers act
      expect(classifyESGRouting(2.0)).toBe("act");
    });

    it("should classify intermediate values", () => {
      const routing = classifyESGRouting(0.8);
      expect(["monitor", "investigate"]).toContain(routing);
    });
  });

  describe("getBaselineSatisfaction", () => {
    it("should return higher baseline for higher tiers", () => {
      const t1 = getBaselineSatisfaction(1);
      const t5 = getBaselineSatisfaction(5);
      expect(t5).toBeGreaterThan(t1);
    });

    it("should return a number between 1 and 5", () => {
      for (const t of [1, 2, 3, 4, 5]) {
        const b = getBaselineSatisfaction(t);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("computeESGTrend", () => {
    it("should compute trend from ESG records over a period", () => {
      const now = Date.now();
      const records: ESGRecord[] = [
        { esg: 0.5, routingAction: "monitor", createdAt: now - 86400000 * 20 },
        { esg: 0.3, routingAction: "monitor", createdAt: now - 86400000 * 10 },
        { esg: 0.1, routingAction: "none", createdAt: now - 86400000 * 5 },
        { esg: -0.1, routingAction: "none", createdAt: now - 86400000 },
      ];
      const trend = computeESGTrend(records, 30);
      expect(trend.period).toBe("30d");
      expect(typeof trend.avgESG).toBe("number");
      expect(trend.totalScenes).toBe(4);
      expect(["improving", "stable", "declining"]).toContain(trend.trend);
    });

    it("should return zero counts for empty records in period", () => {
      const trend = computeESGTrend([], 30);
      expect(trend.totalScenes).toBe(0);
      expect(trend.avgESG).toBe(0);
      expect(trend.trend).toBe("stable");
    });
  });

  describe("buildAnchorHistogram", () => {
    it("should build histogram from anchor records", () => {
      const anchors: AnchorRecord[] = [
        { sceneType: "dialogue", anchoredTier: 3, selectedTier: 3, createdAt: Date.now() },
        { sceneType: "action", anchoredTier: 4, selectedTier: 4, createdAt: Date.now() },
        { sceneType: "dialogue", anchoredTier: 3, selectedTier: 2, createdAt: Date.now() },
      ];
      const histogram = buildAnchorHistogram(anchors);
      expect(histogram.length).toBe(5); // one entry per tier 1-5
      const tier3 = histogram.find(h => h.tier === 3);
      expect(tier3!.count).toBe(2);
    });

    it("should handle empty anchors", () => {
      const histogram = buildAnchorHistogram([]);
      expect(histogram.length).toBe(5); // still returns all tiers with 0 counts
    });
  });

  describe("computeGapAnalysis", () => {
    it("should compute gap analysis per scene type", () => {
      const anchors: AnchorRecord[] = [
        { sceneType: "dialogue", anchoredTier: 5, selectedTier: 3, createdAt: Date.now() },
        { sceneType: "dialogue", anchoredTier: 4, selectedTier: 2, createdAt: Date.now() },
        { sceneType: "action", anchoredTier: 3, selectedTier: 3, createdAt: Date.now() },
      ];
      const gaps = computeGapAnalysis(anchors);
      expect(gaps.length).toBeGreaterThan(0);
      const dialogueGap = gaps.find(g => g.sceneType === "dialogue");
      expect(dialogueGap!.gap).toBeGreaterThan(0); // anchored higher than selected
      expect(dialogueGap!.suggestion).toBeTruthy();
    });
  });

  describe("generateExpectationReportCard", () => {
    it("should generate a complete report card", () => {
      const now = Date.now();
      const esgRecords: ESGRecord[] = [
        { esg: 0.3, routingAction: "monitor", createdAt: now - 86400000 },
        { esg: 0.1, routingAction: "none", createdAt: now },
      ];
      const anchors: AnchorRecord[] = [
        { sceneType: "dialogue", anchoredTier: 3, selectedTier: 3, createdAt: now },
      ];
      const card = generateExpectationReportCard(1, esgRecords, anchors);
      expect(card.userId).toBe(1);
      expect(card.generatedAt).toBeGreaterThan(0);
      expect(card.personalESG).toBeDefined();
      expect(card.personalESG.avg30d).toBeDefined();
      expect(card.personalESG.avg90d).toBeDefined();
      expect(card.anchorHistogram).toBeDefined();
      expect(card.spendHistogram).toBeDefined();
      expect(card.gapAnalysis).toBeDefined();
      expect(card.topExceeded).toBeDefined();
      expect(card.bottomFellShort).toBeDefined();
      expect(typeof card.totalScenes).toBe("number");
    });

    it("should handle empty data", () => {
      const card = generateExpectationReportCard(1, [], []);
      expect(card.userId).toBe(1);
      expect(card.totalScenes).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. A/B Testing
// ═══════════════════════════════════════════════════════════════════════

describe("A/B Testing", () => {
  describe("assignCohort", () => {
    it("should assign control or sampler cohort", () => {
      const cohort = assignCohort(1);
      expect(["control", "sampler"]).toContain(cohort);
    });

    it("should be deterministic for the same user", () => {
      const a1 = assignCohort(42);
      const a2 = assignCohort(42);
      expect(a1).toBe(a2);
    });

    it("should distribute across both cohorts over many users", () => {
      const cohorts = new Set<string>();
      for (let i = 0; i < 100; i++) {
        cohorts.add(assignCohort(i));
      }
      expect(cohorts.size).toBe(2);
    });
  });

  describe("verifyCohortDistribution", () => {
    it("should verify distribution is valid", () => {
      const assignments: CohortAssignment[] = Array.from({ length: 100 }, (_, i) => ({
        userId: i,
        cohort: assignCohort(i),
      }));
      const result = verifyCohortDistribution(assignments);
      expect(typeof result.valid).toBe("boolean");
      expect(typeof result.actualSamplerRatio).toBe("number");
      expect(typeof result.expectedRatio).toBe("number");
    });
  });

  describe("computePrimaryMetrics", () => {
    it("should compute metrics for sampler cohort", () => {
      const data: CohortData = {
        totalScenes: 100,
        badReviews: 5,
        supportTickets: 2,
        regenerations: 10,
        totalESG: 35,
        tierUpgrades: 8,
        totalCredits: 500,
        creatorCount: 10,
        completedFirstProject: 8,
        avgTimeToFirstOutput: 120,
        anchorSkips: 3,
        tier1Selections: 15,
      };
      const metrics = computePrimaryMetrics("sampler", data);
      expect(typeof metrics.badReviewRate).toBe("number");
      expect(typeof metrics.supportTicketRate).toBe("number");
      expect(typeof metrics.regenerationRate).toBe("number");
      expect(typeof metrics.avgESG).toBe("number");
    });

    it("should compute metrics for control cohort", () => {
      const data: CohortData = {
        totalScenes: 50,
        badReviews: 10,
        supportTickets: 5,
        regenerations: 20,
        totalESG: 40,
        tierUpgrades: 2,
        totalCredits: 300,
        creatorCount: 5,
        completedFirstProject: 3,
        avgTimeToFirstOutput: 180,
        anchorSkips: 1,
        tier1Selections: 25,
      };
      const metrics = computePrimaryMetrics("control", data);
      expect(typeof metrics.badReviewRate).toBe("number");
    });
  });

  describe("computeABTestResult", () => {
    it("should compute full A/B test result", () => {
      const controlData: CohortData = {
        totalScenes: 50,
        badReviews: 10,
        supportTickets: 5,
        regenerations: 20,
        totalESG: 40,
        tierUpgrades: 2,
        totalCredits: 300,
        creatorCount: 5,
        completedFirstProject: 3,
        avgTimeToFirstOutput: 180,
        anchorSkips: 1,
        tier1Selections: 25,
      };
      const samplerData: CohortData = {
        totalScenes: 100,
        badReviews: 5,
        supportTickets: 2,
        regenerations: 10,
        totalESG: 35,
        tierUpgrades: 8,
        totalCredits: 500,
        creatorCount: 10,
        completedFirstProject: 8,
        avgTimeToFirstOutput: 120,
        anchorSkips: 3,
        tier1Selections: 15,
      };
      const result = computeABTestResult(controlData, samplerData);
      expect(result.control).toBeDefined();
      expect(result.sampler).toBeDefined();
      expect(result.controlGuardrails).toBeDefined();
      expect(result.samplerGuardrails).toBeDefined();
      expect(result.primaryMetricDeltas).toBeDefined();
      expect(result.recommendation).toBeTruthy();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Staleness Scoring
// ═══════════════════════════════════════════════════════════════════════

describe("Staleness Scoring", () => {
  describe("computeStalenessScore", () => {
    it("should compute low staleness for fresh sample", () => {
      const input: StalenessInput = {
        sampleId: 1,
        publishedAt: Date.now(),
        provider: "kling_2_6",
        archetypeId: "V01",
        tier: 3,
        currentStaleness: 0,
      };
      const result = computeStalenessScore(input);
      expect(result.stalenessScore).toBeLessThan(0.3);
      expect(result.flaggedForRefresh).toBe(false);
    });

    it("should compute higher staleness for old sample", () => {
      const oldDate = Date.now() - 180 * 86400000;
      const input: StalenessInput = {
        sampleId: 2,
        publishedAt: oldDate,
        provider: "kling_2_6",
        archetypeId: "V01",
        tier: 3,
        currentStaleness: 0,
      };
      const result = computeStalenessScore(input);
      expect(result.stalenessScore).toBeGreaterThan(0.3);
      expect(result.daysSincePublication).toBeGreaterThanOrEqual(179);
    });

    it("should return score between 0 and 1", () => {
      const input: StalenessInput = {
        sampleId: 3,
        publishedAt: Date.now() - 365 * 86400000,
        provider: "kling_2_6",
        archetypeId: "V01",
        tier: 3,
        currentStaleness: 0,
      };
      const result = computeStalenessScore(input);
      expect(result.stalenessScore).toBeGreaterThanOrEqual(0);
      expect(result.stalenessScore).toBeLessThanOrEqual(1);
    });

    it("should include refresh priority", () => {
      const input: StalenessInput = {
        sampleId: 4,
        publishedAt: Date.now(),
        provider: "kling_2_6",
        archetypeId: "V01",
        tier: 3,
        currentStaleness: 0,
      };
      const result = computeStalenessScore(input);
      expect(["none", "low", "medium", "high", "critical"]).toContain(result.refreshPriority);
    });
  });

  describe("flagStaleSamples", () => {
    it("should sort by staleness descending", () => {
      const inputs: StalenessInput[] = [
        { sampleId: 1, publishedAt: Date.now(), provider: "kling_2_6", archetypeId: "V01", tier: 3, currentStaleness: 0 },
        { sampleId: 2, publishedAt: Date.now() - 200 * 86400000, provider: "kling_2_6", archetypeId: "V01", tier: 3, currentStaleness: 0 },
      ];
      const results = flagStaleSamples(inputs);
      expect(results.length).toBe(2);
      expect(results[0].stalenessScore).toBeGreaterThanOrEqual(results[1].stalenessScore);
    });

    it("should handle empty input", () => {
      const results = flagStaleSamples([]);
      expect(results.length).toBe(0);
    });
  });

  describe("checkProviderVersionGap", () => {
    it("should return false for fresh sample", () => {
      const result = checkProviderVersionGap("kling_2_6", Date.now());
      expect(result).toBe(false);
    });

    it("should return true for old sample with version history", () => {
      const result = checkProviderVersionGap("kling_2_6", Date.now() - 90 * 86400000);
      expect(result).toBe(true);
    });

    it("should return false for unknown provider", () => {
      const result = checkProviderVersionGap("unknown_provider", Date.now() - 90 * 86400000);
      expect(result).toBe(false);
    });
  });

  describe("computeRefreshBudget", () => {
    it("should return a budget with correct structure", () => {
      const budget = computeRefreshBudget(500);
      expect(budget.yearlyBudgetUsd).toBe(6000);
      expect(budget.spentUsd).toBe(500);
      expect(budget.remainingUsd).toBe(5500);
      expect(typeof budget.quarterlyAllocation).toBe("number");
      expect(typeof budget.eventTriggeredReserve).toBe("number");
      expect(typeof budget.estimatedSamplesRemaining).toBe("number");
    });

    it("should decrease remaining when more is spent", () => {
      const low = computeRefreshBudget(100);
      const high = computeRefreshBudget(800);
      expect(low.remainingUsd).toBeGreaterThan(high.remainingUsd);
    });

    it("should not go below zero remaining", () => {
      const budget = computeRefreshBudget(10000);
      expect(budget.remainingUsd).toBe(0);
    });
  });

  describe("generateRefreshEvents", () => {
    it("should generate events for quarterly cycle trigger", () => {
      const events = generateRefreshEvents([], ["quarterly_cycle"]);
      expect(events.length).toBe(1);
      expect(events[0].trigger).toBe("quarterly_cycle");
      expect(events[0].affectedSamples).toBeGreaterThan(0);
      expect(typeof events[0].estimatedCostUsd).toBe("number");
    });

    it("should generate events for multiple triggers", () => {
      const events = generateRefreshEvents([], ["quarterly_cycle", "lora_pipeline_change"]);
      expect(events.length).toBe(2);
    });

    it("should handle empty triggers", () => {
      const events = generateRefreshEvents([], []);
      expect(events.length).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Governance Workflow
// ═══════════════════════════════════════════════════════════════════════

describe("Governance Workflow", () => {
  describe("getDefaultCommittee", () => {
    it("should create a committee with all 3 required roles", () => {
      const committee = getDefaultCommittee();
      expect(committee.length).toBe(3);
      const roles = committee.map(m => m.role);
      expect(roles).toContain("product_lead");
      expect(roles).toContain("ux_lead");
      expect(roles).toContain("skeptical_engineer");
    });
  });

  describe("submitForReview", () => {
    it("should create a new review with pending status", () => {
      const submission: ReviewSubmission = {
        sampleId: 1,
        archetypeId: "V01",
        tier: 3,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "https://example.com/sample.png",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      };
      const review = submitForReview(submission);
      expect(review.status).toBe("pending");
      expect(review.submission.sampleId).toBe(1);
      expect(review.votes.length).toBe(0);
      expect(review.round).toBe(1);
    });
  });

  describe("recordVote", () => {
    it("should record a vote on a review", () => {
      const review = submitForReview({
        sampleId: 100,
        archetypeId: "V01",
        tier: 4,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "https://example.com/sample2.png",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const vote: Vote = {
        role: "product_lead",
        reviewerId: "reviewer-1",
        decision: "approve",
        comment: "Looks great",
        round: 1,
        votedAt: Date.now(),
      };
      const updated = recordVote(review, vote);
      expect(updated.votes.length).toBe(1);
      expect(updated.votes[0].role).toBe("product_lead");
      expect(updated.votes[0].decision).toBe("approve");
    });

    it("should transition to in_review after first vote", () => {
      const review = submitForReview({
        sampleId: 101,
        archetypeId: "V01",
        tier: 3,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const vote: Vote = {
        role: "product_lead",
        reviewerId: "reviewer-1",
        decision: "approve",
        round: 1,
        votedAt: Date.now(),
      };
      const updated = recordVote(review, vote);
      expect(updated.status).toBe("in_review");
    });
  });

  describe("checkUnanimousApproval", () => {
    it("should approve when all votes are approve", () => {
      const review = submitForReview({
        sampleId: 102,
        archetypeId: "V01",
        tier: 5,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const votes: Vote[] = [
        { role: "product_lead", reviewerId: "r1", decision: "approve", round: 1, votedAt: Date.now() },
        { role: "ux_lead", reviewerId: "r2", decision: "approve", round: 1, votedAt: Date.now() },
        { role: "skeptical_engineer", reviewerId: "r3", decision: "approve", round: 1, votedAt: Date.now() },
      ];
      const result = checkUnanimousApproval(review, votes);
      expect(result.status).toBe("approved");
    });

    it("should reject when any vote is reject", () => {
      const review = submitForReview({
        sampleId: 103,
        archetypeId: "V01",
        tier: 2,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const votes: Vote[] = [
        { role: "product_lead", reviewerId: "r1", decision: "approve", round: 1, votedAt: Date.now() },
        { role: "ux_lead", reviewerId: "r2", decision: "reject", round: 1, votedAt: Date.now() },
        { role: "skeptical_engineer", reviewerId: "r3", decision: "approve", round: 1, votedAt: Date.now() },
      ];
      const result = checkUnanimousApproval(review, votes);
      expect(result.status).not.toBe("approved");
    });
  });

  describe("vetoSample", () => {
    it("should veto a review", () => {
      const review = submitForReview({
        sampleId: 104,
        archetypeId: "V01",
        tier: 1,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const vetoed = vetoSample(review, "skeptical_engineer", "reviewer-3", "Quality too low");
      expect(vetoed.status).toBe("vetoed");
    });
  });

  describe("computeGovernanceStats", () => {
    it("should compute statistics from reviews", () => {
      const review1 = submitForReview({
        sampleId: 200,
        archetypeId: "V01",
        tier: 3,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });
      const review2 = submitForReview({
        sampleId: 201,
        archetypeId: "V02",
        tier: 4,
        provider: "kling_2_6",
        genreVariant: "action",
        storageUrl: "",
        submittedBy: "test-user",
        submittedAt: Date.now(),
      });

      const stats = computeGovernanceStats([review1, review2]);
      expect(stats.totalReviews).toBe(2);
      expect(typeof stats.approved).toBe("number");
      expect(typeof stats.rejected).toBe("number");
      expect(typeof stats.pending).toBe("number");
      expect(typeof stats.approvalRate).toBe("number");
    });

    it("should handle empty reviews", () => {
      const stats = computeGovernanceStats([]);
      expect(stats.totalReviews).toBe(0);
    });
  });
});
