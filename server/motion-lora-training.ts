/**
 * Motion LoRA Training Harness (Prompt 24 — TASK-1)
 *
 * 4-layer LoRA stack: Base → Style → Appearance → Motion (→ optional Scene)
 * Motion LoRA fires ONLY during Stage 6 (video generation), NOT Stage 5 (static panels).
 *
 * Supports two training paths:
 *   - SDXL path: Kohya-SS with AnimateDiff motion module
 *   - Wan path: Wan 2.1 fork with temporal attention injection
 *
 * Training corpus: 40+ clips per character, 3500-4000 steps.
 */

// ─── Constants ──────────────────────────────────────────────────────────

export const MOTION_LORA_VERSION = "1.0.0";

/** Minimum training clips required for motion LoRA */
export const MIN_TRAINING_CLIPS = 40;

/** Maximum training steps */
export const MAX_TRAINING_STEPS = 5000;

/** Default training steps */
export const DEFAULT_TRAINING_STEPS = 3500;

/** Motion LoRA weight range */
export const MOTION_LORA_WEIGHT_MIN = 0.30;
export const MOTION_LORA_WEIGHT_MAX = 0.85;
export const MOTION_LORA_WEIGHT_DEFAULT = 0.60;

/** Frame count range for training clips */
export const FRAME_COUNT_MIN = 16;
export const FRAME_COUNT_MAX = 24;
export const FRAME_COUNT_DEFAULT = 16;

/** Load order for the full LoRA stack */
export const LORA_STACK_LOAD_ORDER = [
  "base",           // Base model (SD/SDXL/Wan)
  "motion_module",  // AnimateDiff / Wan temporal module
  "style_lora",     // Art style LoRA
  "appearance_lora", // Character appearance LoRA
  "motion_lora",    // Character motion LoRA (this module)
  "scene_lora",     // Optional scene-specific LoRA
] as const;

export type LoraStackLayer = typeof LORA_STACK_LOAD_ORDER[number];

// ─── Training Path Types ────────────────────────────────────────────────

export type TrainingPath = "sdxl" | "wan";

export interface MotionLoraTrainingConfig {
  /** Character ID this motion LoRA is for */
  characterId: number;
  /** Character name for directory naming */
  characterName: string;
  /** Project ID */
  projectId: number;
  /** Training path: SDXL (Kohya-SS + AnimateDiff) or Wan (Wan 2.1 fork) */
  trainingPath: TrainingPath;
  /** Number of training steps (default: 3500) */
  trainingSteps: number;
  /** Network dimension (default: 64) */
  networkDim: number;
  /** Network alpha (default: 32) */
  networkAlpha: number;
  /** Learning rate (default: 1e-4) */
  learningRate: number;
  /** Text encoder learning rate (MUST be 0 — don't train text encoder) */
  textEncoderLr: 0;
  /** Frame count per training clip (default: 16) */
  frameCount: number;
  /** Flip augmentation (MUST be false for asymmetric features like scars) */
  flipAug: false;
  /** Training clip URLs */
  trainingClipUrls: string[];
  /** Caption file URLs (one per clip) */
  captionUrls: string[];
  /** Base model checkpoint path/URL */
  baseModelPath: string;
  /** Motion module path (AnimateDiff for SDXL, temporal module for Wan) */
  motionModulePath: string;
  /** Existing appearance LoRA path (loaded before training) */
  appearanceLoraPath?: string;
  /** Existing style LoRA path (loaded before training) */
  styleLoraPath?: string;
  /** Output directory for trained weights */
  outputDir: string;
  /** Optional: resume from checkpoint */
  resumeCheckpoint?: string;
}

export interface MotionLoraTrainingStatus {
  characterId: number;
  characterName: string;
  trainingPath: TrainingPath;
  status: "pending" | "preparing" | "training" | "evaluating" | "complete" | "failed";
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
  loss?: number;
  elapsedMs: number;
  estimatedRemainingMs?: number;
  outputPath?: string;
  error?: string;
  evaluationResults?: EvaluationGateResults;
}

