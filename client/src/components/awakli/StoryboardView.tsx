/**
 * StoryboardView — Visual storyboard grid for slice approval
 *
 * Displays all 10-second slices as a visual timeline. Each card shows:
 * - Preview image (or placeholder with generating animation)
 * - Slice number, duration, characters, tier badge
 * - Status indicator (pending/generating/generated/approved/rejected)
 *
 * Batch actions: Generate All, Approve All, cost summary
 */

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AwakliiBadge } from "./AwakliiBadge";
import { AwakliButton } from "./AwakliButton";
import { SliceDetailModal } from "./SliceDetailModal";
import { StoryboardCostBar } from "./StoryboardCostBar";
import {
  Image, CheckCircle2, XCircle, Loader2, Clock, Eye,
  Sparkles, Play, Users, MessageSquare, Mic, Zap,
  ChevronDown, ChevronUp, RotateCcw, CheckCheck,
  Film, Timer, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────

interface StoryboardSlice {
  id: number;
  sliceNumber: number;
  durationSeconds: number;
  characters: Array<{ name: string; role?: string }> | any[];
  dialogue: Array<{ character: string; text: string; emotion: string }> | any[];
  actionDescription: string | null;
  cameraAngle: string | null;
  mood: string | null;
  complexityTier: string | null;
  klingModel: string | null;
  klingMode: string | null;
  lipSyncRequired: boolean;
  coreSceneImageUrl: string | null;
  coreSceneStatus: string;
  estimatedCredits: number;
}

interface StoryboardData {
  episodeId: number;
  totalSlices: number;
  statusCounts: {
    pending: number;
    generating: number;
    generated: number;
    approved: number;
    rejected: number;
  };
  allGenerated: boolean;
  allApproved: boolean;
  readyForVideoGeneration: boolean;
  slices: StoryboardSlice[];
}

// ─── Tier Config ────────────────────────────────────────────────────────

const TIER_CONFIG: Record<string, { color: string; bg: string; label: string; shortLabel: string }> = {
  "1": { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", label: "V3 Omni", shortLabel: "T1" },
  "2": { color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)", label: "V2.6", shortLabel: "T2" },
  "3": { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", label: "V2.1", shortLabel: "T3" },
  "4": { color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)", label: "V1.6", shortLabel: "T4" },
};

const STATUS_CONFIG: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  label: string;
  pulse?: boolean;
}> = {
  pending:    { icon: Clock,        color: "text-gray-400",    bg: "bg-gray-500/10",    label: "Pending" },
  generating: { icon: Loader2,      color: "text-cyan-400",    bg: "bg-cyan-500/10",    label: "Generating", pulse: true },
  generated:  { icon: Eye,          color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Review" },
  approved:   { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Approved" },
  rejected:   { icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10",     label: "Rejected" },
};

// ─── Slice Card ─────────────────────────────────────────────────────────

function SliceCard({
  slice,
  onClick,
  index,
}: {
  slice: StoryboardSlice;
  onClick: () => void;
  index: number;
}) {
  const status = STATUS_CONFIG[slice.coreSceneStatus] || STATUS_CONFIG.pending;
  const StatusIcon = status.icon;
  const tier = TIER_CONFIG[slice.complexityTier || "3"];

  const totalDuration = slice.durationSeconds;
  const hasDialogue = slice.dialogue && slice.dialogue.length > 0;
  const characterCount = slice.characters?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      onClick={onClick}
      className={cn(
        "group relative rounded-xl overflow-hidden border cursor-pointer transition-all duration-300",
        "hover:border-white/20 hover:shadow-lg hover:shadow-purple-500/5",
        slice.coreSceneStatus === "approved"
          ? "border-emerald-500/30 bg-emerald-500/[0.03]"
          : slice.coreSceneStatus === "rejected"
          ? "border-red-500/30 bg-red-500/[0.03]"
          : slice.coreSceneStatus === "generated"
          ? "border-blue-400/20 bg-blue-500/[0.02]"
          : "border-white/5 bg-[#0D0D1A]"
      )}
    >
      {/* Preview Image Area */}
      <div className="relative aspect-video bg-[#080812] overflow-hidden">
        {slice.coreSceneImageUrl ? (
          <img
            src={slice.coreSceneImageUrl}
            alt={`Slice ${slice.sliceNumber} preview`}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {slice.coreSceneStatus === "generating" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-cyan-400/60 text-[10px] font-medium">Generating...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Image className="w-8 h-8 text-white/10" />
                <span className="text-white/15 text-[10px]">No preview</span>
              </div>
            )}
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D1A] via-transparent to-transparent opacity-80" />

        {/* Top-left: Slice number */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold px-2 py-0.5 rounded-md border border-white/10">
            #{slice.sliceNumber}
          </span>
          <span className="bg-black/60 backdrop-blur-sm text-white/60 text-[10px] px-1.5 py-0.5 rounded-md border border-white/5">
            {totalDuration}s
          </span>
        </div>

        {/* Top-right: Status badge */}
        <div className="absolute top-2 right-2">
          <div className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm border",
            status.bg,
            status.color,
            "border-white/10"
          )}>
            <StatusIcon className={cn("w-3 h-3", status.pulse && "animate-spin")} />
            {status.label}
          </div>
        </div>

        {/* Bottom-left: Tier badge */}
        <div className="absolute bottom-2 left-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
            style={{
              color: tier.color,
              backgroundColor: tier.bg,
              borderColor: `${tier.color}33`,
            }}
          >
            {tier.shortLabel} {tier.label}
          </span>
        </div>

        {/* Bottom-right: Feature indicators */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {slice.lipSyncRequired && (
            <span className="bg-black/60 backdrop-blur-sm p-1 rounded border border-white/5" title="Lip sync required">
              <Mic className="w-3 h-3 text-purple-400" />
            </span>
          )}
          {hasDialogue && (
            <span className="bg-black/60 backdrop-blur-sm p-1 rounded border border-white/5" title="Has dialogue">
              <MessageSquare className="w-3 h-3 text-amber-400" />
            </span>
          )}
          {characterCount > 0 && (
            <span className="bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/5 text-[10px] text-white/50 flex items-center gap-0.5" title={`${characterCount} character(s)`}>
              <Users className="w-3 h-3" />
              {characterCount}
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3 space-y-2">
        {/* Action description */}
        <p className="text-white/60 text-xs leading-relaxed line-clamp-2 min-h-[2.5rem]">
          {slice.actionDescription || "No description"}
        </p>

        {/* Characters */}
        {characterCount > 0 && (
          <div className="flex flex-wrap gap-1">
            {slice.characters.slice(0, 3).map((char, i) => (
              <span
                key={i}
                className="text-[10px] text-white/40 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/5"
              >
                {char.name}
              </span>
            ))}
            {characterCount > 3 && (
              <span className="text-[10px] text-white/30 px-1 py-0.5">
                +{characterCount - 3}
              </span>
            )}
          </div>
        )}

        {/* Credits */}
        <div className="flex items-center justify-between pt-1 border-t border-white/5">
          <span className="text-[10px] text-white/30 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {slice.estimatedCredits} credits
          </span>
          {slice.mood && (
            <span className="text-[10px] text-white/20 italic">{slice.mood}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Batch Actions Toolbar ──────────────────────────────────────────────

function BatchToolbar({
  statusCounts,
  totalSlices,
  onGenerateAll,
  onApproveAll,
  isGenerating,
  isApproving,
}: {
  statusCounts: StoryboardData["statusCounts"];
  totalSlices: number;
  onGenerateAll: () => void;
  onApproveAll: () => void;
  isGenerating: boolean;
  isApproving: boolean;
}) {
  const pendingCount = statusCounts.pending + statusCounts.rejected;
  const generatedCount = statusCounts.generated;
  const approvedCount = statusCounts.approved;
  const progressPct = totalSlices > 0 ? ((approvedCount / totalSlices) * 100) : 0;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0D0D1A] border border-white/5 rounded-xl p-4">
      {/* Progress */}
      <div className="flex-1 w-full sm:w-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50">Storyboard Progress</span>
          <span className="text-xs text-white/30">{approvedCount}/{totalSlices} approved</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex gap-3 mt-2 text-[10px]">
          <span className="text-gray-500">{statusCounts.pending} pending</span>
          <span className="text-cyan-400/60">{statusCounts.generating} generating</span>
          <span className="text-blue-400/60">{statusCounts.generated} to review</span>
          <span className="text-emerald-400/60">{approvedCount} approved</span>
          {statusCounts.rejected > 0 && (
            <span className="text-red-400/60">{statusCounts.rejected} rejected</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-shrink-0">
        {pendingCount > 0 && (
          <AwakliButton
            variant="secondary"
            size="sm"
            onClick={onGenerateAll}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Generate {pendingCount} Preview{pendingCount > 1 ? "s" : ""}</>
            )}
          </AwakliButton>
        )}
        {generatedCount > 0 && (
          <AwakliButton
            variant="secondary"
            size="sm"
            onClick={onApproveAll}
            disabled={isApproving}
          >
            {isApproving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Approving...</>
            ) : (
              <><CheckCheck className="w-3.5 h-3.5" /> Approve All ({generatedCount})</>
            )}
          </AwakliButton>
        )}
      </div>
    </div>
  );
}

// ─── Timeline Header ────────────────────────────────────────────────────

function TimelineHeader({ slices }: { slices: StoryboardSlice[] }) {
  const totalDuration = useMemo(
    () => slices.reduce((sum, s) => sum + s.durationSeconds, 0),
    [slices]
  );
  const minutes = Math.floor(totalDuration / 60);
  const seconds = totalDuration % 60;

  return (
    <div className="flex items-center gap-3 text-xs text-white/30">
      <div className="flex items-center gap-1.5">
        <Film className="w-4 h-4" />
        <span>{slices.length} slices</span>
      </div>
      <span className="text-white/10">|</span>
      <div className="flex items-center gap-1.5">
        <Timer className="w-4 h-4" />
        <span>{minutes}m {seconds}s total</span>
      </div>
    </div>
  );
}

// ─── Main StoryboardView ────────────────────────────────────────────────

interface StoryboardViewProps {
  episodeId: number;
  onProceedToVideo?: () => void;
}

export function StoryboardView({ episodeId, onProceedToVideo }: StoryboardViewProps) {
  const [selectedSlice, setSelectedSlice] = useState<StoryboardSlice | null>(null);

  // ─── Data Fetching ──────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const storyboardQuery = trpc.coreScene.getStoryboard.useQuery(
    { episodeId },
    { refetchInterval: 5000 }  // Poll for generating status updates
  );

  const generateBatchMut = trpc.coreScene.generateBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Generated ${data.generated} preview${data.generated > 1 ? "s" : ""}`, {
        description: data.failed > 0 ? `${data.failed} failed — you can retry them individually` : undefined,
      });
      utils.coreScene.getStoryboard.invalidate({ episodeId });
    },
    onError: (err) => {
      toast.error("Batch generation failed", { description: err.message });
    },
  });

  const approveAllMut = trpc.coreScene.approveAll.useMutation({
    onSuccess: (data) => {
      toast.success(`Approved ${data.approved} slice${data.approved > 1 ? "s" : ""}`);
      utils.coreScene.getStoryboard.invalidate({ episodeId });
    },
    onError: (err) => {
      toast.error("Bulk approval failed", { description: err.message });
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────

  const handleGenerateAll = useCallback(() => {
    generateBatchMut.mutate({ episodeId, concurrency: 2 });
  }, [episodeId, generateBatchMut]);

  const handleApproveAll = useCallback(() => {
    approveAllMut.mutate({ episodeId });
  }, [episodeId, approveAllMut]);

  const handleSliceUpdated = useCallback(() => {
    utils.coreScene.getStoryboard.invalidate({ episodeId });
  }, [episodeId, utils]);

  // ─── Render ─────────────────────────────────────────────────────────

  if (storyboardQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-white/30 text-sm">Loading storyboard...</p>
      </div>
    );
  }

  if (storyboardQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-white/50 text-sm">Failed to load storyboard</p>
        <p className="text-white/30 text-xs">{storyboardQuery.error.message}</p>
        <AwakliButton variant="secondary" size="sm" onClick={() => storyboardQuery.refetch()}>
          <RotateCcw className="w-3.5 h-3.5" /> Retry
        </AwakliButton>
      </div>
    );
  }

  const data = storyboardQuery.data as unknown as StoryboardData;
  if (!data || data.totalSlices === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Film className="w-12 h-12 text-white/10" />
        <p className="text-white/40 text-sm">No slices found</p>
        <p className="text-white/20 text-xs">Run script decomposition first to create slices.</p>
      </div>
    );
  }

  const totalCredits = data.slices.reduce((sum, s) => sum + s.estimatedCredits, 0);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            Storyboard Preview
          </h2>
          <p className="text-white/40 text-xs mt-1">
            Review each scene before generating video. Approve, reject, or regenerate individual slices.
          </p>
        </div>
        <TimelineHeader slices={data.slices} />
      </div>

      {/* Batch Actions */}
      <BatchToolbar
        statusCounts={data.statusCounts}
        totalSlices={data.totalSlices}
        onGenerateAll={handleGenerateAll}
        onApproveAll={handleApproveAll}
        isGenerating={generateBatchMut.isPending}
        isApproving={approveAllMut.isPending}
      />

      {/* Slice Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.slices.map((slice, idx) => (
          <SliceCard
            key={slice.id}
            slice={slice}
            index={idx}
            onClick={() => setSelectedSlice(slice)}
          />
        ))}
      </div>

      {/* Cost Summary Bar (sticky bottom) */}
      <StoryboardCostBar
        totalCredits={totalCredits}
        totalSlices={data.totalSlices}
        approvedCount={data.statusCounts.approved}
        allApproved={data.allApproved}
        onProceed={onProceedToVideo}
      />

      {/* Slice Detail Modal */}
      <AnimatePresence>
        {selectedSlice && (
          <SliceDetailModal
            slice={selectedSlice}
            episodeId={episodeId}
            onClose={() => setSelectedSlice(null)}
            onUpdated={handleSliceUpdated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export type { StoryboardSlice, StoryboardData };
