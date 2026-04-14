// ─── Awakli Subscription Tiers & Pricing ─────────────────────────────
// Revised: Free / Creator ($19) / Studio ($49)

export type TierKey = "free" | "creator" | "studio";

export interface TierConfig {
  name: string;
  monthlyPrice: number;       // cents
  annualPrice: number;         // cents (per year)
  annualMonthlyPrice: number;  // cents (monthly equivalent when billed annually)
  credits: number;             // monthly allocation
  maxProjects: number;
  maxChaptersPerProject: number;
  maxPanelsPerChapter: number;
  maxAnimeEpisodesPerMonth: number;
  maxLoraCharacters: number;
  maxVoiceClones: number;
  scriptModel: string;
  videoResolution: string;
  hasWatermark: boolean;
  canUploadManga: boolean;
  canMonetize: boolean;
  revenueSharePercent: number;
  hasApiAccess: boolean;
  hasPriorityQueue: boolean;
  hasPrioritySupport: boolean;
  hasCustomNarrator: boolean;
  canExportManga: boolean;
  canExportAnime: boolean;
  exportFormats: string[];
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

export const TIERS: Record<TierKey, TierConfig> = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualMonthlyPrice: 0,
    credits: 100,
    maxProjects: 3,
    maxChaptersPerProject: 3,
    maxPanelsPerChapter: 20,
    maxAnimeEpisodesPerMonth: 0,
    maxLoraCharacters: 0,
    maxVoiceClones: 0,
    scriptModel: "claude-sonnet-4-20250514",
    videoResolution: "720p",
    hasWatermark: true,
    canUploadManga: false,
    canMonetize: false,
    revenueSharePercent: 0,
    hasApiAccess: false,
    hasPriorityQueue: false,
    hasPrioritySupport: false,
    hasCustomNarrator: false,
    canExportManga: false,
    canExportAnime: false,
    exportFormats: [],
  },
  creator: {
    name: "Creator",
    monthlyPrice: 1900,
    annualPrice: 18000,       // $15/mo * 12 = $180/year
    annualMonthlyPrice: 1500, // $15/mo billed annually
    credits: 2000,
    maxProjects: 10,
    maxChaptersPerProject: 12,
    maxPanelsPerChapter: 30,
    maxAnimeEpisodesPerMonth: 5,
    maxLoraCharacters: 3,
    maxVoiceClones: 2,
    scriptModel: "claude-opus-4-20250514",
    videoResolution: "1080p",
    hasWatermark: false,
    canUploadManga: false,
    canMonetize: true,
    revenueSharePercent: 80,
    hasApiAccess: false,
    hasPriorityQueue: false,
    hasPrioritySupport: false,
    hasCustomNarrator: false,
    canExportManga: true,
    canExportAnime: true,
    exportFormats: ["pdf", "png", "mp4"],
  },
  studio: {
    name: "Studio",
    monthlyPrice: 4900,
    annualPrice: 46800,       // $39/mo * 12 = $468/year
    annualMonthlyPrice: 3900, // $39/mo billed annually
    credits: 10000,
    maxProjects: 999,
    maxChaptersPerProject: 999,
    maxPanelsPerChapter: 999,
    maxAnimeEpisodesPerMonth: 20,
    maxLoraCharacters: 999,
    maxVoiceClones: 999,
    scriptModel: "claude-opus-4-20250514",
    videoResolution: "4K",
    hasWatermark: false,
    canUploadManga: true,
    canMonetize: true,
    revenueSharePercent: 85,
    hasApiAccess: true,
    hasPriorityQueue: true,
    hasPrioritySupport: true,
    hasCustomNarrator: true,
    canExportManga: true,
    canExportAnime: true,
    exportFormats: ["pdf", "png", "zip", "mp4", "prores", "stems", "srt"],
  },
};

// Credit costs per action type
export const CREDIT_COSTS: Record<string, number> = {
  script: 10,
  panel: 2,
  video: 20,
  voice: 1,
  lora_train: 50,
  upscale: 3,
  sfx: 2,
  narrator: 1,
};

// Overage rate: $0.05 per credit for Creator/Studio
export const OVERAGE_RATE_CENTS = 5;

// Anime preview config
export const ANIME_PREVIEW = {
  maxPanels: 6,         // 3-6 panels worth of video
  resolution: "720p",
  watermark: true,
  expiryDays: 30,
};

export function getTierFeatureList(tier: TierKey): string[] {
  const t = TIERS[tier];
  const features: string[] = [];

  if (tier === "free") {
    features.push("3 manga projects (3 chapters each)");
    features.push("AI script + panel generation");
    features.push("Publish to community");
    features.push("Vote and comment");
    features.push("1 free anime preview clip");
  } else if (tier === "creator") {
    features.push("Everything in Free");
    features.push("10 manga projects (12 chapters each)");
    features.push("Claude Opus 4 scripts (best quality)");
    features.push("5 anime episodes per month (1080p)");
    features.push("Voice cloning (2 characters)");
    features.push("Character LoRA training");
    features.push("Download manga + anime files");
    features.push("Earn revenue from premium content (80/20 split)");
  } else if (tier === "studio") {
    features.push("Everything in Creator");
    features.push("Unlimited manga + 20 anime eps/mo");
    features.push("4K output + ProRes export");
    features.push("Priority pipeline queue");
    features.push("85/15 revenue split (best rate)");
    features.push("API access + analytics");
  }

  return features;
}

// Map old 'pro' tier to 'creator' for backward compatibility
export function normalizeTier(tier: string): TierKey {
  if (tier === "pro") return "creator";
  if (tier === "creator" || tier === "studio") return tier as TierKey;
  return "free";
}
