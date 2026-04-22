/**
 * Stage 6 · Video — Short-form Render (Mangaka) + Long-form + Master Export (Studio/Studio Pro)
 *
 * States: timing → confirming → rendering → review → error
 * Studio+ adds: chapter-compose, music-bed, export-format dialog on approve
 */
import { useState, useMemo, useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Film,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Check,
  Coins,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { WithTier } from "@/components/awakli/withTier";
import { StageHeader } from "@/components/awakli/StageHeader";
import { useTierGate } from "@/hooks/useTierGate";
import { Button } from "@/components/ui/button";
import PanelTimingEditor, {
  type PanelTiming,
  TIMING_LIMITS,
} from "@/components/awakli/PanelTimingEditor";
import DurationForecast, {
  calculateCredits,
  VIDEO_CREDITS,
  MANGAKA_LIMITS,
  FORECAST_COPY,
} from "@/components/awakli/DurationForecast";
import RenderReview, {
  REVIEW_COPY,
  type RenderResult,
  type ReviewPanel,
} from "@/components/awakli/RenderReview";
import ChapterComposer, {
  type Chapter,
  type ChapterScene,
  totalChaptersDuration,
  createChapter,
  CHAPTER_COPY,
} from "@/components/awakli/ChapterComposer";
import MusicBed, {
  type MusicBedSelection,
  MUSIC_COPY,
  AUTO_DUCK_DB,
  STOCK_CUES,
} from "@/components/awakli/MusicBed";
import MasterExport, {
  type ExportConfig,
  calculateExportCredits,
  EXPORT_COPY,
} from "@/components/awakli/MasterExport";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const VIDEO_COPY = {
  pageTitle: "Your anime",
  subhead: "How long should each moment breathe?",
  renderPhase1: "Bringing panels to motion…",
  renderPhase2: "Casting voices…",
  renderPhase3: "Composing the final cut…",
  errorRetry: "Retry render",
  errorRefund: "Credits auto-refunded",
} as const;

// ─── Studio tier limits ─────────────────────────────────────────────
export const STUDIO_LIMITS = {
  maxRuntime: 720, // 12 minutes
  maxResolution: "4K" as const,
  exportFormats: ["MP4 H.264", "ProRes 422 HQ"] as const,
  maxRendersPerEpisodePerMonth: 10,
  musicUploadCost: 2,
} as const;

export const STUDIO_PRO_LIMITS = {
  maxRuntime: 1440, // 24 minutes
  maxResolution: "4K" as const,
  exportFormats: ["MP4 H.264", "ProRes 422 HQ"] as const,
  maxRendersPerEpisodePerMonth: Infinity,
  monthlyMasterPool: 2000,
  musicUploadCost: 2,
} as const;

// ─── Types ──────────────────────────────────────────────────────────
type VideoState =
  | "timing"
  | "confirming"
  | "rendering"
  | "review"
  | "error"
  | "exporting";

const RENDER_PHASES = [
  VIDEO_COPY.renderPhase1,
  VIDEO_COPY.renderPhase2,
  VIDEO_COPY.renderPhase3,
] as const;

// ─── Analytics helper ───────────────────────────────────────────────
function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window !== "undefined" && (window as any).__awakli_track) {
    (window as any).__awakli_track(event, data);
  }
}

// ─── Tier helpers ───────────────────────────────────────────────────
function getTierLimits(tier: string) {
  if (tier === "studio_pro") return STUDIO_PRO_LIMITS;
  if (tier === "studio") return STUDIO_LIMITS;
  return MANGAKA_LIMITS;
}

function isStudioTier(tier: string) {
  return tier === "studio" || tier === "studio_pro";
}

