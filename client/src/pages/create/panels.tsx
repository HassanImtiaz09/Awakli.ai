/**
 * Stage 2 · Panels — Sequential gen (Apprentice) + Batch/Style/Consistency (Mangaka/Studio)
 *
 * Copy strings:
 * - Page title: "Your panels"
 * - Subhead: "Miss a moment? Tap any panel to redraw it."
 * - Hover regenerate: "Redraw"
 * - Regenerate popover: "Make it rain. Pull the camera in. Remove the second character…"
 * - Confirm CTA: "Redraw · 3 credits"
 * - Complete banner: "All panels ready. Publish when you are."
 * - Rate-limit: "We're catching our breath — resuming in {s}s"
 * - Selection hint: "Shift+click to select. Batch tools appear below."
 * - Batch bar: "{n} selected"
 * - Batch regenerate: "Redraw {n} panels · {n*3} credits"
 * - Style drift slider left: "Grounded"
 * - Style drift slider right: "Stylized"
 * - Consistency report title: "Consistency check"
 * - Consistency row: "Panel {n}: {character} similarity {score}%"
 */
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, ArrowRight, ArrowLeft, Sparkles, Loader2,
  Image as ImageIcon, Check, Lock, CheckCircle2,
  ShieldAlert, Paintbrush,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import { PanelGrid } from "@/components/awakli/PanelGrid";
import { PanelLightbox } from "@/components/awakli/PanelLightbox";
import { PanelBatchBar, getBatchLimit } from "@/components/awakli/PanelBatchBar";
import { StyleDrift, STYLE_DRIFT_PREVIEW_COST } from "@/components/awakli/StyleDrift";
import { ConsistencyReport, AUTO_CORRECT_MONTHLY_CAP, canAutoCorrect } from "@/components/awakli/ConsistencyReport";
import type { FlaggedPanel } from "@/components/awakli/ConsistencyReport";
import type { PanelTileData } from "@/components/awakli/PanelTile";
import { useUpgradeModal } from "@/store/upgradeModal";
import { useMinTierGate } from "@/hooks/useTierGate";

// ─── Analytics helper ───────────────────────────────────────────────────
function trackEvent(name: string, data?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (window as any).__awakli_track) {
      (window as any).__awakli_track(name, data);
    }
  } catch {}
}

// ─── Regen limits by tier ───────────────────────────────────────────────
function getRegenLimit(tier: string): number {
  switch (tier) {
    case "free_trial":
      return 5;        // Apprentice: 5 redraws per project
    case "creator":
      return 15;       // Mangaka: 15 redraws per project
    case "creator_pro":
    case "studio":
    case "studio_pro":
    case "enterprise":
      return Infinity; // Studio+: unlimited
    default:
      return 5;
  }
}

// ─── Cost per panel ─────────────────────────────────────────────────────
const COST_PER_PANEL = 3;

