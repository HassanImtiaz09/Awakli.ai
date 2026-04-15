/**
 * Model Routing Router — tRPC endpoints for the Smart Kling Model Router.
 *
 * Provides:
 *   - classifyPanel: classify a single panel (preview, no side effects)
 *   - getRoutingStats: get model routing stats for an episode or pipeline run
 *   - getRoutingBreakdown: get per-panel routing details for a pipeline run
 *   - overrideModel: force a specific model for a panel (user override)
 *   - getCostComparison: compare actual cost vs V3-Omni-only cost
 *   - getModelInfo: get available model tiers and pricing
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  classifyScene,
  calculateCost,
  calculateV3OmniCost,
  MODEL_MAP,
  type PanelScriptData,
} from "./scene-classifier";
import {
  getModelRoutingStatsByEpisode,
  getModelRoutingStatsByRun,
  getRoutingDataByRun,
  updatePipelineAssetRouting,
} from "./db";

export const modelRoutingRouter = router({
  /**
   * Classify a single panel — preview only, no database side effects.
   * Useful for the UI to show what model would be selected.
   */
  classifyPanel: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      visualDescription: z.string(),
      cameraAngle: z.string().optional(),
      dialogue: z.array(z.object({
        character: z.string().optional(),
        text: z.string(),
        emotion: z.string().optional(),
      })).optional(),
      mood: z.string().optional(),
      sceneType: z.string().optional(),
      animationStyle: z.string().optional(),
      characterCount: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const panelData: PanelScriptData = {
        panelId: input.panelId,
        visualDescription: input.visualDescription,
        cameraAngle: input.cameraAngle,
        dialogue: input.dialogue,
        mood: input.mood,
        sceneType: input.sceneType,
        animationStyle: input.animationStyle,
        characterCount: input.characterCount,
      };

      const classification = await classifyScene(panelData);

      return {
        tier: classification.tier,
        model: classification.model,
        modelName: classification.modelName,
        reasoning: classification.reasoning,
        hasDialogue: classification.hasDialogue,
        faceVisible: classification.faceVisible,
        lipSyncNeeded: classification.lipSyncNeeded,
        lipSyncBeneficial: classification.lipSyncBeneficial,
        deterministic: classification.deterministic,
        classificationCostUsd: classification.classificationCostUsd,
        estimatedCostPro5s: calculateCost(classification.tier, 5, "pro"),
        v3OmniCostPro5s: calculateV3OmniCost(5, "pro"),
      };
    }),

  /**
   * Get model routing stats for an episode (all pipeline runs).
   */
  getStatsByEpisode: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const stats = await getModelRoutingStatsByEpisode(input.episodeId);
      return stats.map(s => ({
        id: s.id,
        episodeId: s.episodeId,
        pipelineRunId: s.pipelineRunId,
        totalPanels: s.totalPanels,
        tierCounts: {
          1: s.tier1Count,
          2: s.tier2Count,
          3: s.tier3Count,
          4: s.tier4Count,
        },
        actualCost: s.actualCost,
        v3OmniCost: s.v3OmniCost,
        savings: s.savings,
        savingsPercent: s.savingsPercent,
        createdAt: s.createdAt,
      }));
    }),

  /**
   * Get model routing stats for a specific pipeline run.
   */
  getStatsByRun: protectedProcedure
    .input(z.object({ pipelineRunId: z.number() }))
    .query(async ({ input }) => {
      const stat = await getModelRoutingStatsByRun(input.pipelineRunId);
      if (!stat) return null;
      return {
        id: stat.id,
        episodeId: stat.episodeId,
        pipelineRunId: stat.pipelineRunId,
        totalPanels: stat.totalPanels,
        tierCounts: {
          1: stat.tier1Count,
          2: stat.tier2Count,
          3: stat.tier3Count,
          4: stat.tier4Count,
        },
        actualCost: stat.actualCost,
        v3OmniCost: stat.v3OmniCost,
        savings: stat.savings,
        savingsPercent: stat.savingsPercent,
        createdAt: stat.createdAt,
      };
    }),

  /**
   * Get per-panel routing breakdown for a pipeline run.
   * Shows which model was used for each panel and why.
   */
  getRoutingBreakdown: protectedProcedure
    .input(z.object({ pipelineRunId: z.number() }))
    .query(async ({ input }) => {
      const assets = await getRoutingDataByRun(input.pipelineRunId);
      return assets.map(a => ({
        id: a.id,
        panelId: a.panelId,
        assetType: a.assetType,
        klingModelUsed: a.klingModelUsed,
        complexityTier: a.complexityTier,
        lipSyncMethod: a.lipSyncMethod,
        classificationReasoning: a.classificationReasoning,
        costActual: a.costActual,
        costIfV3Omni: a.costIfV3Omni,
        userOverride: a.userOverride,
        url: a.url,
      }));
    }),

  /**
   * Override the model for a specific pipeline asset.
   * Used by Studio-tier users to force V3 Omni on any panel.
   */
  overrideModel: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      forceTier: z.number().min(1).max(4),
    }))
    .mutation(async ({ input }) => {
      const m = MODEL_MAP[input.forceTier];
      if (!m) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid tier" });

      await updatePipelineAssetRouting(input.assetId, {
        klingModelUsed: m.model,
        complexityTier: input.forceTier,
        userOverride: 1,
        classificationReasoning: `User override → Tier ${input.forceTier} (${m.model})`,
      });

      return { success: true, model: m.model, tier: input.forceTier };
    }),

  /**
   * Get cost comparison data for a pipeline run.
   * Returns actual cost, V3-Omni-only cost, savings, and per-tier breakdown.
   */
  getCostComparison: protectedProcedure
    .input(z.object({ pipelineRunId: z.number() }))
    .query(async ({ input }) => {
      const stat = await getModelRoutingStatsByRun(input.pipelineRunId);
      const assets = await getRoutingDataByRun(input.pipelineRunId);

      const perTier = [1, 2, 3, 4].map(tier => {
        const tierAssets = assets.filter(a => a.complexityTier === tier);
        return {
          tier,
          model: MODEL_MAP[tier].model,
          count: tierAssets.length,
          actualCost: tierAssets.reduce((sum, a) => sum + (a.costActual || 0), 0),
          v3OmniCost: tierAssets.reduce((sum, a) => sum + (a.costIfV3Omni || 0), 0),
        };
      });

      return {
        summary: stat ? {
          totalPanels: stat.totalPanels,
          actualCost: stat.actualCost,
          v3OmniCost: stat.v3OmniCost,
          savings: stat.savings,
          savingsPercent: stat.savingsPercent,
        } : null,
        perTier,
        perPanel: assets.map(a => ({
          panelId: a.panelId,
          tier: a.complexityTier,
          model: a.klingModelUsed,
          actualCost: a.costActual,
          v3OmniCost: a.costIfV3Omni,
          lipSyncMethod: a.lipSyncMethod,
          userOverride: !!a.userOverride,
        })),
      };
    }),

  /**
   * Get available model tiers and pricing info.
   */
  getModelInfo: protectedProcedure
    .query(async () => {
      return Object.entries(MODEL_MAP).map(([tier, info]) => ({
        tier: Number(tier),
        model: info.model,
        modelName: info.modelName,
        costPerSecStd: info.costPerSecStd,
        costPerSecPro: info.costPerSecPro,
        costPer5sStd: info.costPerSecStd * 5,
        costPer5sPro: info.costPerSecPro * 5,
        description: tier === "1" ? "V3 Omni — Native lip sync, highest quality"
          : tier === "2" ? "V2.6 — High quality, complex scenes"
          : tier === "3" ? "V2.1 — Medium quality, simple motion"
          : "V1.6 — Basic, transitions & stills",
      }));
    }),
});
