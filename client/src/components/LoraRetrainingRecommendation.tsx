import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, Brain, TrendingDown, Camera, ChevronDown, ChevronUp,
  Sparkles, Shield, Layers, BarChart3, Target, ArrowRight,
  Image as ImageIcon, Lightbulb, Zap, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────

interface ReferenceImageSuggestion {
  type: string;
  description: string;
  priority: number;
}

interface WeakFeature {
  feature: string;
  label: string;
  avgDrift: number;
  affectedFrameCount: number;
  fixAttemptCount: number;
  improvedAfterFix: boolean;
  referenceImageSuggestions: ReferenceImageSuggestion[];
}

interface PerAttemptImprovement {
  attempt: number;
  improvement: number;
  cumulativeImprovement: number;
}

interface ImprovementTrend {
  slope: number;
  avgImprovement: number;
  latestImprovement: number;
  dataPoints: number;
  isDiminishing: boolean;
  perAttemptImprovements: PerAttemptImprovement[];
}

interface DiminishingReturnsAnalysis {
  totalFramesAnalyzed: number;
  framesWithMultipleAttempts: number;
  framesWithDiminishingReturns: number;
  overallTrend: ImprovementTrend;
  avgRemainingDrift: number;
  maxRemainingDrift: number;
}

export interface RetrainingRecommendationData {
  shouldRetrain: boolean;
  urgency: "recommended" | "strongly_recommended" | "critical";
  summary: string;
  explanation: string;
  weakFeatures: WeakFeature[];
  analysis: DiminishingReturnsAnalysis;
  estimatedRetrainingImpact: number;
  totalSuggestedImages: number;
}

// ─── Urgency Styles ─────────────────────────────────────────────────────

const URGENCY_STYLES = {
  recommended: {
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
    text: "text-amber-400",
    badge: "border-amber-500/40 text-amber-400",
    icon: "text-amber-400",
    label: "Recommended",
    gradient: "from-amber-500/10 to-amber-500/5",
  },
  strongly_recommended: {
    bg: "bg-orange-500/5",
    border: "border-orange-500/20",
    text: "text-orange-400",
    badge: "border-orange-500/40 text-orange-400",
    icon: "text-orange-400",
    label: "Strongly Recommended",
    gradient: "from-orange-500/10 to-orange-500/5",
  },
  critical: {
    bg: "bg-red-500/5",
    border: "border-red-500/20",
    text: "text-red-400",
    badge: "border-red-500/40 text-red-400",
    icon: "text-red-400",
    label: "Critical",
    gradient: "from-red-500/10 to-red-500/5",
  },
};

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  face: <Shield className="h-4 w-4" />,
  hair: <Sparkles className="h-4 w-4" />,
  outfit: <Layers className="h-4 w-4" />,
  colorPalette: <BarChart3 className="h-4 w-4" />,
  bodyProportion: <Target className="h-4 w-4" />,
};

const REF_TYPE_ICONS: Record<string, React.ReactNode> = {
  angle: <Camera className="h-3.5 w-3.5" />,
  detail: <Target className="h-3.5 w-3.5" />,
  lighting: <Lightbulb className="h-3.5 w-3.5" />,
  expression: <Sparkles className="h-3.5 w-3.5" />,
  full_body: <ImageIcon className="h-3.5 w-3.5" />,
  color_reference: <BarChart3 className="h-3.5 w-3.5" />,
};

// ─── Improvement Trend Visualization ────────────────────────────────────

