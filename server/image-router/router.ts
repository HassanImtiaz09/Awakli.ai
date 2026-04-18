/**
 * Image Router Core — Multi-surface provider routing engine.
 *
 * Responsibilities:
 * 1. Score providers based on workload requirements, capabilities, health, and cost
 * 2. Build fallback chains (primary → fallback → last-resort)
 * 3. Execute generation with automatic retry/fallback
 * 4. Record cost attribution to generation_costs table
 *
 * @see Prompt 25, Section 8
 */
import { randomUUID } from "crypto";
import type {
  GenerationJob,
  ImageProviderAdapter,
  ImageGenerateParams,
  ImageRoutingDecision,
  WorkloadType,
  JobStatus,
} from "./types";
import { WORKLOAD_CONFIGS } from "./types";
import { getProviderApiKey, type ImageProvider } from "./vault";
// Forward-declared interfaces to avoid circular imports.
// The actual implementations are in ./budget.ts and ./health.ts.
export interface BudgetGovernor {
  checkBudget(providerId: string, estimatedCostUsd: number): Promise<boolean>;
  getRemainingBudget(): Promise<number>;
  recordSpend(providerId: string, costUsd: number): Promise<void>;
}

export interface ImageHealthMonitor {
  getAllStatuses(): Map<string, { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null }>;
  recordSuccess(providerId: string, latencyMs: number): void;
  recordFailure(providerId: string): void;
}

// ─── Provider Registry ──────────────────────────────────────────────────

/**
 * Registry of all available image provider adapters.
 */
const adapterRegistry = new Map<string, ImageProviderAdapter>();

export function registerImageAdapter(adapter: ImageProviderAdapter): void {
  adapterRegistry.set(adapter.providerId, adapter);
}

export function getImageAdapter(providerId: string): ImageProviderAdapter | undefined {
  return adapterRegistry.get(providerId);
}

export function getAllImageAdapters(): ImageProviderAdapter[] {
  return Array.from(adapterRegistry.values());
}

// ─── Provider Scoring ───────────────────────────────────────────────────

/**
 * Scoring weights for provider selection.
 * Higher weight = more influence on the final score.
 */
const SCORING_WEIGHTS = {
  /** Does the provider support the required capabilities? */
  capability: 40,
  /** Is the provider healthy (circuit closed, low latency)? */
  health: 25,
  /** Is the provider cost-effective for this workload? */
  cost: 20,
  /** Is this provider preferred for this workload type? */
  preference: 15,
} as const;

interface ProviderScore {
  providerId: string;
  score: number;
  reason: string;
  capabilityScore: number;
  healthScore: number;
  costScore: number;
  preferenceScore: number;
}

/**
 * Score a single provider for a given generation job.
 */
export function scoreProvider(
  adapter: ImageProviderAdapter,
  params: ImageGenerateParams,
  workloadType: WorkloadType,
  healthStatus?: { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null },
  budgetRemaining?: number,
): ProviderScore {
  const config = WORKLOAD_CONFIGS[workloadType];
  let capabilityScore = 1.0;
  let healthScore = 1.0;
  let costScore = 1.0;
  let preferenceScore = 0.5;
  const reasons: string[] = [];

  // ─── Capability scoring ───────────────────────────────────────────
  if (!adapter.supportsWorkload(workloadType)) {
    capabilityScore = 0;
    reasons.push("does not support workload");
  }
  if (params.controlNetModel && !adapter.supportsControlNet()) {
    capabilityScore = 0;
    reasons.push("ControlNet required but not supported");
  }
  if (params.loraModelUrl && !adapter.supportsLoRA()) {
    capabilityScore *= 0.1; // Heavy penalty but not zero (fallback possible without LoRA)
    reasons.push("LoRA required but not supported");
  }

  // Validation check
  const validation = adapter.validateParams(params);
  if (!validation.valid) {
    capabilityScore = 0;
    reasons.push(`validation failed: ${validation.errors?.join(", ")}`);
  }

  // ─── Health scoring ───────────────────────────────────────────────
  if (healthStatus) {
    if (!healthStatus.isHealthy) {
      healthScore = 0.1;
      reasons.push("provider unhealthy");
    } else {
      // Success rate factor
      const successRate = healthStatus.successRate1h ?? 1.0;
      healthScore = successRate;

      // Latency factor (penalize slow providers)
      const latency = healthStatus.latencyP50Ms ?? 5000;
      if (latency > 30000) healthScore *= 0.5;
      else if (latency > 15000) healthScore *= 0.7;
      else if (latency > 8000) healthScore *= 0.85;
    }
  }

  // ─── Cost scoring ─────────────────────────────────────────────────
  const estimatedCost = adapter.estimateCostUsd(params);
  if (estimatedCost > config.maxCostUsd) {
    costScore = 0.3;
    reasons.push(`estimated cost $${estimatedCost.toFixed(4)} exceeds max $${config.maxCostUsd}`);
  } else {
    // Lower cost = higher score (normalized to 0-1)
    costScore = 1 - (estimatedCost / config.maxCostUsd) * 0.5;
  }

  // Budget remaining factor
  if (budgetRemaining !== undefined && budgetRemaining < estimatedCost) {
    costScore *= 0.1;
    reasons.push("insufficient budget remaining");
  }

  // ─── Preference scoring ───────────────────────────────────────────
  const prefIndex = config.preferredProviders.indexOf(adapter.providerId);
  if (prefIndex === 0) {
    preferenceScore = 1.0;
  } else if (prefIndex === 1) {
    preferenceScore = 0.7;
  } else if (prefIndex >= 2) {
    preferenceScore = 0.4;
  } else {
    preferenceScore = 0.2; // Not in preferred list
  }

  // ─── Weighted total ───────────────────────────────────────────────
  const totalScore =
    capabilityScore * SCORING_WEIGHTS.capability +
    healthScore * SCORING_WEIGHTS.health +
    costScore * SCORING_WEIGHTS.cost +
    preferenceScore * SCORING_WEIGHTS.preference;

  return {
    providerId: adapter.providerId,
    score: totalScore,
    reason: reasons.length > 0 ? reasons.join("; ") : "all checks passed",
    capabilityScore,
    healthScore,
    costScore,
    preferenceScore,
  };
}