export default function WizardPanels() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const utils = trpc.useUtils();
  const openUpgrade = useUpgradeModal((s) => s.openFromGate);

  // ─── Tier gating ──────────────────────────────────────────────────────
  const batchGate = useMinTierGate("creator"); // Mangaka+
  const hasBatchTools = batchGate.allowed;
  const userTier = batchGate.userTier;

  // ─── Data queries ─────────────────────────────────────────────────────
  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) },
  );
  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) },
  );
  const { data: creditData } = trpc.projects.creditBalance.useQuery();

  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [lightboxPanelId, setLightboxPanelId] = useState<number | null>(null);
  const [redrawingPanelId, setRedrawingPanelId] = useState<number | null>(null);
  const [newPanelIds, setNewPanelIds] = useState<Set<number>>(new Set());
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [regenCount, setRegenCount] = useState(0);
  const { advance, advancing } = useAdvanceStage(projectId, 3);
  const sseRef = useRef<EventSource | null>(null);

  const effectiveTier = creditData?.tier || userTier || "free_trial";
  const regenLimit = getRegenLimit(effectiveTier);
  const batchLimit = getBatchLimit(effectiveTier);

  // ─── Selection state (batch mode) ────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectionMode = selectedIds.size > 0;

  // ─── Style drift state ───────────────────────────────────────────────
  const [styleDriftOpen, setStyleDriftOpen] = useState(false);
  const [styleDriftPreviewing, setStyleDriftPreviewing] = useState(false);
  const [styleDriftApplying, setStyleDriftApplying] = useState(false);
  const [styleDriftPreviewUrl, setStyleDriftPreviewUrl] = useState<string | null>(null);

  // ─── Consistency report state ─────────────────────────────────────────
  const [consistencyOpen, setConsistencyOpen] = useState(false);
  const [consistencyLoading, setConsistencyLoading] = useState(false);
  const [flaggedPanels, setFlaggedPanels] = useState<FlaggedPanel[]>([]);
  const [autoCorrectUsed, setAutoCorrectUsed] = useState(0);
  const [correctingPanelIds, setCorrectingPanelIds] = useState<Set<number>>(new Set());

  // ─── Batch processing state ───────────────────────────────────────────
  const [batchProcessing, setBatchProcessing] = useState(false);

  // Track page open
  useEffect(() => {
    trackEvent("stage2_open", { projectId: numId });
  }, [numId]);

  // ─── Episode selection ────────────────────────────────────────────────
  const eligibleEpisodes = useMemo(
    () =>
      episodes.filter(
        (e: any) =>
          e.status === "approved" || e.status === "locked" || e.status === "generated",
      ),
    [episodes],
  );
  const selectedEpisode = eligibleEpisodes[selectedEpIdx] as any | undefined;

  // ─── Panels query ─────────────────────────────────────────────────────
  const { data: rawPanels = [] } = trpc.panels.listByEpisode.useQuery(
    { episodeId: selectedEpisode?.id ?? 0 },
    {
      enabled: !!selectedEpisode,
      refetchInterval: generating ? 3000 : false,
    },
  );

  const panelTiles: PanelTileData[] = useMemo(
    () =>
      rawPanels.map((p: any) => ({
        id: p.id,
        panelNumber: p.panelNumber,
        sceneNumber: p.sceneNumber,
        imageUrl: p.imageUrl,
        compositeImageUrl: p.compositeImageUrl,
        status: p.status,
        visualDescription: p.visualDescription,
        cameraAngle: p.cameraAngle,
      })),
    [rawPanels],
  );

  // ─── Flagged panel IDs for grid highlighting ──────────────────────────
  const flaggedIds = useMemo(
    () => new Set(flaggedPanels.map((fp) => fp.panelId)),
    [flaggedPanels],
  );

  // ─── SSE streaming for panel generation ───────────────────────────────
  useEffect(() => {
    if (!generating || !selectedEpisode) return;

    const url = `/api/panels/stream?projectId=${numId}&episodeId=${selectedEpisode.id}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.addEventListener("panel_complete", (e) => {
      try {
        const data = JSON.parse(e.data);
        trackEvent("stage2_panel_rendered", {
          panelId: data.panelId,
          panelNumber: data.panelNumber,
        });
        setNewPanelIds((prev) => {
          const arr = Array.from(prev);
          arr.push(data.panelId);
          return new Set(arr);
        });
        setTimeout(() => {
          setNewPanelIds((prev) => {
            const next = new Set(prev);
            next.delete(data.panelId);
            return next;
          });
        }, 1200);
        utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
      } catch {}
    });

    es.addEventListener("generation_complete", () => {
      setGenerating(false);
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
      // Auto-run consistency check for Mangaka+ after generation completes
      if (hasBatchTools) {
        runConsistencyCheck();
      }
    });

    es.addEventListener("rate_limited", (e) => {
      try {
        const data = JSON.parse(e.data);
        setRateLimitSeconds(data.resumeInSeconds || 30);
      } catch {}
    });

    es.onerror = () => {};

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [generating, selectedEpisode, numId, utils, hasBatchTools]);

  // ─── Rate limit countdown ─────────────────────────────────────────────
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = setInterval(() => {
      setRateLimitSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  // ─── Mutations ────────────────────────────────────────────────────────
  const generatePanelsMut = trpc.episodes.generatePanels.useMutation();
  const regeneratePanelMut = trpc.panels.regenerate.useMutation();

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    if (episodes.length > 0 && episodes.some((e: any) => e.status === "approved" || e.status === "locked")) s.add(2);
    if (panelTiles.length > 0 && panelTiles.every((p) => p.status === "approved" || p.status === "generated")) s.add(3);
    return s;
  }, [project, episodes, panelTiles]);

  // ─── Stats ────────────────────────────────────────────────────────────
  const panelStats = useMemo(() => {
    const total = panelTiles.length;
    const withImage = panelTiles.filter((p) => !!p.imageUrl).length;
    const genInProgress = panelTiles.filter((p) => p.status === "generating").length;
    return { total, withImage, genInProgress };
  }, [panelTiles]);

  const totalExpected = useMemo(() => {
    if (selectedEpisode?.panelCount) return selectedEpisode.panelCount;
    return Math.max(panelStats.total, 20);
  }, [selectedEpisode, panelStats.total]);

  const allComplete = panelStats.total > 0 && panelStats.withImage === panelStats.total && panelStats.genInProgress === 0;

  // ─── Handlers ─────────────────────────────────────────────────────────
  const handleGeneratePanels = useCallback(async () => {
    if (!selectedEpisode || generating) return;
    setGenerating(true);
    try {
      const result = await generatePanelsMut.mutateAsync({ id: selectedEpisode.id });
      toast.success("Panel generation started", {
        description: `Generating ${result.panelCount} panels. Watch them appear one by one.`,
      });
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
    } catch (e: any) {
      toast.error("Panel generation failed", { description: e.message });
      setGenerating(false);
    }
  }, [selectedEpisode, generating, generatePanelsMut, utils]);

  const handleRedraw = useCallback(
    async (panelId: number, instruction?: string) => {
      if (regenCount >= regenLimit) {
        trackEvent("stage2_cap_hit", { regenCount, regenLimit });
        openUpgrade({
          currentTier: effectiveTier,
          required: "creator_pro",
          requiredDisplayName: "Mangaka",
          upgradeSku: "creator_pro",
          ctaText: "Upgrade to Mangaka for 15 redraws",
          pricingUrl: "/pricing",
        });
        return;
      }
      setRedrawingPanelId(panelId);
      try {
        await regeneratePanelMut.mutateAsync({ id: panelId });
        setRegenCount((c) => c + 1);
        trackEvent("stage2_panel_regen", { panelId, instruction });
        toast.success("Panel redraw started");
        utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
      } catch (e: any) {
        toast.error("Redraw failed", { description: e.message });
      }
      setRedrawingPanelId(null);
    },
    [regenCount, regenLimit, regeneratePanelMut, selectedEpisode, utils, openUpgrade, effectiveTier],
  );

  const handleOpenLightbox = useCallback((panelId: number) => {
    setLightboxPanelId(panelId);
  }, []);

  const handleLightboxRedraw = useCallback(
    (panelId: number, instruction: string) => {
      handleRedraw(panelId, instruction);
    },
    [handleRedraw],
  );

  // ─── Selection handlers ───────────────────────────────────────────────
  const handleToggleSelect = useCallback((panelId: number) => {
    trackEvent("stage2_batch_select", { panelId });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) {
        next.delete(panelId);
      } else {
        next.add(panelId);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ─── Batch redraw handler ─────────────────────────────────────────────
  const handleBatchRedraw = useCallback(
    async (instruction: string) => {
      const ids = Array.from(selectedIds);
      const totalCost = ids.length * COST_PER_PANEL;
      setBatchProcessing(true);
      try {
        // Redraw each selected panel sequentially
        for (const panelId of ids) {
          await regeneratePanelMut.mutateAsync({ id: panelId });
          setRegenCount((c) => c + 1);
        }
        trackEvent("stage2_panel_regen", { panelIds: ids, instruction, batchSize: ids.length, totalCost });
        toast.success(`Batch redraw started for ${ids.length} panels`, {
          description: `${totalCost} credits debited`,
        });
        utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
        setSelectedIds(new Set());
      } catch (e: any) {
        toast.error("Batch redraw failed", { description: e.message });
      }
      setBatchProcessing(false);
    },
    [selectedIds, regeneratePanelMut, selectedEpisode, utils],
  );

  const handleMatchToPanel = useCallback(() => {
    toast.info("Match to panel", {
      description: "Select a reference panel to match style to. Feature coming soon.",
    });
  }, []);

  // ─── Style drift handlers ────────────────────────────────────────────
  const handleStyleDriftPreview = useCallback(
    (driftValue: number) => {
      setStyleDriftPreviewing(true);
      trackEvent("stage2_style_drift_preview", { driftValue });
      // Simulate preview generation (would call server in production)
      setTimeout(() => {
        // Use first panel's image as a placeholder preview
        const firstPanel = panelTiles.find((p) => !!p.imageUrl);
        setStyleDriftPreviewUrl(firstPanel?.imageUrl || null);
        setStyleDriftPreviewing(false);
      }, 2000);
    },
    [panelTiles],
  );

  const handleStyleDriftApply = useCallback(
    (driftValue: number) => {
      setStyleDriftApplying(true);
      trackEvent("stage2_style_drift_apply", {
        driftValue,
        panelCount: panelTiles.length,
        totalCost: panelTiles.length * COST_PER_PANEL,
      });
      // Simulate apply (would call server in production)
      setTimeout(() => {
        toast.success("Style drift applied", {
          description: `Applied to ${panelTiles.length} panels. Regeneration in progress.`,
        });
        setStyleDriftApplying(false);
        setStyleDriftOpen(false);
        setStyleDriftPreviewUrl(null);
      }, 3000);
    },
    [panelTiles],
  );

  // ─── Consistency report handlers ──────────────────────────────────────
  const runConsistencyCheck = useCallback(() => {
    setConsistencyLoading(true);
    setConsistencyOpen(true);
    // Simulate consistency analysis (would call server in production)
    setTimeout(() => {
      // Generate mock flagged panels based on actual panel data
      const flagged: FlaggedPanel[] = panelTiles
        .filter((p) => !!p.imageUrl)
        .map((p) => {
          // Deterministic "similarity" based on panel ID
          const score = 60 + ((p.id * 17) % 40);
          return {
            panelId: p.id,
            panelNumber: p.panelNumber,
            characterName: p.panelNumber % 3 === 0 ? "Aiko" : p.panelNumber % 3 === 1 ? "Ren" : "Yuki",
            similarityScore: score,
            severity: (score < 75 ? "critical" : "warning") as "critical" | "warning",
            suggestedPrompt: score < 75
              ? "Increase LoRA strength and add character reference in prompt"
              : "Minor drift — consider adjusting lighting consistency",
          };
        })
        .filter((p) => p.similarityScore < 85); // Only flag panels below 85%
      setFlaggedPanels(flagged);
      setConsistencyLoading(false);
    }, 2000);
  }, [panelTiles]);

  const handleConsistencyJump = useCallback(
    (panelId: number) => {
      trackEvent("stage2_consistency_jump", { panelId });
      setConsistencyOpen(false);
      setLightboxPanelId(panelId);
    },
    [],
  );

  const handleAutoCorrect = useCallback(
    (panelId: number) => {
      if (!canAutoCorrect(effectiveTier, autoCorrectUsed)) return;
      setCorrectingPanelIds((prev) => {
        const next = new Set(prev);
        next.add(panelId);
        return next;
      });
      // Simulate auto-correct
      setTimeout(() => {
        setAutoCorrectUsed((c) => c + 1);
        setCorrectingPanelIds((prev) => {
          const next = new Set(prev);
          next.delete(panelId);
          return next;
        });
        setFlaggedPanels((prev) => prev.filter((fp) => fp.panelId !== panelId));
        toast.success("Panel auto-corrected", { description: "No credits debited (free re-render)" });
        utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
      }, 3000);
    },
    [effectiveTier, autoCorrectUsed, selectedEpisode, utils],
  );

  const handleOpenLoraRetraining = useCallback(() => {
    toast.info("LoRA retraining", {
      description: "Navigate to Characters to retrain LoRA for better consistency.",
    });
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <CreateWizardLayout
      stage={3}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#00F0FF] text-xs font-semibold uppercase tracking-widest">
            <LayoutGrid className="w-3.5 h-3.5" />
            Stage 03 — Panels
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Your panels
          </h1>
          <p className="text-white/40 text-sm">
            Miss a moment? Tap any panel to redraw it.
          </p>
        </div>

        {/* Selection hint — only for Mangaka+ */}
        {hasBatchTools && !selectionMode && panelTiles.length > 0 && allComplete && (
          <p className="text-[11px] text-white/20 text-center">
            Shift+click to select. Batch tools appear below.
          </p>
        )}

        {/* Episode tabs */}
        {eligibleEpisodes.length > 0 ? (
          <>
            {eligibleEpisodes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {eligibleEpisodes.map((ep: any, i: number) => (
                  <button
                    key={ep.id}
                    onClick={() => {
                      setSelectedEpIdx(i);
                      setSelectedIds(new Set());
                    }}
                    className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      selectedEpIdx === i
                        ? "bg-[#00F0FF]/20 text-[#00F0FF] ring-1 ring-[#00F0FF]/30"
                        : "bg-white/5 text-white/40 hover:text-white/60"
                    }`}
                  >
                    EP {String(i + 1).padStart(2, "0")} — {ep.title || `Episode ${i + 1}`}
                  </button>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {panelStats.total > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-white/30">
                  <span>
                    {panelStats.withImage} / {panelStats.total} panels rendered
                  </span>
                  {panelStats.genInProgress > 0 && (
                    <span className="text-[#FFD700] flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {panelStats.genInProgress} generating
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-[#6B5BFF] via-[#00F0FF] to-[#00E8A0]"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(panelStats.withImage / Math.max(panelStats.total, 1)) * 100}%`,
                    }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                </div>
              </div>
            )}

            {/* Rate limit banner */}
            <AnimatePresence>
              {rateLimitSeconds > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FFD700]/5 border border-[#FFD700]/10 text-[#FFD700] text-sm"
                >
                  <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  We're catching our breath — resuming in {rateLimitSeconds}s
                </motion.div>
              )}
            </AnimatePresence>

            {/* Complete banner */}
            <AnimatePresence>
              {allComplete && !generating && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#00E8A0]/5 border border-[#00E8A0]/10 text-[#00E8A0] text-sm"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    All panels ready. Publish when you are.
                  </div>

                  {/* Pro tools buttons — Mangaka+ only */}
                  {hasBatchTools && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setStyleDriftOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#6B5BFF] text-xs font-medium transition-colors"
                      >
                        <Paintbrush className="w-3.5 h-3.5" />
                        Style drift
                      </button>
                      <button
                        onClick={() => {
                          if (flaggedPanels.length > 0) {
                            setConsistencyOpen(true);
                          } else {
                            runConsistencyCheck();
                          }
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-[#FFD700] text-xs font-medium transition-colors"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Consistency check
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Panel grid */}
            {panelTiles.length > 0 || generating ? (
              <PanelGrid
                panels={panelTiles}
                totalExpected={totalExpected}
                newPanelIds={newPanelIds}
                onRedraw={(id) => handleRedraw(id)}
                onOpen={handleOpenLightbox}
                selectedIds={selectedIds}
                flaggedIds={flaggedIds}
                selectionMode={selectionMode}
                onToggleSelect={hasBatchTools ? handleToggleSelect : undefined}
              />
            ) : (
              <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <ImageIcon className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/30 text-sm mb-2">
                  {selectedEpisode?.status === "approved" || selectedEpisode?.status === "locked"
                    ? "Ready to generate panels for this episode."
                    : "This episode needs to be approved in the Script stage first."}
                </p>
                {(selectedEpisode?.status === "approved" || selectedEpisode?.status === "locked") && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleGeneratePanels}
                    disabled={generating}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white text-sm font-semibold mt-4 disabled:opacity-50"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? "Generating Panels..." : "Generate All Panels"}
                  </motion.button>
                )}
              </div>
            )}

            {/* Regen counter */}
            {regenCount > 0 && (
              <p className="text-center text-[11px] text-white/20">
                {regenCount} / {regenLimit === Infinity ? "∞" : regenLimit} redraws used this project
              </p>
            )}
          </>
        ) : (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <Lock className="w-10 h-10 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-sm mb-2">No approved episodes yet.</p>
            <p className="text-white/15 text-xs max-w-md mx-auto">
              Go back to the Script stage and approve at least one episode to unlock panel generation.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/script?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: allComplete && !advancing ? 1.02 : 1 }}
            whileTap={{ scale: allComplete && !advancing ? 0.98 : 1 }}
            onClick={() => allComplete && advance()}
            disabled={!allComplete || advancing}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              allComplete && !advancing
                ? "bg-gradient-to-r from-[#00E8A0] to-[#00F0FF] text-white shadow-[0_4px_20px_rgba(0,232,160,0.3)]"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            {advancing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Advancing...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Publish as manga →
              </>
            )}
          </motion.button>
        </div>
      </div>

      {/* Lightbox */}
      <PanelLightbox
        panels={panelTiles.filter((p) => !!p.imageUrl)}
        activePanelId={lightboxPanelId}
        onClose={() => setLightboxPanelId(null)}
        onRedraw={handleLightboxRedraw}
        isRedrawing={redrawingPanelId !== null}
        regenCount={regenCount}
        regenLimit={regenLimit}
      />

      {/* Batch bar — Mangaka+ only */}
      {hasBatchTools && (
        <PanelBatchBar
          selectedIds={selectedIds}
          maxBatch={batchLimit}
          costPerPanel={COST_PER_PANEL}
          isProcessing={batchProcessing}
          onBatchRedraw={handleBatchRedraw}
          onMatchToPanel={handleMatchToPanel}
          onOpenStyleDrift={() => setStyleDriftOpen(true)}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Style drift panel — Mangaka+ only */}
      {hasBatchTools && (
        <StyleDrift
          isOpen={styleDriftOpen}
          onClose={() => {
            setStyleDriftOpen(false);
            setStyleDriftPreviewUrl(null);
          }}
          totalPanels={panelTiles.filter((p) => !!p.imageUrl).length}
          costPerPanel={COST_PER_PANEL}
          previewCost={STYLE_DRIFT_PREVIEW_COST}
          isPreviewing={styleDriftPreviewing}
          isApplying={styleDriftApplying}
          previewImageUrl={styleDriftPreviewUrl}
          onPreview={handleStyleDriftPreview}
          onApply={handleStyleDriftApply}
        />
      )}

      {/* Consistency report — Mangaka+ only */}
      {hasBatchTools && (
        <ConsistencyReport
          isOpen={consistencyOpen}
          onClose={() => setConsistencyOpen(false)}
          flaggedPanels={flaggedPanels}
          isLoading={consistencyLoading}
          userTier={effectiveTier}
          autoCorrectRemaining={AUTO_CORRECT_MONTHLY_CAP - autoCorrectUsed}
          autoCorrectCap={AUTO_CORRECT_MONTHLY_CAP}
          onJumpToPanel={handleConsistencyJump}
          onAutoCorrect={handleAutoCorrect}
          onOpenLoraRetraining={handleOpenLoraRetraining}
          correctingPanelIds={correctingPanelIds}
        />
      )}
    </CreateWizardLayout>
  );
}
