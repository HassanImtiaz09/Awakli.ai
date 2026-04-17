import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Download, AlertTriangle, CheckCircle2, XCircle,
  Eye, ChevronDown, ChevronUp, BarChart3, Shield, Sparkles,
  TrendingDown, TrendingUp, Info, Layers, Film, Zap,
  Wrench, Loader2, ArrowUpCircle, Target, Clock, CreditCard,
  History, RotateCcw, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import BeforeAfterComparison, { type ComparisonData, type ReFixProps } from "@/components/BeforeAfterComparison";
import FixDriftAnalyticsDashboard from "@/components/FixDriftAnalyticsDashboard";
import LoraRetrainingRecommendation from "@/components/LoraRetrainingRecommendation";

// ─── Grade Colors ───────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  A: { bg: "bg-emerald-500/20", text: "text-emerald-400", ring: "ring-emerald-500/40" },
  B: { bg: "bg-cyan-500/20", text: "text-cyan-400", ring: "ring-cyan-500/40" },
  C: { bg: "bg-yellow-500/20", text: "text-yellow-400", ring: "ring-yellow-500/40" },
  D: { bg: "bg-orange-500/20", text: "text-orange-400", ring: "ring-orange-500/40" },
  F: { bg: "bg-red-500/20", text: "text-red-400", ring: "ring-red-500/40" },
};

const SEVERITY_COLORS = {
  ok: "border-emerald-500/30",
  warning: "border-yellow-500/50",
  critical: "border-red-500/50",
};

const CONFIDENCE_CONFIG = {
  high: { label: "High", color: "text-emerald-400", bg: "bg-emerald-500/20", ring: "ring-emerald-500/30" },
  medium: { label: "Medium", color: "text-yellow-400", bg: "bg-yellow-500/20", ring: "ring-yellow-500/30" },
  low: { label: "Low", color: "text-red-400", bg: "bg-red-500/20", ring: "ring-red-500/30" },
};

// ─── Drift Timeline SVG ─────────────────────────────────────────────────

