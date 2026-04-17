/**
 * Prompt 23 — Tier Sampler tRPC Router
 *
 * Endpoints for sample browsing, expectation anchors, ESG scoring,
 * A/B testing, staleness monitoring, and governance workflow.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { tierSamples, expectationAnchors, esgScores, samplerAbAssignments } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

import {
  VISUAL_ARCHETYPES,
  AUDIO_ARCHETYPES,
  GENRE_VARIANTS,
  QUALITY_TIERS,
  TIER_LABELS,
  VISUAL_PROVIDERS,
  AUDIO_PROVIDERS,
  FAILURE_MODE_LABELS,
  getSamplesForArchetype,
  getSamplesForVoice,
  getArchetypeById,
  getArchetypesForSceneType,
  generateSampleBatchSpec,
  type GenreVariant,
} from "./tier-sampler-catalog";

import {
  computeESG,
  getBaselineSatisfaction,
  classifyESGRouting,
  computeESGTrend,
  generateExpectationReportCard,
  buildAnchorHistogram,
  buildSpendHistogram,
  computeGapAnalysis,
  type ESGRecord,
  type AnchorRecord,
} from "./esg-computation";

import {
  assignCohort,
  verifyCohortDistribution,
  computeABTestResult,
  SAMPLER_RATIO,
  type CohortData,
} from "./sampler-ab-testing";

import {
  computeStalenessScore,
  flagStaleSamples,
  computeRefreshBudget,
  generateRefreshEvents,
  STALENESS_THRESHOLDS,
  type StalenessInput,
  type RefreshTrigger,
} from "./staleness-scoring";

import {
  submitForReview,
  recordVote,
  vetoSample,
  computeGovernanceStats,
  getDefaultCommittee,
  COMMITTEE_ROLES,
  type CommitteeRole,
  type VoteDecision,
  type ReviewSubmission,
  type ReviewRecord,
} from "./governance-workflow";

// ─── In-memory governance store (simulated) ────────────────────────────
const governanceReviews = new Map<number, ReviewRecord>();
let nextReviewId = 1;

export const tierSamplerRouter = router({
  // ─── Sample Catalog ────────────────────────────────────────────────

  /** Get all archetype definitions */
  getArchetypes: protectedProcedure.query(() => {
    return {
      visual: VISUAL_ARCHETYPES,
      audio: AUDIO_ARCHETYPES,
      totalVisual: VISUAL_ARCHETYPES.length,
      totalAudio: AUDIO_ARCHETYPES.length,
    };
  }),

  /** Get samples for a specific archetype × tier × genre combination */
  getSamples: protectedProcedure
    .input(z.object({
      archetypeId: z.string(),
      tier: z.number().min(1).max(5),
      genreVariant: z.enum(["action", "slice_of_life", "atmospheric", "neutral"]).default("neutral"),
    }))
    .query(({ input }) => {
      const result = getSamplesForArchetype(input.archetypeId, input.tier, input.genreVariant);
      const archetype = getArchetypeById(input.archetypeId);
      return {
        ...result,
        archetypeName: archetype ? (archetype as { name: string }).name : "Unknown",
        tierLabel: TIER_LABELS[input.tier] ?? `Tier ${input.tier}`,
      };
    }),

  /** Get voice samples for provider × quality grid */
  getVoiceSamples: protectedProcedure
    .input(z.object({
      archetypeId: z.string(),
      provider: z.string(),
      qualityLevel: z.number().min(1).max(5),
    }))
    .query(({ input }) => {
      const samples = getSamplesForVoice(input.archetypeId, input.provider, input.qualityLevel);
      return {
        archetypeId: input.archetypeId,
        provider: input.provider,
        qualityLevel: input.qualityLevel,
        samples,
      };
    }),

  /** Get all samples for a full tier strip (all 5 tiers for one archetype) */
  getTierStrip: protectedProcedure
    .input(z.object({
      archetypeId: z.string(),
      genreVariant: z.enum(["action", "slice_of_life", "atmospheric", "neutral"]).default("neutral"),
    }))
    .query(({ input }) => {
      const tiers = QUALITY_TIERS.map(t => {
        const samples = getSamplesForArchetype(input.archetypeId, t, input.genreVariant);
        return {
          ...samples,
          label: TIER_LABELS[t],
        };
      });
      return {
        archetypeId: input.archetypeId,
        genreVariant: input.genreVariant,
        tiers,
      };
    }),

  /** Get batch spec for quarterly refresh */
  getBatchSpec: protectedProcedure.query(() => {
    return generateSampleBatchSpec();
  }),

  /** Get catalog metadata */
  getCatalogMeta: protectedProcedure.query(() => {
    return {
      genreVariants: GENRE_VARIANTS,
      qualityTiers: QUALITY_TIERS.map(t => ({ tier: t, label: TIER_LABELS[t] })),
      visualProviders: [...VISUAL_PROVIDERS],
      audioProviders: [...AUDIO_PROVIDERS],
      failureModeLabels: FAILURE_MODE_LABELS,
      totalArchetypes: VISUAL_ARCHETYPES.length + AUDIO_ARCHETYPES.length,
    };
  }),

  // ─── Expectation Anchors ───────────────────────────────────────────

  /** Record a creator's expectation anchor selection */
  recordExpectationAnchor: protectedProcedure
    .input(z.object({
      sceneType: z.string(),
      anchoredSampleId: z.number(),
      anchoredTier: z.number().min(1).max(5),
      anchorConfidence: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const [result] = await db!.insert(expectationAnchors).values({
        userId: ctx.user.id,
        sceneType: input.sceneType,
        anchoredSampleId: input.anchoredSampleId,
        anchoredTier: input.anchoredTier,
        anchorConfidence: input.anchorConfidence ?? null,
      });
      return { anchorId: result.insertId, recorded: true };
    }),

  /** Update the selected tier on an existing anchor */
  updateAnchorSelection: protectedProcedure
    .input(z.object({
      anchorId: z.number(),
      selectedTier: z.number().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db!.update(expectationAnchors)
        .set({ selectedTier: input.selectedTier })
        .where(and(
          eq(expectationAnchors.id, input.anchorId),
          eq(expectationAnchors.userId, ctx.user.id),
        ));
      return { updated: true };
    }),

  /** Get user's recent anchors */
  getMyAnchors: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const rows = await db!.select()
        .from(expectationAnchors)
        .where(eq(expectationAnchors.userId, ctx.user.id))
        .orderBy(desc(expectationAnchors.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // ─── ESG Scoring ───────────────────────────────────────────────────

  /** Record satisfaction and compute ESG score */
  recordSatisfaction: protectedProcedure
    .input(z.object({
      sceneType: z.string(),
      expectationTier: z.number().min(1).max(5),
      actualTier: z.number().min(1).max(5),
      satisfactionScore: z.number().min(1).max(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const esgResult = computeESG(input.expectationTier, input.actualTier, input.satisfactionScore);
      const db = await getDb();
      const [result] = await db!.insert(esgScores).values({
        userId: ctx.user.id,
        sceneType: input.sceneType,
        expectationTier: input.expectationTier,
        actualTier: input.actualTier,
        expectedSatisfaction: esgResult.expectedSatisfaction,
        satisfactionScore: input.satisfactionScore,
        esg: esgResult.esg,
        routingAction: esgResult.routingAction,
      });
      return { scoreId: result.insertId, ...esgResult };
    }),

  /** Get ESG scores for the current user */
  getMyESGScores: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const rows = await db!.select()
        .from(esgScores)
        .where(eq(esgScores.userId, ctx.user.id))
        .orderBy(desc(esgScores.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Get the creator's Expectation Report Card */
  getExpectationReportCard: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();

      // Fetch ESG records
      const esgRows = await db!.select()
      .from(esgScores)
      .where(eq(esgScores.userId, ctx.user.id))
      .orderBy(desc(esgScores.createdAt))
      .limit(500);

    const esgRecords: ESGRecord[] = esgRows.map(r => ({
      esg: r.esg,
      routingAction: r.routingAction,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    }));

    // Fetch anchor records
      const anchorRows = await db!.select()
        .from(expectationAnchors)
      .where(eq(expectationAnchors.userId, ctx.user.id))
      .orderBy(desc(expectationAnchors.createdAt))
      .limit(500);

    const anchorRecords: AnchorRecord[] = anchorRows.map(r => ({
      sceneType: r.sceneType,
      anchoredTier: r.anchoredTier,
      selectedTier: r.selectedTier,
      createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
    }));

    // If no data, return empty report card
    if (esgRecords.length === 0 && anchorRecords.length === 0) {
      return {
        hasData: false,
        reportCard: null,
      };
    }

    const reportCard = generateExpectationReportCard(ctx.user.id, esgRecords, anchorRecords);
    return { hasData: true, reportCard };
  }),

  // ─── A/B Testing ───────────────────────────────────────────────────

  /** Get or create A/B cohort assignment for the current user */
  getABAssignment: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();

      // Check existing assignment
      const existing = await db!.select()
      .from(samplerAbAssignments)
      .where(eq(samplerAbAssignments.userId, ctx.user.id))
      .limit(1);

    if (existing.length > 0) {
      return { cohort: existing[0].cohort, isNew: false };
    }

    // Assign new cohort
    const cohort = assignCohort(ctx.user.id);
      await db!.insert(samplerAbAssignments).values({
      userId: ctx.user.id,
      cohort,
    });

    return { cohort, isNew: true };
  }),

  /** Get A/B test metrics (admin view) */
  getABMetrics: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();

      // Get all assignments
      const assignments = await db!.select().from(samplerAbAssignments);
    const controlUsers = assignments.filter(a => a.cohort === "control").map(a => a.userId);
    const samplerUsers = assignments.filter(a => a.cohort === "sampler").map(a => a.userId);

    // Get ESG scores per cohort
    const allESG = await db!.select().from(esgScores);
    const controlESG = allESG.filter(e => controlUsers.includes(e.userId));
    const samplerESG = allESG.filter(e => samplerUsers.includes(e.userId));

    // Build simulated cohort data
    const buildCohortData = (users: number[], esg: typeof allESG): CohortData => ({
      totalScenes: esg.length || 1,
      badReviews: esg.filter(e => e.satisfactionScore <= 2).length,
      supportTickets: Math.floor(esg.filter(e => e.esg > 1.0).length * 0.3),
      regenerations: Math.floor(esg.filter(e => e.esg > 0.5).length * 0.5),
      totalESG: esg.reduce((s, e) => s + e.esg, 0),
      tierUpgrades: esg.filter(e => e.actualTier > e.expectationTier).length,
      totalCredits: esg.length * 5.0, // simulated
      creatorCount: users.length || 1,
      completedFirstProject: Math.floor((users.length || 1) * 0.85),
      avgTimeToFirstOutput: 45, // simulated
      anchorSkips: Math.floor(esg.length * 0.12), // simulated
      tier1Selections: esg.filter(e => e.actualTier === 1).length,
    });

    const result = computeABTestResult(
      buildCohortData(controlUsers, controlESG),
      buildCohortData(samplerUsers, samplerESG),
    );

    return {
      ...result,
      totalAssignments: assignments.length,
      controlCount: controlUsers.length,
      samplerCount: samplerUsers.length,
      samplerRatio: SAMPLER_RATIO,
    };
  }),

  // ─── Staleness Monitoring ──────────────────────────────────────────

  /** Get stale samples that need refresh */
  getStaleSamples: protectedProcedure
    .input(z.object({
      threshold: z.number().min(0).max(1).default(0.7),
    }))
    .query(async () => {
      const db = await getDb();
      const samples = await db!.select()
        .from(tierSamples)
        .where(eq(tierSamples.isActive, 1));

      const inputs: StalenessInput[] = samples.map(s => ({
        sampleId: s.id,
        publishedAt: s.publishedAt ? new Date(s.publishedAt).getTime() : Date.now(),
        provider: s.provider,
        archetypeId: s.archetypeId,
        tier: s.tier,
        currentStaleness: s.stalenessScore,
      }));

      const results = flagStaleSamples(inputs);
      const flagged = results.filter(r => r.flaggedForRefresh);
      const outdated = results.filter(r => r.showOutdatedBadge);

      return {
        totalSamples: samples.length,
        flaggedCount: flagged.length,
        outdatedCount: outdated.length,
        flaggedSamples: flagged,
        refreshThreshold: STALENESS_THRESHOLDS.flagForRefresh,
        outdatedThreshold: STALENESS_THRESHOLDS.showOutdatedBadge,
      };
    }),

  /** Get refresh budget status */
  getRefreshBudget: protectedProcedure
    .input(z.object({ spentUsd: z.number().default(0) }))
    .query(({ input }) => {
      return computeRefreshBudget(input.spentUsd);
    }),

  /** Get refresh events for given triggers */
  getRefreshEvents: protectedProcedure
    .input(z.object({
      triggers: z.array(z.enum([
        "quarterly_cycle", "provider_version_bump",
        "lora_pipeline_change", "controlnet_mode_change",
        "esg_severe_gap_trend",
      ])),
    }))
    .query(({ input }) => {
      return generateRefreshEvents([], input.triggers as RefreshTrigger[]);
    }),

  // ─── Governance Workflow ───────────────────────────────────────────

  /** Submit a sample for governance review */
  submitGovernanceReview: protectedProcedure
    .input(z.object({
      sampleId: z.number(),
      archetypeId: z.string(),
      tier: z.number().min(1).max(5),
      provider: z.string(),
      genreVariant: z.string(),
      storageUrl: z.string(),
    }))
    .mutation(({ ctx, input }) => {
      const submission: ReviewSubmission = {
        ...input,
        submittedBy: ctx.user.id.toString(),
        submittedAt: Date.now(),
      };
      const review = submitForReview(submission);
      const id = nextReviewId++;
      governanceReviews.set(id, review);
      return { reviewId: id, status: review.status };
    }),

  /** Record a governance committee vote */
  recordGovernanceVote: protectedProcedure
    .input(z.object({
      reviewId: z.number(),
      role: z.enum(["product_lead", "ux_lead", "skeptical_engineer"]),
      decision: z.enum(["approve", "reject", "veto", "abstain"]),
      comment: z.string().default(""),
    }))
    .mutation(({ ctx, input }) => {
      const review = governanceReviews.get(input.reviewId);
      if (!review) {
        return { error: "Review not found", updated: false };
      }

      const updatedReview = recordVote(review, {
        role: input.role as CommitteeRole,
        reviewerId: ctx.user.id.toString(),
        decision: input.decision as VoteDecision,
        comment: input.comment,
        timestamp: Date.now(),
      });

      governanceReviews.set(input.reviewId, updatedReview);
      return {
        updated: true,
        status: updatedReview.status,
        statusReason: updatedReview.statusReason,
        round: updatedReview.round,
      };
    }),

  /** Get governance review status */
  getGovernanceReview: protectedProcedure
    .input(z.object({ reviewId: z.number() }))
    .query(({ input }) => {
      const review = governanceReviews.get(input.reviewId);
      if (!review) return null;
      return review;
    }),

  /** Get governance statistics */
  getGovernanceStats: protectedProcedure.query(() => {
    const reviews = Array.from(governanceReviews.values());
    const stats = computeGovernanceStats(reviews);
    return {
      ...stats,
      committee: getDefaultCommittee(),
      committeeRoles: COMMITTEE_ROLES,
    };
  }),

  /** Publish an approved sample */
  publishSample: protectedProcedure
    .input(z.object({
      reviewId: z.number(),
      sampleId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const review = governanceReviews.get(input.reviewId);
      if (!review || review.status !== "approved") {
        return { published: false, error: "Review must be approved before publishing." };
      }

      const db = await getDb();
      await db!.update(tierSamples)
        .set({ isActive: 1, publishedAt: new Date() })
        .where(eq(tierSamples.id, input.sampleId));

      return { published: true, sampleId: input.sampleId };
    }),

  // ─── Pipeline Stats ────────────────────────────────────────────────

  /** Get aggregate sampler usage statistics */
  getPipelineStats: protectedProcedure.query(async () => {
    const db = await getDb();

    const [sampleCount] = await db!.select({ count: sql<number>`count(*)` })
      .from(tierSamples)
      .where(eq(tierSamples.isActive, 1));

    const [anchorCount] = await db!.select({ count: sql<number>`count(*)` })
      .from(expectationAnchors);

    const [esgCount] = await db!.select({ count: sql<number>`count(*)` })
      .from(esgScores);

    const [abCount] = await db!.select({ count: sql<number>`count(*)` })
      .from(samplerAbAssignments);

    const esgAvg = await db!.select({ avg: sql<number>`COALESCE(AVG(esg), 0)` })
      .from(esgScores);

    return {
      activeSamples: sampleCount?.count ?? 0,
      totalAnchors: anchorCount?.count ?? 0,
      totalESGScores: esgCount?.count ?? 0,
      totalABAssignments: abCount?.count ?? 0,
      avgESG: Math.round((esgAvg[0]?.avg ?? 0) * 100) / 100,
      governanceReviews: governanceReviews.size,
    };
  }),
});
