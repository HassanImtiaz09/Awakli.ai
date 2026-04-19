/**
 * Tier Hierarchy — Single source of truth for subscription tier ordering.
 *
 * Import from `shared/tiers` in both server and client code.
 * @see Delta Audit v1.3 P2
 */

/** Ordered list of subscription tiers from lowest to highest */
export const TIER_ORDER = [
  "free_trial",
  "creator",
  "creator_pro",
  "studio",
  "enterprise",
] as const;

export type TierName = (typeof TIER_ORDER)[number];

/** Numeric hierarchy map for fast comparison */
export const TIER_HIERARCHY: Record<string, number> = Object.fromEntries(
  TIER_ORDER.map((tier, i) => [tier, i])
);

/**
 * Get the numeric level of a tier (0 = free_trial, 4 = enterprise).
 * Returns 0 for unknown tiers.
 */
export function tierLevel(tier: string): number {
  return TIER_HIERARCHY[tier] ?? 0;
}

/**
 * Check if a user's tier meets or exceeds the required minimum tier.
 */
export function meetsMinTier(userTier: string, minTier: string): boolean {
  return tierLevel(userTier) >= tierLevel(minTier);
}
