// ─── Awakli Subscription Tiers & Pricing (Prompt 15) ─────────────────
// 5 tiers: Free Trial / Creator / Creator Pro / Studio / Enterprise

export type TierKey = "free_trial" | "creator" | "creator_pro" | "studio" | "enterprise";

// ─── Credit Economics Constants ──────────────────────────────────────
export const CREDIT_ECONOMICS = {
  COGS_VALUE_USD: 0.55,           // platform cost per credit
  SUBSCRIPTION_RATE_USD: 0.82,    // effective rate per credit for subscribers
  MARGIN_TARGET: 0.33,            // 33% gross margin target
  PACK_RATE_SMALL_USD: 0.70,      // $0.70/credit for small pack
  PACK_RATE_MEDIUM_USD: 0.63,     // $0.63/credit for medium pack
  PACK_RATE_LARGE_USD: 0.55,      // $0.55/credit for large pack
};

// ─── Tier Configuration ──────────────────────────────────────────────

export interface TierConfig {
  name: string;
  monthlyPrice: number;           // cents
  annualPrice: number;            // cents (per year)
  annualMonthlyPrice: number;     // cents (monthly equivalent when billed annually)
  credits: number;                // monthly credit allocation
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
  // Prompt 15 additions
  episodeLengthCapSeconds: number;
  allowedModelTiers: string[];     // budget, standard, premium, ultra
  concurrentGenerationLimit: number;
  teamSeats: number;
  queuePriority: number;          // 1=highest, 10=lowest
  rolloverPercentage: number;     // 0.0 to 1.0
  rolloverCap: number | null;     // max rollover credits, null=unlimited
  creditExpiryDays: number | null; // null=end of billing period
  packDiscount: number;           // 0.0 to 1.0 discount on credit packs
  /** Whether this tier allows motion LoRA injection during video generation (Prompt 24) */
  motionLoraEnabled: boolean;
  /** Max motion LoRA training jobs per month (0 = not allowed) */
  maxMotionLoraTrainingsPerMonth: number;
  /** LoRA stack depth: which LoRA types this tier can stack (v1.1) */
  loraStackLayers: ("appearance" | "motion" | "environment" | "style")[];
}

