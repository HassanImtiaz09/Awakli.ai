/**
 * Transitions Router — tRPC endpoints for managing panel-to-panel
 * transitions in the video assembly pipeline.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getPanelsByEpisode, updatePanel } from "./db";
import { computeAutoTransitions } from "./auto-transitions";
import {
  calculateTotalDuration,
  calculateClipStartTimes,
  mapTransitionToXfade,
  clampDuration,
  type TransitionType,
  type TransitionSpec,
} from "./video-assembly";

const transitionTypeSchema = z.enum(["cut", "fade", "dissolve", "cross-dissolve"]);

export const transitionsRouter = router({
  /**
   * Get all panel transitions for an episode
   */
  getByEpisode: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const panels = await getPanelsByEpisode(input.episodeId);
      return panels.map(p => ({
        panelId: p.id,
        panelNumber: p.panelNumber,
        sceneNumber: p.sceneNumber,
        transition: (p.transition as TransitionType) || "cut",
        transitionDuration: p.transitionDuration ?? 0.5,
        visualDescription: p.visualDescription?.slice(0, 80) || "",
      }));
    }),

  /**
   * Update transition for a single panel
   */
  updatePanel: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      transition: transitionTypeSchema,
      transitionDuration: z.number().min(0.2).max(2.0).optional(),
    }))
    .mutation(async ({ input }) => {
      const duration = input.transitionDuration ?? 0.5;
      await updatePanel(input.panelId, {
        transition: input.transition,
        transitionDuration: duration,
      } as any);
      return { success: true, panelId: input.panelId, transition: input.transition, duration };
    }),

  /**
   * Batch update transitions for multiple panels
   */
  batchUpdate: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        panelId: z.number(),
        transition: transitionTypeSchema,
        transitionDuration: z.number().min(0.2).max(2.0).optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const results = [];
      for (const u of input.updates) {
        await updatePanel(u.panelId, {
          transition: u.transition,
          transitionDuration: u.transitionDuration ?? 0.5,
        } as any);
        results.push({ panelId: u.panelId, transition: u.transition });
      }
      return { success: true, updated: results.length };
    }),

  /**
   * Apply the same transition to all panels in an episode
   */
  applyToAll: protectedProcedure
    .input(z.object({
      episodeId: z.number(),
      transition: transitionTypeSchema,
      transitionDuration: z.number().min(0.2).max(2.0).optional(),
    }))
    .mutation(async ({ input }) => {
      const panels = await getPanelsByEpisode(input.episodeId);
      const duration = input.transitionDuration ?? 0.5;
      let updated = 0;
      for (const p of panels) {
        await updatePanel(p.id, {
          transition: input.transition,
          transitionDuration: duration,
        } as any);
        updated++;
      }
      return { success: true, updated, transition: input.transition, duration };
    }),

  /**
   * Preview estimated duration with current transitions
   * (without running the actual assembly)
   */
  previewDuration: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const panels = await getPanelsByEpisode(input.episodeId);
      if (panels.length === 0) {
        return { totalDuration: 0, clipCount: 0, transitions: [], clipStartTimes: [] };
      }

      // Estimate clip durations (default 5s per panel)
      const clipDurations = panels.map(() => 5);

      // Build transition specs
      const transitions: TransitionSpec[] = panels.map(p => ({
        type: (p.transition as TransitionType) || "cut",
        duration: p.transitionDuration ?? 0.5,
      }));

      // Edge transitions (between adjacent clips)
      const edgeTransitions = transitions.slice(0, transitions.length - 1);

      const totalDuration = calculateTotalDuration(clipDurations, edgeTransitions);
      const clipStartTimes = calculateClipStartTimes(clipDurations, edgeTransitions);

      // Duration without transitions (all cuts)
      const allCutDuration = clipDurations.reduce((a, b) => a + b, 0);
      const timeSaved = allCutDuration - totalDuration;

      return {
        totalDuration: Math.round(totalDuration * 10) / 10,
        allCutDuration: Math.round(allCutDuration * 10) / 10,
        timeSaved: Math.round(timeSaved * 10) / 10,
        clipCount: panels.length,
        transitions: panels.map((p, i) => ({
          panelId: p.id,
          panelNumber: p.panelNumber,
          transition: (p.transition as TransitionType) || "cut",
          duration: p.transitionDuration ?? 0.5,
          startTime: Math.round(clipStartTimes[i] * 10) / 10,
          xfadeFilter: mapTransitionToXfade((p.transition as TransitionType) || "cut"),
        })),
      };
    }),

  /**
   * Get available transition types with descriptions
   */
  /**
   * Preview auto-transition assignments without applying them.
   * Returns what transitions would be assigned based on scene structure.
   */
  autoAssignPreview: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .query(async ({ input }) => {
      const panels = await getPanelsByEpisode(input.episodeId);
      const sorted = [...panels].sort((a, b) => a.panelNumber - b.panelNumber);
      const panelsForAuto = sorted.map(p => ({
        id: p.id,
        panelNumber: p.panelNumber,
        sceneNumber: p.sceneNumber,
      }));
      return computeAutoTransitions(panelsForAuto);
    }),

  /**
   * Apply scene-aware auto-transitions to all panels in an episode.
   * Scene boundaries → fade (0.8s), within scene → cross-dissolve (0.5s), last panel → cut.
   */
  autoAssign: protectedProcedure
    .input(z.object({ episodeId: z.number() }))
    .mutation(async ({ input }) => {
      const panels = await getPanelsByEpisode(input.episodeId);
      if (panels.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No panels found for this episode" });
      }
      const sorted = [...panels].sort((a, b) => a.panelNumber - b.panelNumber);
      const panelsForAuto = sorted.map(p => ({
        id: p.id,
        panelNumber: p.panelNumber,
        sceneNumber: p.sceneNumber,
      }));
      const summary = computeAutoTransitions(panelsForAuto);

      // Apply all assignments
      for (const a of summary.assignments) {
        await updatePanel(a.panelId, {
          transition: a.transition,
          transitionDuration: a.transitionDuration,
        } as any);
      }

      return {
        success: true,
        ...summary,
      };
    }),

  getTypes: protectedProcedure.query(() => {
    return [
      {
        type: "cut",
        label: "Hard Cut",
        description: "Instant switch between panels. Default for action scenes.",
        xfadeFilter: null,
        durationRange: null,
      },
      {
        type: "fade",
        label: "Fade Through Black",
        description: "Fades out to black, then fades in. Good for scene changes and time skips.",
        xfadeFilter: "fadeblack",
        durationRange: { min: 0.3, max: 2.0, default: 0.8 },
      },
      {
        type: "dissolve",
        label: "Dissolve",
        description: "Pixel dissolve effect. Artistic transition for dream sequences or flashbacks.",
        xfadeFilter: "dissolve",
        durationRange: { min: 0.3, max: 1.5, default: 0.6 },
      },
      {
        type: "cross-dissolve",
        label: "Cross-Dissolve",
        description: "Smooth blend between panels. The most cinematic transition for dialogue scenes.",
        xfadeFilter: "fade",
        durationRange: { min: 0.2, max: 1.5, default: 0.5 },
      },
    ];
  }),
});
