/**
 * Prompt 21: Character LoRA Training Pipeline
 * 
 * Modules:
 * 1. Preprocessing — extract, crop, resize, caption reference images
 * 2. Training Config Builder — build Kohya SS / sd-scripts parameters
 * 3. Quality Validation — generate test images, compute CLIP similarity, score
 * 4. Job Scheduler — priority queue, GPU-aware scheduling, batch management
 * 5. LoRA Lifecycle Manager — activate, deprecate, retrain trigger, version pinning
 * 6. Consistency Mechanism — LoRA → IP-Adapter → text prompt fallback chain
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface ReferenceImage {
  url: string;
  viewAngle: "front" | "side" | "back" | "three_quarter" | "expression";
  caption: string;
  width: number;
  height: number;
}

export interface PreprocessedDataset {
  images: ReferenceImage[];
  triggerWord: string;
  characterName: string;
  totalImages: number;
  targetResolution: 512;
}

export interface KohyaTrainingConfig {
  baseModel: string;
  networkType: "LoRA" | "LoHa" | "LoCon";
  rank: number;
  alpha: number;
  learningRate: number;
  optimizer: "AdamW" | "AdamW8bit" | "Prodigy";
  scheduler: "cosine" | "cosine_with_restarts" | "constant";
  trainingSteps: number;
  batchSize: number;
  resolution: number;
  mixedPrecision: "fp16" | "bf16";
  regularizationImages: number;
  triggerWord: string;
  datasetPath: string;
  outputPath: string;
}

export interface ValidationResult {
  testImageUrls: string[];
  referenceImageUrls: string[];
  clipScores: number[];       // per-image CLIP similarity
  avgClipSimilarity: number;  // 0.0-1.0
  qualityScore: number;       // 0-100 (mapped from CLIP)
  decision: "auto_approve" | "manual_review" | "auto_reject";
  decisionReason: string;
}

export interface TrainingJobEstimate {
  gpuType: string;
  estimatedMinutes: number;
  estimatedCostUsd: number;
  estimatedCostCredits: number;
  withMargin: { costUsd: number; costCredits: number };
}

export type LoraVersionStatus = "training" | "active" | "deprecated" | "failed";
export type TrainingJobStatus = "queued" | "preprocessing" | "training" | "validating" | "completed" | "failed";

export interface ConsistencyMechanism {
  type: "lora" | "ip_adapter" | "text_prompt";
  loraPath?: string;
  loraStrength?: number;
  triggerWord?: string;
  embeddingUrl?: string;
  ipAdapterStrength?: number;
  appearanceTags?: Record<string, string>;
}

export interface ProviderCapabilities {
  supportsLora: boolean;
  supportsIpAdapter: boolean;
  name: string;
}

// ─── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_TRAINING_CONFIG = {
  baseModel: "Anything V5",
  networkType: "LoRA" as const,
  rank: 32,
  alpha: 16,
  learningRate: 1e-4,
  optimizer: "AdamW8bit" as const,
  scheduler: "cosine_with_restarts" as const,
  trainingSteps: 800,
  batchSize: 2,
  resolution: 512,
  mixedPrecision: "fp16" as const,
  regularizationImages: 0,
};

export const TRAINING_PARAM_RANGES = {
  rank: { min: 16, max: 64 },
  alpha: { min: 8, max: 32 },
  learningRate: { min: 5e-5, max: 3e-4 },
  trainingSteps: { min: 500, max: 1500 },
  batchSize: { min: 1, max: 4 },
};

export const GPU_PROFILES: Record<string, { minutesPer800Steps: [number, number]; costPerMinute: number }> = {
  h100_sxm: { minutesPer800Steps: [18, 25], costPerMinute: 0.058 },
  a100_80gb: { minutesPer800Steps: [25, 40], costPerMinute: 0.027 },
  rtx_4090: { minutesPer800Steps: [35, 50], costPerMinute: 0.012 },
};

export const COST_MARGIN = 0.30; // 30% margin for storage, network, infrastructure

export const VALIDATION_THRESHOLDS = {
  autoApprove: 0.85,
  manualReview: 0.75,
  // Below 0.75 → auto-reject
};

export const CLIP_TO_SCORE_RANGE = { minClip: 0.50, maxClip: 1.00 };

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapabilities> = {
  local_animatediff: { supportsLora: true, supportsIpAdapter: true, name: "Local AnimateDiff" },
  local_controlnet: { supportsLora: true, supportsIpAdapter: true, name: "Local ControlNet" },
  kling_v1: { supportsLora: false, supportsIpAdapter: false, name: "Kling 1.0" },
  kling_v1_5: { supportsLora: false, supportsIpAdapter: false, name: "Kling 1.5" },
  kling_v2: { supportsLora: false, supportsIpAdapter: false, name: "Kling 2.0" },
  kling_v2_6: { supportsLora: false, supportsIpAdapter: false, name: "Kling 2.6" },
  wan_2_6: { supportsLora: true, supportsIpAdapter: false, name: "Wan 2.6 (via fal.ai)" },  // Motion LoRA via adapter fork
  wan_2_7: { supportsLora: false, supportsIpAdapter: false, name: "Wan 2.7" },
  hunyuan_video: { supportsLora: true, supportsIpAdapter: false, name: "HunyuanVideo" },  // Native HunyuanMotionLoRA support
  flux_schnell: { supportsLora: false, supportsIpAdapter: false, name: "FLUX Schnell" },
  flux_pro: { supportsLora: false, supportsIpAdapter: false, name: "FLUX Pro" },
  pika_2_2: { supportsLora: false, supportsIpAdapter: false, name: "Pika 2.2" },
};

export const ROLE_PRIORITY_MAP: Record<string, number> = {
  protagonist: 1,
  antagonist: 2,
  deuteragonist: 3,
  supporting: 5,
  background: 8,
};

// ─── 1. Preprocessing Module ────────────────────────────────────────────

/**
 * Extract reference images from an approved character sheet.
 * In production, this would use a vision model to detect and crop individual views.
 * Here we simulate the extraction pipeline.
 */
