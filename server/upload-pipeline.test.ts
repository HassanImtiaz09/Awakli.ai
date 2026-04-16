/**
 * Tests for BYO Manga Upload Pipeline
 *
 * Covers:
 * - Source type detection types and interface
 * - Panel segmentation result structure
 * - Cleanup steps per source type
 * - Style transfer config and tier gating
 * - OCR result structure
 * - Finalization validation
 * - Tier limits and gating
 * - Upload processing module exports
 * - tRPC upload router registration
 */
import { describe, it, expect } from "vitest";
import {
  getCleanupSteps,
  STYLE_TRANSFER_CONFIG,
  validateFinalization,
  UPLOAD_TIER_LIMITS,
  getUploadLimits,
  type SourceType,
  type StyleTransferOption,
  type DetectionResult,
  type SegmentationResult,
  type CleanupResult,
  type StyleTransferResult,
  type OCRResult,
  type PanelMetadata,
  type UploadFinalizationInput,
  type UploadTierLimits,
} from "./upload-processing";

// ─── getCleanupSteps ──────────────────────────────────────────────────────

describe("getCleanupSteps", () => {
  it("returns hand_drawn cleanup steps (6 steps)", () => {
    const steps = getCleanupSteps("hand_drawn");
    expect(steps.length).toBe(6);
    expect(steps.map(s => s.name)).toEqual(
      expect.arrayContaining(["deskew", "crop_borders", "texture_removal", "line_art_extraction", "resolution_upscale"])
    );
  });

  it("returns digital_art cleanup steps (4 steps)", () => {
    const steps = getCleanupSteps("digital_art");
    expect(steps.length).toBe(4);
    expect(steps.map(s => s.name)).toEqual(
      expect.arrayContaining(["color_normalization", "format_normalization", "style_compatibility_check"])
    );
  });

  it("returns ai_generated cleanup steps (3 steps)", () => {
    const steps = getCleanupSteps("ai_generated");
    expect(steps.length).toBe(3);
    expect(steps.map(s => s.name)).toEqual(
      expect.arrayContaining(["resolution_check", "format_normalization", "aspect_ratio_check"])
    );
  });

  it("returns undefined for unknown source type", () => {
    const steps = getCleanupSteps("unknown" as SourceType);
    expect(steps).toBeUndefined();
  });
});

// ─── STYLE_TRANSFER_CONFIG ────────────────────────────────────────────────

describe("STYLE_TRANSFER_CONFIG", () => {
  it("has all four style options", () => {
    expect(Object.keys(STYLE_TRANSFER_CONFIG)).toEqual(
      expect.arrayContaining(["none", "enhance_only", "hybrid", "full_restyle"])
    );
  });

  it("none has 0 strength", () => {
    expect(STYLE_TRANSFER_CONFIG.none.strength).toBe(0);
  });

  it("enhance_only has low strength", () => {
    expect(STYLE_TRANSFER_CONFIG.enhance_only.strength).toBeGreaterThan(0);
    expect(STYLE_TRANSFER_CONFIG.enhance_only.strength).toBeLessThanOrEqual(0.4);
  });

  it("hybrid has medium strength", () => {
    expect(STYLE_TRANSFER_CONFIG.hybrid.strength).toBeGreaterThan(0.3);
    expect(STYLE_TRANSFER_CONFIG.hybrid.strength).toBeLessThanOrEqual(0.7);
  });

  it("full_restyle has high strength", () => {
    expect(STYLE_TRANSFER_CONFIG.full_restyle.strength).toBeGreaterThan(0.6);
    expect(STYLE_TRANSFER_CONFIG.full_restyle.strength).toBeLessThanOrEqual(1);
  });

  it("full_restyle requires studio tier", () => {
    expect(STYLE_TRANSFER_CONFIG.full_restyle.tierRequired).toBe("studio");
  });

  it("each option has a prompt string", () => {
    for (const [key, config] of Object.entries(STYLE_TRANSFER_CONFIG)) {
      expect(typeof config.prompt).toBe("string");
    }
  });
});

// ─── validateFinalization ─────────────────────────────────────────────────

