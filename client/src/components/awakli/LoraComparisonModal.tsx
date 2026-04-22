import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  X, Loader2, Trophy, ArrowRight, ArrowLeft, Minus, BarChart3,
  Eye, EyeOff, Palette, Sparkles, Target, Zap, ChevronDown, ChevronRight,
  Crown, Scale, Send, RotateCcw, ThumbsUp, Check, AlertTriangle, Shuffle,
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
  action:    { icon: Zap,      label: "Action Pose",        color: "text-[var(--token-cyan)]" },
  emotion:   { icon: Sparkles, label: "Emotional Expression", color: "text-[var(--token-gold)]" },
  group:     { icon: Target,   label: "Group Scene",        color: "text-[var(--status-success)]" },
  lighting:  { icon: Palette,  label: "Dramatic Lighting",  color: "text-purple-400" },
  custom:    { icon: Send,     label: "Custom Prompt",      color: "text-orange-400" },
};

// ─── Blind Mode Helpers ─────────────────────────────────────────────────

/** Deterministic shuffle seeded per comparison run — keeps X/Y stable until re-run */
function generateBlindAssignment(): { xIsA: boolean } {
  return { xIsA: Math.random() < 0.5 };
}

// ─── Metric Bar ─────────────────────────────────────────────────────────

function MetricBar({
  label,
  valueA,
  valueB,
  format = "percent",
  blindMode = false,
  leftLabel,
  rightLabel,
  leftColor = "cyan",
  rightColor = "var(--token-cyan)",
}: {
  label: string;
  valueA: number;
  valueB: number;
  format?: "percent" | "score";
  blindMode?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
}) {
  const displayA = format === "percent" ? `${(valueA * 100).toFixed(1)}%` : valueA.toFixed(1);
  const displayB = format === "percent" ? `${(valueB * 100).toFixed(1)}%` : valueB.toFixed(1);
  const maxVal = format === "percent" ? 1 : 100;
  const pctA = (valueA / maxVal) * 100;
  const pctB = (valueB / maxVal) * 100;
  const diff = valueA - valueB;
  const winner = Math.abs(diff) < 0.005 ? "tie" : diff > 0 ? "left" : "right";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {!blindMode && (
          <span className={cn(
            "font-mono text-[10px]",
            winner === "left" ? `text-[${leftColor}]` : winner === "right" ? `text-[${rightColor}]` : "text-muted-foreground"
          )}>
            {winner === "tie" ? "Tie" : winner === "left" ? `${leftLabel ?? "A"} wins` : `${rightLabel ?? "B"} wins`}
          </span>
        )}
        {blindMode && (
          <span className="font-mono text-[10px] text-muted-foreground/50">Hidden</span>
        )}
      </div>
      {blindMode ? (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground/40 w-12 text-right">???</span>
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-white/10 rounded-full" style={{ width: "50%" }} />
          </div>
        </div>
      ) : (
        <>
          {/* Left bar */}
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-mono w-12 text-right")} style={{ color: leftColor }}>{displayA}</span>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, pctA)}%`, background: `linear-gradient(to right, ${leftColor}99, ${leftColor})` }}
              />
            </div>
          </div>
          {/* Right bar */}
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-mono w-12 text-right")} style={{ color: rightColor }}>{displayB}</span>
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, pctB)}%`, background: `linear-gradient(to right, ${rightColor}99, ${rightColor})` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Prompt Result Card ─────────────────────────────────────────────────

function PromptResultCard({
  prompt,
  result,
  leftLabel,
  rightLabel,
  blindMode,
}: {
  prompt: { id: string; label: string; prompt: string; category: string };
  result: any;
  leftLabel: string;
  rightLabel: string;
  blindMode: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CONFIG[prompt.category] ?? CATEGORY_CONFIG.custom;
  const CatIcon = cat.icon;

  const winnerBadge = blindMode
    ? { label: "Hidden", color: "bg-white/10 text-muted-foreground/50 border-white/10" }
    : result.winner === "A"
    ? { label: `${leftLabel} wins`, color: "bg-cyan/20 text-cyan border-cyan/30" }
    : result.winner === "B"
    ? { label: `${rightLabel} wins`, color: "bg-[var(--token-cyan)]/20 text-[var(--token-cyan)] border-[var(--token-cyan)]/30" }
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
          {!blindMode && (
            <div className="text-right">
              <div className="text-xs font-mono text-cyan">{result.metrics.overallScoreA}</div>
              <div className="text-[10px] text-muted-foreground">vs</div>
              <div className="text-xs font-mono text-[var(--token-cyan)]">{result.metrics.overallScoreB}</div>
            </div>
          )}
          {blindMode && (
            <div className="text-right">
              <div className="text-xs font-mono text-muted-foreground/40">??</div>
              <div className="text-[10px] text-muted-foreground">vs</div>
              <div className="text-xs font-mono text-muted-foreground/40">??</div>
            </div>
          )}
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
                    <div className={cn("w-3 h-3 rounded-full", blindMode ? "bg-amber-400" : "bg-cyan")} />
                    <span className="text-xs font-medium">{leftLabel}</span>
                    {!blindMode && (
                      <span className="text-xs font-mono text-cyan ml-auto">{result.metrics.overallScoreA}/100</span>
                    )}
                  </div>
                  <div className={cn(
                    "aspect-square rounded-lg border bg-[var(--bg-elevated)] overflow-hidden relative",
                    blindMode ? "border-amber-400/20" : "border-cyan/20"
                  )}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Eye className={cn("w-8 h-8 mx-auto mb-2", blindMode ? "text-amber-400/30" : "text-cyan/30")} />
                        <p className="text-xs text-muted-foreground">Generated with {leftLabel}</p>
                      </div>
                    </div>
                    <img
                      src={result.versionAImageUrl}
                      alt={`${leftLabel} - ${prompt.label}`}
                      className="w-full h-full object-cover opacity-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", blindMode ? "bg-violet-400" : "bg-[var(--token-cyan)]")} />
                    <span className="text-xs font-medium">{rightLabel}</span>
                    {!blindMode && (
                      <span className="text-xs font-mono text-[var(--token-cyan)] ml-auto">{result.metrics.overallScoreB}/100</span>
                    )}
                  </div>
                  <div className={cn(
                    "aspect-square rounded-lg border bg-[var(--bg-elevated)] overflow-hidden relative",
                    blindMode ? "border-violet-400/20" : "border-[var(--token-cyan)]/20"
                  )}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <Eye className={cn("w-8 h-8 mx-auto mb-2", blindMode ? "text-violet-400/30" : "text-[var(--token-cyan)]/30")} />
                        <p className="text-xs text-muted-foreground">Generated with {rightLabel}</p>
                      </div>
                    </div>
                    <img
                      src={result.versionBImageUrl}
                      alt={`${rightLabel} - ${prompt.label}`}
                      className="w-full h-full object-cover opacity-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </div>
              </div>

              {/* Per-prompt metrics */}
              {!blindMode && (
                <div className="space-y-3">
                  <MetricBar label="CLIP Similarity" valueA={result.metrics.clipSimilarityA} valueB={result.metrics.clipSimilarityB} leftLabel={leftLabel} rightLabel={rightLabel} />
                  <MetricBar label="Style Consistency" valueA={result.metrics.styleConsistencyA} valueB={result.metrics.styleConsistencyB} leftLabel={leftLabel} rightLabel={rightLabel} />
                  <MetricBar label="Detail Preservation" valueA={result.metrics.detailPreservationA} valueB={result.metrics.detailPreservationB} leftLabel={leftLabel} rightLabel={rightLabel} />
                </div>
              )}
              {blindMode && (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                  <EyeOff className="w-5 h-5 mx-auto text-muted-foreground/40 mb-1.5" />
                  <p className="text-xs text-muted-foreground/60">Metrics hidden in blind mode — vote first to reveal</p>
                </div>
              )}
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
  leftLabel,
  rightLabel,
  activeLoraId,
  versionAId,
  versionBId,
  onActivate,
}: {
  aggregated: any;
  leftLabel: string;
  rightLabel: string;
  activeLoraId: number | null;
  versionAId: number;
  versionBId: number;
  onActivate?: (loraId: number) => void;
}) {
  const winner = aggregated.overallWinner;
  const winnerLabel = winner === "A" ? leftLabel : winner === "B" ? rightLabel : null;
  const winnerId = winner === "A" ? versionAId : winner === "B" ? versionBId : null;
  const isWinnerActive = winnerId === activeLoraId;

  const confidenceLabel =
    aggregated.confidence >= 0.7 ? "High confidence" :
    aggregated.confidence >= 0.4 ? "Moderate confidence" : "Low confidence";

  const confidenceColor =
    aggregated.confidence >= 0.7 ? "text-[var(--status-success)]" :
    aggregated.confidence >= 0.4 ? "text-[var(--token-gold)]" : "text-muted-foreground";

  return (
    <div className={cn(
      "rounded-xl border p-5",
      winner === "A" ? "border-cyan/30 bg-cyan/5" :
      winner === "B" ? "border-[var(--token-cyan)]/30 bg-[var(--token-cyan)]/5" :
      "border-white/10 bg-white/5"
    )}>
      <div className="flex items-start gap-4">
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          winner === "tie" ? "bg-white/10" :
          winner === "A" ? "bg-cyan/20" : "bg-[var(--token-cyan)]/20"
        )}>
          {winner === "tie" ? (
            <Scale className="w-6 h-6 text-muted-foreground" />
          ) : (
            <Crown className={cn("w-6 h-6", winner === "A" ? "text-cyan" : "text-[var(--token-cyan)]")} />
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
              <span className="text-xs text-muted-foreground">{leftLabel}:</span>
              <span className="text-sm font-mono font-bold text-cyan">{aggregated.avgScoreA}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--token-cyan)]" />
              <span className="text-xs text-muted-foreground">{rightLabel}:</span>
              <span className="text-sm font-mono font-bold text-[var(--token-cyan)]">{aggregated.avgScoreB}</span>
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
                  : "bg-[var(--token-cyan)]/20 text-[var(--token-cyan)] hover:bg-[var(--token-cyan)]/30"
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
  leftLabel,
  rightLabel,
}: {
  aggregated: any;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--bg-base)] p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-heading font-semibold">Aggregated Metrics</h4>
      </div>

      <div className="space-y-3">
        <MetricBar label="Avg CLIP Similarity" valueA={aggregated.avgClipA} valueB={aggregated.avgClipB} leftLabel={leftLabel} rightLabel={rightLabel} />
        <MetricBar label="Avg Style Consistency" valueA={aggregated.avgStyleA} valueB={aggregated.avgStyleB} leftLabel={leftLabel} rightLabel={rightLabel} />
        <MetricBar label="Avg Detail Preservation" valueA={aggregated.avgDetailA} valueB={aggregated.avgDetailB} leftLabel={leftLabel} rightLabel={rightLabel} />
        <MetricBar label="Overall Score" valueA={aggregated.avgScoreA} valueB={aggregated.avgScoreB} format="score" leftLabel={leftLabel} rightLabel={rightLabel} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 pt-2 border-t border-white/5">
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-1.5 rounded-full bg-cyan" />
          <span className="text-muted-foreground">{leftLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <div className="w-3 h-1.5 rounded-full bg-[var(--token-cyan)]" />
          <span className="text-muted-foreground">{rightLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Blind Mode Voting Panel ────────────────────────────────────────────

function BlindVotingPanel({
  onVote,
  leftLabel,
  rightLabel,
}: {
  onVote: (pick: "left" | "right") => void;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border-2 border-dashed border-amber-400/30 bg-amber-400/5 p-6"
    >
      <div className="text-center mb-4">
        <div className="w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mx-auto mb-3">
          <ThumbsUp className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-base font-heading font-bold">Which sample looks better?</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Pick your preferred version based on visual quality alone. Version identities are hidden.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Button
          size="lg"
          variant="outline"
          className="h-14 border-amber-400/30 bg-amber-400/5 hover:bg-amber-400/15 hover:border-amber-400/50 text-amber-400 transition-all"
          onClick={() => onVote("left")}
        >
          <div className="w-4 h-4 rounded-full bg-amber-400 mr-2" />
          I prefer {leftLabel}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 border-violet-400/30 bg-violet-400/5 hover:bg-violet-400/15 hover:border-violet-400/50 text-violet-400 transition-all"
          onClick={() => onVote("right")}
        >
          <div className="w-4 h-4 rounded-full bg-violet-400 mr-2" />
          I prefer {rightLabel}
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Blind Reveal Banner ────────────────────────────────────────────────

function BlindRevealBanner({
  userPick,
  metricsWinner,
  leftBlindLabel,
  rightBlindLabel,
  leftTrueLabel,
  rightTrueLabel,
}: {
  userPick: "left" | "right";
  metricsWinner: "A" | "B" | "tie";
  leftBlindLabel: string;
  rightBlindLabel: string;
  leftTrueLabel: string;
  rightTrueLabel: string;
}) {
  // Determine if user's pick matches the metrics winner
  // "left" in the blind view = version A (since we map xIsA to left position)
  const userPickedA = userPick === "left";
  const metricsPickedA = metricsWinner === "A";
  const isMatch = metricsWinner === "tie" ? null : userPickedA === metricsPickedA;

  const pickedBlindLabel = userPick === "left" ? leftBlindLabel : rightBlindLabel;
  const pickedTrueLabel = userPick === "left" ? leftTrueLabel : rightTrueLabel;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "rounded-xl border-2 p-5",
        isMatch === true ? "border-[var(--status-success)]/40 bg-[var(--status-success)]/5" :
        isMatch === false ? "border-orange-400/40 bg-orange-400/5" :
        "border-white/20 bg-white/5"
      )}
    >
      <div className="flex items-start gap-4">
        <motion.div
          initial={{ rotate: -20, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isMatch === true ? "bg-[var(--status-success)]/20" :
            isMatch === false ? "bg-orange-400/20" :
            "bg-white/10"
          )}
        >
          {isMatch === true ? (
            <Check className="w-6 h-6 text-[var(--status-success)]" />
          ) : isMatch === false ? (
            <AlertTriangle className="w-6 h-6 text-orange-400" />
          ) : (
            <Scale className="w-6 h-6 text-muted-foreground" />
          )}
        </motion.div>
        <div className="flex-1">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-base font-heading font-bold">
              {isMatch === true
                ? "Your pick matches the metrics!"
                : isMatch === false
                ? "Interesting — you preferred the metrics underdog"
                : "It's a tie — your instinct is as good as any!"}
            </h3>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-2 space-y-1.5"
          >
            <p className="text-sm text-muted-foreground">
              You picked <span className="font-semibold text-foreground">{pickedBlindLabel}</span> which is actually <span className="font-semibold text-foreground">{pickedTrueLabel}</span>.
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shuffle className="w-3 h-3" />
                Blind assignment:
              </span>
              <span>{leftBlindLabel} → {leftTrueLabel}</span>
              <span>|</span>
              <span>{rightBlindLabel} → {rightTrueLabel}</span>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
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

  // ─── Blind Mode State ───────────────────────────────────────────────
  const [blindMode, setBlindMode] = useState(false);
  const [blindAssignment, setBlindAssignment] = useState<{ xIsA: boolean }>(() => generateBlindAssignment());
  const [blindVote, setBlindVote] = useState<"left" | "right" | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Auto-select versions: active + most recent non-active
  const autoSelected = useMemo(() => {
    if (versions.length < 2) return null;
    const active = versions.find(v => v.id === activeLoraId);
    const other = versions.find(v => v.id !== activeLoraId && (v.status === "active" || v.status === "deprecated" || v.validationStatus === "approved"));
    if (active && other) return { a: active.id, b: other.id };
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

  // ─── Label Logic ────────────────────────────────────────────────────
  const trueALabel = comparison?.versionALabel ?? `v${versions.find(v => v.id === effectiveA)?.version ?? "?"}`;
  const trueBLabel = comparison?.versionBLabel ?? `v${versions.find(v => v.id === effectiveB)?.version ?? "?"}`;

  // In blind mode, "left" and "right" positions are randomized
  // xIsA means: the left position shows version A
  const isBlindActive = blindMode && !revealed;

  const leftLabel = isBlindActive
    ? "Sample X"
    : blindAssignment.xIsA ? trueALabel : trueBLabel;

  const rightLabel = isBlindActive
    ? "Sample Y"
    : blindAssignment.xIsA ? trueBLabel : trueALabel;

  // For the results data, we need to swap A/B based on blind assignment
  // The comparison data always has A on left, B on right
  // If xIsA is false, we need to swap the display
  const leftTrueLabel = blindAssignment.xIsA ? trueALabel : trueBLabel;
  const rightTrueLabel = blindAssignment.xIsA ? trueBLabel : trueALabel;

  // ─── Blind Mode Handlers ────────────────────────────────────────────
  const handleToggleBlind = useCallback(() => {
    if (blindMode) {
      // Turning off blind mode
      setBlindMode(false);
      setBlindVote(null);
      setRevealed(false);
    } else {
      // Turning on blind mode — fresh randomization
      setBlindAssignment(generateBlindAssignment());
      setBlindVote(null);
      setRevealed(false);
      setBlindMode(true);
      toast.info("Blind mode enabled — version labels are hidden. Vote to reveal!");
    }
  }, [blindMode]);

  const handleBlindVote = useCallback((pick: "left" | "right") => {
    setBlindVote(pick);
    setRevealed(true);
    // Small delay before showing the reveal for dramatic effect
    toast.success("Vote recorded! Revealing version identities...");
  }, []);

  const handleReRunComparison = useCallback(() => {
    // Reset blind state on re-run
    if (blindMode) {
      setBlindAssignment(generateBlindAssignment());
      setBlindVote(null);
      setRevealed(false);
    }
    refetch();
  }, [blindMode, refetch]);

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
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                blindMode
                  ? "bg-gradient-to-br from-amber-400/20 to-violet-400/20"
                  : "bg-gradient-to-br from-cyan/20 to-[var(--token-cyan)]/20"
              )}>
                {blindMode ? <EyeOff className="w-5 h-5 text-amber-400" /> : <Scale className="w-5 h-5 text-foreground" />}
              </div>
              <div>
                <h2 className="text-lg font-heading font-bold flex items-center gap-2">
                  A/B Comparison
                  {blindMode && (
                    <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-400 bg-amber-400/10">
                      Blind Mode
                    </Badge>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">{characterName} — LoRA Version Comparison</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Blind Mode Toggle */}
              {comparison && !isLoading && (
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "h-8 text-xs transition-all",
                    blindMode
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20"
                      : "border-white/10 text-muted-foreground hover:text-foreground"
                  )}
                  onClick={handleToggleBlind}
                  disabled={blindMode && revealed}
                  title={blindMode && revealed ? "Re-run comparison to use blind mode again" : "Toggle blind mode"}
                >
                  {blindMode ? <EyeOff className="w-3.5 h-3.5 mr-1.5" /> : <Eye className="w-3.5 h-3.5 mr-1.5" />}
                  {blindMode ? "Blind On" : "Blind"}
                </Button>
              )}
              <button
                type="button"
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Version Selectors — hidden in blind mode before reveal */}
            {!isBlindActive && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan" />
                    Version A
                  </label>
                  <Select
                    value={String(effectiveA ?? "")}
                    onValueChange={(val) => setVersionAId(Number(val))}
                    disabled={blindMode}
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
                    <div className="w-2 h-2 rounded-full bg-[var(--token-cyan)]" />
                    Version B
                  </label>
                  <Select
                    value={String(effectiveB ?? "")}
                    onValueChange={(val) => setVersionBId(Number(val))}
                    disabled={blindMode}
                  >
                    <SelectTrigger className="bg-[var(--bg-base)] border-[var(--token-cyan)]/20">
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
            )}

            {/* Blind mode info banner when selectors are hidden */}
            {isBlindActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4"
              >
                <div className="flex items-center gap-3">
                  <Shuffle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">Blind mode active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Versions have been randomly assigned as <span className="text-amber-400 font-medium">Sample X</span> and <span className="text-violet-400 font-medium">Sample Y</span>.
                      Version selectors, scores, and metrics are hidden. Browse the images and vote for your preferred sample to reveal identities.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Custom Prompt Toggle — only when not in active blind mode */}
            {!isBlindActive && (
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
                          onClick={handleReRunComparison}
                          disabled={!customPrompt.trim()}
                        >
                          <RotateCcw className="w-3 h-3 mr-1" /> Re-run
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

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
                {/* Blind Mode: Voting Panel (before reveal) */}
                {isBlindActive && !blindVote && (
                  <BlindVotingPanel
                    onVote={handleBlindVote}
                    leftLabel="Sample X"
                    rightLabel="Sample Y"
                  />
                )}

                {/* Blind Mode: Reveal Banner (after vote) */}
                {blindMode && revealed && blindVote && (
                  <BlindRevealBanner
                    userPick={blindVote}
                    metricsWinner={comparison.aggregated.overallWinner}
                    leftBlindLabel="Sample X"
                    rightBlindLabel="Sample Y"
                    leftTrueLabel={leftTrueLabel}
                    rightTrueLabel={rightTrueLabel}
                  />
                )}

                {/* Winner Banner — only in normal mode or after reveal */}
                {(!blindMode || revealed) && (
                  <WinnerBanner
                    aggregated={comparison.aggregated}
                    leftLabel={leftTrueLabel}
                    rightLabel={rightTrueLabel}
                    activeLoraId={activeLoraId}
                    versionAId={comparison.versionAId}
                    versionBId={comparison.versionBId}
                    onActivate={onActivate}
                  />
                )}

                {/* Aggregated Metrics — hidden in blind mode before reveal */}
                {(!blindMode || revealed) && (
                  <AggregatedMetrics
                    aggregated={comparison.aggregated}
                    leftLabel={leftTrueLabel}
                    rightLabel={rightTrueLabel}
                  />
                )}

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
                      leftLabel={isBlindActive ? "Sample X" : leftTrueLabel}
                      rightLabel={isBlindActive ? "Sample Y" : rightTrueLabel}
                      blindMode={isBlindActive}
                    />
                  ))}
                </div>

                {/* Confidence meter — hidden in blind mode before reveal */}
                {(!blindMode || revealed) && (
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
                )}

                {/* Re-run in blind mode hint after reveal */}
                {blindMode && revealed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-center"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-400/20 text-amber-400 hover:bg-amber-400/10"
                      onClick={() => {
                        setBlindAssignment(generateBlindAssignment());
                        setBlindVote(null);
                        setRevealed(false);
                        refetch();
                        toast.info("New blind comparison started with fresh randomization!");
                      }}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Run Another Blind Test
                    </Button>
                    <p className="text-[10px] text-muted-foreground mt-2">
                      Positions will be re-randomized for a fresh unbiased test
                    </p>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
