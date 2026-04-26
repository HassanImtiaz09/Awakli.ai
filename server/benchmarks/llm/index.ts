/**
 * Multi-LLM Orchestration — Barrel Export
 *
 * All four LLM roles, the orchestrator, budget guard, observability,
 * and feature flags are exported from this single module.
 */

// Infrastructure (I1, I2, C2)
export { llmCall } from "./orchestrator.js";
export { llmObs } from "./observability.js";
export { budgetGuard } from "./budget-guard.js";
export { featureFlags, PHASE_A_FLAGS, PHASE_B_FLAGS, PHASE_C_FLAGS, PHASE_D_FLAGS } from "./feature-flags.js";
export type { LLMRole, LLMCallOptions, LLMCallResult, LLMRouteConfig } from "./types.js";
export { DEFAULT_ROUTE_MAP, MODEL_COST_PER_1K } from "./types.js";

// D1: Director
export { runDirector, buildFallbackPlan } from "./director.js";
export type { ProjectPlan, ProjectPlanSlice, DirectorInput } from "./director.js";

// D2: Visual Prompt Engineer
export { runPromptEngineer, runPromptEngineerBatch } from "./prompt-engineer.js";
export type { PromptEngineerInput, PromptEngineerResult, TargetModel } from "./prompt-engineer.js";

// D3: Critic
export { criticValidateV3, criticValidateWithRetry, MAX_CRITIC_RETRIES } from "./critic.js";
export type { CriticInput, CriticResult, CriticIssue } from "./critic.js";

// D4: Voice Director
export { runVoiceDirector, runVoiceDirectorBatch } from "./voice-director.js";
export type { VoiceDirectorInput, VoiceDirectorResult, EmotionTag, TTSOverrides } from "./voice-director.js";
