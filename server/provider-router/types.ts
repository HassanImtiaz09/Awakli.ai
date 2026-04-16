/**
 * Provider Router — Core Types & Interfaces
 * Prompt 16: Multi-Provider API Router & Generation Abstraction Layer
 */

// ─── Modality & Tier ─────────────────────────────────────────────────────

export type Modality = "video" | "voice" | "music" | "image";
export type ProviderTier = "budget" | "standard" | "premium" | "flagship";
export type ProviderStatus = "active" | "disabled" | "deprecated";
export type CircuitState = "closed" | "open" | "half_open";
export type AuthScheme = "bearer" | "api_key_header" | "signed_request";

// ─── Error Taxonomy ──────────────────────────────────────────────────────

export type ErrorCode =
  | "TRANSIENT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CONTENT_VIOLATION"
  | "INVALID_PARAMS"
  | "UNSUPPORTED"
  | "INSUFFICIENT_CREDITS"
  | "UNKNOWN";

/** Errors that should NEVER trigger fallback to another provider */
export const NEVER_FALLBACK_ERRORS: ErrorCode[] = [
  "CONTENT_VIOLATION",
  "INVALID_PARAMS",
  "INSUFFICIENT_CREDITS",
];

/** Errors that are retryable on the same provider */
export const RETRYABLE_ERRORS: ErrorCode[] = [
  "TRANSIENT",
  "TIMEOUT",
];

/** Errors that should try a different provider */
export const FALLBACK_ERRORS: ErrorCode[] = [
  "TRANSIENT",
  "RATE_LIMITED",
  "TIMEOUT",
  "UNKNOWN",
];

export class ProviderError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly providerId: string,
    public readonly retryable: boolean = RETRYABLE_ERRORS.includes(code),
    public readonly fallbackable: boolean = FALLBACK_ERRORS.includes(code),
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

// ─── Generation Request / Result ─────────────────────────────────────────

export interface VideoParams {
  imageUrl?: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  resolution?: string;
  mode?: "std" | "pro";
  cfgScale?: number;
  seed?: number;
  /** Subject library element IDs for lip-sync (Kling 3 Omni) */
  elementIds?: string[];
}

export interface VoiceParams {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  language?: string;
  outputFormat?: string;
  ssml?: string;
  speed?: number;
}

export interface MusicParams {
  prompt: string;
  lyrics?: string;
  instrumental?: boolean;
  autoLyrics?: boolean;
  durationSeconds?: number;
  genre?: string;
  referenceAudioUrl?: string;
}

export interface ImageParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numImages?: number;
  guidanceScale?: number;
  seed?: number;
  imageUrl?: string;  // for img2img
  strength?: number;
}

export type GenerationParams = VideoParams | VoiceParams | MusicParams | ImageParams;

export interface GenerateRequest {
  type: Modality;
  params: GenerationParams;
  tier: ProviderTier;
  userId: number;
  episodeId?: number;
  sceneId?: number;
  /** Explicit provider preference */
  providerHint?: string;
  /** If true, providerHint is strict — fail if unavailable */
  strict?: boolean;
  /** Pre-existing hold ID from credit gateway (if already held) */
  holdId?: string;
  /** Idempotency key */
  idempotencyKey?: string;
}

export interface GenerateResult {
  requestId: number;
  requestUid: string;
  providerId: string;
  storageUrl: string;
  mimeType: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
  actualCostCredits: number;
  actualCostUsd: number;
  latencyMs: number;
  isDraft: boolean;
}

// ─── Provider Adapter Interface ──────────────────────────────────────────

export interface ProviderCapabilities {
  maxDuration?: number;
  resolutions?: string[];
  streaming?: boolean;
  imageToVideo?: boolean;
  textToVideo?: boolean;
  lipSync?: boolean;
  voiceCloning?: boolean;
  languages?: string[];
  maxChars?: number;
  lyrics?: boolean;
  instrumental?: boolean;
  genres?: string[];
  maxResolution?: string;
  formats?: string[];
  upscale?: boolean;
  animeOptimized?: boolean;
  [key: string]: unknown;
}

