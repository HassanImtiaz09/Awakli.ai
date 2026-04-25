/**
 * I1: Multi-LLM Orchestration — Shared Types
 *
 * Defines the LLM role enum, routing configuration, and common types
 * used across all four LLM roles (Director, Prompt Engineer, Critic, Voice Director).
 */

export type LLMRole = "director" | "prompt-engineer" | "critic" | "voice-director";

export interface LLMRouteConfig {
  model: string;
  timeoutMs: number;
  maxRetries: number;
  temperature: number;
  maxOutputTokens: number;
}

/**
 * Default routing map — maps each role to its recommended model + budget.
 * The orchestrator uses this unless overridden per-call.
 */
export const DEFAULT_ROUTE_MAP: Record<LLMRole, LLMRouteConfig> = {
  director: {
    model: "claude-sonnet-4-20250514",
    timeoutMs: 30_000,
    maxRetries: 3,
    temperature: 0.2,
    maxOutputTokens: 4096,
  },
  "prompt-engineer": {
    model: "claude-sonnet-4-20250514",
    timeoutMs: 5_000,
    maxRetries: 3,
    temperature: 0.4,
    maxOutputTokens: 2048,
  },
  critic: {
    model: "gemini-2.5-flash",
    timeoutMs: 5_000,
    maxRetries: 3,
    temperature: 0,
    maxOutputTokens: 1024,
  },
  "voice-director": {
    model: "gemini-2.5-flash",
    timeoutMs: 5_000,
    maxRetries: 3,
    temperature: 0.3,
    maxOutputTokens: 512,
  },
};

export interface LLMCallOptions {
  role: LLMRole;
  systemPrompt: string;
  userContent: string | Array<{ type: string; [key: string]: any }>;
  responseSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
  overrides?: Partial<LLMRouteConfig>;
}

export interface LLMCallResult {
  role: LLMRole;
  model: string;
  content: string;
  parsed?: any;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  costEstimate: number;
  retryCount: number;
  success: boolean;
  error?: string;
}

/**
 * Cost per 1K tokens for each model (approximate, for observability).
 * Input / output costs are averaged for simplicity.
 */
export const MODEL_COST_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "gemini-2.5-flash": { input: 0.00015, output: 0.00035 },
};
