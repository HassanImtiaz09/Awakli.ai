/**
 * I1: LLM Orchestrator — single entrypoint for all Multi-LLM calls
 *
 * Routes to the right model based on role, handles retry with exponential
 * backoff on rate-limit (429), enforces timeout per role, forces structured
 * output, and logs everything to the observability sink.
 *
 * All four LLM tickets (D1–D4) call llmCall() rather than calling
 * invokeLLM directly.
 */

import { invokeLLM, type Message, type MessageContent } from "../../_core/llm.js";
import {
  type LLMRole,
  type LLMCallOptions,
  type LLMCallResult,
  type LLMRouteConfig,
  DEFAULT_ROUTE_MAP,
  MODEL_COST_PER_1K,
} from "./types.js";
import { llmObs } from "./observability.js";
import { budgetGuard } from "./budget-guard.js";
import { featureFlags } from "./feature-flags.js";

/**
 * Single entrypoint for all LLM calls in the pipeline.
 *
 * Routes to the correct model, handles retry/backoff, enforces budget,
 * respects feature flags, and logs to observability.
 */
export async function llmCall(options: LLMCallOptions): Promise<LLMCallResult> {
  const { role, systemPrompt, userContent, responseSchema, overrides } = options;

  // ─── Feature flag check ────────────────────────────────────────────────
  if (!featureFlags.isEnabled(role)) {
    return makeDisabledResult(role);
  }

  // ─── Budget guard check ────────────────────────────────────────────────
  const budgetCheck = budgetGuard.checkAllowed(role);
  if (!budgetCheck.allowed) {
    console.warn(`  [LLM] ${role} blocked: ${budgetCheck.reason}`);
    return makeBudgetBlockedResult(role, budgetCheck.reason!);
  }

  // ─── Resolve route config ──────────────────────────────────────────────
  const routeConfig: LLMRouteConfig = {
    ...DEFAULT_ROUTE_MAP[role],
    ...overrides,
  };

  // ─── Build messages ────────────────────────────────────────────────────
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent as MessageContent | MessageContent[] },
  ];

  // ─── Retry loop with exponential backoff ───────────────────────────────
  const backoffMs = [2000, 4000, 8000];
  let lastError: string = "";
  let retryCount = 0;

  for (let attempt = 0; attempt <= routeConfig.maxRetries; attempt++) {
    const startMs = Date.now();

    try {
      const response = await invokeLLM({
        messages,
        response_format: responseSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: responseSchema.name,
                schema: responseSchema.schema,
                strict: responseSchema.strict ?? true,
              },
            }
          : undefined,
      });

      const latencyMs = Date.now() - startMs;
      const content = response.choices?.[0]?.message?.content;
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);

      // Parse JSON if schema was provided
      let parsed: any = undefined;
      if (responseSchema && contentStr) {
        try {
          parsed = JSON.parse(contentStr);
        } catch {
          // JSON parse failed — treat as soft error, return raw content
          console.warn(`  [LLM] ${role}: JSON parse failed, returning raw content`);
        }
      }

      // Estimate cost
      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;
      const costRates = MODEL_COST_PER_1K[routeConfig.model] ?? { input: 0.001, output: 0.005 };
      const costEstimate =
        (promptTokens / 1000) * costRates.input +
        (completionTokens / 1000) * costRates.output;

      const result: LLMCallResult = {
        role,
        model: routeConfig.model,
        content: contentStr,
        parsed,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        latencyMs,
        costEstimate,
        retryCount,
        success: true,
      };

      // Log to observability
      llmObs.logCall(result);
      budgetGuard.recordOutcome(role, true);

      return result;
    } catch (err: any) {
      const latencyMs = Date.now() - startMs;
      lastError = err.message?.slice(0, 200) ?? "Unknown error";
      retryCount = attempt + 1;

      // Check if rate-limited (429) — retry with backoff
      const isRateLimit = lastError.includes("429") || lastError.includes("rate");
      const isTimeout = latencyMs >= routeConfig.timeoutMs;

      if (attempt < routeConfig.maxRetries && (isRateLimit || isTimeout)) {
        const delay = backoffMs[attempt] ?? 8000;
        console.warn(
          `  [LLM] ${role} attempt ${attempt + 1} failed (${isRateLimit ? "rate-limit" : "timeout"}), retrying in ${delay}ms...`
        );
        await sleep(delay);
        continue;
      }

      // Non-retryable error or max retries exceeded
      const failResult: LLMCallResult = {
        role,
        model: routeConfig.model,
        content: "",
        latencyMs,
        costEstimate: 0,
        retryCount,
        success: false,
        error: lastError,
      };

      llmObs.logCall(failResult);
      budgetGuard.recordOutcome(role, false);

      return failResult;
    }
  }

  // Should not reach here, but safety net
  return makeBudgetBlockedResult(role, `Max retries exceeded: ${lastError}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeDisabledResult(role: LLMRole): LLMCallResult {
  return {
    role,
    model: "disabled",
    content: "",
    latencyMs: 0,
    costEstimate: 0,
    retryCount: 0,
    success: false,
    error: `Feature flag disabled for ${role}`,
  };
}

function makeBudgetBlockedResult(role: LLMRole, reason: string): LLMCallResult {
  return {
    role,
    model: "blocked",
    content: "",
    latencyMs: 0,
    costEstimate: 0,
    retryCount: 0,
    success: false,
    error: reason,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
