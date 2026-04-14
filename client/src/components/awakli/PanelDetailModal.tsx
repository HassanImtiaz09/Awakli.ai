import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useRef } from "react";

type PanelRecord = {
  id: number;
  episodeId: number;
  projectId: number;
  sceneNumber: number;
  panelNumber: number;
  visualDescription: string | null;
  cameraAngle: string | null;
  dialogue: { character: string; text: string; emotion: string }[] | null;
  sfx: string | null;
  transition: string | null;
  imageUrl: string | null;
  compositeImageUrl: string | null;
  fluxPrompt: string | null;
  negativePrompt: string | null;
  status: string;
  reviewStatus: string | null;
};
import {
  X, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  RefreshCw, Sparkles, ChevronDown, ChevronUp, Edit3, Loader2
} from "lucide-react";
import { toast } from "sonner";

interface PanelDetailModalProps {
  panelId: number;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onRegenerate: (id: number, newPrompt?: string) => void;
  onNavigate: (direction: number) => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  onRefetch: () => void;
}

export default function PanelDetailModal({
  panelId,
  onClose,
  onApprove,
  onReject,
  onRegenerate,
  onNavigate,
  canNavigatePrev,
  canNavigateNext,
  onRefetch,
}: PanelDetailModalProps) {
  const [viewMode, setViewMode] = useState<"raw" | "composite">("raw");
  const [showPrompt, setShowPrompt] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descText, setDescText] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isZoomed, setIsZoomed] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);

  const { data: rawPanel, refetch } = trpc.panels.get.useQuery(
    { id: panelId },
    { enabled: !!panelId }
  );
  const panel = rawPanel as PanelRecord | undefined;

  const updateMut = trpc.panels.update.useMutation({
    onSuccess: () => {
      refetch();
      onRefetch();
      toast.success("Panel updated");
      setEditingDesc(false);
    },
  });

  const overlayMut = trpc.panels.applyOverlay.useMutation({
    onSuccess: () => {
      refetch();
      onRefetch();
      toast.success("Overlay applied");
    },
  });

  const aiRewriteMut = trpc.panels.aiRewrite.useMutation({
    onSuccess: (data) => {
      setDescText(data.rewritten);
      toast.success("AI rewrite complete");
    },
  });

  // Init text fields
  useEffect(() => {
    if (panel) {
      setDescText(panel.visualDescription || "");
      setPromptText(panel.fluxPrompt || "");
    }
  }, [panel?.id, panel?.visualDescription, panel?.fluxPrompt]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editingDesc || editingPrompt) return;

    switch (e.key) {
      case "Escape":
        onClose();
        break;
      case "ArrowLeft":
        if (canNavigatePrev) onNavigate(-1);
        break;
      case "ArrowRight":
        if (canNavigateNext) onNavigate(1);
        break;
      case "a":
      case "A":
        if (panel) onApprove(panel.id);
        break;
      case "r":
      case "R":
        if (panel) onReject(panel.id);
        break;
    }
  }, [onClose, onNavigate, onApprove, onReject, canNavigatePrev, canNavigateNext, panel, editingDesc, editingPrompt]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Zoom on hover
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  if (!panel) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-pink" />
      </div>
    );
  }

  const imageUrl = viewMode === "composite" && panel.compositeImageUrl
    ? panel.compositeImageUrl
    : panel.imageUrl;

  const hasDialogue = panel.dialogue && (panel.dialogue as any[]).length > 0;
  const hasSfx = !!panel.sfx;
  const canShowComposite = panel.compositeImageUrl || hasDialogue || hasSfx;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Navigation arrows */}
      {canNavigatePrev && (
        <button
          onClick={() => onNavigate(-1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}
      {canNavigateNext && (
        <button
          onClick={() => onNavigate(1)}
          className="absolute right-[340px] top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Main image area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* Toggle bar */}
        {canShowComposite && (
          <div className="mb-4 flex bg-surface/80 rounded-lg p-1 border border-white/10">
            <button
              onClick={() => setViewMode("raw")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "raw"
                  ? "bg-accent-pink/20 text-accent-pink"
                  : "text-muted hover:text-white"
              }`}
            >
              Raw Panel
            </button>
            <button
              onClick={() => {
                if (!panel.compositeImageUrl && (hasDialogue || hasSfx)) {
                  overlayMut.mutate({ id: panel.id });
                }
                setViewMode("composite");
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === "composite"
                  ? "bg-accent-cyan/20 text-accent-cyan"
                  : "text-muted hover:text-white"
              }`}
            >
              {overlayMut.isPending ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                </span>
              ) : (
                "With Dialogue"
              )}
            </button>
          </div>
        )}

        {/* Image with zoom */}
        <div
          ref={imageRef}
          className="relative max-w-2xl max-h-[70vh] overflow-hidden rounded-xl border border-white/10 cursor-zoom-in"
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setIsZoomed(true)}
          onMouseLeave={() => setIsZoomed(false)}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Panel S${panel.sceneNumber}P${panel.panelNumber}`}
              className="w-full h-full object-contain transition-transform duration-150"
              style={isZoomed ? {
                transform: "scale(2)",
                transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
              } : {}}
            />
          ) : (
            <div className="w-96 h-96 flex items-center justify-center bg-surface text-muted">
              No image generated
            </div>
          )}
        </div>

        {/* Panel info */}
        <div className="mt-3 text-center">
          <span className="text-xs font-mono text-accent-cyan">
            Scene {panel.sceneNumber} · Panel {panel.panelNumber}
          </span>
          <span className="text-xs text-muted ml-3">{panel.cameraAngle}</span>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onApprove(panel.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 hover:bg-green-500/30 text-sm font-medium"
          >
            <CheckCircle className="w-4 h-4" /> Approve <kbd className="text-[10px] bg-white/10 px-1 rounded ml-1">A</kbd>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onReject(panel.id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-medium"
          >
            <XCircle className="w-4 h-4" /> Reject <kbd className="text-[10px] bg-white/10 px-1 rounded ml-1">R</kbd>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onRegenerate(panel.id, editingPrompt ? promptText : undefined)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/30 text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" /> Regenerate
          </motion.button>
        </div>

        {/* Keyboard hint */}
        <div className="mt-3 text-[10px] text-muted/50 flex gap-4">
          <span>← → Navigate</span>
          <span>A Approve</span>
          <span>R Reject</span>
          <span>Esc Close</span>
        </div>
      </div>

      {/* Side panel */}
      <div className="w-[320px] bg-deep/95 border-l border-white/10 overflow-y-auto p-5">
        <h3 className="text-sm font-display font-bold text-white mb-4">Panel Details</h3>

        {/* Status */}
        <div className="mb-4">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            panel.status === "approved" ? "bg-green-500/20 text-green-400" :
            panel.status === "rejected" ? "bg-red-500/20 text-red-400" :
            panel.status === "generated" ? "bg-accent-cyan/20 text-accent-cyan" :
            "bg-white/10 text-muted"
          }`}>
            {String(panel.status)}
          </span>
        </div>

        {/* Visual Description */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Visual Description</label>
            <div className="flex gap-1">
              <button
                onClick={() => {
                  if (editingDesc) {
                    updateMut.mutate({ id: panel.id, visualDescription: descText });
                  } else {
                    setEditingDesc(true);
                  }
                }}
                className="text-xs text-accent-cyan hover:text-white transition-colors"
              >
                {editingDesc ? (updateMut.isPending ? "Saving..." : "Save") : "Edit"}
              </button>
              {editingDesc && (
                <button
                  onClick={() => aiRewriteMut.mutate({
                    panelId: panel.id,
                    field: "visualDescription",
                    currentText: descText,
                  })}
                  disabled={aiRewriteMut.isPending}
                  className="text-xs text-accent-pink hover:text-white transition-colors flex items-center gap-1"
                >
                  {aiRewriteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  AI
                </button>
              )}
            </div>
          </div>
          {editingDesc ? (
            <textarea
              value={descText}
              onChange={(e) => setDescText(e.target.value)}
              className="w-full bg-void border border-white/10 rounded-lg p-2 text-sm text-white resize-none focus:outline-none focus:border-accent-pink/50"
              rows={4}
            />
          ) : (
            <p className="text-sm text-muted/80 leading-relaxed">{String(panel.visualDescription || "No description")}</p>
          )}
        </div>

        {/* FLUX Prompt (collapsible) */}
        <div className="mb-4">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center justify-between w-full text-xs font-semibold text-muted uppercase tracking-wider mb-2"
          >
            <span>FLUX Prompt</span>
            {showPrompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <AnimatePresence>
            {showPrompt && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {editingPrompt ? (
                  <div>
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      className="w-full bg-void border border-white/10 rounded-lg p-2 text-xs text-white font-mono resize-none focus:outline-none focus:border-accent-pink/50"
                      rows={5}
                    />
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => setEditingPrompt(false)}
                        className="text-xs text-muted hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          onRegenerate(panel.id, promptText);
                          setEditingPrompt(false);
                        }}
                        className="text-xs text-accent-pink hover:text-white flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Regenerate with edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-muted/60 font-mono leading-relaxed break-all">
                      {String(panel.fluxPrompt || "No prompt generated yet")}
                    </p>
                    <button
                      onClick={() => setEditingPrompt(true)}
                      className="text-xs text-accent-cyan hover:text-white mt-1 flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" /> Edit & Regenerate
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Dialogue */}
        {hasDialogue && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 block">Dialogue</label>
            <div className="space-y-2">
              {(panel.dialogue as { character: string; text: string; emotion: string }[]).map((d, i) => (
                <div key={i} className="bg-void/50 border border-white/5 rounded-lg p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-accent-pink">{d.character}</span>
                    <span className="text-[10px] text-muted italic">({d.emotion})</span>
                  </div>
                  <p className="text-sm text-white/80">"{d.text}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SFX */}
        {hasSfx && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1 block">SFX</label>
            <span className="text-sm font-bold text-yellow-400 italic">{String(panel.sfx)}</span>
          </div>
        )}

        {/* Camera Angle */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1 block">Camera Angle</label>
          <span className="text-sm text-white/80 capitalize">{String(panel.cameraAngle)}</span>
        </div>

        {/* Transition */}
        {panel.transition && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1 block">Transition</label>
            <span className="text-sm text-white/80 capitalize">{String(panel.transition)}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
