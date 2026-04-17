/**
 * Prompt 22 — Lineart Pipeline tRPC Router
 *
 * Endpoints for lineart extraction, batch processing, ControlNet config,
 * structural fidelity measurement, and test image generation.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { lineartAssets, controlnetConfigs, lineartBatchJobs } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

import {
  runExtractionPipeline,
  type ExtractionMethod,
  type TargetResolution,
} from "./lineart-extraction";

import {
  SCENE_TYPE_DEFAULTS,
  ALL_SCENE_TYPES,
  buildTestImageRequest,
  simulateTestImageResult,
  getStrengthLabel,
  getStrengthDescription,
  clampStrength,
  MODE_DESCRIPTIONS,
  STRENGTH_RANGES,
  INTEGRATION_RULES,
  type SceneType,
  type ControlnetMode,
  type ConditioningConfig,
} from "./controlnet-conditioning";

import {
  buildBatchJobSpec,
  simulateBatchExecution,
  formatBatchDuration,
  getBatchMethodSummary,
  type BatchExtractionMethod,
  type BatchPanelInput,
} from "./lineart-batch";

import {
  measureFidelity,
  measureBatchFidelity,
} from "./structural-fidelity";

// ─── Shared Zod Schemas ─────────────────────────────────────────────────

const extractionMethodSchema = z.enum(["canny", "anime2sketch"]);
const controlnetModeSchema = z.enum(["canny", "lineart", "lineart_anime", "depth"]);
const sceneTypeSchema = z.enum(["dialogue", "action", "establishing", "reaction", "montage", "transition"]);
const batchMethodSchema = z.enum(["canny", "anime2sketch", "mixed"]);

// ─── Router ─────────────────────────────────────────────────────────────

export const lineartPipelineRouter = router({

  // ── Single Panel Extraction ─────────────────────────────────────────
  extractLineart: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      sceneId: z.number().optional(),
      panelIndex: z.number(),
      sourcePanelUrl: z.string(),
      method: extractionMethodSchema.optional(),
      targetResolution: z.number().optional(),
      pageWidth: z.number().optional(),
      pageHeight: z.number().optional(),
      totalPanelsOnPage: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const method: ExtractionMethod = input.method ?? "anime2sketch";
      const targetRes = input.targetResolution as TargetResolution | undefined;

      const result = runExtractionPipeline(
        input.sourcePanelUrl,
        input.panelIndex,
        method,
        input.pageWidth,
        input.pageHeight,
        input.totalPanelsOnPage,
        targetRes,
      );

      if (db) {
        const [inserted] = await db.insert(lineartAssets).values({
          episodeId: input.episodeId,
          sceneId: input.sceneId ?? null,
          panelIndex: input.panelIndex,
          extractionMethod: method,
          storageUrl: result.storageUrl,
          sourcePanelUrl: result.sourcePanelUrl,
          resolutionW: result.resolutionW,
          resolutionH: result.resolutionH,
          snrDb: result.snrDb,
        });

        return { id: Number(inserted.insertId), ...result };
      }

      return { id: 0, ...result };
    }),

  // ── Batch Extraction ────────────────────────────────────────────────
  batchExtract: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      panels: z.array(z.object({
        panelIndex: z.number(),
        sourcePanelUrl: z.string(),
        sceneType: z.string().optional(),
        pageWidth: z.number().optional(),
        pageHeight: z.number().optional(),
        totalPanelsOnPage: z.number().optional(),
      })),
      method: batchMethodSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const batchMethod: BatchExtractionMethod = input.method ?? "mixed";
      const panelInputs: BatchPanelInput[] = input.panels;

      const spec = buildBatchJobSpec(input.episodeId, panelInputs, batchMethod);
      const methodSummary = getBatchMethodSummary(spec.panels);

      let batchJobId = 0;

      if (db) {
        const [batchInsert] = await db.insert(lineartBatchJobs).values({
          episodeId: input.episodeId,
          totalPanels: spec.totalPanels,
          extractionMethod: batchMethod,
          costCredits: spec.estimatedCostUsd,
        });
        batchJobId = Number(batchInsert.insertId);

        await db.update(lineartBatchJobs)
          .set({ status: "running", startedAt: new Date() })
          .where(eq(lineartBatchJobs.id, batchJobId));
      }

      const progress = simulateBatchExecution(spec);
      progress.jobId = batchJobId;

      if (db) {
        const completedResults = progress.results.filter(r => r.status === "completed" && r.result);
        for (const r of completedResults) {
          if (!r.result) continue;
          await db.insert(lineartAssets).values({
            episodeId: input.episodeId,
            panelIndex: r.panelIndex,
            extractionMethod: r.result.method,
            storageUrl: r.result.storageUrl,
            sourcePanelUrl: r.result.sourcePanelUrl,
            resolutionW: r.result.resolutionW,
            resolutionH: r.result.resolutionH,
            snrDb: r.result.snrDb,
          });
        }

        await db.update(lineartBatchJobs)
          .set({
            status: progress.status,
            completedPanels: progress.completedPanels,
            failedPanels: progress.failedPanels,
            completedAt: new Date(),
            costCredits: progress.costSoFar,
            errorLog: progress.errorLog.length > 0 ? progress.errorLog : null,
          })
          .where(eq(lineartBatchJobs.id, batchJobId));
      }

      return {
        ...progress,
        jobId: batchJobId,
        methodSummary,
        estimatedTime: formatBatchDuration(spec.estimatedTimeMs),
        estimatedCost: spec.estimatedCostUsd,
      };
    }),

  // ── Batch Status ────────────────────────────────────────────────────
  getBatchStatus: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [job] = await db.select().from(lineartBatchJobs)
        .where(eq(lineartBatchJobs.id, input.jobId))
        .limit(1);

      if (!job) return null;

      const progressPercent = job.totalPanels > 0
        ? Math.round(((job.completedPanels + job.failedPanels) / job.totalPanels) * 100)
        : 0;

      return {
        ...job,
        progressPercent,
        errorLog: (job.errorLog as Array<{ panelIndex: number; errorMessage: string }>) ?? [],
      };
    }),

  // ── List Lineart Assets ─────────────────────────────────────────────
  getLineartAssets: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      sceneId: z.number().optional(),
      activeOnly: z.boolean().optional().default(true),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(lineartAssets.episodeId, input.episodeId)];
      if (input.sceneId !== undefined) {
        conditions.push(eq(lineartAssets.sceneId, input.sceneId));
      }
      if (input.activeOnly) {
        conditions.push(eq(lineartAssets.isActive, 1));
      }

      const assets = await db.select().from(lineartAssets)
        .where(and(...conditions))
        .orderBy(lineartAssets.panelIndex);

      return assets;
    }),

  // ── Get Single Lineart Asset ────────────────────────────────────────
  getLineartAsset: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [asset] = await db.select().from(lineartAssets)
        .where(eq(lineartAssets.id, input.id))
        .limit(1);
      return asset ?? null;
    }),

  // ── Re-Extract (new version) ────────────────────────────────────────
  reExtract: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      newMethod: extractionMethodSchema,
      targetResolution: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db.select().from(lineartAssets)
        .where(eq(lineartAssets.id, input.assetId))
        .limit(1);

      if (!existing) throw new Error("Lineart asset not found");

      await db.update(lineartAssets)
        .set({ isActive: 0 })
        .where(eq(lineartAssets.id, input.assetId));

      const result = runExtractionPipeline(
        existing.sourcePanelUrl,
        existing.panelIndex,
        input.newMethod,
        undefined, undefined, undefined,
        input.targetResolution as TargetResolution | undefined,
      );

      const [inserted] = await db.insert(lineartAssets).values({
        episodeId: existing.episodeId,
        sceneId: existing.sceneId,
        panelIndex: existing.panelIndex,
        extractionMethod: input.newMethod,
        storageUrl: result.storageUrl,
        sourcePanelUrl: existing.sourcePanelUrl,
        resolutionW: result.resolutionW,
        resolutionH: result.resolutionH,
        version: existing.version + 1,
        snrDb: result.snrDb,
      });

      return {
        id: Number(inserted.insertId),
        previousVersion: existing.version,
        newVersion: existing.version + 1,
        ...result,
      };
    }),

  // ── ControlNet Config: Get ──────────────────────────────────────────
  getControlnetConfig: protectedProcedure
    .input(z.object({
      sceneType: sceneTypeSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();

      if (input.sceneType) {
        if (db) {
          const [config] = await db.select().from(controlnetConfigs)
            .where(and(
              eq(controlnetConfigs.userId, ctx.user.id),
              eq(controlnetConfigs.sceneType, input.sceneType),
              eq(controlnetConfigs.isDefault, 1),
            ))
            .limit(1);

          if (config) {
            return {
              ...config,
              isCustom: true,
              strengthLabel: getStrengthLabel(config.conditioningStrength),
              strengthDescription: getStrengthDescription(config.conditioningStrength),
              modeDescription: MODE_DESCRIPTIONS[config.controlnetMode as ControlnetMode],
            };
          }
        }

        const defaultConfig = SCENE_TYPE_DEFAULTS[input.sceneType as SceneType];
        return {
          id: null,
          userId: ctx.user.id,
          ...defaultConfig,
          isDefault: 1,
          isCustom: false,
          strengthLabel: getStrengthLabel(defaultConfig.conditioningStrength),
          strengthDescription: getStrengthDescription(defaultConfig.conditioningStrength),
          modeDescription: MODE_DESCRIPTIONS[defaultConfig.controlnetMode],
        };
      }

      // Get all configs for user
      const userConfigs: any[] = db
        ? await db.select().from(controlnetConfigs)
            .where(and(
              eq(controlnetConfigs.userId, ctx.user.id),
              eq(controlnetConfigs.isDefault, 1),
            ))
        : [];

      return ALL_SCENE_TYPES.map((st: SceneType) => {
        const userConfig = userConfigs.find((c: any) => c.sceneType === st);
        if (userConfig) {
          return {
            ...userConfig,
            isCustom: true,
            strengthLabel: getStrengthLabel(userConfig.conditioningStrength),
            strengthDescription: getStrengthDescription(userConfig.conditioningStrength),
            modeDescription: MODE_DESCRIPTIONS[userConfig.controlnetMode as ControlnetMode],
          };
        }
        const defaultConfig = SCENE_TYPE_DEFAULTS[st];
        return {
          id: null,
          userId: ctx.user.id,
          ...defaultConfig,
          isDefault: 1,
          isCustom: false,
          strengthLabel: getStrengthLabel(defaultConfig.conditioningStrength),
          strengthDescription: getStrengthDescription(defaultConfig.conditioningStrength),
          modeDescription: MODE_DESCRIPTIONS[defaultConfig.controlnetMode],
        };
      });
    }),

  // ── ControlNet Config: Update ───────────────────────────────────────
  updateControlnetConfig: protectedProcedure
    .input(z.object({
      sceneType: sceneTypeSchema,
      controlnetMode: controlnetModeSchema.optional(),
      conditioningStrength: z.number().min(0).max(1).optional(),
      extractionMethod: extractionMethodSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [existing] = await db.select().from(controlnetConfigs)
        .where(and(
          eq(controlnetConfigs.userId, ctx.user.id),
          eq(controlnetConfigs.sceneType, input.sceneType),
          eq(controlnetConfigs.isDefault, 1),
        ))
        .limit(1);

      const defaults = SCENE_TYPE_DEFAULTS[input.sceneType as SceneType];
      const strength = input.conditioningStrength !== undefined
        ? clampStrength(input.conditioningStrength)
        : (existing?.conditioningStrength ?? defaults.conditioningStrength);
      const mode = input.controlnetMode ?? existing?.controlnetMode ?? defaults.controlnetMode;
      const method = input.extractionMethod ?? existing?.extractionMethod ?? defaults.extractionMethod;

      if (existing) {
        await db.update(controlnetConfigs)
          .set({
            controlnetMode: mode,
            conditioningStrength: strength,
            extractionMethod: method,
          })
          .where(eq(controlnetConfigs.id, existing.id));

        return {
          id: existing.id,
          sceneType: input.sceneType,
          controlnetMode: mode,
          conditioningStrength: strength,
          extractionMethod: method,
          strengthLabel: getStrengthLabel(strength),
          updated: true,
        };
      }

      const [inserted] = await db.insert(controlnetConfigs).values({
        userId: ctx.user.id,
        sceneType: input.sceneType,
        controlnetMode: mode,
        conditioningStrength: strength,
        extractionMethod: method,
      });

      return {
        id: Number(inserted.insertId),
        sceneType: input.sceneType,
        controlnetMode: mode,
        conditioningStrength: strength,
        extractionMethod: method,
        strengthLabel: getStrengthLabel(strength),
        updated: false,
        created: true,
      };
    }),

  // ── ControlNet Config: Reset to Defaults ────────────────────────────
  resetControlnetConfig: protectedProcedure
    .input(z.object({
      sceneType: sceneTypeSchema.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      if (input.sceneType) {
        await db.delete(controlnetConfigs)
          .where(and(
            eq(controlnetConfigs.userId, ctx.user.id),
            eq(controlnetConfigs.sceneType, input.sceneType),
          ));
        return { reset: [input.sceneType] };
      }

      await db.delete(controlnetConfigs)
        .where(eq(controlnetConfigs.userId, ctx.user.id));
      return { reset: [...ALL_SCENE_TYPES] };
    }),

  // ── Test Image Generation ───────────────────────────────────────────
  generateTestImage: protectedProcedure
    .input(z.object({
      controlImageUrl: z.string(),
      sceneType: sceneTypeSchema,
      prompt: z.string().optional(),
      conditioningStrength: z.number().min(0).max(1).optional(),
      controlnetMode: controlnetModeSchema.optional(),
      seed: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const defaults = SCENE_TYPE_DEFAULTS[input.sceneType as SceneType];
      const config: ConditioningConfig = {
        sceneType: input.sceneType as SceneType,
        controlnetMode: input.controlnetMode ?? defaults.controlnetMode,
        conditioningStrength: input.conditioningStrength ?? defaults.conditioningStrength,
        extractionMethod: defaults.extractionMethod,
      };

      const prompt = input.prompt ?? `Anime scene, ${input.sceneType} shot, high quality, detailed`;
      const request = buildTestImageRequest(input.controlImageUrl, config, prompt, input.seed);
      const result = simulateTestImageResult(request);

      return {
        ...result,
        strengthLabel: getStrengthLabel(config.conditioningStrength),
        modeLabel: MODE_DESCRIPTIONS[config.controlnetMode].label,
      };
    }),

  // ── Structural Fidelity Measurement ─────────────────────────────────
  measureFidelity: protectedProcedure
    .input(z.object({
      panelIndex: z.number(),
      conditioningStrength: z.number(),
      controlnetMode: z.string(),
      edgeDensity: z.number().optional(),
    }))
    .query(({ input }) => {
      return measureFidelity(
        input.panelIndex,
        input.conditioningStrength,
        input.controlnetMode,
        input.edgeDensity,
      );
    }),

  // ── Batch Fidelity Measurement ──────────────────────────────────────
  measureBatchFidelity: protectedProcedure
    .input(z.object({
      panels: z.array(z.object({
        panelIndex: z.number(),
        conditioningStrength: z.number(),
        controlnetMode: z.string(),
        edgeDensity: z.number().optional(),
      })),
    }))
    .query(({ input }) => {
      return measureBatchFidelity(input.panels);
    }),

  // ── Pipeline Stats ──────────────────────────────────────────────────
  getPipelineStats: protectedProcedure
    .input(z.object({ episodeId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();

      let batchJobs: any[] = [];
      let assets: any[] = [];

      if (db) {
        batchJobs = input.episodeId
          ? await db.select().from(lineartBatchJobs)
              .where(eq(lineartBatchJobs.episodeId, input.episodeId))
              .orderBy(desc(lineartBatchJobs.createdAt))
          : await db.select().from(lineartBatchJobs)
              .orderBy(desc(lineartBatchJobs.createdAt));

        assets = input.episodeId
          ? await db.select().from(lineartAssets)
              .where(eq(lineartAssets.episodeId, input.episodeId))
          : await db.select().from(lineartAssets);
      }

      const activeAssets = assets.filter((a: any) => a.isActive === 1);
      const totalBatches = batchJobs.length;
      const completedBatches = batchJobs.filter((j: any) => j.status === "completed").length;
      const failedBatches = batchJobs.filter((j: any) => j.status === "failed").length;
      const totalCost = batchJobs.reduce((sum: number, j: any) => sum + (j.costCredits ?? 0), 0);
      const totalPanelsExtracted = activeAssets.length;

      const cannyAssets = activeAssets.filter((a: any) => a.extractionMethod === "canny").length;
      const anime2sketchAssets = activeAssets.filter((a: any) => a.extractionMethod === "anime2sketch").length;

      const avgSnr = activeAssets.length > 0
        ? activeAssets.reduce((sum: number, a: any) => sum + (a.snrDb ?? 0), 0) / activeAssets.length
        : 0;

      return {
        totalBatches,
        completedBatches,
        failedBatches,
        totalCost: Math.round(totalCost * 100) / 100,
        totalPanelsExtracted,
        cannyAssets,
        anime2sketchAssets,
        avgSnr: Math.round(avgSnr * 100) / 100,
        recentBatches: batchJobs.slice(0, 5),
        strengthRanges: STRENGTH_RANGES,
        modeDescriptions: MODE_DESCRIPTIONS,
        integrationRules: INTEGRATION_RULES,
        sceneTypeDefaults: SCENE_TYPE_DEFAULTS,
      };
    }),

  // ── List Batch Jobs ─────────────────────────────────────────────────
  getBatchJobs: protectedProcedure
    .input(z.object({
      episodeId: z.number().optional(),
      limit: z.number().optional().default(20),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const jobs = input.episodeId
        ? await db.select().from(lineartBatchJobs)
            .where(eq(lineartBatchJobs.episodeId, input.episodeId))
            .orderBy(desc(lineartBatchJobs.createdAt))
            .limit(input.limit)
        : await db.select().from(lineartBatchJobs)
            .orderBy(desc(lineartBatchJobs.createdAt))
            .limit(input.limit);

      return jobs.map((j: any) => ({
        ...j,
        progressPercent: j.totalPanels > 0
          ? Math.round(((j.completedPanels + j.failedPanels) / j.totalPanels) * 100)
          : 0,
        errorLog: (j.errorLog as Array<{ panelIndex: number; errorMessage: string }>) ?? [],
      }));
    }),
});
