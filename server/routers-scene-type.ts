/**
 * Scene-Type Router — tRPC endpoints for Prompt 20 Scene-Type classification,
 * cost forecast, pipeline config, and creator overrides.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  classifySceneType,
  classifyEpisodeScenes,
  extractSceneMetadata,
  SCENE_TYPE_TO_TEMPLATE,
} from "./scene-type-router/scene-type-classifier";
import type { SceneMetadata, PanelData, SceneWithPanels } from "./scene-type-router/scene-type-classifier";
import {
  getProviderHintForSceneType,
  getPipelineStageSkips,
  CREDITS_PER_10S,
  generateCostForecast,
  getAllPipelineConfigs,
} from "./scene-type-router/router-integration";
import type { SceneTypeDistribution } from "./scene-type-router/router-integration";
import {
  getTemplateById,
  getTemplateForSceneType,
  ALL_PIPELINE_TEMPLATES,
} from "./scene-type-router/pipeline-templates";
import { getDb } from "./db";
import { sceneClassifications, sceneTypeOverrides, pipelineTemplates } from "../drizzle/schema";
import type { SceneType } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

const SCENE_TYPES = ["dialogue", "action", "establishing", "transition", "reaction", "montage"] as const;

export const sceneTypeRouter = router({
  /**
   * Classify a single scene from its metadata.
   * Preview only — no database side effects.
   */
  classifyScene: protectedProcedure
    .input(z.object({
      panelCount: z.number().min(0),
      hasDialogue: z.boolean(),
      dialogueLineCount: z.number().min(0).default(0),
      characterCount: z.number().min(0).default(0),
      motionIntensity: z.enum(["none", "low", "medium", "high"]).default("none"),
      isExterior: z.boolean().default(false),
      hasActionLines: z.boolean().default(false),
      isCloseUp: z.boolean().default(false),
      panelSizePct: z.number().min(0).max(100).default(50),
      previousSceneType: z.enum(SCENE_TYPES).optional(),
      narrativeTag: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const meta: SceneMetadata = input;
      const result = classifySceneType(meta);

      const hints = getProviderHintForSceneType(result.sceneType);
      const stageSkips = getPipelineStageSkips(result.sceneType);
      const creditsPerTenS = CREDITS_PER_10S[result.sceneType];

      return {
        ...result,
        providerHints: hints,
        stageSkips,
        creditsPerTenS,
      };
    }),

  /**
   * Batch classify all scenes in an episode.
   * Returns per-scene classification + aggregate cost forecast.
   */
  classifyEpisode: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      scenes: z.array(z.object({
        sceneId: z.number(),
        sceneNumber: z.number(),
        panels: z.array(z.object({
          panelId: z.number(),
          visualDescription: z.string().default(""),
          cameraAngle: z.string().optional(),
          dialogue: z.array(z.object({
            character: z.string().optional(),
            text: z.string(),
          })).default([]),
          panelSizePct: z.number().default(50),
        })),
        estimatedDurationS: z.number().default(10),
      })),
      reactionCacheHitRate: z.number().min(0).max(1).default(0.5),
    }))
    .mutation(async ({ input }) => {
      const { episodeId, scenes, reactionCacheHitRate } = input;

      // Convert input to SceneWithPanels format
      const sceneDataList: SceneWithPanels[] = scenes.map((s, idx) => ({
        scene: {
          id: s.sceneId,
          sceneNumber: s.sceneNumber,
          location: null,
          timeOfDay: null,
          mood: null,
        },
        panels: s.panels.map((p, pi) => ({
          id: p.panelId,
          sceneNumber: s.sceneNumber,
          panelNumber: pi + 1,
          visualDescription: p.visualDescription || null,
          cameraAngle: p.cameraAngle || null,
          dialogue: p.dialogue.length > 0 ? p.dialogue : null,
          sfx: null,
          transition: null,
        })),
      }));

      // Classify all scenes
      const classifications = classifyEpisodeScenes(sceneDataList);

      // Build per-scene results with provider hints
      const perScene = classifications.map((c, i) => {
        const scene = scenes[i];
        const hints = getProviderHintForSceneType(c.sceneType);
        const stageSkips = getPipelineStageSkips(c.sceneType);
        const creditsPerTenS = CREDITS_PER_10S[c.sceneType];
        const estimatedCredits = (scene.estimatedDurationS / 10) * creditsPerTenS;

        return {
          sceneId: scene.sceneId,
          sceneNumber: scene.sceneNumber,
          panelCount: scene.panels.length,
          estimatedDurationS: scene.estimatedDurationS,
          sceneType: c.sceneType,
          confidence: c.confidence,
          pipelineTemplate: c.pipelineTemplate,
          matchedRule: c.matchedRule,
          providerHints: hints,
          stageSkips: stageSkips.skippedStages,
          replacedStages: stageSkips.replacedStages,
          stageExplanation: stageSkips.explanation,
          creditsPerTenS,
          estimatedCredits: Math.round(estimatedCredits * 10000) / 10000,
        };
      });

      // Build distribution for cost forecast
      const distMap = new Map<SceneType, { count: number; totalDurationS: number }>();
      for (let i = 0; i < perScene.length; i++) {
        const ps = perScene[i];
        const scene = scenes[i];
        const existing = distMap.get(ps.sceneType) || { count: 0, totalDurationS: 0 };
        existing.count++;
        existing.totalDurationS += scene.estimatedDurationS;
        distMap.set(ps.sceneType, existing);
      }

      const distribution: SceneTypeDistribution[] = Array.from(distMap.entries()).map(
        ([sceneType, data]) => ({
          sceneType,
          count: data.count,
          totalDurationS: data.totalDurationS,
        })
      );

      const forecast = generateCostForecast(distribution, reactionCacheHitRate);

      return {
        episodeId,
        totalScenes: perScene.length,
        perScene,
        forecast,
        distribution: distribution.map(d => ({
          sceneType: d.sceneType,
          count: d.count,
          totalDurationS: d.totalDurationS,
          percentage: Math.round((d.count / perScene.length) * 100),
        })),
      };
    }),

  /**
   * Override a scene's classification.
   * Stores the override in the database and returns the new pipeline config.
   */
  overrideSceneType: protectedProcedure
    .input(z.object({
      sceneClassificationId: z.number(),
      newSceneType: z.enum(SCENE_TYPES),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get the original classification
      const [original] = await db
        .select()
        .from(sceneClassifications)
        .where(eq(sceneClassifications.id, input.sceneClassificationId))
        .limit(1);

      if (!original) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Scene classification not found" });
      }

      // Insert override record
      await db.insert(sceneTypeOverrides).values({
        sceneClassificationId: input.sceneClassificationId,
        originalType: original.sceneType,
        overriddenType: input.newSceneType,
        userId: ctx.user.id,
        reason: input.reason,
      });

      // Update the classification record
      await db
        .update(sceneClassifications)
        .set({
          sceneType: input.newSceneType as any,
          creatorOverride: input.newSceneType as any,
          pipelineTemplate: SCENE_TYPE_TO_TEMPLATE[input.newSceneType],
        })
        .where(eq(sceneClassifications.id, input.sceneClassificationId));

      // Return new pipeline config
      const hints = getProviderHintForSceneType(input.newSceneType);
      const stageSkips = getPipelineStageSkips(input.newSceneType);

      return {
        success: true,
        sceneClassificationId: input.sceneClassificationId,
        originalType: original.sceneType,
        newType: input.newSceneType,
        pipelineTemplate: SCENE_TYPE_TO_TEMPLATE[input.newSceneType],
        providerHints: hints,
        stageSkips,
        creditsPerTenS: CREDITS_PER_10S[input.newSceneType],
      };
    }),

  /**
   * Get scene classifications for an episode.
   */
  getEpisodeClassifications: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(sceneClassifications)
        .where(eq(sceneClassifications.episodeId, input.episodeId))
        .orderBy(sceneClassifications.sceneId);

      return rows.map(r => ({
        id: r.id,
        episodeId: r.episodeId,
        sceneId: r.sceneId,
        sceneType: r.sceneType,
        classifierVersion: r.classifierVersion,
        confidence: r.confidence,
        metadata: r.metadata,
        creatorOverride: !!r.creatorOverride,
        pipelineTemplate: r.pipelineTemplate,
        createdAt: r.createdAt,
      }));
    }),

  /**
   * Get override history for a scene classification.
   */
  getOverrideHistory: protectedProcedure
    .input(z.object({ sceneClassificationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(sceneTypeOverrides)
        .where(eq(sceneTypeOverrides.sceneClassificationId, input.sceneClassificationId))
        .orderBy(desc(sceneTypeOverrides.createdAt));

      return rows.map(r => ({
        id: r.id,
        originalType: r.originalType,
        overriddenType: r.overriddenType,
        userId: r.userId,
        reason: r.reason,
        createdAt: r.createdAt,
      }));
    }),

  /**
   * Get cost forecast for an episode based on scene-type distribution.
   * Standalone endpoint for the cost forecast panel.
   */
  getCostForecast: protectedProcedure
    .input(z.object({
      distribution: z.array(z.object({
        sceneType: z.enum(SCENE_TYPES),
        count: z.number().min(0),
        totalDurationS: z.number().min(0),
      })),
      reactionCacheHitRate: z.number().min(0).max(1).default(0.5),
    }))
    .query(({ input }) => {
      return generateCostForecast(input.distribution, input.reactionCacheHitRate);
    }),

  /**
   * Get all pipeline configurations (for admin/display).
   */
  getAllPipelineConfigs: protectedProcedure
    .query(() => {
      return {
        configs: getAllPipelineConfigs(),
        templates: ALL_PIPELINE_TEMPLATES.map(t => ({
          id: t.id,
          sceneType: t.sceneType,
          displayName: t.displayName,
          estimatedCreditsPerTenS: t.estimatedCreditsPerTenS,
          stageCount: t.stages.length,
          skipStages: t.skipStages,
        })),
        creditsPerTenS: { ...CREDITS_PER_10S },
      };
    }),

  /**
   * Seed pipeline templates into the database.
   */
  seedTemplates: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      let seeded = 0;
      for (const t of ALL_PIPELINE_TEMPLATES) {
        try {
          await db.insert(pipelineTemplates).values({
            id: t.id,
            sceneType: t.sceneType,
            displayName: t.displayName,
            stages: JSON.stringify(t.stages),
            preferredProviders: JSON.stringify(t.preferredProviders),
            skipStages: JSON.stringify(t.skipStages),
            estimatedCreditsPerTenS: t.estimatedCreditsPerTenS.toString(),
            // isActive defaults to 1 in schema
          });
          seeded++;
        } catch {
          // Already exists — skip (idempotent)
        }
      }

      return { success: true, seeded, total: ALL_PIPELINE_TEMPLATES.length };
    }),
});
