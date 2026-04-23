/**
 * LoRA Marketplace — tRPC Router
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  publishLora,
  browseLoras,
  getLoraById,
  recordDownload,
  addReview,
  getReviews,
  calculateRevenueShare,
  calculateTrainingSavings,
  unpublishLora,
} from "./lora-marketplace";

const categoryEnum = z.enum(["character", "style", "background", "effect", "general"]);
const licenseEnum = z.enum(["free", "attribution", "commercial", "exclusive"]);
const sortEnum = z.enum(["newest", "popular", "rating", "downloads"]);

export const marketplaceRouter = router({
  /** Browse marketplace listings. */
  list: publicProcedure
    .input(z.object({
      category: categoryEnum.optional(),
      search: z.string().optional(),
      sortBy: sortEnum.optional(),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
      freeOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return browseLoras(input ?? {});
    }),

  /** Get a single LoRA listing. */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const lora = await getLoraById(input.id);
      if (!lora) throw new TRPCError({ code: "NOT_FOUND", message: "LoRA not found" });
      return lora;
    }),

  /** Publish a LoRA to the marketplace. */
  publish: protectedProcedure
    .input(z.object({
      name: z.string().min(2).max(128),
      description: z.string().max(2000).optional(),
      previewImages: z.array(z.string().url()).max(5).optional(),
      license: licenseEnum,
      priceCents: z.number().min(0).max(100000),
      tags: z.array(z.string()).max(10).optional(),
      category: categoryEnum,
      loraFileKey: z.string().optional(),
      loraFileUrl: z.string().url().optional(),
      baseModelId: z.string().optional(),
      trainingCreditsUsed: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return publishLora({
        creatorId: ctx.user.id,
        ...input,
      });
    }),

  /** Unpublish a LoRA from the marketplace. */
  unpublish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await unpublishLora(input.id, ctx.user.id);
      if (!success) throw new TRPCError({ code: "NOT_FOUND", message: "LoRA not found or not owned by you" });
      return { success: true };
    }),

  /** Record a download (and increment counter). */
  download: protectedProcedure
    .input(z.object({ loraId: z.number() }))
    .mutation(async ({ input }) => {
      await recordDownload(input.loraId);
      const lora = await getLoraById(input.loraId);
      return { success: true, downloadUrl: lora?.loraFileUrl };
    }),

  /** Add a review for a LoRA. */
  review: protectedProcedure
    .input(z.object({
      loraId: z.number(),
      rating: z.number().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await addReview(input.loraId, ctx.user.id, input.rating, input.comment);
      } catch (e: any) {
        if (e.message?.includes("already reviewed")) {
          throw new TRPCError({ code: "CONFLICT", message: e.message });
        }
        throw e;
      }
    }),

  /** Get reviews for a LoRA. */
  reviews: publicProcedure
    .input(z.object({
      loraId: z.number(),
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
    }))
    .query(async ({ input }) => {
      return getReviews(input.loraId, input.limit, input.offset);
    }),

  /** Calculate revenue share for a given price. */
  revenueShare: publicProcedure
    .input(z.object({ priceCents: z.number().min(0) }))
    .query(({ input }) => {
      return calculateRevenueShare(input.priceCents);
    }),

  /** Calculate training cost savings when using a base LoRA. */
  trainingSavings: publicProcedure
    .input(z.object({ baseLoraId: z.number().optional() }))
    .query(({ input }) => {
      return calculateTrainingSavings(input.baseLoraId);
    }),

  /** Get LoRAs published by the current user. */
  myLoras: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      return browseLoras({
        creatorId: ctx.user.id,
        limit: input?.limit,
        offset: input?.offset,
      });
    }),
});
