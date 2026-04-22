/**
 * Tier Capability Matrix — Single source of truth.
 *
 * Every feature gate (client HOC, server middleware, stage rail) references
 * this file so capability changes propagate everywhere at build time.
 *
 * @see shared/tiers.ts for tier ordering helpers
 */
import { type TierName, TIER_ORDER, tierLevel, meetsMinTier } from "./tiers";
import { TIER_DISPLAY_NAMES, TIER_MONTHLY_PRICE_CENTS, TIER_TAGLINES, TIER_CTA, type TierKey } from "./pricingCatalog";

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

  // Character & style features (Studio+)
  "character_foundation",
  "style_refs",
  "character_library_reuse",
  "whole_book_mode",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

// ─── Per-Capability Minimum Tier ────────────────────────────────────────────
// Maps each capability to the lowest tier that unlocks it.
// If a capability is not listed, it defaults to "free_trial" (available to all).
const CAPABILITY_MIN_TIER: Record<CapabilityKey, TierName> = {
  // Wizard stages — mirrors TIER_STAGE_ACCESS in projectService.ts
  // Manga path (free): Input → Script → Panels → Publish
  stage_input:       "free_trial",
  stage_script:      "free_trial",
  stage_panels:      "free_trial",
  stage_publish:     "free_trial",   // X2: open to all tiers
  // Anime path (paid): Gate → Setup → Video
  stage_anime_gate:  "free_trial",   // gate itself is visible to all; it upsells
  stage_setup:       "creator",      // X2: Mangaka+ (was free_trial)
  stage_video:       "creator",      // X2: Mangaka+ (was creator_pro)

  // Generation features
  ai_script_generation:  "free_trial",
  ai_panel_generation:   "free_trial",
  ai_video_generation:   "creator_pro",
  voice_cloning:         "creator_pro",    // Studio: ✓
  custom_lora_training:  "creator_pro",
  hd_export:             "creator_pro",    // Studio: 4K / ProRes
  batch_generation:      "creator",       // Mangaka: up to 8 panels

  // Platform features
  community_voting:    "free_trial",
  creator_analytics:   "creator",
  priority_queue:      "creator_pro",
  team_collaboration:  "studio",
  api_access:          "enterprise",
  white_label:         "enterprise",

  // Character & style features
  character_foundation:    "creator_pro",   // Studio: ✓
  style_refs:              "studio",
  character_library_reuse: "studio",
  whole_book_mode:         "studio",
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

// Build TIER_META from pricingCatalog (X3: single source of truth)
function buildTierMeta(): Record<TierName, TierMeta> {
  const skuMap: Record<string, string> = {
    free_trial: "",
    creator: "price_mangaka_monthly",
    creator_pro: "price_studio_monthly",
    studio: "price_studio_pro_monthly",
    enterprise: "price_enterprise",
  };
  const result = {} as Record<TierName, TierMeta>;
  for (const tier of TIER_ORDER) {
    const key = tier as TierKey;
    const priceCents = TIER_MONTHLY_PRICE_CENTS[key] ?? 0;
    result[tier] = {
      name: tier,
      displayName: TIER_DISPLAY_NAMES[key] ?? tier,
      tagline: TIER_TAGLINES[key] ?? "",
      monthlyPrice: priceCents === 0 && tier === "enterprise" ? null : priceCents / 100,
      upgradeSku: skuMap[tier] ?? "",
      ctaText: TIER_CTA[key] ?? "",
    };
  }
  return result;
}

export const TIER_META: Record<TierName, TierMeta> = buildTierMeta();

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
  // New pipeline order: Input(0) → Script(1) → Panels(2) → Publish(3) → Gate(4) → Setup(5) → Video(6)
  const map: Record<number, CapabilityKey> = {
    0: "stage_input",
    1: "stage_script",
    2: "stage_panels",
    3: "stage_publish",
    4: "stage_anime_gate",
    5: "stage_setup",
    6: "stage_video",
  };
  return map[stageIndex] ?? null;
}

// Re-export tier utilities for convenience
export { TIER_ORDER, type TierName, tierLevel, meetsMinTier };
