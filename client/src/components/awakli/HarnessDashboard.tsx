/**
 * HarnessDashboard — Quality Harness Dashboard showing all 22 checks across 5 layers.
 * Displays pass/fail status, scores, flagged items, and re-run controls.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Eye,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  Layers,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface HarnessResult {
  id: number;
  episodeId: number;
  pipelineRunId: number | null;
  layer: string;
  checkName: string;
  targetId: number | null;
  targetType: string | null;
  result: string;
  score: number | null;
  details: any;
  autoFixApplied: string | null;
  attemptNumber: number;
  costCredits: number | null;
  createdAt: string;
}

interface LayerGroup {
  name: string;
  label: string;
  icon: React.ReactNode;
  description: string;
  checks: HarnessResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────

const LAYER_META: Record<string, { label: string; description: string; icon: string }> = {
  script: {
    label: "Script & Continuity",
    description: "Validates script structure, dialogue consistency, and scene continuity",
    icon: "📝",
  },
  visual: {
    label: "Visual Consistency",
    description: "Checks character identity, style adherence, and visual quality",
    icon: "🎨",
  },
  video: {
    label: "Video Quality",
    description: "Validates motion quality, lip sync accuracy, and temporal coherence",
    icon: "🎬",
  },
  audio: {
    label: "Audio Quality",
    description: "Checks voice clarity, music mixing, and audio-visual sync",
    icon: "🔊",
  },
  integration: {
    label: "Assembly & Final",
    description: "Validates final assembly, stream readiness, and end-to-end quality",
    icon: "🔗",
  },
};

const RESULT_CONFIG: Record<string, { color: string; bgColor: string; borderColor: string; label: string; icon: React.ReactNode }> = {
  pass: {
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    borderColor: "border-emerald-400/30",
    label: "PASS",
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  warn: {
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
    borderColor: "border-amber-400/30",
    label: "WARN",
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  retry: {
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    borderColor: "border-blue-400/30",
    label: "RETRY",
    icon: <RefreshCw className="w-4 h-4" />,
  },
  block: {
    color: "text-red-400",
    bgColor: "bg-red-400/10",
    borderColor: "border-red-400/30",
    label: "BLOCK",
    icon: <XCircle className="w-4 h-4" />,
  },
  human_review: {
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
    borderColor: "border-purple-400/30",
    label: "REVIEW",
    icon: <Eye className="w-4 h-4" />,
  },
};

// ─── Component ────────────────────────────────────────────────────────────

interface HarnessDashboardProps {
  pipelineRunId?: number;
  episodeId: number;
  compact?: boolean;
}

export function HarnessDashboard({ pipelineRunId, episodeId, compact = false }: HarnessDashboardProps) {
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(["script", "visual", "video", "audio", "integration"]));
  const [reRunningLayer, setReRunningLayer] = useState<string | null>(null);

  // Fetch results
  const resultsQuery = pipelineRunId
    ? trpc.harness.getRunResults.useQuery({ pipelineRunId })
    : trpc.harness.getEpisodeResults.useQuery({ episodeId });

  const scoreQuery = trpc.harness.getQualityScore.useQuery({ episodeId });
  const flaggedQuery = trpc.harness.getFlaggedItems.useQuery({ episodeId });

  const reRunLayerMutation = trpc.harness.reRunLayer.useMutation({
    onSuccess: () => {
      resultsQuery.refetch();
      scoreQuery.refetch();
      flaggedQuery.refetch();
    },
    onSettled: () => setReRunningLayer(null),
  });

  const reRunAllMutation = trpc.harness.reRunAll.useMutation({
    onSuccess: () => {
      resultsQuery.refetch();
      scoreQuery.refetch();
      flaggedQuery.refetch();
    },
  });

  const results = (resultsQuery.data as any)?.results ?? [];
  const score = scoreQuery.data;
  const flagged = (flaggedQuery.data as any)?.flagged ?? [];

  // Group results by layer, keeping only the latest result per check name
  const layerGroups = groupResultsByLayer(results);

  const toggleLayer = (layer: string) => {
    setExpandedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const handleReRunLayer = (layer: string) => {
    if (!pipelineRunId) return;
    setReRunningLayer(layer);
    reRunLayerMutation.mutate({
      pipelineRunId,
      layer: layer as any,
    });
  };

  const handleReRunAll = () => {
    if (!pipelineRunId) return;
    reRunAllMutation.mutate({ pipelineRunId });
  };

  if (resultsQuery.isLoading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3 text-zinc-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading harness results...</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-3 text-zinc-500">
          <Shield className="w-5 h-5" />
          <span>No harness results yet. Run the pipeline to generate quality checks.</span>
        </div>
      </div>
    );
  }

  // ─── Compact View ───────────────────────────────────────────────────────

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        {score && (
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
            score.overall >= 7 ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
            score.overall >= 5 ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
            "text-red-400 bg-red-400/10 border-red-400/30"
          }`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{score.overall}/10</span>
          </div>
        )}
        {flagged.length > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-purple-400 bg-purple-400/10 border border-purple-400/30">
            <Eye className="w-3 h-3" />
            {flagged.length} flagged
          </span>
        )}
        {layerGroups.map(lg => {
          const passCount = lg.checks.filter(c => c.result === "pass").length;
          const total = lg.checks.length;
          return (
            <span key={lg.name} className="text-[10px] text-zinc-500">
              {LAYER_META[lg.name]?.icon} {passCount}/{total}
            </span>
          );
        })}
      </div>
    );
  }

  // ─── Full View ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header with overall score */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 flex items-center justify-center">
              <Layers className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Quality Harness</h3>
              <p className="text-xs text-zinc-500">22 automated checks across 5 layers</p>
            </div>
          </div>

          {pipelineRunId && (
            <button
              onClick={handleReRunAll}
              disabled={reRunAllMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reRunAllMutation.isPending ? "animate-spin" : ""}`} />
              {reRunAllMutation.isPending ? "Re-running..." : "Re-run All"}
            </button>
          )}
        </div>

        {/* Score Summary */}
        {score && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <ScoreCard
              label="Overall"
              value={score.overall}
              max={10}
              icon={<Shield className="w-4 h-4" />}
            />
            <ScoreCard
              label="Checks Passed"
              value={results.filter((r: HarnessResult) => r.result === "pass").length}
              max={results.length}
              suffix={`/${results.length}`}
              icon={<CheckCircle2 className="w-4 h-4" />}
              isCount
            />
            <ScoreCard
              label="Flagged"
              value={flagged.length}
              max={0}
              icon={<AlertTriangle className="w-4 h-4" />}
              isCount
              danger={flagged.length > 0}
            />
            <ScoreCard
              label="Harness Cost"
              value={score.totalCost}
              max={0}
              prefix="$"
              icon={<DollarSign className="w-4 h-4" />}
              isCount
            />
          </div>
        )}
      </div>

      {/* Layer Groups */}
      {layerGroups.map(lg => (
        <LayerSection
          key={lg.name}
          layer={lg}
          expanded={expandedLayers.has(lg.name)}
          onToggle={() => toggleLayer(lg.name)}
          onReRun={pipelineRunId ? () => handleReRunLayer(lg.name) : undefined}
          isReRunning={reRunningLayer === lg.name}
        />
      ))}

      {/* Flagged Items */}
      {flagged.length > 0 && (
        <div className="bg-zinc-900/50 border border-purple-500/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-purple-400" />
            <h4 className="text-sm font-semibold text-purple-300">Items Requiring Human Review</h4>
          </div>
          <div className="space-y-2">
            {flagged.map((item: HarnessResult) => (
              <div key={item.id} className="flex items-start gap-3 bg-zinc-800/50 rounded-lg p-3">
                <div className="mt-0.5">
                  {RESULT_CONFIG[item.result]?.icon ?? <Eye className="w-4 h-4 text-zinc-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-200">{item.checkName}</span>
                    <span className="text-[10px] text-zinc-500">{LAYER_META[item.layer]?.label}</span>
                  </div>
                  {item.details && typeof item.details === "object" && (
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">
                      {item.details.reason || item.details.message || JSON.stringify(item.details).slice(0, 200)}
                    </p>
                  )}
                </div>
                {item.score !== null && (
                  <span className="text-xs font-mono text-zinc-400">{item.score}/10</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function ScoreCard({
  label,
  value,
  max,
  prefix = "",
  suffix = "",
  icon,
  isCount = false,
  danger = false,
}: {
  label: string;
  value: number;
  max: number;
  prefix?: string;
  suffix?: string;
  icon: React.ReactNode;
  isCount?: boolean;
  danger?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const color = danger
    ? "text-red-400"
    : isCount
    ? "text-zinc-200"
    : pct >= 70
    ? "text-emerald-400"
    : pct >= 50
    ? "text-amber-400"
    : "text-red-400";

  return (
    <div className="bg-zinc-800/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-zinc-500">{icon}</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>
        {prefix}{typeof value === "number" ? (isCount ? value : value.toFixed(1)) : value}{suffix}
      </div>
    </div>
  );
}

function LayerSection({
  layer,
  expanded,
  onToggle,
  onReRun,
  isReRunning,
}: {
  layer: LayerGroup;
  expanded: boolean;
  onToggle: () => void;
  onReRun?: () => void;
  isReRunning: boolean;
}) {
  const meta = LAYER_META[layer.name] || { label: layer.name, description: "", icon: "🔍" };
  const passCount = layer.checks.filter(c => c.result === "pass").length;
  const warnCount = layer.checks.filter(c => c.result === "warn").length;
  const blockCount = layer.checks.filter(c => c.result === "block").length;
  const reviewCount = layer.checks.filter(c => c.result === "human_review").length;
  const total = layer.checks.length;

  const scores = layer.checks.map(c => c.score).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const headerColor = blockCount > 0
    ? "border-red-500/30"
    : reviewCount > 0
    ? "border-purple-500/30"
    : warnCount > 0
    ? "border-amber-500/30"
    : "border-emerald-500/30";

  return (
    <div className={`bg-zinc-900/50 border ${headerColor} rounded-xl overflow-hidden`}>
      {/* Layer Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/30 transition-colors"
      >
        <span className="text-lg">{meta.icon}</span>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">{meta.label}</span>
            <span className="text-[10px] text-zinc-500">{meta.description}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-emerald-400">{passCount} pass</span>
            {warnCount > 0 && <span className="text-xs text-amber-400">{warnCount} warn</span>}
            {blockCount > 0 && <span className="text-xs text-red-400">{blockCount} block</span>}
            {reviewCount > 0 && <span className="text-xs text-purple-400">{reviewCount} review</span>}
            <span className="text-xs text-zinc-500">· avg {avgScore.toFixed(1)}/10</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              passCount === total ? "bg-emerald-400" : blockCount > 0 ? "bg-red-400" : "bg-amber-400"
            }`}
            style={{ width: `${total > 0 ? (passCount / total) * 100 : 0}%` }}
          />
        </div>

        {onReRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onReRun(); }}
            disabled={isReRunning}
            className="p-1.5 rounded-md hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-all disabled:opacity-50"
            title="Re-run this layer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReRunning ? "animate-spin" : ""}`} />
          </button>
        )}

        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {/* Check Details */}
      {expanded && (
        <div className="border-t border-zinc-800">
          {layer.checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}

function CheckRow({ check }: { check: HarnessResult }) {
  const [showDetails, setShowDetails] = useState(false);
  const config = RESULT_CONFIG[check.result] || RESULT_CONFIG.warn;

  return (
    <div className="border-b border-zinc-800/50 last:border-b-0">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/20 transition-colors"
      >
        <span className={config.color}>{config.icon}</span>
        <div className="flex-1 text-left">
          <span className="text-xs font-medium text-zinc-200">{check.checkName}</span>
          {check.autoFixApplied && (
            <span className="ml-2 text-[10px] text-blue-400">auto-fixed</span>
          )}
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color} ${config.bgColor} border ${config.borderColor}`}>
          {config.label}
        </span>
        {check.score !== null && (
          <span className="text-xs font-mono text-zinc-400 w-10 text-right">{check.score}/10</span>
        )}
        {check.attemptNumber > 1 && (
          <span className="text-[10px] text-zinc-600">×{check.attemptNumber}</span>
        )}
        {showDetails ? (
          <ChevronDown className="w-3 h-3 text-zinc-600" />
        ) : (
          <ChevronRight className="w-3 h-3 text-zinc-600" />
        )}
      </button>

      {showDetails && check.details && (
        <div className="px-4 pb-3 ml-7">
          <div className="bg-zinc-800/50 rounded-lg p-3 text-[11px] text-zinc-400 font-mono whitespace-pre-wrap break-all">
            {typeof check.details === "string"
              ? check.details
              : JSON.stringify(check.details, null, 2)}
          </div>
          {check.autoFixApplied && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-blue-400">
              <RefreshCw className="w-3 h-3" />
              Auto-fix: {check.autoFixApplied}
            </div>
          )}
          {check.costCredits !== null && check.costCredits > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
              <DollarSign className="w-3 h-3" />
              Cost: ${check.costCredits.toFixed(4)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Production Bible Viewer ──────────────────────────────────────────────

interface ProductionBibleViewerProps {
  projectId: number;
}

export function ProductionBibleViewer({ projectId }: ProductionBibleViewerProps) {
  const bibleQuery = trpc.productionBible.get.useQuery({ projectId });
  const compileMutation = trpc.productionBible.compile.useMutation({
    onSuccess: () => bibleQuery.refetch(),
  });
  const lockMutation = trpc.productionBible.lock.useMutation({
    onSuccess: () => bibleQuery.refetch(),
  });

  const bible = (bibleQuery.data as any)?.bible;

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Production Bible</h3>
            <p className="text-xs text-zinc-500">Canonical reference for all quality checks</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => compileMutation.mutate({ projectId })}
            disabled={compileMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${compileMutation.isPending ? "animate-spin" : ""}`} />
            {compileMutation.isPending ? "Compiling..." : "Compile"}
          </button>
          {bible && !bible.lockedAt && (
            <button
              onClick={() => lockMutation.mutate({ projectId })}
              disabled={lockMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-600/30 text-amber-400 hover:bg-amber-400/10 transition-all disabled:opacity-50"
            >
              {lockMutation.isPending ? "Locking..." : "Lock Bible"}
            </button>
          )}
        </div>
      </div>

      {bibleQuery.isLoading && (
        <div className="text-xs text-zinc-500">Loading...</div>
      )}

      {!bible && !bibleQuery.isLoading && (
        <div className="text-xs text-zinc-500">
          No production bible compiled yet. Click "Compile" to generate one from your pre-production settings.
        </div>
      )}

      {bible && (
        <div className="space-y-3">
          {/* Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetaField label="Project" value={bible.projectTitle || bible.bibleData?.projectTitle} />
            <MetaField label="Style" value={bible.artStyle || bible.bibleData?.artStyle || "—"} />
            <MetaField label="Genre" value={Array.isArray(bible.genre || bible.bibleData?.genre) ? (bible.genre || bible.bibleData?.genre).join(", ") : "—"} />
            <MetaField label="Version" value={`v${bible.version || 1}`} />
          </div>

          {/* Characters */}
          {(bible.characters || bible.bibleData?.characters)?.length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Characters ({(bible.characters || bible.bibleData?.characters).length})</div>
              <div className="flex flex-wrap gap-1.5">
                {(bible.characters || bible.bibleData?.characters).map((c: any) => (
                  <span key={c.id || c.name} className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {c.name} <span className="text-zinc-500">({c.role})</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quality Thresholds */}
          {(bible.qualityThresholds || bible.bibleData?.qualityThresholds) && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Quality Thresholds</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(bible.qualityThresholds || bible.bibleData?.qualityThresholds || {}).map(([key, val]) => (
                  <div key={key} className="bg-zinc-800/50 rounded p-2">
                    <div className="text-[9px] text-zinc-500">{key.replace(/([A-Z])/g, " $1").trim()}</div>
                    <div className="text-xs font-mono text-zinc-300">{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bible.lockedAt && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400 mt-2">
              <Shield className="w-3 h-3" />
              Locked at {new Date(bible.lockedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-800/50 rounded p-2">
      <div className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-xs text-zinc-300 truncate">{value}</div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function groupResultsByLayer(results: HarnessResult[]): LayerGroup[] {
  const layers = ["script", "visual", "video", "audio", "integration"];
  const groups: LayerGroup[] = [];

  for (const layerName of layers) {
    const layerResults = results.filter(r => r.layer === layerName);

    // Keep only the latest result per check name
    const latestByCheck = new Map<string, HarnessResult>();
    for (const r of layerResults) {
      const existing = latestByCheck.get(r.checkName);
      if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
        latestByCheck.set(r.checkName, r);
      }
    }

    const checks = Array.from(latestByCheck.values()).sort((a, b) => a.checkName.localeCompare(b.checkName));

    if (checks.length > 0) {
      const meta = LAYER_META[layerName] || { label: layerName, description: "", icon: "🔍" };
      groups.push({
        name: layerName,
        label: meta.label,
        icon: meta.icon,
        description: meta.description,
        checks,
      });
    }
  }

  return groups;
}
