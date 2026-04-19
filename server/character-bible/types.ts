/**
 * P26 Character Bible & Spatial Consistency — Type Definitions
 *
 * Authoritative type system for the 5-stage pipeline:
 *   Stage 1: Character Bible Generator
 *   Stage 2: Identity Lock-in (IP-Adapter / TAMS LoRA)
 *   Stage 3: Shot Planner (OpenPose + Depth)
 *   Stage 4: Panel Generation (ControlNet stack)
 *   Stage 5: Spatial QA Gate
 *
 * @see Awakli_Prompt26_CharacterBible_SpatialConsistency_v1_0.docx
 */

// ─── Character Attributes (§3.2) ────────────────────────────────────────

export interface CharacterAttributes {
  heightCm: number;
  build: "slim" | "average" | "athletic" | "muscular" | "heavyset";
  ageBracket: "child" | "teen" | "young_adult" | "adult" | "elderly";
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  skinTone: string;
  /** Max 5 distinguishing features */
  distinguishingFeatures: string[];
  defaultOutfit: string;
}

// ─── Character Identity (§4, §5) ────────────────────────────────────────

export type IdentityMode = "ip_adapter" | "lora" | "none";

export interface CharacterIdentity {
  /** URL to the 1536×1024 triple-pose reference sheet */
  referenceSheetUrl?: string;
  /** Seed used to generate the reference sheet */
  referenceSheetSeed?: number;
  /** Current identity lock mode */
  identityMode: IdentityMode;
  /** Front-view face crop URL for IP-Adapter injection */
  ipAdapterRefUrl?: string;
  /** IP-Adapter weight (default 0.65) */
  ipAdapterWeight?: number;
  /** LoRA .safetensors URL (TAMS output) */
  loraUrl?: string;
  /** LoRA weight (default 0.7) */
  loraWeight?: number;
  /** LoRA trigger word: awk_{characterId} */
  loraTriggerWord?: string;
  /** LoRA training status */
  loraTrainingStatus?: "pending" | "training" | "completed" | "failed";
  /** ArcFace-style face embedding (128-d float array) for QA gate */
  faceEmbedding?: number[];
}

// ─── Character Entry (§3.2) ─────────────────────────────────────────────

export interface CharacterEntry {
  /** Unique character ID within the registry */
  characterId: string;
  /** Display name */
  name: string;
  /** Narrative role */
  role: "protagonist" | "antagonist" | "supporting" | "background";
  /** Visual attributes */
  attributes: CharacterAttributes;
  /** Identity lock-in data */
  identity: CharacterIdentity;
  /** Whether attributes were inferred by LLM (user can override) */
  inferredFields?: string[];
}

// ─── Character Registry (§3.2) ──────────────────────────────────────────

export interface CharacterRegistry {
  /** All characters in the story */
  characters: CharacterEntry[];
  /** Tallest character height in cm (for ratio calculations) */
  tallestHeightCm: number;
  /** Art style for this registry */
  artStyle: string;
  /** Genre context */
  genre: string;
}

// ─── Shot Planner Types (§6) ────────────────────────────────────────────

export interface CharacterPlacement {
  characterId: string;
  /** Scale factor = character heightCm / tallestHeightCm */
  scaleFactor: number;
  /** X position (0.0–1.0 normalized) */
  x: number;
  /** Y position (feet on ground plane, 0.0 = bottom) */
  y: number;
  /** Depth layer (0 = closest to camera) */
  depthLayer: number;
  /** Pose description for OpenPose */
  pose: string;
}

export interface ShotPlan {
  /** Panel ID this plan is for */
  panelId: number;
  /** Scene number */
  sceneNumber: number;
  /** Panel number within scene */
  panelNumber: number;
  /** Camera angle */
  cameraAngle: string;
  /** Characters placed in the shot */
  characterPlacements: CharacterPlacement[];
  /** Regional prompt segments for multi-character panels */
  regionalPrompts?: RegionalPrompt[];
  /** ControlNet conditioning data */
  controlNet?: {
    /** OpenPose skeleton image URL */
    openposeUrl?: string;
    /** Depth map image URL */
    depthMapUrl?: string;
    /** Conditioning strength (0.0–1.0) */
    strength: number;
  };
}

