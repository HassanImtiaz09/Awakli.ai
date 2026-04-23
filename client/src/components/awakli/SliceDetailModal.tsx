/**
 * SliceDetailModal — Full detail view for a single storyboard slice
 *
 * Shows large preview, metadata, approve/reject/regenerate actions,
 * tier override dropdown, prompt preview, and dialogue lines.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AwakliButton } from "./AwakliButton";
import { AwakliiBadge } from "./AwakliiBadge";
import type { StoryboardSlice } from "./StoryboardView";
import {
  X, CheckCircle2, XCircle, RotateCcw, Loader2, Eye,
  Sparkles, Users, MessageSquare, Mic, Zap, Camera,
  ChevronDown, Check, Image, AlertTriangle, ArrowLeft,
  ArrowRight, Pencil, Clock, Film,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Tier Config ────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { color: string; bg: string; label: string; shortLabel: string; desc: string }> = {
  "1": { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", label: "V3 Omni", shortLabel: "T1", desc: "Highest quality — lip sync, multi-character action" },
  "2": { color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)", label: "V2.6", shortLabel: "T2", desc: "High quality — complex scenes, moderate motion" },
  "3": { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", label: "V2.1", shortLabel: "T3", desc: "Standard — single character, simple motion" },
  "4": { color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)", label: "V1.6", shortLabel: "T4", desc: "Economy — establishing shots, transitions" },
};

// ─── Tier Override Dropdown ─────────────────────────────────────────────

function TierOverrideSelect({
  currentTier,
  originalTier,
  onChange,
  disabled,
}: {
  currentTier: string;
  originalTier: string;
  onChange: (tier: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cfg = TIER_CONFIG[currentTier] || TIER_CONFIG["3"];
  const isOverridden = currentTier !== originalTier;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm",
          "hover:border-white/20",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        )}
        style={{ backgroundColor: cfg.bg, borderColor: `${cfg.color}33` }}
      >
        <span style={{ color: cfg.color }} className="font-bold">{cfg.shortLabel}</span>
        <span className="text-white/60">{cfg.label}</span>
        {isOverridden && <span className="text-amber-400 text-[10px] font-bold">OVERRIDE</span>}
        <ChevronDown className="w-3.5 h-3.5 text-white/30 ml-1" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full mt-1 left-0 z-[61] bg-[#1A1A2E] border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[220px]"
            >
              {Object.entries(TIER_CONFIG).map(([tier, tcfg]) => {
                const isSelected = tier === currentTier;
                const isOriginal = tier === originalTier;
                return (
                  <button
                    key={tier}
                    onClick={() => { onChange(tier); setOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-white/5 transition-colors",
                      isSelected && "bg-white/[0.03]"
                    )}
                  >
                    <span style={{ color: tcfg.color }} className="font-bold w-6">{tcfg.shortLabel}</span>
                    <div className="flex-1 text-left">
                      <p className="text-white/70 font-medium">{tcfg.label}</p>
                      <p className="text-white/30 text-[10px] mt-0.5">{tcfg.desc}</p>
                    </div>
                    {isOriginal && <span className="text-white/20 text-[9px] bg-white/5 px-1.5 py-0.5 rounded">auto</span>}
                    {isSelected && <Check className="w-4 h-4 text-cyan-400" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────

interface SliceDetailModalProps {
  slice: StoryboardSlice;
  episodeId: number;
  onClose: () => void;
  onUpdated: () => void;
}

export function SliceDetailModal({ slice, episodeId, onClose, onUpdated }: SliceDetailModalProps) {
  const [feedbackText, setFeedbackText] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  const utils = trpc.useUtils();

  // ─── Mutations ────────────────────────────────────────────────────

  const approveMut = trpc.coreScene.approve.useMutation({
    onSuccess: () => {
      toast.success(`Slice #${slice.sliceNumber} approved`);
      onUpdated();
      onClose();
    },
    onError: (err) => toast.error("Approval failed", { description: err.message }),
  });

  const rejectMut = trpc.coreScene.reject.useMutation({
    onSuccess: () => {
      toast.success(`Slice #${slice.sliceNumber} rejected`, {
        description: "You can regenerate it with feedback.",
      });
      onUpdated();
    },
    onError: (err) => toast.error("Rejection failed", { description: err.message }),
  });

  const regenerateMut = trpc.coreScene.regenerate.useMutation({
    onSuccess: () => {
      toast.success(`Slice #${slice.sliceNumber} regenerating...`);
      onUpdated();
      setShowFeedback(false);
      setFeedbackText("");
    },
    onError: (err) => toast.error("Regeneration failed", { description: err.message }),
  });

  const overrideTierMut = trpc.slices.overrideTier.useMutation({
    onSuccess: (data) => {
      toast.success(`Tier updated to T${data.newTier}`, {
        description: `Cost: ${data.estimatedCredits} credits`,
      });
      onUpdated();
    },
    onError: (err) => toast.error("Tier override failed", { description: err.message }),
  });

  // Prompt preview query
  const promptQuery = trpc.coreScene.getPromptPreview.useQuery(
    { sliceId: slice.id },
    { enabled: showPrompt }
  );

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleApprove = useCallback(() => {
    approveMut.mutate({ sliceId: slice.id });
  }, [slice.id, approveMut]);

  const handleReject = useCallback(() => {
    rejectMut.mutate({ sliceId: slice.id, feedback: feedbackText || undefined });
    setShowFeedback(false);
  }, [slice.id, feedbackText, rejectMut]);

  const handleRegenerate = useCallback(() => {
    regenerateMut.mutate({
      sliceId: slice.id,
      feedbackPrompt: feedbackText || undefined,
    });
  }, [slice.id, feedbackText, regenerateMut]);

  const handleTierChange = useCallback((newTier: string) => {
    overrideTierMut.mutate({
      id: slice.id,
      newTier: parseInt(newTier),
    });
  }, [slice.id, overrideTierMut]);

  useEffect(() => {
    if (showFeedback && feedbackRef.current) {
      feedbackRef.current.focus();
    }
  }, [showFeedback]);

  // ─── Escape key handler ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const tier = TIER_CONFIG[slice.complexityTier || "3"];
  const hasDialogue = slice.dialogue && slice.dialogue.length > 0;
  const isActionable = slice.coreSceneStatus === "generated" || slice.coreSceneStatus === "rejected";
  const isPending = slice.coreSceneStatus === "pending";
  const isApproved = slice.coreSceneStatus === "approved";
  const isLoading = approveMut.isPending || rejectMut.isPending || regenerateMut.isPending;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#12121A] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#12121A]/95 backdrop-blur-md flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-lg">Slice #{slice.sliceNumber}</span>
            <span className="text-white/30 text-sm flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {slice.durationSeconds}s
            </span>
            {slice.lipSyncRequired && (
              <AwakliiBadge variant="pink" size="sm">
                <Mic className="w-3 h-3 mr-1" /> Lip Sync
              </AwakliiBadge>
            )}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview Image */}
        <div className="relative aspect-video bg-[#080812] mx-6 mt-4 rounded-xl overflow-hidden border border-white/5">
          {slice.coreSceneImageUrl ? (
            <img
              src={slice.coreSceneImageUrl}
              alt={`Slice ${slice.sliceNumber} preview`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {slice.coreSceneStatus === "generating" ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                  <span className="text-cyan-400/60 text-sm">Generating preview...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Image className="w-10 h-10 text-white/10" />
                  <span className="text-white/20 text-sm">No preview generated yet</span>
                </div>
              )}
            </div>
          )}

          {/* Status overlay */}
          {isApproved && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-sm px-3 py-1.5 rounded-full border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium">Approved</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Action Description */}
            <div className="col-span-2">
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-1.5 block">
                Action Description
              </label>
              <p className="text-white/70 text-sm leading-relaxed bg-white/[0.02] rounded-lg p-3 border border-white/5">
                {slice.actionDescription || "No description provided"}
              </p>
            </div>

            {/* Camera Angle */}
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-1.5 block">
                Camera Angle
              </label>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Camera className="w-4 h-4 text-white/30" />
                {slice.cameraAngle || "Not specified"}
              </div>
            </div>

            {/* Mood */}
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-1.5 block">
                Mood
              </label>
              <div className="text-sm text-white/60 italic">
                {slice.mood || "Not specified"}
              </div>
            </div>
          </div>

          {/* Characters */}
          {slice.characters && slice.characters.length > 0 && (
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-2 block flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Characters ({slice.characters.length})
              </label>
              <div className="flex flex-wrap gap-2">
                {slice.characters.map((char, i) => (
                  <span
                    key={i}
                    className="text-xs text-white/50 bg-white/[0.04] px-3 py-1.5 rounded-lg border border-white/5"
                  >
                    {char.name}
                    {char.role && <span className="text-white/20 ml-1.5">({char.role})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dialogue */}
          {hasDialogue && (
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-2 block flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Dialogue
              </label>
              <div className="space-y-2">
                {slice.dialogue.map((line, i) => (
                  <div key={i} className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-purple-400">{line.character}</span>
                      {line.emotion && (
                        <span className="text-[10px] text-white/20 italic">({line.emotion})</span>
                      )}
                    </div>
                    <p className="text-white/60 text-sm">&ldquo;{line.text}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tier & Cost */}
          <div className="flex items-center justify-between bg-white/[0.02] rounded-xl p-4 border border-white/5">
            <div>
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-2 block">
                Model Tier
              </label>
              <TierOverrideSelect
                currentTier={slice.complexityTier || "3"}
                originalTier={slice.complexityTier || "3"}
                onChange={handleTierChange}
                disabled={overrideTierMut.isPending}
              />
            </div>
            <div className="text-right">
              <label className="text-white/30 text-[10px] uppercase tracking-wider font-medium mb-2 block">
                Estimated Cost
              </label>
              <div className="flex items-center gap-1.5 text-lg font-bold text-cyan-400 font-mono">
                <Zap className="w-4 h-4" />
                {slice.estimatedCredits}
                <span className="text-xs text-white/30 font-normal">credits</span>
              </div>
            </div>
          </div>

          {/* Prompt Preview Toggle */}
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/50 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            {showPrompt ? "Hide" : "Show"} generation prompt
            <ChevronDown className={cn("w-3 h-3 transition-transform", showPrompt && "rotate-180")} />
          </button>

          <AnimatePresence>
            {showPrompt && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5">
                  {promptQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-white/30 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading prompt...
                    </div>
                  ) : promptQuery.data ? (
                    <p className="text-white/40 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                      {promptQuery.data.prompt}
                    </p>
                  ) : (
                    <p className="text-white/20 text-xs">Unable to load prompt preview</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback Input (for reject/regenerate) */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-2">
                  <label className="text-white/40 text-xs font-medium">
                    What should be different? (optional)
                  </label>
                  <textarea
                    ref={feedbackRef}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    rows={3}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2.5 text-white/80 text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/40 resize-none"
                    placeholder="e.g., Character should face left, add more dramatic lighting..."
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-[#12121A]/95 backdrop-blur-md border-t border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            {/* Reject / Show Feedback */}
            {isActionable && (
              <AwakliButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (showFeedback) {
                    handleReject();
                  } else {
                    setShowFeedback(true);
                  }
                }}
                disabled={isLoading}
                className="border-red-500/20 text-red-400 hover:bg-red-500/10"
              >
                <XCircle className="w-4 h-4" />
                {showFeedback ? "Confirm Reject" : "Reject"}
              </AwakliButton>
            )}

            {/* Regenerate */}
            {(isActionable || slice.coreSceneStatus === "rejected") && (
              <AwakliButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!showFeedback) setShowFeedback(true);
                  else handleRegenerate();
                }}
                disabled={isLoading}
              >
                {regenerateMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Regenerating...</>
                ) : (
                  <><RotateCcw className="w-4 h-4" /> {showFeedback ? "Regenerate" : "Regenerate..."}</>
                )}
              </AwakliButton>
            )}

            {/* Generate (if pending) */}
            {isPending && (
              <AwakliButton
                variant="primary"
                size="sm"
                onClick={() => {
                  regenerateMut.mutate({ sliceId: slice.id });
                }}
                disabled={isLoading}
              >
                <Sparkles className="w-4 h-4" /> Generate Preview
              </AwakliButton>
            )}

            <div className="flex-1" />

            {/* Approve */}
            {isActionable && (
              <AwakliButton
                variant="primary"
                size="sm"
                onClick={handleApprove}
                disabled={isLoading}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/20"
              >
                {approveMut.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Approve</>
                )}
              </AwakliButton>
            )}

            {/* Already approved indicator */}
            {isApproved && (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">Approved</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