export const TIERS: Record<TierKey, TierConfig> = {
  free_trial: {
    name: "Free Trial",
    monthlyPrice: 0,
    annualPrice: 0,
    annualMonthlyPrice: 0,
    credits: 15,
    maxProjects: 3,
    maxChaptersPerProject: 3,
    maxPanelsPerChapter: 20,
    maxAnimeEpisodesPerMonth: 1,
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
    episodeLengthCapSeconds: 300,   // 5 min
    allowedModelTiers: ["budget"],
    concurrentGenerationLimit: 1,
    teamSeats: 1,
    queuePriority: 5,
    rolloverPercentage: 0,
    rolloverCap: null,
    creditExpiryDays: 14,
    packDiscount: 0,
    motionLoraEnabled: false,
    maxMotionLoraTrainingsPerMonth: 0,
    loraStackLayers: [],  // Free: no LoRA
  },
  creator: {
    name: "Creator",
    monthlyPrice: 2900,
    annualPrice: 27600,            // $23/mo * 12 = $276/year
    annualMonthlyPrice: 2300,
    credits: 35,
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
    episodeLengthCapSeconds: 900,   // 15 min
    allowedModelTiers: ["budget", "standard"],
    concurrentGenerationLimit: 2,
    teamSeats: 1,
    queuePriority: 4,
    rolloverPercentage: 0,
    rolloverCap: null,
    creditExpiryDays: null,         // end of billing period
    packDiscount: 0,
    motionLoraEnabled: false,
    maxMotionLoraTrainingsPerMonth: 0,
    loraStackLayers: ["appearance"],  // Starter/Creator: appearance only
  },
  creator_pro: {
    name: "Creator Pro",
    monthlyPrice: 9900,
    annualPrice: 94800,            // $79/mo * 12 = $948/year
    annualMonthlyPrice: 7900,
    credits: 120,
    maxProjects: 50,
    maxChaptersPerProject: 50,
    maxPanelsPerChapter: 50,
    maxAnimeEpisodesPerMonth: 15,
    maxLoraCharacters: 10,
    maxVoiceClones: 10,
    scriptModel: "claude-opus-4-20250514",
    videoResolution: "1080p",
    hasWatermark: false,
    canUploadManga: true,
    canMonetize: true,
    revenueSharePercent: 85,
    hasApiAccess: false,
    hasPriorityQueue: true,
    hasPrioritySupport: false,
    hasCustomNarrator: true,
    canExportManga: true,
    canExportAnime: true,
    exportFormats: ["pdf", "png", "zip", "mp4"],
    episodeLengthCapSeconds: 1800,  // 30 min
    allowedModelTiers: ["budget", "standard", "premium"],
    concurrentGenerationLimit: 3,
    teamSeats: 3,
    queuePriority: 3,
    rolloverPercentage: 0.20,
    rolloverCap: 240,
    creditExpiryDays: null,
    packDiscount: 0.10,
    motionLoraEnabled: true,
    maxMotionLoraTrainingsPerMonth: 5,
    loraStackLayers: ["appearance", "motion"],  // Standard/Creator Pro: appearance + motion
  },
  studio: {
    name: "Studio",
    monthlyPrice: 49900,
    annualPrice: 478800,           // $399/mo * 12 = $4788/year
    annualMonthlyPrice: 39900,
    credits: 600,
    maxProjects: 999,
    maxChaptersPerProject: 999,
    maxPanelsPerChapter: 999,
    maxAnimeEpisodesPerMonth: 999,
    maxLoraCharacters: 999,
    maxVoiceClones: 999,
    scriptModel: "claude-opus-4-20250514",
    videoResolution: "4K",
    hasWatermark: false,
    canUploadManga: true,
    canMonetize: true,
    revenueSharePercent: 90,
    hasApiAccess: true,
    hasPriorityQueue: true,
    hasPrioritySupport: true,
    hasCustomNarrator: true,
    canExportManga: true,
    canExportAnime: true,
    exportFormats: ["pdf", "png", "zip", "mp4", "prores", "stems", "srt"],
    episodeLengthCapSeconds: 3600,  // 60 min
    allowedModelTiers: ["budget", "standard", "premium", "ultra"],
    concurrentGenerationLimit: 5,
    teamSeats: 10,
    queuePriority: 1,
    rolloverPercentage: 0.50,
    rolloverCap: 1800,
    creditExpiryDays: null,
    packDiscount: 0.20,
    motionLoraEnabled: true,
    maxMotionLoraTrainingsPerMonth: 20,
    loraStackLayers: ["appearance", "motion", "environment", "style"],  // Premium/Studio: all stacked (Flagship)
  },
  enterprise: {
    name: "Enterprise",
    monthlyPrice: 0,               // custom pricing
    annualPrice: 0,
    annualMonthlyPrice: 0,
    credits: 0,                    // custom allocation
    maxProjects: 999,
    maxChaptersPerProject: 999,
    maxPanelsPerChapter: 999,
    maxAnimeEpisodesPerMonth: 999,
    maxLoraCharacters: 999,
    maxVoiceClones: 999,
    scriptModel: "claude-opus-4-20250514",
    videoResolution: "4K",
    hasWatermark: false,
    canUploadManga: true,
    canMonetize: true,
    revenueSharePercent: 90,
    hasApiAccess: true,
    hasPriorityQueue: true,
    hasPrioritySupport: true,
    hasCustomNarrator: true,
    canExportManga: true,
    canExportAnime: true,
    exportFormats: ["pdf", "png", "zip", "mp4", "prores", "stems", "srt"],
    episodeLengthCapSeconds: 7200,
    allowedModelTiers: ["budget", "standard", "premium", "ultra"],
    concurrentGenerationLimit: 10,
    teamSeats: 999,
    queuePriority: 1,
    rolloverPercentage: 1.0,
    rolloverCap: null,
    creditExpiryDays: null,
    packDiscount: 0.30,
    motionLoraEnabled: true,
    maxMotionLoraTrainingsPerMonth: 999,
    loraStackLayers: ["appearance", "motion", "environment", "style"],  // Enterprise: all stacked
  },
};

// ─── Credit Pack Pricing ─────────────────────────────────────────────

export interface CreditPackConfig {
  name: string;
  credits: number;
  basePriceCents: number;
  perCreditCents: number;
}

export const CREDIT_PACKS: Record<string, CreditPackConfig> = {
  small: {
    name: "Small Pack",
    credits: 50,
    basePriceCents: 3500,       // $35
    perCreditCents: 70,
  },
  medium: {
    name: "Medium Pack",
    credits: 150,
    basePriceCents: 9500,       // $95
    perCreditCents: 63,
  },
  large: {
    name: "Large Pack",
    credits: 500,
    basePriceCents: 27500,      // $275
    perCreditCents: 55,
  },
};

