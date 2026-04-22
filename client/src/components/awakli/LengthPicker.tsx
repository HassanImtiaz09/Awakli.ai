/**
 * LengthPicker — Segmented control for panel count selection.
 *
 * Apprentice: 20 (default), 30, 40 — unlocked. 50/60 tier-locked to Mangaka.
 * Mangaka: 20–120 unlocked. 150+ tier-locked to Studio.
 * Studio: 20–200 unlocked + whole-book mode. 300+ tier-locked to Studio Pro.
 */
import { Lock, BookOpen } from "lucide-react";
import { UpgradeModalBus } from "./UpgradeModal";

// ─── Option Definitions ─────────────────────────────────────────────────────

interface LengthOption {
  value: number;
  label: string;
  locked: boolean;
  tierLabel?: string;
  requiredTier?: string;
  isWholeBook?: boolean;
}

const APPRENTICE_OPTIONS: LengthOption[] = [
  { value: 20, label: "20 panels", locked: false },
  { value: 30, label: "30 panels", locked: false },
  { value: 40, label: "40 panels", locked: false },
  { value: 50, label: "50 panels", locked: true, tierLabel: "Mangaka +", requiredTier: "creator" },
  { value: 60, label: "60 panels", locked: true, tierLabel: "Mangaka +", requiredTier: "creator" },
];

const MANGAKA_OPTIONS: LengthOption[] = [
  { value: 20, label: "20 panels", locked: false },
  { value: 30, label: "30 panels", locked: false },
  { value: 40, label: "40 panels", locked: false },
  { value: 60, label: "60 panels", locked: false },
  { value: 80, label: "80 panels", locked: false },
  { value: 120, label: "120 panels", locked: false },
  { value: 150, label: "150+ panels", locked: true, tierLabel: "Studio", requiredTier: "studio" },
];

const STUDIO_OPTIONS: LengthOption[] = [
  { value: 20, label: "20 panels", locked: false },
  { value: 40, label: "40 panels", locked: false },
  { value: 60, label: "60 panels", locked: false },
  { value: 80, label: "80 panels", locked: false },
  { value: 120, label: "120 panels", locked: false },
  { value: 150, label: "150 panels", locked: false },
  { value: 200, label: "200 panels", locked: false },
  { value: 999, label: "Whole book", locked: false, isWholeBook: true },
  { value: 300, label: "300+ panels", locked: true, tierLabel: "Studio Pro", requiredTier: "studio" },
];

// ─── Props ──────────────────────────────────────────────────────────────────

interface LengthPickerProps {
  value: number;
  onChange: (value: number) => void;
  /** If true, all options are unlocked */
  allUnlocked?: boolean;
  /** Upload mode unlocks higher panel counts */
  uploadMode?: boolean;
  /** Character foundation mode (Studio+) */
  characterMode?: boolean;
  /** User's current tier */
  userTier?: string;
}

export default function LengthPicker({
  value,
  onChange,
  allUnlocked = false,
  uploadMode = false,
  characterMode = false,
  userTier = "free_trial",
}: LengthPickerProps) {
  // Choose options based on tier/mode
  const isStudioPlus = ["studio", "enterprise"].includes(userTier);
  const isMangakaPlus = ["creator", "creator_pro", "studio", "enterprise"].includes(userTier);

  let LENGTH_OPTIONS: LengthOption[];
  if (characterMode || isStudioPlus) {
    LENGTH_OPTIONS = STUDIO_OPTIONS;
  } else if (uploadMode || isMangakaPlus) {
    LENGTH_OPTIONS = MANGAKA_OPTIONS;
  } else {
    LENGTH_OPTIONS = APPRENTICE_OPTIONS;
  }

  const handleSelect = (option: LengthOption) => {
    if (option.locked && !allUnlocked) {
      const requiredTier = option.requiredTier ?? "creator";
      const tierDisplayNames: Record<string, string> = {
        creator: "Mangaka",
        creator_pro: "Studio",
        studio: "Studio Pro",
      };
      const displayName = tierDisplayNames[requiredTier] ?? requiredTier;
      const skuMap: Record<string, string> = {
        creator: "price_mangaka_monthly",
        creator_pro: "price_studio_monthly",
        studio: "price_studio_pro_monthly",
      };

      emitAnalytics("stage0_upgrade_prompt", { panels: option.value });
      UpgradeModalBus.open({
        currentTier: userTier,
        required: requiredTier,
        requiredDisplayName: displayName,
        upgradeSku: skuMap[requiredTier] ?? "price_mangaka_monthly",
        ctaText: option.value >= 300
          ? `300+ panel projects unlock on ${displayName}`
          : option.value >= 150
            ? `150+ panel projects unlock on ${displayName}`
            : `Unlock with ${displayName} — from $19/mo`,
        pricingUrl: "/pricing",
      });
      return;
    }
    onChange(option.value);
    emitAnalytics("stage0_length_change", { panels: option.value });
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
        How long?
      </label>
      <div className="flex flex-wrap gap-2">
        {LENGTH_OPTIONS.map((opt) => {
          const isLocked = opt.locked && !allUnlocked;
          const isSelected = value === opt.value && !isLocked;

          return (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt)}
              title={
                isLocked
                  ? opt.value >= 300
                    ? "300+ panel projects unlock on Studio Pro"
                    : opt.value >= 150
                      ? "150+ panel projects unlock on Studio"
                      : "Longer stories are part of Mangaka — upgrade to unlock"
                  : opt.isWholeBook
                    ? "No panel limit — write the whole book"
                    : `${opt.value} panels`
              }
              className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isSelected
                  ? opt.isWholeBook
                    ? "bg-gradient-to-r from-token-violet/20 to-token-cyan/20 text-token-cyan ring-1 ring-token-cyan/30"
                    : "bg-token-violet/20 text-token-violet ring-1 ring-token-violet/40"
                  : isLocked
                    ? "bg-white/[0.02] text-white/25 border border-white/5 cursor-not-allowed"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-transparent"
              }`}
            >
              {opt.isWholeBook && <BookOpen className="w-3.5 h-3.5" />}
              <span>{opt.isWholeBook ? "Whole book" : opt.value}</span>
              {isLocked && (
                <>
                  <Lock className="w-3 h-3 text-white/20" />
                  <span className="text-[10px] text-token-violet/50 font-medium">
                    {opt.tierLabel}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Analytics Helper ───────────────────────────────────────────────────────

function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