// ─── Routing Decision ───────────────────────────────────────────────────

/**
 * Make a routing decision for a generation job.
 * Returns the primary provider and fallback chain.
 */
export function makeRoutingDecision(
  workloadType: WorkloadType,
  params: ImageGenerateParams,
  healthStatuses?: Map<string, { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null }>,
  budgetRemaining?: number,
): ImageRoutingDecision {
  const adapters = getAllImageAdapters();

  if (adapters.length === 0) {
    throw new Error("[ImageRouter] No image adapters registered");
  }

  // Score all providers
  const scores: ProviderScore[] = adapters.map((adapter) => {
    const health = healthStatuses?.get(adapter.providerId);
    return scoreProvider(adapter, params, workloadType, health, budgetRemaining);
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Filter out zero-capability providers for primary selection
  const viable = scores.filter((s) => s.capabilityScore > 0);

  if (viable.length === 0) {
    // No provider can handle this workload — use best available as fallback
    return {
      primaryProvider: scores[0].providerId,
      fallbackChain: scores.slice(1).map((s) => s.providerId),
      estimatedCostUsd: 0,
      scores: scores.map((s) => ({
        providerId: s.providerId,
        score: s.score,
        reason: s.reason,
      })),
      budgetCapped: false,
    };
  }

  const primary = viable[0];
  const primaryAdapter = getImageAdapter(primary.providerId)!;

  return {
    primaryProvider: primary.providerId,
    fallbackChain: viable.slice(1).map((s) => s.providerId),
    estimatedCostUsd: primaryAdapter.estimateCostUsd(params),
    scores: scores.map((s) => ({
      providerId: s.providerId,
      score: s.score,
      reason: s.reason,
    })),
    budgetCapped: budgetRemaining !== undefined && budgetRemaining < primaryAdapter.estimateCostUsd(params),
  };
}

// ─── Job Execution ──────────────────────────────────────────────────────

/**
 * Create a new GenerationJob from request parameters.
 */
export function createGenerationJob(
  workloadType: WorkloadType,
  params: ImageGenerateParams,
  userId: number,
  context?: { episodeId?: number; sceneId?: number; chapterId?: number },
): GenerationJob {
  const config = WORKLOAD_CONFIGS[workloadType];
  const jobId = randomUUID();

  return {
    id: jobId,
    idempotencyKey: `${workloadType}:${userId}:${jobId}`,
    workloadType,
    status: "pending",
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    width: params.width || config.defaultWidth,
    height: params.height || config.defaultHeight,
    numImages: params.numImages || 1,
    guidanceScale: params.guidanceScale,
    seed: params.seed,
    controlNetModel: params.controlNetModel,
    controlNetImageUrl: params.controlNetImageUrl,
    controlNetStrength: params.controlNetStrength,
    loraModelUrl: params.loraModelUrl,
    loraWeight: params.loraWeight,
    attemptCount: 0,
    maxAttempts: 3,
    userId,
    episodeId: context?.episodeId,
    sceneId: context?.sceneId,
    chapterId: context?.chapterId,
    createdAt: new Date(),
  };
}

/**
 * Execute a generation job with automatic fallback.
 *
 * Flow:
 * 1. Make routing decision
 * 2. Try primary provider
 * 3. On failure, try each fallback in order
 * 4. Record cost attribution
 */
export async function executeGenerationJob(
  job: GenerationJob,
  options?: {
    healthMonitor?: ImageHealthMonitor;
    budgetGovernor?: BudgetGovernor;
    timeoutMs?: number;
  },
): Promise<GenerationJob> {
  const params: ImageGenerateParams = {
    prompt: job.prompt,
    negativePrompt: job.negativePrompt,
    width: job.width,
    height: job.height,
    numImages: job.numImages,
    guidanceScale: job.guidanceScale,
    seed: job.seed,
    controlNetModel: job.controlNetModel,
    controlNetImageUrl: job.controlNetImageUrl,
    controlNetStrength: job.controlNetStrength,
    loraModelUrl: job.loraModelUrl,
    loraWeight: job.loraWeight,
  };

  // Get health statuses if monitor is available
  let healthStatuses: Map<string, { isHealthy: boolean; successRate1h: number | null; latencyP50Ms: number | null }> | undefined;
  if (options?.healthMonitor) {
    healthStatuses = options.healthMonitor.getAllStatuses();
  }

  // Get budget remaining if governor is available
  let budgetRemaining: number | undefined;
  if (options?.budgetGovernor) {
    budgetRemaining = await options.budgetGovernor.getRemainingBudget();
  }

  // Make routing decision
  const decision = makeRoutingDecision(job.workloadType, params, healthStatuses, budgetRemaining);
  job.providerId = decision.primaryProvider;
  job.fallbackChain = decision.fallbackChain;
  job.estimatedCostUsd = decision.estimatedCostUsd;

  // Build the full provider chain to try
  const providerChain = [decision.primaryProvider, ...decision.fallbackChain];

  for (const providerId of providerChain) {
    if (job.attemptCount >= job.maxAttempts) {
      break;
    }

    const adapter = getImageAdapter(providerId);
    if (!adapter) continue;

    // Get API key
    const apiKey = getProviderApiKey(providerId as ImageProvider);
    if (!apiKey) {
      console.warn(`[ImageRouter] No API key for ${providerId}, skipping`);
      continue;
    }

    // Budget check
    if (options?.budgetGovernor) {
      const allowed = await options.budgetGovernor.checkBudget(
        providerId,
        adapter.estimateCostUsd(params),
      );
      if (!allowed) {
        console.warn(`[ImageRouter] Budget exceeded for ${providerId}, skipping`);
        continue;
      }
    }

    job.attemptCount++;
    job.providerId = providerId;
    job.status = "submitted";
    job.submittedAt = new Date();

    const startTime = Date.now();

    try {
      const result = await adapter.generate(
        params,
        apiKey,
        options?.timeoutMs ?? 60_000,
      );

      // Success
      job.status = "succeeded";
      job.completedAt = new Date();
      job.latencyMs = Date.now() - startTime;
      job.resultUrl = result.imageUrl;
      job.resultMimeType = result.mimeType;
      job.actualCostUsd = result.actualCostUsd;
      job.providerMetadata = result.metadata;

      // Record health success
      if (options?.healthMonitor) {
        options.healthMonitor.recordSuccess(providerId, job.latencyMs);
      }

      // Record cost
      if (options?.budgetGovernor) {
        await options.budgetGovernor.recordSpend(providerId, result.actualCostUsd);
      }

      return job;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[ImageRouter] ${providerId} failed (attempt ${job.attemptCount}): ${errorMessage}`);

      job.errorMessage = errorMessage;
      job.errorCode = errorMessage.includes("Rate limited")
        ? "RATE_LIMITED"
        : errorMessage.includes("Content violation")
          ? "CONTENT_VIOLATION"
          : errorMessage.includes("timed out")
            ? "TIMEOUT"
            : "PROVIDER_ERROR";

      // Record health failure
      if (options?.healthMonitor) {
        options.healthMonitor.recordFailure(providerId);
      }

      // Don't retry on content violations
      if (job.errorCode === "CONTENT_VIOLATION") {
        job.status = "failed";
        job.completedAt = new Date();
        job.latencyMs = Date.now() - startTime;
        return job;
      }
    }
  }

  // All providers exhausted
  job.status = "failed";
  job.completedAt = new Date();
  if (!job.errorMessage) {
    job.errorMessage = "All providers exhausted";
  }

  return job;
}

// ─── Exports ────────────────────────────────────────────────────────────

export { SCORING_WEIGHTS };
