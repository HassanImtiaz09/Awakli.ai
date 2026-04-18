/**
 * Image Router — Core Types
 *
 * Defines the GenerationJob contract, WorkloadType taxonomy,
 * and adapter interface for the multi-surface image generation router.
 *
 * @see Prompt 25, Section 5
 */

// ─── WorkloadType (Section 5.1) ─────────────────────────────────────────

/**
 * Workload types map to the 6 image surfaces in the Awakli pipeline.
 * Each workload type has different quality requirements, cost tolerance,
 * and provider preferences.
 */
export type WorkloadType =
  | "manga_panel"       // Manga panel generation (primary workload)
  | "character_sheet"   // Full character reference sheets
  | "background_art"    // Scene backgrounds and environments
  | "cover_art"         // Volume/chapter cover illustrations
  | "thumbnail"         // Episode thumbnails and previews
  | "ui_asset";         // UI elements, icons, badges

/**
 * Workload configuration: quality tier, max cost, and preferred providers.
 */
export interface WorkloadConfig {
  /** Display name for dashboards */
  displayName: string;
  /** Default quality tier for this workload */
  defaultTier: "budget" | "standard" | "premium";
  /** Maximum acceptable cost per image in USD */
  maxCostUsd: number;
  /** Default resolution */
  defaultWidth: number;
  defaultHeight: number;
  /** Whether ControlNet is typically needed */
  controlNetRequired: boolean;
  /** Whether custom LoRA injection is typical */
  loraRequired: boolean;
  /** Provider preference order */
  preferredProviders: string[];
}

/**
 * Workload configuration table (Section 5.1).
 * Runware is primary for ControlNet + LoRA workloads.
 * TensorArt is fallback for standard quality.
 * Fal.ai handles video frames and high-throughput thumbnails.
 */
export const WORKLOAD_CONFIGS: Record<WorkloadType, WorkloadConfig> = {
  manga_panel: {
    displayName: "Manga Panel",
    defaultTier: "premium",
    maxCostUsd: 0.08,
    defaultWidth: 1024,
    defaultHeight: 1024,
    controlNetRequired: true,
    loraRequired: true,
    preferredProviders: ["runware", "tensorart", "fal"],
  },
  character_sheet: {
    displayName: "Character Sheet",
    defaultTier: "premium",
    maxCostUsd: 0.12,
    defaultWidth: 1536,
    defaultHeight: 1024,
    controlNetRequired: true,
    loraRequired: true,
    preferredProviders: ["runware", "tensorart"],
  },
  background_art: {
    displayName: "Background Art",
    defaultTier: "standard",
    maxCostUsd: 0.06,
    defaultWidth: 1920,
    defaultHeight: 1080,
    controlNetRequired: false,
    loraRequired: false,
    preferredProviders: ["runware", "fal", "tensorart"],
  },
  cover_art: {
    displayName: "Cover Art",
    defaultTier: "premium",
    maxCostUsd: 0.15,
    defaultWidth: 1024,
    defaultHeight: 1536,
    controlNetRequired: true,
    loraRequired: true,
    preferredProviders: ["runware", "tensorart"],
  },
  thumbnail: {
    displayName: "Thumbnail",
    defaultTier: "budget",
    maxCostUsd: 0.02,
    defaultWidth: 512,
    defaultHeight: 512,
    controlNetRequired: false,
    loraRequired: false,
    preferredProviders: ["fal", "runware", "tensorart"],
  },
  ui_asset: {
    displayName: "UI Asset",
    defaultTier: "budget",
    maxCostUsd: 0.01,
    defaultWidth: 256,
    defaultHeight: 256,
    controlNetRequired: false,
    loraRequired: false,
    preferredProviders: ["fal", "runware"],
  },
};

// ─── GenerationJob (Section 5.2) ────────────────────────────────────────

/**
 * Status of a generation job through its lifecycle.
 */
export type JobStatus =
  | "pending"       // Queued, not yet submitted to provider
  | "submitted"     // Sent to provider, awaiting result
  | "processing"    // Provider acknowledged, actively generating
  | "succeeded"     // Image generated successfully
  | "failed"        // Generation failed (may retry/fallback)
  | "cancelled";    // Cancelled by user or system

/**
 * A single image generation job.
 * This is the canonical shape that flows through the router.
 */
export interface GenerationJob {
  /** Unique job ID (UUID) */
  id: string;
  /** Idempotency key to prevent duplicate generations */
  idempotencyKey: string;
  /** Which surface/workload this image is for */
  workloadType: WorkloadType;
  /** Current job status */
  status: JobStatus;

  // ─── Input Parameters ───────────────────────────────────────────────
  /** Text prompt for generation */
  prompt: string;
  /** Negative prompt */
  negativePrompt?: string;
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Number of images to generate */
  numImages: number;
  /** Guidance scale (CFG) */
  guidanceScale?: number;
  /** Random seed for reproducibility */
  seed?: number;

  // ─── ControlNet Parameters ──────────────────────────────────────────
  /** ControlNet model identifier (e.g., "canny", "openpose", "depth") */
  controlNetModel?: string;
  /** ControlNet conditioning image URL */
  controlNetImageUrl?: string;
  /** ControlNet conditioning strength (0.0–1.0) */
  controlNetStrength?: number;

