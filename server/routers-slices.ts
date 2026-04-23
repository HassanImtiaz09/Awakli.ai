/**
 * Slice Decomposition Router — tRPC endpoints for the 10-second clip pipeline
 *
 * Provides endpoints for:
 *   - Decomposing scripts into slices (with persistence)
 *   - Listing slices by episode
 *   - Updating individual slice metadata
 *   - Overriding complexity tier with cost recalculation
 *   - Dry-run decomposition preview (no persistence)
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getPanelsByEpisode, getEpisodeById,
  createSlicesBulk, getSlicesByEpisode, getSliceById, updateSlice,
  deleteSlicesByEpisode, getSliceCostSummary,
} from "./db";
import {
  decomposeScript, type PanelData,
} from "./slice-decomposer";
import {
  classifySliceComplexity, classifyAllSlices, applyTierOverride, computeRoutingSavings,
} from "./slice-classifier";

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Convert DB panel rows to PanelData for the decomposer.
 */
function panelRowToPanelData(row: any): PanelData {
  let dialogue: PanelData["dialogue"] = null;
  if (row.dialogue) {
    try {
      const parsed = typeof row.dialogue === "string" ? JSON.parse(row.dialogue) : row.dialogue;
      if (Array.isArray(parsed)) {
        dialogue = parsed.map((d: any) => ({
          character: d.character || d.speaker || "",
          text: d.text || d.line || "",
          emotion: d.emotion || "neutral",
        }));
      }
    } catch {
      dialogue = null;
    }
  }

  return {
    id: row.id,
    sceneNumber: row.sceneNumber ?? 1,
    panelNumber: row.panelNumber ?? 1,
    visualDescription: row.visualDescription || null,
    cameraAngle: row.cameraAngle || null,
    dialogue,
    sfx: row.sfx || null,
    transition: row.transition || null,
    transitionDuration: row.transitionDuration || null,
  };
}

// ─── Router ──────────────────────────────────────────────────────────────

