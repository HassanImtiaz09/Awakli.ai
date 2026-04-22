import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliProgress } from "@/components/awakli/AwakliProgress";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import {
  Play, RotateCcw, CheckCircle, XCircle, Clock, DollarSign,
  ChevronDown, ChevronUp, AlertTriangle, Film, Mic, Music, Layers, Clapperboard,
  Loader2, Eye, Ban, Timer, AlertCircle, Volume2, Shield, ArrowUp, Cpu, BarChart3,
  Columns2, Maximize2, Pause, ShieldAlert, Zap,
} from "lucide-react";
import { QualityBadge } from "@/components/awakli/QualityBadge";
import { CostEstimationCard } from "@/components/awakli/CostEstimationCard";
import { VideoPromptBuilder } from "@/components/awakli/VideoPromptBuilder";
import { ModerationBanner } from "@/components/awakli/ModerationBanner";
import { ModelRoutingWidget } from "@/components/awakli/ModelRoutingWidget";
import { RoutingPreviewModal } from "@/components/awakli/RoutingPreviewModal";
import { SceneTypePanel } from "@/components/awakli/SceneTypePanel";
import { AssemblySettingsPanel } from "@/components/awakli/AssemblySettingsPanel";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────

type NodeName = "video_gen" | "voice_gen" | "lip_sync" | "music_gen" | "foley_gen" | "ambient_gen" | "assembly";
type NodeStatus = "pending" | "running" | "complete" | "failed" | "skipped";

interface NodeConfig {
  id: NodeName;
  label: string;
  icon: typeof Film;
  x: number;
  y: number;
}

const NODES: NodeConfig[] = [
  { id: "video_gen", label: "Video Gen", icon: Film, x: 50, y: 100 },
  { id: "voice_gen", label: "Voice Gen", icon: Mic, x: 200, y: 100 },
  { id: "lip_sync", label: "Lip Sync", icon: Mic, x: 350, y: 100 },
  { id: "music_gen", label: "Music Gen", icon: Music, x: 500, y: 100 },
  { id: "foley_gen", label: "Foley SFX", icon: Volume2, x: 650, y: 100 },
  { id: "ambient_gen", label: "Ambient", icon: Layers, x: 800, y: 100 },
  { id: "assembly", label: "Assembly", icon: Clapperboard, x: 950, y: 100 },
];

const CONNECTIONS: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]];

// ─── Node Graph Component ───────────────────────────────────────────────