describe("validateFinalization", () => {
  const validInput: UploadFinalizationInput = {
    projectId: 1,
    userId: 1,
    title: "My Manga",
    sourceType: "digital_art",
    panels: [
      {
        assetId: 1,
        panelNumber: 1,
        sceneNumber: 1,
        dialogue: "Hello!",
        sceneDescription: "A character greets the viewer",
        cameraAngle: "medium-shot",
        mood: "cheerful",
        characters: ["Hero"],
        transition: "cut",
      },
    ],
  };

  it("validates a correct input", () => {
    const result = validateFinalization(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects empty title", () => {
    const result = validateFinalization({ ...validInput, title: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Project title is required");
  });

  it("rejects whitespace-only title", () => {
    const result = validateFinalization({ ...validInput, title: "   " });
    expect(result.valid).toBe(false);
  });

  it("rejects empty panels array", () => {
    const result = validateFinalization({ ...validInput, panels: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("At least one panel is required");
  });

  it("rejects panel without scene description", () => {
    const result = validateFinalization({
      ...validInput,
      panels: [{ ...validInput.panels[0], sceneDescription: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Scene description"))).toBe(true);
  });

  it("rejects panel without camera angle", () => {
    const result = validateFinalization({
      ...validInput,
      panels: [{ ...validInput.panels[0], cameraAngle: "" }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Camera angle"))).toBe(true);
  });

  it("collects multiple errors", () => {
    const result = validateFinalization({
      ...validInput,
      title: "",
      panels: [
        { ...validInput.panels[0], sceneDescription: "", cameraAngle: "" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("validates multiple panels independently", () => {
    const result = validateFinalization({
      ...validInput,
      panels: [
        validInput.panels[0],
        { ...validInput.panels[0], panelNumber: 2, sceneDescription: "" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Panel 2"))).toBe(true);
  });
});

// ─── Tier Limits ──────────────────────────────────────────────────────────

describe("UPLOAD_TIER_LIMITS", () => {
  it("free tier has 0 max pages (upload disabled)", () => {
    expect(UPLOAD_TIER_LIMITS.free.maxPages).toBe(0);
    expect(UPLOAD_TIER_LIMITS.free.ocrEnabled).toBe(false);
    expect(UPLOAD_TIER_LIMITS.free.autoMetadataEnabled).toBe(false);
  });

  it("creator tier allows 20 pages", () => {
    expect(UPLOAD_TIER_LIMITS.creator.maxPages).toBe(20);
    expect(UPLOAD_TIER_LIMITS.creator.ocrEnabled).toBe(true);
    expect(UPLOAD_TIER_LIMITS.creator.autoMetadataEnabled).toBe(true);
  });

  it("studio tier allows 100 pages", () => {
    expect(UPLOAD_TIER_LIMITS.studio.maxPages).toBe(100);
    expect(UPLOAD_TIER_LIMITS.studio.batchProcessing).toBe(true);
  });

  it("creator tier does not include full_restyle", () => {
    expect(UPLOAD_TIER_LIMITS.creator.styleTransferOptions).not.toContain("full_restyle");
  });

  it("studio tier includes full_restyle", () => {
    expect(UPLOAD_TIER_LIMITS.studio.styleTransferOptions).toContain("full_restyle");
  });

  it("studio tier has higher maxPanelsPerPage than creator", () => {
    expect(UPLOAD_TIER_LIMITS.studio.maxPanelsPerPage).toBeGreaterThan(
      UPLOAD_TIER_LIMITS.creator.maxPanelsPerPage
    );
  });
});

describe("getUploadLimits", () => {
  it("returns free limits for unknown tier", () => {
    const limits = getUploadLimits("unknown");
    expect(limits.maxPages).toBe(0);
  });

  it("returns creator limits", () => {
    const limits = getUploadLimits("creator");
    expect(limits.maxPages).toBe(20);
  });

  it("returns studio limits", () => {
    const limits = getUploadLimits("studio");
    expect(limits.maxPages).toBe(100);
  });

  it("returns free limits for empty string", () => {
    const limits = getUploadLimits("");
    expect(limits.maxPages).toBe(0);
  });
});

// ─── Type Exports ─────────────────────────────────────────────────────────

describe("Type exports", () => {
  it("SourceType values are valid", () => {
    const validTypes: SourceType[] = ["ai_generated", "digital_art", "hand_drawn"];
    expect(validTypes).toHaveLength(3);
  });

  it("StyleTransferOption values are valid", () => {
    const validOptions: StyleTransferOption[] = ["none", "enhance_only", "hybrid", "full_restyle"];
    expect(validOptions).toHaveLength(4);
  });

  it("DetectionResult interface shape", () => {
    const mock: DetectionResult = {
      sourceType: "ai_generated",
      confidence: 0.95,
      indicators: ["clean lines", "consistent shading"],
    };
    expect(mock.sourceType).toBe("ai_generated");
    expect(mock.confidence).toBeGreaterThan(0);
    expect(mock.indicators).toBeInstanceOf(Array);
  });

  it("SegmentationResult interface shape", () => {
    const mock: SegmentationResult = {
      panels: [
        { panelIndex: 0, x: 0, y: 0, width: 50, height: 50, readingOrder: 1 },
        { panelIndex: 1, x: 50, y: 0, width: 50, height: 50, readingOrder: 2 },
      ],
      totalPanelsDetected: 2,
      readingDirection: "rtl",
      pageWidth: 1000,
      pageHeight: 1500,
    };
    expect(mock.panels).toHaveLength(2);
    expect(mock.totalPanelsDetected).toBe(2);
  });

  it("PanelMetadata interface shape", () => {
    const mock: PanelMetadata = {
      sceneDescription: "A dramatic scene",
      cameraAngle: "close-up",
      mood: "tense",
      characters: ["Hero", "Villain"],
      action: "Fighting",
      backgroundType: "outdoor",
    };
    expect(mock.characters).toHaveLength(2);
    expect(typeof mock.sceneDescription).toBe("string");
  });
});

// ─── tRPC Router Registration ─────────────────────────────────────────────

describe("Upload tRPC router", () => {
  it("upload router is registered in main router", async () => {
    const { appRouter } = await import("./routers");
    // Check that the upload namespace exists
    expect((appRouter as any)._def.procedures).toBeDefined();
    // The router should have upload-prefixed procedures
    const procNames = Object.keys((appRouter as any)._def.procedures);
    const uploadProcs = procNames.filter(n => n.startsWith("upload."));
    expect(uploadProcs.length).toBeGreaterThan(0);
  });

  it("has uploadPage procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.uploadPage");
  });

  it("has detectSourceType procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.detectSourceType");
  });

  it("has segmentPage procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.segmentPage");
  });

  it("has processPanel procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.processPanel");
  });

  it("has applyStyleTransfer procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.applyStyleTransfer");
  });

  it("has extractDialogue procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.extractDialogue");
  });

  it("has autoFillMetadata procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.autoFillMetadata");
  });

  it("has getLimits procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.getLimits");
  });

  it("has getStyleTransferOptions procedure", async () => {
    const { appRouter } = await import("./routers");
    const procNames = Object.keys((appRouter as any)._def.procedures);
    expect(procNames).toContain("upload.getStyleTransferOptions");
  });
});