export function extractReferenceImages(
  referenceSheetUrl: string,
  characterName: string,
  viewAngles: ReferenceImage["viewAngle"][] = ["front", "side", "back", "three_quarter", "expression"]
): ReferenceImage[] {
  return viewAngles.map((angle, i) => ({
    url: `${referenceSheetUrl.replace(/\.[^.]+$/, "")}_${angle}_${i}.png`,
    viewAngle: angle,
    caption: "", // filled by autoCaptionImage
    width: 512,
    height: 512,
  }));
}

/**
 * Simulate background removal (rembg) and crop to character bounding box.
 * In production: runs rembg on CPU, then crops to the character's bounding box.
 */
export function cropToCharacter(image: ReferenceImage): ReferenceImage {
  return {
    ...image,
    url: image.url.replace(/\.png$/, "_cropped.png"),
  };
}

/**
 * Resize image to 512x512 (SD1.5 native training resolution).
 */
export function resizeTo512(image: ReferenceImage): ReferenceImage {
  return {
    ...image,
    width: 512,
    height: 512,
    url: image.url.replace(/\.png$/, "_512.png"),
  };
}

/**
 * Auto-caption an image with character-specific tags for LoRA training.
 * Uses the trigger word prefix to avoid concept bleeding.
 */
export function autoCaptionImage(
  image: ReferenceImage,
  characterName: string,
  appearanceTags: Record<string, string> = {}
): ReferenceImage {
  const triggerWord = buildTriggerWord(characterName);
  const tagParts = [triggerWord];

  if (appearanceTags.hair) tagParts.push(`${appearanceTags.hair} hair`);
  if (appearanceTags.eyes) tagParts.push(`${appearanceTags.eyes} eyes`);
  if (appearanceTags.outfit) tagParts.push(appearanceTags.outfit);
  if (appearanceTags.bodyType) tagParts.push(appearanceTags.bodyType);

  // Add view angle context
  const angleLabels: Record<string, string> = {
    front: "front view",
    side: "side view",
    back: "back view",
    three_quarter: "three-quarter view",
    expression: "expression close-up",
  };
  tagParts.push(angleLabels[image.viewAngle] || image.viewAngle);
  tagParts.push("anime style", "high quality");

  return {
    ...image,
    caption: tagParts.join(", "),
  };
}

/**
 * Build the trigger word for a character.
 * Format: awakli_[sanitized_name]
 */
export function buildTriggerWord(characterName: string): string {
  const sanitized = characterName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return `awakli_${sanitized}`;
}

/**
 * Run the full preprocessing pipeline on a character's reference sheet.
 */
export function preprocessCharacterSheet(
  referenceSheetUrl: string,
  characterName: string,
  appearanceTags: Record<string, string> = {},
  viewAngles?: ReferenceImage["viewAngle"][]
): PreprocessedDataset {
  const rawImages = extractReferenceImages(referenceSheetUrl, characterName, viewAngles);
  const processed = rawImages
    .map(cropToCharacter)
    .map(resizeTo512)
    .map((img) => autoCaptionImage(img, characterName, appearanceTags));

  return {
    images: processed,
    triggerWord: buildTriggerWord(characterName),
    characterName,
    totalImages: processed.length,
    targetResolution: 512,
  };
}

// ─── 2. Training Config Builder ─────────────────────────────────────────

/**
 * Validate training parameters are within allowed ranges.
 */
export function validateTrainingParams(params: Partial<KohyaTrainingConfig>): string[] {
  const errors: string[] = [];
  const r = TRAINING_PARAM_RANGES;

  if (params.rank !== undefined && (params.rank < r.rank.min || params.rank > r.rank.max)) {
    errors.push(`rank must be ${r.rank.min}-${r.rank.max}, got ${params.rank}`);
  }
  if (params.alpha !== undefined && (params.alpha < r.alpha.min || params.alpha > r.alpha.max)) {
    errors.push(`alpha must be ${r.alpha.min}-${r.alpha.max}, got ${params.alpha}`);
  }
  if (params.learningRate !== undefined && (params.learningRate < r.learningRate.min || params.learningRate > r.learningRate.max)) {
    errors.push(`learningRate must be ${r.learningRate.min}-${r.learningRate.max}, got ${params.learningRate}`);
  }
  if (params.trainingSteps !== undefined && (params.trainingSteps < r.trainingSteps.min || params.trainingSteps > r.trainingSteps.max)) {
    errors.push(`trainingSteps must be ${r.trainingSteps.min}-${r.trainingSteps.max}, got ${params.trainingSteps}`);
  }
  if (params.batchSize !== undefined && (params.batchSize < r.batchSize.min || params.batchSize > r.batchSize.max)) {
    errors.push(`batchSize must be ${r.batchSize.min}-${r.batchSize.max}, got ${params.batchSize}`);
  }

  return errors;
}

/**
 * Build a complete Kohya SS training configuration.
 */
