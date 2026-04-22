/**
 * PanelTimingEditor — timeline with per-panel seconds (1–8s); drag handles; bulk presets.
 *
 * Spec: Stage 6 · Video — Short-form Render (Mangaka)
 */
import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, Clock, Zap, Play, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const TIMING_COPY = {
  presetFast: "Fast (1.5s)",
  presetNormal: "Normal (2s)",
  presetCinematic: "Cinematic (3s)",
} as const;

// ─── Exported constants ─────────────────────────────────────────────
export const TIMING_LIMITS = {
  minPerPanel: 1,
  maxPerPanel: 8,
  defaultPerPanel: 2,
} as const;

export const BULK_PRESETS = [
  { label: TIMING_COPY.presetFast, value: 1.5, icon: Zap },
  { label: TIMING_COPY.presetNormal, value: 2, icon: Play },
  { label: TIMING_COPY.presetCinematic, value: 3, icon: Film },
] as const;

// ─── Types ──────────────────────────────────────────────────────────
export interface PanelTiming {
  panelIndex: number;
  imageUrl: string | null;
  duration: number; // seconds, 1–8
}

interface PanelTimingEditorProps {
  panels: PanelTiming[];
  onTimingsChange: (panels: PanelTiming[]) => void;
  maxRuntime?: number; // tier cap in seconds
}

// ─── Component ──────────────────────────────────────────────────────
export default function PanelTimingEditor({
  panels,
  onTimingsChange,
  maxRuntime = 60,
}: PanelTimingEditorProps) {
  const [activePreset, setActivePreset] = useState<number | null>(
    TIMING_LIMITS.defaultPerPanel
  );
  const dragRef = useRef<{
    panelIdx: number;
    startY: number;
    startDuration: number;
  } | null>(null);

  const totalRuntime = panels.reduce((sum, p) => sum + p.duration, 0);
  const overBudget = totalRuntime > maxRuntime;

  // ── Bulk preset ───────────────────────────────────────────────────
  const applyPreset = useCallback(
    (value: number) => {
      setActivePreset(value);
      const updated = panels.map((p) => ({ ...p, duration: value }));
      onTimingsChange(updated);
    },
    [panels, onTimingsChange]
  );

  // ── Per-panel duration change ─────────────────────────────────────
  const setDuration = useCallback(
    (idx: number, dur: number) => {
      const clamped = Math.max(
        TIMING_LIMITS.minPerPanel,
        Math.min(TIMING_LIMITS.maxPerPanel, dur)
      );
      setActivePreset(null);
      const updated = panels.map((p, i) =>
        i === idx ? { ...p, duration: clamped } : p
      );
      onTimingsChange(updated);
    },
    [panels, onTimingsChange]
  );

  // ── Drag handle ───────────────────────────────────────────────────
  const handlePointerDown = useCallback(
    (idx: number, e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        panelIdx: idx,
        startY: e.clientY,
        startDuration: panels[idx].duration,
      };
    },
    [panels]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const { panelIdx, startY, startDuration } = dragRef.current;
      const deltaY = startY - e.clientY; // drag up = longer
      const deltaDur = Math.round(deltaY / 20) * 0.5;
      const newDur = startDuration + deltaDur;
      setDuration(panelIdx, newDur);
    },
    [setDuration]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <div className="space-y-4">
      {/* Bulk presets */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40 uppercase tracking-wider mr-1">
          Preset
        </span>
        {BULK_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.value;
          return (
            <Button
              key={preset.value}
              variant="outline"
              size="sm"
              className={`gap-1.5 text-xs transition-all ${
                isActive
                  ? "ring-2 ring-violet-500 bg-violet-500/10 text-violet-300 border-violet-500/40"
                  : "text-white/60 border-white/10 hover:border-white/20"
              }`}
              onClick={() => applyPreset(preset.value)}
            >
              <Icon className="w-3 h-3" />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Timeline */}
      <div
        className="flex overflow-x-auto gap-1 py-4 bg-ink/5 rounded-sheet px-4"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {panels.map((panel, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.03 }}
            className={`shrink-0 rounded-xl ring-1 bg-paper p-2 flex flex-col items-center gap-1.5 w-[80px] select-none ${
              overBudget ? "ring-red-500/40" : "ring-ink/10"
            }`}
          >
            {/* Panel thumbnail */}
            <div className="w-full aspect-[3/4] rounded-lg bg-ink/10 overflow-hidden relative">
              {panel.imageUrl ? (
                <img
                  src={panel.imageUrl}
                  alt={`Panel ${panel.panelIndex + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20 text-[10px]">
                  {panel.panelIndex + 1}
                </div>
              )}
              {/* Panel index badge */}
              <div className="absolute top-1 left-1 bg-ink/70 text-white/80 text-[9px] font-mono px-1 rounded">
                {panel.panelIndex + 1}
              </div>
            </div>

            {/* Duration display + drag handle */}
            <div className="flex items-center gap-1">
              <button
                className="text-white/30 hover:text-white/60 transition cursor-ns-resize touch-none"
                onPointerDown={(e) => handlePointerDown(idx, e)}
                title="Drag to adjust duration"
              >
                <GripVertical className="w-3 h-3" />
              </button>
              <div className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5 text-white/30" />
                <input
                  type="number"
                  min={TIMING_LIMITS.minPerPanel}
                  max={TIMING_LIMITS.maxPerPanel}
                  step={0.5}
                  value={panel.duration}
                  onChange={(e) =>
                    setDuration(idx, parseFloat(e.target.value) || 2)
                  }
                  className="w-8 text-center text-xs font-mono bg-transparent text-white/70 border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[10px] text-white/30">s</span>
              </div>
            </div>

            {/* Duration bar visualization */}
            <div className="w-full h-1 rounded-full bg-ink/10 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  overBudget ? "bg-red-500/60" : "bg-violet-500/60"
                }`}
                animate={{
                  width: `${
                    ((panel.duration - TIMING_LIMITS.minPerPanel) /
                      (TIMING_LIMITS.maxPerPanel - TIMING_LIMITS.minPerPanel)) *
                    100
                  }%`,
                }}
                transition={{ duration: 0.15 }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Over-budget warning */}
      <AnimatePresence>
        {overBudget && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
          >
            Mangaka caps at 60s — trim or upgrade
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
