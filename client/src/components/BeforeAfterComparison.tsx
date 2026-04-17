import { useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  ArrowRight, ArrowDown, Columns2, SlidersHorizontal,
  TrendingDown, Shield, Sparkles, Layers, BarChart3,
  Zap, ChevronDown, ChevronUp, RefreshCw, Loader2,
  AlertTriangle, ArrowUpCircle,
} from "lucide-react";
import { RetrainingNudge } from "@/components/LoraRetrainingRecommendation";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ComparisonData {
  originalUrl: string | null;
  fixedUrl: string | null;
  originalDriftScore: number;
  newDriftScore: number | null;
  driftImprovement: number | null;
  originalLoraStrength: number | null;
  boostedLoraStrength: number;
  boostDelta: number;
  fixConfidence: "high" | "medium" | "low";
  severity: "warning" | "critical";
  targetFeatures: string[] | null;
  /** Original per-feature drifts */
  originalFeatureDrifts: {
    face: number;
    hair: number;
    outfit: number;
    colorPalette: number;
    bodyProportion: number;
  };
  /** Simulated post-fix per-feature drifts (estimated from improvement ratio) */
  estimatedFixedFeatureDrifts?: {
    face: number;
    hair: number;
    outfit: number;
    colorPalette: number;
    bodyProportion: number;
  };
}

export interface ReFixProps {
  /** The jobId of the completed fix to re-fix */
  jobId: number;
  /** Whether re-fix is available (strength < 0.95) */
  canReFix: boolean;
  /** Number of previous fix attempts for this frame */
  attemptCount: number;
  /** Callback to trigger re-fix */
  onReFix: (jobId: number) => void;
  /** Whether the re-fix mutation is pending */
  isReFixing: boolean;
  /** Result from the re-fix mutation (if available) */
  reFixResult?: {
    previousBoostedStrength: number;
    newBoostedStrength: number;
    reFixBoostDelta: number;
    estimatedCredits: number;
    formattedTime: string;
    attemptNumber: number;
    confidence: "high" | "medium" | "low";
    atMaxStrength: boolean;
  } | null;
}

type ViewMode = "side-by-side" | "overlay";

const CONFIDENCE_STYLES = {
  high: { label: "High", bg: "bg-emerald-500/20", text: "text-emerald-400", ring: "ring-emerald-500/30" },
  medium: { label: "Medium", bg: "bg-yellow-500/20", text: "text-yellow-400", ring: "ring-yellow-500/30" },
  low: { label: "Low", bg: "bg-red-500/20", text: "text-red-400", ring: "ring-red-500/30" },
};