// ─── Scene-Type → Motion LoRA Weight Map ────────────────────────────────

/**
 * Maps scene types to motion LoRA weight.
 * null = motion LoRA should NOT be applied for this scene type.
 */
export const SCENE_TYPE_MOTION_WEIGHT: Record<string, number | null> = {
  "action-combat":            0.75,
  "action-locomotion":        0.65,
  "reaction-peak":            0.70,
  "somatic-peak":             0.70,
  "establishing-environment": null,  // No motion LoRA — environment only
  "establishing-character":   0.50,
  "dialogue-static":          null,  // No motion LoRA — static talking head
  "dialogue-gestured":        0.55,
  "montage":                  0.60,
  "transition":               null,  // No motion LoRA — pure transition
  "kinetic":                  null,  // No motion LoRA — abstract kinetic
};

/**
 * Get the motion LoRA weight for a given scene type.
 * Returns null if motion LoRA should not be applied.
 */
export function getMotionLoraWeight(sceneType: string): number | null {
  return SCENE_TYPE_MOTION_WEIGHT[sceneType] ?? null;
}

/**
 * Check if a scene type qualifies for motion LoRA application.
 */
export function sceneQualifiesForMotionLora(sceneType: string): boolean {
  return getMotionLoraWeight(sceneType) !== null;
}

// ─── Evaluation Gates M1-M14 ────────────────────────────────────────────

export type EvaluationGateId =
  | "M1"  | "M2"  | "M3"  | "M4"  | "M5"  | "M6"  | "M7"
  | "M8"  | "M9"  | "M10" | "M11" | "M12" | "M13" | "M14";

export interface EvaluationGate {
  id: EvaluationGateId;
  name: string;
  description: string;
  category: "identity" | "motion" | "efficiency" | "regression";
  threshold: number;
  unit: string;
  /** Higher is better (true) or lower is better (false) */
  higherIsBetter: boolean;
}

export interface EvaluationGateResult {
  gateId: EvaluationGateId;
  passed: boolean;
  value: number;
  threshold: number;
  details?: string;
}

export interface EvaluationGateResults {
  characterId: number;
  characterName: string;
  trainingPath: TrainingPath;
  modelVersion: string;
  timestamp: number;
  gates: EvaluationGateResult[];
  overallPass: boolean;
  passCount: number;
  failCount: number;
  criticalFailures: EvaluationGateId[];
}

export const EVALUATION_GATES: EvaluationGate[] = [
  // ─── Identity Gates ───
  { id: "M1",  name: "Face Consistency",       description: "ArcFace cosine similarity across generated frames",                category: "identity",   threshold: 0.85, unit: "cosine_sim",  higherIsBetter: true },
  { id: "M2",  name: "No Gender Drift",        description: "Gender classification stays consistent across clips",              category: "identity",   threshold: 0.95, unit: "accuracy",    higherIsBetter: true },
  { id: "M3",  name: "No Style Drift",         description: "FID score between generated and reference style frames",           category: "identity",   threshold: 50,   unit: "FID",         higherIsBetter: false },
  { id: "M4",  name: "Scar Position Stable",   description: "Asymmetric feature position consistency (IoU of landmark region)", category: "identity",   threshold: 0.80, unit: "IoU",         higherIsBetter: true },

  // ─── Motion Gates ───
  { id: "M5",  name: "Motion Matches Prompt",  description: "CLIP-based motion-text alignment score",                           category: "motion",     threshold: 0.70, unit: "clip_score",  higherIsBetter: true },
  { id: "M6",  name: "No Limb Teleport",       description: "Max joint displacement between consecutive frames (normalized)",   category: "motion",     threshold: 0.15, unit: "displacement", higherIsBetter: false },
  { id: "M7",  name: "Temporal Flicker",        description: "Frame-to-frame SSIM variance (lower = smoother)",                 category: "motion",     threshold: 0.05, unit: "ssim_var",    higherIsBetter: false },
  { id: "M8",  name: "Gesture Vocabulary",      description: "Number of distinct gesture archetypes detected",                  category: "motion",     threshold: 10,   unit: "count",       higherIsBetter: true },

  // ─── Efficiency Gates ───
  { id: "M9",  name: "Regen Ratio",            description: "Clips needing regeneration / total clips",                         category: "efficiency", threshold: 2.0,  unit: "ratio",       higherIsBetter: false },
  { id: "M10", name: "Inference Overhead",      description: "Additional inference time vs baseline (percentage)",               category: "efficiency", threshold: 10,   unit: "percent",     higherIsBetter: false },
  { id: "M11", name: "Cost Reduction",          description: "Effective cost reduction vs non-LoRA baseline",                   category: "efficiency", threshold: 30,   unit: "percent",     higherIsBetter: true },

  // ─── Regression Gates ───
  { id: "M12", name: "No Quality Regression",   description: "FVD score compared to appearance-only LoRA baseline",            category: "regression", threshold: 120,  unit: "FVD",         higherIsBetter: false },
  { id: "M13", name: "No Lip Sync Regression",  description: "Lip sync accuracy compared to baseline (SyncNet score)",         category: "regression", threshold: 0.80, unit: "sync_score",  higherIsBetter: true },
  { id: "M14", name: "No Audio Regression",      description: "Audio quality score compared to baseline (PESQ-like)",          category: "regression", threshold: 3.5,  unit: "pesq",        higherIsBetter: true },
];

