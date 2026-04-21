import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutGrid, ArrowRight, ArrowLeft, Sparkles, Loader2,
  Image as ImageIcon, Check, X, RotateCcw, Eye, Lock, ZoomIn,
  CheckCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";

// ─── Panel card ──────────────────────────────────────────────────────────
function PanelCard({
  panel,
  onApprove,
  onReject,
  onRegenerate,
}: {
  panel: any;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onRegenerate: (id: number) => void;
}) {
  const [zoomed, setZoomed] = useState(false);

  const statusColor: Record<string, string> = {
    generating: "ring-token-gold/30",
    generated: "ring-token-cyan/20",
    approved: "ring-token-mint/30",
    rejected: "ring-red-500/30",
    draft: "ring-white/5",
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`relative rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 ring-2 ${statusColor[panel.status] || statusColor.draft} transition-all group`}
      >
        {/* Image area */}
        <div className="aspect-[3/4] relative bg-black/20">
          {panel.status === "generating" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-token-gold" />
              <span className="text-[10px] text-white/20">Generating...</span>
            </div>
          ) : panel.imageUrl ? (
            <>
              <img
                src={panel.compositeImageUrl || panel.imageUrl}
                alt={`Panel ${panel.panelNumber}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Zoom button */}
              <button
                onClick={() => setZoomed(true)}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 text-white/60 opacity-0 group-hover:opacity-100 transition-all hover:text-white"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-white/10" />
            </div>
          )}
        </div>

        {/* Info bar */}
        <div className="p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-white/30">
              S{panel.sceneNumber} P{panel.panelNumber}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              panel.status === "approved" ? "bg-token-mint/10 text-token-mint" :
              panel.status === "generated" ? "bg-token-cyan/10 text-token-cyan" :
              panel.status === "generating" ? "bg-token-gold/10 text-token-gold" :
              panel.status === "rejected" ? "bg-red-500/10 text-red-400" :
              "bg-white/5 text-white/30"
            }`}>
              {panel.status}
            </span>
          </div>
          <p className="text-[10px] text-white/25 line-clamp-2 leading-relaxed">
            {panel.visualDescription}
          </p>
          {panel.cameraAngle && (
            <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/20">
              {panel.cameraAngle}
            </span>
          )}

          {/* Action buttons */}
          {(panel.status === "generated" || panel.status === "rejected") && (
            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/5">
              {panel.status === "generated" && (
                <>
                  <button
                    onClick={() => onApprove(panel.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-token-mint/10 text-token-mint text-[10px] font-medium hover:bg-token-mint/20 transition-all"
                  >
                    <Check className="w-3 h-3" />
                    Approve
                  </button>
                  <button
                    onClick={() => onReject(panel.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-medium hover:bg-red-500/20 transition-all"
                  >
                    <X className="w-3 h-3" />
                    Reject
                  </button>
                </>
              )}
              <button
                onClick={() => onRegenerate(panel.id)}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/5 text-white/40 text-[10px] font-medium hover:bg-white/10 transition-all"
              >
                <RotateCcw className="w-3 h-3" />
                Redo
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Zoom modal */}
      <AnimatePresence>
        {zoomed && panel.imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-pointer"
            onClick={() => setZoomed(false)}
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={panel.compositeImageUrl || panel.imageUrl}
              alt={`Panel ${panel.panelNumber}`}
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Main component ──────────────────────────────────────────────────────
export default function WizardPanels() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const utils = trpc.useUtils();

  const { data: project } = trpc.projects.get.useQuery({ id: numId }, { enabled: !isNaN(numId) });
  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery({ projectId: numId }, { enabled: !isNaN(numId) });

  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const { advance, advancing } = useAdvanceStage(projectId, 3);

  // Get approved/locked episodes for panel generation
  const eligibleEpisodes = useMemo(
    () => episodes.filter((e: any) => e.status === "approved" || e.status === "locked" || e.status === "generated"),
    [episodes]
  );

  const selectedEpisode = eligibleEpisodes[selectedEpIdx] as any | undefined;

  // Fetch panels for selected episode
  const { data: panels = [] } = trpc.panels.listByEpisode.useQuery(
    { episodeId: selectedEpisode?.id ?? 0 },
    { enabled: !!selectedEpisode }
  );

  // Panel generation status polling
  const { data: genStatus } = trpc.episodes.panelStatus.useQuery(
    { id: selectedEpisode?.id ?? 0 },
    { enabled: !!selectedEpisode, refetchInterval: panels.some((p: any) => p.status === "generating") ? 3000 : false }
  );

  // Poll panels while any are generating
  const hasGeneratingPanels = panels.some((p: any) => p.status === "generating");
  useEffect(() => {
    if (!hasGeneratingPanels || !selectedEpisode) return;
    const interval = setInterval(() => {
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
    }, 4000);
    return () => clearInterval(interval);
  }, [hasGeneratingPanels, selectedEpisode, utils]);

  const generatePanelsMut = trpc.episodes.generatePanels.useMutation();
  const approveAllMut = trpc.episodes.approveAllPanels.useMutation();
  const approvePanelMut = trpc.panels.approve.useMutation();
  const rejectPanelMut = trpc.panels.reject.useMutation();
  const regeneratePanelMut = trpc.panels.regenerate.useMutation();

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    if (episodes.length > 0 && episodes.some((e: any) => e.status === "approved" || e.status === "locked")) s.add(2);
    // Stage 3 complete when all panels for at least one episode are approved
    if (panels.length > 0 && panels.every((p: any) => p.status === "approved")) s.add(3);
    return s;
  }, [project, episodes, panels]);

  const handleGeneratePanels = useCallback(async () => {
    if (!selectedEpisode || generating) return;
    setGenerating(true);
    try {
      const result = await generatePanelsMut.mutateAsync({ id: selectedEpisode.id });
      toast.success(`Panel generation started`, {
        description: `Generating ${result.panelCount} panels. This may take a few minutes.`,
      });
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
    } catch (e: any) {
      toast.error("Panel generation failed", { description: e.message });
    }
    setGenerating(false);
  }, [selectedEpisode, generating, generatePanelsMut, utils]);

  const handleApproveAll = useCallback(async () => {
    if (!selectedEpisode) return;
    try {
      const result = await approveAllMut.mutateAsync({ id: selectedEpisode.id });
      toast.success(`${result.approvedCount} panels approved`);
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode.id });
    } catch (e: any) {
      toast.error("Failed to approve panels", { description: e.message });
    }
  }, [selectedEpisode, approveAllMut, utils]);

  const handleApprovePanel = useCallback(async (panelId: number) => {
    try {
      await approvePanelMut.mutateAsync({ id: panelId });
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
    } catch (e: any) {
      toast.error("Failed to approve panel", { description: e.message });
    }
  }, [approvePanelMut, selectedEpisode, utils]);

  const handleRejectPanel = useCallback(async (panelId: number) => {
    try {
      await rejectPanelMut.mutateAsync({ id: panelId });
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
    } catch (e: any) {
      toast.error("Failed to reject panel", { description: e.message });
    }
  }, [rejectPanelMut, selectedEpisode, utils]);

  const handleRegeneratePanel = useCallback(async (panelId: number) => {
    try {
      await regeneratePanelMut.mutateAsync({ id: panelId });
      toast.success("Panel regeneration started");
      utils.panels.listByEpisode.invalidate({ episodeId: selectedEpisode?.id ?? 0 });
    } catch (e: any) {
      toast.error("Failed to regenerate panel", { description: e.message });
    }
  }, [regeneratePanelMut, selectedEpisode, utils]);

  // Stats
  const panelStats = useMemo(() => {
    const total = panels.length;
    const generated = panels.filter((p: any) => p.status === "generated").length;
    const approved = panels.filter((p: any) => p.status === "approved").length;
    const genInProgress = panels.filter((p: any) => p.status === "generating").length;
    const draft = panels.filter((p: any) => p.status === "draft" || p.status === "rejected").length;
    return { total, generated, approved, genInProgress, draft };
  }, [panels]);

  const hasDraftPanels = panelStats.draft > 0;
  const hasGeneratedPanels = panelStats.generated > 0;
  const allApproved = panelStats.total > 0 && panelStats.approved === panelStats.total;
  const canProceed = allApproved || (panelStats.approved > 0 && panelStats.genInProgress === 0);

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
          <div className="flex items-center gap-2 text-token-cyan text-xs font-semibold uppercase tracking-widest">
            <LayoutGrid className="w-3.5 h-3.5" />
            Stage 04 — Panels
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Generate manga panels
          </h1>
          <p className="text-white/40 text-sm">
            Transform your approved scripts into visual panels. Review, approve, or regenerate each one.
          </p>
        </div>

        {/* Episode tabs */}
        {eligibleEpisodes.length > 0 ? (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {eligibleEpisodes.map((ep: any, i: number) => (
                <button
                  key={ep.id}
                  onClick={() => setSelectedEpIdx(i)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedEpIdx === i
                      ? "bg-token-cyan/20 text-token-cyan ring-1 ring-token-cyan/30"
                      : "bg-white/5 text-white/40 hover:text-white/60"
                  }`}
                >
                  EP {String(i + 1).padStart(2, "0")} — {ep.title || `Episode ${i + 1}`}
                </button>
              ))}
            </div>

            {/* Stats bar */}
            {panelStats.total > 0 && (
              <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-6 text-xs">
                  <span className="text-white/30">{panelStats.total} total</span>
                  {panelStats.genInProgress > 0 && (
                    <span className="text-token-gold flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {panelStats.genInProgress} generating
                    </span>
                  )}
                  {panelStats.generated > 0 && (
                    <span className="text-token-cyan">{panelStats.generated} ready for review</span>
                  )}
                  <span className="text-token-mint">{panelStats.approved} approved</span>
                  {panelStats.draft > 0 && (
                    <span className="text-white/20">{panelStats.draft} pending</span>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {hasGeneratedPanels && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleApproveAll}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-token-mint/10 text-token-mint text-xs font-medium hover:bg-token-mint/20 transition-all"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Approve All
                    </motion.button>
                  )}
                  {hasDraftPanels && !hasGeneratingPanels && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleGeneratePanels}
                      disabled={generating}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-token-violet/10 text-token-violet text-xs font-medium hover:bg-token-violet/20 transition-all disabled:opacity-50"
                    >
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Generate Remaining
                    </motion.button>
                  )}
                </div>
              </div>
            )}

            {/* Progress bar */}
            {panelStats.total > 0 && (
              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-token-violet via-token-cyan to-token-mint transition-all duration-500"
                  style={{ width: `${((panelStats.approved + panelStats.generated) / panelStats.total) * 100}%` }}
                />
              </div>
            )}

            {/* Panel grid */}
            {panels.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {panels.map((panel: any) => (
                  <PanelCard
                    key={panel.id}
                    panel={panel}
                    onApprove={handleApprovePanel}
                    onReject={handleRejectPanel}
                    onRegenerate={handleRegeneratePanel}
                  />
                ))}
              </div>
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
                    disabled={generating || hasGeneratingPanels}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-cyan to-token-violet text-white text-sm font-semibold mt-4 disabled:opacity-50"
                  >
                    {generating || hasGeneratingPanels ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating || hasGeneratingPanels ? "Generating Panels..." : "Generate All Panels"}
                  </motion.button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <Lock className="w-10 h-10 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-sm mb-2">
              No approved episodes yet.
            </p>
            <p className="text-white/15 text-xs max-w-md mx-auto">
              Go back to the Script stage and approve at least one episode to unlock panel generation.
            </p>
          </div>
        )}

        {/* Proceed hint */}
        {panels.length > 0 && !canProceed && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-token-gold/5 border border-token-gold/10 text-token-gold text-xs">
            <Eye className="w-4 h-4 flex-shrink-0" />
            Approve panels to proceed to the Anime Gate stage.
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
            whileHover={{ scale: canProceed && !advancing ? 1.02 : 1 }}
            whileTap={{ scale: canProceed && !advancing ? 0.98 : 1 }}
            onClick={() => canProceed && advance()}
            disabled={!canProceed || advancing}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              canProceed && !advancing
                ? "bg-gradient-to-r from-token-violet to-token-cyan text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
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
                Continue to Gate
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
