/**
 * Script Cost Advisor & Scene-Type Optimizer — tRPC Router
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import {
  analyzeScriptCost,
  estimateEpisodeCost,
} from "./script-cost-advisor";
import {
  optimizeSceneTypes,
  recordSuggestionOutcome,
  getAcceptanceRates,
  type SceneInput,
} from "./scene-type-optimizer";
import type { SceneType } from "../drizzle/schema";

const sceneTypeEnum = z.enum([
  "action", "dialogue", "establishing", "reaction", "transition", "montage",
]);

export const costOptimizerRouter = router({
  /** Analyze script text and return per-scene cost breakdown with heatmap. */
  analyzeScript: protectedProcedure
    .input(z.object({
      scriptText: z.string().min(10).max(50000),
    }))
    .mutation(async ({ input }) => {
      return analyzeScriptCost(input.scriptText);
    }),

  /** Estimate full episode cost from scene analyses. */
  estimateEpisode: protectedProcedure
    .input(z.object({
      scenes: z.array(z.object({
        sceneIndex: z.number(),
        sceneText: z.string(),
        estimatedSceneType: sceneTypeEnum,
        estimatedCost: z.number(),
        costLevel: z.enum(["low", "medium", "high"]),
        heatmapColor: z.string(),
        panelCount: z.number(),
        hasDialogue: z.boolean(),
        hasAction: z.boolean(),
        hasSfx: z.boolean(),
      })),
    }))
    .query(({ input }) => {
      return estimateEpisodeCost(input.scenes);
    }),

  /** Get optimization suggestions for classified scenes. */
  getSuggestions: protectedProcedure
    .input(z.object({
      scenes: z.array(z.object({
        sceneId: z.number(),
        sceneType: sceneTypeEnum,
        description: z.string(),
        panelCount: z.number(),
        motionIntensity: z.number().min(0).max(1).optional(),
        dialogueDensity: z.number().min(0).max(1).optional(),
        characterCount: z.number().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      return optimizeSceneTypes(input.scenes as SceneInput[]);
    }),

  /** Record whether a suggestion was accepted or rejected. */
  recordOutcome: protectedProcedure
    .input(z.object({
      currentType: sceneTypeEnum,
      suggestedType: sceneTypeEnum,
      accepted: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      recordSuggestionOutcome(
        input.currentType as SceneType,
        input.suggestedType as SceneType,
        input.accepted,
      );
      return { success: true };
    }),

  /** Get acceptance rates for all suggestion types. */
  acceptanceRates: protectedProcedure
    .query(async () => {
      return getAcceptanceRates();
    }),
});