export function buildKohyaConfig(
  triggerWord: string,
  datasetPath: string,
  outputPath: string,
  overrides: Partial<KohyaTrainingConfig> = {}
): KohyaTrainingConfig {
  const errors = validateTrainingParams(overrides);
  if (errors.length > 0) {
    throw new Error(`Invalid training params: ${errors.join("; ")}`);
  }

  return {
    ...DEFAULT_TRAINING_CONFIG,
    ...overrides,
    triggerWord,
    datasetPath,
    outputPath,
  };
}

/**
 * Convert KohyaTrainingConfig to command-line arguments for sd-scripts.
 */
export function buildKohyaArgs(config: KohyaTrainingConfig): string[] {
  return [
    `--pretrained_model_name_or_path=${config.baseModel}`,
    `--network_module=networks.lora`,
    `--network_dim=${config.rank}`,
    `--network_alpha=${config.alpha}`,
    `--learning_rate=${config.learningRate}`,
    `--optimizer_type=${config.optimizer}`,
    `--lr_scheduler=${config.scheduler}`,
    `--max_train_steps=${config.trainingSteps}`,
    `--train_batch_size=${config.batchSize}`,
    `--resolution=${config.resolution}`,
    `--mixed_precision=${config.mixedPrecision}`,
    `--train_data_dir=${config.datasetPath}`,
    `--output_dir=${config.outputPath}`,
    `--output_name=lora`,
    `--save_model_as=safetensors`,
    `--caption_extension=.txt`,
    `--enable_bucket`,
    `--min_bucket_reso=256`,
    `--max_bucket_reso=1024`,
    ...(config.regularizationImages > 0
      ? [`--reg_data_dir=${config.datasetPath}/reg`]
      : []),
  ];
}

// ─── 3. Quality Validation ──────────────────────────────────────────────

/**
 * Generate diverse test prompts for LoRA validation.
 */
export function generateValidationPrompts(triggerWord: string): string[] {
  return [
    `${triggerWord}, standing pose, outdoor, daylight, anime style, high quality`,
    `${triggerWord}, sitting pose, indoor, warm lighting, anime style, high quality`,
    `${triggerWord}, running pose, action scene, dramatic lighting, anime style, high quality`,
    `${triggerWord}, close-up portrait, smiling expression, soft lighting, anime style, high quality`,
    `${triggerWord}, intense expression, night scene, dramatic shadows, anime style, high quality`,
  ];
}

/**
 * Compute CLIP cosine similarity between two embedding vectors.
 * In production, this calls the CLIP inference service.
 */
export function computeCosineSimilarity(embeddingA: number[], embeddingB: number[]): number {
  if (embeddingA.length !== embeddingB.length || embeddingA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < embeddingA.length; i++) {
    dotProduct += embeddingA[i] * embeddingB[i];
    normA += embeddingA[i] * embeddingA[i];
    normB += embeddingB[i] * embeddingB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Map CLIP similarity (0.50-1.00) to quality score (0-100).
 */
export function clipToQualityScore(clipSimilarity: number): number {
  const { minClip, maxClip } = CLIP_TO_SCORE_RANGE;
  const clamped = Math.max(minClip, Math.min(maxClip, clipSimilarity));
  const normalized = (clamped - minClip) / (maxClip - minClip);
  return Math.round(normalized * 100);
}

/**
 * Determine validation decision based on average CLIP similarity.
 */
export function getValidationDecision(
  avgClipSimilarity: number
): { decision: ValidationResult["decision"]; reason: string } {
  if (avgClipSimilarity >= VALIDATION_THRESHOLDS.autoApprove) {
    return {
      decision: "auto_approve",
      reason: `CLIP similarity ${avgClipSimilarity.toFixed(4)} ≥ ${VALIDATION_THRESHOLDS.autoApprove} threshold. LoRA auto-approved.`,
    };
  }
  if (avgClipSimilarity >= VALIDATION_THRESHOLDS.manualReview) {
    return {
      decision: "manual_review",
      reason: `CLIP similarity ${avgClipSimilarity.toFixed(4)} is between ${VALIDATION_THRESHOLDS.manualReview}-${VALIDATION_THRESHOLDS.autoApprove}. Requires creator review.`,
    };
  }
  return {
    decision: "auto_reject",
    reason: `CLIP similarity ${avgClipSimilarity.toFixed(4)} < ${VALIDATION_THRESHOLDS.manualReview} threshold. LoRA auto-rejected. Try clearer reference images.`,
  };
}

/**
 * Run the full validation pipeline (simulated).
 * In production: generates 5 test images, computes CLIP embeddings, scores.
 */
export function runValidation(
  clipScores: number[],
  testImageUrls: string[],
  referenceImageUrls: string[]
): ValidationResult {
  const avgClipSimilarity = clipScores.length > 0
    ? clipScores.reduce((a, b) => a + b, 0) / clipScores.length
    : 0;
  const qualityScore = clipToQualityScore(avgClipSimilarity);
  const { decision, reason } = getValidationDecision(avgClipSimilarity);

  return {
    testImageUrls,
    referenceImageUrls,
    clipScores,
    avgClipSimilarity,
    qualityScore,
    decision,
    decisionReason: reason,
  };
}

// ─── 4. Job Scheduler ───────────────────────────────────────────────────

/**
 * Estimate training time and cost for a given GPU type.
 */
export function estimateTrainingJob(
  gpuType: string = "h100_sxm",
  trainingSteps: number = 800
): TrainingJobEstimate {
  const profile = GPU_PROFILES[gpuType];
  if (!profile) {
    throw new Error(`Unknown GPU type: ${gpuType}. Available: ${Object.keys(GPU_PROFILES).join(", ")}`);
  }

  const stepRatio = trainingSteps / 800;
  const [minMins, maxMins] = profile.minutesPer800Steps;
  const estimatedMinutes = Math.round(((minMins + maxMins) / 2) * stepRatio);
  const estimatedCostUsd = Number((estimatedMinutes * profile.costPerMinute).toFixed(4));
  const marginMultiplier = 1 + COST_MARGIN;

  return {
    gpuType,
    estimatedMinutes,
    estimatedCostUsd,
    estimatedCostCredits: estimatedCostUsd * 100, // 1 credit = $0.01
    withMargin: {
      costUsd: Number((estimatedCostUsd * marginMultiplier).toFixed(4)),
      costCredits: Number((estimatedCostUsd * 100 * marginMultiplier).toFixed(4)),
    },
  };
}

/**
 * Assign priority based on character role.
 */
export function assignPriority(role: string): number {
  return ROLE_PRIORITY_MAP[role] ?? 5;
}

/**
 * Sort training jobs by priority (lower number = higher priority).
 */
export function sortByPriority<T extends { priority: number }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => a.priority - b.priority);
}

