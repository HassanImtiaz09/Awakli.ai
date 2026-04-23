/**
 * Targeted Inpainting — tRPC Router
 *
 * Endpoints for region-specific panel regeneration.
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  validateMask,
  executeInpaint,
  estimateInpaintCost,
  getMaskAreaPercent,
  getMaskBoundingBox,
  INPAINT_CREDIT_COST,
  type InpaintMask,
} from "./targeted-inpainting";
import { getPanelById } from "./db";

const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
});

const polygonPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const maskSchema = z.object({
  type: z.enum(["rectangle", "polygon"]),
  boundingBox: boundingBoxSchema.optional(),
  points: z.array(polygonPointSchema).optional(),
});

export const inpaintingRouter = router({
  /**
   * Execute targeted inpainting on a panel region.
   */
  inpaintRegion: protectedProcedure
    .input(z.object({
      panelId: z.number(),
      mask: maskSchema,
      promptOverride: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Get the panel
      const panel = await getPanelById(input.panelId);
      if (!panel) throw new TRPCError({ code: "NOT_FOUND", message: "Panel not found" });
      if (!panel.imageUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Panel has no image to inpaint" });

      // Validate mask
      const maskError = validateMask(input.mask as InpaintMask);
      if (maskError) throw new TRPCError({ code: "BAD_REQUEST", message: maskError });

      // Execute inpainting
      const result = await executeInpaint({
        originalImageUrl: panel.imageUrl,
        mimeType: "image/png",
        mask: input.mask as InpaintMask,
        promptOverride: input.promptOverride,
        originalPrompt: panel.visualDescription ?? undefined,
      });

      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Inpainting failed" });
      }

      return {
        imageUrl: result.imageUrl,
        promptUsed: result.promptUsed,
        creditCost: estimateInpaintCost(input.mask as InpaintMask),
      };
    }),

  /**
   * Validate a mask before submitting (for real-time UI feedback).
   */
  validateMask: protectedProcedure
    .input(z.object({ mask: maskSchema }))
    .mutation(async ({ input }) => {
      const error = validateMask(input.mask as InpaintMask);
      const areaPct = getMaskAreaPercent(input.mask as InpaintMask);
      const bbox = getMaskBoundingBox(input.mask as InpaintMask);
      const cost = estimateInpaintCost(input.mask as InpaintMask);

      return {
        valid: error === null,
        error,
        areaPercent: Math.round(areaPct * 10) / 10,
        boundingBox: bbox,
        estimatedCost: cost,
      };
    }),

  /**
   * Get the credit cost for inpainting.
   */
  getCost: protectedProcedure
    .input(z.object({ mask: maskSchema.optional() }))
    .query(async ({ input }) => {
      if (input.mask) {
        return { cost: estimateInpaintCost(input.mask as InpaintMask) };
      }
      return { cost: INPAINT_CREDIT_COST };
    }),
});