// ─── Credit Costs per API Action ─────────────────────────────────────

export const CREDIT_COSTS: Record<string, number> = {
  // Video generation
  video_5s_budget: 1,
  video_5s_standard: 2,
  video_5s_premium: 4,
  video_10s_budget: 2,
  video_10s_standard: 4,
  video_10s_premium: 8,
  // Voice synthesis
  voice_synthesis: 1,
  voice_clone: 3,
  // Script generation
  script_generation: 1,
  // Image generation
  panel_generation: 1,
  image_upscale: 1,
  // Music
  music_generation: 2,
  // Post-processing
  sfx_generation: 1,
  narrator_generation: 1,
  // LoRA training
  lora_train: 10,
};

// Legacy cost map for backward compatibility
export const LEGACY_CREDIT_COSTS: Record<string, number> = {
  script: 1,
  panel: 1,
  video: 4,
  voice: 1,
  lora_train: 10,
  upscale: 1,
  sfx: 1,
  narrator: 1,
};

// ─── Anime Preview Config ────────────────────────────────────────────

export const ANIME_PREVIEW = {
  maxPanels: 6,
  resolution: "720p",
  watermark: true,
  expiryDays: 30,
};

// ─── Feature Lists ───────────────────────────────────────────────────

export function getTierFeatureList(tier: TierKey): string[] {
  const features: string[] = [];

  if (tier === "free_trial") {
    features.push("15 credits to try the platform");
    features.push("1 anime episode (5 min, 720p)");
    features.push("Budget model tier");
    features.push("AI script + panel generation");
    features.push("Publish to community");
    features.push("14-day credit expiry");
  } else if (tier === "creator") {
    features.push("35 credits/month ($29/mo)");
    features.push("5 anime episodes/month (15 min, 1080p)");
    features.push("Standard + Budget model tiers");
    features.push("2 concurrent generations");
    features.push("Voice cloning (2 characters)");
    features.push("Export manga + anime");
    features.push("80/20 revenue split");
  } else if (tier === "creator_pro") {
    features.push("120 credits/month ($99/mo)");
    features.push("15 anime episodes/month (30 min, 1080p)");
    features.push("Premium + Standard + Budget tiers");
    features.push("3 concurrent generations");
    features.push("20% credit rollover (cap: 240)");
    features.push("10% credit pack discount");
    features.push("3 team seats");
    features.push("85/15 revenue split");
  } else if (tier === "studio") {
    features.push("600 credits/month ($499/mo)");
    features.push("Unlimited episodes (60 min, 4K)");
    features.push("All model tiers including Ultra");
    features.push("5 concurrent generations");
    features.push("50% credit rollover (cap: 1800)");
    features.push("20% credit pack discount");
    features.push("10 team seats + priority queue");
    features.push("90/10 revenue split");
    features.push("API access + analytics");
  } else if (tier === "enterprise") {
    features.push("Custom credit allocation");
    features.push("Unlimited everything");
    features.push("All model tiers");
    features.push("10 concurrent generations");
    features.push("100% credit rollover");
    features.push("30% credit pack discount");
    features.push("Unlimited team seats");
    features.push("Dedicated support");
  }

  return features;
}

// ─── Tier Normalization ──────────────────────────────────────────────

export function normalizeTier(tier: string): TierKey {
  // Map legacy tier names
  if (tier === "pro") return "creator";
  if (tier === "free") return "free_trial";
  if (tier === "free_trial" || tier === "creator" || tier === "creator_pro" || tier === "studio" || tier === "enterprise") {
    return tier as TierKey;
  }
  return "free_trial";
}

// ─── Tier Ordering (for upgrade/downgrade detection) ─────────────────

export const TIER_ORDER: Record<TierKey, number> = {
  free_trial: 0,
  creator: 1,
  creator_pro: 2,
  studio: 3,
  enterprise: 4,
};

export function isUpgrade(fromTier: TierKey, toTier: TierKey): boolean {
  return TIER_ORDER[toTier] > TIER_ORDER[fromTier];
}

export function isDowngrade(fromTier: TierKey, toTier: TierKey): boolean {
  return TIER_ORDER[toTier] < TIER_ORDER[fromTier];
}
