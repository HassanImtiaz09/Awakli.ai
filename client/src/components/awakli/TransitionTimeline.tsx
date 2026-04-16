/**
 * TransitionTimeline — visual timeline showing panel transitions for an episode.
 * Includes bulk transition setter and duration preview.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightLeft, Clock, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

interface TransitionTimelineProps {
  episodeId: number;
  compact?: boolean;
}

const TRANSITION_COLORS: Record<string, string> = {
  cut: "bg-white/20",
  fade: "bg-amber-500/60",
  dissolve: "bg-purple-500/60",
  "cross-dissolve": "bg-cyan-500/60",
};

const TRANSITION_LABELS: Record<string, string> = {
  cut: "Cut",
  fade: "Fade",
  dissolve: "Dissolve",
  "cross-dissolve": "X-Dissolve",
};

export default function TransitionTimeline({ episodeId, compact = false }: TransitionTimelineProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [bulkTransition, setBulkTransition] = useState<string>("cross-dissolve");
  const [bulkDuration, setBulkDuration] = useState(0.5);

  const { data: panels, refetch } = trpc.transitions.getByEpisode.useQuery(
    { episodeId },
    { enabled: !!episodeId }
  );

  const { data: preview } = trpc.transitions.previewDuration.useQuery(
    { episodeId },
    { enabled: !!episodeId && expanded }
  );

  const updateMut = trpc.transitions.updatePanel.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Transition updated");
    },
  });

  const applyAllMut = trpc.transitions.applyToAll.useMutation({
    onSuccess: (data) => {
      refetch();
      toast.success(`Applied ${data.transition} to ${data.updated} panels`);
    },
  });

  if (!panels || panels.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={14} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white/90">Panel Transitions</span>
          <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
            {panels.length} panels
          </span>
        </div>
        <div className="flex items-center gap-3">
            {preview && (
            <span className="text-[10px] text-cyan-400/70 flex items-center gap-1">
              <Clock size={10} />
              {preview.totalDuration}s
              {(preview.timeSaved ?? 0) > 0 && (
                <span className="text-green-400/70 ml-1">(-{preview.timeSaved}s overlap)</span>
              )}
            </span>
          )}
          {expanded ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Bulk setter */}
            <div className="px-3 pb-2 flex items-center gap-2 border-t border-white/5 pt-2">
              <Wand2 size={12} className="text-white/40" />
              <span className="text-[10px] text-white/40">Apply to all:</span>
              <select
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[11px] text-white/80 focus:outline-none"
                value={bulkTransition}
                onChange={(e) => setBulkTransition(e.target.value)}
              >
                <option value="cut">Hard Cut</option>
                <option value="fade">Fade</option>
                <option value="dissolve">Dissolve</option>
                <option value="cross-dissolve">Cross-Dissolve</option>
              </select>
              {bulkTransition !== "cut" && (
                <div className="flex items-center gap-1">
                  <input
                    type="range"
                    min="0.2"
                    max="2.0"
                    step="0.1"
                    value={bulkDuration}
                    onChange={(e) => setBulkDuration(parseFloat(e.target.value))}
                    className="w-14 h-1 accent-cyan-500"
                  />
                  <span className="text-[10px] text-cyan-400 font-mono w-6">{bulkDuration.toFixed(1)}s</span>
                </div>
              )}
              <button
                onClick={() => {
                  applyAllMut.mutate({
                    episodeId,
                    transition: bulkTransition as any,
                    transitionDuration: bulkDuration,
                  });
                }}
                disabled={applyAllMut.isPending}
                className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors disabled:opacity-50"
              >
                {applyAllMut.isPending ? "Applying..." : "Apply"}
              </button>
            </div>

            {/* Visual timeline */}
            <div className="px-3 pb-3">
              <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
                {panels.map((p, i) => (
                  <div key={p.panelId} className="flex items-center">
                    {/* Panel chip */}
                    <div className="flex flex-col items-center min-w-[40px]">
                      <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-white/60 font-mono">
                        P{p.panelNumber}
                      </div>
                    </div>

                    {/* Transition indicator between panels */}
                    {i < panels.length - 1 && (
                      <div className="flex flex-col items-center mx-0.5">
                        <button
                          onClick={() => {
                            const types: string[] = ["cut", "fade", "dissolve", "cross-dissolve"];
                            const currentIdx = types.indexOf(p.transition);
                            const nextType = types[(currentIdx + 1) % types.length];
                            updateMut.mutate({
                              panelId: p.panelId,
                              transition: nextType as any,
                              transitionDuration: p.transitionDuration,
                            });
                          }}
                          className={`w-12 h-4 rounded-full ${TRANSITION_COLORS[p.transition] || TRANSITION_COLORS.cut} flex items-center justify-center hover:ring-1 hover:ring-cyan-500/50 transition-all cursor-pointer`}
                          title={`Click to cycle: ${TRANSITION_LABELS[p.transition] || "Cut"} → next`}
                        >
                          <span className="text-[8px] text-white/80 font-medium truncate px-1">
                            {TRANSITION_LABELS[p.transition] || "Cut"}
                          </span>
                        </button>
                        {p.transition !== "cut" && (
                          <span className="text-[8px] text-white/30 mt-0.5">{p.transitionDuration.toFixed(1)}s</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                {Object.entries(TRANSITION_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${TRANSITION_COLORS[key]}`} />
                    <span className="text-[9px] text-white/40">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
