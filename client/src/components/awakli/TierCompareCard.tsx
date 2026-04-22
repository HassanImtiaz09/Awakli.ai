/**
 * TierCompareCard — Three tier cards focused on video-relevant features.
 *
 * Mangaka (Creator Pro) / Studio / Studio Pro (Enterprise)
 * Features compared: duration, resolution, voice clones, LoRA characters.
 * CTA opens Stripe checkout in new tab.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Crown, Zap, Rocket, BookOpen } from "lucide-react";
import {
  TIER_DISPLAY_NAMES,
  TIER_MONTHLY_PRICE_CENTS,
  tierPriceLabel,
} from "@shared/pricingCatalog";

// ─── Copy strings (derived from pricingCatalog — single source of truth) ─────
export const TIER_CARD_COPY = {
  mangakaTitle: TIER_DISPLAY_NAMES.creator,
  mangakaPrice: `from ${tierPriceLabel("creator")}`,
  mangakaCTA: `Continue with ${TIER_DISPLAY_NAMES.creator}`,
  studioTitle: TIER_DISPLAY_NAMES.creator_pro,
  studioPrice: `from ${tierPriceLabel("creator_pro")}`,
  studioCTA: `Continue with ${TIER_DISPLAY_NAMES.creator_pro}`,
  studioProTitle: TIER_DISPLAY_NAMES.studio,
  studioProPrice: `from ${tierPriceLabel("studio")}`,
  studioProCTA: `Continue with ${TIER_DISPLAY_NAMES.studio}`,
  smallLink: "I'll stay with the manga for now",
  waitingState: "Waiting for your confirmation in the new tab…",
};

// ─── Video-relevant feature comparison ─────────────────────────────────
export interface TierVideoFeatures {
  episodeDuration: string;
  resolution: string;
  voiceClones: string;
  loraCharacters: string;
  motionLora: boolean;
  concurrentJobs: string;
}

export const TIER_VIDEO_FEATURES: Record<string, TierVideoFeatures> = {
  creator_pro: {
    episodeDuration: "Up to 30 min",
    resolution: "1080p",
    voiceClones: "10 voices",
    loraCharacters: "10 characters",
    motionLora: true,
    concurrentJobs: "3 concurrent",
  },
  studio: {
    episodeDuration: "Up to 60 min",
    resolution: "4K",
    voiceClones: "Unlimited",
    loraCharacters: "Unlimited",
    motionLora: true,
    concurrentJobs: "10 concurrent",
  },
  enterprise: {
    episodeDuration: "Unlimited",
    resolution: "4K + HDR",
    voiceClones: "Unlimited",
    loraCharacters: "Unlimited",
    motionLora: true,
    concurrentJobs: "Unlimited",
  },
};

const FEATURE_LABELS = [
  { key: "episodeDuration" as const, label: "Episode duration" },
  { key: "resolution" as const, label: "Video resolution" },
  { key: "voiceClones" as const, label: "Voice clones" },
  { key: "loraCharacters" as const, label: "LoRA characters" },
  { key: "motionLora" as const, label: "Motion LoRA" },
  { key: "concurrentJobs" as const, label: "Concurrent jobs" },
];

// ─── Card definitions ──────────────────────────────────────────────────
interface TierCardDef {
  tierKey: "creator_pro" | "studio" | "enterprise";
  title: string;
  price: string;
  cta: string;
  icon: typeof Crown;
  accentColor: string;
  accentBg: string;
  accentRing: string;
  highlighted: boolean;
}

const TIER_CARDS: TierCardDef[] = [
  {
    tierKey: "creator_pro",
    title: TIER_CARD_COPY.mangakaTitle,
    price: TIER_CARD_COPY.mangakaPrice,
    cta: TIER_CARD_COPY.mangakaCTA,
    icon: Crown,
    accentColor: "text-violet-400",
    accentBg: "bg-violet-500/10",
    accentRing: "ring-violet-500/20",
    highlighted: true, // Default highlighted for Apprentice users
  },
  {
    tierKey: "studio",
    title: TIER_CARD_COPY.studioTitle,
    price: TIER_CARD_COPY.studioPrice,
    cta: TIER_CARD_COPY.studioCTA,
    icon: Zap,
    accentColor: "text-cyan-400",
    accentBg: "bg-cyan-500/10",
    accentRing: "ring-cyan-500/20",
    highlighted: false,
  },
  {
    tierKey: "enterprise",
    title: TIER_CARD_COPY.studioProTitle,
    price: TIER_CARD_COPY.studioProPrice,
    cta: TIER_CARD_COPY.studioProCTA,
    icon: Rocket,
    accentColor: "text-amber-400",
    accentBg: "bg-amber-500/10",
    accentRing: "ring-amber-500/20",
    highlighted: false,
  },
];

// ─── Props ─────────────────────────────────────────────────────────────
interface TierCompareCardProps {
  onSelectTier: (tierKey: "creator_pro" | "studio" | "enterprise") => void;
  loadingTier: string | null;
  onDecline: () => void;
  /** Slug of the published manga — when present, shows a "Back to manga" link */
  mangaSlug?: string | null;
}

