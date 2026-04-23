import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Loader2, CheckCircle2, AlertTriangle,
  Clock, ChevronDown, ChevronRight, Play,
  RotateCcw, XCircle, Film, Layers, Zap,
  RefreshCw, Trash2, ListOrdered, Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Status Config ──────────────────────────────────────────────────────

const QUEUE_STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  queued:     { label: "Queued",     icon: Clock,          color: "text-muted-foreground", bg: "bg-muted/50" },
  assembling: { label: "Assembling", icon: Loader2,        color: "text-cyan-400",         bg: "bg-cyan-400/10" },
  streaming:  { label: "Streaming",  icon: Play,           color: "text-purple-400",       bg: "bg-purple-400/10" },
  completed:  { label: "Completed",  icon: CheckCircle2,   color: "text-emerald-400",      bg: "bg-emerald-400/10" },
  failed:     { label: "Failed",     icon: AlertTriangle,  color: "text-red-400",          bg: "bg-red-400/10" },
};

// ─── Queue Item Row ─────────────────────────────────────────────────────

function QueueItemRow({
  item,
  onCancel,
  onRetry,
}: {
  item: {
    id: number;
    episodeId: number;
    episodeTitle: string;
    projectTitle: string;
    batchId: string;
    status: string;
    position: number;
    error: string | null;
    retryCount: number;
    estimatedCredits: number;
    actualCredits: number | null;
    queuedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    estimatedWaitMinutes: number;
  };
  onCancel: (id: number) => void;
  onRetry: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = QUEUE_STATUS_CONFIG[item.status] || QUEUE_STATUS_CONFIG.queued;
  const StatusIcon = config.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Position */}
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-mono text-muted-foreground shrink-0">
          #{item.position}
        </div>

        {/* Status Icon */}
        <div className={cn("shrink-0", config.color)}>
          <StatusIcon className={cn("w-5 h-5", item.status === "assembling" && "animate-spin")} />
        </div>

        {/* Episode Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.episodeTitle}</p>
          <p className="text-xs text-muted-foreground truncate">{item.projectTitle}</p>
        </div>

        {/* Status Badge */}
        <Badge variant="outline" className={cn("shrink-0 text-xs", config.color, config.bg)}>
          {config.label}
        </Badge>

        {/* Wait time for queued items */}
        {item.status === "queued" && item.estimatedWaitMinutes > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">
            ~{item.estimatedWaitMinutes}m
          </span>
        )}

        {/* Expand chevron */}
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Batch ID</span>
                  <p className="font-mono text-foreground">{item.batchId.slice(0, 8)}...</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Credits</span>
                  <p className="text-foreground">
                    {item.actualCredits !== null ? item.actualCredits : item.estimatedCredits} cr
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Queued</span>
                  <p className="text-foreground">
                    {new Date(item.queuedAt).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Retries</span>
                  <p className="text-foreground">{item.retryCount}</p>
                </div>
              </div>

              {/* Error message */}
              {item.error && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-400/5 border border-red-400/10">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">{item.error}</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {item.status === "queued" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); onCancel(item.id); }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Cancel
                  </Button>
                )}
                {item.status === "failed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={(e) => { e.stopPropagation(); onRetry(item.id); }}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Retry
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────

export default function BatchAssemblyQueue() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"setup" | "monitor">("setup");
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────

  const queueQuery = trpc.batchAssembly.getQueue.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: tab === "monitor" ? 5000 : false,
  });

  const limitsQuery = trpc.batchAssembly.getLimits.useQuery(undefined, {
    enabled: !!user,
  });

  // Get user's projects with episodes
  const projectsQuery = trpc.projects.listMine.useQuery(undefined, {
    enabled: !!user && tab === "setup",
  });

  const episodesQuery = trpc.episodes.listByProject.useQuery(
    { projectId: selectedProjectId! },
    { enabled: !!selectedProjectId },
  );

  const estimateQuery = trpc.batchAssembly.getEstimate.useQuery(
    { episodeIds: selectedEpisodes },
    { enabled: selectedEpisodes.length > 0 },
  );

  // ─── Mutations ──────────────────────────────────────────────────────

  const enqueueMut = trpc.batchAssembly.enqueue.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch queued: ${data.totalQueued} episodes`);
      setSelectedEpisodes([]);
      setTab("monitor");
      queueQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMut = trpc.batchAssembly.cancel.useMutation({
    onSuccess: () => {
      toast.success("Queue item cancelled");
      queueQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const retryMut = trpc.batchAssembly.retry.useMutation({
    onSuccess: () => {
      toast.success("Retrying assembly");
      queueQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Derived State ─────────────────────────────────────────────────

  const dashboard = queueQuery.data;
  const maxBatch = limitsQuery.data?.maxBatchSize ?? 1;
  const tier = limitsQuery.data?.tier ?? "free_trial";

  const hasActiveItems = dashboard
    ? dashboard.totalQueued > 0 || dashboard.totalRunning > 0
    : false;

  // ─── Auth Guard ────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Film className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">Sign in to access batch assembly</p>
        <Button onClick={() => window.location.href = getLoginUrl("/studio/batch-assembly")}>
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-white/5 bg-white/[0.01]">
        <div className="container max-w-5xl py-6">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/studio")}
              className="text-muted-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Studio
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">Batch Assembly</h1>
              <p className="text-sm text-muted-foreground">
                Queue multiple episodes for sequential assembly and CDN delivery
              </p>
            </div>
            <Badge variant="outline" className="ml-auto text-xs capitalize">
              {tier} · {maxBatch} max
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container max-w-5xl py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "setup" | "monitor")}>
          <TabsList className="mb-6">
            <TabsTrigger value="setup" className="gap-1.5">
              <ListOrdered className="w-4 h-4" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="monitor" className="gap-1.5">
              <RefreshCw className="w-4 h-4" />
              Monitor
              {hasActiveItems && (
                <span className="ml-1 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Setup Tab ──────────────────────────────────────────── */}
          <TabsContent value="setup" className="space-y-6">
            {/* Project Selector */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-foreground">Select Project</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {projectsQuery.data?.map((project: { id: number; title: string }) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setSelectedEpisodes([]);
                    }}
                    className={cn(
                      "p-3 rounded-xl border text-left transition-all",
                      selectedProjectId === project.id
                        ? "border-cyan-400/30 bg-cyan-400/5"
                        : "border-white/5 bg-white/[0.02] hover:border-white/10",
                    )}
                  >
                    <p className="text-sm font-medium text-foreground truncate">{project.title}</p>
                  </button>
                )) ?? (
                  <p className="text-sm text-muted-foreground col-span-3">Loading projects...</p>
                )}
              </div>
            </div>

            {/* Episode Selector */}
            {selectedProjectId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Select Episodes</h3>
                  <span className="text-xs text-muted-foreground">
                    {selectedEpisodes.length}/{maxBatch} selected
                  </span>
                </div>

                {episodesQuery.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : episodesQuery.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No episodes in this project</p>
                ) : (
                  <div className="space-y-2">
                    {episodesQuery.data?.map((episode: { id: number; title: string | null; episodeNumber: number | null }) => {
                      const isSelected = selectedEpisodes.includes(episode.id);
                      const isDisabled = !isSelected && selectedEpisodes.length >= maxBatch;

                      return (
                        <label
                          key={episode.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                            isSelected
                              ? "border-cyan-400/30 bg-cyan-400/5"
                              : isDisabled
                                ? "border-white/5 bg-white/[0.01] opacity-50 cursor-not-allowed"
                                : "border-white/5 bg-white/[0.02] hover:border-white/10",
                          )}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={isDisabled}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedEpisodes(prev => [...prev, episode.id]);
                              } else {
                                setSelectedEpisodes(prev => prev.filter(id => id !== episode.id));
                              }
                            }}
                          />
                          <Film className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">
                              {episode.title ?? `Episode ${episode.episodeNumber ?? episode.id}`}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Estimate & Submit */}
            {selectedEpisodes.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-white/5 rounded-xl bg-white/[0.02] p-4 space-y-4"
              >
                <h3 className="text-sm font-medium text-foreground">Batch Estimate</h3>

                {estimateQuery.isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : estimateQuery.data ? (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{estimateQuery.data.episodeCount}</p>
                      <p className="text-xs text-muted-foreground">Episodes</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-cyan-400">{estimateQuery.data.totalEstimatedCredits}</p>
                      <p className="text-xs text-muted-foreground">Credits</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">~{estimateQuery.data.estimatedTotalMinutes}m</p>
                      <p className="text-xs text-muted-foreground">Est. Time</p>
                    </div>
                  </div>
                ) : null}

                <Button
                  className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 text-white"
                  disabled={enqueueMut.isPending}
                  onClick={() => enqueueMut.mutate({ episodeIds: selectedEpisodes })}
                >
                  {enqueueMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Start Batch Assembly ({selectedEpisodes.length} episodes)
                </Button>
              </motion.div>
            )}
          </TabsContent>

          {/* ─── Monitor Tab ────────────────────────────────────────── */}
          <TabsContent value="monitor" className="space-y-6">
            {/* Summary Cards */}
            {dashboard && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard label="Queued" value={dashboard.totalQueued} icon={Clock} color="text-muted-foreground" />
                <SummaryCard label="Running" value={dashboard.totalRunning} icon={Loader2} color="text-cyan-400" />
                <SummaryCard label="Completed" value={dashboard.totalCompleted} icon={CheckCircle2} color="text-emerald-400" />
                <SummaryCard label="Failed" value={dashboard.totalFailed} icon={AlertTriangle} color="text-red-400" />
              </div>
            )}

            {/* Queue Items */}
            {queueQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !dashboard || dashboard.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Layers className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No items in the assembly queue</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("setup")}
                >
                  Queue Episodes
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {dashboard.items.map((item) => (
                  <QueueItemRow
                    key={item.id}
                    item={item}
                    onCancel={(id) => cancelMut.mutate({ queueItemId: id })}
                    onRetry={(id) => retryMut.mutate({ queueItemId: id })}
                  />
                ))}
              </div>
            )}

            {/* Refresh button */}
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queueQuery.refetch()}
                className="text-xs text-muted-foreground"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ─── Summary Card ───────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  color: string;
}) {
  return (
    <div className="border border-white/5 rounded-xl bg-white/[0.02] p-3 text-center">
      <Icon className={cn("w-5 h-5 mx-auto mb-1", color)} />
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
