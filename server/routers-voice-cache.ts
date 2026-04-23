/**
 * Voice Line Caching — tRPC Router
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  lookupVoiceLine,
  storeVoiceLine,
  listVoiceLines,
  deleteVoiceLine,
  getVoiceCacheStats,
  getUncachedInterjections,
  COMMON_INTERJECTIONS,
} from "./voice-cache";

export const voiceCacheRouter = router({
  /** List cached voice lines for a voice. */
  list: protectedProcedure
    .input(z.object({
      voiceId: z.string(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
      projectId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return listVoiceLines(input.voiceId, {
        limit: input.limit,
        offset: input.offset,
        projectId: input.projectId,
      });
    }),

  /** Look up a cached voice line (for pipeline use). */
  lookup: protectedProcedure
    .input(z.object({
      voiceId: z.string(),
      text: z.string(),
      emotion: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const entry = await lookupVoiceLine(input);
      return { found: !!entry, entry };
    }),

  /** Store a voice line in cache. */
  store: protectedProcedure
    .input(z.object({
      voiceId: z.string(),
      text: z.string(),
      emotion: z.string().optional(),
      audioUrl: z.string().url(),
      fileKey: z.string().optional(),
      durationMs: z.number().optional(),
      projectId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return storeVoiceLine(input);
    }),

  /** Delete a cached voice line. */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const deleted = await deleteVoiceLine(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Cache entry not found" });
      return { success: true };
    }),

  /** Get cache statistics for a voice. */
  stats: protectedProcedure
    .input(z.object({ voiceId: z.string() }))
    .query(async ({ input }) => {
      return getVoiceCacheStats(input.voiceId);
    }),

  /** Get common interjections not yet cached for a voice. */
  uncachedInterjections: protectedProcedure
    .input(z.object({ voiceId: z.string() }))
    .query(async ({ input }) => {
      const uncached = await getUncachedInterjections(input.voiceId);
      return { uncached, totalCommon: COMMON_INTERJECTIONS.length };
    }),
});
