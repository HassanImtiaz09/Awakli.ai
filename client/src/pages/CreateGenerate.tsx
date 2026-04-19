import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Loader2, CheckCircle2, Sparkles, Eye, X, ArrowRight, AlertCircle, Clock, Zap, User2, Timer } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ScriptScene {
  scene_number: number;
  location: string;
  time_of_day: string;
  mood: string;
  description: string;
  panels: {
    panel_number: number;
    visual_description: string;
    camera_angle: string;
    dialogue: { character: string; text: string; emotion: string }[];
    sfx: string | null;
    transition: string | null;
  }[];
}

interface ScriptContent {
  episode_title: string;
  synopsis: string;
  scenes: ScriptScene[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "< 1s";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSec = seconds % 60;
  return `${minutes}m ${remainingSec}s`;
}

function getStepLabel(step: string): { label: string; color: string } {
  switch (step) {
    case "queued": return { label: "Queued", color: "text-white/30" };
    case "building_prompt": return { label: "Building prompt...", color: "text-amber-400" };
    case "generating": return { label: "Generating...", color: "text-cyan-400" };
    case "uploading": return { label: "Saving...", color: "text-blue-400" };
    case "complete": return { label: "Done", color: "text-green-400" };
    case "failed": return { label: "Failed", color: "text-red-400" };
    case "retrying": return { label: "Retrying...", color: "text-amber-500" };
    default: return { label: "Waiting", color: "text-white/20" };
  }
}

export default function CreateGenerate() {
  const [, params] = useRoute("/create/:projectId");
  const [, navigate] = useLocation();
  const projectId = params?.projectId ? parseInt(params.projectId) : 0;

  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [lightboxPanel, setLightboxPanel] = useState<string | null>(null);
  const scriptEndRef = useRef<HTMLDivElement>(null);

  // Poll for status every 2 seconds (faster for better progress updates)
  const { data: status, isLoading: statusLoading } = trpc.quickCreate.status.useQuery(
    { projectId },
    { enabled: projectId > 0, refetchInterval: 2000 }
  );

  // Get script content for the first chapter
  const firstChapterId = status?.chapters?.[0]?.id;
  const { data: scriptData } = trpc.quickCreate.getScript.useQuery(
    { episodeId: firstChapterId! },
    { enabled: !!firstChapterId, refetchInterval: 3000 }
  );

  // Get panels
  const { data: panelsData } = trpc.quickCreate.getPanels.useQuery(
    { projectId, episodeId: firstChapterId },
    { enabled: projectId > 0, refetchInterval: 2000 }
  );

  const script = scriptData?.scriptContent as ScriptContent | null;
  const panels = panelsData ?? [];
  const generatedPanels = panels.filter(p => p.status === "generated" && p.imageUrl);
  const generatingPanels = panels.filter(p => p.status === "generating");

  // Auto-expand latest scene
  useEffect(() => {
    if (script?.scenes?.length) {
      setExpandedScene(script.scenes[script.scenes.length - 1].scene_number);
    }
  }, [script?.scenes?.length]);

  // Auto-scroll script feed
  useEffect(() => {
    scriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [script]);

  // Navigate to reader when complete
  const isComplete = status?.phase === "complete";
  const [showCompleteOverlay, setShowCompleteOverlay] = useState(false);

  useEffect(() => {
    if (isComplete && !showCompleteOverlay) {
      const timer = setTimeout(() => setShowCompleteOverlay(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, showCompleteOverlay]);

  // Progress calculation
  const overallProgress = useMemo(() => {
    if (!status) return 0;
    const livePhase = status.livePhase ?? status.phase;
    if (livePhase === "script") return 10;
    if (livePhase === "characters") return 20;
    if (livePhase === "reference_sheet") return 25;
    if (livePhase === "complete") return 100;
    // panels phase: 30-100
    const panelProgress = status.totalPanels > 0
      ? (status.generatedPanels / status.totalPanels) * 70
      : 0;
    return Math.round(30 + panelProgress);
  }, [status]);

  // Panel step lookup from status
  const panelStepMap = useMemo(() => {
    const map = new Map<number, { step: string; attempt: number }>();
    if (status?.panelSteps) {
      for (const ps of status.panelSteps) {
        map.set(ps.panelId, { step: ps.step, attempt: ps.attempt });
      }
    }
    return map;
  }, [status?.panelSteps]);

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-[#08080F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#E94560] animate-spin" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen bg-[#08080F] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <p className="text-white/50">Project not found</p>
          <button onClick={() => navigate("/create")} className="mt-4 text-[#E94560] hover:underline">
            Create a new manga
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080F] flex flex-col">
      {/* Top bar */}
      <div className="border-b border-white/5 bg-[#08080F]/90 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/create")} className="text-white/40 hover:text-white/70 transition">
              <BookOpen className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-white font-semibold text-lg leading-tight">{status.title}</h1>
              <p className="text-white/40 text-xs">
                {status.statusMessage ?? (isComplete ? "Generation complete!" : "Generating Chapter 1...")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* ETA display */}
            {!isComplete && status.estimatedRemainingMs > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-white/30 text-xs">
                <Timer className="w-3.5 h-3.5" />
                <span>~{formatDuration(status.estimatedRemainingMs)} remaining</span>
              </div>
            )}
            {/* Elapsed time */}
            {!isComplete && status.elapsedMs > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-white/30 text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDuration(status.elapsedMs)}</span>
              </div>
            )}
            {isComplete && (
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => navigate(`/create/${projectId}/read`)}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-medium text-sm flex items-center gap-2"
              >
                Read Manga <ArrowRight className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#E94560] to-[#6C63FF]"
            initial={{ width: 0 }}
            animate={{ width: `${overallProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Phase indicator strip */}
      {!isComplete && (
        <div className="border-b border-white/5 bg-white/[0.02]">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-6">
            {[
              { key: "script", label: "Script", icon: BookOpen },
              { key: "characters", label: "Characters", icon: User2 },
              { key: "reference_sheet", label: "Reference", icon: Sparkles },
              { key: "panels", label: "Panels", icon: Zap },
            ].map(({ key, label, icon: Icon }, idx) => {
              const livePhase = status.livePhase ?? status.phase;
              const phases = ["script", "characters", "reference_sheet", "panels", "complete"];
              const currentIdx = phases.indexOf(livePhase);
              const thisIdx = phases.indexOf(key);
              const isActive = key === livePhase;
              const isDone = thisIdx < currentIdx || livePhase === "complete";

              return (
                <div key={key} className="flex items-center gap-2">
                  {idx > 0 && (
                    <div className={`w-8 h-px ${isDone ? "bg-green-500/50" : "bg-white/10"}`} />
                  )}
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${
                    isActive ? "text-cyan-400" : isDone ? "text-green-400/70" : "text-white/20"
                  }`}>
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isActive ? (
                      <Icon className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                    <span>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main content: split view */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Script feed (1/3) */}
        <div className="lg:w-1/3 border-r border-white/5 overflow-y-auto max-h-[calc(100vh-100px)]">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2 h-2 rounded-full ${script ? "bg-green-500" : "bg-[#E94560] animate-pulse"}`} />
              <span className="text-white/60 text-sm font-medium">
                {script ? "Script Generated" : "Writing Script..."}
              </span>
            </div>

            {!script && (
              <div className="space-y-3">
                <div className="bg-white/[0.03] rounded-lg p-4 border border-white/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-[#E94560] animate-pulse" />
                    <span className="text-white/40 text-xs font-mono">AI is writing your story...</span>
                  </div>
                  <div className="space-y-2">
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.1, 0.3, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                        className="h-3 bg-white/5 rounded"
                        style={{ width: `${60 + Math.random() * 40}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {script && (
              <div className="space-y-3">
                {/* Synopsis */}
                <div className="bg-white/[0.03] rounded-lg p-4 border border-white/5">
                  <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-2">Synopsis</h3>
                  <p className="text-white/50 text-sm leading-relaxed font-mono">{script.synopsis}</p>
                </div>

                {/* Character reference sheet */}
                {status.characterRefUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-[#E94560]/10 to-[#6C63FF]/10 rounded-lg p-4 border border-[#E94560]/20"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <User2 className="w-4 h-4 text-[#E94560]" />
                      <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider">Character Reference</h3>
                    </div>
                    <p className="text-white/40 text-[11px] mb-2">
                      This reference sheet ensures character consistency across all panels.
                    </p>
                    <img
                      src={status.characterRefUrl}
                      alt="Character reference sheet"
                      className="w-full rounded-lg border border-white/10 cursor-pointer hover:border-[#E94560]/40 transition"
                      onClick={() => setLightboxPanel(status.characterRefUrl!)}
                    />
                  </motion.div>
                )}

                {/* Scenes */}
                {script.scenes.map((scene) => (
                  <motion.div
                    key={scene.scene_number}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/[0.03] rounded-lg border border-white/5 overflow-hidden"
                  >
                    <button
                      onClick={() => setExpandedScene(expandedScene === scene.scene_number ? null : scene.scene_number)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition"
                    >
                      <div>
                        <span className="text-[#E94560] text-xs font-mono">Scene {scene.scene_number}</span>
                        <span className="text-white/30 text-xs ml-2">{scene.location}</span>
                      </div>
                      <span className="text-white/20 text-xs">{scene.time_of_day}</span>
                    </button>
                    <AnimatePresence>
                      {expandedScene === scene.scene_number && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-3 space-y-2">
                            <p className="text-white/40 text-xs font-mono leading-relaxed">{scene.description}</p>
                            {scene.panels.map((panel) => (
                              <div key={panel.panel_number} className="pl-3 border-l border-white/10">
                                <span className="text-[#6C63FF] text-[10px] font-mono">Panel {panel.panel_number}</span>
                                <p className="text-white/30 text-[11px] font-mono">{panel.visual_description.slice(0, 120)}...</p>
                                {panel.dialogue.map((d, di) => (
                                  <p key={di} className="text-white/50 text-[11px] italic mt-0.5">
                                    <span className="text-[#E94560]/60">{d.character}:</span> "{d.text}"
                                  </p>
                                ))}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
                <div ref={scriptEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Panel grid (2/3) */}
        <div className="lg:w-2/3 overflow-y-auto max-h-[calc(100vh-100px)]">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  generatedPanels.length === panels.length && panels.length > 0
                    ? "bg-green-500"
                    : generatingPanels.length > 0
                    ? "bg-cyan-400 animate-pulse"
                    : "bg-white/20"
                }`} />
                <span className="text-white/60 text-sm font-medium">
                  {panels.length === 0
                    ? "Waiting for script..."
                    : `${generatedPanels.length} of ${panels.length} panels`
                  }
                </span>
              </div>
              <div className="flex items-center gap-3">
                {panels.length > 0 && (
                  <span className="text-white/30 text-xs">
                    {Math.round((generatedPanels.length / panels.length) * 100)}%
                  </span>
                )}
                {/* Avg panel time */}
                {status.avgPanelTimeMs > 0 && status.generatedPanels > 0 && (
                  <span className="text-white/20 text-[10px] font-mono">
                    ~{formatDuration(status.avgPanelTimeMs)}/panel
                  </span>
                )}
              </div>
            </div>

            {panels.length === 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[...Array(9)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="aspect-[3/4] rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden"
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <motion.div
                        animate={{ opacity: [0.1, 0.2, 0.1] }}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.2 }}
                        className="w-8 h-8 rounded-full bg-white/5"
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {panels.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {panels.map((panel, i) => {
                  const stepInfo = panelStepMap.get(panel.id);
                  const step = stepInfo?.step ?? (panel.status === "generated" ? "complete" : panel.status === "generating" ? "generating" : "queued");
                  const { label: stepLabel, color: stepColor } = getStepLabel(step);

                  return (
                    <motion.div
                      key={panel.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="aspect-[3/4] rounded-xl overflow-hidden border border-white/5 relative group cursor-pointer"
                      onClick={() => panel.imageUrl && setLightboxPanel(panel.imageUrl)}
                    >
                      {panel.status === "generated" && panel.imageUrl ? (
                        <>
                          <motion.img
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.6 }}
                            src={panel.imageUrl}
                            alt={`Panel ${panel.sceneNumber}-${panel.panelNumber}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <Eye className="w-6 h-6 text-white" />
                          </div>
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-white/70 text-[10px] font-mono">
                            S{panel.sceneNumber}P{panel.panelNumber}
                          </div>
                          <div className="absolute top-2 right-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          </div>
                        </>
                      ) : panel.status === "generating" ? (
                        <div className="w-full h-full bg-white/[0.03] flex flex-col items-center justify-center">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                            <Sparkles className="w-5 h-5 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                          </div>
                          <span className={`text-xs mt-2 font-mono ${stepColor}`}>{stepLabel}</span>
                          <span className="text-white/20 text-[10px] mt-1">S{panel.sceneNumber}P{panel.panelNumber}</span>
                          {stepInfo && stepInfo.attempt > 1 && (
                            <span className="text-amber-500/60 text-[9px] mt-0.5">Attempt {stepInfo.attempt}</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full bg-white/[0.02] flex flex-col items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                            <span className="text-white/10 text-[10px] font-mono">{i + 1}</span>
                          </div>
                          <span className={`text-[10px] mt-2 font-mono ${stepColor}`}>{stepLabel}</span>
                          <span className="text-white/15 text-[10px] mt-0.5">S{panel.sceneNumber}P{panel.panelNumber}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="border-t border-white/5 bg-[#08080F]/90 backdrop-blur-xl px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isComplete && (
              <Loader2 className="w-4 h-4 text-[#E94560] animate-spin" />
            )}
            <span className="text-white/50 text-sm">
              {status.statusMessage ?? (isComplete
                ? "Your manga is ready!"
                : status.phase === "script"
                ? "Writing your story..."
                : `Generating panels: ${status.generatedPanels}/${status.totalPanels}`
              )}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {!isComplete && status.estimatedRemainingMs > 0 && (
              <span className="text-white/20 text-xs sm:hidden">
                ~{formatDuration(status.estimatedRemainingMs)}
              </span>
            )}
            <span className="text-white/30 text-sm font-mono">{overallProgress}%</span>
          </div>
        </div>
      </div>

      {/* Completion overlay */}
      <AnimatePresence>
        {showCompleteOverlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="text-center max-w-md px-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 rounded-full bg-gradient-to-br from-[#E94560] to-[#6C63FF] flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle2 className="w-10 h-10 text-white" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Your Manga is Ready!</h2>
              <p className="text-white/50 mb-4">
                {status.generatedPanels} panels across {script?.scenes?.length || 0} scenes have been generated.
              </p>
              {status.elapsedMs > 0 && (
                <p className="text-white/30 text-sm mb-6">
                  Generated in {formatDuration(status.elapsedMs)}
                </p>
              )}

              {/* Character consistency note */}
              <div className="bg-white/[0.05] rounded-lg p-3 mb-6 text-left border border-white/10">
                <p className="text-white/40 text-xs leading-relaxed">
                  <span className="text-[#E94560] font-medium">Character Consistency:</span> Characters were designed with detailed visual profiles and reference sheets.
                  For even better consistency in future chapters, <span className="text-white/60">create an account</span> to train a custom LoRA model for your characters — this ensures pixel-perfect identity across panels and video.
                </p>
              </div>

              <button
                onClick={() => navigate(`/create/${projectId}/read`)}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all"
              >
                <BookOpen className="inline w-5 h-5 mr-2" />
                Read Your Manga
              </button>
              <button
                onClick={() => setShowCompleteOverlay(false)}
                className="block mx-auto mt-4 text-white/40 hover:text-white/60 text-sm transition"
              >
                Continue watching
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={() => setLightboxPanel(null)}
          >
            <button
              onClick={() => setLightboxPanel(null)}
              className="absolute top-4 right-4 text-white/60 hover:text-white transition z-10"
            >
              <X className="w-8 h-8" />
            </button>
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              src={lightboxPanel}
              alt="Panel detail"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
