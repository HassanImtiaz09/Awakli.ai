import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Loader2, CheckCircle2, Sparkles, Eye, X, ArrowRight, AlertCircle } from "lucide-react";
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

export default function CreateGenerate() {
  const [, params] = useRoute("/create/:projectId");
  const [, navigate] = useLocation();
  const projectId = params?.projectId ? parseInt(params.projectId) : 0;

  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [lightboxPanel, setLightboxPanel] = useState<string | null>(null);
  const scriptEndRef = useRef<HTMLDivElement>(null);

  // Poll for status every 3 seconds
  const { data: status, isLoading: statusLoading } = trpc.quickCreate.status.useQuery(
    { projectId },
    { enabled: projectId > 0, refetchInterval: 3000 }
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
    { enabled: projectId > 0, refetchInterval: 3000 }
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
    const scriptWeight = 30;
    const panelWeight = 70;
    const scriptDone = script ? scriptWeight : 0;
    const panelProgress = status.totalPanels > 0
      ? (status.generatedPanels / status.totalPanels) * panelWeight
      : 0;
    return Math.round(scriptDone + panelProgress);
  }, [status, script]);

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
                {isComplete ? "Generation complete!" : `Generating Chapter 1...`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
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

      {/* Main content: split view */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Script feed (1/3) */}
        <div className="lg:w-1/3 border-r border-white/5 overflow-y-auto max-h-[calc(100vh-60px)]">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2 h-2 rounded-full ${script ? "bg-green-500" : "bg-[#E94560] animate-pulse"}`} />
              <span className="text-white/60 text-sm font-medium">
                {script ? "Script Generated" : "Writing Script..."}
              </span>
            </div>

            {!script && (
              <div className="space-y-3">
                {/* Typing animation placeholder */}
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
        <div className="lg:w-2/3 overflow-y-auto max-h-[calc(100vh-60px)]">
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
              {panels.length > 0 && (
                <span className="text-white/30 text-xs">
                  {Math.round((generatedPanels.length / panels.length) * 100)}%
                </span>
              )}
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
                {panels.map((panel, i) => (
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
                        <span className="text-cyan-400/60 text-xs mt-2 font-mono">Generating...</span>
                        <span className="text-white/20 text-[10px] mt-1">S{panel.sceneNumber}P{panel.panelNumber}</span>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-white/[0.02] flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/5" />
                        <span className="text-white/15 text-[10px] mt-2 font-mono">S{panel.sceneNumber}P{panel.panelNumber}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="border-t border-white/5 bg-[#08080F]/90 backdrop-blur-xl px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-sm">
              {isComplete
                ? "Your manga is ready!"
                : status.phase === "script"
                ? "Writing your story..."
                : `Generating panels: ${status.generatedPanels}/${status.totalPanels}`
              }
            </span>
          </div>
          <span className="text-white/30 text-sm font-mono">{overallProgress}%</span>
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
              <p className="text-white/50 mb-8">
                {status.generatedPanels} panels across {script?.scenes?.length || 0} scenes have been generated.
              </p>
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
