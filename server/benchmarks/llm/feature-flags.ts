/**
 * C2: Feature Flags — per-role LLM enable/disable
 *
 * Each LLM role can be independently toggled on/off.
 * When disabled, the orchestrator returns a graceful fallback result
 * and the pipeline continues without that role's output.
 *
 * Default: Phase A ships with only Critic enabled.
 * Phase B enables Director, Phase C enables Prompt Engineer,
 * Phase D enables Voice Director.
 */

import type { LLMRole } from "./types.js";

export interface FeatureFlagConfig {
  director: boolean;
  "prompt-engineer": boolean;
  critic: boolean;
  "voice-director": boolean;
}

/**
 * Default: all roles enabled (full multi-LLM stack).
 * Override at runtime via setFlags() for phased rollout.
 */
const DEFAULT_FLAGS: FeatureFlagConfig = {
  director: true,
  "prompt-engineer": true,
  critic: true,
  "voice-director": true,
};

/**
 * Phase A preset: only Critic + Orchestrator infrastructure.
 */
export const PHASE_A_FLAGS: FeatureFlagConfig = {
  director: false,
  "prompt-engineer": false,
  critic: true,
  "voice-director": false,
};

/**
 * Phase B preset: Critic + Director.
 */
export const PHASE_B_FLAGS: FeatureFlagConfig = {
  director: true,
  "prompt-engineer": false,
  critic: true,
  "voice-director": false,
};

/**
 * Phase C preset: Critic + Director + Prompt Engineer.
 */
export const PHASE_C_FLAGS: FeatureFlagConfig = {
  director: true,
  "prompt-engineer": true,
  critic: true,
  "voice-director": false,
};

/**
 * Phase D / Full preset: all roles enabled.
 */
export const PHASE_D_FLAGS: FeatureFlagConfig = {
  director: true,
  "prompt-engineer": true,
  critic: true,
  "voice-director": true,
};

class FeatureFlags {
  private flags: FeatureFlagConfig;

  constructor(initial?: Partial<FeatureFlagConfig>) {
    this.flags = { ...DEFAULT_FLAGS, ...initial };
  }

  isEnabled(role: LLMRole): boolean {
    return this.flags[role] ?? false;
  }

  setFlags(flags: Partial<FeatureFlagConfig>): void {
    this.flags = { ...this.flags, ...flags };
    console.log(`  [FLAGS] Updated: ${JSON.stringify(this.flags)}`);
  }

  setPhase(phase: "A" | "B" | "C" | "D"): void {
    const presets: Record<string, FeatureFlagConfig> = {
      A: PHASE_A_FLAGS,
      B: PHASE_B_FLAGS,
      C: PHASE_C_FLAGS,
      D: PHASE_D_FLAGS,
    };
    this.flags = { ...presets[phase] };
    console.log(`  [FLAGS] Phase ${phase}: ${JSON.stringify(this.flags)}`);
  }

  getFlags(): FeatureFlagConfig {
    return { ...this.flags };
  }
}

// Singleton instance — default to all enabled
export const featureFlags = new FeatureFlags();