/**
 * Estimate batch training totals for multiple characters.
 */
export function estimateBatchTraining(
  characters: Array<{ name: string; role: string; trainingSteps?: number }>,
  gpuType: string = "h100_sxm",
  maxConcurrentGpus: number = 2
): {
  characters: Array<{ name: string; role: string; priority: number; estimate: TrainingJobEstimate }>;
  totalEstimatedMinutes: number;
  totalEstimatedCostUsd: number;
  totalEstimatedCredits: number;
  wallClockMinutes: number;
  maxConcurrentGpus: number;
} {
  const withEstimates = characters.map((c) => ({
    name: c.name,
    role: c.role,
    priority: assignPriority(c.role),
    estimate: estimateTrainingJob(gpuType, c.trainingSteps || 800),
  }));

  const sorted = sortByPriority(withEstimates);
  const totalMinutes = sorted.reduce((sum, c) => sum + c.estimate.estimatedMinutes, 0);
  const totalCostUsd = sorted.reduce((sum, c) => sum + c.estimate.withMargin.costUsd, 0);
  const totalCredits = sorted.reduce((sum, c) => sum + c.estimate.withMargin.costCredits, 0);

  // Wall clock = total / concurrent (simplified; real scheduling is more complex)
  const wallClockMinutes = Math.ceil(totalMinutes / maxConcurrentGpus);

  return {
    characters: sorted,
    totalEstimatedMinutes: totalMinutes,
    totalEstimatedCostUsd: Number(totalCostUsd.toFixed(4)),
    totalEstimatedCredits: Number(totalCredits.toFixed(4)),
    wallClockMinutes,
    maxConcurrentGpus,
  };
}

/**
 * Generate a unique batch ID for grouping training jobs.
 */
export function generateBatchId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `batch_${ts}_${rand}`;
}

// ─── 5. LoRA Lifecycle Manager ──────────────────────────────────────────

/**
 * Determine if a character sheet change requires retraining.
 * Uses CLIP similarity delta between old and new sheet.
 */
export function shouldRetrain(oldClipEmbedding: number[], newClipEmbedding: number[]): {
  shouldRetrain: boolean;
  clipDelta: number;
  reason: string;
} {
  const similarity = computeCosineSimilarity(oldClipEmbedding, newClipEmbedding);
  const delta = 1 - similarity;
  const threshold = 0.10;

  if (delta > threshold) {
    return {
      shouldRetrain: true,
      clipDelta: delta,
      reason: `Character sheet changed significantly (CLIP delta ${delta.toFixed(4)} > ${threshold}). Retraining recommended.`,
    };
  }
  return {
    shouldRetrain: false,
    clipDelta: delta,
    reason: `Character sheet change is minor (CLIP delta ${delta.toFixed(4)} ≤ ${threshold}). No retraining needed.`,
  };
}

/**
 * Calculate the artifact storage path for a LoRA version.
 */
export function getLoraArtifactPath(characterId: number, version: number): string {
  return `characters/${characterId}/lora/v${version}/lora.safetensors`;
}

/**
 * Estimate LoRA file size based on rank.
 */
export function estimateLoraFileSize(rank: number): { minMb: number; maxMb: number; avgBytes: number } {
  // Approximate: rank 32 ≈ 50-150MB, scales roughly linearly
  const baseMb = rank * 1.5;
  const minMb = Math.round(baseMb * 0.7);
  const maxMb = Math.round(baseMb * 3);
  const avgBytes = Math.round(((minMb + maxMb) / 2) * 1024 * 1024);
  return { minMb, maxMb, avgBytes };
}

// ─── 6. Consistency Mechanism ───────────────────────────────────────────

/**
 * Determine the best consistency mechanism for a character + provider combination.
 * Follows the fallback chain: LoRA → IP-Adapter → text prompt.
 */