function ImprovementTrendChart({ trend }: { trend: ImprovementTrend }) {
  if (trend.perAttemptImprovements.length === 0) return null;

  const maxImprovement = Math.max(
    ...trend.perAttemptImprovements.map(p => p.improvement),
    0.01
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Per-Attempt Improvement</span>
        {trend.isDiminishing && (
          <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">
            <TrendingDown className="h-2.5 w-2.5 mr-0.5" /> Diminishing
          </Badge>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {trend.perAttemptImprovements.map((p) => {
          const height = Math.max(4, (p.improvement / maxImprovement) * 100);
          const isLow = p.improvement < 0.02;
          return (
            <div key={p.attempt} className="flex flex-col items-center gap-1 flex-1">
              <div
                className={`w-full rounded-t transition-all ${
                  isLow ? "bg-red-500/60" : p.improvement > 0.05 ? "bg-emerald-500/60" : "bg-yellow-500/60"
                }`}
                style={{ height: `${height}%`, minHeight: "4px" }}
                title={`Attempt ${p.attempt}: ${(p.improvement * 100).toFixed(1)}% improvement`}
              />
              <span className="text-[9px] text-muted-foreground">#{p.attempt}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Slope: {trend.slope.toFixed(4)}</span>
        <span>Avg: {(trend.avgImprovement * 100).toFixed(1)}%</span>
        <span>Latest: {(trend.latestImprovement * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

// ─── Weak Feature Card ──────────────────────────────────────────────────

function WeakFeatureCard({ feature }: { feature: WeakFeature }) {
  const [expanded, setExpanded] = useState(false);
  const icon = FEATURE_ICONS[feature.feature] ?? <Target className="h-4 w-4" />;

  return (
    <div className="bg-white/[0.02] border border-white/5 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-white/5 flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">{feature.label}</p>
            <p className="text-[10px] text-muted-foreground">
              {feature.fixAttemptCount} fix attempts across {feature.affectedFrameCount} frame{feature.affectedFrameCount > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!feature.improvedAfterFix && (
            <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">
              Not Improving
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px]">
            {(feature.avgDrift * 100).toFixed(1)}% drift
          </Badge>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-white/5">
          <p className="text-[10px] text-muted-foreground pt-2">
            Suggested reference images to improve this feature:
          </p>
          <div className="space-y-1.5">
            {feature.referenceImageSuggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-md bg-white/[0.02]"
              >
                <div className="w-5 h-5 rounded flex items-center justify-center bg-white/5 text-muted-foreground shrink-0 mt-0.5">
                  {REF_TYPE_ICONS[suggestion.type] ?? <ImageIcon className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{suggestion.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[8px] capitalize">
                      {suggestion.type.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">
                      Priority {suggestion.priority}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function LoraRetrainingRecommendation({
  data,
  isLoading,
}: {
  data: RetrainingRecommendationData | null | undefined;
  isLoading: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (isLoading) {
    return (
      <Card className="bg-base border-white/10">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-white/5 rounded w-56" />
            <div className="h-16 bg-white/5 rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.shouldRetrain) return null;

  const style = URGENCY_STYLES[data.urgency];
  const { analysis } = data;

  return (
    <Card className={`${style.bg} ${style.border} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className={`h-4 w-4 ${style.icon}`} />
            LoRA Retraining Recommendation
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
              {style.label}
            </Badge>
            {data.totalSuggestedImages > 0 && (
              <Badge variant="outline" className="text-[10px]">
                <Camera className="h-2.5 w-2.5 mr-0.5" />
                {data.totalSuggestedImages} images suggested
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {/* Summary Banner */}
        <div className={`rounded-lg p-4 bg-gradient-to-r ${style.gradient}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`h-5 w-5 ${style.icon} shrink-0 mt-0.5`} />
            <div className="space-y-1.5">
              <p className={`text-sm font-medium ${style.text}`}>{data.summary}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{data.explanation}</p>
            </div>
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/[0.03] rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Frames Analyzed</div>
            <div className="text-lg font-bold text-foreground">{analysis.totalFramesAnalyzed}</div>
            <div className="text-[10px] text-muted-foreground">
              {analysis.framesWithMultipleAttempts} with 3+ fixes
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Diminishing</div>
            <div className={`text-lg font-bold ${
              analysis.framesWithDiminishingReturns > 0 ? "text-red-400" : "text-emerald-400"
            }`}>
              {analysis.framesWithDiminishingReturns}
            </div>
            <div className="text-[10px] text-muted-foreground">frames plateaued</div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Remaining Drift</div>
            <div className={`text-lg font-bold ${
              analysis.avgRemainingDrift > 0.2 ? "text-red-400" :
              analysis.avgRemainingDrift > 0.1 ? "text-yellow-400" : "text-emerald-400"
            }`}>
              {(analysis.avgRemainingDrift * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-muted-foreground">
              max: {(analysis.maxRemainingDrift * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Est. Impact</div>
            <div className="text-lg font-bold text-cyan">
              {(data.estimatedRetrainingImpact * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">expected improvement</div>
          </div>
        </div>

        {/* Improvement Trend */}
        {analysis.overallTrend.dataPoints >= 2 && (
          <div className="bg-white/[0.02] rounded-lg p-4">
            <ImprovementTrendChart trend={analysis.overallTrend} />
          </div>
        )}

        {/* Weak Features */}
        {data.weakFeatures.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Weak Features ({data.weakFeatures.length})
              </p>
              <span className="text-[10px] text-muted-foreground">
                Click to see reference image suggestions
              </span>
            </div>
            <div className="space-y-2">
              {data.weakFeatures.map(f => (
                <WeakFeatureCard key={f.feature} feature={f} />
              ))}
            </div>
          </div>
        )}

        {/* Detailed Analysis Toggle */}
        <div className="border-t border-white/10 pt-3">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showDetails ? "Hide" : "Show"} Detailed Analysis
          </button>

          {showDetails && (
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="bg-white/[0.02] rounded-lg p-3 space-y-2">
                <p className="font-medium text-foreground">Trend Analysis</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground">Trend Slope</span>
                    <p className={`font-medium ${
                      analysis.overallTrend.slope < -0.005 ? "text-red-400" : "text-foreground"
                    }`}>
                      {analysis.overallTrend.slope.toFixed(5)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Data Points</span>
                    <p className="font-medium text-foreground">{analysis.overallTrend.dataPoints}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Avg Improvement</span>
                    <p className="font-medium text-foreground">
                      {(analysis.overallTrend.avgImprovement * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground">Latest Improvement</span>
                    <p className={`font-medium ${
                      analysis.overallTrend.latestImprovement < 0.02 ? "text-red-400" : "text-foreground"
                    }`}>
                      {(analysis.overallTrend.latestImprovement * 100).toFixed(2)}%
                    </p>
                  </div>
                </div>
              </div>

              {data.weakFeatures.length > 0 && (
                <div className="bg-white/[0.02] rounded-lg p-3">
                  <p className="font-medium text-foreground mb-2">All Reference Image Suggestions</p>
                  <div className="space-y-1">
                    {data.weakFeatures.flatMap(f =>
                      f.referenceImageSuggestions.map((s, i) => (
                        <div key={`${f.feature}-${i}`} className="flex items-center gap-2 py-1">
                          <span className="text-[9px] text-muted-foreground w-4 text-center">
                            P{s.priority}
                          </span>
                          <ArrowRight className="h-2.5 w-2.5 text-muted-foreground" />
                          <span className="text-[10px]">
                            <span className="text-foreground font-medium">{f.label}:</span>{" "}
                            {s.description}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            Retraining with {data.totalSuggestedImages} additional reference images is expected to improve consistency by ~{(data.estimatedRetrainingImpact * 100).toFixed(0)}%
          </p>
          <Button
            size="sm"
            onClick={() => {
              toast.info("Retraining workflow coming soon", {
                description: "Navigate to the Character Library to start a new LoRA training with updated references.",
              });
            }}
            className={`gap-1.5 text-xs ${
              data.urgency === "critical"
                ? "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
                : data.urgency === "strongly_recommended"
                  ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                  : "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black"
            }`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Start Retraining
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Inline Nudge (for BeforeAfterComparison) ───────────────────────────

export function RetrainingNudge({
  attemptCount,
  latestImprovement,
}: {
  attemptCount: number;
  latestImprovement: number;
}) {
  if (attemptCount < 3) return null;
  const isLow = latestImprovement < 0.02;

  return (
    <div className={`flex items-start gap-2 rounded-lg p-2.5 ${
      isLow ? "bg-red-500/5 border border-red-500/20" : "bg-amber-500/5 border border-amber-500/20"
    }`}>
      <Brain className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isLow ? "text-red-400" : "text-amber-400"}`} />
      <div>
        <p className={`text-[10px] font-medium ${isLow ? "text-red-400" : "text-amber-400"}`}>
          {isLow ? "Retraining Strongly Recommended" : "Consider Retraining"}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          After {attemptCount} fix attempts{isLow ? " with minimal improvement" : ""}, retraining the LoRA
          with additional reference images will likely yield better results than further fixes.
        </p>
      </div>
    </div>
  );
}
