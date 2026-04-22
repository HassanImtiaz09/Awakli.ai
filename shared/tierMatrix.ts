/**
 * Tier Capability Matrix — Single source of truth.
 *
 * Every feature gate (client HOC, server middleware, stage rail) references
 * this file so capability changes propagate everywhere at build time.
 *
 * @see shared/tiers.ts for tier ordering helpers
 */
import { type TierName, TIER_ORDER, tierLevel, meetsMinTier } from "./tiers";

// ─── Capability Keys ────────────────────────────────────────────────────────
export const CAPABILITY_KEYS = [
  // Wizard stages
  "stage_input",
  "stage_setup",
  "stage_script",
  "stage_panels",
  "stage_anime_gate",
  "stage_video",
  "stage_publish",

  // Generation features
  "ai_script_generation",
  "ai_panel_generation",
  "ai_video_generation",
  "voice_cloning",
  "custom_lora_training",
  "hd_export",
  "batch_generation",

  // Platform features
  "community_voting",
  "creator_analytics",
  "priority_queue",
  "team_collaboration",
  "api_access",
  "white_label",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

// ─── Per-Capability Minimum Tier ────────────────────────────────────────────
// Maps each capability to the lowest tier that unlocks it.
// If a capability is not listed, it defaults to "free_trial" (available to all).
const CAPABILITY_MIN_TIER: Record<CapabilityKey, TierName> = {
  // Wizard stages — mirrors TIER_STAGE_ACCESS in projectService.ts
  stage_input:       "free_trial",
  stage_setup:       "free_trial",
  stage_script:      "free_trial",
  stage_panels:      "free_trial",
  stage_anime_gate:  "creator",
  stage_video:       "creator_pro",
  stage_publish:     "creator_pro",

  // Generation features
  ai_script_generation:  "free_trial",
  ai_panel_generation:   "free_trial",
  ai_video_generation:   "creator_pro",
  voice_cloning:         "studio",
  custom_lora_training:  "creator_pro",
  hd_export:             "creator",
  batch_generation:      "creator_pro",

  // Platform features
  community_voting:    "free_trial",
  creator_analytics:   "creator",
  priority_queue:      "creator_pro",
  team_collaboration:  "studio",
  api_access:          "enterprise",
  white_label:         "enterprise",
};

// ─── Tier Display Metadata ──────────────────────────────────────────────────
export interface TierMeta {
  name: TierName;
  displayName: string;
  tagline: string;
  monthlyPrice: number | null; // null = custom/contact-us
  upgradeSku: string;
  ctaText: string;
}

export const TIER_META: Record<TierName, TierMeta> = {
  free_trial: {
    name: "free_trial",
    displayName: "Apprentice",
    tagline: "Start your manga journey",
    monthlyPrice: 0,
    upgradeSku: "",
    ctaText: "",
  },
  creator: {
    name: "creator",
    displayName: "Mangaka",
    tagline: "Unlock anime previews",
    monthlyPrice: 19,
    upgradeSku: "price_mangaka_monthly",
    ctaText: "Unlock with Mangaka — from $19/mo",
  },
  creator_pro: {
    name: "creator_pro",
    displayName: "Studio",
    tagline: "Full anime pipeline access",
    monthlyPrice: 49,
    upgradeSku: "price_studio_monthly",
    ctaText: "Unlock with Studio — from $49/mo",
  },
  studio: {
    name: "studio",
    displayName: "Studio Pro",
    tagline: "Voice cloning & team features",
    monthlyPrice: 99,
    upgradeSku: "price_studio_pro_monthly",
    ctaText: "Unlock with Studio Pro — from $99/mo",
  },
  enterprise: {
    name: "enterprise",
    displayName: "Enterprise",
    tagline: "Custom solutions at scale",
    monthlyPrice: null,
    upgradeSku: "price_enterprise",
    ctaText: "Contact us for Enterprise pricing",
  },
};

// ─── Matrix Query Functions ─────────────────────────────────────────────────

/**
 * Get the minimum tier required for a capability.
 */
export function getMinTier(capability: CapabilityKey): TierName {
  return CAPABILITY_MIN_TIER[capability];
}

/**
 * Check if a tier has access to a specific capability.
 */
export function tierHasCapability(tier: string, capability: CapabilityKey): boolean {
  const minTier = CAPABILITY_MIN_TIER[capability];
  return meetsMinTier(tier, minTier);
}

/**
 * Get all capabilities available to a given tier.
 */
export function getTierCapabilities(tier: string): CapabilityKey[] {
  return CAPABILITY_KEYS.filter((cap) => tierHasCapability(tier, cap));
}

/**
 * Get the full capability matrix as a Record<TierName, CapabilityKey[]>.
 */
export function getFullMatrix(): Record<TierName, CapabilityKey[]> {
  const matrix = {} as Record<TierName, CapabilityKey[]>;
  for (const tier of TIER_ORDER) {
    matrix[tier] = getTierCapabilities(tier);
  }
  return matrix;
}

/**
 * Build the upgrade payload for a denied capability.
 * Used by both server middleware and client HOC.
 */
export function buildUpgradePayload(
  currentTier: string,
  capability: CapabilityKey
): {
  currentTier: string;
  required: TierName;
  requiredDisplayName: string;
  upgradeSku: string;
  ctaText: string;
  pricingUrl: string;
} {
  const required = getMinTier(capability);
  const meta = TIER_META[required];
  return {
    currentTier,
    required,
    requiredDisplayName: meta.displayName,
    upgradeSku: meta.upgradeSku,
    ctaText: meta.ctaText,
    pricingUrl: "/pricing",
  };
}

/**
 * Map wizard stage index (0-6) to its capability key.
 */
export function stageToCapability(stageIndex: number): CapabilityKey | null {
  const map: Record<number, CapabilityKey> = {
    0: "stage_input",
    1: "stage_setup",
    2: "stage_script",
    3: "stage_panels",
    4: "stage_anime_gate",
    5: "stage_video",
    6: "stage_publish",
  };
  return map[stageIndex] ?? null;
}

// Re-export tier utilities for convenience
export { TIER_ORDER, type TierName, tierLevel, meetsMinTier };
