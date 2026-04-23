/**
 * GenerationDashboard — Real-time DAG visualization for parallel slice generation.
 * Uses WebSocket for live updates with animated node transitions, event log, and connection status.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Activity, Layers, Clock, Zap, CheckCircle2, XCircle,
  Loader2, Circle, ArrowRight, Ban, ChevronDown, ChevronUp,
  RefreshCw, Trash2, AlertTriangle, Timer, Cpu, Wifi, WifiOff,
  Radio, ScrollText, Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  useGenerationWebSocket,
  type ConnectionStatus,
  type GenerationEvent,
  type SliceStatus as WsSliceStatus,
} from "@/hooks/useGenerationWebSocket";

// ─── Types ──────────────────────────────────────────────────────────────
type SliceStatus = "pending" | "queued" | "generating" | "complete" | "failed" | "cancelled";

interface GraphNode {
  id: number;
  sceneIndex: number;
  importance: number;
  status: SliceStatus;
  dependsOn: number[];
}

interface GraphEdge {
  from: number;
  to: number;
}

// ─── Status Config ──────────────────────────────────────────────────────
const STATUS_CONFIG: Record<SliceStatus, {
  color: string;
  bg: string;
  border: string;
  icon: typeof Circle;
  label: string;
  pulse?: boolean;
}> = {
  pending: { color: "text-white/30", bg: "bg-white/5", border: "border-white/10", icon: Circle, label: "Pending" },
  queued: { color: "text-sky-300", bg: "bg-sky-500/10", border: "border-sky-500/20", icon: Clock, label: "Queued" },
  generating: { color: "text-token-cyan", bg: "bg-token-cyan/10", border: "border-token-cyan/20", icon: Loader2, label: "Generating", pulse: true },
  complete: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", icon: CheckCircle2, label: "Complete" },
  failed: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", icon: XCircle, label: "Failed" },
  cancelled: { color: "text-white/20", bg: "bg-white/[0.02]", border: "border-white/5", icon: Ban, label: "Cancelled" },
};

// ─── Connection Status Indicator ────────────────────────────────────────
function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const config: Record<ConnectionStatus, { icon: typeof Wifi; color: string; label: string; pulse?: boolean }> = {
    connected: { icon: Wifi, color: "text-emerald-400", label: "Live", pulse: true },
    connecting: { icon: Radio, color: "text-token-cyan", label: "Connecting", pulse: true },
    reconnecting: { icon: RefreshCw, color: "text-amber-400", label: "Reconnecting", pulse: true },
    disconnected: { icon: WifiOff, color: "text-white/20", label: "Offline" },
  };
  const c = config[status];
  const Icon = c.icon;

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Icon size={12} className={cn(c.color, status === "reconnecting" && "animate-spin")} />
        {c.pulse && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-ping",
            status === "connected" ? "bg-emerald-400/60" : "bg-token-cyan/60",
          )} />
        )}
      </div>
      <span className={cn("text-[9px] font-semibold", c.color)}>{c.label}</span>
    </div>
  );
}

// ─── Slice Node Component ───────────────────────────────────────────────
function SliceNodeCard({
  node,
  isSelected,
  onClick,
  isRecentlyUpdated,
}: {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
  isRecentlyUpdated: boolean;
}) {
  const config = STATUS_CONFIG[node.status];
  const Icon = config.icon;

  return (
    <motion.button
      layout
      onClick={onClick}
      className={cn(
        "relative w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition-all",
        config.bg, config.border,
        isSelected && "ring-2 ring-token-cyan/40 scale-110",
        node.status === "generating" && "animate-pulse",
      )}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      animate={isRecentlyUpdated ? {
        boxShadow: [
          "0 0 0 0 rgba(0,255,200,0)",
          "0 0 20px 4px rgba(0,255,200,0.3)",
          "0 0 0 0 rgba(0,255,200,0)",
        ],
      } : {}}
      transition={isRecentlyUpdated ? { duration: 1.2, ease: "easeOut" } : {}}
    >
      {/* Importance indicator */}
      <div className={cn(
        "absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[8px] font-bold flex items-center justify-center",
        node.importance >= 8 ? "bg-token-gold text-black" :
        node.importance >= 5 ? "bg-token-violet/60 text-white" :
        "bg-white/10 text-white/40",
      )}>
        {node.importance}
      </div>

      {/* Completion flash overlay */}
      {isRecentlyUpdated && node.status === "complete" && (
        <motion.div
          className="absolute inset-0 rounded-xl bg-emerald-400/20"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.5 }}
        />
      )}

      <Icon size={14} className={cn(config.color, node.status === "generating" && "animate-spin")} />
      <span className="text-[9px] font-mono text-white/50">S{node.id}</span>
      <span className="text-[8px] text-white/25">Sc.{node.sceneIndex + 1}</span>
    </motion.button>
  );
}