function DriftTimeline({
  timeline,
  threshold,
  episodes,
  onFrameClick,
  selectedFrameId,
}: {
  timeline: Array<{ generationId: number; frameIndex: number; episodeNumber: number; driftScore: number; isFlagged: boolean }>;
  threshold: number;
  episodes: Array<{ episodeNumber: number; frameCount: number }>;
  onFrameClick: (generationId: number) => void;
  selectedFrameId: number | null;
}) {
  const width = 900;
  const height = 220;
  const padding = { top: 20, right: 30, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        No generation data available for timeline
      </div>
    );
  }

  const maxDrift = Math.max(0.3, ...timeline.map(t => t.driftScore));
  const xScale = (i: number) => padding.left + (i / Math.max(1, timeline.length - 1)) * chartW;
  const yScale = (v: number) => padding.top + chartH - (v / maxDrift) * chartH;

  const linePath = timeline
    .map((t, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(t.driftScore)}`)
    .join(" ");

  const flaggedRegions: Array<{ x1: number; x2: number }> = [];
  let regionStart: number | null = null;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].isFlagged && regionStart === null) regionStart = i;
    if ((!timeline[i].isFlagged || i === timeline.length - 1) && regionStart !== null) {
      const end = timeline[i].isFlagged ? i : i - 1;
      flaggedRegions.push({ x1: xScale(regionStart), x2: xScale(end) });
      regionStart = null;
    }
  }

  let cumFrames = 0;
  const episodeBoundaries: Array<{ x: number; label: string }> = [];
  for (const ep of episodes) {
    if (cumFrames > 0) {
      episodeBoundaries.push({ x: xScale(cumFrames), label: `Ep ${ep.episodeNumber}` });
    }
    cumFrames += ep.frameCount;
  }

  const yTicks = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3].filter(v => v <= maxDrift);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <rect x={padding.left} y={padding.top} width={chartW} height={chartH} fill="rgba(255,255,255,0.02)" rx="4" />
      {flaggedRegions.map((r, i) => (
        <rect key={i} x={r.x1} y={padding.top} width={Math.max(2, r.x2 - r.x1)} height={chartH}
          fill="rgba(239,68,68,0.08)" />
      ))}
      {episodeBoundaries.map((b, i) => (
        <g key={i}>
          <line x1={b.x} y1={padding.top} x2={b.x} y2={padding.top + chartH}
            stroke="rgba(255,255,255,0.1)" strokeDasharray="4,4" />
          <text x={b.x} y={height - 5} fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="middle">
            {b.label}
          </text>
        </g>
      ))}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={padding.left} y1={yScale(v)} x2={padding.left + chartW} y2={yScale(v)}
            stroke="rgba(255,255,255,0.05)" />
          <text x={padding.left - 8} y={yScale(v) + 3} fill="rgba(255,255,255,0.4)" fontSize="9" textAnchor="end">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      <line x1={padding.left} y1={yScale(threshold)} x2={padding.left + chartW} y2={yScale(threshold)}
        stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7" />
      <text x={padding.left + chartW + 4} y={yScale(threshold) + 3} fill="#ef4444" fontSize="9">
        Threshold
      </text>
      <path d={linePath} fill="none" stroke="url(#driftGradient)" strokeWidth="2" strokeLinejoin="round" />
      <defs>
        <linearGradient id="driftGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      {timeline.map((t, i) => (
        <circle
          key={t.generationId}
          cx={xScale(i)}
          cy={yScale(t.driftScore)}
          r={t.generationId === selectedFrameId ? 5 : t.isFlagged ? 4 : 2.5}
          fill={t.isFlagged ? "#ef4444" : "#06b6d4"}
          stroke={t.generationId === selectedFrameId ? "#fff" : "none"}
          strokeWidth={2}
          opacity={t.generationId === selectedFrameId ? 1 : 0.8}
          className="cursor-pointer hover:opacity-100"
          onClick={() => onFrameClick(t.generationId)}
        />
      ))}
      <text x={padding.left + chartW / 2} y={height - 2} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle">
        Frame Index
      </text>
      <text x={12} y={padding.top + chartH / 2} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="middle"
        transform={`rotate(-90, 12, ${padding.top + chartH / 2})`}>
        Drift Score
      </text>
    </svg>
  );
}

// ─── Feature Drift Bar ──────────────────────────────────────────────────

function FeatureDriftBar({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  const pct = Math.round(value * 100);
  const color = value > 0.25 ? "bg-red-500" : value > 0.15 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">{label}</span>
          <span className={value > 0.25 ? "text-red-400" : value > 0.15 ? "text-yellow-400" : "text-emerald-400"}>
            {pct}%
          </span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Fix Drift Confirmation Dialog ──────────────────────────────────────

interface FixDriftDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  jobSpec: {
    boostParams: {
      originalStrength: number;
      boostedStrength: number;
      boostDelta: number;
      targetFeatures: string[];
      negativePromptAdditions: string[];
      fixConfidence: "high" | "medium" | "low";
    };
    estimatedCredits: number;
    formattedTime: string;
    driftScore: number;
    severity: "warning" | "critical";
    frameIndex: number;
    episodeId: number;
  } | null;
}

function FixDriftDialog({ open, onClose, onConfirm, isLoading, jobSpec }: FixDriftDialogProps) {
  if (!jobSpec) return null;
  const conf = CONFIDENCE_CONFIG[jobSpec.boostParams.fixConfidence];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-base border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wrench className="h-5 w-5 text-orange-400" />
            Fix Drift — Frame #{jobSpec.frameIndex}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Re-generate this frame with boosted LoRA strength to correct appearance drift.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Boost params */}
          <div className="bg-white/[0.03] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">LoRA Strength</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{(jobSpec.boostParams.originalStrength * 100).toFixed(0)}%</span>
                <ArrowUpCircle className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-sm font-bold text-orange-400">{(jobSpec.boostParams.boostedStrength * 100).toFixed(0)}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Boost Delta</span>
              <span className="text-sm font-medium text-orange-400">+{(jobSpec.boostParams.boostDelta * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Current Drift</span>
              <span className={`text-sm font-medium ${
                jobSpec.severity === "critical" ? "text-red-400" : "text-yellow-400"
              }`}>{(jobSpec.driftScore * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Target features */}
          {jobSpec.boostParams.targetFeatures.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-cyan" />
                <span className="text-xs font-medium text-foreground">Target Features</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {jobSpec.boostParams.targetFeatures.map(f => (
                  <Badge key={f} variant="outline" className="text-xs border-cyan/30 text-cyan">
                    {f.replace(/([A-Z])/g, " $1").trim()}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Cost + Time + Confidence */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.03] rounded-lg p-3 text-center">
              <CreditCard className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">{jobSpec.estimatedCredits}</div>
              <div className="text-[10px] text-muted-foreground">Credits</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3 text-center">
              <Clock className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
              <div className="text-lg font-bold text-foreground">{jobSpec.formattedTime}</div>
              <div className="text-[10px] text-muted-foreground">Est. Time</div>
            </div>
            <div className={`rounded-lg p-3 text-center ring-1 ${conf.bg} ${conf.ring}`}>
              <Shield className="h-4 w-4 mx-auto mb-1" />
              <div className={`text-lg font-bold ${conf.color}`}>{conf.label}</div>
              <div className="text-[10px] text-muted-foreground">Confidence</div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            {isLoading ? "Queuing..." : "Queue Fix"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Batch Fix Dialog ───────────────────────────────────────────────────

interface BatchFixDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  estimate: {
    totalFrames: number;
    criticalFrames: number;
    warningFrames: number;
    totalEstimatedCredits: number;
    formattedTotalTime: string;
    avgBoostDelta: number;
  } | null;
}

function BatchFixDialog({ open, onClose, onConfirm, isLoading, estimate }: BatchFixDialogProps) {
  if (!estimate) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-base border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wrench className="h-5 w-5 text-orange-400" />
            Batch Fix — {estimate.totalFrames} Flagged Frames
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Queue re-generation for all flagged frames with boosted LoRA strength.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Frame breakdown */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.03] rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{estimate.totalFrames}</div>
              <div className="text-[10px] text-muted-foreground">Total Frames</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-red-400">{estimate.criticalFrames}</div>
              <div className="text-[10px] text-muted-foreground">Critical</div>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-yellow-400">{estimate.warningFrames}</div>
              <div className="text-[10px] text-muted-foreground">Warning</div>
            </div>
          </div>

          {/* Cost summary */}
          <div className="bg-white/[0.03] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total Credits</span>
              <span className="text-sm font-bold text-foreground">{estimate.totalEstimatedCredits}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Estimated Time</span>
              <span className="text-sm font-medium text-foreground">{estimate.formattedTotalTime}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Avg Boost Delta</span>
              <span className="text-sm font-medium text-orange-400">+{(estimate.avgBoostDelta * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white gap-2"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            {isLoading ? "Queuing..." : `Fix All ${estimate.totalFrames} Frames`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Priority Helper ─────────────────────────────────────────────

function statusPriority(status: "queued" | "processing" | "completed" | "failed"): number {
  switch (status) {
    case "queued": return 1;
    case "processing": return 2;
    case "completed": return 3;
    case "failed": return 3; // same as completed (terminal)
    default: return 0;
  }
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function ConsistencyReport() {
  const params = useParams<{ id: string }>();
  const characterId = Number(params.id);
  const { user, loading: authLoading } = useAuth();

  const [driftThreshold, setDriftThreshold] = useState(0.15);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [showAllFrames, setShowAllFrames] = useState(false);

  // Fix drift state
  const [fixingFrameId, setFixingFrameId] = useState<number | null>(null);
  const [showBatchFixDialog, setShowBatchFixDialog] = useState(false);
  const [fixJobStatuses, setFixJobStatuses] = useState<Record<number, {
    status: "queued" | "processing" | "completed" | "failed";
    improvement: number | null;
    jobId?: number;
  }>>({});

  const { data: report, isLoading } = trpc.characterLibrary.getConsistencyReport.useQuery(
    { characterId, driftThreshold },
    { enabled: !!user && !isNaN(characterId) }
  );

  // ── Fix Drift Analytics ───────────────────────────────────────────────
  const { data: analyticsData, isLoading: analyticsLoading } = trpc.characterLibrary.getFixDriftAnalytics.useQuery(
    { characterId },
    { enabled: !!user && !isNaN(characterId) }
  );

  // ── LoRA Retraining Recommendation ────────────────────────────────────
  const { data: retrainingData, isLoading: retrainingLoading } = trpc.characterLibrary.getRetrainingRecommendation.useQuery(
    { characterId },
    { enabled: !!user && !isNaN(characterId) }
  );

  // ── Persisted fix history ─────────────────────────────────────────────
  const { data: fixHistory, refetch: refetchHistory } = trpc.characterLibrary.getFixDriftHistory.useQuery(
    { characterId, limit: 200 },
    { enabled: !!user && !isNaN(characterId) }
  );

  // Merge persisted history into local fixJobStatuses on load
  useEffect(() => {
    if (!fixHistory || fixHistory.length === 0) return;
    setFixJobStatuses(prev => {
      const merged = { ...prev };
      for (const job of fixHistory) {
        // Only overwrite if we don't have a more recent local status
        // or if the DB status is more advanced
        const existing = merged[job.generationId];
        const dbStatus = {
          status: job.status as "queued" | "processing" | "completed" | "failed",
          improvement: job.driftImprovement != null ? Math.round(job.driftImprovement * 100) : null,
          jobId: job.jobId,
        };
        if (!existing || statusPriority(dbStatus.status) >= statusPriority(existing.status)) {
          merged[job.generationId] = dbStatus;
        }
      }
      return merged;
    });
  }, [fixHistory]);

  // Poll for in-progress jobs to get updated statuses
  const hasInProgressJobs = useMemo(() => {
    return Object.values(fixJobStatuses).some(s => s.status === "queued" || s.status === "processing");
  }, [fixJobStatuses]);

  useEffect(() => {
    if (!hasInProgressJobs) return;
    const interval = setInterval(() => { refetchHistory(); }, 3000);
    return () => clearInterval(interval);
  }, [hasInProgressJobs, refetchHistory]);

  // Get fix history for a specific frame
  const getFrameFixHistory = useCallback((generationId: number) => {
    if (!fixHistory) return [];
    return fixHistory
      .filter(j => j.generationId === generationId)
      .sort((a, b) => (b.queuedAt ?? 0) - (a.queuedAt ?? 0));
  }, [fixHistory]);

  // Fix drift mutations
  const fixDriftMutation = trpc.characterLibrary.fixDrift.useMutation({
    onSuccess: (data) => {
      setFixingFrameId(null);
      setFixJobStatuses(prev => ({
        ...prev,
        [data.generationId]: { status: "queued", improvement: null, jobId: data.jobId },
      }));
      toast.success(`Fix queued for Frame #${data.frameIndex}`, {
        description: `${data.estimatedCredits} credits, ~${data.formattedTime}`,
      });
      // Refetch history to pick up DB-persisted status updates
      setTimeout(() => refetchHistory(), 2000);
    },
    onError: (err) => {
      toast.error("Failed to queue fix", { description: err.message });
    },
  });

  // Re-fix mutation
  const reFixMutation = trpc.characterLibrary.reFix.useMutation({
    onSuccess: (data) => {
      setFixJobStatuses(prev => ({
        ...prev,
        [data.jobId]: { status: "queued", improvement: null, jobId: data.jobId },
      }));
      toast.success(`Re-fix queued (attempt #${data.attemptNumber})`, {
        description: `${data.estimatedCredits} credits, ~${data.formattedTime}. New LoRA: ${(data.newBoostedStrength * 100).toFixed(0)}%`,
      });
      setTimeout(() => refetchHistory(), 2000);
    },
    onError: (err) => {
      toast.error("Failed to queue re-fix", { description: err.message });
    },
  });

  const handleReFix = useCallback((jobId: number) => {
    reFixMutation.mutate({ jobId, characterId });
  }, [characterId, reFixMutation]);

  const fixDriftBatchMutation = trpc.characterLibrary.fixDriftBatch.useMutation({
    onSuccess: (data) => {
      setShowBatchFixDialog(false);
      // Mark all frames as queued with their DB job IDs
      const newStatuses: typeof fixJobStatuses = {};
      for (let i = 0; i < data.jobs.length; i++) {
        const job = data.jobs[i];
        newStatuses[job.generationId] = {
          status: "queued",
          improvement: null,
          jobId: data.jobIds?.[i],
        };
      }
      setFixJobStatuses(prev => ({ ...prev, ...newStatuses }));
      toast.success(`Batch fix queued: ${data.totalFrames} frames`, {
        description: `${data.totalEstimatedCredits} credits, ~${data.formattedTotalTime}`,
      });
      // Refetch history to pick up DB-persisted status updates
      setTimeout(() => refetchHistory(), 2000);
    },
    onError: (err) => {
      toast.error("Failed to queue batch fix", { description: err.message });
    },
  });

  // Single fix confirmation data
  const [pendingFixFrame, setPendingFixFrame] = useState<{
    generationId: number;
    driftScore: number;
    loraStrength: number | null;
    loraVersion: number | null;
    severity: "warning" | "critical";
    featureDrifts: { face: number; hair: number; outfit: number; colorPalette: number; bodyProportion: number };
    sceneId: number | null;
    episodeId: number;
    frameIndex: number;
    resultUrl: string;
  } | null>(null);

  const [singleFixJobSpec, setSingleFixJobSpec] = useState<any>(null);

  const handleFixDriftClick = useCallback((frame: any) => {
    const frameData = {
      generationId: frame.generationId,
      driftScore: frame.driftScore,
      loraStrength: frame.loraStrength,
      loraVersion: frame.loraVersion,
      severity: frame.severity === "critical" ? "critical" as const : "warning" as const,
      featureDrifts: frame.featureDrifts,
      sceneId: frame.sceneId ?? null,
      episodeId: frame.episodeId,
      frameIndex: frame.frameIndex,
      resultUrl: frame.resultUrl ?? "",
    };
    setPendingFixFrame(frameData);

    // Call mutation to get job spec (preview)
    fixDriftMutation.mutate({
      characterId,
      ...frameData,
    });
  }, [characterId, fixDriftMutation]);

  // When fixDrift returns, show the confirmation dialog
  const handleConfirmFix = useCallback(() => {
    if (!pendingFixFrame) return;
    // The mutation already ran in handleFixDriftClick — the onSuccess handler
    // already queued the job. Just close the dialog.
    setPendingFixFrame(null);
    setSingleFixJobSpec(null);
  }, [pendingFixFrame]);

  const handleBatchFix = useCallback(() => {
    if (!report) return;
    const frames = filteredFlagged.map(f => ({
      generationId: f.generationId,
      driftScore: f.driftScore,
      loraStrength: f.loraStrength,
      loraVersion: f.loraVersion,
      severity: f.severity === "critical" ? "critical" as const : "warning" as const,
      featureDrifts: f.featureDrifts,
      sceneId: f.sceneId ?? null,
      episodeId: f.episodeId,
      frameIndex: f.frameIndex,
      resultUrl: f.resultUrl ?? "",
    }));
    fixDriftBatchMutation.mutate({ characterId, frames });
  }, [report, characterId, fixDriftBatchMutation]);

  // Re-filter flagged frames client-side when threshold changes
  const filteredFlagged = useMemo(() => {
    if (!report) return [];
    return report.allFrames
      .filter(f => f.driftScore >= driftThreshold)
      .sort((a, b) => b.driftScore - a.driftScore);
  }, [report, driftThreshold]);

  const filteredTimeline = useMemo(() => {
    if (!report) return [];
    return report.timeline.map(t => ({
      ...t,
      isFlagged: t.driftScore >= driftThreshold,
    }));
  }, [report, driftThreshold]);

  const selectedFrame = useMemo(() => {
    if (!selectedFrameId || !report) return null;
    return report.allFrames.find(f => f.generationId === selectedFrameId) ?? null;
  }, [selectedFrameId, report]);

  // Batch estimate for dialog
  const batchEstimate = useMemo(() => {
    if (!report || filteredFlagged.length === 0) return null;
    // Quick client-side estimate
    const frames = filteredFlagged.filter(f => f.severity === "warning" || f.severity === "critical");
    const criticalCount = frames.filter(f => f.severity === "critical").length;
    const warningCount = frames.filter(f => f.severity === "warning").length;
    // Rough estimate: 10 credits per frame avg
    const totalCredits = frames.length * 10;
    const totalSeconds = frames.length * 48;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const formattedTime = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    return {
      totalFrames: frames.length,
      criticalFrames: criticalCount,
      warningFrames: warningCount,
      totalEstimatedCredits: totalCredits,
      formattedTotalTime: formattedTime,
      avgBoostDelta: 0.08,
    };
  }, [report, filteredFlagged]);

  const handleExport = useCallback(() => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consistency-report-${report.characterName.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Card className="bg-base border-white/10 p-8 text-center max-w-md">
          <p className="text-foreground mb-4">Sign in to view consistency reports</p>
          <a href={getLoginUrl("/characters")} className="text-cyan hover:underline">Sign In</a>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-void">
        <div className="container max-w-7xl py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-white/5 rounded w-64" />
            <div className="h-48 bg-white/5 rounded" />
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 rounded" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <Card className="bg-base border-white/10 p-8 text-center">
          <p className="text-muted-foreground">Character not found or no data available.</p>
          <Link href="/characters" className="text-cyan hover:underline mt-4 inline-block">Back to Library</Link>
        </Card>
      </div>
    );
  }

  const gradeColor = GRADE_COLORS[report.grade.letter] ?? GRADE_COLORS.C;
  const flaggedPct = report.totalFrames > 0 ? ((filteredFlagged.length / report.totalFrames) * 100).toFixed(1) : "0";

  return (
    <div className="min-h-screen bg-void">
      <div className="container max-w-7xl py-8 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/characters/${characterId}`}>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Consistency Report</h1>
              <p className="text-muted-foreground mt-1">
                {report.characterName} &middot; {report.totalFrames} frames across {report.episodes.length} episodes
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" /> Export JSON
          </Button>
        </div>

        {/* ── Grade + Summary Cards ──────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className={`bg-base border-white/10 col-span-1 ${gradeColor.bg} ring-1 ${gradeColor.ring}`}>
            <CardContent className="p-6 flex flex-col items-center justify-center text-center">
              <div className={`text-5xl font-black ${gradeColor.text}`}>{report.grade.letter}</div>
              <div className="text-sm font-medium text-foreground mt-1">{report.grade.label}</div>
              <div className="text-xs text-muted-foreground mt-1">Score: {report.grade.score}/100</div>
            </CardContent>
          </Card>

          <Card className="bg-base border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <BarChart3 className="h-4 w-4" />
                <span className="text-xs">Avg Drift</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{(report.avgDrift * 100).toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {report.avgDrift < 0.1 ? "Excellent" : report.avgDrift < 0.15 ? "Good" : "Needs attention"}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-base border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs">Max Drift</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{(report.maxDrift * 100).toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground mt-1">Worst single frame</div>
            </CardContent>
          </Card>

          <Card className="bg-base border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">Flagged</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{filteredFlagged.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{flaggedPct}% of all frames</div>
            </CardContent>
          </Card>

          <Card className="bg-base border-white/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Film className="h-4 w-4" />
                <span className="text-xs">Episodes</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{report.episodes.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{report.totalFrames} total frames</div>
            </CardContent>
          </Card>
        </div>

        {/* ── Grade Description ──────────────────────────────────────── */}
        <Card className="bg-base border-white/10">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{report.grade.description}</p>
          </CardContent>
        </Card>

        {/* ── Fix Drift Analytics Dashboard ──────────────────────────── */}
        <FixDriftAnalyticsDashboard data={analyticsData} isLoading={analyticsLoading} />

        {/* ── LoRA Retraining Recommendation ─────────────────────────── */}
        <LoraRetrainingRecommendation data={retrainingData} isLoading={retrainingLoading} />

        {/* ── Drift Threshold Slider ─────────────────────────────────── */}
        <Card className="bg-base border-white/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                <span className="text-sm font-medium text-foreground">Drift Threshold</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {(driftThreshold * 100).toFixed(0)}% — {filteredFlagged.length} flagged
              </Badge>
            </div>
            <Slider
              value={[driftThreshold * 100]}
              onValueChange={([v]) => setDriftThreshold(v / 100)}
              min={1}
              max={30}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Strict (1%)</span>
              <span>Lenient (30%)</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Drift Timeline ─────────────────────────────────────────── */}
        <Card className="bg-base border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-cyan" />
              Drift Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <DriftTimeline
              timeline={filteredTimeline}
              threshold={driftThreshold}
              episodes={report.episodes.map(e => ({ episodeNumber: e.episodeNumber, frameCount: e.frameCount }))}
              onFrameClick={setSelectedFrameId}
              selectedFrameId={selectedFrameId}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Click any point to view frame details. Red regions indicate frames above the drift threshold.
            </p>
          </CardContent>
        </Card>

        {/* ── Episode Breakdown ───────────────────────────────────────── */}
        <Card className="bg-base border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-400" />
              Episode Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left p-3 text-muted-foreground font-medium">Episode</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Score</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Frames</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Flagged</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Avg Drift</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Max Drift</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">LoRA</th>
                    <th className="text-center p-3 text-muted-foreground font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {report.episodes.map(ep => {
                    const epFlagged = filteredFlagged.filter(f => f.episodeId === ep.episodeId).length;
                    const isExpanded = expandedEpisode === ep.episodeId;
                    return (
                      <tr key={ep.episodeId}
                        className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                        onClick={() => setExpandedEpisode(isExpanded ? null : ep.episodeId)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            <span className="text-foreground font-medium">Ep {ep.episodeNumber}</span>
                            <span className="text-muted-foreground text-xs truncate max-w-[120px]">{ep.episodeTitle}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={
                            ep.consistencyScore >= 90 ? "border-emerald-500/50 text-emerald-400" :
                            ep.consistencyScore >= 75 ? "border-cyan-500/50 text-cyan-400" :
                            ep.consistencyScore >= 60 ? "border-yellow-500/50 text-yellow-400" :
                            "border-red-500/50 text-red-400"
                          }>
                            {ep.consistencyScore}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-foreground">{ep.frameCount}</td>
                        <td className="p-3 text-center">
                          {epFlagged > 0 ? (
                            <span className="text-red-400 font-medium">{epFlagged}</span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                          )}
                        </td>
                        <td className="p-3 text-center text-muted-foreground">{(ep.avgDrift * 100).toFixed(1)}%</td>
                        <td className="p-3 text-center text-muted-foreground">{(ep.maxDrift * 100).toFixed(1)}%</td>
                        <td className="p-3 text-center">
                          {ep.loraVersionUsed ? (
                            <Badge variant="secondary" className="text-xs">v{ep.loraVersionUsed}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">None</span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* ── Flagged Frames Gallery ─────────────────────────────────── */}
        <Card className="bg-base border-white/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Flagged Frames
                <Badge variant="destructive" className="text-xs ml-2">{filteredFlagged.length}</Badge>
              </CardTitle>
              <div className="flex items-center gap-2">
                {filteredFlagged.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowBatchFixDialog(true)}
                    className="gap-1.5 text-xs border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    Fix All Flagged
                  </Button>
                )}
                {report.allFrames.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllFrames(!showAllFrames)}
                    className="text-xs text-muted-foreground">
                    {showAllFrames ? "Show Flagged Only" : "Show All Frames"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {filteredFlagged.length === 0 && !showAllFrames ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-3" />
                <p className="text-foreground font-medium">No flagged frames</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All frames are within the {(driftThreshold * 100).toFixed(0)}% drift threshold
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {(showAllFrames ? report.allFrames : filteredFlagged).slice(0, 40).map(frame => {
                  const jobStatus = fixJobStatuses[frame.generationId];
                  return (
                    <Tooltip key={frame.generationId}>
                      <TooltipTrigger asChild>
                        <div
                          className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all hover:scale-105 ${
                            selectedFrameId === frame.generationId
                              ? "ring-2 ring-cyan border-cyan/50"
                              : SEVERITY_COLORS[frame.severity]
                          }`}
                          onClick={() => setSelectedFrameId(
                            selectedFrameId === frame.generationId ? null : frame.generationId
                          )}
                        >
                          {/* Placeholder thumbnail */}
                          <div className="aspect-video bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center">
                            <div className="text-center">
                              <div className="text-xs text-muted-foreground">Ep {frame.episodeNumber}</div>
                              <div className="text-lg font-bold text-foreground">#{frame.frameIndex}</div>
                            </div>
                          </div>

                          {/* Drift badge */}
                          <div className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            frame.severity === "critical" ? "bg-red-500/90 text-white" :
                            frame.severity === "warning" ? "bg-yellow-500/90 text-black" :
                            "bg-emerald-500/90 text-white"
                          }`}>
                            {(frame.driftScore * 100).toFixed(0)}%
                          </div>

                          {/* Previously Fixed badge */}
                          {jobStatus?.status === "completed" && (
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/90 text-white flex items-center gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Fixed
                            </div>
                          )}

                          {/* Fix attempt count badge */}
                          {(() => {
                            const count = fixHistory?.filter(j => j.generationId === frame.generationId).length ?? 0;
                            if (count <= 0) return null;
                            return (
                              <div className="absolute top-1 left-1 px-1 py-0.5 rounded text-[9px] font-medium bg-white/20 text-white backdrop-blur-sm flex items-center gap-0.5" style={jobStatus?.status === "completed" ? { top: '22px' } : {}}>
                                <RotateCcw className="h-2.5 w-2.5" /> {count}x
                              </div>
                            );
                          })()}

                          {/* Fix Drift button overlay */}
                          {(frame.severity === "warning" || frame.severity === "critical") && !jobStatus && (
                            <button
                              className="absolute bottom-1 right-1 p-1 rounded bg-orange-500/80 hover:bg-orange-500 text-white transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFixDriftClick(frame);
                              }}
                              title="Fix Drift"
                            >
                              <Wrench className="h-3 w-3" />
                            </button>
                          )}

                          {/* Job status overlay */}
                          {jobStatus && (
                            <div className={`absolute inset-0 flex items-center justify-center ${
                              jobStatus.status === "completed"
                                ? "bg-emerald-500/20"
                                : jobStatus.status === "failed"
                                  ? "bg-red-500/20"
                                  : "bg-orange-500/10"
                            }`}>
                              {jobStatus.status === "queued" && (
                                <div className="flex flex-col items-center">
                                  <Clock className="h-5 w-5 text-orange-400 animate-pulse" />
                                  <span className="text-[10px] text-orange-400 mt-0.5">Queued</span>
                                </div>
                              )}
                              {jobStatus.status === "processing" && (
                                <div className="flex flex-col items-center">
                                  <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
                                  <span className="text-[10px] text-orange-400 mt-0.5">Fixing...</span>
                                </div>
                              )}
                              {jobStatus.status === "completed" && (
                                <div className="flex flex-col items-center">
                                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                                  {jobStatus.improvement !== null && (
                                    <span className="text-[10px] text-emerald-400 font-bold mt-0.5">
                                      -{jobStatus.improvement}%
                                    </span>
                                  )}
                                </div>
                              )}
                              {jobStatus.status === "failed" && (
                                <div className="flex flex-col items-center">
                                  <XCircle className="h-5 w-5 text-red-400" />
                                  <span className="text-[10px] text-red-400 mt-0.5">Failed</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p>Episode {frame.episodeNumber}, Frame {frame.frameIndex}</p>
                        <p>Drift: {(frame.driftScore * 100).toFixed(1)}% | CLIP: {(frame.clipDrift * 100).toFixed(1)}%</p>
                        {jobStatus?.status === "completed" && jobStatus.improvement !== null && (
                          <p className="text-emerald-400">Fixed! Drift reduced by {jobStatus.improvement}%</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Frame Detail Panel ─────────────────────────────────────── */}
        {selectedFrame && (
          <Card className="bg-base border-cyan/20 ring-1 ring-cyan/10">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-cyan" />
                  Frame Detail — Ep {selectedFrame.episodeNumber}, Frame #{selectedFrame.frameIndex}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Fix Drift button in detail panel */}
                  {(selectedFrame.severity === "warning" || selectedFrame.severity === "critical") &&
                    !fixJobStatuses[selectedFrame.generationId] && (
                    <Button
                      size="sm"
                      onClick={() => handleFixDriftClick(selectedFrame)}
                      disabled={fixDriftMutation.isPending}
                      className="gap-1.5 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white text-xs"
                    >
                      {fixDriftMutation.isPending && fixingFrameId === selectedFrame.generationId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wrench className="h-3.5 w-3.5" />
                      )}
                      Fix Drift
                    </Button>
                  )}
                  {fixJobStatuses[selectedFrame.generationId] && (
                    <Badge
                      variant="outline"
                      className={
                        fixJobStatuses[selectedFrame.generationId].status === "completed"
                          ? "border-emerald-500/50 text-emerald-400"
                          : fixJobStatuses[selectedFrame.generationId].status === "failed"
                            ? "border-red-500/50 text-red-400"
                            : "border-orange-500/50 text-orange-400"
                      }
                    >
                      {fixJobStatuses[selectedFrame.generationId].status === "queued" && "Queued"}
                      {fixJobStatuses[selectedFrame.generationId].status === "processing" && "Fixing..."}
                      {fixJobStatuses[selectedFrame.generationId].status === "completed" && (
                        <>Fixed {fixJobStatuses[selectedFrame.generationId].improvement !== null && `(-${fixJobStatuses[selectedFrame.generationId].improvement}%)`}</>
                      )}
                      {fixJobStatuses[selectedFrame.generationId].status === "failed" && "Failed"}
                    </Badge>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFrameId(null)}
                    className="text-xs text-muted-foreground">
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Reference Sheet</p>
                  <div className="aspect-video bg-gradient-to-br from-cyan/5 to-purple-500/5 rounded-lg border border-white/10 flex items-center justify-center">
                    {report.referenceSheetUrl ? (
                      <img src={report.referenceSheetUrl} alt="Reference" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-muted-foreground text-sm">No reference sheet</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Generated Frame</p>
                  <div className="aspect-video bg-gradient-to-br from-pink/5 to-red-500/5 rounded-lg border border-white/10 flex items-center justify-center">
                    {selectedFrame.resultUrl ? (
                      <img src={selectedFrame.resultUrl} alt="Generated" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-muted-foreground text-sm">Frame preview</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Drift metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Composite Drift</div>
                  <div className={`text-lg font-bold ${
                    selectedFrame.severity === "critical" ? "text-red-400" :
                    selectedFrame.severity === "warning" ? "text-yellow-400" : "text-emerald-400"
                  }`}>
                    {(selectedFrame.driftScore * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">CLIP Drift</div>
                  <div className="text-lg font-bold text-foreground">{(selectedFrame.clipDrift * 100).toFixed(1)}%</div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">LoRA Version</div>
                  <div className="text-lg font-bold text-foreground">
                    {selectedFrame.loraVersion ? `v${selectedFrame.loraVersion}` : "None"}
                  </div>
                </div>
                <div className="bg-white/[0.03] rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">LoRA Strength</div>
                  <div className="text-lg font-bold text-foreground">
                    {selectedFrame.loraStrength != null ? `${(selectedFrame.loraStrength * 100).toFixed(0)}%` : "N/A"}
                  </div>
                </div>
              </div>

              {/* Per-feature drift breakdown */}
              <div>
                <p className="text-sm font-medium text-foreground mb-3">Feature-Level Drift</p>
                <div className="space-y-3">
                  <FeatureDriftBar label="Face" value={selectedFrame.featureDrifts.face}
                    icon={<Shield className="h-4 w-4" />} />
                  <FeatureDriftBar label="Hair" value={selectedFrame.featureDrifts.hair}
                    icon={<Sparkles className="h-4 w-4" />} />
                  <FeatureDriftBar label="Outfit" value={selectedFrame.featureDrifts.outfit}
                    icon={<Layers className="h-4 w-4" />} />
                  <FeatureDriftBar label="Color Palette" value={selectedFrame.featureDrifts.colorPalette}
                    icon={<BarChart3 className="h-4 w-4" />} />
                  <FeatureDriftBar label="Body Proportion" value={selectedFrame.featureDrifts.bodyProportion}
                    icon={<TrendingDown className="h-4 w-4" />} />
                </div>
              </div>

              {/* Before/After Comparison for completed fixes */}
              {(() => {
                const frameHistory = getFrameFixHistory(selectedFrame.generationId);
                const latestCompleted = frameHistory.find(j => j.status === "completed");
                if (!latestCompleted) return null;

                // Estimate post-fix per-feature drifts based on overall improvement ratio
                const improvementRatio = latestCompleted.driftImprovement != null && latestCompleted.originalDriftScore
                  ? latestCompleted.driftImprovement / latestCompleted.originalDriftScore
                  : 0;
                const estimatedFixedFeatureDrifts = {
                  face: Math.max(0, selectedFrame.featureDrifts.face * (1 - improvementRatio * 1.2)),
                  hair: Math.max(0, selectedFrame.featureDrifts.hair * (1 - improvementRatio * 1.1)),
                  outfit: Math.max(0, selectedFrame.featureDrifts.outfit * (1 - improvementRatio * 0.9)),
                  colorPalette: Math.max(0, selectedFrame.featureDrifts.colorPalette * (1 - improvementRatio * 0.8)),
                  bodyProportion: Math.max(0, selectedFrame.featureDrifts.bodyProportion * (1 - improvementRatio * 0.7)),
                };

                const comparisonData: ComparisonData = {
                  originalUrl: selectedFrame.resultUrl || null,
                  fixedUrl: latestCompleted.newResultUrl || null,
                  originalDriftScore: latestCompleted.originalDriftScore ?? selectedFrame.driftScore,
                  newDriftScore: latestCompleted.newDriftScore ?? null,
                  driftImprovement: latestCompleted.driftImprovement ?? null,
                  originalLoraStrength: latestCompleted.originalLoraStrength ?? null,
                  boostedLoraStrength: latestCompleted.boostedLoraStrength ?? 0,
                  boostDelta: latestCompleted.boostDelta ?? 0,
                  fixConfidence: (latestCompleted.fixConfidence as "high" | "medium" | "low") ?? "medium",
                  severity: (latestCompleted.severity as "warning" | "critical") ?? "warning",
                  targetFeatures: latestCompleted.targetFeatures ?? null,
                  originalFeatureDrifts: selectedFrame.featureDrifts,
                  estimatedFixedFeatureDrifts,
                };

                // Build reFix props
                const MAX_STRENGTH = 0.95;
                const canReFix = (latestCompleted.boostedLoraStrength ?? 0) < MAX_STRENGTH;
                const reFixProps: ReFixProps = {
                  jobId: latestCompleted.jobId,
                  canReFix,
                  attemptCount: frameHistory.length,
                  onReFix: handleReFix,
                  isReFixing: reFixMutation.isPending,
                };

                return <BeforeAfterComparison data={comparisonData} reFix={reFixProps} />;
              })()}

              {/* Fix History for this frame */}
              {(() => {
                const frameHistory = getFrameFixHistory(selectedFrame.generationId);
                if (frameHistory.length === 0) return null;
                return (
                  <div className="bg-white/[0.02] border border-white/10 rounded-lg p-4">
                    <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                      <History className="h-4 w-4 text-cyan" /> Fix History
                      <Badge variant="outline" className="text-[10px] ml-1">{frameHistory.length} attempt{frameHistory.length > 1 ? "s" : ""}</Badge>
                    </p>
                    <div className="space-y-2">
                      {frameHistory.map((job, idx) => (
                        <div key={job.jobId} className={`flex items-center justify-between py-2 px-3 rounded-md ${
                          idx === 0 ? "bg-white/[0.04]" : "bg-white/[0.02]"
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              job.status === "completed" ? "bg-emerald-400" :
                              job.status === "failed" ? "bg-red-400" :
                              job.status === "processing" ? "bg-orange-400 animate-pulse" :
                              "bg-yellow-400 animate-pulse"
                            }`} />
                            <div>
                              <span className="text-xs text-foreground capitalize">{job.status}</span>
                              {job.queuedAt && (
                                <span className="text-[10px] text-muted-foreground ml-2">
                                  {new Date(job.queuedAt).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {job.driftImprovement != null && (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-400">
                                -{Math.round(job.driftImprovement * 100)}% drift
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {job.originalDriftScore != null && `${(job.originalDriftScore * 100).toFixed(1)}%`}
                              {job.newDriftScore != null && ` → ${(job.newDriftScore * 100).toFixed(1)}%`}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              +{((job.boostedLoraStrength ?? 0) * 100).toFixed(0)}% LoRA
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Suggestions */}
              {selectedFrame.severity !== "ok" && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Suggestions
                  </p>
                  <ul className="space-y-1">
                    {(() => {
                      const suggestions: string[] = [];
                      if (selectedFrame.featureDrifts.face > 0.2)
                        suggestions.push("Face drift is high — consider increasing LoRA strength or retraining with more frontal face references.");
                      if (selectedFrame.featureDrifts.hair > 0.2)
                        suggestions.push("Hair style/color has drifted — ensure reference sheet includes clear hair views from multiple angles.");
                      if (selectedFrame.featureDrifts.outfit > 0.25)
                        suggestions.push("Outfit inconsistency detected — add outfit-specific reference images.");
                      if (selectedFrame.featureDrifts.colorPalette > 0.2)
                        suggestions.push("Color palette has shifted — may be caused by scene lighting.");
                      if (selectedFrame.loraVersion === null)
                        suggestions.push("Frame generated without LoRA — train and activate a LoRA for better consistency.");
                      if (suggestions.length === 0)
                        suggestions.push("Minor drift detected. Consider reviewing nearby frames for patterns.");
                      return suggestions.map((s, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-yellow-400 mt-0.5">•</span> {s}
                        </li>
                      ));
                    })()}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Batch Fix Dialog ───────────────────────────────────────── */}
        <BatchFixDialog
          open={showBatchFixDialog}
          onClose={() => setShowBatchFixDialog(false)}
          onConfirm={handleBatchFix}
          isLoading={fixDriftBatchMutation.isPending}
          estimate={batchEstimate}
        />

      </div>
    </div>
  );
}