/** Critical gates that MUST pass — failure blocks deployment */
export const CRITICAL_GATES: EvaluationGateId[] = ["M1", "M2", "M5", "M6"];

/**
 * Evaluate a single gate result against its threshold.
 */
export function evaluateGate(gateId: EvaluationGateId, value: number): EvaluationGateResult {
  const gate = EVALUATION_GATES.find(g => g.id === gateId);
  if (!gate) throw new Error(`Unknown evaluation gate: ${gateId}`);

  const passed = gate.higherIsBetter
    ? value >= gate.threshold
    : value <= gate.threshold;

  return { gateId, passed, value, threshold: gate.threshold };
}

/**
 * Evaluate all gates and produce a summary report.
 */
export function evaluateAllGates(
  characterId: number,
  characterName: string,
  trainingPath: TrainingPath,
  modelVersion: string,
  values: Partial<Record<EvaluationGateId, number>>
): EvaluationGateResults {
  const gates: EvaluationGateResult[] = [];

  for (const gate of EVALUATION_GATES) {
    const value = values[gate.id];
    if (value !== undefined) {
      gates.push(evaluateGate(gate.id, value));
    } else {
      gates.push({ gateId: gate.id, passed: false, value: -1, threshold: gate.threshold, details: "Not evaluated" });
    }
  }

  const passCount = gates.filter(g => g.passed).length;
  const failCount = gates.filter(g => !g.passed).length;
  const criticalFailures = gates
    .filter(g => !g.passed && CRITICAL_GATES.includes(g.gateId))
    .map(g => g.gateId);

  return {
    characterId,
    characterName,
    trainingPath,
    modelVersion,
    timestamp: Date.now(),
    gates,
    overallPass: criticalFailures.length === 0 && passCount >= 10,
    passCount,
    failCount,
    criticalFailures,
  };
}

// ─── Training Config Generators ─────────────────────────────────────────

/**
 * Generate Kohya-SS training config for SDXL path (Section 4.1 of spec).
 */
