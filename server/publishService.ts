/**
 * publishService — Server-side manga publishing logic.
 *
 * Handles slug generation, cover config, watermark rules, and tier-aware limits.
 */

// ─── Slug generation ────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a title.
 * Appends a short random suffix to avoid collisions.
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .substring(0, 60);
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

// ─── Tier-aware publishing limits ───────────────────────────────────────

export interface TierPublishConfig {
  maxEpisodes: number;
  watermarkRequired: boolean;
  canToggleVisibility: boolean;
  canSchedulePublish: boolean;
  canCustomDomain: boolean;
  canRSS: boolean;
}

const TIER_PUBLISH_CONFIGS: Record<string, TierPublishConfig> = {
  free_trial: {
    maxEpisodes: 3,
    watermarkRequired: true,
    canToggleVisibility: false,
    canSchedulePublish: false,
    canCustomDomain: false,
    canRSS: false,
  },
  creator: {
    maxEpisodes: 3,
    watermarkRequired: true,
    canToggleVisibility: false,
    canSchedulePublish: false,
    canCustomDomain: false,
    canRSS: false,
  },
  creator_pro: {
    maxEpisodes: Infinity,
    watermarkRequired: false,
    canToggleVisibility: true,
    canSchedulePublish: false,
    canCustomDomain: false,
    canRSS: false,
  },
  studio: {
    maxEpisodes: Infinity,
    watermarkRequired: false,
    canToggleVisibility: true,
    canSchedulePublish: true,
    canCustomDomain: true,
    canRSS: true,
  },
  studio_pro: {
    maxEpisodes: Infinity,
    watermarkRequired: false,
    canToggleVisibility: true,
    canSchedulePublish: true,
    canCustomDomain: true,
    canRSS: true,
  },
  enterprise: {
    maxEpisodes: Infinity,
    watermarkRequired: false,
    canToggleVisibility: true,
    canSchedulePublish: true,
    canCustomDomain: true,
    canRSS: true,
  },
};

export function getTierPublishConfig(tier: string): TierPublishConfig {
  return (
    TIER_PUBLISH_CONFIGS[tier] ?? TIER_PUBLISH_CONFIGS["free_trial"]
  );
}

// ─── Cover style presets ────────────────────────────────────────────────

export type CoverStylePreset = "shonen" | "seinen" | "shojo";

export const COVER_PRESETS: Record<CoverStylePreset, { label: string; fontStyle: string }> = {
  shonen: { label: "Shonen Bold", fontStyle: "bold uppercase" },
  seinen: { label: "Seinen Minimal", fontStyle: "light tracking-wide uppercase" },
  shojo: { label: "Shojo Soft", fontStyle: "medium italic" },
};

export const VALID_COVER_PRESETS: CoverStylePreset[] = ["shonen", "seinen", "shojo"];

// ─── Publishing steps (for progress tracking) ──────────────────────────

export const PUBLISH_STEPS = [
  "Composing pages…",
  "Generating thumbnails…",
  "Creating your share link…",
] as const;

// ─── Copy strings ───────────────────────────────────────────────────────

export const PUBLISH_COPY = {
  pageTitle: "Publish your manga",
  subhead: "Final check. Pick a cover. Ship it.",
  publishCTA: "Publish episode",
  step1: "Composing pages…",
  step2: "Generating thumbnails…",
  step3: "Creating your share link…",
  successTitle: "Your episode is live.",
  animeCTA: "Make it move — generate the anime →",
};