  // ─── LoRA Parameters ────────────────────────────────────────────────
  /** Custom LoRA model URL or identifier */
  loraModelUrl?: string;
  /** LoRA weight (0.0–1.0) */
  loraWeight?: number;

  // ─── Routing Metadata ───────────────────────────────────────────────
  /** Provider that was selected by the router */
  providerId?: string;
  /** Fallback chain (ordered list of provider IDs to try) */
  fallbackChain?: string[];
  /** Number of attempts made */
  attemptCount: number;
  /** Maximum attempts before giving up */
  maxAttempts: number;

  // ─── Cost Attribution ───────────────────────────────────────────────
  /** Estimated cost in USD (before generation) */
  estimatedCostUsd?: number;
  /** Actual cost in USD (after generation) */
  actualCostUsd?: number;
  /** Actual cost in credits */
  actualCostCredits?: number;

  // ─── Result ─────────────────────────────────────────────────────────
  /** URL of the generated image in S3 */
  resultUrl?: string;
  /** MIME type of the result */
  resultMimeType?: string;
  /** Provider-specific metadata */
  providerMetadata?: Record<string, unknown>;

  // ─── Timing ─────────────────────────────────────────────────────────
  /** When the job was created */
  createdAt: Date;
  /** When the job was submitted to the provider */
  submittedAt?: Date;
  /** When the job completed (success or failure) */
  completedAt?: Date;
  /** Total latency in ms (submittedAt → completedAt) */
  latencyMs?: number;

  // ─── Context ────────────────────────────────────────────────────────
  /** User who requested this generation */
  userId: number;
  /** Episode this image belongs to */
  episodeId?: number;
  /** Scene this image belongs to */
  sceneId?: number;
  /** Chapter this image belongs to */
  chapterId?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Error code from provider */
  errorCode?: string;
}

// ─── Image Router Adapter Interface (Section 6) ─────────────────────────

/**
 * Result from an image generation adapter.
 */
export interface ImageAdapterResult {
  /** URL of the generated image */
  imageUrl: string;
  /** MIME type */
  mimeType: string;
  /** Actual cost in USD */
  actualCostUsd: number;
  /** Provider-specific task/request ID */
  providerTaskId?: string;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters passed to an image adapter's generate method.
 */
export interface ImageGenerateParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  numImages: number;
  guidanceScale?: number;
  seed?: number;
  controlNetModel?: string;
  controlNetImageUrl?: string;
  controlNetStrength?: number;
  loraModelUrl?: string;
  loraWeight?: number;
}

/**
 * Image provider adapter interface.
 * Each provider (Runware, TensorArt, Fal) implements this.
 *
 * Adapters handle ONLY API translation — no business logic, no routing,
 * no cost governance. Those responsibilities live in the router core.
 */
export interface ImageProviderAdapter {
  /** Provider identifier */
  readonly providerId: string;
  /** Human-readable display name */
  readonly displayName: string;

  /** Check if this adapter supports a given workload type */
  supportsWorkload(workload: WorkloadType): boolean;

  /** Check if this adapter supports ControlNet */
  supportsControlNet(): boolean;

  /** Check if this adapter supports custom LoRA injection */
  supportsLoRA(): boolean;

  /** Validate generation parameters */
  validateParams(params: ImageGenerateParams): {
    valid: boolean;
    errors?: string[];
  };

  /** Estimate cost in USD for a generation request */
  estimateCostUsd(params: ImageGenerateParams): number;

  /** Execute the generation request */
  generate(
    params: ImageGenerateParams,
    apiKey: string,
    timeoutMs?: number,
  ): Promise<ImageAdapterResult>;
}

// ─── Router Decision (Section 6.3) ──────────────────────────────────────

/**
 * The routing decision made by the image router.
 */
export interface ImageRoutingDecision {
  /** Primary provider to use */
  primaryProvider: string;
  /** Ordered fallback chain */
  fallbackChain: string[];
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Scoring details for each candidate */
  scores: Array<{
    providerId: string;
    score: number;
    reason?: string;
  }>;
  /** Whether budget governance capped the selection */
  budgetCapped: boolean;
}

// ─── Cost Record (Section 7) ────────────────────────────────────────────

/**
 * A cost record for the generation_costs table.
 */
export interface CostRecord {
  jobId: string;
  providerId: string;
  workloadType: WorkloadType;
  estimatedCostUsd: number;
  actualCostUsd: number;
  actualCostCredits: number;
  userId: number;
  episodeId?: number;
  chapterId?: number;
  createdAt: Date;
}

// ─── Budget Alert ───────────────────────────────────────────────────────

export type BudgetAlertLevel = "info" | "warning" | "critical";

export interface BudgetAlert {
  provider: string;
  level: BudgetAlertLevel;
  currentSpendUsd: number;
  monthlyCapUsd: number;
  percentUsed: number;
  message: string;
  timestamp: Date;
}

// ─── Health Status ──────────────────────────────────────────────────────

export interface ProviderHealthStatus {
  providerId: string;
  isHealthy: boolean;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  successRate1h: number | null;
  lastCanaryAt: Date | null;
  lastCanaryResult: "pass" | "fail" | null;
  circuitState: "closed" | "open" | "half_open";
  consecutiveFailures: number;
}