export const sliceRouter = router({
  /**
   * Decompose an episode's script into 10-second slices and persist to DB.
   * Deletes any existing slices for the episode first.
   */
  decompose: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      useLLM: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify episode exists and user owns it
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      // Get panels for this episode
      const panels = await getPanelsByEpisode(input.episodeId);
      if (panels.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No panels found for this episode. Generate manga panels first.",
        });
      }

      // Convert to PanelData format
      const panelData = panels.map(panelRowToPanelData);

      // Run decomposition
      const result = await decomposeScript(panelData, input.useLLM);

      if (result.slices.length === 0) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Decomposition produced no slices",
        });
      }

      // Classify all slices for routing
      const { classifications, summary } = classifyAllSlices(result.slices);

      // Delete existing slices for this episode
      await deleteSlicesByEpisode(input.episodeId);

      // Persist slices to DB
      const sliceRows = result.slices.map((slice, i) => {
        const classification = classifications[i];
        return {
          episodeId: input.episodeId,
          projectId: (episode as any).projectId,
          sceneId: slice.sceneId,
          sliceNumber: slice.sliceNumber,
          durationSeconds: String(slice.durationSeconds),
          characters: JSON.stringify(slice.characters),
          dialogue: JSON.stringify(slice.dialogue),
          actionDescription: slice.actionDescription,
          cameraAngle: slice.cameraAngle,
          mood: slice.mood,
          complexityTier: classification.tier,
          klingModel: classification.modelName,
          klingMode: classification.mode,
          lipSyncRequired: classification.lipSyncRequired,
          coreSceneStatus: "pending" as const,
          videoClipStatus: "pending" as const,
          estimatedCredits: String(classification.estimatedCredits),
        };
      });

      const sliceIds = await createSlicesBulk(sliceRows as any);

      return {
        sliceCount: result.slices.length,
        totalDurationSeconds: result.totalDurationSeconds,
        averageSliceDuration: result.averageSliceDuration,
        timingMethod: result.timingMethod,
        totalPanels: result.totalPanels,
        routing: summary,
        sliceIds,
      };
    }),

  /**
   * List all slices for an episode, ordered by sliceNumber.
   */
  listByEpisode: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const slices = await getSlicesByEpisode(input.episodeId);
      return slices.map(s => ({
        ...s,
        characters: safeParseJson(s.characters as any, []),
        dialogue: safeParseJson(s.dialogue as any, []),
      }));
    }),

  /**
   * Get a single slice by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const slice = await getSliceById(input.id);
      if (!slice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }
      return {
        ...slice,
        characters: safeParseJson(slice.characters as any, []),
        dialogue: safeParseJson(slice.dialogue as any, []),
      };
    }),

  /**
   * Update individual slice metadata (dialogue, action description, camera, mood).
   */
  updateSlice: protectedProcedure
    .input(z.object({
      id: z.number(),
      actionDescription: z.string().optional(),
      cameraAngle: z.string().optional(),
      mood: z.string().optional(),
      dialogue: z.array(z.object({
        character: z.string(),
        text: z.string(),
        emotion: z.string(),
        startOffset: z.number(),
        endOffset: z.number(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const existing = await getSliceById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      const updates: Record<string, any> = {};
      if (input.actionDescription !== undefined) updates.actionDescription = input.actionDescription;
      if (input.cameraAngle !== undefined) updates.cameraAngle = input.cameraAngle;
      if (input.mood !== undefined) updates.mood = input.mood;
      if (input.dialogue !== undefined) {
        updates.dialogue = JSON.stringify(input.dialogue);
        updates.lipSyncRequired = input.dialogue.length > 0;
      }

      await updateSlice(input.id, updates);
      return { success: true, id: input.id };
    }),

  /**
   * Override the complexity tier for a slice.
   * Recalculates cost and returns the delta.
   */
  overrideTier: protectedProcedure
    .input(z.object({
      id: z.number(),
      newTier: z.number().min(1).max(4),
    }))
    .mutation(async ({ input }) => {
      const existing = await getSliceById(input.id);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Slice not found" });
      }

      const originalTier = existing.complexityTier || 2;

      // Build a minimal slice definition for the classifier
      const sliceDef = {
        sliceNumber: existing.sliceNumber || 1,
        sceneId: existing.sceneId,
        durationSeconds: parseFloat(String(existing.durationSeconds)) || 10,
        panels: [],
        panelIds: [],
        characters: safeParseJson(existing.characters as any, []),
        dialogue: safeParseJson(existing.dialogue as any, []),
        actionDescription: existing.actionDescription || "",
        cameraAngle: existing.cameraAngle || "medium",
        mood: existing.mood || "neutral",
        lipSyncRequired: !!existing.lipSyncRequired,
      };

      // Get the original classification
      const originalClassification = classifySliceComplexity(sliceDef);

      // Apply the override
      const overridden = applyTierOverride(
        sliceDef,
        originalClassification,
        input.newTier as 1 | 2 | 3 | 4,
      );

      // Compute savings
      const savings = computeRoutingSavings(sliceDef, originalTier, input.newTier);

      // Persist the override
      await updateSlice(input.id, {
        complexityTier: input.newTier,
        klingModel: toKlingModelEnum(overridden.modelName),
        klingMode: overridden.mode,
        userOverrideTier: input.newTier,
        estimatedCredits: String(overridden.estimatedCredits),
      } as any);

      return {
        success: true,
        id: input.id,
        previousTier: originalTier,
        newTier: input.newTier,
        newModel: overridden.modelName,
        newMode: overridden.mode,
        estimatedCredits: overridden.estimatedCredits,
        estimatedCostUsd: overridden.estimatedCostUsd,
        costDelta: savings,
        warning: overridden.reasoning.includes("WARNING") ? overridden.reasoning : undefined,
      };
    }),

  /**
   * Dry-run decomposition preview — no persistence.
   * Returns slices with classifications and cost estimates.
   */
  getDecompositionPreview: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      useLLM: z.boolean().default(false),  // Default to deterministic for fast preview
    }))
    .query(async ({ input }) => {
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const panels = await getPanelsByEpisode(input.episodeId);
      if (panels.length === 0) {
        return {
          slices: [],
          totalDurationSeconds: 0,
          totalPanels: 0,
          averageSliceDuration: 0,
          timingMethod: "deterministic" as const,
          routing: {
            totalSlices: 0,
            tierDistribution: { 1: 0, 2: 0, 3: 0, 4: 0 },
            modeDistribution: { professional: 0, standard: 0 },
            totalEstimatedCostUsd: 0,
            totalEstimatedCredits: 0,
            costIfAllV3OmniPro: 0,
            savingsUsd: 0,
            savingsPercent: 0,
          },
        };
      }

      const panelData = panels.map(panelRowToPanelData);
      const result = await decomposeScript(panelData, input.useLLM);
      const { classifications, summary } = classifyAllSlices(result.slices);

      return {
        slices: result.slices.map((slice, i) => ({
          sliceNumber: slice.sliceNumber,
          sceneId: slice.sceneId,
          durationSeconds: slice.durationSeconds,
          panelCount: slice.panelIds.length,
          panelIds: slice.panelIds,
          characters: slice.characters,
          dialogueLineCount: slice.dialogue.length,
          lipSyncRequired: slice.lipSyncRequired,
          cameraAngle: slice.cameraAngle,
          mood: slice.mood,
          classification: {
            tier: classifications[i].tier,
            model: classifications[i].modelName,
            mode: classifications[i].mode,
            reasoning: classifications[i].reasoning,
            estimatedCostUsd: classifications[i].estimatedCostUsd,
            estimatedCredits: classifications[i].estimatedCredits,
          },
        })),
        totalDurationSeconds: result.totalDurationSeconds,
        totalPanels: result.totalPanels,
        averageSliceDuration: result.averageSliceDuration,
        timingMethod: result.timingMethod,
        routing: summary,
      };
    }),

  /**
   * Get cost summary for an episode's slices.
   */
  getCostSummary: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      return getSliceCostSummary(input.episodeId);
    }),

  /**
   * Re-decompose: delete existing slices and re-run decomposition.
   * Useful when the user has edited panels or the script has changed.
   */
  redecompose: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      useLLM: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // Delegate to decompose (which already handles deletion)
      const episode = await getEpisodeById(input.episodeId);
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }

      const panels = await getPanelsByEpisode(input.episodeId);
      if (panels.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No panels found for this episode",
        });
      }

      const panelData = panels.map(panelRowToPanelData);
      const result = await decomposeScript(panelData, input.useLLM);
      const { classifications, summary } = classifyAllSlices(result.slices);

      await deleteSlicesByEpisode(input.episodeId);

      const sliceRows = result.slices.map((slice, i) => {
        const classification = classifications[i];
        return {
          episodeId: input.episodeId,
          projectId: (episode as any).projectId,
          sceneId: slice.sceneId,
          sliceNumber: slice.sliceNumber,
          durationSeconds: String(slice.durationSeconds),
          characters: JSON.stringify(slice.characters),
          dialogue: JSON.stringify(slice.dialogue),
          actionDescription: slice.actionDescription,
          cameraAngle: slice.cameraAngle,
          mood: slice.mood,
          complexityTier: classification.tier,
          klingModel: classification.modelName,
          klingMode: classification.mode,
          lipSyncRequired: classification.lipSyncRequired,
          coreSceneStatus: "pending" as const,
          videoClipStatus: "pending" as const,
          estimatedCredits: String(classification.estimatedCredits),
        };
      });

      const sliceIds = await createSlicesBulk(sliceRows as any);

      return {
        sliceCount: result.slices.length,
        totalDurationSeconds: result.totalDurationSeconds,
        averageSliceDuration: result.averageSliceDuration,
        timingMethod: result.timingMethod,
        totalPanels: result.totalPanels,
        routing: summary,
        sliceIds,
      };
    }),
});

// ─── Utility ──────────────────────────────────────────────────────────────

/** Map scene-classifier model names to DB enum values */
function toKlingModelEnum(modelName: string): "v3_omni" | "v2_6" | "v2_1" | "v1_6" {
  const map: Record<string, "v3_omni" | "v2_6" | "v2_1" | "v1_6"> = {
    "kling-video-o1": "v3_omni",
    "kling-v2-6": "v2_6",
    "kling-v2-1": "v2_1",
    "kling-v1-6": "v1_6",
    "v3-omni": "v3_omni",
    "v2-6": "v2_6",
    "v2-1": "v2_1",
    "v1-6": "v1_6",
  };
  return map[modelName] || "v3_omni";
}

function safeParseJson<T>(value: string | T, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
}