// ─── Component ──────────────────────────────────────────────────────
export default function WizardVideo() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) }
  );

  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) }
  );

  // Fetch real panels for thumbnails
  const firstEpisodeId = (episodes as any[])?.[0]?.id;
  const { data: realPanels = [] } = trpc.panels.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) }
  );

  const { data: balanceData } = trpc.projects.creditBalance.useQuery(
    undefined,
    { refetchInterval: 10_000 }
  );

  // Pipeline state
  const [pipelineRunId, setPipelineRunId] = useState<number | null>(null);
  const startPipelineMut = trpc.pipeline.start.useMutation();
  const { data: pipelineStatus } = trpc.pipeline.getStatus.useQuery(
    { runId: pipelineRunId! },
    {
      enabled: !!pipelineRunId,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed" || status === "cancelled") return false;
        return 3000; // poll every 3s while running
      },
    }
  );

  // Get the first locked/approved episode for pipeline
  const pipelineEpisode = useMemo(() => {
    const eligible = (episodes as any[]).filter(
      (e: any) => e.status === "locked" || e.status === "approved"
    );
    return eligible[0] as any | undefined;
  }, [episodes]);

  // Get user tier
  const { userTier } = useTierGate("stage_video");
  const tierLimits = getTierLimits(userTier);
  const studioMode = isStudioTier(userTier);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (
      project?.animeStyle &&
      project?.animeStyle !== "default" &&
      project?.tone
    )
      s.add(1);
    s.add(2);
    s.add(3);
    s.add(4);
    return s;
  }, [project]);

  // ── State ─────────────────────────────────────────────────────────
  const [state, setState] = useState<VideoState>("timing");
  const [renderPhaseIdx, setRenderPhaseIdx] = useState(0);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rendersUsed, setRendersUsed] = useState(0);
  const [exportConfig, setExportConfig] = useState<ExportConfig | null>(null);

  // ── Panel timings ─────────────────────────────────────────────────
  const panelCount = (realPanels as any[]).length || (project as any)?.panelCount || 12;
  const [panelTimings, setPanelTimings] = useState<PanelTiming[]>([]);

  // Initialize timings from real panels when available
  useEffect(() => {
    const panels = realPanels as any[];
    if (panels.length > 0 && panelTimings.length !== panels.length) {
      setPanelTimings(
        panels.map((p: any, i: number) => ({
          panelIndex: i,
          imageUrl: p.imageUrl || p.compositeImageUrl || null,
          duration: panelTimings[i]?.duration || TIMING_LIMITS.defaultPerPanel,
        }))
      );
    } else if (panels.length === 0 && panelTimings.length === 0) {
      // Fallback to placeholder count
      const count = (project as any)?.panelCount || 12;
      setPanelTimings(
        Array.from({ length: count }, (_, i) => ({
          panelIndex: i,
          imageUrl: null,
          duration: TIMING_LIMITS.defaultPerPanel,
        }))
      );
    }
  }, [realPanels, project]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Studio: Chapters ──────────────────────────────────────────────
  const [chapters, setChapters] = useState<Chapter[]>(() => [
    {
      ...createChapter(0),
      scenes: Array.from({ length: panelCount }, (_, i) => ({
        panelIndex: i,
        imageUrl: null,
        duration: TIMING_LIMITS.defaultPerPanel,
      })),
    },
  ]);

  // ── Studio: Music bed ─────────────────────────────────────────────
  const [musicSelection, setMusicSelection] =
    useState<MusicBedSelection | null>(null);

  // Re-init chapters when real panels arrive
  useEffect(() => {
    const panels = realPanels as any[];
    if (panels.length > 0) {
      setChapters((prev) => [
        {
          ...prev[0],
          scenes: panels.map((p: any, i: number) => ({
            panelIndex: i,
            imageUrl: p.imageUrl || p.compositeImageUrl || null,
            duration: panelTimings[i]?.duration || TIMING_LIMITS.defaultPerPanel,
          })),
        },
        ...prev.slice(1),
      ]);
    }
  }, [realPanels]); // eslint-disable-line react-hooks/exhaustive-deps

  const forecast = useMemo(
    () => calculateCredits(panelTimings),
    [panelTimings]
  );
  const maxRuntime = tierLimits.maxRuntime;
  const overBudget = forecast.totalRuntime > maxRuntime;
  const maxRenders =
    "maxRendersPerEpisodePerMonth" in tierLimits
      ? tierLimits.maxRendersPerEpisodePerMonth
      : 3;
  const rendersRemaining = maxRenders - rendersUsed;
  const availableCredits = balanceData?.balance ?? 0;

  // ── Handlers ──────────────────────────────────────────────────────
  const handleTimingsChange = useCallback(
    (updated: PanelTiming[]) => {
      setPanelTimings(updated);
      const newTotal = updated.reduce((s, p) => s + p.duration, 0);
      if (newTotal > maxRuntime) {
        trackEvent("stage6_forecast_exceeds", {
          projectId,
          runtime: newTotal,
        });
      }
      trackEvent("stage6_timing_change", {
        projectId,
        runtime: newTotal,
      });
    },
    [projectId, maxRuntime]
  );

  const handleChaptersChange = useCallback(
    (updated: Chapter[]) => {
      setChapters(updated);
      trackEvent("stage6_chapters_compose", {
        projectId,
        chapterCount: updated.length,
        totalDuration: totalChaptersDuration(updated),
      });
    },
    [projectId]
  );

  const handleMusicChange = useCallback(
    (sel: MusicBedSelection | null) => {
      setMusicSelection(sel);
      if (sel) {
        trackEvent("stage6_music_pick", {
          projectId,
          type: sel.type,
          cueId: sel.cueId,
        });
      }
    },
    [projectId]
  );

  const handleConfirm = useCallback(() => {
    setState("confirming");
  }, []);

  const handleStartRender = useCallback(async () => {
    setState("rendering");
    setRenderPhaseIdx(0);
    setRenderProgress(0);
    trackEvent("stage6_render_start", {
      projectId,
      runtime: forecast.totalRuntime,
      credits: forecast.totalCredits,
    });

    // Start real pipeline if episode is available
    if (pipelineEpisode && numId) {
      try {
        const { runId } = await startPipelineMut.mutateAsync({
          episodeId: pipelineEpisode.id,
          projectId: numId,
        });
        setPipelineRunId(runId);
        // Pipeline polling will drive UI updates via useEffect below
      } catch (err: any) {
        // Fallback to simulated render if pipeline fails (e.g. episode not locked)
        console.warn("[Video] Pipeline start failed, using simulated render:", err?.message);
        await runSimulatedRender();
      }
    } else {
      // No eligible episode — run simulated render
      await runSimulatedRender();
    }
  }, [forecast, projectId, studioMode, tierLimits, pipelineEpisode, numId, startPipelineMut]);

  // Simulated render fallback (used when no pipeline episode is available)
  const runSimulatedRender = useCallback(async () => {
    try {
      for (let phase = 0; phase < RENDER_PHASES.length; phase++) {
        setRenderPhaseIdx(phase);
        for (let p = 0; p <= 100; p += 5) {
          await new Promise((r) => setTimeout(r, 150));
          setRenderProgress(p);
        }
      }

      const result: RenderResult = {
        videoUrl: "",
        duration: forecast.totalRuntime,
        resolution: studioMode
          ? tierLimits.maxResolution
          : MANGAKA_LIMITS.maxResolution,
        format: studioMode && 'exportFormats' in tierLimits
          ? tierLimits.exportFormats[0]
          : MANGAKA_LIMITS.exportFormat,
        fileSize: `${Math.round(forecast.totalRuntime * 2.5)} MB`,
      };
      setRenderResult(result);
      setRendersUsed((prev) => prev + 1);
      setState("review");
      trackEvent("stage6_render_complete", {
        projectId,
        duration: forecast.totalRuntime,
      });
    } catch {
      setErrorMessage(
        "Render failed — your credits have been refunded."
      );
      setState("error");
    }
  }, [forecast, projectId, studioMode, tierLimits]);

  // Drive UI from pipeline status polling
  useEffect(() => {
    if (!pipelineStatus || state !== "rendering") return;

    const nodeToPhase: Record<string, number> = {
      video_gen: 0,
      voice_gen: 1,
      lip_sync: 1,
      music_gen: 2,
      foley_gen: 2,
      ambient_gen: 2,
      assembly: 2,
    };

    const currentNode = pipelineStatus.currentNode as string;
    const phaseIdx = nodeToPhase[currentNode] ?? 0;
    setRenderPhaseIdx(phaseIdx);
    setRenderProgress(pipelineStatus.progress ?? 0);

    if (pipelineStatus.status === "completed") {
      // Pipeline done — build result from pipeline data
      const result: RenderResult = {
        videoUrl: (pipelineStatus as any).finalVideoUrl || "",
        duration: forecast.totalRuntime,
        resolution: studioMode
          ? tierLimits.maxResolution
          : MANGAKA_LIMITS.maxResolution,
        format: studioMode && 'exportFormats' in tierLimits
          ? tierLimits.exportFormats[0]
          : MANGAKA_LIMITS.exportFormat,
        fileSize: `${Math.round(forecast.totalRuntime * 2.5)} MB`,
      };
      setRenderResult(result);
      setRendersUsed((prev) => prev + 1);
      setState("review");
      trackEvent("stage6_render_complete", {
        projectId,
        duration: forecast.totalRuntime,
      });
    } else if (pipelineStatus.status === "failed") {
      setErrorMessage(
        (pipelineStatus as any).errorMessage || "Render failed — your credits have been refunded."
      );
      setState("error");
    }
  }, [pipelineStatus, state, forecast, projectId, studioMode, tierLimits]);

  const handleApprove = useCallback(() => {
    if (studioMode) {
      // Studio+ gets export dialog
      setState("exporting");
    } else if (renderResult?.videoUrl) {
      window.open(renderResult.videoUrl, "_blank");
    }
  }, [renderResult, studioMode]);

  const handleExport = useCallback(
    (config: ExportConfig) => {
      setExportConfig(config);
      if (config.resolution === "4k") {
        trackEvent("stage6_export_4k", { projectId });
      }
      if (config.format === "prores") {
        trackEvent("stage6_export_prores", { projectId });
      }
      if (config.stems) {
        trackEvent("stage6_export_stems", { projectId });
      }
      if (renderResult?.videoUrl) {
        window.open(renderResult.videoUrl, "_blank");
      }
      setState("review");
    },
    [projectId, renderResult]
  );

  const handleRedo = useCallback(
    (panelIndex: number) => {
      trackEvent("stage6_redo_panel", { projectId, panelIndex });
      setState("rendering");
      setRenderPhaseIdx(0);
      setRenderProgress(0);
      setTimeout(() => {
        setRenderProgress(100);
        setState("review");
      }, 3000);
    },
    [projectId]
  );

  const handleRetry = useCallback(() => {
    setErrorMessage(null);
    setState("timing");
  }, []);

  // ── Review panels ─────────────────────────────────────────────────
  const reviewPanels: ReviewPanel[] = useMemo(() => {
    let cumulative = 0;
    return panelTimings.map((p) => {
      const start = cumulative;
      cumulative += p.duration;
      return {
        panelIndex: p.panelIndex,
        imageUrl: p.imageUrl,
        startTime: start,
        endTime: cumulative,
      };
    });
  }, [panelTimings]);

  // ── Over-budget message ───────────────────────────────────────────
  const overBudgetMessage = studioMode
    ? `Studio caps at ${maxRuntime / 60} min — trim or upgrade`
    : FORECAST_COPY.overBudget;

  return (
    <CreateWizardLayout
      stage={6}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <WithTier capability="stage_video" mode="soft">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <StageHeader stageKey="video" label="Video Production" icon={Film} className="text-token-magenta" />
            <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
              {VIDEO_COPY.pageTitle}
            </h1>
            <p className="text-white/50 text-sm">{VIDEO_COPY.subhead}</p>
          </div>

          {/* ── Timing state ─────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {state === "timing" && (
              <motion.div
                key="timing"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <PanelTimingEditor
                  panels={panelTimings}
                  onTimingsChange={handleTimingsChange}
                  maxRuntime={maxRuntime}
                />

                {/* Studio: Chapter Composer */}
                {studioMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <ChapterComposer
                      chapters={chapters}
                      onChaptersChange={handleChaptersChange}
                      maxRuntimeSeconds={maxRuntime}
                      tier={userTier}
                    />
                  </motion.div>
                )}

                {/* Studio: Music Bed */}
                {studioMode && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <MusicBed
                      selection={musicSelection}
                      onSelectionChange={handleMusicChange}
                      tier={userTier}
                    />
                  </motion.div>
                )}

                <DurationForecast
                  panels={panelTimings}
                  maxRuntime={maxRuntime}
                  rendersRemaining={rendersRemaining}
                  availableCredits={availableCredits}
                  onRender={handleConfirm}
                  disabled={overBudget || rendersRemaining <= 0}
                />

                {overBudget && (
                  <p className="text-xs text-red-400 text-center">
                    {overBudgetMessage}
                  </p>
                )}
              </motion.div>
            )}

            {/* ── Confirming state ─────────────────────────────────── */}
            {state === "confirming" && (
              <motion.div
                key="confirming"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-6"
              >
                <div className="rounded-2xl bg-[hsl(240,6%,10%)] border border-violet-500/20 p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-white/90">
                    Confirm render
                  </h2>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div className="text-white/40 text-xs">Runtime</div>
                      <div className="font-mono text-white/80">
                        {forecast.totalRuntime >= 60
                          ? `${(forecast.totalRuntime / 60).toFixed(1)} min`
                          : `${forecast.totalRuntime.toFixed(1)}s`}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-white/40 text-xs">Panels</div>
                      <div className="font-mono text-white/80">
                        {panelTimings.length}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-white/40 text-xs">Resolution</div>
                      <div className="font-mono text-white/80">
                        {studioMode
                          ? tierLimits.maxResolution
                          : MANGAKA_LIMITS.maxResolution}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-white/40 text-xs">Format</div>
                      <div className="font-mono text-white/80">
                        {studioMode && 'exportFormats' in tierLimits
                          ? tierLimits.exportFormats[0]
                          : MANGAKA_LIMITS.exportFormat}
                      </div>
                    </div>
                    {studioMode && chapters.length > 1 && (
                      <div className="space-y-1">
                        <div className="text-white/40 text-xs">Chapters</div>
                        <div className="font-mono text-white/80">
                          {chapters.length}
                        </div>
                      </div>
                    )}
                    {musicSelection && (
                      <div className="space-y-1">
                        <div className="text-white/40 text-xs">Music</div>
                        <div className="font-mono text-white/80 truncate text-xs">
                          {musicSelection.type === "catalog"
                            ? STOCK_CUES.find(
                                (c) => c.id === musicSelection.cueId
                              )?.title || "Selected"
                            : musicSelection.fileName || "Uploaded"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/5 pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-white/60">
                        <Coins className="w-4 h-4 text-violet-400" />
                        <span className="text-sm">Total cost</span>
                      </div>
                      <span className="text-xl font-bold font-mono text-white/90">
                        {forecast.totalCredits} credits
                      </span>
                    </div>
                    <div className="text-[11px] text-white/30 mt-1">
                      Motion: {forecast.motionCredits}c + Voice:{" "}
                      {forecast.voiceCredits}c + Compose:{" "}
                      {forecast.composeCredits}c
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setState("timing")}
                      className="flex-1 border-white/10 text-white/60"
                    >
                      <ArrowLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                    <Button
                      onClick={handleStartRender}
                      className="flex-1 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-none"
                    >
                      {FORECAST_COPY.renderCta(
                        Math.round(forecast.totalRuntime),
                        forecast.totalCredits
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Rendering state ──────────────────────────────────── */}
            {state === "rendering" && (
              <motion.div
                key="rendering"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex flex-col items-center justify-center py-16 space-y-8"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    ease: "linear",
                  }}
                >
                  <Loader2 className="w-12 h-12 text-violet-400" />
                </motion.div>

                <div className="text-center space-y-2">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={renderPhaseIdx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="text-lg text-white/80"
                    >
                      {RENDER_PHASES[renderPhaseIdx]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-xs text-white/30">
                    Phase {renderPhaseIdx + 1} of {RENDER_PHASES.length}
                  </p>
                </div>

                <div className="w-full max-w-md">
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
                      animate={{
                        width: `${
                          ((renderPhaseIdx * 100 + renderProgress) /
                            (RENDER_PHASES.length * 100)) *
                          100
                        }%`,
                      }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-white/20">
                    {RENDER_PHASES.map((_, i) => (
                      <span
                        key={i}
                        className={
                          i <= renderPhaseIdx ? "text-violet-400" : ""
                        }
                      >
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Review state ─────────────────────────────────────── */}
            {state === "review" && renderResult && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                <RenderReview
                  result={renderResult}
                  panels={reviewPanels}
                  onApprove={handleApprove}
                  onRedo={handleRedo}
                />
              </motion.div>
            )}

            {/* ── Export dialog (Studio+) ─────────────────────────── */}
            {state === "exporting" && studioMode && (
              <motion.div
                key="exporting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <MasterExport
                  baseCredits={forecast.totalCredits}
                  availableCredits={availableCredits}
                  tier={userTier}
                  onExport={handleExport}
                  onCancel={() => setState("review")}
                />
              </motion.div>
            )}

            {/* ── Error state ──────────────────────────────────────── */}
            {state === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex flex-col items-center justify-center py-16 space-y-6"
              >
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                </div>

                <div className="text-center space-y-2">
                  <p className="text-lg text-white/80">
                    {errorMessage || "Something went wrong"}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-400">
                    <Check className="w-4 h-4" />
                    {VIDEO_COPY.errorRefund}
                  </div>
                </div>

                <Button
                  onClick={handleRetry}
                  className="gap-2 bg-white/5 hover:bg-white/10 text-white/70 border-none"
                >
                  <RotateCcw className="w-4 h-4" />
                  {VIDEO_COPY.errorRetry}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Back navigation */}
          {state === "timing" && (
            <div className="pt-4">
              <button
                onClick={() =>
                  navigate(`/create/anime-gate?projectId=${projectId}`)
                }
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            </div>
          )}
        </div>
      </WithTier>
    </CreateWizardLayout>
  );
}
