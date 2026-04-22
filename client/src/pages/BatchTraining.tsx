import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Loader2, Sparkles, Zap, CheckCircle2, AlertTriangle,
  Clock, Brain, Cpu, ChevronDown, ChevronRight, Play, Pause,
  RotateCcw, DollarSign, Timer, Activity, Users, TrendingUp,
  XCircle, Check, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

// ─── Status Config ──────────────────────────────────────────────────────

const JOB_STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  queued:         { label: "Queued",         icon: Clock,          color: "text-muted-foreground", bg: "bg-muted/50" },
  preprocessing:  { label: "Preprocessing",  icon: Activity,       color: "text-[var(--token-gold)]", bg: "bg-[var(--token-gold)]/10" },
  training:       { label: "Training",       icon: Loader2,        color: "text-cyan",             bg: "bg-cyan/10" },
  validating:     { label: "Validating",     icon: Brain,          color: "text-purple-400",       bg: "bg-purple-400/10" },
  completed:      { label: "Completed",      icon: CheckCircle2,   color: "text-[var(--status-success)]", bg: "bg-[var(--status-success)]/10" },
  failed:         { label: "Failed",         icon: AlertTriangle,  color: "text-[var(--status-error)]",   bg: "bg-[var(--status-error)]/10" },
};

// ─── Progress Ring ──────────────────────────────────────────────────────

function ProgressRing({ percent, size = 80, stroke = 6 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="currentColor"
        strokeWidth={stroke}
        className="text-white/5"
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        stroke="url(#progressGradient)"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1, ease: "easeOut" }}
        strokeDasharray={circumference}
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--token-cyan)" />
          <stop offset="100%" stopColor="var(--token-cyan)" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Job Row ────────────────────────────────────────────────────────────

