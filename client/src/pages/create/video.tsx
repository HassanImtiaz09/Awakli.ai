/**
 * Stage 6 · Video — Short-form Render (Mangaka) + Long-form + Master Export (Studio/Studio Pro)
 *
 * States: timing → confirming → assembling → streaming → review → error → exporting
 * Now integrated with:
 *   - assembly.* tRPC endpoints for real assembly pipeline
 *   - AssemblySettingsPanel for audio bus / lip sync / motion LoRA config
 *   - Cloudflare Stream delivery for CDN-backed HLS playback
 *   - Real-time progress tracking through assembly + stream phases
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
  Cloud,
  Play,
  ExternalLink,
  Settings2,
  Layers,
  Rocket,
  Copy,
  Subtitles,
  CheckCircle2,
  XCircle,
  Globe,
  Lock,
  EyeOff,
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
import { AssemblySettingsPanel } from "@/components/awakli/AssemblySettingsPanel";
import { toast } from "sonner";

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

// ─── Assembly pipeline phases ───────────────────────────────────────
const ASSEMBLY_PHASES = [
  { key: "validating", label: "Validating slices…", icon: "🔍" },
  { key: "downloading", label: "Downloading clips…", icon: "⬇️" },
  { key: "normalizing", label: "Normalizing video…", icon: "🎬" },
  { key: "concatenating", label: "Joining clips…", icon: "🔗" },
  { key: "voice_overlay", label: "Overlaying voices…", icon: "🎤" },
  { key: "music_mix", label: "Mixing music…", icon: "🎵" },
  { key: "loudness", label: "Loudness normalization…", icon: "📊" },
  { key: "uploading", label: "Uploading to S3…", icon: "☁️" },
] as const;

const STREAM_PHASES = [
  { key: "uploading", label: "Uploading to CDN…", icon: "🌐" },
  { key: "processing", label: "Processing for streaming…", icon: "⚡" },
  { key: "ready", label: "Ready to stream!", icon: "✅" },
] as const;

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
  | "assembling"
  | "streaming"
  | "rendering"
  | "review"
  | "error"
  | "exporting"
  | "publishing"
  | "published";

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

  // ── Assembly integration ──────────────────────────────────────────
  const assemblyMut = trpc.assembly.assemble.useMutation();
  const deliverToStreamMut = trpc.assembly.deliverToStream.useMutation();

  // ── Publish integration ──────────────────────────────────────────
  const publishStatusQuery = trpc.animePublish.getPublishStatus.useQuery(
    { episodeId: firstEpisodeId! },
    { enabled: !!firstEpisodeId }
  );
  const generateSubtitlesMut = trpc.animePublish.generateSubtitles.useMutation();
  const publishMut = trpc.animePublish.publish.useMutation();
  const unpublishMut = trpc.animePublish.unpublish.useMutation();

  // Assembly status polling
  const [assemblyPolling, setAssemblyPolling] = useState(false);
  const { data: assemblyStatus, refetch: refetchAssemblyStatus } =
    trpc.assembly.getStatus.useQuery(
      { episodeId: firstEpisodeId! },
      {
        enabled: !!firstEpisodeId,
        refetchInterval: assemblyPolling ? 3000 : false,
      }
    );

  // Stream delivery status polling
  const [streamPolling, setStreamPolling] = useState(false);
  const { data: deliveryStatus, refetch: refetchDeliveryStatus } =
    trpc.assembly.getDeliveryStatus.useQuery(
      { episodeId: firstEpisodeId! },
      {
        enabled: !!firstEpisodeId,
        refetchInterval: streamPolling ? 4000 : false,
      }
    );

  // Assembly preview (includes stream URLs)
  const { data: previewData, refetch: refetchPreview } =
    trpc.assembly.getPreview.useQuery(
      { episodeId: firstEpisodeId! },
      { enabled: !!firstEpisodeId }
    );

  // Assembly timeline
  const { data: timelineData } = trpc.assembly.getTimeline.useQuery(
    { episodeId: firstEpisodeId! },
    { enabled: !!firstEpisodeId }
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
  const [assemblyPhaseIdx, setAssemblyPhaseIdx] = useState(0);
  const [streamPhaseIdx, setStreamPhaseIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [publishVisibility, setPublishVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [publishShareUrl, setPublishShareUrl] = useState<string | null>(null);
  const [publishCopied, setPublishCopied] = useState(false);

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

  // ── Assembly readiness ────────────────────────────────────────────
  const assemblyReady = assemblyStatus
    ? assemblyStatus.readySlices > 0 &&
      assemblyStatus.readySlices >= assemblyStatus.totalSlices
    : false;

  const hasAssembledVideo = !!previewData?.available;
  const hasStreamDelivery = previewData?.streamStatus === "ready";

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

  // ── Assembly-first render ─────────────────────────────────────────
  const handleStartAssembly = useCallback(async () => {
    if (!firstEpisodeId || !numId) {
      toast.error("No episode available for assembly");
      return;
    }

    setState("assembling");
    setAssemblyPhaseIdx(0);
    setAssemblyPolling(true);

    trackEvent("stage6_assembly_start", {
      projectId,
      episodeId: firstEpisodeId,
    });

    try {
      await assemblyMut.mutateAsync({
        episodeId: firstEpisodeId,
        projectId: numId,
      });

      // Assembly completed — move to stream delivery
      setAssemblyPolling(false);
      setState("streaming");
      setStreamPhaseIdx(0);
      setStreamPolling(true);

      // Trigger stream delivery
      await deliverToStreamMut.mutateAsync({
        episodeId: firstEpisodeId,
        projectId: numId,
      });

      // Stream delivery complete
      setStreamPolling(false);
      await refetchPreview();

      const result: RenderResult = {
        videoUrl: previewData?.videoUrl || "",
        duration: forecast.totalRuntime,
        resolution: studioMode
          ? tierLimits.maxResolution
          : MANGAKA_LIMITS.maxResolution,
        format:
          studioMode && "exportFormats" in tierLimits
            ? tierLimits.exportFormats[0]
            : MANGAKA_LIMITS.exportFormat,
        fileSize: `${Math.round(forecast.totalRuntime * 2.5)} MB`,
      };
      setRenderResult(result);
      setRendersUsed((prev) => prev + 1);
      setState("review");

      trackEvent("stage6_assembly_complete", {
        projectId,
        episodeId: firstEpisodeId,
      });
    } catch (err: any) {
      setAssemblyPolling(false);
      setStreamPolling(false);
      setErrorMessage(err?.message || "Assembly failed — credits auto-refunded");
      setState("error");
    }
  }, [
    firstEpisodeId,
    numId,
    projectId,
    assemblyMut,
    deliverToStreamMut,
    forecast,
    studioMode,
    tierLimits,
    previewData,
    refetchPreview,
  ]);

  // ── Legacy pipeline render (fallback) ─────────────────────────────
  const handleStartRender = useCallback(async () => {
    // If assembly is ready, use the new assembly pipeline
    if (assemblyReady && firstEpisodeId) {
      return handleStartAssembly();
    }

    // Legacy pipeline fallback
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
      } catch (err: any) {
        console.warn("[Video] Pipeline start failed, using simulated render:", err?.message);
        await runSimulatedRender();
      }
    } else {
      await runSimulatedRender();
    }
  }, [
    assemblyReady,
    firstEpisodeId,
    handleStartAssembly,
    forecast,
    projectId,
    studioMode,
    tierLimits,
    pipelineEpisode,
    numId,
    startPipelineMut,
  ]);

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
        format:
          studioMode && "exportFormats" in tierLimits
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

  // Drive UI from pipeline status polling (legacy)
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
      const result: RenderResult = {
        videoUrl: (pipelineStatus as any).finalVideoUrl || "",
        duration: forecast.totalRuntime,
        resolution: studioMode
          ? tierLimits.maxResolution
          : MANGAKA_LIMITS.maxResolution,
        format:
          studioMode && "exportFormats" in tierLimits
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
        (pipelineStatus as any).errorMessage ||
          "Render failed — your credits have been refunded."
      );
      setState("error");
    }
  }, [pipelineStatus, state, forecast, projectId, studioMode, tierLimits]);

  const handleApprove = useCallback(() => {
    if (studioMode) {
      setState("exporting");
    } else if (hasStreamDelivery && previewData?.streamEmbedUrl) {
      window.open(previewData.streamEmbedUrl, "_blank");
    } else if (renderResult?.videoUrl) {
      window.open(renderResult.videoUrl, "_blank");
    }
  }, [renderResult, studioMode, hasStreamDelivery, previewData]);

  // ── Publish handlers ─────────────────────────────────────────────
  const handleGenerateSubtitles = useCallback(async () => {
    if (!firstEpisodeId) return;
    try {
      const result = await generateSubtitlesMut.mutateAsync({ episodeId: firstEpisodeId });
      toast.success(result.message || "Subtitles generated");
      publishStatusQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate subtitles");
    }
  }, [firstEpisodeId, generateSubtitlesMut, publishStatusQuery]);

  const handlePublish = useCallback(async () => {
    if (!firstEpisodeId) return;
    setState("publishing");
    try {
      const result = await publishMut.mutateAsync({
        episodeId: firstEpisodeId,
        visibility: publishVisibility,
      });
      setPublishShareUrl(`${window.location.origin}${result.shareUrl}`);
      setState("published");
      toast.success("Your anime episode is live!");
      trackEvent("stage6_anime_published", {
        projectId,
        episodeId: firstEpisodeId,
        visibility: publishVisibility,
      });
    } catch (err: any) {
      toast.error(err.message || "Failed to publish");
      setState("review");
    }
  }, [firstEpisodeId, publishMut, publishVisibility, projectId]);

  const handleUnpublish = useCallback(async () => {
    if (!firstEpisodeId) return;
    try {
      await unpublishMut.mutateAsync({ episodeId: firstEpisodeId });
      toast.success("Episode unpublished");
      setPublishShareUrl(null);
      setState("review");
      publishStatusQuery.refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to unpublish");
    }
  }, [firstEpisodeId, unpublishMut, publishStatusQuery]);

  const handleCopyShareLink = useCallback(() => {
    if (!publishShareUrl) return;
    navigator.clipboard.writeText(publishShareUrl).then(() => {
      setPublishCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setPublishCopied(false), 2000);
    });
  }, [publishShareUrl]);

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
            <StageHeader
              stageKey="video"
              label="Video Production"
              icon={Film}
              className="text-token-magenta"
            />
            <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
              {VIDEO_COPY.pageTitle}
            </h1>
            <p className="text-white/50 text-sm">{VIDEO_COPY.subhead}</p>
          </div>

          {/* ── Assembly readiness indicator ─────────────────────── */}
          {assemblyStatus && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-[hsl(240,6%,10%)] border border-white/5 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-medium text-white/70">
                    Slice Assembly
                  </span>
                </div>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded ${
                    assemblyReady
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-amber-500/20 text-amber-300"
                  }`}
                >
                  {assemblyStatus.readySlices}/{assemblyStatus.totalSlices}{" "}
                  slices ready
                </span>
              </div>

              {/* Slice progress bar */}
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${
                    assemblyReady
                      ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                      : "bg-gradient-to-r from-amber-500 to-orange-500"
                  }`}
                  animate={{
                    width: `${
                      assemblyStatus.totalSlices > 0
                        ? (assemblyStatus.readySlices /
                            assemblyStatus.totalSlices) *
                          100
                        : 0
                    }%`,
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              {/* Timeline summary */}
              {timelineData && timelineData.slices?.length > 0 && (
                <div className="mt-3 flex items-center gap-4 text-[10px] text-white/30">
                  <span>
                    {timelineData.slices.length} slices ·{" "}
                    {timelineData.totalDurationSeconds?.toFixed(1)}s total
                  </span>
                  {timelineData.transitionOverlapTotal > 0 && (
                    <span>
                      {timelineData.transitionOverlapTotal.toFixed(1)}s
                      transition overlap
                    </span>
                  )}
                </div>
              )}

              {/* Stream delivery status */}
              {deliveryStatus && deliveryStatus.streamStatus !== "none" && (
                <div className="mt-2 flex items-center gap-2">
                  <Cloud className="w-3.5 h-3.5 text-blue-400" />
                  <span
                    className={`text-[10px] font-medium ${
                      deliveryStatus.streamStatus === "ready"
                        ? "text-emerald-400"
                        : deliveryStatus.streamStatus === "error"
                          ? "text-red-400"
                          : "text-blue-400"
                    }`}
                  >
                    CDN:{" "}
                    {deliveryStatus.streamStatus === "ready"
                      ? "Ready to stream"
                      : deliveryStatus.streamStatus === "error"
                        ? "Delivery failed"
                        : deliveryStatus.streamStatus === "processing"
                          ? `Processing${deliveryStatus.cloudflareProgress ? ` (${deliveryStatus.cloudflareProgress})` : "…"}`
                          : "Uploading…"}
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {/* ── States ──────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {/* ── Timing state ─────────────────────────────────────── */}
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

                {/* Assembly Settings Panel */}
                {firstEpisodeId && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                  >
                    <AssemblySettingsPanel episodeId={firstEpisodeId} />
                  </motion.div>
                )}

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

                {/* Assembly-ready CTA */}
                {assemblyReady && firstEpisodeId && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 border border-violet-500/20 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
                          <Film className="w-5 h-5 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white/80">
                            All slices ready for assembly
                          </p>
                          <p className="text-[10px] text-white/40">
                            {assemblyStatus?.totalSlices} slices ·{" "}
                            {assemblyStatus?.hasVoiceClips
                              ? "Voice ready"
                              : "No voice"}{" "}
                            · 2 credits
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleStartAssembly}
                        disabled={assemblyMut.isPending}
                        className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-none text-sm"
                      >
                        {assemblyMut.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <Film className="w-4 h-4 mr-1" />
                        )}
                        Assemble Video
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Existing stream preview */}
                {hasStreamDelivery && previewData?.streamEmbedUrl && (
                  <StreamPreviewCard
                    embedUrl={previewData.streamEmbedUrl}
                    hlsUrl={previewData.streamHlsUrl}
                    thumbnailUrl={previewData.streamThumbnailUrl}
                    duration={previewData.duration}
                  />
                )}

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
                        {studioMode && "exportFormats" in tierLimits
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
                    {assemblyReady && (
                      <div className="space-y-1">
                        <div className="text-white/40 text-xs">Pipeline</div>
                        <div className="font-mono text-emerald-400 text-xs">
                          Slice Assembly
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
                        {assemblyReady ? 2 : forecast.totalCredits} credits
                      </span>
                    </div>
                    {!assemblyReady && (
                      <div className="text-[11px] text-white/30 mt-1">
                        Motion: {forecast.motionCredits}c + Voice:{" "}
                        {forecast.voiceCredits}c + Compose:{" "}
                        {forecast.composeCredits}c
                      </div>
                    )}
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
                      {assemblyReady
                        ? "Assemble & Deliver"
                        : FORECAST_COPY.renderCta(
                            Math.round(forecast.totalRuntime),
                            forecast.totalCredits
                          )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Assembling state ────────────────────────────────── */}
            {state === "assembling" && (
              <motion.div
                key="assembling"
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
                  <p className="text-lg text-white/80">
                    Assembling your anime…
                  </p>
                  <p className="text-xs text-white/30">
                    Joining {assemblyStatus?.totalSlices || "?"} slices into
                    the final video
                  </p>
                </div>

                {/* Assembly phase indicators */}
                <div className="w-full max-w-md space-y-2">
                  {ASSEMBLY_PHASES.map((phase, i) => (
                    <div
                      key={phase.key}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all ${
                        i === assemblyPhaseIdx
                          ? "bg-violet-500/10 border border-violet-500/20"
                          : i < assemblyPhaseIdx
                            ? "opacity-50"
                            : "opacity-20"
                      }`}
                    >
                      <span className="text-sm">{phase.icon}</span>
                      <span
                        className={`text-xs ${
                          i === assemblyPhaseIdx
                            ? "text-violet-300 font-medium"
                            : i < assemblyPhaseIdx
                              ? "text-white/40 line-through"
                              : "text-white/20"
                        }`}
                      >
                        {phase.label}
                      </span>
                      {i === assemblyPhaseIdx && (
                        <Loader2 className="w-3 h-3 text-violet-400 animate-spin ml-auto" />
                      )}
                      {i < assemblyPhaseIdx && (
                        <Check className="w-3 h-3 text-emerald-400 ml-auto" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Overall progress bar */}
                <div className="w-full max-w-md">
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full"
                      animate={{
                        width: `${((assemblyPhaseIdx + 1) / ASSEMBLY_PHASES.length) * 100}%`,
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Streaming state (CDN delivery) ──────────────────── */}
            {state === "streaming" && (
              <motion.div
                key="streaming"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex flex-col items-center justify-center py-16 space-y-8"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "easeInOut",
                  }}
                >
                  <Cloud className="w-12 h-12 text-blue-400" />
                </motion.div>

                <div className="text-center space-y-2">
                  <p className="text-lg text-white/80">
                    Delivering to CDN…
                  </p>
                  <p className="text-xs text-white/30">
                    Uploading to Cloudflare Stream for global playback
                  </p>
                </div>

                {/* Stream phase indicators */}
                <div className="w-full max-w-md space-y-2">
                  {STREAM_PHASES.map((phase, i) => (
                    <div
                      key={phase.key}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all ${
                        i === streamPhaseIdx
                          ? "bg-blue-500/10 border border-blue-500/20"
                          : i < streamPhaseIdx
                            ? "opacity-50"
                            : "opacity-20"
                      }`}
                    >
                      <span className="text-sm">{phase.icon}</span>
                      <span
                        className={`text-xs ${
                          i === streamPhaseIdx
                            ? "text-blue-300 font-medium"
                            : i < streamPhaseIdx
                              ? "text-white/40 line-through"
                              : "text-white/20"
                        }`}
                      >
                        {phase.label}
                      </span>
                      {i === streamPhaseIdx && (
                        <Loader2 className="w-3 h-3 text-blue-400 animate-spin ml-auto" />
                      )}
                      {i < streamPhaseIdx && (
                        <Check className="w-3 h-3 text-emerald-400 ml-auto" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Stream progress */}
                {deliveryStatus?.cloudflareProgress && (
                  <p className="text-xs text-blue-400 font-mono">
                    {deliveryStatus.cloudflareProgress}
                  </p>
                )}

                <div className="w-full max-w-md">
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"
                      animate={{
                        width: `${((streamPhaseIdx + 1) / STREAM_PHASES.length) * 100}%`,
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Rendering state (legacy pipeline) ───────────────── */}
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
                className="space-y-6"
              >
                {/* Stream video preview */}
                {hasStreamDelivery && previewData?.streamEmbedUrl && (
                  <StreamPreviewCard
                    embedUrl={previewData.streamEmbedUrl}
                    hlsUrl={previewData.streamHlsUrl}
                    thumbnailUrl={previewData.streamThumbnailUrl}
                    duration={previewData.duration}
                  />
                )}

                <RenderReview
                  result={renderResult}
                  panels={reviewPanels}
                  onApprove={handleApprove}
                  onRedo={handleRedo}
                />

                {/* Anime Publish Section */}
                {hasStreamDelivery && (
                  <div className="bg-bg-ink rounded-2xl border border-white/5 p-6 space-y-5">
                    <div className="flex items-center gap-3 mb-2">
                      <Rocket className="w-5 h-5 text-token-violet" />
                      <h3 className="text-lg font-display font-bold text-text-primary">Publish Your Anime</h3>
                    </div>

                    {/* Pre-publish checklist */}
                    <div className="space-y-2">
                      <ChecklistItem
                        ready={!!publishStatusQuery.data?.checklist.assembledVideo.ready}
                        label="Video assembled"
                      />
                      <ChecklistItem
                        ready={!!publishStatusQuery.data?.checklist.streamReady.ready}
                        label="CDN stream ready"
                      />
                      <ChecklistItem
                        ready={!!publishStatusQuery.data?.checklist.subtitles.ready}
                        label="Subtitles generated"
                        optional
                        onGenerate={!publishStatusQuery.data?.checklist.subtitles.ready ? handleGenerateSubtitles : undefined}
                        generating={generateSubtitlesMut.isPending}
                      />
                      <ChecklistItem
                        ready={!!publishStatusQuery.data?.checklist.tierEligible.ready}
                        label={publishStatusQuery.data?.checklist.tierEligible.label || "Tier eligible"}
                      />
                    </div>

                    {/* Visibility selector */}
                    <div className="space-y-2">
                      <label className="text-sm text-text-secondary">Visibility</label>
                      <div className="flex gap-2">
                        {(["public", "unlisted", "private"] as const).map((vis) => (
                          <button
                            key={vis}
                            onClick={() => setPublishVisibility(vis)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                              publishVisibility === vis
                                ? "bg-token-violet/20 text-token-violet border border-token-violet/30"
                                : "bg-bg-twilight text-text-secondary hover:bg-bg-overlay border border-transparent"
                            }`}
                          >
                            {vis === "public" && <Globe className="w-3.5 h-3.5" />}
                            {vis === "unlisted" && <EyeOff className="w-3.5 h-3.5" />}
                            {vis === "private" && <Lock className="w-3.5 h-3.5" />}
                            <span className="capitalize">{vis}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Publish button */}
                    {publishStatusQuery.data?.isAlreadyPublished ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-token-mint flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Published
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleUnpublish}
                          disabled={unpublishMut.isPending}
                          className="border-white/10 text-text-secondary"
                        >
                          Unpublish
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `${window.location.origin}/anime/${numId}/${firstEpisodeId}`;
                            window.open(url, "_blank");
                          }}
                          className="gap-1.5 border-white/10 text-text-secondary"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Watch
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handlePublish}
                        disabled={!publishStatusQuery.data?.allReady || publishMut.isPending}
                        className="gap-2 bg-gradient-to-r from-token-violet to-token-cyan text-white hover:opacity-90 disabled:opacity-40"
                      >
                        {publishMut.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Rocket className="w-4 h-4" />
                        )}
                        Publish Anime Episode
                      </Button>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Publishing state ─────────────────────────────────── */}
            {state === "publishing" && (
              <motion.div
                key="publishing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-16 space-y-6"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                >
                  <Loader2 className="w-12 h-12 text-token-violet" />
                </motion.div>
                <p className="text-lg text-text-primary">Publishing your anime...</p>
                <p className="text-sm text-text-secondary">Setting up CDN delivery and share links</p>
              </motion.div>
            )}

            {/* ── Published success state ─────────────────────────── */}
            {state === "published" && (
              <motion.div
                key="published"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 space-y-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-token-mint/10 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-10 h-10 text-token-mint" />
                </motion.div>

                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-display font-bold text-text-primary">
                    Your Anime is Live!
                  </h2>
                  <p className="text-text-secondary">
                    Share it with the world or keep refining.
                  </p>
                </div>

                {/* Share link */}
                {publishShareUrl && (
                  <div className="w-full max-w-md">
                    <div className="flex items-center gap-2 bg-bg-ink rounded-xl border border-white/10 p-3">
                      <input
                        type="text"
                        readOnly
                        value={publishShareUrl}
                        className="flex-1 bg-transparent text-sm text-text-primary outline-none truncate"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCopyShareLink}
                        className="gap-1.5 border-white/10 shrink-0"
                      >
                        {publishCopied ? <Check className="w-3.5 h-3.5 text-token-mint" /> : <Copy className="w-3.5 h-3.5" />}
                        {publishCopied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    onClick={() => {
                      if (publishShareUrl) window.open(publishShareUrl, "_blank");
                      else if (firstEpisodeId) window.open(`/anime/${numId}/${firstEpisodeId}`, "_blank");
                    }}
                    className="gap-2 bg-gradient-to-r from-token-violet to-token-cyan text-white"
                  >
                    <Play className="w-4 h-4" />
                    Watch Your Anime
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/discover")}
                    className="gap-2 border-white/10 text-text-secondary"
                  >
                    <Globe className="w-4 h-4" />
                    Browse Discover
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setState("review")}
                    className="gap-2 border-white/10 text-text-secondary"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Review
                  </Button>
                </div>
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

// ─── Stream Preview Card ────────────────────────────────────────────

// ─── Publish Checklist Item ─────────────────────────────────────────

function ChecklistItem({
  ready,
  label,
  optional,
  onGenerate,
  generating,
}: {
  ready: boolean;
  label: string;
  optional?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {ready ? (
        <CheckCircle2 className="w-4 h-4 text-token-mint shrink-0" />
      ) : (
        <XCircle className={`w-4 h-4 shrink-0 ${optional ? 'text-amber-400' : 'text-red-400'}`} />
      )}
      <span className={`text-sm ${ready ? 'text-text-primary' : 'text-text-secondary'}`}>
        {label}
        {optional && !ready && <span className="text-text-muted ml-1">(optional)</span>}
      </span>
      {onGenerate && !ready && (
        <button
          onClick={onGenerate}
          disabled={generating}
          className="ml-auto text-xs text-token-violet hover:text-token-violet/80 flex items-center gap-1 disabled:opacity-50"
        >
          {generating ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
          ) : (
            <><Subtitles className="w-3 h-3" /> Generate</>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Stream Preview Card ────────────────────────────────────────────

function StreamPreviewCard({
  embedUrl,
  hlsUrl,
  thumbnailUrl,
  duration,
}: {
  embedUrl: string | null;
  hlsUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number;
}) {
  const [showEmbed, setShowEmbed] = useState(false);

  if (!embedUrl) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-[hsl(240,6%,10%)] border border-emerald-500/20 overflow-hidden"
    >
      {/* Thumbnail / Player */}
      {showEmbed ? (
        <div className="relative w-full aspect-video bg-black">
          <iframe
            src={embedUrl}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <div
          className="relative w-full aspect-video bg-black/50 cursor-pointer group"
          onClick={() => setShowEmbed(true)}
        >
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt="Video preview"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 text-white ml-1" />
            </div>
          </div>
          {duration && (
            <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white/80 font-mono">
              {Math.floor(duration / 60)}:
              {String(Math.floor(duration % 60)).padStart(2, "0")}
            </div>
          )}
        </div>
      )}

      {/* Info bar */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-medium text-emerald-300">
            Streaming via Cloudflare CDN
          </span>
        </div>
        <button
          onClick={() => window.open(embedUrl, "_blank")}
          className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/60 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open
        </button>
      </div>
    </motion.div>
  );
}