export function generateSdxlTrainingConfig(config: MotionLoraTrainingConfig): Record<string, unknown> {
  if (config.trainingPath !== "sdxl") throw new Error("Config is not for SDXL path");
  if (config.trainingClipUrls.length < MIN_TRAINING_CLIPS) {
    throw new Error(`Need at least ${MIN_TRAINING_CLIPS} training clips, got ${config.trainingClipUrls.length}`);
  }

  return {
    // ─── Model ───
    pretrained_model_name_or_path: config.baseModelPath,
    motion_module: config.motionModulePath,
    network_module: "networks.lora",
    network_dim: config.networkDim,
    network_alpha: config.networkAlpha,

    // ─── Training ───
    max_train_steps: config.trainingSteps,
    learning_rate: config.learningRate,
    text_encoder_lr: 0,  // NEVER train text encoder
    unet_lr: config.learningRate,
    lr_scheduler: "cosine_with_restarts",
    lr_warmup_steps: Math.round(config.trainingSteps * 0.05),
    lr_scheduler_num_cycles: 3,
    optimizer_type: "AdamW8bit",

    // ─── Data ───
    train_data_dir: `${config.outputDir}/training_data`,
    resolution: "512,512",
    frame_count: config.frameCount,
    batch_size: 1,
    gradient_accumulation_steps: 4,
    flip_aug: false,  // MUST be false for asymmetric features
    color_aug: false,
    random_crop: false,

    // ─── LoRA Stack (pre-loaded before training) ───
    additional_lora: [
      config.styleLoraPath ? { path: config.styleLoraPath, weight: 1.0, layer: "style_lora" } : null,
      config.appearanceLoraPath ? { path: config.appearanceLoraPath, weight: 1.0, layer: "appearance_lora" } : null,
    ].filter(Boolean),

    // ─── Output ───
    output_dir: config.outputDir,
    output_name: `${config.characterName}_motion_v1`,
    save_every_n_steps: 500,
    save_model_as: "safetensors",
    mixed_precision: "fp16",
    cache_latents: true,
    cache_latents_to_disk: true,
    seed: 42,

    // ─── Logging ───
    logging_dir: `${config.outputDir}/logs`,
    log_with: "tensorboard",
    log_prefix: `${config.characterName}_motion`,

    // ─── Resume ───
    resume: config.resumeCheckpoint || null,

    // ─── Metadata ───
    _awakli_version: MOTION_LORA_VERSION,
    _character_id: config.characterId,
    _character_name: config.characterName,
    _training_path: "sdxl",
    _clip_count: config.trainingClipUrls.length,
  };
}

/**
 * Generate Wan 2.1 fork training config (Section 4.2 of spec).
 */
export function generateWanTrainingConfig(config: MotionLoraTrainingConfig): Record<string, unknown> {
  if (config.trainingPath !== "wan") throw new Error("Config is not for Wan path");
  if (config.trainingClipUrls.length < MIN_TRAINING_CLIPS) {
    throw new Error(`Need at least ${MIN_TRAINING_CLIPS} training clips, got ${config.trainingClipUrls.length}`);
  }

  return {
    // ─── Model ───
    base_model: config.baseModelPath,
    temporal_module: config.motionModulePath,
    lora_type: "motion_temporal",
    rank: config.networkDim,
    alpha: config.networkAlpha,

    // ─── Training ───
    max_steps: config.trainingSteps,
    learning_rate: config.learningRate,
    text_encoder_lr: 0,  // NEVER train text encoder
    scheduler: "cosine_with_restarts",
    warmup_steps: Math.round(config.trainingSteps * 0.05),
    num_cycles: 3,
    optimizer: "adamw_bf16",
    gradient_checkpointing: true,

    // ─── Data ───
    data_dir: `${config.outputDir}/training_data`,
    resolution: [512, 512],
    num_frames: config.frameCount,
    batch_size: 1,
    gradient_accumulation: 4,
    flip_augment: false,  // MUST be false for asymmetric features
    temporal_augment: true,  // Wan-specific: random temporal offset

    // ─── LoRA Stack ───
    pretrained_loras: [
      config.styleLoraPath ? { path: config.styleLoraPath, weight: 1.0, type: "style" } : null,
      config.appearanceLoraPath ? { path: config.appearanceLoraPath, weight: 1.0, type: "appearance" } : null,
    ].filter(Boolean),

    // ─── Output ───
    output_dir: config.outputDir,
    output_name: `${config.characterName}_motion_v1_wan`,
    save_interval: 500,
    save_format: "safetensors",
    precision: "bf16",
    cache_latents: true,
    seed: 42,

    // ─── Temporal Attention Injection (Wan-specific) ───
    inject_temporal_attention: true,
    temporal_attention_dim: config.networkDim,
    temporal_attention_heads: 8,
    cross_frame_attention: true,

    // ─── Logging ───
    log_dir: `${config.outputDir}/logs`,
    log_backend: "tensorboard",

    // ─── Resume ───
    resume_from: config.resumeCheckpoint || null,

    // ─── Metadata ───
    _awakli_version: MOTION_LORA_VERSION,
    _character_id: config.characterId,
    _character_name: config.characterName,
    _training_path: "wan",
    _clip_count: config.trainingClipUrls.length,
  };
}

