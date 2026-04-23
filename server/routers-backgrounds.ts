/**
 * Background Asset Library — tRPC Router
 *
 * Endpoints for browsing, searching, and managing reusable background assets.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  findMatchingBackground,
  storeBackground,
  listBackgrounds,
  getBackground,
  deleteBackground,
  updateBackground,
  getProjectLocations,
  extractLocationTags,
} from "./background-library";

export const backgroundsRouter = router({
  /**
   * List all backgrounds for a project.
   */
  list: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      styleTag: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return listBackgrounds(input.projectId, {
        limit: input.limit,
        offset: input.offset,
        styleTag: input.styleTag,
      });
    }),

  /**
   * Get a single background by ID.
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const asset = await getBackground(input.id);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Background not found" });
      return asset;
    }),

  /**
   * Search for a matching background (used by the pipeline).
   */
  findMatch: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      locationName: z.string(),
      tags: z.array(z.string()).optional(),
      styleTag: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const match = await findMatchingBackground({
        projectId: input.projectId,
        locationName: input.locationName,
        tags: input.tags,
        styleTag: input.styleTag,
      });
      return match;
    }),

  /**
   * Store a new background in the library.
   */
  store: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      locationName: z.string().min(1).max(256),
      imageUrl: z.string().url(),
      fileKey: z.string().optional(),
      styleTag: z.string().optional(),
      resolution: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sourceEpisodeId: z.number().optional(),
      sourcePanelId: z.number().optional(),
      promptUsed: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return storeBackground(input);
    }),

  /**
   * Delete a background from the library.
   */
  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const deleted = await deleteBackground(input.id, input.projectId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Background not found" });
      return { success: true };
    }),

  /**
   * Update a background's metadata.
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      projectId: z.number(),
      locationName: z.string().min(1).max(256).optional(),
      tags: z.array(z.string()).optional(),
      styleTag: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, projectId, ...updates } = input;
      const updated = await updateBackground(id, projectId, updates);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Background not found" });
      return updated;
    }),

  /**
   * Get unique location names for a project (autocomplete).
   */
  locations: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ input }) => {
      return getProjectLocations(input.projectId);
    }),

  /**
   * Extract location tags from a description (utility endpoint).
   */
  extractTags: protectedProcedure
    .input(z.object({ description: z.string() }))
    .mutation(async ({ input }) => {
      return { tags: extractLocationTags(input.description) };
    }),
});
