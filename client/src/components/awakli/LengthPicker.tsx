/**
 * LengthPicker — Segmented control for panel count selection.
 *
 * Apprentice: 20 (default), 30, 40 — unlocked.
 * Mangaka+: 50, 60 — tier-locked, click opens UpgradeModal.
 */
import { Lock } from "lucide-react";
import { UpgradeModalBus } from "./UpgradeModal";

// ─── Option Definitions ─────────────────────────────────────────────────────
const APPRENTICE_OPTIONS = [
  { value: 20, label: "20 panels", locked: false },
  { value: 30, label: "30 panels", locked: false },
  { value: 40, label: "40 panels", locked: false },
  { value: 50, label: "50 panels", locked: true, tierLabel: "Mangaka +", requiredTier: "creator" as const },
  { value: 60, label: "60 panels", locked: true, tierLabel: "Mangaka +", requiredTier: "creator" as const },
];

const MANGAKA_OPTIONS = [
  { value: 20, label: "20 panels", locked: false },
  { value: 30, label: "30 panels", locked: false },
  { value: 40, label: "40 panels", locked: false },
  { value: 60, label: "60 panels", locked: false },
  { value: 80, label: "80 panels", locked: false },
  { value: 120, label: "120 panels", locked: false },
  { value: 150, label: "150+ panels", locked: true, tierLabel: "Studio", requiredTier: "studio" as const },
];

// ─── Props ──────────────────────────────────────────────────────────────────
interface LengthPickerProps {
  value: number;
  onChange: (value: number) => void;
  /** If true, all options are unlocked (user has Mangaka+ tier) */
  allUnlocked?: boolean;
  /** Upload mode unlocks higher panel counts */
  uploadMode?: boolean;
  /** User's current tier */
  userTier?: string;
}

export default function LengthPicker({
  value,
  onChange,
  allUnlocked = false,
  uploadMode = false,
  userTier = "free_trial",
}: LengthPickerProps) {
  // Choose options based on tier/mode
  const isMangakaPlus = ["creator", "creator_pro", "studio", "enterprise"].includes(userTier);
  const LENGTH_OPTIONS = (uploadMode || isMangakaPlus) ? MANGAKA_OPTIONS : APPRENTICE_OPTIONS;

  const handleSelect = (option: (typeof LENGTH_OPTIONS)[number]) => {
    if (option.locked && !allUnlocked) {
      const requiredTier = (option as any).requiredTier ?? "creator";
      const isStudioLock = requiredTier === "studio";
      emitAnalytics("stage0_upgrade_prompt", { panels: option.value });
      UpgradeModalBus.open({
        currentTier: userTier,
        required: requiredTier,
        requiredDisplayName: isStudioLock ? "Studio" : "Mangaka",
        upgradeSku: isStudioLock ? "price_studio_monthly" : "price_mangaka_monthly",
        ctaText: isStudioLock
          ? "150+ panel projects unlock on Studio"
          : "Unlock with Mangaka — from $19/mo",
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
                  ? "Longer stories are part of Mangaka — upgrade to unlock"
                  : `${opt.value} panels`
              }
              className={`group relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isSelected
                  ? "bg-token-violet/20 text-token-violet ring-1 ring-token-violet/40"
                  : isLocked
                    ? "bg-white/[0.02] text-white/25 border border-white/5 cursor-not-allowed"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70 border border-transparent"
              }`}
            >
              <span>{opt.value}</span>
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
