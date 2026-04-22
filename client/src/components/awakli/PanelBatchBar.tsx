/**
 * PanelBatchBar — Fixed bottom bar for batch panel operations.
 *
 * Appears when ≥1 tiles are selected (Shift+click).
 * Shows: "{n} selected", "Redraw {n} panels · {n*3} credits",
 * "Match to panel {n}", "Apply style shift".
 *
 * Copy strings:
 * - Selection hint: "Shift+click to select. Batch tools appear below."
 * - Batch bar: "{n} selected"
 * - Batch regenerate: "Redraw {n} panels · {n*3} credits"
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  Layers,
  Paintbrush,
  X,
  Loader2,
} from "lucide-react";

export interface PanelBatchBarProps {
  selectedIds: Set<number>;
  /** Max batch size for the user's tier (8 for Mangaka, Infinity for Studio) */
  maxBatch: number;
  /** Cost per panel redraw */
  costPerPanel: number;
  /** Whether a batch operation is in progress */
  isProcessing: boolean;
  /** Callback to redraw all selected panels with a shared prompt */
  onBatchRedraw: (instruction: string) => void;
  /** Callback to match selected panels to a reference panel */
  onMatchToPanel: () => void;
  /** Callback to open the style drift tool */
  onOpenStyleDrift: () => void;
  /** Callback to clear selection */
  onClearSelection: () => void;
}

export function PanelBatchBar({
  selectedIds,
  maxBatch,
  costPerPanel,
  isProcessing,
  onBatchRedraw,
  onMatchToPanel,
  onOpenStyleDrift,
  onClearSelection,
}: PanelBatchBarProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [instruction, setInstruction] = useState("");
  const count = selectedIds.size;
  const totalCost = count * costPerPanel;
  const overLimit = count > maxBatch && maxBatch !== Infinity;

  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 30 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="fixed bottom-6 inset-x-0 mx-auto max-w-fit z-50 rounded-full px-5 py-3 bg-[#0A0A14] text-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-white/[0.06]"
      >
        {/* Prompt input row (expanded) */}
        <AnimatePresence>
          {showPrompt && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-3"
            >
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Shared prompt for all selected panels…"
                  className="flex-1 min-w-[280px] px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#6B5BFF]/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isProcessing && !overLimit) {
                      onBatchRedraw(instruction);
                      setShowPrompt(false);
                      setInstruction("");
                    }
                    if (e.key === "Escape") {
                      setShowPrompt(false);
                      setInstruction("");
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (!isProcessing && !overLimit) {
                      onBatchRedraw(instruction);
                      setShowPrompt(false);
                      setInstruction("");
                    }
                  }}
                  disabled={isProcessing || overLimit}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6B5BFF] to-[#00F0FF] text-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
                >
                  {isProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  Confirm
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main bar row */}
        <div className="flex items-center gap-3">
          {/* Count badge */}
          <span className="text-sm font-semibold text-[#00F0FF]">
            {count} selected
          </span>

          {/* Over-limit warning */}
          {overLimit && (
            <span className="text-[10px] text-[#FFD700] whitespace-nowrap">
              Max {maxBatch} per batch
            </span>
          )}

          <div className="w-px h-5 bg-white/10" />

          {/* Batch redraw */}
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            disabled={isProcessing || overLimit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Redraw {count} panels · {totalCost} credits
          </button>

          {/* Match to panel */}
          <button
            onClick={onMatchToPanel}
            disabled={isProcessing || count < 2}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" />
            Match to panel
          </button>

          {/* Apply style shift */}
          <button
            onClick={onOpenStyleDrift}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <Paintbrush className="w-3.5 h-3.5" />
            Apply style shift
          </button>

          <div className="w-px h-5 bg-white/10" />

          {/* Clear selection */}
          <button
            onClick={onClearSelection}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Batch limit by tier ─────────────────────────────────────────────────────
export function getBatchLimit(tier: string): number {
  switch (tier) {
    case "creator":
      return 8;  // Mangaka: up to 8 panels
    case "creator_pro":
    case "studio":
    case "studio_pro":
    case "enterprise":
      return Infinity; // Studio+: unlimited
    default:
      return 0; // Apprentice / free_trial — no batch
  }
}