export interface RegionalPrompt {
  /** Character ID this region is for */
  characterId: string;
  /** Bounding box (normalized 0.0–1.0) */
  bbox: { x: number; y: number; width: number; height: number };
  /** Prompt for this region */
  prompt: string;
}

// ─── Quality Tier (§7.1) ────────────────────────────────────────────────

export interface QualityTier {
  name: "draft" | "hero";
  steps: number;
  width: number;
  height: number;
  cfgScale: number;
  numResults: number;
  /** Estimated seconds per panel */
  estimatedSecondsPerPanel: number;
}

export const QUALITY_TIERS: Record<string, QualityTier> = {
  draft: {
    name: "draft",
    steps: 25,
    width: 768,
    height: 1152,
    cfgScale: 6.0,
    numResults: 1,
    estimatedSecondsPerPanel: 3,
  },
  hero: {
    name: "hero",
    steps: 40,
    width: 1024,
    height: 1536,
    cfgScale: 7.5,
    numResults: 2,
    estimatedSecondsPerPanel: 7,
  },
};

// ─── Spatial QA Types (§8) ──────────────────────────────────────────────

export type QaVerdict = "pass" | "soft_fail" | "hard_fail";

export interface FaceSimilarityResult {
  characterId: string;
  score: number;
  verdict: QaVerdict;
}

export interface HeightRatioResult {
  characterId: string;
  expectedRatio: number;
  actualRatio: number;
  deviationPercent: number;
  verdict: QaVerdict;
}

export interface StyleCoherenceResult {
  score: number;
  verdict: QaVerdict;
}

export interface SpatialQaCheckResult {
  panelId: number;
  faceSimilarity: FaceSimilarityResult[];
  heightRatio: HeightRatioResult[];
  styleCoherence: StyleCoherenceResult;
  overallVerdict: QaVerdict;
  shouldRegenerate: boolean;
  regenerationHint?: string;
}

// ─── QA Thresholds (§8.1) ──────────────────────────────────────────────

export const QA_THRESHOLDS = {
  faceSimilarity: {
    pass: 0.75,
    softFail: 0.60,
  },
  heightRatio: {
    /** Max deviation % for pass */
    pass: 10,
    /** Max deviation % for soft fail */
    softFail: 20,
  },
  styleCoherence: {
    pass: 0.80,
    softFail: 0.65,
  },
  /** Max regeneration attempts per panel */
  maxRegenAttempts: 3,
  /** Regen budget multiplier per scene */
  regenBudgetMultiplier: 3,
} as const;

// ─── Character-Aware Generation Job (§7) ────────────────────────────────

export interface CharacterAwareGenerationJob {
  /** Panel ID */
  panelId: number;
  /** Episode ID */
  episodeId: number;
  /** Project ID */
  projectId: number;
  /** Scene number */
  sceneNumber: number;
  /** Panel number */
  panelNumber: number;
  /** Quality tier */
  qualityTier: QualityTier;
  /** Base visual description from script */
  visualDescription: string;
  /** Camera angle */
  cameraAngle: string;
  /** Characters in this panel */
  characters: CharacterEntry[];
  /** Shot plan with placements */
  shotPlan?: ShotPlan;
  /** Pinned provider for this scene */
  pinnedProviderId?: string;
  /** Character reference URL for IP-Adapter */
  characterRefUrl?: string;
  /** Seed for reproducibility */
  seed?: number;
}

// ─── Pipeline Stage Status ──────────────────────────────────────────────

export type PipelineStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface CharacterBiblePipelineState {
  stage1_extraction: PipelineStageStatus;
  stage2_identity: PipelineStageStatus;
  stage3_shotPlan: PipelineStageStatus;
  stage4_generation: PipelineStageStatus;
  stage5_qa: PipelineStageStatus;
  registryVersion: number;
  totalPanels: number;
  completedPanels: number;
  failedPanels: number;
  qaPassRate: number;
}
