// ─── Awakli Subscription Tiers & Pricing ─────────────────────────────

export type TierKey = "free" | "pro" | "studio";

export interface TierConfig {
  name: string;
  monthlyPrice: number;   // cents
  annualPrice: number;     // cents (per year)
  credits: number;         // monthly allocation
  maxProjects: number;
  maxEpisodesPerProject: number;
  maxPanelsPerDay: number;
  videoEpisodesPerMonth: number;
  maxLoraModels: number;
  maxVoiceClones: number;
  hasApiAccess: boolean;
  hasWatermark: boolean;
  hasPrioritySupport: boolean;
  stripePriceIdMonthly?: string;
  stripePriceIdAnnual?: string;
}

export const TIERS: Record<TierKey, TierConfig> = {
  free: {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    credits: 100,
    maxProjects: 1,
    maxEpisodesPerProject: 3,
    maxPanelsPerDay: 5,
    videoEpisodesPerMonth: 0,
    maxLoraModels: 0,
    maxVoiceClones: 0,
    hasApiAccess: false,
    hasWatermark: true,
    hasPrioritySupport: false,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 2900,
    annualPrice: 27840,  // 2320 * 12 = 20% discount
    credits: 2000,
    maxProjects: 5,
    maxEpisodesPerProject: 12,
    maxPanelsPerDay: 100,
    videoEpisodesPerMonth: 3,
    maxLoraModels: 2,
    maxVoiceClones: 2,
    hasApiAccess: false,
    hasWatermark: false,
    hasPrioritySupport: false,
  },
  studio: {
    name: "Studio",
    monthlyPrice: 9900,
    annualPrice: 95040,  // 7920 * 12 = 20% discount
    credits: 10000,
    maxProjects: 999,
    maxEpisodesPerProject: 999,
    maxPanelsPerDay: 999,
    videoEpisodesPerMonth: 20,
    maxLoraModels: 999,
    maxVoiceClones: 999,
    hasApiAccess: true,
    hasWatermark: false,
    hasPrioritySupport: true,
  },
};

// Credit costs per action type
export const CREDIT_COSTS: Record<string, number> = {
  script: 10,
  panel: 2,
  video: 20,
  voice: 1,
  lora_train: 50,
};

// Overage rate: $0.05 per credit for Pro/Studio
export const OVERAGE_RATE_CENTS = 5;  // 5 cents per credit

export function getTierFeatureList(tier: TierKey): string[] {
  const t = TIERS[tier];
  const features: string[] = [];

  features.push(`${t.maxProjects === 999 ? "Unlimited" : t.maxProjects} project${t.maxProjects !== 1 ? "s" : ""}`);
  features.push(`${t.maxEpisodesPerProject === 999 ? "Unlimited" : t.maxEpisodesPerProject} episodes per project`);
  features.push(`${t.credits.toLocaleString()} credits/month`);
  features.push(`${t.maxPanelsPerDay === 999 ? "Unlimited" : t.maxPanelsPerDay} panels/day`);

  if (t.videoEpisodesPerMonth > 0) {
    features.push(`${t.videoEpisodesPerMonth === 20 ? "20" : t.videoEpisodesPerMonth} video episodes/month`);
  } else {
    features.push("No video pipeline");
  }

  if (t.maxLoraModels > 0) {
    features.push(`${t.maxLoraModels === 999 ? "Unlimited" : t.maxLoraModels} LoRA models`);
  }
  if (t.maxVoiceClones > 0) {
    features.push(`${t.maxVoiceClones === 999 ? "Unlimited" : t.maxVoiceClones} voice clones`);
  }

  if (!t.hasWatermark) features.push("No watermark");
  if (t.hasApiAccess) features.push("API access");
  if (t.hasPrioritySupport) features.push("Priority support");
  features.push("Community features");

  return features;
}
