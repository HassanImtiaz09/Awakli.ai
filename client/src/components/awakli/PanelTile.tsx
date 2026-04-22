/**
 * PanelTile — Individual panel card in the generation grid.
 *
 * States:
 * - empty: shimmer placeholder
 * - streaming: pop-in animation when image arrives
 * - regenerating: overlay + progress spinner
 * - complete: image shown with hover actions
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, Maximize2, Loader2 } from "lucide-react";

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
  isNew?: boolean; // triggers pop-in animation
}

export function PanelTile({ panel, onRedraw, onOpen, isNew }: PanelTileProps) {
  const isGenerating = panel.status === "generating";
  const hasImage = !!panel.imageUrl;
  const isEmpty = !hasImage && !isGenerating;

  return (
    <motion.div
      initial={isNew ? { opacity: 0, scale: 0.85 } : { opacity: 1, scale: 1 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={isNew ? { type: "spring", stiffness: 400, damping: 25 } : { duration: 0.2 }}
      className="rounded-xl aspect-[3/4] ring-1 ring-white/[0.06] relative overflow-hidden group bg-white/[0.02]"
    >
      {/* Panel index badge */}
      <div className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[10px] font-mono text-white/50">
        {panel.panelNumber}
      </div>

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

      {/* Hover actions — only when image exists and not generating */}
      {hasImage && !isGenerating && (
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
