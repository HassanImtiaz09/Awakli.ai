/**
 * PanelLightbox — Full-bleed modal for viewing a single panel
 * with inline regeneration field.
 *
 * Copy strings:
 * - Popover placeholder: "Make it rain. Pull the camera in. Remove the second character…"
 * - Confirm CTA: "Redraw · 3 credits"
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RotateCcw, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { PanelTileData } from "./PanelTile";

interface PanelLightboxProps {
  panels: PanelTileData[];
  activePanelId: number | null;
  onClose: () => void;
  onRedraw: (panelId: number, instruction: string) => void;
  isRedrawing?: boolean;
  regenCount: number;
  regenLimit: number;
}

export function PanelLightbox({
  panels,
  activePanelId,
  onClose,
  onRedraw,
  isRedrawing,
  regenCount,
  regenLimit,
}: PanelLightboxProps) {
  const [instruction, setInstruction] = useState("");
  const [showRedrawField, setShowRedrawField] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const activePanel = panels.find((p) => p.id === activePanelId);

  useEffect(() => {
    if (activePanelId) {
      const idx = panels.findIndex((p) => p.id === activePanelId);
      if (idx >= 0) setCurrentIdx(idx);
      setShowRedrawField(false);
      setInstruction("");
    }
  }, [activePanelId, panels]);

  const currentPanel = panels[currentIdx];
  const canGoNext = currentIdx < panels.length - 1;
  const canGoPrev = currentIdx > 0;
  const atRegenCap = regenCount >= regenLimit;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && canGoNext) setCurrentIdx((i) => i + 1);
      if (e.key === "ArrowLeft" && canGoPrev) setCurrentIdx((i) => i - 1);
    },
    [onClose, canGoNext, canGoPrev],
  );

  useEffect(() => {
    if (!activePanelId) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanelId, handleKeyDown]);

  if (!activePanelId || !currentPanel) return null;

  const imageUrl = currentPanel.compositeImageUrl || currentPanel.imageUrl;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        data-component="panel-lightbox"
        className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Panel counter */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-sm font-mono">
          {currentIdx + 1} / {panels.length}
        </div>

        {/* Navigation arrows */}
        {canGoPrev && (
          <button
            onClick={() => setCurrentIdx((i) => i - 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {canGoNext && (
          <button
            onClick={() => setCurrentIdx((i) => i + 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Main image */}
        <motion.div
          key={currentPanel.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="max-w-[80vw] max-h-[70vh] relative"
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Panel ${currentPanel.panelNumber}`}
              className="max-w-full max-h-[70vh] object-contain rounded-xl"
            />
          ) : (
            <div className="w-[400px] h-[533px] rounded-xl bg-white/[0.03] flex items-center justify-center text-white/20">
              No image yet
            </div>
          )}
        </motion.div>

        {/* Bottom bar: panel info + redraw */}
        <div className="mt-4 w-full max-w-2xl px-4">
          {/* Panel info */}
          {currentPanel.visualDescription && (
            <p className="text-white/30 text-xs text-center mb-3 line-clamp-2">
              {currentPanel.visualDescription}
            </p>
          )}

          {/* Redraw section */}
          {!showRedrawField ? (
            <div className="flex justify-center">
              <button
                onClick={() => setShowRedrawField(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white/60 text-sm hover:bg-white/15 hover:text-white/80 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Redraw this panel
              </button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Make it rain. Pull the camera in. Remove the second character…"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-[#6B5BFF]/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !atRegenCap && !isRedrawing) {
                    onRedraw(currentPanel.id, instruction);
                  }
                  if (e.key === "Escape") {
                    setShowRedrawField(false);
                    setInstruction("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!atRegenCap && !isRedrawing) {
                    onRedraw(currentPanel.id, instruction);
                  }
                }}
                disabled={atRegenCap || isRedrawing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#6B5BFF] to-[#00F0FF] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isRedrawing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Redraw · 3 credits
              </button>
            </motion.div>
          )}

          {/* Regen counter */}
          {showRedrawField && (
            <p className="text-center text-[11px] text-white/25 mt-2">
              {atRegenCap
                ? "Regen cap reached — upgrade for more redraws"
                : `${regenCount} / ${regenLimit === Infinity ? "∞" : regenLimit} redraws used`}
            </p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