// ─── Default Config Factory ─────────────────────────────────────────────

/**
 * Create a default MotionLoraTrainingConfig with sensible defaults.
 * Only characterId, characterName, projectId, trainingPath, and trainingClipUrls are required.
 */
export function createDefaultTrainingConfig(
  params: Pick<MotionLoraTrainingConfig, "characterId" | "characterName" | "projectId" | "trainingPath" | "trainingClipUrls" | "captionUrls"> & {
    baseModelPath: string;
    motionModulePath: string;
    appearanceLoraPath?: string;
    styleLoraPath?: string;
  }
): MotionLoraTrainingConfig {
  const slug = params.characterName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return {
    characterId: params.characterId,
    characterName: params.characterName,
    projectId: params.projectId,
    trainingPath: params.trainingPath,
    trainingSteps: DEFAULT_TRAINING_STEPS,
    networkDim: 64,
    networkAlpha: 32,
    learningRate: 1e-4,
    textEncoderLr: 0,
    frameCount: FRAME_COUNT_DEFAULT,
    flipAug: false,
    trainingClipUrls: params.trainingClipUrls,
    captionUrls: params.captionUrls,
    baseModelPath: params.baseModelPath,
    motionModulePath: params.motionModulePath,
    appearanceLoraPath: params.appearanceLoraPath,
    styleLoraPath: params.styleLoraPath,
    outputDir: `/models/motion-lora/${slug}_${params.trainingPath}`,
    resumeCheckpoint: undefined,
  };
}

// ─── Fallback Behavior ──────────────────────────────────────────────────

export type MotionLoraFallback =
  | "applied"           // Motion LoRA exists + scene qualifies → Applied
  | "scene_skip"        // Motion LoRA exists + scene doesn't qualify → Skipped
  | "missing"           // No motion LoRA + appearance LoRA exists → Run without, log
  | "no_lora"           // No motion LoRA + no appearance LoRA → Style LoRA only
  | "corrupt"           // Motion LoRA corrupt → Fail fast with named error
  | "tier_blocked";     // User tier doesn't allow motion LoRA

export interface MotionLoraResolution {
  fallback: MotionLoraFallback;
  motionLoraPath?: string;
  motionLoraWeight?: number;
  sceneType?: string;
  reason: string;
}

/**
 * Resolve the motion LoRA application decision for a given panel.
 *
 * Decision tree:
 *   1. Tier check → tier_blocked if user doesn't have access
 *   2. Motion LoRA existence check → missing/no_lora if not available
 *   3. Corruption check → corrupt if file is invalid
 *   4. Scene type check → scene_skip if scene doesn't qualify
 *   5. Apply → applied with weight from scene-type map
 */