export function getConsistencyMechanism(
  providerId: string,
  character: {
    loraStatus: string;
    activeLoraArtifactPath?: string;
    activeLoraTriggerWord?: string;
    activeIpEmbeddingUrl?: string;
    appearanceTags?: Record<string, string>;
  },
  loraStrength: number = 0.80
): ConsistencyMechanism {
  const provider = PROVIDER_CAPABILITIES[providerId];

  // LoRA path: best consistency
  if (
    character.loraStatus === "active" &&
    provider?.supportsLora &&
    character.activeLoraArtifactPath
  ) {
    return {
      type: "lora",
      loraPath: character.activeLoraArtifactPath,
      loraStrength,
      triggerWord: character.activeLoraTriggerWord,
    };
  }

  // IP-Adapter path: good consistency
  if (
    character.activeIpEmbeddingUrl &&
    provider?.supportsIpAdapter
  ) {
    return {
      type: "ip_adapter",
      embeddingUrl: character.activeIpEmbeddingUrl,
      ipAdapterStrength: 0.70,
    };
  }

  // Text prompt fallback: basic consistency
  return {
    type: "text_prompt",
    appearanceTags: character.appearanceTags || {},
  };
}

/**
 * Build the LoRA injection payload for local providers (AnimateDiff, ControlNet).
 */
export function buildLoraInjectionPayload(
  mechanism: ConsistencyMechanism,
  basePrompt: string
): {
  prompt: string;
  loraConfig?: { path: string; strength: number };
  ipAdapterConfig?: { embeddingUrl: string; strength: number };
} {
  if (mechanism.type === "lora" && mechanism.loraPath && mechanism.triggerWord) {
    return {
      prompt: `${mechanism.triggerWord}, ${basePrompt}`,
      loraConfig: {
        path: mechanism.loraPath,
        strength: mechanism.loraStrength ?? 0.80,
      },
    };
  }

  if (mechanism.type === "ip_adapter" && mechanism.embeddingUrl) {
    return {
      prompt: basePrompt,
      ipAdapterConfig: {
        embeddingUrl: mechanism.embeddingUrl,
        strength: mechanism.ipAdapterStrength ?? 0.70,
      },
    };
  }

  // Text prompt fallback: inject appearance tags into prompt
  const tags = mechanism.appearanceTags || {};
  const tagStr = Object.entries(tags)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  return {
    prompt: tagStr ? `${tagStr}, ${basePrompt}` : basePrompt,
  };
}

// ─── 7. Extraction Preview ────────────────────────────────────────────

export interface BoundingBox {
  x: number;      // 0-1 normalized left
  y: number;      // 0-1 normalized top
  width: number;  // 0-1 normalized width
  height: number; // 0-1 normalized height
}

export interface ExtractedViewPreview {
  viewAngle: ReferenceImage["viewAngle"];
  label: string;
  boundingBox: BoundingBox;
  croppedUrl: string;
  confidence: number;  // 0-1
  qualityWarning: string | null;
}

export interface ExtractionPreviewResult {
  referenceSheetUrl: string;
  characterName: string;
  triggerWord: string;
  views: ExtractedViewPreview[];
  overallQuality: "excellent" | "good" | "fair" | "poor";
  overallConfidence: number;
  warnings: string[];
}

/**
 * Quality thresholds for extraction confidence
 */
export const EXTRACTION_CONFIDENCE_THRESHOLDS = {
  excellent: 0.92,
  good: 0.80,
  fair: 0.65,
  // Below 0.65 → poor
};

/**
 * Standard bounding box layout for a 5-view reference sheet.
 * Assumes a horizontal strip layout: front | side | back | 3/4 | expression
 * Each view occupies roughly 1/5 of the sheet width.
 * In production, a vision model (e.g., YOLO or SAM) would detect these.
 */
const VIEW_LAYOUT: Record<ReferenceImage["viewAngle"], { x: number; y: number; w: number; h: number }> = {
  front:         { x: 0.00, y: 0.05, w: 0.19, h: 0.90 },
  side:          { x: 0.20, y: 0.05, w: 0.19, h: 0.90 },
  back:          { x: 0.40, y: 0.05, w: 0.19, h: 0.90 },
  three_quarter: { x: 0.60, y: 0.05, w: 0.19, h: 0.90 },
  expression:    { x: 0.80, y: 0.05, w: 0.19, h: 0.90 },
};

const VIEW_LABELS: Record<ReferenceImage["viewAngle"], string> = {
  front: "Front View",
  side: "Side View",
  back: "Back View",
  three_quarter: "3/4 View",
  expression: "Expression Sheet",
};

/**
 * Simulate per-view detection confidence based on view angle difficulty.
 * In production, this would come from the vision model's output logits.
 */
function simulateViewConfidence(viewAngle: ReferenceImage["viewAngle"], seed: number): number {
  // Front views are easiest to detect, expressions are hardest
  const baseDifficulty: Record<string, number> = {
    front: 0.95,
    side: 0.88,
    back: 0.82,
    three_quarter: 0.86,
    expression: 0.78,
  };
  const base = baseDifficulty[viewAngle] ?? 0.80;
  // Add deterministic pseudo-random variation ±0.05
  const variation = ((seed * 7 + viewAngle.length * 13) % 100) / 1000 - 0.05;
  return Math.max(0, Math.min(1, base + variation));
}

/**
 * Generate quality warnings for a view based on confidence and angle.
 */
function getViewQualityWarning(viewAngle: ReferenceImage["viewAngle"], confidence: number): string | null {
  if (confidence < 0.65) {
    return `${VIEW_LABELS[viewAngle]} detection confidence is very low (${(confidence * 100).toFixed(0)}%). Consider providing a clearer reference.`;
  }
  if (confidence < 0.75) {
    return `${VIEW_LABELS[viewAngle]} may be partially occluded or unclear (${(confidence * 100).toFixed(0)}% confidence).`;
  }
  if (viewAngle === "back" && confidence < 0.85) {
    return "Back view detection is uncertain. Ensure the character's back is fully visible.";
  }
  if (viewAngle === "expression" && confidence < 0.85) {
    return "Expression sheet detection is uncertain. Multiple facial expressions should be clearly separated.";
  }
  return null;
}