const FEATURE_LABELS: Array<{ key: keyof ComparisonData["originalFeatureDrifts"]; label: string; icon: React.ReactNode }> = [
  { key: "face", label: "Face", icon: <Shield className="h-3.5 w-3.5" /> },
  { key: "hair", label: "Hair", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { key: "outfit", label: "Outfit", icon: <Layers className="h-3.5 w-3.5" /> },
  { key: "colorPalette", label: "Color Palette", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: "bodyProportion", label: "Body Proportion", icon: <TrendingDown className="h-3.5 w-3.5" /> },
];

// ─── Overlay Slider ─────────────────────────────────────────────────────

function OverlaySlider({
  originalUrl,
  fixedUrl,
}: {
  originalUrl: string | null;
  fixedUrl: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  const handleMouseDown = useCallback(() => setIsDragging(true), []);
  const handleMouseUp = useCallback(() => setIsDragging(false), []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  }, [isDragging, handleMove]);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  }, [handleMove]);

  const placeholderBefore = (
    <div className="w-full h-full bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center">
      <span className="text-muted-foreground text-sm">Original Frame</span>
    </div>
  );
  const placeholderAfter = (
    <div className="w-full h-full bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 flex items-center justify-center">
      <span className="text-muted-foreground text-sm">Fixed Frame</span>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="relative aspect-video rounded-lg overflow-hidden border border-white/10 cursor-col-resize select-none"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      {/* Fixed (after) — full background */}
      <div className="absolute inset-0">
        {fixedUrl ? (
          <img src={fixedUrl} alt="Fixed frame" className="w-full h-full object-contain bg-black/50" />
        ) : placeholderAfter}
      </div>

      {/* Original (before) — clipped by slider */}
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
        {originalUrl ? (
          <img src={originalUrl} alt="Original frame" className="w-full h-full object-contain bg-black/50" />
        ) : placeholderBefore}
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
        style={{ left: `${sliderPos}%` }}
      >
        {/* Drag handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
          <SlidersHorizontal className="h-4 w-4 text-gray-800" />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-500/80 text-white text-[10px] font-bold z-20">
        BEFORE
      </div>
      <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500/80 text-white text-[10px] font-bold z-20">
        AFTER
      </div>
    </div>
  );
}

// ─── Feature Comparison Bar ─────────────────────────────────────────────

function FeatureComparisonBar({
  label,
  icon,
  before,
  after,
  isTargeted,
}: {
  label: string;
  icon: React.ReactNode;
  before: number;
  after: number | null;
  isTargeted: boolean;
}) {
  const beforePct = Math.round(before * 100);
  const afterPct = after != null ? Math.round(after * 100) : null;
  const improvement = afterPct != null ? beforePct - afterPct : null;
  const beforeColor = before > 0.25 ? "bg-red-500" : before > 0.15 ? "bg-yellow-500" : "bg-emerald-500";
  const afterColor = after != null
    ? (after > 0.25 ? "bg-red-400" : after > 0.15 ? "bg-yellow-400" : "bg-emerald-400")
    : "bg-white/10";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 text-muted-foreground">{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
          {isTargeted && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-500/40 text-orange-400">
              targeted
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={before > 0.25 ? "text-red-400" : before > 0.15 ? "text-yellow-400" : "text-emerald-400"}>
            {beforePct}%
          </span>
          {afterPct != null && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className={after! > 0.25 ? "text-red-400" : after! > 0.15 ? "text-yellow-400" : "text-emerald-400"}>
                {afterPct}%
              </span>
              {improvement != null && improvement > 0 && (
                <span className="text-emerald-400 font-medium text-[10px]">(-{improvement}%)</span>
              )}
            </>
          )}
        </div>
      </div>
      {/* Dual progress bars */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground w-10">Before</span>
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${beforeColor}`} style={{ width: `${beforePct}%` }} />
          </div>
        </div>
        {afterPct != null && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground w-10">After</span>
            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${afterColor}`} style={{ width: `${afterPct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function BeforeAfterComparison({
  data,
  reFix,
}: {
  data: ComparisonData;
  reFix?: ReFixProps;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [showFeatures, setShowFeatures] = useState(true);
  const [showReFixConfirm, setShowReFixConfirm] = useState(false);

  const conf = CONFIDENCE_STYLES[data.fixConfidence];
  const improvementPct = data.driftImprovement != null ? Math.round(data.driftImprovement * 100) : null;
  const newDriftPct = data.newDriftScore != null ? (data.newDriftScore * 100).toFixed(1) : null;
  const origDriftPct = (data.originalDriftScore * 100).toFixed(1);

  return (
    <div className="bg-gradient-to-br from-emerald-500/[0.03] to-cyan-500/[0.03] border border-emerald-500/20 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Columns2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Before / After Comparison</p>
            <p className="text-[10px] text-muted-foreground">Visual comparison of the fix-drift result</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            <button
              onClick={() => setViewMode("side-by-side")}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                viewMode === "side-by-side"
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Columns2 className="h-3 w-3 inline mr-1" />
              Side by Side
            </button>
            <button
              onClick={() => setViewMode("overlay")}
              className={`px-2.5 py-1 text-[10px] font-medium transition-colors ${
                viewMode === "overlay"
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-3 w-3 inline mr-1" />
              Overlay
            </button>
          </div>
        </div>
      </div>

      {/* Drift Score Summary Bar */}
      <div className="flex items-center gap-3 bg-white/[0.04] rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground mb-0.5">Original Drift</div>
            <div className={`text-lg font-bold ${
              data.originalDriftScore > 0.25 ? "text-red-400" :
              data.originalDriftScore > 0.15 ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {origDriftPct}%
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2">
            <div className="h-px w-8 bg-white/20" />
            {improvementPct != null ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs font-bold px-2">
                <ArrowDown className="h-3 w-3 mr-1" />
                {improvementPct}% improved
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Pending
              </Badge>
            )}
            <div className="h-px w-8 bg-white/20" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground mb-0.5">New Drift</div>
            <div className={`text-lg font-bold ${
              newDriftPct != null
                ? (data.newDriftScore! > 0.25 ? "text-red-400" : data.newDriftScore! > 0.15 ? "text-yellow-400" : "text-emerald-400")
                : "text-muted-foreground"
            }`}>
              {newDriftPct != null ? `${newDriftPct}%` : "—"}
            </div>
          </div>
        </div>

        <div className="border-l border-white/10 pl-3 ml-1">
          <div className="text-[10px] text-muted-foreground mb-0.5">LoRA Boost</div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-foreground">
              {data.originalLoraStrength != null ? `${(data.originalLoraStrength * 100).toFixed(0)}%` : "—"}
            </span>
            <ArrowRight className="h-3 w-3 text-orange-400" />
            <span className="text-xs font-bold text-orange-400">
              {(data.boostedLoraStrength * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        <div className="border-l border-white/10 pl-3 ml-1">
          <div className="text-[10px] text-muted-foreground mb-0.5">Confidence</div>
          <Badge variant="outline" className={`text-[10px] ${conf.text} ${conf.ring}`}>
            {conf.label}
          </Badge>
        </div>
      </div>

      {/* Image Comparison */}
      {viewMode === "side-by-side" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-muted-foreground">Before (Original)</span>
              <Badge variant="outline" className="text-[9px] border-red-500/30 text-red-400 ml-auto">
                {origDriftPct}% drift
              </Badge>
            </div>
            <div className="aspect-video bg-gradient-to-br from-red-500/5 to-orange-500/5 rounded-lg border border-red-500/20 overflow-hidden flex items-center justify-center">
              {data.originalUrl ? (
                <img src={data.originalUrl} alt="Original frame" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-muted-foreground text-sm">Original frame</span>
              )}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-muted-foreground">After (Fixed)</span>
              {newDriftPct != null && (
                <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 ml-auto">
                  {newDriftPct}% drift
                </Badge>
              )}
            </div>
            <div className="aspect-video bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 rounded-lg border border-emerald-500/20 overflow-hidden flex items-center justify-center">
              {data.fixedUrl ? (
                <img src={data.fixedUrl} alt="Fixed frame" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-muted-foreground text-sm">Fixed frame</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <OverlaySlider originalUrl={data.originalUrl} fixedUrl={data.fixedUrl} />
      )}

      {/* Per-Feature Comparison */}
      <div>
        <button
          onClick={() => setShowFeatures(!showFeatures)}
          className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-cyan transition-colors w-full"
        >
          <Zap className="h-4 w-4 text-cyan" />
          Feature-Level Comparison
          {showFeatures ? <ChevronUp className="h-3.5 w-3.5 ml-auto" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto" />}
        </button>
        {showFeatures && (
          <div className="mt-3 space-y-3">
            {FEATURE_LABELS.map(({ key, label, icon }) => {
              const isTargeted = data.targetFeatures?.includes(key) ?? false;
              const afterVal = data.estimatedFixedFeatureDrifts?.[key] ?? null;
              return (
                <FeatureComparisonBar
                  key={key}
                  label={label}
                  icon={icon}
                  before={data.originalFeatureDrifts[key]}
                  after={afterVal}
                  isTargeted={isTargeted}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Targeted features summary */}
      {data.targetFeatures && data.targetFeatures.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Targeted:</span>
          {data.targetFeatures.map(f => (
            <Badge key={f} variant="outline" className="text-[9px] border-orange-500/30 text-orange-400 capitalize">
              {f.replace(/([A-Z])/g, " $1").trim()}
            </Badge>
          ))}
        </div>
      )}

      {/* Re-Fix Button */}
      {reFix && (
        <div className="border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-foreground">Not satisfied with the result?</p>
                <p className="text-[10px] text-muted-foreground">
                  {reFix.canReFix
                    ? `Re-fix with higher LoRA strength (attempt #${reFix.attemptCount + 1})`
                    : "LoRA strength is at maximum (95%). Cannot boost further."
                  }
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!reFix.canReFix || reFix.isReFixing}
              onClick={() => setShowReFixConfirm(true)}
              className={reFix.canReFix
                ? "gap-1.5 border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                : "gap-1.5 opacity-50 cursor-not-allowed"
              }
            >
              {reFix.isReFixing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {reFix.isReFixing ? "Re-Fixing..." : "Re-Fix"}
            </Button>
          </div>

          {/* Diminishing returns warning */}
          {reFix.attemptCount >= 2 && reFix.canReFix && (
            <div className="mt-2 flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-[10px] text-yellow-400">
                Diminishing returns: after {reFix.attemptCount} attempts, additional fixes may have limited impact.
                Consider retraining the LoRA with more reference images instead.
              </p>
            </div>
          )}

          {/* LoRA Retraining Nudge */}
          <RetrainingNudge
            attemptCount={reFix.attemptCount}
            latestImprovement={data.driftImprovement ?? 0}
          />
        </div>
      )}

      {/* Re-Fix Confirmation Dialog */}
      {reFix && (
        <AlertDialog open={showReFixConfirm} onOpenChange={setShowReFixConfirm}>
          <AlertDialogContent className="bg-base border-white/10 max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-foreground">
                <RefreshCw className="h-5 w-5 text-purple-400" />
                Re-Fix with Higher Strength
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                Re-generate this frame with an additional LoRA strength boost.
                This is attempt #{reFix.attemptCount + 1} for this frame.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2">
              {/* Strength boost preview */}
              <div className="bg-white/[0.03] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Current LoRA Strength</span>
                  <span className="text-sm font-medium text-foreground">
                    {(data.boostedLoraStrength * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">New LoRA Strength</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-foreground">
                      {(data.boostedLoraStrength * 100).toFixed(0)}%
                    </span>
                    <ArrowUpCircle className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-sm font-bold text-purple-400">
                      {(Math.min(0.95, data.boostedLoraStrength + 0.05) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {data.newDriftScore != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Current Drift</span>
                    <span className={`text-sm font-medium ${
                      data.newDriftScore > 0.25 ? "text-red-400" :
                      data.newDriftScore > 0.15 ? "text-yellow-400" : "text-emerald-400"
                    }`}>
                      {(data.newDriftScore * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>

              {/* Attempt count warning */}
              {reFix.attemptCount >= 2 && (
                <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-yellow-400">Diminishing Returns</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Each subsequent fix attempt yields smaller improvements.
                      Cost increases by ~25% per attempt.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel className="text-muted-foreground">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  reFix.onReFix(reFix.jobId);
                  setShowReFixConfirm(false);
                }}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Queue Re-Fix
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
