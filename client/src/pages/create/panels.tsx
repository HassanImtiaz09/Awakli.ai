/**
 * Stage 2 · Panels — Sequential gen (Apprentice)
 *
 * Copy strings:
 * - Page title: "Your panels"
 * - Subhead: "Miss a moment? Tap any panel to redraw it."
 * - Hover regenerate: "Redraw"
 * - Regenerate popover: "Make it rain. Pull the camera in. Remove the second character…"
 * - Confirm CTA: "Redraw · 3 credits"
 * - Complete banner: "All panels ready. Publish when you are."
 * - Rate-limit: "We're catching our breath — resuming in {s}s"
 */
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, ArrowRight, ArrowLeft, Sparkles, Loader2,
  Image as ImageIcon, Check, Lock, CheckCircle2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import { PanelGrid } from "@/components/awakli/PanelGrid";
import { PanelLightbox } from "@/components/awakli/PanelLightbox";
import type { PanelTileData } from "@/components/awakli/PanelTile";
import { useUpgradeModal } from "@/store/upgradeModal";

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
    case "creator":
      return 5;
    case "creator_pro":
      return 15;
    case "studio":
    case "studio_pro":
      return Infinity;
    default:
      return 5;
  }
}

export default function WizardPanels() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const utils = trpc.useUtils();
  const openUpgrade = useUpgradeModal((s) => s.openFromGate);

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

  const userTier = creditData?.tier || "free_trial";
  const regenLimit = getRegenLimit(userTier);

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
        // Clear the "new" flag after animation
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
    });

    es.addEventListener("rate_limited", (e) => {
      try {
        const data = JSON.parse(e.data);
        setRateLimitSeconds(data.resumeInSeconds || 30);
      } catch {}
    });

    es.onerror = () => {
      // Reconnect handled by browser EventSource
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [generating, selectedEpisode, numId, utils]);

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
    // Use the episode's expected panel count or fall back to current count
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
      // Check regen cap
      if (regenCount >= regenLimit) {
        trackEvent("stage2_cap_hit", { regenCount, regenLimit });
        openUpgrade({
          currentTier: userTier,
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
    [regenCount, regenLimit, regeneratePanelMut, selectedEpisode, utils, openUpgrade],
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

        {/* Episode tabs */}
        {eligibleEpisodes.length > 0 ? (
          <>
            {eligibleEpisodes.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {eligibleEpisodes.map((ep: any, i: number) => (
                  <button
                    key={ep.id}
                    onClick={() => setSelectedEpIdx(i)}
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
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#00E8A0]/5 border border-[#00E8A0]/10 text-[#00E8A0] text-sm"
                >
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  All panels ready. Publish when you are.
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
    </CreateWizardLayout>
  );
}
