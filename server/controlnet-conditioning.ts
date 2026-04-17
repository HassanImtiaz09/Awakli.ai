/**
 * Prompt 22 — ControlNet Conditioning Module
 *
 * Manages ControlNet mode selection, conditioning strength configuration,
 * and payload building for diffusion model injection.
 *
 * Modes: Canny (hard edges), Lineart (soft edges), Lineart_anime (default), Depth (planned)
 * Co-injection with LoRA is supported — complementary operation on same diffusion pass.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type ControlnetMode = "canny" | "lineart" | "lineart_anime" | "depth";
export type SceneType = "dialogue" | "action" | "establishing" | "reaction" | "montage" | "transition";

export interface ConditioningConfig {
  sceneType: SceneType;
  controlnetMode: ControlnetMode;
  conditioningStrength: number;
  extractionMethod: "canny" | "anime2sketch";
}

export interface ConditionedPayload {
  controlImageUrl: string;
  controlType: ControlnetMode;
  controlStrength: number;
  preprocessor: "none" | "canny" | "lineart" | "lineart_anime";
  guidanceStart: number;
  guidanceEnd: number;
  // LoRA co-injection fields (optional)
  loraModelUrl?: string;
  loraStrength?: number;
  loraTriggerWord?: string;
}

export interface TestImageRequest {
  controlImageUrl: string;
  controlType: ControlnetMode;
  controlStrength: number;
  prompt: string;
  width: number;
  height: number;
  steps: number;
  seed?: number;
}

export interface TestImageResult {
  imageUrl: string;
  generationTimeMs: number;
  costCredits: number;
  seed: number;
  controlType: ControlnetMode;
  controlStrength: number;
}

export interface FidelityComparisonPayload {
  conditionedImageUrl: string;
  unconditionedImageUrl: string;
  lineartImageUrl: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Default conditioning strength per scene type (from spec) */
export const SCENE_TYPE_DEFAULTS: Record<SceneType, ConditioningConfig> = {
  dialogue: {
    sceneType: "dialogue",
    controlnetMode: "lineart_anime",
    conditioningStrength: 0.50,
    extractionMethod: "anime2sketch",
  },
  action: {
    sceneType: "action",
    controlnetMode: "lineart_anime",
    conditioningStrength: 0.80,
    extractionMethod: "canny",
  },
  establishing: {
    sceneType: "establishing",
    controlnetMode: "lineart_anime",
    conditioningStrength: 0.70,
    extractionMethod: "canny",
  },
  reaction: {
    sceneType: "reaction",
    controlnetMode: "lineart_anime",
    conditioningStrength: 0.60,
    extractionMethod: "anime2sketch",
  },
  montage: {
    sceneType: "montage",
    controlnetMode: "lineart_anime",
    conditioningStrength: 0.40,
    extractionMethod: "anime2sketch",
  },
  transition: {
    sceneType: "transition",
    controlnetMode: "canny",
    conditioningStrength: 0.30,
    extractionMethod: "canny",
  },
};

export const ALL_SCENE_TYPES: SceneType[] = [
  "dialogue", "action", "establishing", "reaction", "montage", "transition",
];

/** Conditioning strength ranges with labels */
export const STRENGTH_RANGES = [
  { min: 0.0, max: 0.29, label: "Minimal", description: "Very loose guidance, mostly creative freedom" },
  { min: 0.3, max: 0.5, label: "Loose", description: "Loose guidance for montage and creative scenes" },
  { min: 0.51, max: 0.7, label: "Moderate", description: "Moderate control for dialogue and reaction" },
  { min: 0.71, max: 0.8, label: "Tight", description: "Tight control for action and establishing shots" },
  { min: 0.81, max: 1.0, label: "Strict", description: "Strict adherence for architectural detail" },
] as const;

/** ControlNet mode descriptions */
export const MODE_DESCRIPTIONS: Record<ControlnetMode, { label: string; description: string; edgeType: string }> = {
  canny: {
    label: "Canny",
    description: "Hard mechanical edges with strict structural adherence",
    edgeType: "hard",
  },
  lineart: {
    label: "Lineart",
    description: "Soft edges (Canny + Gaussian blur σ=2.0) with moderate guidance",
    edgeType: "soft",
  },
  lineart_anime: {
    label: "Lineart Anime",
    description: "Anime-optimized via Anime2Sketch model output (recommended)",
    edgeType: "anime",
  },
  depth: {
    label: "Depth",
    description: "MiDaS depth maps for spatial guidance (V2 planned)",
    edgeType: "depth",
  },
};

/** Test image generation parameters */
export const TEST_IMAGE_CONFIG = {
  width: 512,
  height: 512,
  steps: 20,
  maxCostCredits: 0.5,
  maxTimeSeconds: 30,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────

export function getStrengthLabel(strength: number): string {
  for (const range of STRENGTH_RANGES) {
    if (strength >= range.min && strength <= range.max) {
      return range.label;
    }
  }
  return "Custom";
}

export function getStrengthDescription(strength: number): string {
  for (const range of STRENGTH_RANGES) {
    if (strength >= range.min && strength <= range.max) {
      return range.description;
    }
  }
  return "Custom conditioning strength";
}

export function clampStrength(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 20) / 20; // Step 0.05
}

export function getDefaultConfig(sceneType: SceneType): ConditioningConfig {
  return { ...SCENE_TYPE_DEFAULTS[sceneType] };
}

