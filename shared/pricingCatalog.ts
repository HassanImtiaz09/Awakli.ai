/**
 * shared/pricingCatalog.ts — X3: Single canonical source of truth for tier naming & pricing.
 *
 * Every UI surface (pricing page, anime-gate, UpgradeModal, gate cards, credit meter)
 * imports from here. Zero string literals of tier names in JSX.
 */

// ─── Canonical Tier Keys ────────────────────────────────────────────────────
export const TIER_KEYS = [
  "free_trial",
  "creator",
  "creator_pro",
  "studio",
  "enterprise",
] as const;

export type TierKey = (typeof TIER_KEYS)[number];

// ─── Canonical Display Names ────────────────────────────────────────────────
// The ONLY place tier display names are defined.
export const TIER_DISPLAY_NAMES: Record<TierKey, string> = {
  free_trial:   "Apprentice",
  creator:      "Mangaka",
  creator_pro:  "Studio",
  studio:       "Studio Pro",
  enterprise:   "Enterprise",
};

// ─── Pricing (monthly, in USD cents) ────────────────────────────────────────
export const TIER_MONTHLY_PRICE_CENTS: Record<TierKey, number> = {
  free_trial:   0,
  creator:      1900,    // $19/mo
  creator_pro:  4900,    // $49/mo
  studio:       14900,   // $149/mo
  enterprise:   0,       // custom
};

export const TIER_ANNUAL_MONTHLY_PRICE_CENTS: Record<TierKey, number> = {
  free_trial:   0,
  creator:      1500,    // $15/mo billed annually
  creator_pro:  3900,    // $39/mo billed annually
  studio:       11900,   // $119/mo billed annually
  enterprise:   0,
};

// ─── Monthly Credit Allocations ─────────────────────────────────────────────
export const TIER_MONTHLY_CREDITS: Record<TierKey, number> = {
  free_trial:   15,
  creator:      200,     // Mangaka
  creator_pro:  600,     // Studio
  studio:       2000,    // Studio Pro
  enterprise:   0,       // custom
};

// ─── Tier Taglines ──────────────────────────────────────────────────────────
export const TIER_TAGLINES: Record<TierKey, string> = {
  free_trial:   "Start your manga journey",
  creator:      "Unlock anime & the full pipeline",
  creator_pro:  "Full anime pipeline + LoRA + voice",
  studio:       "4K, ProRes, team collaboration",
  enterprise:   "Custom solutions at scale",
};

// ─── CTA Copy ───────────────────────────────────────────────────────────────
export const TIER_CTA: Record<TierKey, string> = {
  free_trial:   "",
  creator:      `Unlock with ${TIER_DISPLAY_NAMES.creator} — from $${(TIER_MONTHLY_PRICE_CENTS.creator / 100).toFixed(0)}/mo`,
  creator_pro:  `Unlock with ${TIER_DISPLAY_NAMES.creator_pro} — from $${(TIER_MONTHLY_PRICE_CENTS.creator_pro / 100).toFixed(0)}/mo`,
  studio:       `Unlock with ${TIER_DISPLAY_NAMES.studio} — from $${(TIER_MONTHLY_PRICE_CENTS.studio / 100).toFixed(0)}/mo`,
  enterprise:   "Contact us for Enterprise pricing",
};

// ─── Top-Up Credit Packs (X4) ───────────────────────────────────────────────
export const CREDIT_PACKS = [
  { key: "spark",     name: "Spark",     credits: 100,   priceCents: 990,   perCreditCents: 9.9  },
  { key: "flame",     name: "Flame",     credits: 500,   priceCents: 3990,  perCreditCents: 7.98 },
  { key: "blaze",     name: "Blaze",     credits: 1500,  priceCents: 9990,  perCreditCents: 6.66 },
  { key: "inferno",   name: "Inferno",   credits: 5000,  priceCents: 29990, perCreditCents: 5.998 },
  { key: "supernova", name: "Supernova", credits: 15000, priceCents: 74990, perCreditCents: 4.999 },
] as const;

export type CreditPackKey = (typeof CREDIT_PACKS)[number]["key"];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the display name for a tier key. Falls back to titleCase of the key. */
export function tierDisplayName(tier: string): string {
  return TIER_DISPLAY_NAMES[tier as TierKey] ?? tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Format a price in cents as a dollar string, e.g. 1900 → "$19" */
export function formatPrice(cents: number): string {
  if (cents === 0) return "Free";
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Get the monthly price string for a tier, e.g. "$19/mo" */
export function tierPriceLabel(tier: TierKey, annual = false): string {
  const cents = annual ? TIER_ANNUAL_MONTHLY_PRICE_CENTS[tier] : TIER_MONTHLY_PRICE_CENTS[tier];
  if (cents === 0 && tier === "enterprise") return "Custom";
  if (cents === 0) return "Free";
  return `${formatPrice(cents)}/mo`;
}
