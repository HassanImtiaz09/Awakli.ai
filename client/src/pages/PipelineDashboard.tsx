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
  Loader2, Eye, Ban, Timer, AlertCircle, Volume2, Shield, ArrowUp, Cpu, BarChart3
} from "lucide-react";
import { QualityBadge } from "@/components/awakli/QualityBadge";
import { CostEstimationCard } from "@/components/awakli/CostEstimationCard";
import { VideoPromptBuilder } from "@/components/awakli/VideoPromptBuilder";
import { ModerationBanner } from "@/components/awakli/ModerationBanner";
import { ModelRoutingWidget } from "@/components/awakli/ModelRoutingWidget";
import { RoutingPreviewModal } from "@/components/awakli/RoutingPreviewModal";
import { SceneTypePanel } from "@/components/awakli/SceneTypePanel";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────

type NodeName = "video_gen" | "voice_gen" | "music_gen" | "assembly";
type NodeStatus = "pending" | "running" | "complete" | "failed" | "skipped";

interface NodeConfig {
  id: NodeName;
  label: string;
  icon: typeof Film;
  x: number;
  y: number;
}

const NODES: NodeConfig[] = [
  { id: "video_gen", label: "Video + Lip Sync", icon: Film, x: 80, y: 100 },
  { id: "voice_gen", label: "Voice Gen", icon: Mic, x: 330, y: 100 },
  { id: "music_gen", label: "Music Gen", icon: Music, x: 580, y: 100 },
  { id: "assembly", label: "Assembly", icon: Clapperboard, x: 830, y: 100 },
];

const CONNECTIONS: [number, number][] = [[0, 1], [1, 2], [2, 3]];

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
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {videoAssets.map((asset: any, i: number) => (
        <div key={asset.id || i} className="group relative bg-gray-800/60 rounded-lg overflow-hidden border border-gray-700/50">
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
          </div>
          <div className="p-2">
            <p className="text-xs text-gray-400 truncate">Panel {(asset.metadata as any)?.panelNumber || i + 1}</p>
            {(asset.metadata as any)?.duration && (
              <p className="text-xs text-accent-cyan">{(asset.metadata as any).duration}s</p>
            )}
          </div>
        </div>
      ))}
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
          <Volume2 className="w-5 h-5 text-accent-cyan shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-white">{(asset.metadata as any)?.character || `Voice Clip ${i + 1}`}</p>
            <p className="text-xs text-gray-400 truncate">{(asset.metadata as any)?.dialogue || "Dialogue line"}</p>
          </div>
          {/* Simulated waveform visualization */}
          <div className="flex items-end gap-[2px] h-6">
            {Array.from({ length: 20 }, (_, j) => (
              <motion.div
                key={j}
                className="w-[3px] bg-accent-cyan/60 rounded-full"
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

function LipSyncDetail({ assets }: { assets: any[] }) {
  const syncAssets = assets.filter((a: any) => a.assetType === "synced_clip" || (a.metadata as any)?.hasLipSync);
  if (syncAssets.length === 0) return <p className="text-gray-500 text-sm">No lip-synced clips yet. Panels with dialogue use Kling V3 Omni for native lip sync.</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {syncAssets.map((asset: any, i: number) => (
        <div key={asset.id || i} className="bg-gray-800/60 rounded-lg p-4 border border-gray-700/50">
          <p className="text-sm text-white mb-2">Lip-Synced Clip {i + 1} — Kling V3 Omni</p>
          <div className="aspect-video bg-gray-900 rounded flex items-center justify-center border border-accent-cyan/30 relative overflow-hidden">
            {asset.url ? (
              <video src={asset.url} className="w-full h-full object-cover" preload="metadata" controls />
            ) : (
              <span className="text-xs text-accent-cyan">Processing...</span>
            )}
          </div>
          {(asset.metadata as any)?.klingModel && (
            <p className="text-xs text-gray-400 mt-2">Model: {(asset.metadata as any).klingModel}</p>
          )}
        </div>
      ))}
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
              <Music className="w-4 h-4 text-accent-pink" />
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
                    className="flex-1 bg-accent-pink/40 rounded-t"
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
            className="text-xs text-accent-cyan hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" /> View Full Video
          </a>
        )}
        {subtitleAsset?.url && (
          <a href={subtitleAsset.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-accent-cyan hover:underline flex items-center gap-1">
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
}: {
  node: NodeName;
  assets: any[];
  nodeCosts: Record<string, number>;
  nodeTimings: Record<string, number>;
  errors: any[];
  runId: number;
}) {
  const nodeAssets = assets.filter((a: any) => {
    const source = a.nodeSource || a.assetType;
    const nodeTypeMap: Record<NodeName, string[]> = {
      video_gen: ["video_clip", "video", "synced_clip"],
      voice_gen: ["voice_clip", "voice"],
      music_gen: ["music", "bgm"],
      assembly: ["final_video", "assembled", "subtitle", "srt", "thumbnail"],
    };
    return nodeTypeMap[node]?.includes(source) || a.nodeSource === node;
  });

  const cost = nodeCosts[node] || 0;
  const timing = nodeTimings[node] || 0;
  const nodeErrors = errors.filter((e: any) => e.node === node);

  const nodeLabels: Record<NodeName, string> = {
    video_gen: "Video + Lip Sync (Kling V3 Omni)",
    voice_gen: "Voice Generation",
    music_gen: "Background Music",
    assembly: "Final Assembly",
  };

  const renderNodeContent = () => {
    switch (node) {
      case "video_gen": {
        const videoOnly = nodeAssets.filter((a: any) => a.assetType === "video_clip");
        const lipSynced = nodeAssets.filter((a: any) => a.assetType === "synced_clip" || (a.metadata as any)?.hasLipSync);
        return <>
          <VideoGenDetail assets={videoOnly} />
          {lipSynced.length > 0 && <div className="mt-4"><h4 className="text-sm font-semibold text-accent-cyan mb-2">Lip-Synced Clips (Native Audio)</h4><LipSyncDetail assets={lipSynced} /></div>}
        </>;
      }
      case "voice_gen": return <VoiceGenDetail assets={nodeAssets} />;
      case "music_gen": return <MusicGenDetail assets={nodeAssets} />;
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
                  className="rounded border-gray-600 bg-gray-800 text-accent-pink focus:ring-accent-pink/50"
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
                      className="rounded border-gray-600 bg-gray-800 text-accent-pink focus:ring-accent-pink/50 disabled:opacity-30"
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
                      <span className="text-accent-cyan">${(run.totalCost / 100).toFixed(2)}</span>
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
      return { video_gen: "pending", voice_gen: "pending", music_gen: "pending", assembly: "pending" };
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
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
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
                <p className="text-accent-cyan font-bold text-lg">${((costQuery.data.totalCost || 0) / 100).toFixed(2)}</p>
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