function NodeGraph({
  nodeStatuses,
  activeNode,
  onNodeClick,
}: {
  nodeStatuses: Record<NodeName, NodeStatus>;
  activeNode: NodeName | null;
  onNodeClick: (node: NodeName) => void;
}) {
  const getNodeColor = (status: NodeStatus) => {
    switch (status) {
      case "complete": return { fill: "#10b981", stroke: "#34d399", glow: "0 0 20px rgba(16, 185, 129, 0.5)" };
      case "running": return { fill: "#06b6d4", stroke: "#22d3ee", glow: "0 0 25px rgba(6, 182, 212, 0.6)" };
      case "failed": return { fill: "#ef4444", stroke: "#f87171", glow: "0 0 20px rgba(239, 68, 68, 0.5)" };
      case "skipped": return { fill: "#6b7280", stroke: "#9ca3af", glow: "none" };
      default: return { fill: "#374151", stroke: "#6b7280", glow: "none" };
    }
  };

  const getLineColor = (fromIdx: number) => {
    const fromNode = NODES[fromIdx];
    const fromStatus = nodeStatuses[fromNode.id];
    if (fromStatus === "complete") return "#34d399";
    if (fromStatus === "running") return "#22d3ee";
    return "#4b5563";
  };

  return (
    <div className="w-full overflow-x-auto pb-4">
      <svg viewBox="0 0 1000 200" className="w-full min-w-[700px] h-[200px]">
        <defs>
          <filter id="glow-cyan">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Connection lines */}
        {CONNECTIONS.map(([from, to], i) => {
          const fromNode = NODES[from];
          const toNode = NODES[to];
          const color = getLineColor(from);
          const fromStatus = nodeStatuses[fromNode.id];
          const isAnimated = fromStatus === "running";

          return (
            <g key={i}>
              <line
                x1={fromNode.x + 60}
                y1={fromNode.y}
                x2={toNode.x - 60}
                y2={toNode.y}
                stroke={color}
                strokeWidth={3}
                strokeDasharray={isAnimated ? "8 4" : fromStatus === "complete" ? "0" : "6 3"}
                opacity={fromStatus === "pending" ? 0.3 : 1}
              >
                {isAnimated && (
                  <animate
                    attributeName="stroke-dashoffset"
                    from="24"
                    to="0"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                )}
              </line>
              <polygon
                points={`${toNode.x - 60},${toNode.y - 6} ${toNode.x - 60},${toNode.y + 6} ${toNode.x - 50},${toNode.y}`}
                fill={color}
                opacity={fromStatus === "pending" ? 0.3 : 1}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const status = nodeStatuses[node.id];
          const colors = getNodeColor(status);
          const isActive = activeNode === node.id;

          return (
            <g key={node.id} onClick={() => onNodeClick(node.id)} className="cursor-pointer">
              {status === "running" && (
                <rect
                  x={node.x - 55} y={node.y - 40} width={110} height={80} rx={16}
                  fill="none" stroke="#22d3ee" strokeWidth={2} opacity={0.4} filter="url(#glow-cyan)"
                >
                  <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" repeatCount="indefinite" />
                </rect>
              )}
              <rect
                x={node.x - 50} y={node.y - 35} width={100} height={70} rx={12}
                fill={isActive ? colors.fill : `${colors.fill}33`}
                stroke={colors.stroke} strokeWidth={isActive ? 3 : 2}
              />
              {status === "complete" && (
                <text x={node.x + 30} y={node.y - 18} fill="#34d399" fontSize="16" textAnchor="middle">✓</text>
              )}
              {status === "failed" && (
                <text x={node.x + 30} y={node.y - 18} fill="#f87171" fontSize="16" textAnchor="middle">✗</text>
              )}
              {status === "running" && (
                <circle cx={node.x + 30} cy={node.y - 22} r={5} fill="#22d3ee">
                  <animate attributeName="opacity" values="1;0.3;1" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              <text x={node.x} y={node.y + 5} fill="white" fontSize="13" fontWeight="600" textAnchor="middle" fontFamily="Space Grotesk, sans-serif">
                {node.label}
              </text>
              <text x={node.x} y={node.y + 22} fill={colors.stroke} fontSize="10" textAnchor="middle" fontFamily="Inter, sans-serif" style={{ textTransform: "uppercase" }}>
                {status}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Node-Specific Detail Renderers ─────────────────────────────────────

function VideoGenDetail({ assets }: { assets: any[] }) {
  const videoAssets = assets.filter((a: any) => a.assetType === "video_clip" || a.assetType === "video");
  if (videoAssets.length === 0) return <p className="text-gray-500 text-sm">No video clips generated yet.</p>;

  // Count motion LoRA statuses across all video assets
  const motionLoraStats = useMemo(() => {
    let applied = 0, missing = 0, skipped = 0;
    for (const asset of videoAssets) {
      const meta = asset.metadata as any;
      if (meta?.motionLoraUsed) applied++;
      else if (meta?.motionLoraMissing) missing++;
      else if (meta?.motionLoraSkipped) skipped++;
    }
    return { applied, missing, skipped, total: videoAssets.length };
  }, [videoAssets]);

  const MISSING_REASON_LABELS: Record<string, string> = {
    tier_blocked: "Tier does not include Motion LoRA",
    missing: "No motion LoRA trained for this character",
    corrupt: "Motion LoRA file is corrupt",
    scene_skip: "Scene type does not use motion LoRA",
    no_lora: "No LoRA models available",
  };

  return (
    <div className="space-y-3">
      {/* Motion LoRA summary banner */}
      {(motionLoraStats.missing > 0 || motionLoraStats.applied > 0) && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
          motionLoraStats.missing > 0
            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
        }`}>
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span>
            Motion LoRA: {motionLoraStats.applied} applied
            {motionLoraStats.missing > 0 && `, ${motionLoraStats.missing} missing`}
            {motionLoraStats.skipped > 0 && `, ${motionLoraStats.skipped} skipped`}
            {" "}of {motionLoraStats.total} clips
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {videoAssets.map((asset: any, i: number) => {
          const meta = asset.metadata as any;
          const motionMissing = meta?.motionLoraMissing;
          const motionReason = meta?.motionLoraMissingReason;
          const motionUsed = meta?.motionLoraUsed;
          const motionWeight = meta?.motionLoraWeight;

          return (
            <div key={asset.id || i} className={`group relative bg-gray-800/60 rounded-lg overflow-hidden border ${
              motionMissing ? "border-amber-500/40" : "border-gray-700/50"
            }`}>
              <div className="aspect-video bg-gray-900 flex items-center justify-center">
                {asset.url ? (
                  <video src={asset.url} className="w-full h-full object-cover" preload="metadata" />
                ) : (
                  <Film className="w-8 h-8 text-gray-600" />
                )}
                {asset.url && (
                  <a href={asset.url} target="_blank" rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-10 h-10 text-white" />
                  </a>
                )}
                {/* Motion LoRA indicator badge */}
                {motionUsed && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-medium bg-orange-500/80 text-white">
                    LoRA {motionWeight ? `w=${motionWeight}` : ""}
                  </span>
                )}
                {motionMissing && (
                  <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[8px] font-medium bg-amber-500/80 text-white" title={MISSING_REASON_LABELS[motionReason] || motionReason}>
                    LoRA Missing
                  </span>
                )}
              </div>
              <div className="p-2">
                <p className="text-xs text-gray-400 truncate">Panel {meta?.panelNumber || i + 1}</p>
                {meta?.duration && (
                  <p className="text-xs text-token-cyan">{meta.duration}s</p>
                )}
                {motionMissing && motionReason && (
                  <p className="text-[9px] text-amber-400/80 mt-0.5 truncate" title={MISSING_REASON_LABELS[motionReason] || motionReason}>
                    {MISSING_REASON_LABELS[motionReason] || motionReason}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VoiceGenDetail({ assets }: { assets: any[] }) {
  const voiceAssets = assets.filter((a: any) => a.assetType === "voice_clip" || a.assetType === "voice");
  if (voiceAssets.length === 0) return <p className="text-gray-500 text-sm">No voice clips generated yet.</p>;
  return (
    <div className="space-y-2">
      {voiceAssets.map((asset: any, i: number) => (
        <div key={asset.id || i} className="flex items-center gap-3 bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
          <Volume2 className="w-5 h-5 text-token-cyan shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white">{(asset.metadata as any)?.character || `Voice Clip ${i + 1}`}</p>
            <p className="text-xs text-gray-400 truncate">{(asset.metadata as any)?.dialogue || "Dialogue line"}</p>
          </div>
          {/* Simulated waveform visualization */}
          <div className="flex items-end gap-[2px] h-6">
            {Array.from({ length: 20 }, (_, j) => (
              <motion.div
                key={j}
                className="w-[3px] bg-token-cyan/60 rounded-full"
                initial={{ height: 4 }}
                animate={{ height: 4 + Math.random() * 16 }}
                transition={{ duration: 0.4, repeat: Infinity, repeatType: "reverse", delay: j * 0.05 }}
              />
            ))}
          </div>
          {asset.url && (
            <audio controls preload="none" src={asset.url} className="h-8 w-40" />
          )}
        </div>
      ))}
    </div>
  );
}

function LipSyncDetail({ assets, runId, episodeId }: { assets: any[]; runId: number; episodeId: number }) {
  const [selectedPanels, setSelectedPanels] = useState<Set<number>>(new Set());
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [comparisonPanel, setComparisonPanel] = useState<number | null>(null);
  const [comparisonMode, setComparisonMode] = useState<"side-by-side" | "toggle">("side-by-side");
  const [showOriginal, setShowOriginal] = useState(false);

  // Fetch per-panel lip sync statuses
  const statusQuery = trpc.lipSync.getPanelStatuses.useQuery(
    { runId, episodeId },
    { refetchInterval: 5000 }
  );

  const retryMut = trpc.lipSync.retryBatch.useMutation({
    onSuccess: (data) => {
      if (data.started) {
        toast.success(`Lip sync retry started for ${selectedPanels.size} panel(s)`);
        setSelectedPanels(new Set());
        setShowRetryConfirm(false);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err) => toast.error(`Retry failed: ${err.message}`),
  });

  const panels = statusQuery.data?.panels || [];
  const failedPanels = panels.filter((p) => p.status === "failed");
  const syncedPanels = panels.filter((p) => p.status === "synced");
  const retryingPanels = panels.filter((p) => p.status === "retrying");
  const skippedPanels = panels.filter((p) => p.status === "skipped");
  const needsReviewPanels = panels.filter((p) => p.status === "needs_review");
  const retryablePanels = panels.filter((p) => p.status === "failed");

  const togglePanel = (panelId: number) => {
    setSelectedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panelId)) next.delete(panelId);
      else next.add(panelId);
      return next;
    });
  };

  const selectAllFailed = () => {
    setSelectedPanels(new Set(retryablePanels.map((p) => p.panelId)));
  };

  const handleRetry = () => {
    retryMut.mutate({
      runId,
      episodeId,
      panelIds: Array.from(selectedPanels),
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "synced": return <CheckCircle className="w-4 h-4 text-green-400" />;
      case "failed": return <XCircle className="w-4 h-4 text-red-400" />;
      case "skipped": return <Ban className="w-4 h-4 text-gray-500" />;
      case "retrying": return <Loader2 className="w-4 h-4 text-token-cyan animate-spin" />;
      case "needs_review": return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "synced": return "border-green-500/30 bg-green-950/20";
      case "failed": return "border-red-500/30 bg-red-950/20";
      case "skipped": return "border-gray-600/30 bg-gray-900/20";
      case "retrying": return "border-token-cyan/30 bg-cyan-950/20";
      case "needs_review": return "border-amber-500/30 bg-amber-950/20";
      default: return "border-gray-700/30 bg-gray-800/20";
    }
  };

  // Before/After Comparison Modal
  const comparisonPanelData = comparisonPanel !== null
    ? panels.find((p) => p.panelId === comparisonPanel)
    : null;

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading lip sync panel statuses...</span>
      </div>
    );
  }

  if (panels.length === 0) {
    return <p className="text-gray-500 text-sm">No dialogue panels found for this pipeline run.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs text-green-400">{syncedPanels.length} synced</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs text-red-400">{failedPanels.length} failed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Ban className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs text-gray-500">{skippedPanels.length} skipped</span>
        </div>
        {retryingPanels.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 text-token-cyan animate-spin" />
            <span className="text-xs text-token-cyan">{retryingPanels.length} retrying</span>
          </div>
        )}
        {needsReviewPanels.length > 0 && (
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-amber-400">{needsReviewPanels.length} needs review</span>
          </div>
        )}
      </div>

      {/* Needs review warning */}
      {needsReviewPanels.length > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-950/20 border border-amber-500/20">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-sm text-amber-300 font-medium">
              {needsReviewPanels.length} panel(s) need manual review
            </span>
            <p className="text-xs text-amber-400/70 mt-1">
              These panels have exceeded the maximum retry limit (3 attempts). They may require
              re-generating the source video clip with better face visibility, or manual lip sync adjustment.
            </p>
          </div>
        </div>
      )}

      {/* Retry controls */}
      {retryablePanels.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-950/20 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300 flex-1">
            {retryablePanels.length} panel(s) failed lip sync. Select panels below and retry.
          </span>
          <button
            onClick={selectAllFailed}
            className="text-xs text-token-cyan hover:text-white transition-colors px-2 py-1 rounded border border-token-cyan/30 hover:border-token-cyan/60"
          >
            Select All Failed
          </button>
          {selectedPanels.size > 0 && (
            <button
              onClick={() => setShowRetryConfirm(true)}
              disabled={retryMut.isPending}
              className="flex items-center gap-1.5 text-xs text-white bg-token-cyan/20 hover:bg-token-cyan/30 border border-token-cyan/40 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              {retryMut.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              Retry {selectedPanels.size} Panel(s)
            </button>
          )}
        </div>
      )}

      {/* Retry confirmation dialog */}
      {showRetryConfirm && (
        <div className="p-4 rounded-lg bg-gray-800/80 border border-token-cyan/30">
          <p className="text-sm text-white mb-3">
            Retry lip sync for <strong>{selectedPanels.size}</strong> panel(s)? This will delete existing synced clips and re-run face detection + lip sync via Kling API.
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Each panel has a maximum of 3 retry attempts. Panels exceeding this limit will be escalated to manual review.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={retryMut.isPending}
              className="flex items-center gap-1.5 text-xs text-white bg-token-cyan/30 hover:bg-token-cyan/40 border border-token-cyan/50 px-3 py-1.5 rounded transition-colors disabled:opacity-50"
            >
              {retryMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Confirm Retry
            </button>
            <button
              onClick={() => setShowRetryConfirm(false)}
              className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded border border-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Before/After Comparison Modal */}
      {comparisonPanelData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setComparisonPanel(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-5xl w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Columns2 className="w-5 h-5 text-token-cyan" />
                <h3 className="text-lg font-semibold text-white">
                  Before / After — P{comparisonPanelData.sceneNumber}.{comparisonPanelData.panelNumber}
                  <span className="text-sm text-gray-400 ml-2">[{comparisonPanelData.character}]</span>
                </h3>
              </div>
              <div className="flex items-center gap-3">
                {/* Mode toggle */}
                <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                  <button
                    onClick={() => setComparisonMode("side-by-side")}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                      comparisonMode === "side-by-side"
                        ? "bg-token-cyan/20 text-token-cyan border border-token-cyan/30"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Columns2 className="w-3 h-3 inline mr-1" />
                    Side by Side
                  </button>
                  <button
                    onClick={() => { setComparisonMode("toggle"); setShowOriginal(false); }}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                      comparisonMode === "toggle"
                        ? "bg-token-cyan/20 text-token-cyan border border-token-cyan/30"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Eye className="w-3 h-3 inline mr-1" />
                    Toggle
                  </button>
                </div>
                <button onClick={() => setComparisonPanel(null)} className="text-gray-400 hover:text-white transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Dialogue text */}
            <p className="text-sm text-gray-300 italic mb-4">"{comparisonPanelData.dialogueText}"</p>

            {/* Comparison view */}
            {comparisonMode === "side-by-side" ? (
              <div className="grid grid-cols-2 gap-4">
                {/* Original */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-red-400 uppercase tracking-wider">Original</span>
                    <span className="text-[10px] text-gray-500">(No lip sync)</span>
                  </div>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-red-500/20">
                    {comparisonPanelData.originalVideoUrl || comparisonPanelData.videoClipUrl ? (
                      <video
                        src={comparisonPanelData.originalVideoUrl || comparisonPanelData.videoClipUrl}
                        className="w-full h-full object-contain"
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                        Original clip not available
                      </div>
                    )}
                  </div>
                </div>
                {/* Lip-synced */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Lip-Synced</span>
                    {comparisonPanelData.retryCount && comparisonPanelData.retryCount > 0 && (
                      <span className="text-[10px] text-token-cyan bg-token-cyan/10 px-1.5 py-0.5 rounded">
                        Attempt #{(comparisonPanelData.retryCount || 0) + 1}
                      </span>
                    )}
                  </div>
                  <div className="aspect-video bg-black rounded-lg overflow-hidden border border-green-500/20">
                    {comparisonPanelData.syncedClipUrl ? (
                      <video
                        src={comparisonPanelData.syncedClipUrl}
                        className="w-full h-full object-contain"
                        controls
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                        Synced clip not available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Toggle mode */
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <button
                    onClick={() => setShowOriginal(false)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                      !showOriginal
                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                        : "text-gray-400 hover:text-white border border-gray-700"
                    }`}
                  >
                    Lip-Synced
                  </button>
                  <button
                    onClick={() => setShowOriginal(true)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                      showOriginal
                        ? "bg-red-500/20 text-red-400 border border-red-500/30"
                        : "text-gray-400 hover:text-white border border-gray-700"
                    }`}
                  >
                    Original
                  </button>
                  <span className="text-[10px] text-gray-500">
                    Showing: {showOriginal ? "Original (no lip sync)" : "Lip-synced version"}
                  </span>
                </div>
                <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
                  <video
                    key={showOriginal ? "original" : "synced"}
                    src={showOriginal
                      ? (comparisonPanelData.originalVideoUrl || comparisonPanelData.videoClipUrl)
                      : comparisonPanelData.syncedClipUrl
                    }
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    preload="metadata"
                  />
                </div>
              </div>
            )}

            {/* Processing info */}
            {comparisonPanelData.processingTimeMs && comparisonPanelData.processingTimeMs > 0 && (
              <p className="text-[10px] text-gray-500 mt-3">
                Lip sync processed in {(comparisonPanelData.processingTimeMs / 1000).toFixed(1)}s
              </p>
            )}
          </div>
        </div>
      )}

      {/* Panel grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {panels.map((panel) => {
          const isSelected = selectedPanels.has(panel.panelId);
          const canSelect = panel.status === "failed";
          const canCompare = panel.status === "synced" && panel.syncedClipUrl && (panel.originalVideoUrl || panel.videoClipUrl);

          return (
            <div
              key={panel.panelId}
              onClick={() => canSelect && togglePanel(panel.panelId)}
              className={`rounded-lg p-3 border transition-all ${
                statusColor(panel.status)
              } ${
                isSelected ? "ring-2 ring-token-cyan/60 border-token-cyan/50" : ""
              } ${
                canSelect ? "cursor-pointer hover:border-token-cyan/40" : ""
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {canSelect && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePanel(panel.panelId)}
                      className="w-3.5 h-3.5 rounded border-gray-600 text-token-cyan focus:ring-token-cyan/30"
                    />
                  )}
                  {statusIcon(panel.status)}
                  <span className="text-sm font-medium text-white">
                    P{panel.sceneNumber}.{panel.panelNumber}
                  </span>
                  <span className="text-xs text-gray-400">[{panel.character}]</span>
                  {panel.isRetry && (
                    <span className="text-[10px] text-token-cyan bg-token-cyan/10 px-1.5 py-0.5 rounded">
                      Retried
                    </span>
                  )}
                  {panel.retryCount !== undefined && panel.retryCount > 0 && (
                    <span className="text-[10px] text-gray-500">
                      ({panel.retryCount}/3 attempts)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canCompare && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setComparisonPanel(panel.panelId); }}
                      className="flex items-center gap-1 text-[10px] text-token-cyan hover:text-white transition-colors px-1.5 py-0.5 rounded border border-token-cyan/20 hover:border-token-cyan/40 bg-token-cyan/5"
                      title="Compare before/after lip sync"
                    >
                      <Columns2 className="w-3 h-3" />
                      Compare
                    </button>
                  )}
                  <span className={`text-[10px] uppercase font-medium tracking-wider ${
                    panel.status === "synced" ? "text-green-400" :
                    panel.status === "failed" ? "text-red-400" :
                    panel.status === "retrying" ? "text-token-cyan" :
                    panel.status === "needs_review" ? "text-amber-400" :
                    "text-gray-500"
                  }`}>
                    {panel.status === "needs_review" ? "REVIEW" : panel.status}
                  </span>
                </div>
              </div>

              {/* Dialogue text */}
              <p className="text-xs text-gray-300 mb-2 line-clamp-2 italic">
                "{panel.dialogueText}"
              </p>

              {/* Video preview for synced panels */}
              {panel.status === "synced" && panel.syncedClipUrl && (
                <div className="aspect-video bg-gray-900 rounded overflow-hidden border border-green-500/20 mb-2">
                  <video
                    src={panel.syncedClipUrl}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    controls
                  />
                </div>
              )}

              {/* Failure reason */}
              {(panel.status === "failed" || panel.status === "needs_review") && panel.failureReason && (
                <p className={`text-[11px] mt-1 ${
                  panel.status === "needs_review" ? "text-amber-400/80" : "text-red-400/80"
                }`}>
                  {panel.failureReason}
                </p>
              )}

              {/* Processing time for synced panels */}
              {panel.processingTimeMs && panel.processingTimeMs > 0 && (
                <p className="text-[10px] text-gray-500 mt-1">
                  Processed in {(panel.processingTimeMs / 1000).toFixed(1)}s
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MusicGenDetail({ assets }: { assets: any[] }) {
  const musicAssets = assets.filter((a: any) => a.assetType === "music" || a.assetType === "bgm");
  if (musicAssets.length === 0) return <p className="text-gray-500 text-sm">No music segments generated yet.</p>;
  return (
    <div className="space-y-3">
      {musicAssets.map((asset: any, i: number) => (
        <div key={asset.id || i} className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-token-violet" />
              <span className="text-sm text-white">{(asset.metadata as any)?.name || `Music Segment ${i + 1}`}</span>
            </div>
            {(asset.metadata as any)?.duration && (
              <span className="text-xs text-gray-400">{(asset.metadata as any).duration}s</span>
            )}
          </div>
          {/* Audio player bar */}
          {asset.url ? (
            <audio controls preload="none" src={asset.url} className="w-full h-8" />
          ) : (
            <div className="h-8 bg-gray-900 rounded flex items-center px-3">
              <div className="flex items-end gap-[1px] h-4 flex-1">
                {Array.from({ length: 50 }, (_, j) => (
                  <div
                    key={j}
                    className="flex-1 bg-token-violet/40 rounded-t"
                    style={{ height: `${20 + Math.random() * 80}%` }}
                  />
                ))}
              </div>
            </div>
          )}
          {(asset.metadata as any)?.mood && (
            <p className="text-xs text-gray-400 mt-1">Mood: {(asset.metadata as any).mood}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function FoleyGenDetail({ assets }: { assets: any[] }) {
  const foleyAssets = assets.filter((a: any) => a.assetType === "sfx_clip" || a.assetType === "foley" || a.assetType === "sfx" || a.nodeSource === "sfx_gen");
  if (foleyAssets.length === 0) return <p className="text-gray-500 text-sm">No foley sound effects generated yet.</p>;

  const categories = new Map<string, any[]>();
  for (const a of foleyAssets) {
    const cat = (a.metadata as any)?.category || (a.metadata as any)?.ambientCategory || "sfx";
    if ((a.metadata as any)?.isAmbient) continue; // Skip ambient assets
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(a);
  }

  const categoryIcons: Record<string, string> = {
    impact: "\u{1F4A5}", human: "\u{1F9CD}", mechanical: "\u{2699}\uFE0F", nature: "\u{1F33F}", ui: "\u{2728}",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Volume2 className="w-4 h-4" />
        <span>{foleyAssets.filter((a: any) => !(a.metadata as any)?.isAmbient).length} foley clips generated</span>
      </div>
      {Array.from(categories.entries()).map(([cat, catAssets]) => (
        <div key={cat}>
          <h4 className="text-xs font-semibold text-token-cyan/80 uppercase tracking-wider mb-2">
            {categoryIcons[cat] || "\u{1F50A}"} {cat}
          </h4>
          <div className="space-y-1">
            {catAssets.map((asset: any, i: number) => (
              <div key={asset.id || i} className="flex items-center gap-3 bg-gray-800/60 rounded-lg p-2 border border-gray-700/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {(asset.metadata as any)?.sfxType || `SFX ${i + 1}`}
                    {(asset.metadata as any)?.panelNumber && (
                      <span className="text-gray-500 ml-1">P{(asset.metadata as any).sceneNumber}.{(asset.metadata as any).panelNumber}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{(asset.metadata as any)?.audioPrompt || ""}</p>
                </div>
                {(asset.metadata as any)?.duration && (
                  <span className="text-xs text-gray-400 shrink-0">{Number((asset.metadata as any).duration).toFixed(1)}s</span>
                )}
                {asset.url && <audio controls preload="none" src={asset.url} className="h-7 w-32 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AmbientGenDetail({ assets }: { assets: any[] }) {
  const ambientAssets = assets.filter((a: any) =>
    (a.metadata as any)?.isAmbient || a.assetType === "ambient" || a.nodeSource === "ambient_gen"
  );
  if (ambientAssets.length === 0) return <p className="text-gray-500 text-sm">No ambient audio generated yet.</p>;

  const primary = ambientAssets.filter((a: any) => (a.metadata as any)?.isPrimary !== false);
  const secondary = ambientAssets.filter((a: any) => (a.metadata as any)?.isPrimary === false);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Layers className="w-4 h-4" />
        <span>{primary.length} scene{primary.length !== 1 ? "s" : ""} detected{secondary.length > 0 ? `, ${secondary.length} secondary layers` : ""}</span>
      </div>
      {ambientAssets.map((asset: any, i: number) => (
        <div key={asset.id || i} className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Layers className={`w-4 h-4 ${(asset.metadata as any)?.isPrimary !== false ? "text-token-cyan" : "text-gray-500"}`} />
              <span className="text-sm text-white">
                Scene {(asset.metadata as any)?.sceneNumber || "?"}: {(asset.metadata as any)?.ambientLabel || "Ambient"}
              </span>
              {(asset.metadata as any)?.isPrimary === false && (
                <span className="text-xs bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded">secondary</span>
              )}
            </div>
            {(asset.metadata as any)?.duration && (
              <span className="text-xs text-gray-400">{Number((asset.metadata as any).duration).toFixed(1)}s</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {(asset.metadata as any)?.location && <span>{(asset.metadata as any).location}</span>}
            {(asset.metadata as any)?.timeOfDay && <span>| {(asset.metadata as any).timeOfDay}</span>}
            {(asset.metadata as any)?.mood && <span>| {(asset.metadata as any).mood}</span>}
          </div>
          {asset.url && <audio controls preload="none" src={asset.url} className="w-full h-8 mt-2" />}
        </div>
      ))}
    </div>
  );
}

function AssemblyDetail({ assets, runId }: { assets: any[]; runId: number }) {
  const finalAsset = assets.find((a: any) => a.assetType === "final_video" || a.assetType === "assembled");
  const subtitleAsset = assets.find((a: any) => a.assetType === "subtitle" || a.assetType === "srt");
  const thumbnailAsset = assets.find((a: any) => a.assetType === "thumbnail");

  return (
    <div className="space-y-4">
      {finalAsset?.url ? (
        <div className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700/50">
          <video
            src={finalAsset.url}
            controls
            className="w-full max-h-[400px]"
            poster={thumbnailAsset?.url}
          />
        </div>
      ) : (
        <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center border border-gray-700/50">
          <div className="text-center">
            <Clapperboard className="w-10 h-10 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Final video not yet assembled</p>
          </div>
        </div>
      )}
      <div className="flex gap-3">
        {finalAsset?.url && (
          <a href={finalAsset.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-token-cyan hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" /> View Full Video
          </a>
        )}
        {subtitleAsset?.url && (
          <a href={subtitleAsset.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-token-cyan hover:underline flex items-center gap-1">
            Download Subtitles
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Node Detail Panel ──────────────────────────────────────────────────

function NodeDetailPanel({
  node,
  assets,
  nodeCosts,
  nodeTimings,
  errors,
  runId,
  episodeId,
}: {
  node: NodeName;
  assets: any[];
  nodeCosts: Record<string, number>;
  nodeTimings: Record<string, number>;
  errors: any[];
  runId: number;
  episodeId: number;
}) {
  const nodeAssets = assets.filter((a: any) => {
    const source = a.nodeSource || a.assetType;
    const nodeTypeMap: Record<NodeName, string[]> = {
      video_gen: ["video_clip", "video"],
      voice_gen: ["voice_clip", "voice"],
      lip_sync: ["synced_clip"],
      music_gen: ["music", "bgm"],
      foley_gen: ["sfx_clip", "foley", "sfx"],
      ambient_gen: ["ambient"],
      assembly: ["final_video", "assembled", "subtitle", "srt", "thumbnail"],
    };
    return nodeTypeMap[node]?.includes(source) || a.nodeSource === node;
  });

  const cost = nodeCosts[node] || 0;
  const timing = nodeTimings[node] || 0;
  const nodeErrors = errors.filter((e: any) => e.node === node);

  const nodeLabels: Record<NodeName, string> = {
    video_gen: "Video Generation (Kling V3 Omni)",
    voice_gen: "Voice Generation",
    lip_sync: "Lip Sync (Face Detection + Audio Sync)",
    music_gen: "Background Music",
    foley_gen: "Foley Sound Effects",
    ambient_gen: "Ambient Scene Audio",
    assembly: "Final Assembly",
  };

  const renderNodeContent = () => {
    switch (node) {
      case "video_gen": return <VideoGenDetail assets={nodeAssets} />;
      case "voice_gen": return <VoiceGenDetail assets={nodeAssets} />;
      case "lip_sync": return <LipSyncDetail assets={nodeAssets} runId={runId} episodeId={episodeId} />;
      case "music_gen": return <MusicGenDetail assets={nodeAssets} />;
      case "foley_gen": return <FoleyGenDetail assets={nodeAssets} />;
      case "ambient_gen": return <AmbientGenDetail assets={nodeAssets} />;
      case "assembly": return <AssemblyDetail assets={nodeAssets} runId={runId} />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <AwakliCard className="mt-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white font-display">{nodeLabels[node]}</h3>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Timer className="w-4 h-4" />
              {timing > 0 ? `${timing}s` : "—"}
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              ${(cost / 100).toFixed(2)}
            </span>
            <span className="flex items-center gap-1">
              <Layers className="w-4 h-4" />
              {nodeAssets.length} outputs
            </span>
          </div>
        </div>

        {/* Node-specific content */}
        {renderNodeContent()}

        {/* Error log */}
        {nodeErrors.length > 0 && (
          <div className="mt-4 border-t border-gray-700/50 pt-4">
            <h4 className="text-sm font-medium text-red-400 flex items-center gap-1 mb-2">
              <AlertCircle className="w-4 h-4" /> Error Log
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {nodeErrors.map((err: any, i: number) => (
                <div key={i} className="text-xs font-mono text-red-300/80 bg-red-900/20 rounded px-3 py-1.5">
                  {err.message || err.error || JSON.stringify(err)}
                </div>
              ))}
            </div>
          </div>
        )}
      </AwakliCard>
    </motion.div>
  );
}

// ─── Episode Pipeline Table ─────────────────────────────────────────────

function EpisodePipelineTable({
  episodes,
  runs,
  onStartPipeline,
  onBatchStart,
  onViewRun,
  onPreviewRouting,
  projectId,
}: {
  episodes: any[];
  runs: any[];
  onStartPipeline: (episodeId: number) => void;
  onBatchStart: (episodeIds: number[]) => void;
  onViewRun: (runId: number) => void;
  onPreviewRouting: (episodeId: number, episodeTitle: string) => void;
  projectId: number;
}) {
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(new Set());

  const getLatestRun = (episodeId: number) => {
    const episodeRuns = runs.filter((r: any) => r.episodeId === episodeId);
    return episodeRuns.length > 0 ? episodeRuns[episodeRuns.length - 1] : null;
  };

  const formatDuration = (run: any) => {
    if (!run?.createdAt) return "—";
    const start = new Date(run.createdAt).getTime();
    const end = run.completedAt ? new Date(run.completedAt).getTime() : Date.now();
    const secs = Math.floor((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selectedEpisodes);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedEpisodes(next);
  };

  const selectableEpisodes = episodes.filter((ep: any) => {
    const run = getLatestRun(ep.id);
    const canStart = ep.status === "locked" || ep.status === "approved";
    return canStart && !run?.status?.match(/running|pending/);
  });

  const selectAll = () => {
    if (selectedEpisodes.size === selectableEpisodes.length) {
      setSelectedEpisodes(new Set());
    } else {
      setSelectedEpisodes(new Set(selectableEpisodes.map((ep: any) => ep.id)));
    }
  };

  return (
    <AwakliCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white font-display">Episode Pipeline Status</h3>
        <div className="flex items-center gap-2">
          {selectedEpisodes.size === 1 && (
            <AwakliButton
              variant="secondary"
              size="sm"
              onClick={() => {
                const epId = Array.from(selectedEpisodes)[0];
                const ep = episodes.find((e: any) => e.id === epId);
                onPreviewRouting(epId, ep ? `Ep ${ep.episodeNumber}: ${ep.title}` : `Episode ${epId}`);
              }}
            >
              <Cpu className="w-4 h-4 mr-1" />
              Preview Routing
            </AwakliButton>
          )}
          {selectedEpisodes.size > 0 && (
            <AwakliButton
              variant="primary"
              size="sm"
              onClick={() => {
                onBatchStart(Array.from(selectedEpisodes));
                setSelectedEpisodes(new Set());
              }}
            >
              <Play className="w-4 h-4 mr-1" />
              Start Pipeline ({selectedEpisodes.size})
            </AwakliButton>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700/50 text-gray-400">
              <th className="text-left py-3 px-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedEpisodes.size === selectableEpisodes.length && selectableEpisodes.length > 0}
                  onChange={selectAll}
                  className="rounded border-gray-600 bg-gray-800 text-token-violet focus:ring-token-violet/50"
                />
              </th>
              <th className="text-left py-3 px-2">Episode</th>
              <th className="text-left py-3 px-2">Status</th>
              <th className="text-left py-3 px-2">Progress</th>
              <th className="text-left py-3 px-2">Duration</th>
              <th className="text-left py-3 px-2">Cost</th>
              <th className="text-right py-3 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {episodes.map((ep: any) => {
              const run = getLatestRun(ep.id);
              const canStart = ep.status === "locked" || ep.status === "approved";
              const isSelectable = canStart && !run?.status?.match(/running|pending/);

              return (
                <tr key={ep.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-3 px-2">
                    <input
                      type="checkbox"
                      checked={selectedEpisodes.has(ep.id)}
                      onChange={() => toggleSelect(ep.id)}
                      disabled={!isSelectable}
                      className="rounded border-gray-600 bg-gray-800 text-token-violet focus:ring-token-violet/50 disabled:opacity-30"
                    />
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-white font-medium">Ep {ep.episodeNumber}</span>
                    <span className="text-gray-400 ml-2">{ep.title}</span>
                  </td>
                  <td className="py-3 px-2">
                    {run ? (
                      <AwakliiBadge variant={run.status === "completed" ? "success" : run.status === "failed" ? "error" : "cyan"}>{run.status}</AwakliiBadge>
                    ) : (
                      <span className="text-gray-500">Not started</span>
                    )}
                  </td>
                  <td className="py-3 px-2 w-36">
                    {run ? (
                      <div className="flex items-center gap-2">
                        <AwakliProgress value={run.progress || 0} className="flex-1" />
                        <span className="text-xs text-gray-400">{run.progress || 0}%</span>
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    <span className="text-gray-300 text-xs font-mono">{formatDuration(run)}</span>
                  </td>
                  <td className="py-3 px-2">
                    {run?.totalCost ? (
                      <span className="text-token-cyan">${(run.totalCost / 100).toFixed(2)}</span>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {run && (
                        <AwakliButton variant="ghost" size="sm" onClick={() => onViewRun(run.id)}>
                          <Eye className="w-4 h-4" />
                        </AwakliButton>
                      )}
                      {canStart && !run?.status?.match(/running|pending/) && (
                        <>
                          <AwakliButton
                            variant="ghost"
                            size="sm"
                            onClick={() => onPreviewRouting(ep.id, `Ep ${ep.episodeNumber}: ${ep.title}`)}
                            title="Preview model routing and cost estimate"
                          >
                            <Cpu className="w-4 h-4" />
                          </AwakliButton>
                          <AwakliButton variant="secondary" size="sm" onClick={() => onStartPipeline(ep.id)}>
                            <Play className="w-4 h-4 mr-1" /> Start
                          </AwakliButton>
                        </>
                      )}
                      {run?.status === "failed" && (
                        <AwakliButton variant="secondary" size="sm" onClick={() => onStartPipeline(ep.id)}>
                          <RotateCcw className="w-4 h-4 mr-1" /> Retry
                        </AwakliButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AwakliCard>
  );
}

// ─── Main Pipeline Dashboard ────────────────────────────────────────────

export default function PipelineDashboard() {
  const { user } = useAuth();
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const [, navigate] = useLocation();

  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [expandedNode, setExpandedNode] = useState<NodeName | null>(null);
  const [previewEpisode, setPreviewEpisode] = useState<{ id: number; title: string } | null>(null);
  const [sceneAnalysisOpen, setSceneAnalysisOpen] = useState(true);
  const [selectedAnalysisEpisodeId, setSelectedAnalysisEpisodeId] = useState<number | null>(null);

  // Queries
  const episodesQuery = trpc.episodes.listByProject.useQuery(
    { projectId },
    { enabled: !!user && !!projectId }
  );

  const runsQuery = trpc.pipeline.listByProject.useQuery(
    { projectId },
    { enabled: !!user && !!projectId, refetchInterval: 5000 }
  );

  const costQuery = trpc.pipeline.getCostSummary.useQuery(
    { projectId },
    { enabled: !!user && !!projectId }
  );

  // Auto-select first episode for scene analysis
  const analysisEpisodeId = selectedAnalysisEpisodeId ?? (episodesQuery.data?.[0]?.id ?? null);

  // Fetch panels for the selected episode to feed SceneTypePanel
  const panelsForAnalysis = trpc.panels.listByEpisode.useQuery(
    { episodeId: analysisEpisodeId! },
    { enabled: !!user && !!analysisEpisodeId }
  );

  // Group panels into scenes for SceneTypePanel
  const scenesForAnalysis = useMemo(() => {
    if (!panelsForAnalysis.data) return [];
    const sorted = [...panelsForAnalysis.data].sort(
      (a: any, b: any) => a.sceneNumber - b.sceneNumber || a.panelNumber - b.panelNumber
    );
    const sceneMap = new Map<number, typeof sorted>();
    sorted.forEach((p: any) => {
      const arr = sceneMap.get(p.sceneNumber) || [];
      arr.push(p);
      sceneMap.set(p.sceneNumber, arr);
    });
    return Array.from(sceneMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([sceneNum, panels]) => ({
        sceneId: panels[0]?.id ?? sceneNum,
        sceneNumber: sceneNum,
        panels: panels.map((p: any) => ({
          panelId: p.id,
          visualDescription: p.visualDescription || "",
          cameraAngle: p.cameraAngle || undefined,
          dialogue: Array.isArray(p.dialogue)
            ? p.dialogue.map((d: any) => ({ character: d.character, text: d.text || d.line || "" }))
            : [],
          panelSizePct: 50,
        })),
        estimatedDurationS: Math.max(5, panels.length * 3),
      }));
  }, [panelsForAnalysis.data]);

  // Collapse scene analysis when a pipeline is active
  const hasActiveRun = !!(runsQuery.data || []).find((r: any) => r.status === "running" || r.status === "pending");

  // Active run details
  const activeRunQuery = trpc.pipeline.getStatus.useQuery(
    { runId: activeRunId! },
    { enabled: !!activeRunId, refetchInterval: activeRunId ? 3000 : false }
  );

  const assetsQuery = trpc.pipeline.getAssets.useQuery(
    { runId: activeRunId! },
    { enabled: !!activeRunId }
  );

  // Mutations
  const startMut = trpc.pipeline.start.useMutation({
    onSuccess: (data) => {
      toast.success("Pipeline started!");
      setActiveRunId(data.runId);
      runsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const retryMut = trpc.pipeline.retry.useMutation({
    onSuccess: (data) => {
      toast.success("Pipeline retry started!");
      setActiveRunId(data.runId);
      runsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMut = trpc.pipeline.cancel.useMutation({
    onSuccess: () => {
      toast.success("Pipeline cancelled");
      runsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Derived state
  const activeRun = activeRunQuery.data;
  const nodeStatuses: Record<NodeName, NodeStatus> = useMemo(() => {
    if (!activeRun?.nodeStatuses) {
      return { video_gen: "pending", voice_gen: "pending", lip_sync: "pending", music_gen: "pending", foley_gen: "pending", ambient_gen: "pending", assembly: "pending" };
    }
    return activeRun.nodeStatuses as Record<NodeName, NodeStatus>;
  }, [activeRun]);

  const nodeCosts: Record<string, number> = useMemo(() => {
    return (activeRun?.nodeCosts as Record<string, number>) || {};
  }, [activeRun]);

  const nodeTimings: Record<string, number> = useMemo(() => {
    // Derive timings from nodeCosts or use empty object
    return {};
  }, [activeRun]);

  const errors: any[] = useMemo(() => {
    if (!activeRun?.errors) return [];
    try {
      return Array.isArray(activeRun.errors) ? activeRun.errors : JSON.parse(String(activeRun.errors));
    } catch { return []; }
  }, [activeRun]);

  // Auto-select latest running run
  useEffect(() => {
    if (!activeRunId && runsQuery.data) {
      const runningRun = runsQuery.data.find((r: any) => r.status === "running" || r.status === "pending");
      const latestRun = runsQuery.data[runsQuery.data.length - 1];
      if (runningRun) setActiveRunId(runningRun.id);
      else if (latestRun) setActiveRunId(latestRun.id);
    }
  }, [runsQuery.data, activeRunId]);

  const handleStartPipeline = (episodeId: number) => {
    startMut.mutate({ episodeId, projectId });
  };

  const handleBatchStart = (episodeIds: number[]) => {
    episodeIds.forEach((episodeId) => {
      startMut.mutate({ episodeId, projectId });
    });
    toast.success(`Starting pipeline for ${episodeIds.length} episodes`);
  };

  const handlePreviewRouting = (episodeId: number, episodeTitle: string) => {
    setPreviewEpisode({ id: episodeId, title: episodeTitle });
  };

  const handleStartWithOverrides = (episodeId: number, overrides?: Record<string, number>) => {
    // Start the pipeline — overrides are stored in the preview for future use
    startMut.mutate({ episodeId, projectId });
    if (overrides && Object.keys(overrides).length > 0) {
      toast.success(`Starting pipeline with ${Object.keys(overrides).length} model override(s)`);
    } else {
      toast.success("Starting pipeline with smart routing");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-token-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-display">Production Pipeline</h1>
          <p className="text-gray-400 mt-1">Mission control for your creative pipeline</p>
        </div>
        <div className="flex items-center gap-4">
          {costQuery.data && (
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-gray-400">Total Cost</p>
                <p className="text-token-cyan font-bold text-lg">${((costQuery.data.totalCost || 0) / 100).toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Completed</p>
                <p className="text-green-400 font-bold text-lg">{costQuery.data.completedRuns}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Failed</p>
                <p className="text-red-400 font-bold text-lg">{costQuery.data.failedRuns}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Run Node Graph */}
      {activeRun && (
        <>
        <AwakliCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white font-display">
                Pipeline Run #{activeRun.id}
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <AwakliiBadge variant={activeRun.status === "completed" ? "success" : activeRun.status === "failed" ? "error" : "cyan"}>{activeRun.status}</AwakliiBadge>
                {activeRun.estimatedTimeRemaining && activeRun.status === "running" && (
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    ~{activeRun.estimatedTimeRemaining}s remaining
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeRun.status === "running" && (
                <AwakliButton variant="ghost" size="sm" onClick={() => cancelMut.mutate({ runId: activeRun.id })}>
                  <Ban className="w-4 h-4 mr-1" /> Cancel
                </AwakliButton>
              )}
              {activeRun.status === "failed" && (
                <AwakliButton variant="secondary" size="sm" onClick={() => retryMut.mutate({ runId: activeRun.id })}>
                  <RotateCcw className="w-4 h-4 mr-1" /> Retry
                </AwakliButton>
              )}
              {activeRun.status === "completed" && (
                <AwakliButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(`/studio/project/${projectId}/pipeline/${activeRun.id}/review`)}
                >
                  <CheckCircle className="w-4 h-4 mr-1" /> QA Review
                </AwakliButton>
              )}
            </div>
          </div>

          {/* Overall Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-400">Overall Progress</span>
              <span className="text-white font-mono">{activeRun.progress || 0}%</span>
            </div>
            <AwakliProgress value={activeRun.progress || 0} />
          </div>

          {/* Node Graph */}
          <NodeGraph
            nodeStatuses={nodeStatuses}
            activeNode={expandedNode}
            onNodeClick={(node) => setExpandedNode(expandedNode === node ? null : node)}
          />

          {/* Expanded Node Detail */}
          <AnimatePresence>
            {expandedNode && (
              <NodeDetailPanel
                node={expandedNode}
                assets={assetsQuery.data || []}
                nodeCosts={nodeCosts}
                nodeTimings={nodeTimings}
                errors={errors}
                runId={activeRun.id}
                episodeId={activeRun.episodeId}
              />
            )}
          </AnimatePresence>
        </AwakliCard>

        {/* Smart Model Routing Widget */}
        {(activeRun.status === "completed" || activeRun.status === "running") && (
          <ModelRoutingWidget pipelineRunId={activeRun.id} />
        )}
        </>
      )}

      {/* Cost Estimation & Pre-flight */}
      {episodesQuery.data && episodesQuery.data.length > 0 && !activeRun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {episodesQuery.data.slice(0, 1).map((ep: any) => (
            <CostEstimationCard key={ep.id} episodeId={ep.id} />
          ))}
          <AwakliCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Pre-flight Checks</h3>
                <p className="text-[10px] text-zinc-500">Quality & moderation gates</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-400">Panel Quality Assessment</span>
                <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ready</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-400">Content Moderation</span>
                <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ready</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-400">Scene Consistency</span>
                <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ready</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
                <span className="text-zinc-400">Image Upscaling (4K)</span>
                <span className="text-cyan-400 flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Available</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-zinc-400">SFX & Narrator</span>
                <span className="text-amber-400 flex items-center gap-1"><Music className="w-3 h-3" /> Optional</span>
              </div>
            </div>
          </AwakliCard>
        </div>
      )}

      {/* Assembly Settings (per-episode audio & lip sync config) */}
      {episodesQuery.data && episodesQuery.data.length > 0 && !activeRun && (
        <div className="space-y-4">
          {episodesQuery.data.slice(0, 1).map((ep: any) => (
            <AssemblySettingsPanel key={`asm-${ep.id}`} episodeId={ep.id} />
          ))}
        </div>
      )}

      {/* Scene-Type Analysis (collapsible) */}
      {episodesQuery.data && episodesQuery.data.length > 0 && !activeRun && scenesForAnalysis.length > 0 && (
        <Collapsible open={sceneAnalysisOpen && !hasActiveRun} onOpenChange={setSceneAnalysisOpen}>
          <AwakliCard className="overflow-hidden">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-5 cursor-pointer hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <BarChart3 className="w-4.5 h-4.5 text-indigo-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="text-sm font-semibold text-zinc-100">Scene-Type Analysis</h3>
                    <p className="text-[10px] text-zinc-500">
                      Classify scenes to optimize pipeline routing and estimate costs
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {episodesQuery.data.length > 1 && (
                    <select
                      className="text-xs bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={analysisEpisodeId ?? ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedAnalysisEpisodeId(Number(e.target.value));
                      }}
                    >
                      {episodesQuery.data.map((ep: any) => (
                        <option key={ep.id} value={ep.id}>
                          {ep.title || `Episode ${ep.episodeNumber}`}
                        </option>
                      ))}
                    </select>
                  )}
                  {sceneAnalysisOpen && !hasActiveRun ? (
                    <ChevronUp className="w-4 h-4 text-zinc-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-5 pb-5 border-t border-zinc-800/50">
                <div className="pt-4">
                  <SceneTypePanel
                    episodeId={analysisEpisodeId!}
                    scenes={scenesForAnalysis}
                  />
                </div>
              </div>
            </CollapsibleContent>
          </AwakliCard>
        </Collapsible>
      )}

      {/* Episode Pipeline Table */}
      {episodesQuery.data && (
        <EpisodePipelineTable
          episodes={episodesQuery.data}
          runs={runsQuery.data || []}
          onStartPipeline={handleStartPipeline}
          onBatchStart={handleBatchStart}
          onViewRun={(runId) => setActiveRunId(runId)}
          onPreviewRouting={handlePreviewRouting}
          projectId={projectId}
        />
      )}

      {/* Empty state */}
      {(!episodesQuery.data || episodesQuery.data.length === 0) && !episodesQuery.isLoading && (
        <AwakliCard className="p-12 text-center">
          <Clapperboard className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Episodes Yet</h3>
          <p className="text-gray-400 mb-4">Create episodes and generate scripts before starting the production pipeline.</p>
          <AwakliButton variant="primary" onClick={() => navigate(`/studio/project/${projectId}/script`)}>
            Go to Script Editor
          </AwakliButton>
        </AwakliCard>
      )}

      {/* Routing Preview Modal */}
      {previewEpisode && (
        <RoutingPreviewModal
          episodeId={previewEpisode.id}
          episodeTitle={previewEpisode.title}
          onClose={() => setPreviewEpisode(null)}
          onStartPipeline={handleStartWithOverrides}
        />
      )}
    </div>
  );
}