export function resolveMotionLora(params: {
  hasMotionLora: boolean;
  motionLoraPath?: string;
  motionLoraCorrupt?: boolean;
  hasAppearanceLora: boolean;
  hasStyleLora: boolean;
  sceneType: string;
  userTierAllowsMotionLora: boolean;
}): MotionLoraResolution {
  // 1. Tier check
  if (!params.userTierAllowsMotionLora) {
    return {
      fallback: "tier_blocked",
      reason: "User subscription tier does not include motion LoRA access",
    };
  }

  // 2. Motion LoRA existence
  if (!params.hasMotionLora) {
    if (params.hasAppearanceLora) {
      return {
        fallback: "missing",
        reason: "No motion LoRA trained for this character — using appearance LoRA only",
      };
    }
    if (params.hasStyleLora) {
      return {
        fallback: "no_lora",
        reason: "No motion or appearance LoRA — using style LoRA only",
      };
    }
    return {
      fallback: "no_lora",
      reason: "No LoRA models available for this character",
    };
  }

  // 3. Corruption check
  if (params.motionLoraCorrupt) {
    return {
      fallback: "corrupt",
      reason: `Motion LoRA file is corrupt or invalid: ${params.motionLoraPath}`,
    };
  }

  // 4. Scene type check
  const weight = getMotionLoraWeight(params.sceneType);
  if (weight === null) {
    return {
      fallback: "scene_skip",
      sceneType: params.sceneType,
      reason: `Scene type "${params.sceneType}" does not benefit from motion LoRA`,
    };
  }

  // 5. Apply
  return {
    fallback: "applied",
    motionLoraPath: params.motionLoraPath,
    motionLoraWeight: weight,
    sceneType: params.sceneType,
    reason: `Motion LoRA applied at weight ${weight} for scene type "${params.sceneType}"`,
  };
}

// ─── Gate Report Generator ──────────────────────────────────────────────

/**
 * Generate a human-readable Markdown report for evaluation gate results.
 */
export function generateGateReport(results: EvaluationGateResults): string {
  const lines: string[] = [];

  lines.push(`# Motion LoRA Evaluation Report`);
  lines.push(``);
  lines.push(`**Character:** ${results.characterName} (ID: ${results.characterId})`);
  lines.push(`**Training Path:** ${results.trainingPath.toUpperCase()}`);
  lines.push(`**Model Version:** ${results.modelVersion}`);
  lines.push(`**Evaluated:** ${new Date(results.timestamp).toISOString()}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Overall | ${results.overallPass ? "✅ PASS" : "❌ FAIL"} |`);
  lines.push(`| Gates Passed | ${results.passCount} / ${results.gates.length} |`);
  lines.push(`| Gates Failed | ${results.failCount} / ${results.gates.length} |`);
  lines.push(`| Critical Failures | ${results.criticalFailures.length > 0 ? results.criticalFailures.join(", ") : "None"} |`);
  lines.push(``);

  // Group by category
  const categories: Record<string, EvaluationGateResult[]> = {};
  for (const gate of results.gates) {
    const def = EVALUATION_GATES.find(g => g.id === gate.gateId);
    const cat = def?.category || "unknown";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(gate);
  }

  for (const [category, gates] of Object.entries(categories)) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} Gates`);
    lines.push(``);
    lines.push(`| Gate | Name | Value | Threshold | Result |`);
    lines.push(`|------|------|-------|-----------|--------|`);

    for (const gate of gates) {
      const def = EVALUATION_GATES.find(g => g.id === gate.gateId);
      const name = def?.name || gate.gateId;
      const dir = def?.higherIsBetter ? "≥" : "≤";
      const icon = gate.passed ? "✅" : (CRITICAL_GATES.includes(gate.gateId) ? "🚨" : "❌");
      const valueStr = gate.value === -1 ? "N/A" : gate.value.toFixed(3);
      lines.push(`| ${gate.gateId} | ${name} | ${valueStr} | ${dir} ${gate.threshold} | ${icon} |`);
    }
    lines.push(``);
  }

  if (results.criticalFailures.length > 0) {
    lines.push(`## Critical Failures`);
    lines.push(``);
    lines.push(`The following critical gates failed. **Deployment is blocked** until these are resolved:`);
    lines.push(``);
    for (const gateId of results.criticalFailures) {
      const def = EVALUATION_GATES.find(g => g.id === gateId);
      const result = results.gates.find(g => g.gateId === gateId);
      lines.push(`- **${gateId} (${def?.name})**: Got ${result?.value.toFixed(3)}, need ${def?.higherIsBetter ? "≥" : "≤"} ${def?.threshold}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}
