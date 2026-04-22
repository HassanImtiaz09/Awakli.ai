import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useLocation } from "wouter";
import { useState, useMemo, useEffect } from "react";
import {
  CheckCircle, XCircle, RefreshCw, Maximize2, Loader2,
  ChevronLeft, ChevronRight, Sparkles, Eye, Clock
} from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";
import PanelDetailModal from "@/components/awakli/PanelDetailModal";

type PanelData = {
  id: number;
  episodeId: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: any;
  sfx: string | null;
  imageUrl: string | null;
  compositeImageUrl: string | null;
  fluxPrompt: string | null;
  status: string;
  reviewStatus: string | null;
};

export default function PanelReview() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [activeEpisodeId, setActiveEpisodeId] = useState<number | null>(null);
  const [selectedPanelId, setSelectedPanelId] = useState<number | null>(null);

  const { data: project } = trpc.projects.get.useQuery({ id: pid }, { enabled: !!user && !!pid });
  const { data: episodes } = trpc.episodes.listByProject.useQuery(
    { projectId: pid },
    { enabled: !!user && !!pid }
  );

  // Auto-select first episode
  useEffect(() => {
    if (episodes && episodes.length > 0 && !activeEpisodeId) {
      setActiveEpisodeId(episodes[0].id);
    }
  }, [episodes, activeEpisodeId]);

  const { data: panels, refetch: refetchPanels } = trpc.panels.listByEpisode.useQuery(
    { episodeId: activeEpisodeId! },
    {
      enabled: !!activeEpisodeId,
      refetchInterval: 5000,
    }
  );

  const utils = trpc.useUtils();

  const approveMut = trpc.panels.approve.useMutation({
    onSuccess: () => { refetchPanels(); toast.success("Panel approved"); },
  });
  const rejectMut = trpc.panels.reject.useMutation({
    onSuccess: () => { refetchPanels(); toast.success("Panel rejected"); },
  });
  const regenerateMut = trpc.panels.regenerate.useMutation({
    onSuccess: () => { refetchPanels(); toast.success("Regeneration started"); },
  });
  const generatePanelsMut = trpc.episodes.generatePanels.useMutation({
    onSuccess: () => { refetchPanels(); toast.success("Panel generation started!"); },
  });
  const approveAllMut = trpc.episodes.approveAllPanels.useMutation({
    onSuccess: (data) => { refetchPanels(); toast.success(`${data.approvedCount} panels approved`); },
  });
  const regenerateFailedMut = trpc.panels.regenerateFailed.useMutation({
    onSuccess: (data) => { refetchPanels(); toast.success(`${data.count} panels queued for regeneration`); },
  });

  // Stats
  const stats = useMemo(() => {
    if (!panels) return { total: 0, approved: 0, rejected: 0, generating: 0, pending: 0 };
    return {
      total: panels.length,
      approved: panels.filter((p: PanelData) => p.status === "approved").length,
      rejected: panels.filter((p: PanelData) => p.status === "rejected").length,
      generating: panels.filter((p: PanelData) => p.status === "generating").length,
      pending: panels.filter((p: PanelData) => p.status === "generated" && p.reviewStatus === "pending").length,
    };
  }, [panels]);

  const progressPercent = stats.total > 0 ? Math.round(((stats.approved + stats.pending) / stats.total) * 100) : 0;

  // Keyboard navigation for modal
  const panelList = panels ?? [];
  const selectedIndex = panelList.findIndex((p: PanelData) => p.id === selectedPanelId);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-token-violet" />
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  const activeEpisode = episodes?.find((e: any) => e.id === activeEpisodeId);
  const canGenerate = activeEpisode && (activeEpisode.status === "locked" || activeEpisode.status === "approved");
  const hasDraftPanels = panelList.some((p: PanelData) => p.status === "draft" || p.status === "rejected");

  return (
    <div className="min-h-screen bg-void text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-deep/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-token-violet to-token-cyan bg-clip-text text-transparent">
                Panel Review
              </h1>
              <p className="text-sm text-muted mt-1">{project?.title}</p>
            </div>
            {canGenerate && hasDraftPanels && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => generatePanelsMut.mutate({ id: activeEpisodeId! })}
                disabled={generatePanelsMut.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold text-sm disabled:opacity-50"
              >
                {generatePanelsMut.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Generate Panels
              </motion.button>
            )}
          </div>

          {/* Episode Tab Bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
            {episodes?.map((ep: any) => (
              <button
                key={ep.id}
                onClick={() => setActiveEpisodeId(ep.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-t-lg text-sm font-medium transition-all relative ${
                  ep.id === activeEpisodeId
                    ? "bg-surface text-white"
                    : "text-muted hover:text-white hover:bg-white/5"
                }`}
              >
                Ep {ep.episodeNumber}: {ep.title?.slice(0, 20)}
                {ep.id === activeEpisodeId && (
                  <motion.div
                    layoutId="episode-tab-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-token-violet to-token-cyan"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress Section */}
      {stats.total > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="bg-surface/50 border border-white/10 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted">
                  <span className="text-white font-semibold">{stats.approved}</span> approved
                </span>
                <span className="text-muted">
                  <span className="text-token-cyan font-semibold">{stats.pending}</span> pending review
                </span>
                <span className="text-muted">
                  <span className="text-yellow-400 font-semibold">{stats.generating}</span> generating
                </span>
                <span className="text-muted">
                  <span className="text-red-400 font-semibold">{stats.rejected}</span> rejected
                </span>
              </div>
              <span className="text-sm text-muted">
                {stats.total} total panels
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-void rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-token-violet via-token-cyan to-token-violet rounded-full"
              />
            </div>
            {stats.generating > 0 && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted">
                <Clock className="w-3 h-3 animate-pulse" />
                <span>Generating {stats.generating} panels... Estimated {stats.generating * 8}s remaining</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Masonry Grid */}
      <div className="max-w-7xl mx-auto px-4 pb-32">
        {panelList.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-surface/50 flex items-center justify-center mx-auto mb-4">
              <Eye className="w-8 h-8 text-muted" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No panels yet</h3>
            <p className="text-muted text-sm mb-4">
              {canGenerate
                ? "Click 'Generate Panels' to start creating anime frames from your script."
                : "Approve the script first, then generate panels."}
            </p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
            <AnimatePresence mode="popLayout">
              {panelList.map((panel: PanelData, index: number) => (
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  index={index}
                  onApprove={() => approveMut.mutate({ id: panel.id })}
                  onReject={() => rejectMut.mutate({ id: panel.id })}
                  onRegenerate={() => regenerateMut.mutate({ id: panel.id })}
                  onExpand={() => setSelectedPanelId(panel.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Batch Action Toolbar */}
      {stats.total > 0 && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 left-0 right-0 bg-deep/95 backdrop-blur-md border-t border-white/10 z-30"
        >
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="text-sm text-muted">
              {stats.pending > 0 && `${stats.pending} panels awaiting review`}
            </div>
            <div className="flex gap-3">
              {stats.rejected > 0 && (
                <button
                  onClick={() => activeEpisodeId && regenerateFailedMut.mutate({ episodeId: activeEpisodeId })}
                  disabled={regenerateFailedMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Regenerate Failed ({stats.rejected})
                </button>
              )}
              {stats.pending > 0 && (
                <button
                  onClick={() => activeEpisodeId && approveAllMut.mutate({ id: activeEpisodeId })}
                  disabled={approveAllMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  Approve All Visible ({stats.pending})
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Panel Detail Modal */}
      {selectedPanelId && (
        <PanelDetailModal
          panelId={selectedPanelId}
          onClose={() => setSelectedPanelId(null)}
          onApprove={(id: number) => { approveMut.mutate({ id }); }}
          onReject={(id: number) => { rejectMut.mutate({ id }); }}
          onRegenerate={(id: number, newPrompt?: string) => { regenerateMut.mutate({ id, newPrompt }); }}
          onNavigate={(dir: number) => {
            const newIndex = selectedIndex + dir;
            if (newIndex >= 0 && newIndex < panelList.length) {
              setSelectedPanelId(panelList[newIndex].id);
            }
          }}
          canNavigatePrev={selectedIndex > 0}
          canNavigateNext={selectedIndex < panelList.length - 1}
          onRefetch={refetchPanels}
        />
      )}
    </div>
  );
}

// ─── Panel Card Component ────────────────────────────────────────────────

function PanelCard({
  panel,
  index,
  onApprove,
  onReject,
  onRegenerate,
  onExpand,
}: {
  panel: PanelData;
  index: number;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onExpand: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const borderColor =
    panel.status === "approved" ? "border-green-500/50" :
    panel.status === "rejected" ? "border-red-500/50" :
    panel.status === "generating" ? "border-yellow-500/30 animate-pulse" :
    "border-white/10";

  const isGenerating = panel.status === "generating";
  const isRejected = panel.status === "rejected";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`break-inside-avoid rounded-xl overflow-hidden border-2 ${borderColor} bg-surface/50 transition-all ${
        isRejected ? "opacity-50 grayscale-[50%]" : ""
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] bg-void">
        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-token-violet/30 border-t-token-violet animate-spin" />
              <Sparkles className="w-5 h-5 text-token-violet absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <span className="text-xs text-muted">Generating...</span>
          </div>
        ) : panel.imageUrl ? (
          <img
            src={panel.imageUrl}
            alt={`Panel S${panel.sceneNumber}P${panel.panelNumber}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted">No image</span>
          </div>
        )}

        {/* Hover overlay */}
        <AnimatePresence>
          {hovered && !isGenerating && panel.imageUrl && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); onApprove(); }}
                className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-green-400 hover:bg-green-500/30"
                title="Approve"
              >
                <CheckCircle className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); onReject(); }}
                className="w-10 h-10 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/30"
                title="Reject"
              >
                <XCircle className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
                className="w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400 hover:bg-yellow-500/30"
                title="Regenerate"
              >
                <RefreshCw className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
                title="Expand"
              >
                <Maximize2 className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            panel.status === "approved" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
            panel.status === "rejected" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
            panel.status === "generating" ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
            panel.status === "generated" ? "bg-token-cyan/20 text-token-cyan border border-token-cyan/30" :
            "bg-white/10 text-muted border border-white/10"
          }`}>
            {panel.status}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-token-cyan">
            S{panel.sceneNumber} · P{panel.panelNumber}
          </span>
          <span className="text-[10px] text-muted uppercase">{panel.cameraAngle}</span>
        </div>
        {panel.visualDescription && (
          <p className="text-xs text-muted line-clamp-2 leading-relaxed">
            {panel.visualDescription}
          </p>
        )}
      </div>
    </motion.div>
  );
}
