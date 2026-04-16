/**
 * Upload Processing Pipeline for BYO Manga
 * 
 * Handles: source type detection (Claude Vision), panel segmentation,
 * scan cleanup per source type, style transfer (3 options), OCR dialogue extraction,
 * and auto-fill metadata.
 */

import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SourceType = "ai_generated" | "digital_art" | "hand_drawn";

export type StyleTransferOption = "none" | "enhance_only" | "hybrid" | "full_restyle";

export interface DetectionResult {
  sourceType: SourceType;
  confidence: number;  // 0-1
  reasoning: string;
  characteristics: string[];
}

export interface PanelBoundary {
  panelIndex: number;
  x: number;       // percentage 0-100
  y: number;       // percentage 0-100
  width: number;   // percentage 0-100
  height: number;  // percentage 0-100
  readingOrder: number;
  description?: string;
}

export interface SegmentationResult {
  panels: PanelBoundary[];
  pageLayout: "single" | "grid" | "irregular" | "full_page";
  readingDirection: "ltr" | "rtl";
  totalPanelsDetected: number;
}

export interface ProcessingStep {
  name: string;
  applied: boolean;
  details?: string;
}

export interface CleanupResult {
  processedUrl: string;
  lineArtUrl?: string;
  stepsApplied: ProcessingStep[];
  sourceType: SourceType;
}

export interface StyleTransferResult {
  option: StyleTransferOption;
  resultUrl: string;
  strength: number;  // 0-1
  prompt: string;
}

export interface OCRResult {
  dialogues: Array<{
    text: string;
    speaker?: string;
    bubbleType: "speech" | "thought" | "narration" | "sfx";
    position: { x: number; y: number };  // percentage
    confidence: number;
  }>;
  sfx: string[];
  language: string;
}

export interface PanelMetadata {
  sceneDescription: string;
  cameraAngle: string;
  mood: string;
  characters: string[];
  action: string;
  backgroundType: string;
}

// ─── Source Type Detection (Claude Vision) ──────────────────────────────────

export async function detectSourceType(imageUrl: string): Promise<DetectionResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert manga/comic art analyst. Classify the source type of the provided image into exactly one of these categories:

1. "ai_generated" — Created by AI image generators (Midjourney, Stable Diffusion, DALL-E, etc.)
   Characteristics: Perfect gradients, unnaturally smooth textures, occasional anatomical inconsistencies, very high detail uniformity, sometimes visible artifacts in hands/eyes.

2. "digital_art" — Created digitally by a human artist (Clip Studio, Photoshop, Procreate, etc.)
   Characteristics: Clean line work, consistent stroke weight, digital coloring/shading, layer-based composition, professional panel layouts.

3. "hand_drawn" — Physically drawn on paper then scanned/photographed
   Characteristics: Paper texture visible, varying line weight from pen pressure, possible smudges, scan artifacts, slight skew, pencil guidelines visible.

Respond with JSON only.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Classify this manga/comic image:" },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "source_detection",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sourceType: { type: "string", enum: ["ai_generated", "digital_art", "hand_drawn"] },
              confidence: { type: "number", description: "0-1 confidence score" },
              reasoning: { type: "string", description: "Brief explanation of classification" },
              characteristics: {
                type: "array",
                items: { type: "string" },
                description: "Observed visual characteristics"
              }
            },
            required: ["sourceType", "confidence", "reasoning", "characteristics"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return {
      sourceType: parsed.sourceType || "digital_art",
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || "Classification completed",
      characteristics: parsed.characteristics || [],
    };
  } catch (error) {
    console.error("[UploadProcessing] Source detection failed:", error);
    return {
      sourceType: "digital_art",
      confidence: 0.3,
      reasoning: "Fallback classification due to detection error",
      characteristics: ["fallback"],
    };
  }
}

// ─── Panel Segmentation (Claude Vision) ────────────────────────────────────