/**
 * Determine overall quality rating from average confidence.
 */
export function getOverallQuality(avgConfidence: number): ExtractionPreviewResult["overallQuality"] {
  if (avgConfidence >= EXTRACTION_CONFIDENCE_THRESHOLDS.excellent) return "excellent";
  if (avgConfidence >= EXTRACTION_CONFIDENCE_THRESHOLDS.good) return "good";
  if (avgConfidence >= EXTRACTION_CONFIDENCE_THRESHOLDS.fair) return "fair";
  return "poor";
}

/**
 * Run the extraction preview pipeline.
 * Simulates what a production vision model would do:
 * 1. Detect character regions in the reference sheet
 * 2. Assign view angles to each region
 * 3. Compute confidence scores
 * 4. Generate quality warnings
 * 5. Return preview data for creator verification
 */
export function previewExtraction(
  referenceSheetUrl: string,
  characterName: string,
  viewAngles: ReferenceImage["viewAngle"][] = ["front", "side", "back", "three_quarter", "expression"]
): ExtractionPreviewResult {
  const triggerWord = buildTriggerWord(characterName);
  const seed = characterName.length + referenceSheetUrl.length;

  const views: ExtractedViewPreview[] = viewAngles.map((angle) => {
    const layout = VIEW_LAYOUT[angle];
    const confidence = simulateViewConfidence(angle, seed);
    const warning = getViewQualityWarning(angle, confidence);

    // Generate the cropped URL (same pattern as extractReferenceImages + cropToCharacter)
    const baseUrl = referenceSheetUrl.replace(/\.[^.]+$/, "");
    const croppedUrl = `${baseUrl}_${angle}_cropped_512.png`;

    return {
      viewAngle: angle,
      label: VIEW_LABELS[angle],
      boundingBox: {
        x: layout.x,
        y: layout.y,
        width: layout.w,
        height: layout.h,
      },
      croppedUrl,
      confidence,
      qualityWarning: warning,
    };
  });

  const avgConfidence = views.length > 0
    ? views.reduce((sum, v) => sum + v.confidence, 0) / views.length
    : 0;

  const warnings = views
    .map(v => v.qualityWarning)
    .filter((w): w is string => w !== null);

  // Add overall warnings
  if (avgConfidence < EXTRACTION_CONFIDENCE_THRESHOLDS.fair) {
    warnings.unshift("Overall extraction quality is poor. Consider using a higher-resolution reference sheet with clearly separated character views.");
  }
  if (views.length < 3) {
    warnings.unshift(`Only ${views.length} views detected. At least 3 views (front, side, back) are recommended for good LoRA quality.`);
  }

  return {
    referenceSheetUrl,
    characterName,
    triggerWord,
    views,
    overallQuality: getOverallQuality(avgConfidence),
    overallConfidence: avgConfidence,
    warnings,
  };
}


// ─── 8. LoRA A/B Comparison ────────────────────────────────────────────

export interface ComparisonPrompt {
  id: string;
  label: string;
  prompt: string;
  category: "portrait" | "action" | "emotion" | "group" | "lighting" | "custom";
}

export interface ComparisonImageResult {
  promptId: string;
  versionAImageUrl: string;
  versionBImageUrl: string;
  metrics: {
    clipSimilarityA: number;   // How close version A is to reference
    clipSimilarityB: number;   // How close version B is to reference
    styleConsistencyA: number; // Style coherence 0-1
    styleConsistencyB: number;
    detailPreservationA: number; // Fine detail retention 0-1
    detailPreservationB: number;
    overallScoreA: number;     // Weighted composite 0-100
    overallScoreB: number;
  };
  winner: "A" | "B" | "tie";
}

export interface ComparisonSummary {
  versionAId: number;
  versionBId: number;
  versionALabel: string;
  versionBLabel: string;
  prompts: ComparisonPrompt[];
  results: ComparisonImageResult[];
  aggregated: {
    avgScoreA: number;
    avgScoreB: number;
    avgClipA: number;
    avgClipB: number;
    avgStyleA: number;
    avgStyleB: number;
    avgDetailA: number;
    avgDetailB: number;
    winsA: number;
    winsB: number;
    ties: number;
    overallWinner: "A" | "B" | "tie";
    confidence: number;        // 0-1 how confident the recommendation is
    recommendation: string;    // Human-readable recommendation
  };
}

/**
 * Generate 5 standard comparison prompts for a character.
 * Each prompt tests a different aspect of LoRA quality.
 */
