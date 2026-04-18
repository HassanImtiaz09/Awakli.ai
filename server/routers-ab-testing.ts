/**
 * A/B Testing tRPC Procedures — Create experiments, collect results,
 * and compare provider performance side-by-side.
 *
 * @see Prompt 29
 */
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { abExperiments, abExperimentResults, batchJobs, batchJobItems } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  computeArmStats,
  generateComparison,
  type ABExperiment as ABExperimentEngine,
  type ABExperimentResult as ABExperimentResultEngine,
} from "./image-router/ab-testing";

// ─── tRPC Router ────────────────────────────────────────────────────────

export const abTestingRouter = router({
  /**
   * Create a new A/B experiment.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        controlProvider: z.string().min(1),
        variantProvider: z.string().min(1),
        trafficSplitPercent: z.number().int().min(1).max(99).default(20),
        workloadTypes: z.array(z.string()).default([]),
        minSampleSize: z.number().int().min(5).max(1000).default(30),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const id = randomUUID();
      await db.insert(abExperiments).values({
        id,
        name: input.name,
        description: input.description ?? null,
        controlProvider: input.controlProvider,
        variantProvider: input.variantProvider,
        trafficSplitPercent: input.trafficSplitPercent,
        workloadTypes: input.workloadTypes,
        status: "draft",
        minSampleSize: input.minSampleSize,
        createdBy: ctx.user.id,
      });

      return { id, status: "draft" as const };
    }),

  /**
   * List all experiments for the current user.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "running", "paused", "completed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(abExperiments.createdBy, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(abExperiments.status, input.status));
      }

      const rows = await db
        .select()
        .from(abExperiments)
        .where(and(...conditions))
        .orderBy(desc(abExperiments.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /**
   * Get a single experiment with aggregated stats.
   */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [experiment] = await db
        .select()
        .from(abExperiments)
        .where(and(eq(abExperiments.id, input.id), eq(abExperiments.createdBy, ctx.user.id)));

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      // Get result counts per arm
      const resultCounts = await db
        .select({
          arm: abExperimentResults.arm,
          count: sql<number>`COUNT(*)`,
          successCount: sql<number>`SUM(CASE WHEN ${abExperimentResults.succeeded} = 1 THEN 1 ELSE 0 END)`,
        })
        .from(abExperimentResults)
        .where(eq(abExperimentResults.experimentId, input.id))
        .groupBy(abExperimentResults.arm);

      const controlCount = resultCounts.find((r: any) => r.arm === "control");
      const variantCount = resultCounts.find((r: any) => r.arm === "variant");

      return {
        ...experiment,
        controlSampleSize: Number(controlCount?.count ?? 0),
        variantSampleSize: Number(variantCount?.count ?? 0),
        controlSuccessCount: Number(controlCount?.successCount ?? 0),
        variantSuccessCount: Number(variantCount?.successCount ?? 0),
      };
    }),

  /**
   * Start, pause, resume, complete, or cancel an experiment.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(["running", "paused", "completed", "cancelled"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [experiment] = await db
        .select()
        .from(abExperiments)
        .where(and(eq(abExperiments.id, input.id), eq(abExperiments.createdBy, ctx.user.id)));

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      // Validate state transitions
      const validTransitions: Record<string, string[]> = {
        draft: ["running", "cancelled"],
        running: ["paused", "completed", "cancelled"],
        paused: ["running", "completed", "cancelled"],
        completed: [],
        cancelled: [],
      };

      if (!validTransitions[experiment.status]?.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition from ${experiment.status} to ${input.status}`,
        });
      }

      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === "running" && !experiment.startedAt) {
        updates.startedAt = new Date();
      }
      if (input.status === "completed" || input.status === "cancelled") {
        updates.endedAt = new Date();
      }

      await db
        .update(abExperiments)
        .set(updates)
        .where(eq(abExperiments.id, input.id));

      return { id: input.id, status: input.status };
    }),

  /**
   * Record a result for an experiment arm.
   */
  recordResult: protectedProcedure
    .input(
      z.object({
        experimentId: z.string().uuid(),
        arm: z.enum(["control", "variant"]),
        providerId: z.string().min(1),
        jobId: z.string().min(1),
        workloadType: z.string().min(1),
        latencyMs: z.number().int().min(0),
        costUsd: z.number().min(0),
        qualityScore: z.number().int().min(0).max(100).optional(),
        succeeded: z.boolean(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const id = randomUUID();
      await db.insert(abExperimentResults).values({
        id,
        experimentId: input.experimentId,
        arm: input.arm,
        providerId: input.providerId,
        jobId: input.jobId,
        workloadType: input.workloadType,
        latencyMs: input.latencyMs,
        costUsd: input.costUsd.toString(),
        qualityScore: input.qualityScore ?? null,
        succeeded: input.succeeded ? 1 : 0,
      });

      return { id };
    }),

  /**
   * Get full comparison report for an experiment.
   * Computes statistical significance across success rate, latency, and cost.
   */
  compare: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [experiment] = await db
        .select()
        .from(abExperiments)
        .where(and(eq(abExperiments.id, input.id), eq(abExperiments.createdBy, ctx.user.id)));

      if (!experiment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Experiment not found" });
      }

      const results = await db
        .select()
        .from(abExperimentResults)
        .where(eq(abExperimentResults.experimentId, input.id))
        .orderBy(abExperimentResults.createdAt);

      // Convert DB rows to engine types
      const engineExperiment: ABExperimentEngine = {
        ...experiment,
        description: experiment.description ?? "",
        workloadTypes: (experiment.workloadTypes as string[]) ?? [],
      };

      const engineResults: ABExperimentResultEngine[] = results.map((r: any) => ({
        id: r.id,
        experimentId: r.experimentId,
        arm: r.arm as "control" | "variant",
        providerId: r.providerId,
        jobId: r.jobId,
        workloadType: r.workloadType,
        latencyMs: r.latencyMs,
        costUsd: parseFloat(r.costUsd ?? "0"),
        qualityScore: r.qualityScore,
        succeeded: r.succeeded === 1,
        createdAt: r.createdAt,
      }));

      return generateComparison(engineExperiment, engineResults);
    }),

  /**
   * Get results timeline for an experiment (for charting).
   */
  resultTimeline: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership
      const [experiment] = await db
        .select()
        .from(abExperiments)
        .where(and(eq(abExperiments.id, input.id), eq(abExperiments.createdBy, ctx.user.id)));

      if (!experiment) return [];

      const results = await db
        .select()
        .from(abExperimentResults)
        .where(eq(abExperimentResults.experimentId, input.id))
        .orderBy(desc(abExperimentResults.createdAt))
        .limit(input.limit);

      return results.map((r: any) => ({
        id: r.id,
        arm: r.arm,
        providerId: r.providerId,
        workloadType: r.workloadType,
        latencyMs: r.latencyMs,
        costUsd: parseFloat(r.costUsd ?? "0"),
        qualityScore: r.qualityScore,
        succeeded: r.succeeded === 1,
        createdAt: r.createdAt,
      }));
    }),

  // ─── Batch Job Procedures ────────────────────────────────────────────

  /**
   * List batch jobs for the current user.
   */
  listBatches: protectedProcedure
    .input(
      z.object({
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(batchJobs.userId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(batchJobs.status, input.status));
      }

      const rows = await db
        .select()
        .from(batchJobs)
        .where(and(...conditions))
        .orderBy(desc(batchJobs.createdAt))
        .limit(input.limit);

      return rows;
    }),

  /**
   * Submit a new batch job.
   */
  submitBatch: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        items: z.array(
          z.object({
            prompt: z.string().min(1),
            workloadType: z.string().min(1),
            width: z.number().int().min(256).max(4096).default(1024),
            height: z.number().int().min(256).max(4096).default(1024),
          }),
        ).min(1).max(500),
        webhookUrl: z.string().url().optional(),
        webhookSecret: z.string().max(128).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const batchId = randomUUID();

      // Create batch job
      await db.insert(batchJobs).values({
        id: batchId,
        userId: ctx.user.id,
        name: input.name,
        status: "pending",
        totalItems: input.items.length,
        completedItems: 0,
        failedItems: 0,
        webhookUrl: input.webhookUrl ?? null,
        webhookSecret: input.webhookSecret ?? null,
        config: input.config ?? null,
      });

      // Create batch job items
      const itemValues = input.items.map((item, index) => ({
        id: randomUUID(),
        batchId,
        itemIndex: index,
        status: "pending" as const,
        prompt: item.prompt,
        workloadType: item.workloadType,
        width: item.width,
        height: item.height,
      }));

      // Insert in chunks of 50
      for (let i = 0; i < itemValues.length; i += 50) {
        await db.insert(batchJobItems).values(itemValues.slice(i, i + 50));
      }

      return { id: batchId, totalItems: input.items.length, status: "pending" as const };
    }),

  /**
   * Cancel a batch job.
   */
  cancelBatch: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [batch] = await db
        .select()
        .from(batchJobs)
        .where(and(eq(batchJobs.id, input.id), eq(batchJobs.userId, ctx.user.id)));

      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch job not found" });
      }

      if (batch.status === "completed" || batch.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot cancel a ${batch.status} batch` });
      }

      await db
        .update(batchJobs)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(eq(batchJobs.id, input.id));

      // Cancel pending items
      await db
        .update(batchJobItems)
        .set({ status: "failed", errorMessage: "Batch cancelled" })
        .where(
          and(
            eq(batchJobItems.batchId, input.id),
            eq(batchJobItems.status, "pending"),
          ),
        );

      return { id: input.id, status: "cancelled" as const };
    }),

  /**
   * Get batch job details with item-level status.
   */
  getBatch: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [batch] = await db
        .select()
        .from(batchJobs)
        .where(and(eq(batchJobs.id, input.id), eq(batchJobs.userId, ctx.user.id)));

      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Batch job not found" });
      }

      const items = await db
        .select()
        .from(batchJobItems)
        .where(eq(batchJobItems.batchId, input.id))
        .orderBy(batchJobItems.itemIndex);

      return { ...batch, items };
    }),
});
