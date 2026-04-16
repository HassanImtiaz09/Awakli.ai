/**
 * TransitionTimeline — visual timeline showing panel transitions for an episode.
 * Includes bulk transition setter, scene-aware auto-assign, and duration preview.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRightLeft, Clock, ChevronDown, ChevronUp, Wand2, Sparkles, Check, X } from "lucide-react";
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

const REASON_LABELS: Record<string, string> = {
  scene_boundary: "Scene boundary",
  within_scene: "Within scene",
  last_panel: "Last panel",
};

export default function TransitionTimeline({ episodeId, compact = false }: TransitionTimelineProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [bulkTransition, setBulkTransition] = useState<string>("cross-dissolve");
  const [bulkDuration, setBulkDuration] = useState(0.5);
  const [showAutoPreview, setShowAutoPreview] = useState(false);

  const { data: panels, refetch } = trpc.transitions.getByEpisode.useQuery(
    { episodeId },
    { enabled: !!episodeId }
  );

  const { data: preview, refetch: refetchPreview } = trpc.transitions.previewDuration.useQuery(
    { episodeId },
    { enabled: !!episodeId && expanded }
  );

  const { data: autoPreview, refetch: refetchAutoPreview } = trpc.transitions.autoAssignPreview.useQuery(
    { episodeId },
    { enabled: !!episodeId && showAutoPreview }
  );

  const updateMut = trpc.transitions.updatePanel.useMutation({
    onSuccess: () => {
      refetch();
      refetchPreview();
      toast.success("Transition updated");
    },
  });

  const applyAllMut = trpc.transitions.applyToAll.useMutation({
    onSuccess: (data) => {
      refetch();
      refetchPreview();
      toast.success(`Applied ${data.transition} to ${data.updated} panels`);
    },
  });

  const autoAssignMut = trpc.transitions.autoAssign.useMutation({
    onSuccess: (data) => {
      refetch();
      refetchPreview();
      setShowAutoPreview(false);
      toast.success(
        `Auto-assigned transitions: ${data.sceneBoundaries} scene boundary fade${data.sceneBoundaries !== 1 ? "s" : ""}, ${data.withinScene} cross-dissolve${data.withinScene !== 1 ? "s" : ""}`,
        { duration: 5000 }
      );
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
            {/* Toolbar row: Auto-assign + Bulk setter */}
            <div className="px-3 pb-2 border-t border-white/5 pt-2 space-y-2">
              {/* Auto-assign row */}
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-amber-400" />
                <span className="text-[10px] text-white/50">Scene-aware:</span>
                {!showAutoPreview ? (
                  <button
                    onClick={() => {
                      setShowAutoPreview(true);
                      refetchAutoPreview();
                    }}
                    className="text-[10px] px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors flex items-center gap-1"
                  >
                    <Sparkles size={9} />
                    Auto-Assign Transitions
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    {autoPreview ? (
                      <>
                        <span className="text-[10px] text-white/60">
                          {autoPreview.sceneBoundaries} fade{autoPreview.sceneBoundaries !== 1 ? "s" : ""} (scene boundaries) + {autoPreview.withinScene} cross-dissolve{autoPreview.withinScene !== 1 ? "s" : ""} (within scenes)
                        </span>
                        <button
                          onClick={() => autoAssignMut.mutate({ episodeId })}
                          disabled={autoAssignMut.isPending}
                          className="text-[10px] px-2 py-0.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Check size={9} />
                          {autoAssignMut.isPending ? "Applying..." : "Apply"}
                        </button>
                        <button
                          onClick={() => setShowAutoPreview(false)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40 hover:bg-white/10 transition-colors"
                        >
                          <X size={9} />
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] text-white/40">Analyzing scenes...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Auto-assign preview detail */}
              <AnimatePresence>
                {showAutoPreview && autoPreview && autoPreview.assignments.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-2 space-y-1">
                      <div className="text-[9px] text-amber-400/60 font-medium uppercase tracking-wider mb-1">Preview</div>
                      <div className="flex flex-wrap gap-1">
                        {autoPreview.assignments.map((a) => (
                          <div
                            key={a.panelId}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${
                              a.reason === "scene_boundary"
                                ? "bg-amber-500/15 text-amber-300"
                                : a.reason === "within_scene"
                                ? "bg-cyan-500/15 text-cyan-300"
                                : "bg-white/5 text-white/40"
                            }`}
                            title={REASON_LABELS[a.reason]}
                          >
                            <span className="font-mono">P{a.panelNumber}</span>
                            <span className="opacity-60">→</span>
                            <span>{TRANSITION_LABELS[a.transition]}</span>
                            {a.transition !== "cut" && (
                              <span className="opacity-50">{a.transitionDuration}s</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[9px] text-white/30">
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
                          Scene boundary → Fade
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/60" />
                          Within scene → Cross-Dissolve
                        </span>
                        <span className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                          Last panel → Cut
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bulk setter row */}
              <div className="flex items-center gap-2">
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
            </div>

            {/* Visual timeline */}
            <div className="px-3 pb-3">
              <div className="flex items-center gap-0.5 overflow-x-auto pb-1">
                {panels.map((p, i) => {
                  // Detect scene boundary for visual indicator
                  const nextPanel = i < panels.length - 1 ? panels[i + 1] : null;
                  const isSceneBoundary = nextPanel && p.sceneNumber !== nextPanel.sceneNumber;

                  return (
                    <div key={p.panelId} className="flex items-center">
                      {/* Panel chip */}
                      <div className="flex flex-col items-center min-w-[40px]">
                        <div className="w-8 h-8 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-white/60 font-mono">
                          P{p.panelNumber}
                        </div>
                        <span className="text-[7px] text-white/20 mt-0.5">S{p.sceneNumber}</span>
                      </div>

                      {/* Transition indicator between panels */}
                      {i < panels.length - 1 && (
                        <div className="flex flex-col items-center mx-0.5">
                          {/* Scene boundary marker */}
                          {isSceneBoundary && (
                            <div className="text-[7px] text-amber-400/60 mb-0.5 font-medium">SCENE</div>
                          )}
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
                            className={`w-12 h-4 rounded-full ${TRANSITION_COLORS[p.transition] || TRANSITION_COLORS.cut} flex items-center justify-center hover:ring-1 hover:ring-cyan-500/50 transition-all cursor-pointer ${isSceneBoundary ? "ring-1 ring-amber-500/30" : ""}`}
                            title={`${isSceneBoundary ? "[Scene boundary] " : ""}Click to cycle: ${TRANSITION_LABELS[p.transition] || "Cut"} → next`}
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
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                {Object.entries(TRANSITION_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${TRANSITION_COLORS[key]}`} />
                    <span className="text-[9px] text-white/40">{label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/5">
                  <div className="w-2 h-2 rounded-sm ring-1 ring-amber-500/40" />
                  <span className="text-[9px] text-white/40">Scene boundary</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
