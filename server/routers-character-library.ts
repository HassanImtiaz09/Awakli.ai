/**
 * Prompt 21: Character Library & LoRA Training Router
 * 
 * Endpoints:
 * - list, getById, create, update, delete
 * - trainLora, batchTrain, getTrainingStatus, getBatchStatus
 * - reviewLora, getVersionHistory, rollbackVersion
 * - getAssets, getUsageStats
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import {
  characterLibrary, characterLoras, loraTrainingJobs, characterAssets,
  pipelineRunLoraPins, generationRequests,
  type InsertCharacterLibraryEntry, type InsertCharacterLora,
  type InsertLoraTrainingJob, type InsertCharacterAsset,
} from "../drizzle/schema";
import {
  preprocessCharacterSheet,
  buildKohyaConfig,
  buildKohyaArgs,
  buildTriggerWord,
  estimateTrainingJob,
  estimateBatchTraining,
  assignPriority,
  generateBatchId,
  getLoraArtifactPath,
  estimateLoraFileSize,
  clipToQualityScore,
  getValidationDecision,
  runValidation,
  generateValidationPrompts,
  getConsistencyMechanism,
  buildLoraInjectionPayload,
  shouldRetrain,
  previewExtraction,
  type TrainingJobEstimate,
  type ValidationResult,
} from "./lora-training-pipeline";

// ─── Character Library Router ───────────────────────────────────────────

export const characterLibraryRouter = router({

  // ── List characters ───────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      seriesId: z.number().optional(),
      sortBy: z.enum(["name", "lastUsed", "createdAt"]).default("createdAt"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const filters = [eq(characterLibrary.userId, ctx.user.id)];
      if (input?.seriesId) {
        filters.push(eq(characterLibrary.seriesId, input.seriesId));
      }

      const orderCol = input?.sortBy === "name"
        ? characterLibrary.name
        : input?.sortBy === "lastUsed"
          ? characterLibrary.updatedAt
          : characterLibrary.createdAt;

      const orderFn = input?.sortOrder === "asc" ? asc : desc;

      const results = await db.select()
        .from(characterLibrary)
        .where(and(...filters))
        .orderBy(orderFn(orderCol));

      return results;
    }),

  // ── Get by ID ─────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.id), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);

      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      // Fetch active LoRA details
      let activeLora = null;
      if (char.activeLoraId) {
        const [lora] = await db.select()
          .from(characterLoras)
          .where(eq(characterLoras.id, char.activeLoraId))
          .limit(1);
        activeLora = lora || null;
      }

      // Fetch version count
      const [versionCount] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(characterLoras)
        .where(eq(characterLoras.characterId, input.id));

      // Fetch assets count
      const [assetCount] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(characterAssets)
        .where(and(eq(characterAssets.characterId, input.id), eq(characterAssets.isActive, 1)));

      return {
        ...char,
        activeLora,
        versionCount: versionCount?.count ?? 0,
        assetCount: assetCount?.count ?? 0,
      };
    }),

  // ── Create character ──────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      seriesId: z.number().optional(),
      description: z.string().optional(),
      appearanceTags: z.record(z.string(), z.string()).optional(),
      referenceSheetUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const values: InsertCharacterLibraryEntry = {
        userId: ctx.user.id,
        name: input.name,
        seriesId: input.seriesId ?? null,
        description: input.description ?? null,
        appearanceTags: input.appearanceTags ?? null,
        referenceSheetUrl: input.referenceSheetUrl ?? null,
        loraStatus: "untrained",
      };

      const [result] = await db.insert(characterLibrary).values(values);
      const insertId = (result as any).insertId as number;

      // If reference sheet provided, create the asset record
      if (input.referenceSheetUrl) {
        await db.insert(characterAssets).values({
          characterId: insertId,
          assetType: "reference_sheet",
          storageUrl: input.referenceSheetUrl,
          version: 1,
          metadata: { source: "upload" },
          isActive: 1,
        });
      }

      return { id: insertId, name: input.name };
    }),

  // ── Update character ──────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      appearanceTags: z.record(z.string(), z.string()).optional(),
      referenceSheetUrl: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [existing] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.id), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      const updateData: Record<string, any> = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.appearanceTags !== undefined) updateData.appearanceTags = input.appearanceTags;

      // Check if reference sheet changed (triggers retraining check)
      let sheetChanged = false;
      if (input.referenceSheetUrl !== undefined && input.referenceSheetUrl !== existing.referenceSheetUrl) {
        updateData.referenceSheetUrl = input.referenceSheetUrl;
        sheetChanged = true;

        // If LoRA was active, mark as needs_retraining
        if (existing.loraStatus === "active") {
          updateData.loraStatus = "needs_retraining";
        }

        // Create new asset record
        await db.insert(characterAssets).values({
          characterId: input.id,
          assetType: "reference_sheet",
          storageUrl: input.referenceSheetUrl,
          version: 1,
          metadata: { source: "update", previousUrl: existing.referenceSheetUrl },
          isActive: 1,
        });
      }

      if (Object.keys(updateData).length > 0) {
        await db.update(characterLibrary)
          .set(updateData)
          .where(eq(characterLibrary.id, input.id));
      }

      return { id: input.id, updated: true, sheetChanged };
    }),

  // ── Delete character ──────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.id), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      // Cascade delete handles loras, jobs, assets, pins
      await db.delete(characterLibrary).where(eq(characterLibrary.id, input.id));

      return { deleted: true };
    }),

  // ── Train LoRA ────────────────────────────────────────────────────────
  trainLora: protectedProcedure
    .input(z.object({
      characterId: z.number(),
      gpuType: z.enum(["h100_sxm", "a100_80gb", "rtx_4090"]).default("h100_sxm"),
      rank: z.number().min(16).max(64).default(32),
      alpha: z.number().min(8).max(32).default(16),
      learningRate: z.number().min(5e-5).max(3e-4).default(1e-4),
      trainingSteps: z.number().min(500).max(1500).default(800),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership and get character
      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      if (!char.referenceSheetUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Character must have a reference sheet before training" });
      }

      if (char.loraStatus === "training" || char.loraStatus === "validating") {
        throw new TRPCError({ code: "CONFLICT", message: "Training already in progress for this character" });
      }

      // Determine next version
      const [maxVersion] = await db.select({ max: sql<number>`COALESCE(MAX(version), 0)` })
        .from(characterLoras)
        .where(eq(characterLoras.characterId, input.characterId));
      const nextVersion = (maxVersion?.max ?? 0) + 1;

      const triggerWord = buildTriggerWord(char.name);
      const artifactPath = getLoraArtifactPath(input.characterId, nextVersion);
      const fileSizeEstimate = estimateLoraFileSize(input.rank);

      // Create LoRA record
      const trainingParams = {
        rank: input.rank,
        alpha: input.alpha,
        learningRate: input.learningRate,
        trainingSteps: input.trainingSteps,
        gpuType: input.gpuType,
        baseModel: "Anything V5",
        optimizer: "AdamW8bit",
        scheduler: "cosine_with_restarts",
      };

      const [loraResult] = await db.insert(characterLoras).values({
        characterId: input.characterId,
        version: nextVersion,
        artifactPath,
        artifactSizeBytes: fileSizeEstimate.avgBytes,
        trainingParams,
        triggerWord,
        status: "training",
        validationStatus: "pending",
      });
      const loraId = (loraResult as any).insertId as number;

      // Create training job
      const estimate = estimateTrainingJob(input.gpuType, input.trainingSteps);
      const [jobResult] = await db.insert(loraTrainingJobs).values({
        characterId: input.characterId,
        loraId,
        userId: ctx.user.id,
        status: "queued",
        priority: 1,
        gpuType: input.gpuType,
        costUsd: String(estimate.withMargin.costUsd),
        costCredits: String(estimate.withMargin.costCredits),
      });
      const jobId = (jobResult as any).insertId as number;

      // Update character status
      await db.update(characterLibrary)
        .set({ loraStatus: "training" })
        .where(eq(characterLibrary.id, input.characterId));

      // Preprocess the dataset
      const dataset = preprocessCharacterSheet(
        char.referenceSheetUrl,
        char.name,
        (char.appearanceTags as Record<string, string>) ?? {}
      );

      return {
        jobId,
        loraId,
        version: nextVersion,
        triggerWord,
        estimate,
        dataset: {
          totalImages: dataset.totalImages,
          triggerWord: dataset.triggerWord,
        },
      };
    }),

  // ── Batch Train ───────────────────────────────────────────────────────
  batchTrain: protectedProcedure
    .input(z.object({
      characterIds: z.array(z.number()).min(1).max(20),
      gpuType: z.enum(["h100_sxm", "a100_80gb", "rtx_4090"]).default("h100_sxm"),
      priorityOverrides: z.record(z.string(), z.number()).optional(), // characterId -> priority
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership of all characters
      const chars = await db.select()
        .from(characterLibrary)
        .where(and(
          inArray(characterLibrary.id, input.characterIds),
          eq(characterLibrary.userId, ctx.user.id)
        ));

      if (chars.length !== input.characterIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Some characters not found or not owned by you" });
      }

      // Check all have reference sheets
      const missingSheets = chars.filter(c => !c.referenceSheetUrl);
      if (missingSheets.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Characters missing reference sheets: ${missingSheets.map(c => c.name).join(", ")}`,
        });
      }

      // Skip characters already training
      const alreadyTraining = chars.filter(c => c.loraStatus === "training" || c.loraStatus === "validating");
      const toTrain = chars.filter(c => c.loraStatus !== "training" && c.loraStatus !== "validating");

      if (toTrain.length === 0) {
        return { batchId: null, jobs: [], skipped: alreadyTraining.map(c => c.name), estimate: null };
      }

      const batchId = generateBatchId();
      const jobs: Array<{ characterId: number; name: string; jobId: number; loraId: number; priority: number }> = [];

      for (const char of toTrain) {
        const priority = input.priorityOverrides?.[String(char.id)]
          ?? assignPriority("supporting"); // default priority

        // Determine next version
        const [maxVersion] = await db.select({ max: sql<number>`COALESCE(MAX(version), 0)` })
          .from(characterLoras)
          .where(eq(characterLoras.characterId, char.id));
        const nextVersion = (maxVersion?.max ?? 0) + 1;

        const triggerWord = buildTriggerWord(char.name);
        const artifactPath = getLoraArtifactPath(char.id, nextVersion);
        const fileSizeEstimate = estimateLoraFileSize(32);

        // Create LoRA record
        const [loraResult] = await db.insert(characterLoras).values({
          characterId: char.id,
          version: nextVersion,
          artifactPath,
          artifactSizeBytes: fileSizeEstimate.avgBytes,
          trainingParams: { rank: 32, alpha: 16, learningRate: 1e-4, trainingSteps: 800, baseModel: "Anything V5" },
          triggerWord,
          status: "training",
          validationStatus: "pending",
        });
        const loraId = (loraResult as any).insertId as number;

        // Create training job
        const estimate = estimateTrainingJob(input.gpuType, 800);
        const [jobResult] = await db.insert(loraTrainingJobs).values({
          characterId: char.id,
          loraId,
          userId: ctx.user.id,
          status: "queued",
          priority,
          batchId,
          gpuType: input.gpuType,
          costUsd: String(estimate.withMargin.costUsd),
          costCredits: String(estimate.withMargin.costCredits),
        });
        const jobId = (jobResult as any).insertId as number;

        // Update character status
        await db.update(characterLibrary)
          .set({ loraStatus: "training" })
          .where(eq(characterLibrary.id, char.id));

        jobs.push({ characterId: char.id, name: char.name, jobId, loraId, priority });
      }

      // Compute batch estimate
      const batchEstimate = estimateBatchTraining(
        toTrain.map(c => ({ name: c.name, role: "supporting" })),
        input.gpuType
      );

      return {
        batchId,
        jobs: jobs.sort((a, b) => a.priority - b.priority),
        skipped: alreadyTraining.map(c => c.name),
        estimate: {
          totalMinutes: batchEstimate.totalEstimatedMinutes,
          wallClockMinutes: batchEstimate.wallClockMinutes,
          totalCostUsd: batchEstimate.totalEstimatedCostUsd,
          totalCredits: batchEstimate.totalEstimatedCredits,
          characterCount: toTrain.length,
        },
      };
    }),

  // ── Get Training Status ───────────────────────────────────────────────
  getTrainingStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [job] = await db.select()
        .from(loraTrainingJobs)
        .where(and(eq(loraTrainingJobs.id, input.jobId), eq(loraTrainingJobs.userId, ctx.user.id)))
        .limit(1);

      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Training job not found" });

      // Get associated LoRA details
      let lora = null;
      if (job.loraId) {
        const [l] = await db.select()
          .from(characterLoras)
          .where(eq(characterLoras.id, job.loraId))
          .limit(1);
        lora = l || null;
      }

      return { job, lora };
    }),

  // ── Get Batch Status ──────────────────────────────────────────────────
  getBatchStatus: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const jobs = await db.select()
        .from(loraTrainingJobs)
        .where(and(eq(loraTrainingJobs.batchId, input.batchId), eq(loraTrainingJobs.userId, ctx.user.id)))
        .orderBy(asc(loraTrainingJobs.priority));

      // Enrich with character names
      const charIds = Array.from(new Set(jobs.map(j => j.characterId)));
      const chars = charIds.length > 0
        ? await db.select({ id: characterLibrary.id, name: characterLibrary.name, loraStatus: characterLibrary.loraStatus })
            .from(characterLibrary)
            .where(inArray(characterLibrary.id, charIds))
        : [];
      const charMap = new Map(chars.map(c => [c.id, c]));

      const enriched = jobs.map(j => ({
        ...j,
        characterName: charMap.get(j.characterId)?.name ?? "Unknown",
        characterLoraStatus: charMap.get(j.characterId)?.loraStatus ?? "unknown",
      }));

      const completed = jobs.filter(j => j.status === "completed").length;
      const failed = jobs.filter(j => j.status === "failed").length;
      const inProgress = jobs.filter(j => j.status === "training" || j.status === "preprocessing" || j.status === "validating").length;
      const queued = jobs.filter(j => j.status === "queued").length;

      return {
        batchId: input.batchId,
        jobs: enriched,
        summary: {
          total: jobs.length,
          completed,
          failed,
          inProgress,
          queued,
          progressPercent: jobs.length > 0 ? Math.round((completed / jobs.length) * 100) : 0,
        },
      };
    }),

  // ── Review LoRA (manual approve/reject) ───────────────────────────────
  reviewLora: protectedProcedure
    .input(z.object({
      loraId: z.number(),
      decision: z.enum(["approved", "rejected"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify the LoRA belongs to user's character
      const [lora] = await db.select()
        .from(characterLoras)
        .where(eq(characterLoras.id, input.loraId))
        .limit(1);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "LoRA not found" });

      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, lora.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "FORBIDDEN", message: "Not your character" });

      if (lora.validationStatus !== "validating" && lora.validationStatus !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot review LoRA in ${lora.validationStatus} state` });
      }

      if (input.decision === "approved") {
        // Deprecate old active LoRA
        if (char.activeLoraId && char.activeLoraId !== input.loraId) {
          await db.update(characterLoras)
            .set({ status: "deprecated", validationStatus: "deprecated", deprecatedAt: new Date() })
            .where(eq(characterLoras.id, char.activeLoraId));
        }

        // Activate new LoRA
        await db.update(characterLoras)
          .set({ status: "active", validationStatus: "approved" })
          .where(eq(characterLoras.id, input.loraId));

        await db.update(characterLibrary)
          .set({ loraStatus: "active", activeLoraId: input.loraId })
          .where(eq(characterLibrary.id, lora.characterId));
      } else {
        // Reject
        await db.update(characterLoras)
          .set({ status: "failed", validationStatus: "rejected" })
          .where(eq(characterLoras.id, input.loraId));

        await db.update(characterLibrary)
          .set({ loraStatus: "failed" })
          .where(eq(characterLibrary.id, lora.characterId));
      }

      return { loraId: input.loraId, decision: input.decision };
    }),

  // ── Version History ───────────────────────────────────────────────────
  getVersionHistory: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership
      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      const versions = await db.select()
        .from(characterLoras)
        .where(eq(characterLoras.characterId, input.characterId))
        .orderBy(desc(characterLoras.version));

      return versions.map(v => ({
        ...v,
        isActive: char.activeLoraId === v.id,
      }));
    }),

  // ── Rollback Version ──────────────────────────────────────────────────
  rollbackVersion: protectedProcedure
    .input(z.object({
      characterId: z.number(),
      loraId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      // Verify the target LoRA exists and was previously approved
      const [targetLora] = await db.select()
        .from(characterLoras)
        .where(and(
          eq(characterLoras.id, input.loraId),
          eq(characterLoras.characterId, input.characterId)
        ))
        .limit(1);
      if (!targetLora) throw new TRPCError({ code: "NOT_FOUND", message: "LoRA version not found" });
      if (targetLora.validationStatus !== "approved" && targetLora.validationStatus !== "deprecated") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only rollback to approved or deprecated versions" });
      }

      // Deprecate current active
      if (char.activeLoraId && char.activeLoraId !== input.loraId) {
        await db.update(characterLoras)
          .set({ status: "deprecated", deprecatedAt: new Date() })
          .where(eq(characterLoras.id, char.activeLoraId));
      }

      // Reactivate target
      await db.update(characterLoras)
        .set({ status: "active", validationStatus: "approved", deprecatedAt: null })
        .where(eq(characterLoras.id, input.loraId));

      await db.update(characterLibrary)
        .set({ loraStatus: "active", activeLoraId: input.loraId })
        .where(eq(characterLibrary.id, input.characterId));

      return { rolledBackTo: input.loraId, version: targetLora.version };
    }),

  // ── Get Assets ────────────────────────────────────────────────────────
  getAssets: protectedProcedure
    .input(z.object({
      characterId: z.number(),
      assetType: z.enum(["reference_sheet", "reference_image", "lora", "ip_adapter_embedding", "clip_embedding"]).optional(),
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify ownership
      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      const filters = [eq(characterAssets.characterId, input.characterId)];
      if (input.assetType) filters.push(eq(characterAssets.assetType, input.assetType));
      if (input.activeOnly) filters.push(eq(characterAssets.isActive, 1));

      return db.select()
        .from(characterAssets)
        .where(and(...filters))
        .orderBy(desc(characterAssets.createdAt));
    }),

  // ── Usage Stats ───────────────────────────────────────────────────────
  getUsageStats: protectedProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { generationCount: 0, episodeCount: 0, avgQualityScore: 0 };

      // Verify ownership
      const [char] = await db.select()
        .from(characterLibrary)
        .where(and(eq(characterLibrary.id, input.characterId), eq(characterLibrary.userId, ctx.user.id)))
        .limit(1);
      if (!char) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });

      // Count generations using this character
      const [genCount] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(generationRequests)
        .where(eq((generationRequests as any).characterId, input.characterId));

      // Average quality score across all LoRA versions
      const [avgScore] = await db.select({ avg: sql<number>`COALESCE(AVG(qualityScore), 0)` })
        .from(characterLoras)
        .where(and(
          eq(characterLoras.characterId, input.characterId),
          sql`qualityScore IS NOT NULL`
        ));

      // Count pipeline runs that pinned this character
      const [pinCount] = await db.select({ count: sql<number>`COUNT(DISTINCT pipelineRunId)` })
        .from(pipelineRunLoraPins)
        .where(eq(pipelineRunLoraPins.characterId, input.characterId));

      return {
        generationCount: genCount?.count ?? 0,
        episodeCount: pinCount?.count ?? 0,
        avgQualityScore: Math.round(avgScore?.avg ?? 0),
        usageCount: char.usageCount,
      };
    }),

  // ── Get Training Estimate ─────────────────────────────────────────────
  getTrainingEstimate: protectedProcedure
    .input(z.object({
      gpuType: z.enum(["h100_sxm", "a100_80gb", "rtx_4090"]).default("h100_sxm"),
      rank: z.number().min(16).max(64).default(32),
      trainingSteps: z.number().min(500).max(1500).default(800),
    }))
    .query(({ input }) => {
      const estimate = estimateTrainingJob(input.gpuType, input.trainingSteps);
      const fileSize = estimateLoraFileSize(input.rank);
      return { ...estimate, fileSize };
    }),

  // ── Get Batch Training Estimate ───────────────────────────────────────
  getBatchEstimate: protectedProcedure
    .input(z.object({
      characterIds: z.array(z.number()).min(1).max(20),
      gpuType: z.enum(["h100_sxm", "a100_80gb", "rtx_4090"]).default("h100_sxm"),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const chars = await db.select({ id: characterLibrary.id, name: characterLibrary.name })
        .from(characterLibrary)
        .where(and(
          inArray(characterLibrary.id, input.characterIds),
          eq(characterLibrary.userId, ctx.user.id)
        ));

      return estimateBatchTraining(
        chars.map(c => ({ name: c.name, role: "supporting" })),
        input.gpuType
      );
    }),

  // ── Preview Extraction ────────────────────────────────────────────────
  previewExtraction: protectedProcedure
    .input(z.object({
      referenceSheetUrl: z.string().url(),
      characterName: z.string().min(1).max(100),
    }))
    .query(({ input }) => {
      return previewExtraction(input.referenceSheetUrl, input.characterName);
    }),
});