export function getAllDefaults(): ConditioningConfig[] {
  return ALL_SCENE_TYPES.map(st => getDefaultConfig(st));
}

// ─── Payload Building ───────────────────────────────────────────────────

/**
 * Determine the preprocessor based on ControlNet mode.
 * For lineart_anime, the input is already preprocessed by Anime2Sketch,
 * so we use "none" to avoid double-processing.
 */
function getPreprocessor(mode: ControlnetMode): "none" | "canny" | "lineart" | "lineart_anime" {
  switch (mode) {
    case "canny": return "canny";
    case "lineart": return "lineart";
    case "lineart_anime": return "none"; // Already preprocessed
    case "depth": return "none";
    default: return "none";
  }
}

/**
 * Compute guidance start/end based on conditioning strength.
 * Higher strength = earlier start, later end.
 */
function computeGuidanceRange(strength: number): { start: number; end: number } {
  // Strength 0.3 → start=0.2, end=0.8
  // Strength 0.8 → start=0.0, end=1.0
  const start = Math.max(0, 0.4 - strength * 0.5);
  const end = Math.min(1.0, 0.6 + strength * 0.5);
  return {
    start: Math.round(start * 100) / 100,
    end: Math.round(end * 100) / 100,
  };
}

/**
 * Build the conditioned payload for the diffusion model.
 * Supports optional LoRA co-injection.
 */
export function buildConditionedPayload(
  controlImageUrl: string,
  config: ConditioningConfig,
  loraOptions?: { modelUrl: string; strength: number; triggerWord?: string },
): ConditionedPayload {
  const { start, end } = computeGuidanceRange(config.conditioningStrength);

  const payload: ConditionedPayload = {
    controlImageUrl,
    controlType: config.controlnetMode,
    controlStrength: config.conditioningStrength,
    preprocessor: getPreprocessor(config.controlnetMode),
    guidanceStart: start,
    guidanceEnd: end,
  };

  if (loraOptions) {
    payload.loraModelUrl = loraOptions.modelUrl;
    payload.loraStrength = loraOptions.strength;
    payload.loraTriggerWord = loraOptions.triggerWord;
  }

  return payload;
}

/**
 * Build a test image generation request.
 */
export function buildTestImageRequest(
  controlImageUrl: string,
  config: ConditioningConfig,
  prompt: string,
  seed?: number,
): TestImageRequest {
  return {
    controlImageUrl,
    controlType: config.controlnetMode,
    controlStrength: config.conditioningStrength,
    prompt,
    width: TEST_IMAGE_CONFIG.width,
    height: TEST_IMAGE_CONFIG.height,
    steps: TEST_IMAGE_CONFIG.steps,
    seed,
  };
}

/**
 * Simulate a test image generation result.
 */
export function simulateTestImageResult(
  request: TestImageRequest,
): TestImageResult {
  const seed = request.seed ?? Math.floor(Math.random() * 999999999);
  const generationTimeMs = Math.round(5000 + Math.random() * 15000); // 5-20s
  const costCredits = 0.3 + Math.random() * 0.15; // 0.30-0.45 credits

  return {
    imageUrl: `https://storage.awakli.ai/test-gen/${Date.now()}_seed${seed}.png`,
    generationTimeMs,
    costCredits: Math.round(costCredits * 100) / 100,
    seed,
    controlType: request.controlType,
    controlStrength: request.controlStrength,
  };
}

// ─── Integration Helpers ────────────────────────────────────────────────

/**
 * Scene-type-specific integration rules from the spec.
 */
export interface IntegrationRule {
  sceneType: SceneType;
  lineartUsage: string;
  controlnetOnInpainting: boolean;
  keyframeOnly: boolean;
  notes: string;
}

export const INTEGRATION_RULES: Record<SceneType, IntegrationRule> = {
  dialogue: {
    sceneType: "dialogue",
    lineartUsage: "Guides base frame at 0.5 strength",
    controlnetOnInpainting: false,
    keyframeOnly: false,
    notes: "No ControlNet on dialogue inpainting pass",
  },
  action: {
    sceneType: "action",
    lineartUsage: "AnimateDiff with lineart_anime at 0.8 on keyframe",
    controlnetOnInpainting: false,
    keyframeOnly: true,
    notes: "ControlNet applied to keyframe only, AnimateDiff handles interpolation",
  },
  establishing: {
    sceneType: "establishing",
    lineartUsage: "Hero image at 0.7, then Ken Burns animation",
    controlnetOnInpainting: false,
    keyframeOnly: true,
    notes: "Single hero frame conditioned, camera motion added post-generation",
  },
  reaction: {
    sceneType: "reaction",
    lineartUsage: "Cached base frame already conditioned",
    controlnetOnInpainting: false,
    keyframeOnly: false,
    notes: "Expression overlays only, no re-conditioning needed",
  },
  montage: {
    sceneType: "montage",
    lineartUsage: "Per-panel lineart at 0.4 for creative variation",
    controlnetOnInpainting: false,
    keyframeOnly: false,
    notes: "Lower strength allows more creative freedom between panels",
  },
  transition: {
    sceneType: "transition",
    lineartUsage: "Canny mode at 0.3 for minimal structural guidance",
    controlnetOnInpainting: false,
    keyframeOnly: false,
    notes: "Loose guidance preserves transition fluidity",
  },
};