export function TierCompareCard({
  onSelectTier,
  loadingTier,
  onDecline,
  mangaSlug,
}: TierCompareCardProps) {
  const [hoveredTier, setHoveredTier] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Card grid */}
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto -mt-10 relative z-10">
        {TIER_CARDS.map((card, idx) => {
          const features = TIER_VIDEO_FEATURES[card.tierKey];
          const isHovered = hoveredTier === card.tierKey;
          const isLoading = loadingTier === card.tierKey;
          const Icon = card.icon;

          return (
            <motion.div
              key={card.tierKey}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * idx }}
              onMouseEnter={() => setHoveredTier(card.tierKey)}
              onMouseLeave={() => setHoveredTier(null)}
              className={`relative rounded-2xl bg-white/[0.04] p-6 shadow-[0_2px_20px_rgba(0,0,0,0.15)] transition-all duration-300 border ${
                card.highlighted && !hoveredTier
                  ? `border-violet-500/30 shadow-[0_4px_30px_rgba(139,92,246,0.15)]`
                  : isHovered
                  ? "border-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.3)] -translate-y-1"
                  : "border-white/[0.06]"
              }`}
            >
              {/* Highlighted badge */}
              {card.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-semibold uppercase tracking-wider border border-violet-500/30">
                  Recommended
                </div>
              )}

              {/* Header */}
              <div className="space-y-4 mb-6">
                <div
                  className={`w-10 h-10 rounded-xl ${card.accentBg} flex items-center justify-center`}
                >
                  <Icon className={`w-5 h-5 ${card.accentColor}`} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white/90">
                    {card.title}
                  </h3>
                  <p className="text-sm text-white/40 mt-1">{card.price}</p>
                </div>
              </div>

              {/* Feature list */}
              <div className="space-y-3 mb-8">
                {FEATURE_LABELS.map((feat) => {
                  const value = features[feat.key];
                  return (
                    <div
                      key={feat.key}
                      className="flex items-center justify-between"
                    >
                      <span className="text-xs text-white/40">{feat.label}</span>
                      <span className="text-xs font-medium text-white/70">
                        {typeof value === "boolean" ? (
                          value ? (
                            <Check className="w-3.5 h-3.5 text-[#00E5A0]" />
                          ) : (
                            <span className="text-white/20">—</span>
                          )
                        ) : (
                          value
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onSelectTier(card.tierKey)}
                disabled={!!loadingTier}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                  card.highlighted
                    ? "bg-gradient-to-r from-violet-500 to-violet-600 text-white shadow-[0_4px_20px_rgba(139,92,246,0.3)]"
                    : `bg-white/[0.06] text-white/70 hover:bg-white/10 ring-1 ${card.accentRing}`
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening checkout…
                  </span>
                ) : (
                  card.cta
                )}
              </motion.button>
            </motion.div>
          );
        })}
      </div>

      {/* Decline / Back to manga links */}
      <div className="text-center space-y-3">
        {mangaSlug && (
          <a
            href={`/m/${mangaSlug}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white/50 hover:text-white/70 hover:border-white/15 transition-all"
          >
            <BookOpen className="w-4 h-4" />
            Back to your manga
          </a>
        )}
        <div>
          <button
            onClick={onDecline}
            className="text-sm text-white/25 hover:text-white/40 transition-colors underline underline-offset-4"
          >
            {TIER_CARD_COPY.smallLink}
          </button>
        </div>
      </div>
    </div>
  );
}
