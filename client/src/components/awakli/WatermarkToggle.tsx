/**
 * WatermarkToggle — Controls the "Made with Awakli" watermark on published manga.
 *
 * Apprentice: locked ON, non-removable (shows lock icon + tier hint).
 * Mangaka+: can toggle off.
 */
import { Lock, Unlock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type WatermarkTierBehavior = "locked_on" | "toggleable";

/**
 * Determine watermark behavior by tier slug.
 */
export function getWatermarkBehavior(tier: string): WatermarkTierBehavior {
  const lockedTiers = ["free_trial", "creator"];
  return lockedTiers.includes(tier) ? "locked_on" : "toggleable";
}

/**
 * Get the max published episodes allowed for a tier.
 * Apprentice: 3 lifetime. Mangaka+: unlimited.
 */
export function getPublishLimit(tier: string): number {
  switch (tier) {
    case "free_trial":
    case "creator":
      return 3;
    default:
      return Infinity;
  }
}

/**
 * Check if the user can publish based on their tier and current count.
 */
export function canPublishMore(tier: string, currentPublishedCount: number): boolean {
  const limit = getPublishLimit(tier);
  return currentPublishedCount < limit;
}

interface WatermarkToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  tier: string;
}

export function WatermarkToggle({ enabled, onChange, tier }: WatermarkToggleProps) {
  const behavior = getWatermarkBehavior(tier);
  const isLocked = behavior === "locked_on";

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
        isLocked
          ? "bg-white/[0.02] border-white/[0.04] opacity-70"
          : "bg-white/[0.03] border-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-3">
        {isLocked ? (
          <Lock className="w-4 h-4 text-white/20" />
        ) : (
          <Unlock className="w-4 h-4 text-white/30" />
        )}
        <div>
          <div className="text-sm text-white/70 font-medium">
            Made with Awakli watermark
          </div>
          <div className="text-xs text-white/30">
            {isLocked
              ? "Upgrade to Mangaka to remove the watermark"
              : enabled
              ? "Watermark will appear on the last page"
              : "No watermark on your published manga"}
          </div>
        </div>
      </div>

      {isLocked ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <button
                disabled
                className="relative w-11 h-6 rounded-full bg-white/10 cursor-not-allowed"
              >
                <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white/20 transition-transform translate-x-5" />
              </button>
              <Lock className="absolute -top-1 -right-1 w-3 h-3 text-amber-400/60" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Upgrade to Mangaka to toggle watermark</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <button
          onClick={() => onChange(!enabled)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            enabled ? "bg-[#00E5A0]/30" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-5 h-5 rounded-full transition-all ${
              enabled
                ? "translate-x-5 bg-[#00E5A0]"
                : "translate-x-0 bg-white/40"
            }`}
          />
        </button>
      )}
    </div>
  );
}