export interface ProviderPricing {
  unit: string;  // per_5s_clip, per_1k_chars, per_track, per_image
  rate: number;  // USD per unit
  currency: string;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
  vendor: string;
  modality: Modality;
  tier: ProviderTier;
  capabilities: ProviderCapabilities;
  pricing: ProviderPricing;
  endpointUrl: string;
  authScheme: AuthScheme;
  adapterClass: string;
  status: ProviderStatus;
}

export interface ExecutionContext {
  apiKey: string;
  apiKeyId: number;
  endpointUrl: string;
  timeout: number;
}

export interface AdapterResult {
  storageUrl: string;
  mimeType: string;
  durationSeconds?: number;
  storageSizeBytes?: number;
  metadata?: Record<string, unknown>;
  isDraft?: boolean;
  /** Actual USD cost if known from provider response */
  actualCostUsd?: number;
}

/**
 * Every provider adapter must implement this interface.
 * Adapters translate API shapes — NO business logic.
 */
export interface ProviderAdapter {
  /** Provider ID this adapter handles */
  readonly providerId: string;

  /** Validate params before sending to provider */
  validateParams(params: GenerationParams): { valid: boolean; errors?: string[] };

  /** Estimate USD cost for this request */
  estimateCostUsd(params: GenerationParams): number;

  /** Execute the generation call */
  execute(params: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult>;
}

// ─── Router Scoring ──────────────────────────────────────────────────────

export interface ScoringWeights {
  cost: number;
  latency: number;
  quality: number;
  freshness: number;
}

export const MODALITY_WEIGHTS: Record<Modality, ScoringWeights> = {
  video:  { cost: 0.40, latency: 0.20, quality: 0.35, freshness: 0.05 },
  voice:  { cost: 0.30, latency: 0.45, quality: 0.20, freshness: 0.05 },
  music:  { cost: 0.50, latency: 0.10, quality: 0.35, freshness: 0.05 },
  image:  { cost: 0.45, latency: 0.30, quality: 0.20, freshness: 0.05 },
};

/**
 * Tier filtering: which provider tiers are allowed for each request tier.
 * budget → budget only; standard → budget, standard; etc.
 */
export const TIER_FILTER: Record<ProviderTier, ProviderTier[]> = {
  budget:   ["budget"],
  standard: ["budget", "standard"],
  premium:  ["standard", "premium"],
  flagship: ["premium", "flagship"],
};

// ─── Executor Config ─────────────────────────────────────────────────────

export const EXECUTOR_CONFIG = {
  /** Max total attempts (original + retries + fallbacks) */
  maxAttempts: 3,
  /** Base timeout per provider call in ms */
  baseTimeoutMs: 120_000,
  /** Retry backoff base in ms */
  retryBackoffBaseMs: 2_000,
  /** Retry backoff multiplier */
  retryBackoffMultiplier: 2,
  /** Max retry delay in ms */
  maxRetryDelayMs: 30_000,
  /** Credit rounding precision (round up to nearest 0.25) */
  creditRoundingUnit: 0.25,
};

// ─── Circuit Breaker Config ──────────────────────────────────────────────

export const CIRCUIT_BREAKER_CONFIG = {
  /** Consecutive failures to open circuit */
  failureThreshold: 5,
  /** Initial cooldown before half-open in ms */
  baseCooldownMs: 60_000,
  /** Max cooldown (exponential backoff cap) in ms */
  maxCooldownMs: 15 * 60_000,
  /** Cooldown multiplier on repeated failures */
  cooldownMultiplier: 2,
};

// ─── Credit Conversion ──────────────────────────────────────────────────

/** Convert USD cost to credits, rounded up to nearest 0.25 */
export function usdToCredits(usdCost: number): number {
  // 1 credit ≈ $0.55 COGS value (from Prompt 15)
  const raw = usdCost / 0.55;
  return Math.ceil(raw / EXECUTOR_CONFIG.creditRoundingUnit) * EXECUTOR_CONFIG.creditRoundingUnit;
}
