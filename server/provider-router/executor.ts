/**
 * Executor — Runs generation requests through the provider chain.
 *
 * Responsibilities:
 * - Retry logic (exponential backoff for TRANSIENT/TIMEOUT)
 * - Fallback chain (try next provider on retryable failures)
 * - Never-fallback enforcement (CONTENT_VIOLATION, INVALID_PARAMS, INSUFFICIENT_CREDITS)
 * - Request/result logging to generation_requests / generation_results
 * - Credit hold/commit/release lifecycle (Stage 4)
 */
import { nanoid } from "nanoid";
import { getDb } from "../db";
import { eq } from "drizzle-orm";
import {
  generationRequests,
  generationResults,
} from "../../drizzle/schema";
import {
  getAdapter,
  getActiveApiKey,
} from "./registry";
import { selectProviders } from "./router";
import { estimateCost } from "./cost-estimator";
import type {
  GenerateRequest,
  GenerateResult,
  ExecutionContext,
} from "./types";
import {
  ProviderError,
  NEVER_FALLBACK_ERRORS,
  EXECUTOR_CONFIG,
  usdToCredits,
} from "./types";

/**
 * Main entry point: generate content via the multi-provider router.
 *
 * 1. Route to best provider chain
 * 2. For each provider in chain: estimate cost, execute, log
 * 3. On success: commit hold, log result
 * 4. On failure: try next provider or release hold
 */
export async function generate(request: GenerateRequest): Promise<GenerateResult> {
  // 1. Route
  const routing = await selectProviders(request);
  const { chain } = routing;

  let lastError: ProviderError | null = null;
  let attemptCount = 0;

  // 2. Try each provider in the chain
  for (const providerId of chain) {
    if (attemptCount >= EXECUTOR_CONFIG.maxAttempts) break;

    const adapter = getAdapter(providerId);
    if (!adapter) continue;

    // Validate params
    const validation = adapter.validateParams(request.params);
    if (!validation.valid) {
      lastError = new ProviderError(
        "INVALID_PARAMS",
        `Validation failed: ${validation.errors?.join(", ")}`,
        providerId,
        false,
        false,
      );
      // INVALID_PARAMS = never fallback
      break;
    }

    // Estimate cost
    const cost = estimateCost(providerId, request.params);

    // Get API key
    const apiKey = await getActiveApiKey(providerId);
    if (!apiKey) {
      lastError = new ProviderError("UNSUPPORTED", "No active API key", providerId);
      continue; // Try next provider
    }

    // Create request record
    const requestUid = nanoid(20);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const [insertResult] = await db.insert(generationRequests).values({
      requestUid,
      userId: request.userId,
      episodeId: request.episodeId ?? null,
      sceneId: request.sceneId ?? null,
      requestType: request.type,
      providerId,
      providerHint: request.providerHint ?? null,
      fallbackChain: chain,
      tier: request.tier,
      params: sanitizeParams(request.params as unknown as Record<string, unknown>),
      holdId: request.holdId ?? null,
      estimatedCostCredits: String(cost.estimatedCredits),
      estimatedCostUsd: String(cost.estimatedUsd),
      status: "executing",
      retryCount: attemptCount,
      parentRequestId: null,
    });
    const requestId = (insertResult as { insertId: number }).insertId;

    // Execute with retry
    const maxRetries = 1; // 1 retry on same provider, then fallback
    for (let retry = 0; retry <= maxRetries; retry++) {
      attemptCount++;
      if (attemptCount > EXECUTOR_CONFIG.maxAttempts) break;

      const startTime = Date.now();
      try {
        const ctx: ExecutionContext = {
          apiKey: apiKey.decryptedKey,
          apiKeyId: apiKey.id,
          endpointUrl: "", // adapter knows its own endpoint
          timeout: EXECUTOR_CONFIG.baseTimeoutMs,
        };

        const result = await adapter.execute(request.params, ctx);
        const latencyMs = Date.now() - startTime;
        const actualCostUsd = result.actualCostUsd ?? cost.estimatedUsd;
        const actualCostCredits = usdToCredits(actualCostUsd);

        // Log success
        await db.update(generationRequests)
          .set({
            status: "succeeded",
            actualCostCredits: String(actualCostCredits),
            actualCostUsd: String(actualCostUsd),
            latencyMs,
            retryCount: attemptCount - 1,
            completedAt: new Date(),
          })
          .where(eq(generationRequests.id, requestId));

        // Store result
        await db.insert(generationResults).values({
          requestId,
          storageUrl: result.storageUrl,
          storageSizeBytes: result.storageSizeBytes ?? null,
          mimeType: result.mimeType ?? null,
          durationSeconds: result.durationSeconds ? String(result.durationSeconds) : null,
          metadata: result.metadata ?? null,
          isDraft: result.isDraft ? 1 : 0,
        });

        // Report success to circuit breaker (imported dynamically to avoid circular deps)
        const { reportSuccess } = await import("./circuit-breaker");
        await reportSuccess(providerId).catch(() => {});

        return {
          requestId,
          requestUid,
          providerId,
          storageUrl: result.storageUrl,
          mimeType: result.mimeType,
          durationSeconds: result.durationSeconds,
          metadata: result.metadata,
          actualCostCredits,
          actualCostUsd,
          latencyMs,
          isDraft: result.isDraft ?? false,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const providerErr = err instanceof ProviderError
          ? err
          : new ProviderError("UNKNOWN", err instanceof Error ? err.message : String(err), providerId);

        // Log failure
        await db.update(generationRequests)
          .set({
            status: "failed",
            errorCode: providerErr.code,
            errorDetail: providerErr.message.slice(0, 500), // Truncate for safety
            latencyMs,
            retryCount: attemptCount - 1,
            completedAt: new Date(),
          })
          .where(eq(generationRequests.id, requestId));

        // Report failure to circuit breaker
        const { reportFailure } = await import("./circuit-breaker");
        await reportFailure(providerId).catch(() => {});

        lastError = providerErr;

        // Never-fallback errors: stop immediately
        if (NEVER_FALLBACK_ERRORS.includes(providerErr.code)) {
          throw providerErr;
        }

        // If retryable and we have retries left, backoff and retry same provider
        if (providerErr.retryable && retry < maxRetries) {
          const delay = Math.min(
            EXECUTOR_CONFIG.retryBackoffBaseMs * Math.pow(EXECUTOR_CONFIG.retryBackoffMultiplier, retry),
            EXECUTOR_CONFIG.maxRetryDelayMs,
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Otherwise, break to try next provider in chain
        break;
      }
    }
  }

  // All providers exhausted
  throw lastError ?? new ProviderError("UNKNOWN", "All providers failed", "executor");
}

/**
 * Sanitize params before persisting — truncate user text, remove secrets.
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + "...[truncated]";
    } else if (key.toLowerCase().includes("key") || key.toLowerCase().includes("secret")) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
