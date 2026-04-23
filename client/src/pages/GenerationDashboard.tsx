/**
 * GenerationDashboard — Real-time DAG visualization for parallel slice generation.
 * Shows slice nodes, dependency edges, status, progress, and parallel lanes.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Activity, Layers, Clock, Zap, CheckCircle2, XCircle,
  Loader2, Circle, ArrowRight, Ban, ChevronDown, ChevronUp,
  RefreshCw, Trash2, AlertTriangle, Timer, Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

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

// ─── Slice Node Component ───────────────────────────────────────────────
function SliceNodeCard({
  node,
  isSelected,
  onClick,
}: {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
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
}: {
  lanes: number[][];
  nodes: GraphNode[];
  selectedNode: number | null;
  onSelectNode: (id: number) => void;
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
            {/* Lane label */}
            <div className="w-12 flex-shrink-0 text-right">
              <span className="text-[9px] font-mono text-white/20">Lane {laneIdx + 1}</span>
            </div>
            {/* Lane nodes */}
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
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: number | null;
  onSelectNode: (id: number) => void;
}) {
  // Group nodes by scene index for layered layout
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
            {/* Scene column */}
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
                />
              ))}
            </div>
            {/* Arrow between scene groups */}
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
function StatusSummaryBar({ status }: { status: any }) {
  const total = status.totalSlices;
  if (total === 0) return null;

  const segments = [
    { count: status.complete, color: "bg-emerald-500/60", label: "Complete" },
    { count: status.generating, color: "bg-token-cyan/60", label: "Generating" },
    { count: status.queued, color: "bg-sky-500/40", label: "Queued" },
    { count: status.failed, color: "bg-red-500/60", label: "Failed" },
    { count: status.cancelled, color: "bg-white/10", label: "Cancelled" },
    { count: status.pending, color: "bg-white/5", label: "Pending" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
        {segments.map((seg, i) =>
          seg.count > 0 ? (
            <div
              key={i}
              className={cn(seg.color, "transition-all duration-700")}
              style={{ width: `${(seg.count / total) * 100}%` }}
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
function NodeDetailPanel({ node, nodes }: { node: GraphNode; nodes: GraphNode[] }) {
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

      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-white/25">Scene</div>
          <div className="text-xs font-medium text-white/60">{node.sceneIndex + 1}</div>
        </div>
        <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
          <div className="text-[9px] text-white/25">Dependencies</div>
          <div className="text-xs font-medium text-white/60">{node.dependsOn.length}</div>
        </div>
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

  // Fetch active episodes
  const { data: activeEpisodes } = trpc.parallelSlice.activeEpisodes.useQuery(
    undefined,
    { refetchInterval: 5000 },
  );

  // Auto-select first episode
  useEffect(() => {
    if (activeEpisodes && activeEpisodes.episodes.length > 0 && !selectedEpisode) {
      setSelectedEpisode(activeEpisodes.episodes[0]);
    }
  }, [activeEpisodes, selectedEpisode]);

  // Fetch status for selected episode
  const { data: status } = trpc.parallelSlice.getStatus.useQuery(
    { episodeId: selectedEpisode! },
    { enabled: !!selectedEpisode, refetchInterval: 3000 },
  );

  // Fetch graph for selected episode
  const { data: graph } = trpc.parallelSlice.getGraph.useQuery(
    { episodeId: selectedEpisode! },
    { enabled: !!selectedEpisode, refetchInterval: 3000 },
  );

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
    () => graph?.nodes.find((n: GraphNode) => n.id === selectedNode) ?? null,
    [graph, selectedNode],
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
        {selectedEpisode && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>

      {/* Episode selector */}
      <EpisodeSelector
        activeEpisodes={activeEpisodes?.episodes ?? []}
        selectedEpisode={selectedEpisode}
        onSelect={setSelectedEpisode}
      />

      {selectedEpisode && status && (
        <>
          {/* Progress section */}
          <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/50">Overall Progress</span>
              <span className="text-sm font-bold text-token-cyan tabular-nums">
                {status.progressPercent.toFixed(1)}%
              </span>
            </div>
            <Progress value={status.progressPercent} className="h-2" />
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-white/70">{status.totalSlices}</div>
                <div className="text-[9px] text-white/25">Total</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-emerald-400">{status.complete}</div>
                <div className="text-[9px] text-white/25">Complete</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-token-cyan">{status.generating}</div>
                <div className="text-[9px] text-white/25">Active</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Timer size={12} className="text-white/30" />
                  <span className="text-lg font-bold text-white/50">
                    {formatTime(status.estimatedTimeRemainingSec)}
                  </span>
                </div>
                <div className="text-[9px] text-white/25">ETA</div>
              </div>
            </div>
            <StatusSummaryBar status={status} />
          </div>

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
          {graph ? (
            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
              {viewMode === "lanes" ? (
                <ParallelLanesView
                  lanes={graph.parallelLanes}
                  nodes={graph.nodes}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
                />
              ) : (
                <DAGGraphView
                  nodes={graph.nodes}
                  edges={graph.edges}
                  selectedNode={selectedNode}
                  onSelectNode={setSelectedNode}
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
            {selectedNodeData && graph && (
              <NodeDetailPanel node={selectedNodeData} nodes={graph.nodes} />
            )}
          </AnimatePresence>

          {/* Failed slices alert */}
          {status.failed > 0 && (
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