function JobRow({ job }: { job: any }) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.queued;
  const StatusIcon = statusCfg.icon;

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      job.status === "completed" ? "border-[var(--status-success)]/20 bg-[var(--status-success)]/5" :
      job.status === "failed" ? "border-[var(--status-error)]/20 bg-[var(--status-error)]/5" :
      job.status === "training" ? "border-cyan/20 bg-cyan/5" :
      "border-white/10 bg-[var(--bg-base)]"
    )}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Status icon */}
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", statusCfg.bg)}>
          <StatusIcon className={cn("w-4 h-4", statusCfg.color, job.status === "training" && "animate-spin")} />
        </div>

        {/* Character name */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{job.characterName || `Character #${job.characterId}`}</div>
          <div className="text-xs text-muted-foreground">
            Job #{job.id} · Priority {job.priority}
          </div>
        </div>

        {/* Status badge */}
        <Badge variant="outline" className={cn("text-xs border-white/10 shrink-0", statusCfg.color, statusCfg.bg)}>
          {statusCfg.label}
        </Badge>

        {/* Cost */}
        <div className="text-right shrink-0 hidden sm:block">
          <div className="text-xs text-muted-foreground">Cost</div>
          <div className="text-sm font-mono">{Number(job.costCredits || 0).toFixed(0)} cr</div>
        </div>

        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded bg-white/5 p-2">
                  <div className="text-muted-foreground">GPU</div>
                  <div className="font-mono">{job.gpuType || "h100_sxm"}</div>
                </div>
                <div className="rounded bg-white/5 p-2">
                  <div className="text-muted-foreground">Cost (USD)</div>
                  <div className="font-mono">${Number(job.costUsd || 0).toFixed(2)}</div>
                </div>
                <div className="rounded bg-white/5 p-2">
                  <div className="text-muted-foreground">Started</div>
                  <div className="font-mono">{job.startedAt ? new Date(job.startedAt).toLocaleTimeString() : "—"}</div>
                </div>
                <div className="rounded bg-white/5 p-2">
                  <div className="text-muted-foreground">Completed</div>
                  <div className="font-mono">{job.completedAt ? new Date(job.completedAt).toLocaleTimeString() : "—"}</div>
                </div>
              </div>
              {job.errorMessage && (
                <div className="mt-2 rounded bg-[var(--status-error)]/10 border border-[var(--status-error)]/20 p-2 text-xs text-[var(--status-error)]">
                  {job.errorMessage}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Batch Training Page ────────────────────────────────────────────────

export default function BatchTraining() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { user, loading: authLoading } = useAuth();

  // Extract batchId from search params
  const batchId = useMemo(() => {
    const params = new URLSearchParams(searchStr);
    return params.get("batchId") || null;
  }, [searchStr]);

  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [gpuType, setGpuType] = useState<"h100_sxm" | "a100_80gb" | "rtx_4090">("h100_sxm");
  const [activeTab, setActiveTab] = useState(batchId ? "monitor" : "setup");

  const utils = trpc.useUtils();

  // Queries
  const { data: characters } = trpc.characterLibrary.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const { data: batchStatus, isLoading: batchLoading } = trpc.characterLibrary.getBatchStatus.useQuery(
    { batchId: batchId! },
    { enabled: !!user && !!batchId, refetchInterval: 5000 }
  );

  const { data: batchEstimate } = trpc.characterLibrary.getBatchEstimate.useQuery(
    { characterIds: selectedCharacters, gpuType },
    { enabled: !!user && selectedCharacters.length > 0 }
  );

  // Mutations
  const batchTrainMutation = trpc.characterLibrary.batchTrain.useMutation({
    onSuccess: (data) => {
      toast.success(`Batch training started: ${data.jobs.length} jobs queued`);
      navigate(`/batch-training?batchId=${data.batchId}`);
      setActiveTab("monitor");
      utils.characterLibrary.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Trainable characters (untrained, needs_retraining, or failed)
  const trainableCharacters = useMemo(() => {
    if (!characters) return [];
    return characters.filter(c =>
      c.loraStatus === "untrained" || c.loraStatus === "needs_retraining" || c.loraStatus === "failed"
    );
  }, [characters]);

  const toggleCharacter = (id: number) => {
    setSelectedCharacters(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCharacters(trainableCharacters.map(c => c.id));
  };

  const selectNone = () => {
    setSelectedCharacters([]);
  };

  // Auth guard
  if (!authLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <div className="text-center space-y-4">
          <Sparkles className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="font-heading text-xl">Sign in to access batch training</h2>
          <Button asChild className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0">
            <a href={getLoginUrl("/batch-training")}>Sign In</a>
          </Button>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-void)]">
        <Loader2 className="w-8 h-8 animate-spin text-cyan" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-void)]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/characters")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Library
          </Button>
          <div className="h-5 w-px bg-white/10" />
          <div>
            <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
              <Zap className="w-6 h-6 text-cyan" /> Batch LoRA Training
            </h1>
            <p className="text-sm text-muted-foreground">Train multiple character LoRAs in parallel</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[var(--bg-base)] border border-white/10 mb-6">
            <TabsTrigger value="setup">Setup Batch</TabsTrigger>
            <TabsTrigger value="monitor">
              Monitor
              {batchStatus && (
                <Badge variant="outline" className="ml-1.5 text-[10px] border-white/10">
                  {batchStatus.summary.progressPercent}%
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ─── Setup Tab ─────────────────────────────────────────────── */}
          <TabsContent value="setup">
            <div className="space-y-6">
              {/* GPU Selection */}
              <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] p-5">
                <h3 className="font-heading font-bold mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan" /> GPU Configuration
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "h100_sxm" as const, label: "H100 SXM", desc: "Fastest · ~$2.50/hr", speed: "~12 min/job" },
                    { value: "a100_80gb" as const, label: "A100 80GB", desc: "Balanced · ~$1.80/hr", speed: "~18 min/job" },
                    { value: "rtx_4090" as const, label: "RTX 4090", desc: "Budget · ~$0.90/hr", speed: "~25 min/job" },
                  ].map(gpu => (
                    <button
                      key={gpu.value}
                      type="button"
                      className={cn(
                        "rounded-lg border p-4 text-left transition-all",
                        gpuType === gpu.value
                          ? "border-cyan bg-cyan/10"
                          : "border-white/10 hover:border-white/20"
                      )}
                      onClick={() => setGpuType(gpu.value)}
                    >
                      <Cpu className={cn("w-5 h-5 mb-2", gpuType === gpu.value ? "text-cyan" : "text-muted-foreground")} />
                      <div className="font-medium">{gpu.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{gpu.desc}</div>
                      <div className="text-xs text-cyan mt-1">{gpu.speed}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Character Selection */}
              <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading font-bold flex items-center gap-2">
                    <Users className="w-4 h-4 text-pink" /> Select Characters
                  </h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={selectAll}>
                      Select All ({trainableCharacters.length})
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={selectNone}>
                      Clear
                    </Button>
                  </div>
                </div>

                {trainableCharacters.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--status-success)] mb-3" />
                    <p className="text-muted-foreground">All characters are trained or currently training</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 border-white/10"
                      onClick={() => navigate("/characters")}
                    >
                      Go to Character Library
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {trainableCharacters.map(char => {
                      const selected = selectedCharacters.includes(char.id);
                      return (
                        <button
                          key={char.id}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                            selected
                              ? "border-cyan/30 bg-cyan/5"
                              : "border-white/10 hover:border-white/20"
                          )}
                          onClick={() => toggleCharacter(char.id)}
                        >
                          <Checkbox
                            checked={selected}
                            className="shrink-0"
                          />
                          <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[var(--bg-elevated)]">
                            {char.referenceSheetUrl ? (
                              <img src={char.referenceSheetUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center text-sm font-heading font-bold"
                                style={{ background: "linear-gradient(135deg, var(--token-cyan), var(--token-cyan))" }}
                              >
                                {char.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{char.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {char.loraStatus === "needs_retraining" ? "Needs retraining" :
                               char.loraStatus === "failed" ? "Previous training failed" :
                               "Not yet trained"}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] shrink-0",
                              char.loraStatus === "needs_retraining" ? "border-[var(--status-warning)]/30 text-[var(--status-warning)]" :
                              char.loraStatus === "failed" ? "border-[var(--status-error)]/30 text-[var(--status-error)]" :
                              "border-white/10 text-muted-foreground"
                            )}
                          >
                            {char.loraStatus}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Batch Estimate */}
              {selectedCharacters.length > 0 && batchEstimate && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-cyan/20 bg-cyan/5 p-5"
                >
                  <h3 className="font-heading font-bold mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[var(--token-gold)]" /> Batch Estimate
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div className="rounded bg-white/5 p-3">
                      <div className="text-xs text-muted-foreground">Characters</div>
                      <div className="text-xl font-heading font-bold text-cyan">{selectedCharacters.length}</div>
                    </div>
                    <div className="rounded bg-white/5 p-3">
                      <div className="text-xs text-muted-foreground">Total Credits</div>
                      <div className="text-xl font-heading font-bold text-[var(--token-gold)]">
                        {batchEstimate.totalEstimatedCredits?.toFixed(0) ?? "—"}
                      </div>
                    </div>
                    <div className="rounded bg-white/5 p-3">
                      <div className="text-xs text-muted-foreground">Total USD</div>
                      <div className="text-xl font-heading font-bold">
                        ${batchEstimate.totalEstimatedCostUsd?.toFixed(2) ?? "—"}
                      </div>
                    </div>
                    <div className="rounded bg-white/5 p-3">
                      <div className="text-xs text-muted-foreground">Est. Time</div>
                      <div className="text-xl font-heading font-bold">
                        {batchEstimate.wallClockMinutes?.toFixed(0) ?? "—"} min
                      </div>
                    </div>
                  </div>
                  {batchEstimate.maxConcurrentGpus > 1 && (
                    <div className="mt-3 text-xs text-[var(--status-success)] flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Parallel training: {batchEstimate.maxConcurrentGpus} concurrent GPUs, wall-clock {batchEstimate.wallClockMinutes.toFixed(0)} min
                    </div>
                  )}
                </motion.div>
              )}

              {/* Start Button */}
              <div className="flex justify-end">
                <Button
                  size="lg"
                  disabled={selectedCharacters.length === 0 || batchTrainMutation.isPending}
                  className="bg-gradient-to-r from-[var(--token-cyan)] to-[var(--token-cyan)] text-white border-0"
                  onClick={() => batchTrainMutation.mutate({
                    characterIds: selectedCharacters,
                    gpuType,
                  })}
                >
                  {batchTrainMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Start Batch Training ({selectedCharacters.length} characters)
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ─── Monitor Tab ───────────────────────────────────────────── */}
          <TabsContent value="monitor">
            {!batchId ? (
              <div className="text-center py-16">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-heading text-lg font-bold mb-1">No Active Batch</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a batch training job from the Setup tab to monitor progress here.
                </p>
                <Button variant="outline" className="border-white/10" onClick={() => setActiveTab("setup")}>
                  Go to Setup
                </Button>
              </div>
            ) : batchLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-cyan" />
              </div>
            ) : batchStatus ? (
              <div className="space-y-6">
                {/* Progress Summary */}
                <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] p-6">
                  <div className="flex items-center gap-6">
                    {/* Progress Ring */}
                    <div className="relative shrink-0">
                      <ProgressRing percent={batchStatus.summary.progressPercent} size={100} stroke={8} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-heading font-bold">{batchStatus.summary.progressPercent}%</span>
                      </div>
                    </div>

                    {/* Summary stats */}
                    <div className="flex-1">
                      <h3 className="font-heading text-lg font-bold mb-1">
                        Batch: {batchStatus.batchId.slice(0, 12)}...
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-[var(--status-success)]" />
                          <span className="text-sm">
                            <span className="font-bold">{batchStatus.summary.completed}</span>
                            <span className="text-muted-foreground"> completed</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-cyan" />
                          <span className="text-sm">
                            <span className="font-bold">{batchStatus.summary.inProgress}</span>
                            <span className="text-muted-foreground"> in progress</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                          <span className="text-sm">
                            <span className="font-bold">{batchStatus.summary.queued}</span>
                            <span className="text-muted-foreground"> queued</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-[var(--status-error)]" />
                          <span className="text-sm">
                            <span className="font-bold">{batchStatus.summary.failed}</span>
                            <span className="text-muted-foreground"> failed</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-3 rounded-full bg-white/5 overflow-hidden flex">
                    {batchStatus.summary.completed > 0 && (
                      <motion.div
                        className="h-full bg-[var(--status-success)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchStatus.summary.completed / batchStatus.summary.total) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    )}
                    {batchStatus.summary.inProgress > 0 && (
                      <motion.div
                        className="h-full bg-cyan"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchStatus.summary.inProgress / batchStatus.summary.total) * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.1 }}
                      />
                    )}
                    {batchStatus.summary.failed > 0 && (
                      <motion.div
                        className="h-full bg-[var(--status-error)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(batchStatus.summary.failed / batchStatus.summary.total) * 100}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      />
                    )}
                  </div>
                </div>

                {/* Job List */}
                <div>
                  <h3 className="font-heading font-bold mb-3 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-cyan" /> Training Jobs
                  </h3>
                  <div className="space-y-2">
                    {batchStatus.jobs.map((job: any) => (
                      <JobRow key={job.id} job={job} />
                    ))}
                  </div>
                </div>

                {/* Refresh note */}
                <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Auto-refreshing every 5 seconds
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <AlertTriangle className="w-10 h-10 mx-auto text-[var(--status-warning)] mb-3" />
                <p className="text-muted-foreground">Batch not found</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