export function generateComparisonPrompts(triggerWord: string, customPrompt?: string): ComparisonPrompt[] {
  const prompts: ComparisonPrompt[] = [
    {
      id: "portrait",
      label: "Portrait Close-up",
      prompt: `${triggerWord}, close-up portrait, soft studio lighting, neutral background, anime style, high quality, detailed face`,
      category: "portrait",
    },
    {
      id: "action",
      label: "Action Pose",
      prompt: `${triggerWord}, dynamic action pose, running, wind blowing hair, dramatic angle, anime style, high quality`,
      category: "action",
    },
    {
      id: "emotion",
      label: "Emotional Expression",
      prompt: `${triggerWord}, crying with tears, emotional scene, close-up, warm lighting, anime style, high quality`,
      category: "emotion",
    },
    {
      id: "group",
      label: "Group Scene",
      prompt: `${triggerWord}, standing with other characters, school setting, daylight, anime style, high quality`,
      category: "group",
    },
    {
      id: "lighting",
      label: "Dramatic Lighting",
      prompt: `${triggerWord}, dramatic rim lighting, dark background, cinematic, volumetric light, anime style, high quality`,
      category: "lighting",
    },
  ];

  if (customPrompt) {
    prompts.push({
      id: "custom",
      label: "Custom Prompt",
      prompt: customPrompt.includes(triggerWord) ? customPrompt : `${triggerWord}, ${customPrompt}`,
      category: "custom",
    });
  }

  return prompts;
}

/**
 * Simulate generating a test image with a specific LoRA version.
 * In production, this calls the generation service with the LoRA artifact.
 * Returns a simulated image URL.
 */
function simulateLoraGeneration(
  loraArtifactPath: string,
  prompt: string,
  versionId: number,
  promptId: string
): string {
  const hash = Math.abs(
    (loraArtifactPath.length * 31 + prompt.length * 17 + versionId * 7) % 10000
  );
  return `https://cdn.awakli.com/lora-comparison/${versionId}/${promptId}_${hash}.png`;
}

/**
 * Simulate per-image quality metrics for a LoRA-generated image.
 * In production, this runs CLIP embedding comparison against the reference sheet.
 * 
 * Uses deterministic pseudo-random based on inputs so results are reproducible.
 */
function simulateImageMetrics(
  versionId: number,
  promptId: string,
  baseQualityScore: number,
  seed: number
): { clipSimilarity: number; styleConsistency: number; detailPreservation: number } {
  // Use the version's base quality as anchor, add per-prompt variation
  const promptVariation: Record<string, number> = {
    portrait: 0.05,   // portraits are easiest
    action: -0.03,    // action poses are harder
    emotion: 0.02,    // emotions are moderate
    group: -0.06,     // group scenes are hardest
    lighting: -0.01,  // lighting is moderate
    custom: 0.00,     // neutral
  };

  const pv = promptVariation[promptId] ?? 0;
  const deterministicNoise = ((seed * 13 + versionId * 7 + promptId.length * 31) % 100) / 1000 - 0.05;

  // CLIP similarity: base quality mapped to 0.65-0.98 range
  const baseClip = 0.65 + (baseQualityScore / 100) * 0.33;
  const clipSimilarity = Math.max(0, Math.min(1, baseClip + pv + deterministicNoise));

  // Style consistency: slightly different variation
  const styleNoise = ((seed * 17 + versionId * 11 + promptId.length * 23) % 100) / 1000 - 0.05;
  const styleConsistency = Math.max(0, Math.min(1, baseClip + pv * 0.8 + styleNoise));

  // Detail preservation: another variation
  const detailNoise = ((seed * 23 + versionId * 13 + promptId.length * 19) % 100) / 1000 - 0.05;
  const detailPreservation = Math.max(0, Math.min(1, baseClip + pv * 0.6 + detailNoise));

  return { clipSimilarity, styleConsistency, detailPreservation };
}

/**
 * Compute a weighted overall score from individual metrics.
 * Weights: CLIP similarity (50%), Style consistency (30%), Detail preservation (20%)
 */
export function computeOverallScore(
  clipSimilarity: number,
  styleConsistency: number,
  detailPreservation: number
): number {
  const weighted = clipSimilarity * 0.50 + styleConsistency * 0.30 + detailPreservation * 0.20;
  return Math.round(weighted * 100);
}

/**
 * Determine the winner for a single prompt comparison.
 * A version wins if its overall score is at least 2 points higher.
 */
export function determinePromptWinner(scoreA: number, scoreB: number): "A" | "B" | "tie" {
  const diff = scoreA - scoreB;
  if (diff >= 2) return "A";
  if (diff <= -2) return "B";
  return "tie";
}

/**
 * Determine the overall winner and generate a recommendation.
 */
export function generateRecommendation(
  winsA: number,
  winsB: number,
  ties: number,
  avgScoreA: number,
  avgScoreB: number,
  versionALabel: string,
  versionBLabel: string
): { winner: "A" | "B" | "tie"; confidence: number; recommendation: string } {
  const totalTests = winsA + winsB + ties;
  if (totalTests === 0) {
    return { winner: "tie", confidence: 0, recommendation: "No comparison data available." };
  }

  const scoreDiff = Math.abs(avgScoreA - avgScoreB);
  const winRatioA = winsA / totalTests;
  const winRatioB = winsB / totalTests;

  let winner: "A" | "B" | "tie";
  let confidence: number;
  let recommendation: string;

  if (winsA > winsB) {
    winner = "A";
    confidence = Math.min(1, winRatioA * 0.6 + (scoreDiff / 20) * 0.4);
    recommendation = `${versionALabel} outperforms ${versionBLabel} in ${winsA} of ${totalTests} tests (avg score ${avgScoreA.toFixed(1)} vs ${avgScoreB.toFixed(1)}). Recommend keeping ${versionALabel} as active.`;
  } else if (winsB > winsA) {
    winner = "B";
    confidence = Math.min(1, winRatioB * 0.6 + (scoreDiff / 20) * 0.4);
    recommendation = `${versionBLabel} outperforms ${versionALabel} in ${winsB} of ${totalTests} tests (avg score ${avgScoreB.toFixed(1)} vs ${avgScoreA.toFixed(1)}). Recommend switching to ${versionBLabel}.`;
  } else {
    // Tie in wins — use average score as tiebreaker
    if (scoreDiff >= 1) {
      winner = avgScoreA > avgScoreB ? "A" : "B";
      const winnerLabel = winner === "A" ? versionALabel : versionBLabel;
      const winnerScore = winner === "A" ? avgScoreA : avgScoreB;
      confidence = Math.min(1, (scoreDiff / 10) * 0.5);
      recommendation = `Both versions won equal tests, but ${winnerLabel} has a slightly higher average score (${winnerScore.toFixed(1)}). Marginal difference — either version is acceptable.`;
    } else {
      winner = "tie";
      confidence = 0.1;
      recommendation = `Both versions perform nearly identically (avg ${avgScoreA.toFixed(1)} vs ${avgScoreB.toFixed(1)}). No significant quality difference detected. Keep the current active version.`;
    }
  }

  return { winner, confidence: Number(confidence.toFixed(3)), recommendation };
}