// ─── Parallel Lanes Visualization ───────────────────────────────────────
function ParallelLanesView({
  lanes,
  nodes,
  selectedNode,
  onSelectNode,
  recentlyUpdated,
}: {
  lanes: number[][];
  nodes: GraphNode[];
  selectedNode: number | null;
  onSelectNode: (id: number) => void;
  recentlyUpdated: Set<number>;
}) {
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  if (lanes.length === 0) {
    return (
      <div className="text-center py-8">
        <Layers size={24} className="mx-auto text-white/10 mb-2" />
        <p className="text-xs text-white/20">No parallel lanes computed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Cpu size={12} className="text-token-cyan" />
        <span className="text-[10px] font-semibold text-white/40">Parallel Execution Lanes</span>
      </div>
      <div className="space-y-2">
        {lanes.map((lane, laneIdx) => (
          <div key={laneIdx} className="flex items-center gap-2">
            <div className="w-12 flex-shrink-0 text-right">
              <span className="text-[9px] font-mono text-white/20">Lane {laneIdx + 1}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {lane.map((sliceId) => {
                const node = nodeMap.get(sliceId);
                if (!node) return null;
                return (
                  <SliceNodeCard
                    key={sliceId}
                    node={node}
                    isSelected={selectedNode === sliceId}
                    onClick={() => onSelectNode(sliceId)}
                    isRecentlyUpdated={recentlyUpdated.has(sliceId)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DAG Graph View ─────────────────────────────────────────────────────
function DAGGraphView({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  recentlyUpdated,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: number | null;
  onSelectNode: (id: number) => void;
  recentlyUpdated: Set<number>;
}) {
  const sceneGroups = useMemo(() => {
    const groups = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const arr = groups.get(node.sceneIndex) || [];
      arr.push(node);
      groups.set(node.sceneIndex, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [nodes]);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-start gap-6 min-w-max px-2">
        {sceneGroups.map(([sceneIdx, groupNodes], groupIdx) => (
          <div key={sceneIdx} className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[9px] font-semibold text-white/25 mb-1">
                Scene {sceneIdx + 1}
              </span>
              {groupNodes.map((node) => (
                <SliceNodeCard
                  key={node.id}
                  node={node}
                  isSelected={selectedNode === node.id}
                  onClick={() => onSelectNode(node.id)}
                  isRecentlyUpdated={recentlyUpdated.has(node.id)}
                />
              ))}
            </div>
            {groupIdx < sceneGroups.length - 1 && (
              <ArrowRight size={14} className="text-white/10 mt-6" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Status Summary Bar ─────────────────────────────────────────────────
function StatusSummaryBar({ status }: { status: { totalSlices?: number; complete?: number; generating?: number; queued?: number; failed?: number; cancelled?: number; pending?: number; progressPercent?: number; estimatedTimeRemainingSec?: number } }) {
  const total = status.totalSlices || 0;
  if (total === 0) return null;

  const segments = [
    { count: status.complete || 0, color: "bg-emerald-500/60", label: "Complete" },
    { count: status.generating || 0, color: "bg-token-cyan/60", label: "Generating" },
    { count: status.queued || 0, color: "bg-sky-500/40", label: "Queued" },
    { count: status.failed || 0, color: "bg-red-500/60", label: "Failed" },
    { count: status.cancelled || 0, color: "bg-white/10", label: "Cancelled" },
    { count: status.pending || 0, color: "bg-white/5", label: "Pending" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
        {segments.map((seg, i) =>
          seg.count > 0 ? (
            <motion.div
              key={i}
              className={cn(seg.color)}
              initial={false}
              animate={{ width: `${(seg.count / total) * 100}%` }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        {segments.map((seg, i) =>
          seg.count > 0 ? (
            <div key={i} className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", seg.color)} />
              <span className="text-[9px] text-white/30">
                {seg.label}: {seg.count}
              </span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

// ─── Node Detail Panel ──────────────────────────────────────────────────
function NodeDetailPanel({ node, nodes, wsStatus }: { node: GraphNode; nodes: GraphNode[]; wsStatus?: WsSliceStatus }) {
  const config = STATUS_CONFIG[node.status];
  const Icon = config.icon;
  const deps = node.dependsOn.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className={cn(config.color, node.status === "generating" && "animate-spin")} />
          <span className="text-sm font-semibold text-white/70">Slice #{node.id}</span>
          <Badge className={cn("text-[9px]", config.bg, config.color, config.border)}>
            {config.label}
          </Badge>
        </div>
        <Badge variant="outline" className={cn(
          "text-[9px]",
          node.importance >= 8 ? "border-token-gold/30 text-token-gold" :
          node.importance >= 5 ? "border-token-violet/30 text-token-violet" :
          "border-white/10 text-white/30",
        )}>
          Importance: {node.importance}/10
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-white/25">Scene</div>
          <div className="text-xs font-medium text-white/60">{node.sceneIndex + 1}</div>
        </div>
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-white/25">Dependencies</div>
          <div className="text-xs font-medium text-white/60">{node.dependsOn.length}</div>
        </div>
        {wsStatus?.durationMs && (
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="text-[9px] text-white/25">Duration</div>
            <div className="text-xs font-medium text-white/60">{(wsStatus.durationMs / 1000).toFixed(1)}s</div>
          </div>
        )}
        {wsStatus?.provider && (
          <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="text-[9px] text-white/25">Provider</div>
            <div className="text-xs font-medium text-token-cyan/70">{wsStatus.provider}</div>
          </div>
        )}
        {wsStatus?.error && (
          <div className="col-span-3 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
            <div className="text-[9px] text-red-400/60">Error</div>
            <div className="text-xs font-medium text-red-300/80">{wsStatus.error}</div>
          </div>
        )}
      </div>

      {deps.length > 0 && (
        <div>
          <div className="text-[9px] text-white/25 mb-1.5">Depends On:</div>
          <div className="flex flex-wrap gap-1.5">
            {deps.map((dep) => {
              if (!dep) return null;
              const depConfig = STATUS_CONFIG[dep.status];
              return (
                <Badge
                  key={dep.id}
                  variant="outline"
                  className={cn("text-[9px]", depConfig.border, depConfig.color)}
                >
                  S{dep.id} ({depConfig.label})
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Live Event Log ─────────────────────────────────────────────────────
function EventLog({ events }: { events: GenerationEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const visibleEvents = expanded ? events.slice(-50) : events.slice(-5);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleEvents.length]);

  const eventIcon = (type: string) => {
    switch (type) {
      case "slice_started": return <Zap size={9} className="text-token-cyan" />;
      case "slice_complete": return <CheckCircle2 size={9} className="text-emerald-400" />;
      case "slice_failed": return <XCircle size={9} className="text-red-400" />;
      case "episode_complete": return <Sparkles size={9} className="text-token-gold" />;
      case "progress_update": return <Activity size={9} className="text-white/20" />;
      default: return <Circle size={9} className="text-white/10" />;
    }
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <ScrollText size={12} className="text-white/30" />
          <span className="text-[10px] font-semibold text-white/40">Live Event Log</span>
          <Badge variant="outline" className="text-[8px] border-white/10 text-white/20">
            {events.length} events
          </Badge>
        </div>
        {expanded ? <ChevronUp size={12} className="text-white/20" /> : <ChevronDown size={12} className="text-white/20" />}
      </button>

      <AnimatePresence>
        {(expanded || events.length > 0) && (
          <motion.div
            initial={false}
            animate={{ height: expanded ? 240 : 120 }}
            className="overflow-hidden"
          >
            <div
              ref={logRef}
              className="px-3 pb-3 space-y-1 overflow-y-auto"
              style={{ maxHeight: expanded ? 240 : 120 }}
            >
              {visibleEvents.map((event, i) => (
                <motion.div
                  key={`${event.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 py-0.5"
                >
                  {eventIcon(event.type)}
                  <span className="text-[8px] font-mono text-white/15 w-16 flex-shrink-0">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <span className="text-[9px] text-white/40 truncate">
                    {event.type === "slice_started" && `Slice #${event.data.sliceId} started${event.data.provider ? ` (${event.data.provider})` : ""}`}
                    {event.type === "slice_complete" && `Slice #${event.data.sliceId} complete${event.data.durationMs ? ` (${((event.data.durationMs as number) / 1000).toFixed(1)}s)` : ""}`}
                    {event.type === "slice_failed" && `Slice #${event.data.sliceId} failed: ${event.data.error || "Unknown error"}`}
                    {event.type === "episode_complete" && `Episode generation complete!`}
                    {event.type === "progress_update" && `Progress: ${event.data.complete}/${event.data.totalSlices} slices`}
                    {event.type === "connection_ack" && `Connected to episode #${event.episodeId}`}
                  </span>
                </motion.div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-[9px] text-white/15">Waiting for events...</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Episode Selector ───────────────────────────────────────────────────
function EpisodeSelector({
  activeEpisodes,
  selectedEpisode,
  onSelect,
}: {
  activeEpisodes: number[];
  selectedEpisode: number | null;
  onSelect: (id: number) => void;
}) {
  if (activeEpisodes.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity size={32} className="mx-auto text-white/10 mb-3" />
        <h3 className="text-sm font-semibold text-white/30 mb-1">No Active Generations</h3>
        <p className="text-xs text-white/15 max-w-xs mx-auto">
          When you start generating an episode, the real-time DAG visualization will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] font-semibold text-white/30">Active Episodes</span>
      <div className="flex flex-wrap gap-2">
        {activeEpisodes.map((epId) => (
          <Button
            key={epId}
            size="sm"
            variant={selectedEpisode === epId ? "default" : "outline"}
            onClick={() => onSelect(epId)}
            className={cn(
              "h-8 text-xs",
              selectedEpisode === epId
                ? "bg-token-cyan/20 text-token-cyan border-token-cyan/30"
                : "bg-transparent text-white/40 border-white/10 hover:border-white/20",
            )}
          >
            Episode #{epId}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function GenerationDashboard() {
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"dag" | "lanes">("lanes");
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<number>>(new Set());

  // Fetch active episodes (slow poll as fallback)
  const { data: activeEpisodes } = trpc.parallelSlice.activeEpisodes.useQuery(
    undefined,
    { refetchInterval: 10000 },
  );

  // Auto-select first episode
  useEffect(() => {
    if (activeEpisodes && activeEpisodes.episodes.length > 0 && !selectedEpisode) {
      setSelectedEpisode(activeEpisodes.episodes[0]);
    }
  }, [activeEpisodes, selectedEpisode]);

  // WebSocket connection for live updates
  const ws = useGenerationWebSocket({
    episodeId: selectedEpisode,
    enabled: !!selectedEpisode,
    onSliceStarted: useCallback((data: Record<string, unknown>) => {
      const sliceId = data.sliceId as number;
      setRecentlyUpdated((prev) => new Set([...Array.from(prev), sliceId]));
      setTimeout(() => {
        setRecentlyUpdated((prev) => {
          const next = new Set(Array.from(prev));
          next.delete(sliceId);
          return next;
        });
      }, 2000);
    }, []),
    onSliceComplete: useCallback((data: Record<string, unknown>) => {
      const sliceId = data.sliceId as number;
      setRecentlyUpdated((prev) => new Set([...Array.from(prev), sliceId]));
      setTimeout(() => {
        setRecentlyUpdated((prev) => {
          const next = new Set(Array.from(prev));
          next.delete(sliceId);
          return next;
        });
      }, 2000);
    }, []),
    onSliceFailed: useCallback((data: Record<string, unknown>) => {
      toast.error(`Slice #${data.sliceId} failed: ${data.error || "Unknown error"}`);
    }, []),
    onEpisodeComplete: useCallback(() => {
      toast.success("Episode generation complete!", { icon: "🎉" });
    }, []),
  });

  // Fetch graph for selected episode (fallback + initial load)
  const { data: graph } = trpc.parallelSlice.getGraph.useQuery(
    { episodeId: selectedEpisode! },
    { enabled: !!selectedEpisode, refetchInterval: ws.connectionStatus === "connected" ? 15000 : 3000 },
  );

  // Fetch status (fallback when WS disconnected)
  const { data: polledStatus } = trpc.parallelSlice.getStatus.useQuery(
    { episodeId: selectedEpisode! },
    { enabled: !!selectedEpisode && ws.connectionStatus !== "connected", refetchInterval: 3000 },
  );

  // Merge WS progress with polled status — prefer WS when connected
  const status = useMemo(() => {
    if (ws.connectionStatus === "connected" && ws.progress) {
      return {
        totalSlices: ws.progress.totalSlices,
        pending: ws.progress.pending,
        generating: ws.progress.generating,
        complete: ws.progress.complete,
        failed: ws.progress.failed,
        queued: 0,
        cancelled: 0,
        progressPercent: ws.progress.percentage,
        estimatedTimeRemainingSec: ws.progress.estimatedTimeRemainingSec,
      };
    }
    return polledStatus;
  }, [ws.connectionStatus, ws.progress, polledStatus]);

  // Merge WS slice statuses into graph nodes for live updates
  const liveGraph = useMemo(() => {
    if (!graph) return null;
    if (ws.connectionStatus !== "connected" || ws.sliceStatuses.size === 0) return graph;

    const updatedNodes = graph.nodes.map((node: GraphNode) => {
      const wsSlice = ws.sliceStatuses.get(node.id);
      if (wsSlice) {
        return { ...node, status: wsSlice.status as SliceStatus };
      }
      return node;
    });
    return { ...graph, nodes: updatedNodes };
  }, [graph, ws.connectionStatus, ws.sliceStatuses]);

  const cancelMut = trpc.parallelSlice.cancel.useMutation({
    onSuccess: () => toast.success("Generation cancelled"),
  });

  const cleanupMut = trpc.parallelSlice.cleanup.useMutation({
    onSuccess: () => {
      toast.success("Graph cleaned up");
      setSelectedEpisode(null);
    },
  });

  const selectedNodeData = useMemo(
    () => liveGraph?.nodes.find((n: GraphNode) => n.id === selectedNode) ?? null,
    [liveGraph, selectedNode],
  );

  const selectedWsStatus = useMemo(
    () => selectedNode ? ws.sliceStatuses.get(selectedNode) : undefined,
    [selectedNode, ws.sliceStatuses],
  );

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white/80 flex items-center gap-2">
            <Activity size={18} className="text-token-cyan" />
            Generation Dashboard
          </h1>
          <p className="text-xs text-white/30 mt-0.5">
            Real-time visualization of parallel slice generation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionIndicator status={ws.connectionStatus} />
          {ws.connectionStatus === "disconnected" && selectedEpisode && (
            <Button
              size="sm"
              variant="outline"
              onClick={ws.reconnect}
              className="h-6 text-[9px] bg-transparent text-white/30 border-white/10 hover:bg-white/5"
            >
              <RefreshCw size={9} className="mr-1" /> Reconnect
            </Button>
          )}
          {selectedEpisode && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelMut.mutate({ episodeId: selectedEpisode })}
                className="h-7 text-[10px] bg-transparent text-red-300/60 border-red-500/20 hover:bg-red-500/10"
                disabled={cancelMut.isPending}
              >
                <Ban size={10} className="mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cleanupMut.mutate({ episodeId: selectedEpisode })}
                className="h-7 text-[10px] bg-transparent text-white/30 border-white/10 hover:bg-white/5"
                disabled={cleanupMut.isPending}
              >
                <Trash2 size={10} className="mr-1" /> Cleanup
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Episode selector */}
      <EpisodeSelector
        activeEpisodes={activeEpisodes?.episodes ?? []}
        selectedEpisode={selectedEpisode}
        onSelect={(id) => {
          setSelectedEpisode(id);
          setSelectedNode(null);
          setRecentlyUpdated(new Set());
        }}
      />

      {selectedEpisode && status && (
        <>
          {/* Progress section */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/50">Overall Progress</span>
              <div className="flex items-center gap-2">
                {ws.connectionStatus === "connected" && (
                  <Badge variant="outline" className="text-[8px] border-emerald-500/20 text-emerald-400/60">
                    <Radio size={7} className="mr-1" /> LIVE
                  </Badge>
                )}
                <span className="text-sm font-bold text-token-cyan tabular-nums">
                  {(status.progressPercent || 0).toFixed(1)}%
                </span>
              </div>
            </div>
            <Progress value={status.progressPercent || 0} className="h-2" />
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-white/70">{status.totalSlices}</div>
                <div className="text-[9px] text-white/25">Total</div>
              </div>
              <div className="text-center">
                <motion.div
                  key={status.complete}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="text-lg font-bold text-emerald-400"
                >
                  {status.complete}
                </motion.div>
                <div className="text-[9px] text-white/25">Complete</div>
              </div>
              <div className="text-center">
                <motion.div
                  key={status.generating}
                  initial={{ scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="text-lg font-bold text-token-cyan"
                >
                  {status.generating}
                </motion.div>
                <div className="text-[9px] text-white/25">Active</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Timer size={12} className="text-white/30" />
                  <span className="text-lg font-bold text-white/50">
                    {formatTime(status.estimatedTimeRemainingSec || 0)}
                  </span>
                </div>
                <div className="text-[9px] text-white/25">ETA</div>
              </div>
            </div>
            <StatusSummaryBar status={status} />
          </div>

          {/* Episode complete celebration */}
          <AnimatePresence>
            {ws.isEpisodeComplete && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-token-cyan/10 to-token-gold/10 border border-emerald-500/20 text-center"
              >
                <Sparkles size={24} className="mx-auto text-token-gold mb-2" />
                <h3 className="text-sm font-bold text-white/80">Episode Generation Complete!</h3>
                <p className="text-xs text-white/40 mt-1">All slices have been processed. Your episode is ready for assembly.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === "lanes" ? "default" : "outline"}
              onClick={() => setViewMode("lanes")}
              className={cn(
                "h-7 text-[10px]",
                viewMode === "lanes"
                  ? "bg-token-cyan/20 text-token-cyan border-token-cyan/30"
                  : "bg-transparent text-white/30 border-white/10",
              )}
            >
              <Layers size={10} className="mr-1" /> Parallel Lanes
            </Button>
            <Button
              size="sm"
              variant={viewMode === "dag" ? "default" : "outline"}
              onClick={() => setViewMode("dag")}
              className={cn(
                "h-7 text-[10px]",
                viewMode === "dag"
                  ? "bg-token-cyan/20 text-token-cyan border-token-cyan/30"
                  : "bg-transparent text-white/30 border-white/10",
              )}
            >
              <Activity size={10} className="mr-1" /> DAG View
            </Button>
          </div>

          {/* Graph visualization */}
          {liveGraph ? (
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              {viewMode === "lanes" ? (
                <ParallelLanesView
                  lanes={liveGraph.parallelLanes}
                  nodes={liveGraph.nodes}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  recentlyUpdated={recentlyUpdated}
                />
              ) : (
                <DAGGraphView
                  nodes={liveGraph.nodes}
                  edges={liveGraph.edges}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                  recentlyUpdated={recentlyUpdated}
                />
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Loader2 size={20} className="mx-auto animate-spin text-token-cyan/30 mb-2" />
              <p className="text-xs text-white/20">Loading graph data...</p>
            </div>
          )}

          {/* Node detail panel */}
          <AnimatePresence>
            {selectedNodeData && liveGraph && (
              <NodeDetailPanel node={selectedNodeData} nodes={liveGraph.nodes} wsStatus={selectedWsStatus} />
            )}
          </AnimatePresence>

          {/* Live Event Log */}
          {ws.connectionStatus === "connected" && (
            <EventLog events={ws.events} />
          )}

          {/* Failed slices alert */}
          {(status.failed || 0) > 0 && (
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/10 flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-300/80">
                  {status.failed} slice{status.failed !== 1 ? "s" : ""} failed
                </p>
                <p className="text-[10px] text-white/30 mt-0.5">
                  Failed slices may block downstream dependencies. Review and retry or cancel.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
