import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X, Loader2, Trophy, ArrowRight, ArrowLeft, Minus, BarChart3,
  Eye, Palette, Sparkles, Target, Zap, ChevronDown, ChevronRight,
  Crown, Scale, Send, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────────────────────

interface LoraVersion {
  id: number;
  version: number;
  qualityScore: number | null;
  status: string;
  validationStatus: string;
  triggerWord: string | null;
  createdAt: string | Date;
}

interface LoraComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characterId: number;
  characterName: string;
  versions: LoraVersion[];
  activeLoraId: number | null;
  onActivate?: (loraId: number) => void;
}

// ─── Category Icons ─────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { icon: typeof Eye; label: string; color: string }> = {
  portrait:  { icon: Eye,      label: "Portrait Close-up",  color: "text-cyan" },
  action:    { icon: Zap,      label: "Action Pose",        color: "text-[var(--accent-pink)]" },
  emotion:   { icon: Sparkles, label: "Emotional Expression", color: "text-[var(--accent-gold)]" },
  group:     { icon: Target,   label: "Group Scene",        color: "text-[var(--status-success)]" },
  lighting:  { icon: Palette,  label: "Dramatic Lighting",  color: "text-purple-400" },
  custom:    { icon: Send,     label: "Custom Prompt",      color: "text-orange-400" },
};

// ─── Metric Bar ─────────────────────────────────────────────────────────