/**
 * Run a full A/B comparison between two LoRA versions.
 * 
 * @param versionA - First version metadata { id, version, qualityScore, artifactPath }
 * @param versionB - Second version metadata { id, version, qualityScore, artifactPath }
 * @param triggerWord - The character's trigger word
 * @param customPrompt - Optional custom prompt to include
 * @returns Full comparison summary with per-prompt results and aggregated metrics
 */
export function compareLoraVersions(
  versionA: { id: number; version: number; qualityScore: number; artifactPath: string },
  versionB: { id: number; version: number; qualityScore: number; artifactPath: string },
  triggerWord: string,
  customPrompt?: string
): ComparisonSummary {
  const prompts = generateComparisonPrompts(triggerWord, customPrompt);
  const versionALabel = `v${versionA.version}`;
  const versionBLabel = `v${versionB.version}`;

  const seed = versionA.id + versionB.id + triggerWord.length;

  const results: ComparisonImageResult[] = prompts.map((p) => {
    const imageUrlA = simulateLoraGeneration(versionA.artifactPath, p.prompt, versionA.id, p.id);
    const imageUrlB = simulateLoraGeneration(versionB.artifactPath, p.prompt, versionB.id, p.id);

    const metricsA = simulateImageMetrics(versionA.id, p.id, versionA.qualityScore, seed);
    const metricsB = simulateImageMetrics(versionB.id, p.id, versionB.qualityScore, seed + 1);

    const overallA = computeOverallScore(metricsA.clipSimilarity, metricsA.styleConsistency, metricsA.detailPreservation);
    const overallB = computeOverallScore(metricsB.clipSimilarity, metricsB.styleConsistency, metricsB.detailPreservation);

    return {
      promptId: p.id,
      versionAImageUrl: imageUrlA,
      versionBImageUrl: imageUrlB,
      metrics: {
        clipSimilarityA: Number(metricsA.clipSimilarity.toFixed(4)),
        clipSimilarityB: Number(metricsB.clipSimilarity.toFixed(4)),
        styleConsistencyA: Number(metricsA.styleConsistency.toFixed(4)),
        styleConsistencyB: Number(metricsB.styleConsistency.toFixed(4)),
        detailPreservationA: Number(metricsA.detailPreservation.toFixed(4)),
        detailPreservationB: Number(metricsB.detailPreservation.toFixed(4)),
        overallScoreA: overallA,
        overallScoreB: overallB,
      },
      winner: determinePromptWinner(overallA, overallB),
    };
  });

  // Aggregate metrics
  const n = results.length;
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => n > 0 ? sum(arr) / n : 0;

  const avgScoreA = avg(results.map(r => r.metrics.overallScoreA));
  const avgScoreB = avg(results.map(r => r.metrics.overallScoreB));
  const avgClipA = avg(results.map(r => r.metrics.clipSimilarityA));
  const avgClipB = avg(results.map(r => r.metrics.clipSimilarityB));
  const avgStyleA = avg(results.map(r => r.metrics.styleConsistencyA));
  const avgStyleB = avg(results.map(r => r.metrics.styleConsistencyB));
  const avgDetailA = avg(results.map(r => r.metrics.detailPreservationA));
  const avgDetailB = avg(results.map(r => r.metrics.detailPreservationB));
  const winsA = results.filter(r => r.winner === "A").length;
  const winsB = results.filter(r => r.winner === "B").length;
  const ties = results.filter(r => r.winner === "tie").length;

  const { winner, confidence, recommendation } = generateRecommendation(
    winsA, winsB, ties, avgScoreA, avgScoreB, versionALabel, versionBLabel
  );

  return {
    versionAId: versionA.id,
    versionBId: versionB.id,
    versionALabel,
    versionBLabel,
    prompts,
    results,
    aggregated: {
      avgScoreA: Number(avgScoreA.toFixed(1)),
      avgScoreB: Number(avgScoreB.toFixed(1)),
      avgClipA: Number(avgClipA.toFixed(4)),
      avgClipB: Number(avgClipB.toFixed(4)),
      avgStyleA: Number(avgStyleA.toFixed(4)),
      avgStyleB: Number(avgStyleB.toFixed(4)),
      avgDetailA: Number(avgDetailA.toFixed(4)),
      avgDetailB: Number(avgDetailB.toFixed(4)),
      winsA,
      winsB,
      ties,
      overallWinner: winner,
      confidence,
      recommendation,
    },
  };
}