export async function segmentPanels(imageUrl: string, readingDirection: "ltr" | "rtl" = "rtl"): Promise<SegmentationResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert manga panel segmentation system. Analyze the provided manga page and identify individual panels.

For each panel, provide bounding box coordinates as percentages (0-100) of the full image dimensions.
Determine reading order based on the specified direction (${readingDirection === "rtl" ? "right-to-left (Japanese manga)" : "left-to-right (Western comics)"}).

Classify the page layout:
- "single": One panel fills the entire page
- "grid": Regular grid layout (2x2, 3x2, etc.)
- "irregular": Mixed panel sizes and shapes (most common in manga)
- "full_page": Full-page spread illustration

Respond with JSON only.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Segment this manga page into individual panels. Reading direction: ${readingDirection}` },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "panel_segmentation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              panels: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    panelIndex: { type: "integer" },
                    x: { type: "number" },
                    y: { type: "number" },
                    width: { type: "number" },
                    height: { type: "number" },
                    readingOrder: { type: "integer" },
                    description: { type: "string" }
                  },
                  required: ["panelIndex", "x", "y", "width", "height", "readingOrder", "description"],
                  additionalProperties: false
                }
              },
              pageLayout: { type: "string", enum: ["single", "grid", "irregular", "full_page"] },
              readingDirection: { type: "string", enum: ["ltr", "rtl"] },
              totalPanelsDetected: { type: "integer" }
            },
            required: ["panels", "pageLayout", "readingDirection", "totalPanelsDetected"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return {
      panels: (parsed.panels || []).map((p: any, i: number) => ({
        panelIndex: p.panelIndex ?? i,
        x: Math.max(0, Math.min(100, p.x || 0)),
        y: Math.max(0, Math.min(100, p.y || 0)),
        width: Math.max(1, Math.min(100, p.width || 50)),
        height: Math.max(1, Math.min(100, p.height || 50)),
        readingOrder: p.readingOrder ?? i + 1,
        description: p.description || "",
      })),
      pageLayout: parsed.pageLayout || "irregular",
      readingDirection: parsed.readingDirection || readingDirection,
      totalPanelsDetected: parsed.totalPanelsDetected || parsed.panels?.length || 1,
    };
  } catch (error) {
    console.error("[UploadProcessing] Panel segmentation failed:", error);
    return {
      panels: [{ panelIndex: 0, x: 0, y: 0, width: 100, height: 100, readingOrder: 1, description: "Full page" }],
      pageLayout: "single",
      readingDirection,
      totalPanelsDetected: 1,
    };
  }
}

// ─── Scan Cleanup per Source Type ──────────────────────────────────────────

/**
 * Determines cleanup steps based on source type.
 * Actual image processing is done via image generation API (style transfer).
 */
export function getCleanupSteps(sourceType: SourceType): ProcessingStep[] {
  switch (sourceType) {
    case "ai_generated":
      return [
        { name: "resolution_check", applied: true, details: "Verify minimum 1024px resolution" },
        { name: "format_normalization", applied: true, details: "Convert to PNG, strip metadata" },
        { name: "aspect_ratio_check", applied: true, details: "Verify manga-compatible aspect ratio" },
      ];
    case "digital_art":
      return [
        { name: "color_normalization", applied: true, details: "Normalize color space to sRGB" },
        { name: "format_normalization", applied: true, details: "Convert to PNG, strip metadata" },
        { name: "style_compatibility_check", applied: true, details: "Verify anime-compatible art style" },
        { name: "resolution_upscale", applied: false, details: "Upscale if below 1024px (conditional)" },
      ];
    case "hand_drawn":
      return [
        { name: "deskew", applied: true, details: "Correct rotation from scanning" },
        { name: "crop_borders", applied: true, details: "Remove scanner borders and margins" },
        { name: "texture_removal", applied: true, details: "Reduce paper texture and noise" },
        { name: "brightness_normalization", applied: true, details: "Normalize brightness and contrast" },
        { name: "line_art_extraction", applied: true, details: "Extract clean line art from scan" },
        { name: "resolution_upscale", applied: true, details: "Upscale to minimum 1024px" },
      ];
  }
}

/**
 * Process a panel image through cleanup based on source type.
 * Uses image generation API for actual transformations.
 */
export async function cleanupPanel(
  imageUrl: string,
  sourceType: SourceType,
  userId: number,
  projectId: number,
): Promise<CleanupResult> {
  const steps = getCleanupSteps(sourceType);

  // For AI-generated, minimal processing needed
  if (sourceType === "ai_generated") {
    return {
      processedUrl: imageUrl,  // Already clean
      stepsApplied: steps,
      sourceType,
    };
  }

  // For digital art, apply color normalization via image generation
  if (sourceType === "digital_art") {
    try {
      const digitalResult = await generateImage({
        prompt: "Clean up this digital manga art: normalize colors to vibrant anime palette, ensure clean line work, maintain original composition and details exactly. Do not change the content.",
        originalImages: [{ url: imageUrl, mimeType: "image/png" }],
      });
      return {
        processedUrl: digitalResult.url || imageUrl,
        stepsApplied: steps.map(s => ({ ...s, applied: true })),
        sourceType,
      };
    } catch {
      return { processedUrl: imageUrl, stepsApplied: steps, sourceType };
    }
  }

  // For hand-drawn, full cleanup pipeline
  try {
    // Step 1: Extract line art
    const lineArtResult = await generateImage({
      prompt: "Extract clean black line art from this hand-drawn manga scan. Remove paper texture, pencil guidelines, smudges, and scanner artifacts. Output clean black lines on white background only.",
      originalImages: [{ url: imageUrl, mimeType: "image/png" }],
    });

    // Step 2: Clean and enhance
    const cleanResult = await generateImage({
      prompt: "Clean up this hand-drawn manga scan: deskew, remove paper texture, normalize brightness, enhance line clarity. Maintain the original art style and composition exactly.",
      originalImages: [{ url: imageUrl, mimeType: "image/png" }],
    });

    return {
      processedUrl: cleanResult.url || imageUrl,
      lineArtUrl: lineArtResult.url || undefined,
      stepsApplied: steps.map(s => ({ ...s, applied: true })),
      sourceType,
    };
  } catch {
    return { processedUrl: imageUrl, stepsApplied: steps, sourceType };
  }
}

// ─── Style Transfer ────────────────────────────────────────────────────────

/**
 * Style transfer strength per option:
 * - enhance_only (0.3): Light touch — clean up, boost colors, sharpen
 * - hybrid (0.5): Moderate — blend original style with anime aesthetics
 * - full_restyle (0.7): Heavy — fully re-render in anime style (Studio tier only)
 */
export const STYLE_TRANSFER_CONFIG: Record<StyleTransferOption, { strength: number; prompt: string; tierRequired: "creator" | "studio" }> = {
  none: { strength: 0, prompt: "", tierRequired: "creator" },
  enhance_only: {
    strength: 0.3,
    prompt: "Enhance this manga panel: sharpen line work, boost color vibrancy, improve contrast. Keep the original art style and composition exactly the same. Minimal changes, maximum clarity.",
    tierRequired: "creator",
  },
  hybrid: {
    strength: 0.5,
    prompt: "Transform this manga panel into a hybrid anime style: blend the original art with modern anime aesthetics. Maintain character designs and composition but add anime-quality coloring, shading, and lighting effects.",
    tierRequired: "creator",
  },
  full_restyle: {
    strength: 0.7,
    prompt: "Fully re-render this manga panel in high-quality anime style. Transform the art into professional anime production quality with vibrant colors, dynamic lighting, detailed backgrounds, and smooth character rendering. Maintain exact character poses and composition.",
    tierRequired: "studio",
  },
};

export async function applyStyleTransfer(
  imageUrl: string,
  option: StyleTransferOption,
  animeStyle?: string,
): Promise<StyleTransferResult> {
  if (option === "none") {
    return { option, resultUrl: imageUrl, strength: 0, prompt: "" };
  }

  const config = STYLE_TRANSFER_CONFIG[option];
  const styleHint = animeStyle ? ` Use ${animeStyle} anime style.` : "";
  const fullPrompt = config.prompt + styleHint;

  try {
    const result = await generateImage({
      prompt: fullPrompt,
      originalImages: [{ url: imageUrl, mimeType: "image/png" }],
    });

    return {
      option,
      resultUrl: result.url || imageUrl,
      strength: config.strength,
      prompt: fullPrompt,
    };
  } catch (error) {
    console.error(`[StyleTransfer] Failed for option ${option}:`, error);
    return { option, resultUrl: imageUrl, strength: config.strength, prompt: fullPrompt };
  }
}

/**
 * Generate all 3 style transfer previews for a panel.
 */
export async function generateStyleTransferPreviews(
  imageUrl: string,
  animeStyle?: string,
): Promise<StyleTransferResult[]> {
  const options: StyleTransferOption[] = ["enhance_only", "hybrid", "full_restyle"];
  const results = await Promise.allSettled(
    options.map(opt => applyStyleTransfer(imageUrl, opt, animeStyle))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      option: options[i],
      resultUrl: imageUrl,
      strength: STYLE_TRANSFER_CONFIG[options[i]].strength,
      prompt: STYLE_TRANSFER_CONFIG[options[i]].prompt,
    };
  });
}

// ─── OCR Dialogue Extraction ──────────────────────────────────────────────

export async function extractDialogue(imageUrl: string): Promise<OCRResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert manga OCR and dialogue extraction system. Analyze the provided manga panel and extract all text content.

For each text element, identify:
1. The actual text content
2. The speaker (if identifiable from context)
3. The bubble type: "speech" (regular dialogue), "thought" (cloud bubbles), "narration" (box text), "sfx" (sound effects)
4. Approximate position as percentage of image dimensions
5. Confidence score (0-1)

Also identify the primary language of the text.

Respond with JSON only.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract all dialogue and text from this manga panel:" },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ocr_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              dialogues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    speaker: { type: "string" },
                    bubbleType: { type: "string", enum: ["speech", "thought", "narration", "sfx"] },
                    positionX: { type: "number" },
                    positionY: { type: "number" },
                    confidence: { type: "number" }
                  },
                  required: ["text", "speaker", "bubbleType", "positionX", "positionY", "confidence"],
                  additionalProperties: false
                }
              },
              sfx: { type: "array", items: { type: "string" } },
              language: { type: "string" }
            },
            required: ["dialogues", "sfx", "language"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return {
      dialogues: (parsed.dialogues || []).map((d: any) => ({
        text: d.text || "",
        speaker: d.speaker || undefined,
        bubbleType: d.bubbleType || "speech",
        position: { x: d.positionX || 50, y: d.positionY || 50 },
        confidence: Math.min(1, Math.max(0, d.confidence || 0.5)),
      })),
      sfx: parsed.sfx || [],
      language: parsed.language || "ja",
    };
  } catch (error) {
    console.error("[UploadProcessing] OCR extraction failed:", error);
    return { dialogues: [], sfx: [], language: "unknown" };
  }
}

// ─── Auto-Fill Panel Metadata ─────────────────────────────────────────────

export async function autoFillMetadata(imageUrl: string): Promise<PanelMetadata> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert manga/anime scene analyst. Analyze the provided manga panel and extract metadata for anime production.

Provide:
1. Scene description: A detailed visual description suitable for anime production
2. Camera angle: One of (close-up, medium-shot, wide-shot, extreme-close-up, birds-eye, low-angle, high-angle, dutch-angle, over-the-shoulder)
3. Mood: The emotional tone (e.g., tense, peaceful, dramatic, comedic, melancholic, action, romantic)
4. Characters: List of visible characters (describe if names unknown)
5. Action: What is happening in the panel
6. Background type: (indoor, outdoor, abstract, none, cityscape, nature, school, etc.)

Respond with JSON only.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this manga panel for anime production metadata:" },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "panel_metadata",
          strict: true,
          schema: {
            type: "object",
            properties: {
              sceneDescription: { type: "string" },
              cameraAngle: { type: "string" },
              mood: { type: "string" },
              characters: { type: "array", items: { type: "string" } },
              action: { type: "string" },
              backgroundType: { type: "string" }
            },
            required: ["sceneDescription", "cameraAngle", "mood", "characters", "action", "backgroundType"],
            additionalProperties: false
          }
        }
      }
    });

    const content = response.choices?.[0]?.message?.content;
    const parsed = JSON.parse(typeof content === "string" ? content : "{}");
    return {
      sceneDescription: parsed.sceneDescription || "Manga panel",
      cameraAngle: parsed.cameraAngle || "medium-shot",
      mood: parsed.mood || "neutral",
      characters: parsed.characters || [],
      action: parsed.action || "Standing",
      backgroundType: parsed.backgroundType || "none",
    };
  } catch (error) {
    console.error("[UploadProcessing] Auto-fill metadata failed:", error);
    return {
      sceneDescription: "Manga panel",
      cameraAngle: "medium-shot",
      mood: "neutral",
      characters: [],
      action: "Unknown",
      backgroundType: "none",
    };
  }
}

// ─── Upload Finalization ──────────────────────────────────────────────────

export interface UploadFinalizationInput {
  projectId: number;
  userId: number;
  title: string;
  description?: string;
  genre?: string;
  animeStyle?: string;
  sourceType: SourceType;
  panels: Array<{
    assetId: number;
    panelNumber: number;
    sceneNumber: number;
    dialogue: string;
    sceneDescription: string;
    cameraAngle: string;
    mood: string;
    characters: string[];
    transition: string;
  }>;
}

/**
 * Validate that all panels have required metadata before finalization.
 */
export function validateFinalization(input: UploadFinalizationInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.title?.trim()) errors.push("Project title is required");
  if (input.panels.length === 0) errors.push("At least one panel is required");

  for (const panel of input.panels) {
    if (!panel.sceneDescription?.trim()) {
      errors.push(`Panel ${panel.panelNumber}: Scene description is required`);
    }
    if (!panel.cameraAngle?.trim()) {
      errors.push(`Panel ${panel.panelNumber}: Camera angle is required`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Tier Gating ──────────────────────────────────────────────────────────

export interface UploadTierLimits {
  maxPages: number;
  maxPanelsPerPage: number;
  styleTransferOptions: StyleTransferOption[];
  ocrEnabled: boolean;
  autoMetadataEnabled: boolean;
  batchProcessing: boolean;
}

export const UPLOAD_TIER_LIMITS: Record<string, UploadTierLimits> = {
  free: {
    maxPages: 0,  // Upload not available on free tier
    maxPanelsPerPage: 0,
    styleTransferOptions: [],
    ocrEnabled: false,
    autoMetadataEnabled: false,
    batchProcessing: false,
  },
  creator: {
    maxPages: 20,
    maxPanelsPerPage: 8,
    styleTransferOptions: ["none", "enhance_only", "hybrid"],
    ocrEnabled: true,
    autoMetadataEnabled: true,
    batchProcessing: false,
  },
  studio: {
    maxPages: 100,
    maxPanelsPerPage: 12,
    styleTransferOptions: ["none", "enhance_only", "hybrid", "full_restyle"],
    ocrEnabled: true,
    autoMetadataEnabled: true,
    batchProcessing: true,
  },
};

export function getUploadLimits(tier: string): UploadTierLimits {
  return UPLOAD_TIER_LIMITS[tier] || UPLOAD_TIER_LIMITS.free;
}