function MetricBar({
  label,
  valueA,
  valueB,
  format = "percent",
}: {
  label: string;
  valueA: number;
  valueB: number;
  format?: "percent" | "score";
}) {
  const displayA = format === "percent" ? `${(valueA * 100).toFixed(1)}%` : valueA.toFixed(1);
  const displayB = format === "percent" ? `${(valueB * 100).toFixed(1)}%` : valueB.toFixed(1);
  const maxVal = format === "percent" ? 1 : 100;
  const pctA = (valueA / maxVal) * 100;
  const pctB = (valueB / maxVal) * 100;
  const diff = valueA - valueB;
  const winner = Math.abs(diff) < 0.005 ? "tie" : diff > 0 ? "A" : "B";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          "font-mono text-[10px]",
          winner === "A" ? "text-cyan" : winner === "B" ? "text-[var(--accent-pink)]" : "text-muted-foreground"
        )}>
          {winner === "tie" ? "Tie" : winner === "A" ? "A wins" : "B wins"}
        </span>
      </div>
      {/* Version A bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-cyan w-12 text-right">{displayA}</span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan/60 to-cyan rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, pctA)}%` }}
          />
        </div>
      </div>
      {/* Version B bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-[var(--accent-pink)] w-12 text-right">{displayB}</span>
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent-pink)]/60 to-[var(--accent-pink)] rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, pctB)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Prompt Result Card ─────────────────────────────────────────────────

function PromptResultCard({
  prompt,
  result,
  versionALabel,
  versionBLabel,
}: {
  prompt: { id: string; label: string; prompt: string; category: string };
  result: any;
  versionALabel: string;
  versionBLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[prompt.category] ?? CATEGORY_CONFIG.custom;
  const CatIcon = cat.icon;

  const winnerBadge = result.winner === "A"
    ? { label: `${versionALabel} wins`, color: "bg-cyan/20 text-cyan border-cyan/30" }
    : result.winner === "B"
    ? { label: `${versionBLabel} wins`, color: "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)] border-[var(--accent-pink)]/30" }
    : { label: "Tie", color: "bg-white/10 text-muted-foreground border-white/20" };

  return (
    <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", `${cat.color} bg-white/5`)}>
          <CatIcon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{prompt.label}</span>
            <Badge variant="outline" className={cn("text-[10px]", winnerBadge.color)}>
              {winnerBadge.label}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{prompt.prompt}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-mono text-cyan">{result.metrics.overallScoreA}</div>
            <div className="text-[10px] text-muted-foreground">vs</div>
            <div className="text-xs font-mono text-[var(--accent-pink)]">{result.metrics.overallScoreB}</div>
          </div>
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
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
            <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-4">
              {/* Side-by-side images */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-cyan" />
                    <span className="text-xs font-medium">{versionALabel}</span>
                    <span className="text-xs font-mono text-cyan ml-auto">{result.metrics.overallScoreA}/100</span>
                  </div>
                  <div className="aspect-square rounded-lg border border-cyan/20 bg-[var(--bg-elevated)] overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Eye className="w-8 h-8 text-cyan/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Generated with {versionALabel}</p>
                      </div>
                    </div>
                    {/* In production, this would show the actual generated image */}
                    <img
                      src={result.versionAImageUrl}
                      alt={`${versionALabel} - ${prompt.label}`}
                      className="w-full h-full object-cover opacity-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[var(--accent-pink)]" />
                    <span className="text-xs font-medium">{versionBLabel}</span>
                    <span className="text-xs font-mono text-[var(--accent-pink)] ml-auto">{result.metrics.overallScoreB}/100</span>
                  </div>
                  <div className="aspect-square rounded-lg border border-[var(--accent-pink)]/20 bg-[var(--bg-elevated)] overflow-hidden relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Eye className="w-8 h-8 text-[var(--accent-pink)]/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Generated with {versionBLabel}</p>
                      </div>
                    </div>
                    <img
                      src={result.versionBImageUrl}
                      alt={`${versionBLabel} - ${prompt.label}`}
                      className="w-full h-full object-cover opacity-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </div>
              </div>

              {/* Per-prompt metrics */}
              <div className="space-y-3">
                <MetricBar
                  label="CLIP Similarity"
                  valueA={result.metrics.clipSimilarityA}
                  valueB={result.metrics.clipSimilarityB}
                />
                <MetricBar
                  label="Style Consistency"
                  valueA={result.metrics.styleConsistencyA}
                  valueB={result.metrics.styleConsistencyB}
                />
                <MetricBar
                  label="Detail Preservation"
                  valueA={result.metrics.detailPreservationA}
                  valueB={result.metrics.detailPreservationB}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Winner Banner ──────────────────────────────────────────────────────

function WinnerBanner({
  aggregated,
  versionALabel,
  versionBLabel,
  activeLoraId,
  versionAId,
  versionBId,
  onActivate,
}: {
  aggregated: any;
  versionALabel: string;
  versionBLabel: string;
  activeLoraId: number | null;
  versionAId: number;
  versionBId: number;
  onActivate?: (loraId: number) => void;
}) {
  const winner = aggregated.overallWinner;
  const winnerLabel = winner === "A" ? versionALabel : winner === "B" ? versionBLabel : null;
  const winnerId = winner === "A" ? versionAId : winner === "B" ? versionBId : null;
  const isWinnerActive = winnerId === activeLoraId;

  const confidenceLabel =
    aggregated.confidence >= 0.7 ? "High confidence" :
    aggregated.confidence >= 0.4 ? "Moderate confidence" : "Low confidence";

  const confidenceColor =
    aggregated.confidence >= 0.7 ? "text-[var(--status-success)]" :
    aggregated.confidence >= 0.4 ? "text-[var(--accent-gold)]" : "text-muted-foreground";

  return (
    <div className={cn(
      "rounded-xl border p-5",
      winner === "A" ? "border-cyan/30 bg-cyan/5" :
      winner === "B" ? "border-[var(--accent-pink)]/30 bg-[var(--accent-pink)]/5" :
      "border-white/10 bg-white/5"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          winner === "tie" ? "bg-white/10" :
          winner === "A" ? "bg-cyan/20" : "bg-[var(--accent-pink)]/20"
        )}>
          {winner === "tie" ? (
            <Scale className="w-6 h-6 text-muted-foreground" />
          ) : (
            <Crown className={cn("w-6 h-6", winner === "A" ? "text-cyan" : "text-[var(--accent-pink)]")} />
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-heading font-bold">
              {winner === "tie" ? "Too Close to Call" : `${winnerLabel} Wins`}
            </h3>
            <Badge variant="outline" className={cn("text-[10px]", confidenceColor, "border-current/30")}>
              {confidenceLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{aggregated.recommendation}</p>

          {/* Score summary */}
          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan" />
              <span className="text-xs text-muted-foreground">{versionALabel}:</span>
              <span className="text-sm font-mono font-bold text-cyan">{aggregated.avgScoreA}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--accent-pink)]" />
              <span className="text-xs text-muted-foreground">{versionBLabel}:</span>
              <span className="text-sm font-mono font-bold text-[var(--accent-pink)]">{aggregated.avgScoreB}</span>
            </div>
            <div className="text-xs text-muted-foreground ml-auto">
              {aggregated.winsA}W / {aggregated.ties}T / {aggregated.winsB}W
            </div>
          </div>

          {/* Activate winner button */}
          {winner !== "tie" && winnerId && !isWinnerActive && onActivate && (
            <Button
              size="sm"
              className={cn(
                "mt-3 border-0",
                winner === "A"
                  ? "bg-cyan/20 text-cyan hover:bg-cyan/30"
                  : "bg-[var(--accent-pink)]/20 text-[var(--accent-pink)] hover:bg-[var(--accent-pink)]/30"
              )}
              onClick={() => onActivate(winnerId)}
            >
              <Trophy className="w-3.5 h-3.5 mr-1.5" />
              Activate {winnerLabel}
            </Button>
          )}
          {winner !== "tie" && isWinnerActive && (
            <div className="flex items-center gap-1.5 mt-3 text-xs text-[var(--status-success)]">
              <Trophy className="w-3.5 h-3.5" />
              Winner is already the active version
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Aggregated Metrics Panel ───────────────────────────────────────────

function AggregatedMetrics({
  aggregated,
  versionALabel,
  versionBLabel,
}: {
  aggregated: any;
  versionALabel: string;
  versionBLabel: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-heading font-semibold">Aggregated Metrics</h4>
      </div>

      <div className="space-y-3">
        <MetricBar
          label="Avg CLIP Similarity"
          valueA={aggregated.avgClipA}
          valueB={aggregated.avgClipB}
        />
        <MetricBar
          label="Avg Style Consistency"
          valueA={aggregated.avgStyleA}
          valueB={aggregated.avgStyleB}
        />
        <MetricBar
          label="Avg Detail Preservation"
          valueA={aggregated.avgDetailA}
          valueB={aggregated.avgDetailB}
        />
        <MetricBar
          label="Overall Score"
          valueA={aggregated.avgScoreA}
          valueB={aggregated.avgScoreB}
          format="score"
        />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-1.5 rounded-full bg-cyan" />
          <span className="text-muted-foreground">{versionALabel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-1.5 rounded-full bg-[var(--accent-pink)]" />
          <span className="text-muted-foreground">{versionBLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────

export default function LoraComparisonModal({
  open,
  onOpenChange,
  characterId,
  characterName,
  versions,
  activeLoraId,
  onActivate,
}: LoraComparisonModalProps) {
  const [versionAId, setVersionAId] = useState<number | null>(null);
  const [versionBId, setVersionBId] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);

  // Auto-select versions: active + most recent non-active
  const autoSelected = useMemo(() => {
    if (versions.length < 2) return null;
    const active = versions.find(v => v.id === activeLoraId);
    const other = versions.find(v => v.id !== activeLoraId && (v.status === "active" || v.status === "deprecated" || v.validationStatus === "approved"));
    if (active && other) return { a: active.id, b: other.id };
    // Fallback: first two versions
    return { a: versions[0].id, b: versions[1].id };
  }, [versions, activeLoraId]);

  const effectiveA = versionAId ?? autoSelected?.a ?? null;
  const effectiveB = versionBId ?? autoSelected?.b ?? null;

  const canCompare = effectiveA !== null && effectiveB !== null && effectiveA !== effectiveB;

  const { data: comparison, isLoading, error, refetch } = trpc.characterLibrary.compareVersions.useQuery(
    {
      characterId,
      versionAId: effectiveA!,
      versionBId: effectiveB!,
      customPrompt: customPrompt.trim() || undefined,
    },
    { enabled: open && canCompare }
  );

  const versionALabel = comparison?.versionALabel ?? `v${versions.find(v => v.id === effectiveA)?.version ?? "?"}`;
  const versionBLabel = comparison?.versionBLabel ?? `v${versions.find(v => v.id === effectiveB)?.version ?? "?"}`;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[var(--bg-elevated)] shadow-2xl mx-4"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b border-white/10 bg-[var(--bg-elevated)]/95 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan/20 to-[var(--accent-pink)]/20 flex items-center justify-center">
                <Scale className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-heading font-bold">A/B Comparison</h2>
                <p className="text-xs text-muted-foreground">{characterName} — LoRA Version Comparison</p>
              </div>
            </div>
            <button
              type="button"
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* Version Selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan" />
                  Version A
                </label>
                <Select
                  value={String(effectiveA ?? "")}
                  onValueChange={(val) => setVersionAId(Number(val))}
                >
                  <SelectTrigger className="bg-[var(--bg-base)] border-cyan/20">
                    <SelectValue placeholder="Select version A" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem
                        key={v.id}
                        value={String(v.id)}
                        disabled={v.id === effectiveB}
                      >
                        v{v.version}
                        {v.id === activeLoraId ? " (active)" : ""}
                        {v.qualityScore != null ? ` — ${v.qualityScore.toFixed(1)} quality` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-pink)]" />
                  Version B
                </label>
                <Select
                  value={String(effectiveB ?? "")}
                  onValueChange={(val) => setVersionBId(Number(val))}
                >
                  <SelectTrigger className="bg-[var(--bg-base)] border-[var(--accent-pink)]/20">
                    <SelectValue placeholder="Select version B" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem
                        key={v.id}
                        value={String(v.id)}
                        disabled={v.id === effectiveA}
                      >
                        v{v.version}
                        {v.id === activeLoraId ? " (active)" : ""}
                        {v.qualityScore != null ? ` — ${v.qualityScore.toFixed(1)} quality` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Prompt Toggle */}
            <div>
              <button
                type="button"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowCustomPrompt(!showCustomPrompt)}
              >
                {showCustomPrompt ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                Add custom test prompt
              </button>
              <AnimatePresence>
                {showCustomPrompt && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="e.g. sitting on a bench reading a book, sunset..."
                        className="bg-[var(--bg-base)] border-white/10 text-sm"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 shrink-0"
                        onClick={() => refetch()}
                        disabled={!customPrompt.trim()}
                      >
                        <RotateCcw className="w-3 h-3 mr-1" /> Re-run
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Not enough versions */}
            {versions.length < 2 && (
              <div className="text-center py-12">
                <Scale className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Need at least 2 LoRA versions to compare</p>
                <p className="text-xs text-muted-foreground mt-1">Train another LoRA version first</p>
              </div>
            )}

            {/* Same version selected */}
            {effectiveA === effectiveB && effectiveA !== null && (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">Please select two different versions to compare</p>
              </div>
            )}

            {/* Loading */}
            {isLoading && canCompare && (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 mx-auto text-cyan animate-spin mb-3" />
                <p className="text-muted-foreground">Generating comparison images...</p>
                <p className="text-xs text-muted-foreground mt-1">Running 5 test prompts across both versions</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-[var(--status-error)]/30 bg-[var(--status-error)]/5 p-4 text-center">
                <p className="text-sm text-[var(--status-error)]">{error.message}</p>
                <Button size="sm" variant="outline" className="mt-2 border-white/10" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            )}

            {/* Results */}
            {comparison && !isLoading && (
              <>
                {/* Winner Banner */}
                <WinnerBanner
                  aggregated={comparison.aggregated}
                  versionALabel={versionALabel}
                  versionBLabel={versionBLabel}
                  activeLoraId={activeLoraId}
                  versionAId={comparison.versionAId}
                  versionBId={comparison.versionBId}
                  onActivate={onActivate}
                />

                {/* Aggregated Metrics */}
                <AggregatedMetrics
                  aggregated={comparison.aggregated}
                  versionALabel={versionALabel}
                  versionBLabel={versionBLabel}
                />

                {/* Per-Prompt Results */}
                <div className="space-y-2">
                  <h4 className="text-sm font-heading font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    Per-Prompt Results
                  </h4>
                  {comparison.prompts.map((prompt: any, i: number) => (
                    <PromptResultCard
                      key={prompt.id}
                      prompt={prompt}
                      result={comparison.results[i]}
                      versionALabel={versionALabel}
                      versionBLabel={versionBLabel}
                    />
                  ))}
                </div>

                {/* Confidence meter */}
                <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Comparison Confidence</span>
                    <span className="text-xs font-mono">{(comparison.aggregated.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={comparison.aggregated.confidence * 100} className="h-2" />
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Based on {comparison.results.length} test prompts across portrait, action, emotion, group, and lighting categories.
                    {comparison.aggregated.confidence < 0.4 && " Consider running more tests with custom prompts for a more definitive result."}
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
