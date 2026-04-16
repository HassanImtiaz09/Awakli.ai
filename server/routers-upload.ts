/**
 * Upload Router — BYO Manga Upload Pipeline
 * 
 * Endpoints for file upload, source detection, panel segmentation,
 * cleanup, style transfer, OCR, auto-fill metadata, and finalization.
 */

import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import {
  detectSourceType,
  segmentPanels,
  cleanupPanel,
  applyStyleTransfer,
  generateStyleTransferPreviews,
  extractDialogue,
  autoFillMetadata,
  getCleanupSteps,
  getUploadLimits,
  validateFinalization,
  STYLE_TRANSFER_CONFIG,
  UPLOAD_TIER_LIMITS,
  type SourceType,
  type StyleTransferOption,
  type UploadFinalizationInput,
} from "./upload-processing";
import {
  createUploadedAsset,
  createUploadedAssetsBulk,
  getUploadedAssetsByProject,
  getUploadedAssetById,
  updateUploadedAsset,
  deleteUploadedAssetsByProject,
} from "./db";

import { getUserSubscriptionTier } from "./db";

// Helper to get user tier
async function getUserTierFromCtx(ctx: any): Promise<string> {
  return getUserSubscriptionTier(ctx.user.id);
}

export const uploadRouter = router({
  /**
   * Get upload limits for the current user's tier
   */
  getLimits: protectedProcedure.query(async ({ ctx }) => {
    const tier = await getUserTierFromCtx(ctx);
    const limits = getUploadLimits(tier);
    return { tier, limits };
  }),

  /**
   * Upload a manga page image to S3
   * Accepts base64 image data, returns the S3 URL and asset record
   */
  uploadPage: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      imageBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string().default("image/png"),
      pageNumber: z.number().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getUserTierFromCtx(ctx);
      const limits = getUploadLimits(tier);

      if (limits.maxPages === 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Upload requires a Creator or Studio subscription",
        });
      }

      // Check page limit
      const existing = await getUploadedAssetsByProject(input.projectId);
      const pageCount = new Set(existing.map(a => a.panelNumber)).size;
      if (pageCount >= limits.maxPages) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Page limit reached (${limits.maxPages} pages for ${tier} tier)`,
        });
      }

      // Upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const fileKey = `uploads/${ctx.user.id}/${input.projectId}/${nanoid()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      // Create asset record
      const assetId = await createUploadedAsset({
        projectId: input.projectId,
        originalUrl: url || "",
        processedUrl: null,
        panelNumber: input.pageNumber,
        sourceType: null,
      });

      return { assetId, url, pageNumber: input.pageNumber };
    }),

  /**
   * Detect source type of an uploaded image using Claude Vision
   */
  detectSourceType: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await detectSourceType(input.imageUrl);

      // Update asset with detection result
      await updateUploadedAsset(input.assetId, {
        sourceType: result.sourceType,
        panelMetadata: {
          detection: result,
        },
      });

      return result;
    }),

  /**
   * Detect source type for all pages in a project (batch)
   */
  detectSourceTypeBatch: protectedProcedure
    .input(z.object({
      projectId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const assets = await getUploadedAssetsByProject(input.projectId);
      const results = [];

      for (const asset of assets) {
        if (asset.originalUrl) {
          const result = await detectSourceType(asset.originalUrl);
          await updateUploadedAsset(asset.id, {
            sourceType: result.sourceType,
            panelMetadata: { detection: result },
          });
          results.push({ assetId: asset.id, ...result });
        }
      }

      // Determine consensus source type
      const typeCounts: Record<string, number> = {};
      for (const r of results) {
        typeCounts[r.sourceType] = (typeCounts[r.sourceType] || 0) + 1;
      }
      const consensusType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "digital_art";

      return { results, consensusType };
    }),

  /**
   * Segment a manga page into individual panels
   */
  segmentPage: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
      readingDirection: z.enum(["ltr", "rtl"]).default("rtl"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await segmentPanels(input.imageUrl, input.readingDirection);

      // Update asset with segmentation result
      await updateUploadedAsset(input.assetId, {
        segmentationData: result,
      });

      return result;
    }),

  /**
   * Process (cleanup) a panel based on its source type
   */
  processPanel: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
      sourceType: z.enum(["ai_generated", "digital_art", "hand_drawn"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await cleanupPanel(
        input.imageUrl,
        input.sourceType as SourceType,
        ctx.user.id,
        0, // projectId not needed for cleanup
      );

      // Update asset
      await updateUploadedAsset(input.assetId, {
        processedUrl: result.processedUrl,
        processingApplied: result.stepsApplied.filter(s => s.applied).map(s => s.name),
      });

      return result;
    }),

  /**
   * Get cleanup steps for a source type (preview, no processing)
   */
  getCleanupSteps: protectedProcedure
    .input(z.object({
      sourceType: z.enum(["ai_generated", "digital_art", "hand_drawn"]),
    }))
    .query(({ input }) => {
      return getCleanupSteps(input.sourceType as SourceType);
    }),

  /**
   * Apply style transfer to a panel
   */
  applyStyleTransfer: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
      option: z.enum(["none", "enhance_only", "hybrid", "full_restyle"]),
      animeStyle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getUserTierFromCtx(ctx);
      const limits = getUploadLimits(tier);

      if (!limits.styleTransferOptions.includes(input.option as StyleTransferOption)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Style transfer option "${input.option}" requires ${STYLE_TRANSFER_CONFIG[input.option as StyleTransferOption]?.tierRequired || "studio"} tier`,
        });
      }

      const result = await applyStyleTransfer(
        input.imageUrl,
        input.option as StyleTransferOption,
        input.animeStyle,
      );

      // Update asset with style transfer result
      await updateUploadedAsset(input.assetId, {
        processedUrl: result.resultUrl,
        styleTransferOption: input.option as any,
      });

      return result;
    }),

  /**
   * Generate all 3 style transfer previews for comparison
   */
  previewStyleTransfer: protectedProcedure
    .input(z.object({
      imageUrl: z.string().url(),
      animeStyle: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const previews = await generateStyleTransferPreviews(input.imageUrl, input.animeStyle);
      return { previews };
    }),

  /**
   * Extract dialogue from a panel via OCR
   */
  extractDialogue: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getUserTierFromCtx(ctx);
      const limits = getUploadLimits(tier);

      if (!limits.ocrEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OCR requires a Creator or Studio subscription",
        });
      }

      const result = await extractDialogue(input.imageUrl);

      // Update asset with OCR result
      await updateUploadedAsset(input.assetId, {
        ocrExtracted: result,
      });

      return result;
    }),

  /**
   * Auto-fill panel metadata using vision AI
   */
  autoFillMetadata: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      imageUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const tier = await getUserTierFromCtx(ctx);
      const limits = getUploadLimits(tier);

      if (!limits.autoMetadataEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Auto-fill metadata requires a Creator or Studio subscription",
        });
      }

      const result = await autoFillMetadata(input.imageUrl);

      // Update asset with auto-fill metadata
      await updateUploadedAsset(input.assetId, {
        panelMetadata: result,
      });

      return result;
    }),

  /**
   * Get all uploaded assets for a project
   */
  getAssets: protectedProcedure
    .input(z.object({
      projectId: z.number(),
    }))
    .query(async ({ input }) => {
      return getUploadedAssetsByProject(input.projectId);
    }),

  /**
   * Update panel metadata (manual edits by user)
   */
  updatePanelMetadata: protectedProcedure
    .input(z.object({
      assetId: z.number(),
      panelNumber: z.number().optional(),
      sceneNumber: z.number().optional(),
      metadata: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const updateData: any = {};
      if (input.panelNumber !== undefined) updateData.panelNumber = input.panelNumber;
      if (input.sceneNumber !== undefined) {
        const asset = await getUploadedAssetById(input.assetId);
        const existingMeta = asset?.panelMetadata ? (typeof asset.panelMetadata === 'string' ? JSON.parse(asset.panelMetadata) : asset.panelMetadata) : {};
        updateData.panelMetadata = { ...existingMeta, sceneNumber: input.sceneNumber };
      }
      if (input.metadata !== undefined) updateData.panelMetadata = JSON.parse(input.metadata);
      await updateUploadedAsset(input.assetId, updateData);
      return { success: true };
    }),

  /**
   * Delete all uploaded assets for a project
   */
  clearAssets: protectedProcedure
    .input(z.object({
      projectId: z.number(),
    }))
    .mutation(async ({ input }) => {
      await deleteUploadedAssetsByProject(input.projectId);
      return { success: true };
    }),

  /**
   * Validate finalization data before creating panels
   */
  validateFinalization: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      title: z.string(),
      panels: z.array(z.object({
        assetId: z.number(),
        panelNumber: z.number(),
        sceneNumber: z.number(),
        dialogue: z.string(),
        sceneDescription: z.string(),
        cameraAngle: z.string(),
        mood: z.string(),
        characters: z.array(z.string()),
        transition: z.string(),
      })),
    }))
    .mutation(({ ctx, input }) => {
      return validateFinalization({
        projectId: input.projectId,
        userId: ctx.user.id,
        title: input.title,
        sourceType: "digital_art",
        panels: input.panels,
      });
    }),

  /**
   * Get available style transfer options with tier info
   */
  getStyleTransferOptions: protectedProcedure.query(async ({ ctx }) => {
    const tier = await getUserTierFromCtx(ctx);
    const limits = getUploadLimits(tier);

    return {
      tier,
      options: Object.entries(STYLE_TRANSFER_CONFIG).map(([key, config]) => ({
        key,
        strength: config.strength,
        tierRequired: config.tierRequired,
        available: limits.styleTransferOptions.includes(key as StyleTransferOption),
        label: key === "none" ? "Original (No Transfer)"
          : key === "enhance_only" ? "Enhance Only (Light Touch)"
          : key === "hybrid" ? "Hybrid (Anime Blend)"
          : "Full Restyle (Studio Only)",
      })),
    };
  }),

  /**
   * Get tier limits comparison for upgrade prompts
   */
  getTierComparison: protectedProcedure.query(() => {
    return UPLOAD_TIER_LIMITS;
  }),
});
