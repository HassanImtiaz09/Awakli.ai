/**
 * StyleDrift — Global style slider with preview-before-apply workflow.
 *
 * Slider: "Grounded ↔ Stylized"
 * Preview: renders one test panel (1 credit), then "Apply to all" (N × panel cost).
 *
 * Copy strings:
 * - Slider left: "Grounded"
 * - Slider right: "Stylized"
 */
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Paintbrush,
  Eye,
  Check,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";

export interface StyleDriftProps {
  /** Whether the style drift panel is open */
  isOpen: boolean;
  /** Close the panel */
  onClose: () => void;
  /** Total number of panels that would be affected */
  totalPanels: number;
  /** Cost per panel for applying style */
  costPerPanel: number;
  /** Preview cost (always 1 credit) */
  previewCost: number;
  /** Whether a preview is currently generating */
  isPreviewing: boolean;
  /** Whether the apply-all operation is in progress */
  isApplying: boolean;
  /** URL of the preview panel image (null = no preview yet) */
  previewImageUrl: string | null;
  /** Callback to request a preview at the given drift value */
  onPreview: (driftValue: number) => void;
  /** Callback to apply the current drift value to all panels */
  onApply: (driftValue: number) => void;
}

export function StyleDrift({
  isOpen,
  onClose,
  totalPanels,
  costPerPanel,
  previewCost,
  isPreviewing,
  isApplying,
  previewImageUrl,
  onPreview,
  onApply,
}: StyleDriftProps) {
  const [driftValue, setDriftValue] = useState(0.5); // 0 = grounded, 1 = stylized
  const [hasPreviewedCurrent, setHasPreviewedCurrent] = useState(false);

  const applyCost = totalPanels * costPerPanel;

  const driftLabel = useMemo(() => {
    if (driftValue < 0.2) return "Very grounded";
    if (driftValue < 0.4) return "Grounded";
    if (driftValue < 0.6) return "Balanced";
    if (driftValue < 0.8) return "Stylized";
    return "Very stylized";
  }, [driftValue]);

  const handlePreview = () => {
    onPreview(driftValue);
    setHasPreviewedCurrent(true);
  };

  const handleApply = () => {
    onApply(driftValue);
  };

  const handleSliderChange = (val: number) => {
    setDriftValue(val);
    setHasPreviewedCurrent(false); // Invalidate preview on slider change
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          data-component="style-drift"
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 w-80 rounded-2xl bg-[#0D0D1A] border border-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
            <div className="flex items-center gap-2">
              <Paintbrush className="w-4 h-4 text-[#6B5BFF]" />
              <span className="text-sm font-semibold text-white/90">
                Style drift
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-5">
            {/* Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/40">
                <span>Grounded</span>
                <span className="text-white/60 font-medium">{driftLabel}</span>
                <span>Stylized</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={driftValue}
                onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-[#00E8A0] via-[#6B5BFF] to-[#FF3CAC] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(107,91,255,0.6)] [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <p className="text-[10px] text-white/20 text-center">
                {Math.round(driftValue * 100)}% stylization
              </p>
            </div>

            {/* Preview area */}
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
              {previewImageUrl ? (
                <div className="relative">
                  <img
                    src={previewImageUrl}
                    alt="Style preview"
                    className="w-full aspect-[3/4] object-cover"
                  />
                  {!hasPreviewedCurrent && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <span className="text-[11px] text-white/60 bg-black/50 px-2 py-1 rounded-md">
                        Slider changed — preview again
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full aspect-[3/4] flex flex-col items-center justify-center gap-2 text-white/15">
                  <Sparkles className="w-8 h-8" />
                  <span className="text-[11px]">Preview will appear here</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {/* Preview button */}
              <button
                onClick={handlePreview}
                disabled={isPreviewing || isApplying}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white/80 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPreviewing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                Preview · {previewCost} credit
              </button>

              {/* Apply to all button */}
              <button
                onClick={handleApply}
                disabled={!hasPreviewedCurrent || isApplying || isPreviewing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6B5BFF] to-[#00F0FF] text-white text-sm font-semibold disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isApplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Apply to all · {applyCost} credits
              </button>

              <p className="text-[10px] text-white/20 text-center">
                Affects {totalPanels} panel{totalPanels !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Style drift cost helpers ────────────────────────────────────────────────

/** Preview always costs 1 credit */
export const STYLE_DRIFT_PREVIEW_COST = 1;

/** Apply cost = number of panels × cost per panel */
export function getStyleDriftApplyCost(
  panelCount: number,
  costPerPanel: number,
): number {
  return panelCount * costPerPanel;
}
