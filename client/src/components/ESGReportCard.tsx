import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, TrendingDown, TrendingUp, Minus, AlertTriangle,
  CheckCircle, Activity, ChevronDown, ChevronUp, Sparkles
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── Types ─────────────────────────────────────────────────────────────

interface ESGReportCardProps {
  compact?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function getESGColor(esg: number): string {
  if (esg <= 0.3) return "text-emerald-400";
  if (esg <= 0.7) return "text-amber-400";
  if (esg <= 1.0) return "text-orange-400";
  return "text-red-400";
}

function getESGBgColor(esg: number): string {
  if (esg <= 0.3) return "bg-emerald-500/20";
  if (esg <= 0.7) return "bg-amber-500/20";
  if (esg <= 1.0) return "bg-orange-500/20";
  return "bg-red-500/20";
}

function getESGLabel(esg: number): string {
  if (esg <= 0.3) return "Excellent";
  if (esg <= 0.7) return "Good";
  if (esg <= 1.0) return "Needs Attention";
  return "Critical";
}

function getTrendIcon(trend: string) {
  if (trend === "improving") return <TrendingDown className="h-5 w-5 text-emerald-400" />;
  if (trend === "declining") return <TrendingUp className="h-5 w-5 text-red-400" />;
  return <Minus className="h-5 w-5 text-zinc-400" />;
}

function getTrendColor(trend: string): string {
  if (trend === "improving") return "text-emerald-400";
  if (trend === "declining") return "text-red-400";
  return "text-zinc-400";
}

// ─── Component ─────────────────────────────────────────────────────────

export function ESGReportCard({ compact = false }: ESGReportCardProps) {
  const [expanded, setExpanded] = useState(!compact);
  const reportCardQuery = trpc.tierSampler.getExpectationReportCard.useQuery();

  if (reportCardQuery.isLoading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardContent className="py-8">
          <div className="flex items-center justify-center gap-2 text-zinc-400">
            <Activity className="h-4 w-4 animate-pulse" />
            <span className="text-sm">Loading report card...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!reportCardQuery.data?.hasData || !reportCardQuery.data?.reportCard) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardContent className="py-8 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 mb-3">
            <BarChart3 className="h-6 w-6 text-zinc-500" />
          </div>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">No ESG Data Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Complete the Expectation Anchor Survey and generate some scenes to see your Expectation-Satisfaction Gap report.
          </p>
        </CardContent>
      </Card>
    );
  }

  const rc = reportCardQuery.data.reportCard;
  const avg30d = rc.personalESG.avg30d;
  const trend = rc.personalESG.trend;

  return (
    <Card className="bg-zinc-900/50 border-zinc-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              Expectation Report Card
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              ESG tracking across {rc.totalScenes} scenes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-lg ${getESGBgColor(avg30d)}`}>
              <span className={`text-lg font-bold ${getESGColor(avg30d)}`}>
                {avg30d.toFixed(2)}
              </span>
              <span className="text-[10px] text-zinc-400 ml-1">30d avg</span>
            </div>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="text-zinc-400"
              >
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Scenes</span>
              <p className="text-xl font-bold text-white">{rc.totalScenes}</p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">30d ESG</span>
              <p className={`text-xl font-bold ${getESGColor(avg30d)}`}>{avg30d.toFixed(2)}</p>
              <span className={`text-[10px] ${getESGColor(avg30d)}`}>{getESGLabel(avg30d)}</span>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">90d ESG</span>
              <p className={`text-xl font-bold ${getESGColor(rc.personalESG.avg90d)}`}>
                {rc.personalESG.avg90d.toFixed(2)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Trend</span>
              <div className="flex items-center gap-1 mt-1">
                {getTrendIcon(trend)}
                <span className={`text-sm font-medium ${getTrendColor(trend)}`}>
                  {trend.charAt(0).toUpperCase() + trend.slice(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Platform comparison */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/30 border border-zinc-700/20">
            <span className="text-xs text-zinc-400">Platform Average:</span>
            <span className={`text-sm font-bold ${getESGColor(rc.personalESG.platformAvg)}`}>
              {rc.personalESG.platformAvg.toFixed(2)}
            </span>
            <span className="text-xs text-zinc-500">vs your</span>
            <span className={`text-sm font-bold ${getESGColor(avg30d)}`}>
              {avg30d.toFixed(2)}
            </span>
            {avg30d < rc.personalESG.platformAvg ? (
              <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">
                <CheckCircle className="h-3 w-3 mr-1" /> Better than avg
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">
                <AlertTriangle className="h-3 w-3 mr-1" /> Below avg
              </Badge>
            )}
          </div>

          {/* Anchor Histogram */}
          {rc.anchorHistogram && rc.anchorHistogram.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-zinc-300">Anchor Distribution</h4>
              <div className="flex gap-1 items-end h-16">
                {rc.anchorHistogram.map((entry: { tier: number; count: number; percentage: number }) => {
                  const maxCount = Math.max(...rc.anchorHistogram.map((e: { count: number }) => e.count));
                  const height = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
                  return (
                    <div key={entry.tier} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-zinc-400">{entry.count}</span>
                      <div
                        className="w-full rounded-t bg-violet-500/40 transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-[9px] text-zinc-500">T{entry.tier}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gap Analysis */}
          {rc.gapAnalysis && rc.gapAnalysis.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <h4 className="text-xs font-medium text-zinc-300">Gap Analysis by Scene Type</h4>
              <div className="space-y-2">
                {rc.gapAnalysis.map((entry: { sceneType: string; avgAnchoredTier: number; avgSelectedTier: number; gap: number; suggestion: string }) => (
                  <div key={entry.sceneType} className="p-2 rounded bg-zinc-800/30 border border-zinc-700/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-zinc-300 capitalize">
                        {entry.sceneType.replace(/_/g, " ")}
                      </span>
                      <span className={`text-xs font-mono ${entry.gap > 0 ? "text-red-400" : entry.gap < 0 ? "text-emerald-400" : "text-zinc-400"}`}>
                        {entry.gap > 0 ? "+" : ""}{entry.gap.toFixed(1)} gap
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                      <span>Anchored: T{entry.avgAnchoredTier.toFixed(1)}</span>
                      <span>→</span>
                      <span>Selected: T{entry.avgSelectedTier.toFixed(1)}</span>
                    </div>
                    {entry.suggestion && (
                      <p className="text-[10px] text-zinc-500 mt-1 italic">{entry.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top exceeded / fell short */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Top Exceeded
              </h4>
              {rc.topExceeded?.length > 0 ? (
                rc.topExceeded.map((e: { sceneType: string; avgESG: number }) => (
                  <div key={e.sceneType} className="flex items-center justify-between text-xs p-1.5 rounded bg-emerald-500/10">
                    <span className="text-zinc-300 capitalize">{e.sceneType.replace(/_/g, " ")}</span>
                    <span className="text-emerald-400 font-mono">{e.avgESG.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-zinc-500">No data yet</p>
              )}
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-medium text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Fell Short
              </h4>
              {rc.bottomFellShort?.length > 0 ? (
                rc.bottomFellShort.map((e: { sceneType: string; avgESG: number }) => (
                  <div key={e.sceneType} className="flex items-center justify-between text-xs p-1.5 rounded bg-red-500/10">
                    <span className="text-zinc-300 capitalize">{e.sceneType.replace(/_/g, " ")}</span>
                    <span className="text-red-400 font-mono">{e.avgESG.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-zinc-500">No data yet</p>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
