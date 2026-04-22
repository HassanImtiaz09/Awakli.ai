/**
 * PanelTile — Individual panel card in the generation grid.
 *
 * States:
 * - empty: shimmer placeholder
 * - streaming: pop-in animation when image arrives
 * - regenerating: overlay + progress spinner
 * - complete: image shown with hover actions
 * - selected: ring-2 ring-violet (batch mode)
 * - flagged: ring-2 ring-gold (consistency report)
 */
import { motion } from "framer-motion";
import { RotateCcw, Maximize2, Loader2, Check } from "lucide-react";

export interface PanelTileData {
  id: number;
  panelNumber: number;
  sceneNumber?: number;
  imageUrl?: string | null;
  compositeImageUrl?: string | null;
  status: "draft" | "generating" | "generated" | "approved" | "rejected";
  visualDescription?: string | null;
  cameraAngle?: string | null;
}

interface PanelTileProps {
  panel: PanelTileData;
  onRedraw: (panelId: number) => void;
  onOpen: (panelId: number) => void;
  isNew?: boolean;
  /** Whether this tile is selected for batch operations */
  isSelected?: boolean;
  /** Whether this tile is flagged by consistency report */
  isFlagged?: boolean;
  /** Whether selection mode is active (shows checkbox on hover) */
  selectionMode?: boolean;
  /** Callback when tile is shift-clicked or checkbox toggled */
  onToggleSelect?: (panelId: number) => void;
}

export function PanelTile({
  panel,
  onRedraw,
  onOpen,
  isNew,
  isSelected,
  isFlagged,
  selectionMode,
  onToggleSelect,
}: PanelTileProps) {
  const isGenerating = panel.status === "generating";
  const hasImage = !!panel.imageUrl;
  const isEmpty = !hasImage && !isGenerating;

  // Ring styling based on state
  const ringClass = isSelected
    ? "ring-2 ring-violet-500"
    : isFlagged
    ? "ring-2 ring-[#FFD700]"
    : "ring-1 ring-white/[0.06]";

  const handleClick = (e: React.MouseEvent) => {
    // Shift+click enters/toggles selection
    if (e.shiftKey && hasImage && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(panel.id);
      return;
    }
    // In selection mode, regular click also toggles
    if (selectionMode && hasImage && onToggleSelect) {
      e.preventDefault();
      onToggleSelect(panel.id);
      return;
    }
  };

  return (
    <motion.div
      initial={isNew ? { opacity: 0, scale: 0.85 } : { opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={isNew ? { type: "spring", stiffness: 400, damping: 25 } : { duration: 0.2 }}
      className={`rounded-xl aspect-[3/4] ${ringClass} relative overflow-hidden group bg-white/[0.02] cursor-pointer`}
      onClick={handleClick}
    >
      {/* Panel index badge */}
      <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[10px] font-mono text-white/50">
        {panel.panelNumber}
      </div>

      {/* Selection checkbox — visible in selection mode or when selected */}
      {(selectionMode || isSelected) && hasImage && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
              isSelected
                ? "bg-violet-500 text-white"
                : "bg-black/40 backdrop-blur-sm border border-white/20 text-transparent"
            }`}
          >
            <Check className="w-3 h-3" />
          </div>
        </div>
      )}

      {/* Empty shimmer placeholder */}
      {isEmpty && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
        </div>
      )}

      {/* Generating state */}
      {isGenerating && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
          <Loader2 className="w-6 h-6 animate-spin text-[#FFD700]" />
          <span className="text-[10px] text-white/30">Generating...</span>
        </div>
      )}

      {/* Image */}
      {hasImage && (
        <img
          src={panel.compositeImageUrl || panel.imageUrl || ""}
          alt={`Panel ${panel.panelNumber}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}

      {/* Hover actions — only when image exists, not generating, and not in selection mode */}
      {hasImage && !isGenerating && !selectionMode && !isSelected && (
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onRedraw(panel.id); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 text-xs font-medium hover:bg-black/80 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Redraw
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(panel.id); }}
            className="flex items-center justify-center px-3 py-2 rounded-lg bg-black/60 backdrop-blur-sm text-white/80 hover:bg-black/80 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected overlay tint */}
      {isSelected && (
        <div className="absolute inset-0 bg-violet-500/10 pointer-events-none" />
      )}

      {/* Regenerating overlay */}
      {panel.status === "generating" && hasImage && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#6B5BFF]" />
            <span className="text-[10px] text-white/50">Redrawing...</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
