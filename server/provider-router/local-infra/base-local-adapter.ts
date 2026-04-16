/**
 * Base Local Adapter — Shared execution logic for all local GPU providers
 * Prompt 19: Hybrid Local/API Inference Infrastructure
 *
 * Handles: endpoint resolution → platform client selection → job submission →
 * polling → GPU usage logging → result extraction.
 */
import type { ProviderAdapter, GenerationParams, ExecutionContext, AdapterResult } from "../types";
import { ProviderError } from "../types";
import { runpodClient } from "./runpod-client";
import { modalClient } from "./modal-client";
import { getActiveEndpoint } from "./model-artifact-manager";
import { logGpuUsage } from "./gpu-usage-logger";
import { estimateLocalProviderCost } from "./gpu-cost-model";
import type { GpuPlatformClient, InferenceJobInput, InferenceJobResult, GpuType, LocalModelSpec } from "./types";
import { LOCAL_MODEL_SPECS } from "./types";

function getPlatformClient(platform: "runpod" | "modal"): GpuPlatformClient {
  return platform === "runpod" ? runpodClient : modalClient;
}

export interface LocalAdapterConfig {
  providerId: string;
  modelType: string;  // sent to the RunPod handler as model_type

  /** Validate model-specific params. Return errors or empty array. */
  validate(params: GenerationParams): string[];

  /** Build the inference job input from generation params. */
  buildJobInput(params: GenerationParams, modelVersion: string): InferenceJobInput;

  /** Extract the adapter result from the inference job result. */
  extractResult(jobResult: InferenceJobResult, params: GenerationParams): AdapterResult;

  /** Estimate USD cost (delegates to GPU cost model). */
  estimateCostUsd(params: GenerationParams): number;
}

/**
 * Create a ProviderAdapter for a local GPU model.
 * All local adapters share the same execution flow:
 * 1. Resolve active endpoint from DB
 * 2. Select platform client (RunPod or Modal)
 * 3. Submit job and poll for completion
 * 4. Log GPU usage
 * 5. Extract and return result
 */
export function createLocalAdapter(config: LocalAdapterConfig): ProviderAdapter {
  const spec = LOCAL_MODEL_SPECS[config.providerId];

  return {
    providerId: config.providerId,

    validateParams(params: GenerationParams) {
      const errors = config.validate(params);
      return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    },

    estimateCostUsd(params: GenerationParams) {
      return config.estimateCostUsd(params);
    },

    async execute(params: GenerationParams, ctx: ExecutionContext): Promise<AdapterResult> {
      // 1. Resolve active endpoint
      const endpoint = await getActiveEndpoint(config.providerId);
      if (!endpoint) {
        throw new ProviderError(
          "UNSUPPORTED",
          `No active endpoint for ${config.providerId}`,
          config.providerId,
          false,
          true, // fallbackable — try API provider
        );
      }

      // 2. Check queue depth — if overloaded, signal fallback
      if (endpoint.queueDepth > (endpoint.scalingConfig.maxQueueDepth ?? 20) && endpoint.warmWorkers === 0) {
        throw new ProviderError(
          "TRANSIENT",
          `${config.providerId} queue overloaded (depth=${endpoint.queueDepth}, warm=0)`,
          config.providerId,
          false,
          true,
        );
      }

      // 3. Select platform client
      const client = getPlatformClient(endpoint.platform);

      // 4. Build job input
      const modelVersion = spec?.modelName ?? config.modelType;
      const jobInput = config.buildJobInput(params, modelVersion);

      // 5. Execute inference
      const timeoutMs = ctx.timeout ?? 300_000;
      let jobResult: InferenceJobResult;

      try {
        jobResult = await client.runSync(endpoint.endpointId, jobInput, timeoutMs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ProviderError("TRANSIENT", `${config.providerId} execution failed: ${msg}`, config.providerId);
      }

      // 6. Handle failure
      if (jobResult.status === "FAILED") {
        throw new ProviderError(
          "TRANSIENT",
          jobResult.error ?? `${config.providerId} job failed`,
          config.providerId,
        );
      }
      if (jobResult.status === "TIMED_OUT") {
        throw new ProviderError(
          "TIMEOUT",
          jobResult.error ?? `${config.providerId} job timed out`,
          config.providerId,
        );
      }

      // 7. Log GPU usage
      const gpuSeconds = jobResult.executionTimeMs
        ? jobResult.executionTimeMs / 1000
        : estimateLocalProviderCost(config.providerId, params as unknown as Record<string, unknown>).estimatedGpuSeconds;

      await logGpuUsage({
        endpointId: endpoint.id,
        gpuType: endpoint.gpuType as GpuType,
        gpuSeconds,
        modelName: spec?.modelName ?? config.modelType,
        modelVersion,
        wasColdStart: jobResult.wasColdStart ?? false,
        coldStartSeconds: jobResult.coldStartMs ? jobResult.coldStartMs / 1000 : undefined,
      }).catch(err => {
        console.warn(`[${config.providerId}] Failed to log GPU usage:`, err);
      });

      // 8. Extract and return result
      const result = config.extractResult(jobResult, params);

      // Attach actual cost if we know the GPU time
      if (jobResult.executionTimeMs) {
        const cost = estimateLocalProviderCost(config.providerId, params as unknown as Record<string, unknown>);
        result.actualCostUsd = cost.marginCostUsd;
      }

      return result;
    },
  };
}
