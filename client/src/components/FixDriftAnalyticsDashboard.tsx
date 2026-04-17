import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity, CheckCircle2, XCircle, TrendingDown, CreditCard,
  Clock, AlertTriangle, Shield, BarChart3, Zap, RefreshCw,
} from "lucide-react";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

// ─── Types ──────────────────────────────────────────────────────────────

export interface FixDriftAnalyticsData {
  totalFixes: number;
  completed: number;
  failed: number;
  queued: number;
  processing: number;
  successRate: number;
  avgDriftImprovement: number;
  totalCreditsSpent: number;
  avgFixTimeSeconds: number;
  criticalFixes: number;
  warningFixes: number;
  criticalSuccessRate: number;
  warningSuccessRate: number;
  avgBoostDelta: number;
  reFixCount: number;
  fixesOverTime: Array<{
    date: string;
    total: number;
    completed: number;
    failed: number;
    credits: number;
  }>;
}

// ─── Chart Config ───────────────────────────────────────────────────────

const chartConfig: ChartConfig = {
  completed: { label: "Completed", color: "oklch(0.75 0.18 160)" },
  failed: { label: "Failed", color: "oklch(0.65 0.2 25)" },
};

// ─── KPI Tile ───────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  value,
  subtext,
  iconColor = "text-muted-foreground",
  valueColor = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  iconColor?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-lg p-3 space-y-1">
      <div className={`flex items-center gap-1.5 ${iconColor}`}>
        {icon}
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valueColor}`}>{value}</div>
      {subtext && <div className="text-[10px] text-muted-foreground">{subtext}</div>}
    </div>
  );
}

// ─── Severity Row ───────────────────────────────────────────────────────

function SeverityRow({
  label,
  icon,
  count,
  successRate,
  color,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  successRate: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-foreground">{label}</span>
        <Badge variant="outline" className="text-[10px]">{count}</Badge>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              successRate >= 80 ? "bg-emerald-500" : successRate >= 50 ? "bg-yellow-500" : "bg-red-500"
            }`}
            style={{ width: `${successRate}%` }}
          />
        </div>
        <span className={`text-xs font-medium w-10 text-right ${
          successRate >= 80 ? "text-emerald-400" : successRate >= 50 ? "text-yellow-400" : "text-red-400"
        }`}>
          {successRate}%
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export default function FixDriftAnalyticsDashboard({
  data,
  isLoading,
}: {
  data: FixDriftAnalyticsData | undefined;
  isLoading: boolean;
}) {
  // Format time
  const formattedAvgTime = useMemo(() => {
    if (!data) return "—";
    const s = data.avgFixTimeSeconds;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }, [data]);

  if (isLoading) {
    return (
      <Card className="bg-base border-white/10">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-white/5 rounded w-48" />
            <div className="grid grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white/5 rounded" />)}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalFixes === 0) {
    return (
      <Card className="bg-base border-white/10">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center">
          <Activity className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No fix history yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Fix drifted frames to see analytics here
          </p>
        </CardContent>
      </Card>
    );
  }

  const improvementPct = (data.avgDriftImprovement * 100).toFixed(1);
  const boostDeltaPct = (data.avgBoostDelta * 100).toFixed(0);

  return (
    <Card className="bg-base border-white/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan" />
            Fix Drift Analytics
          </CardTitle>
          <div className="flex items-center gap-2">
            {data.reFixCount > 0 && (
              <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-400">
                <RefreshCw className="h-2.5 w-2.5 mr-1" />
                {data.reFixCount} re-fixes
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              {data.totalFixes} total
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Success Rate"
            value={`${data.successRate}%`}
            subtext={`${data.completed} completed, ${data.failed} failed`}
            iconColor={data.successRate >= 80 ? "text-emerald-400" : data.successRate >= 50 ? "text-yellow-400" : "text-red-400"}
            valueColor={data.successRate >= 80 ? "text-emerald-400" : data.successRate >= 50 ? "text-yellow-400" : "text-red-400"}
          />
          <KpiTile
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="Avg Improvement"
            value={`${improvementPct}%`}
            subtext={`Avg boost: +${boostDeltaPct}%`}
            iconColor="text-emerald-400"
            valueColor="text-emerald-400"
          />
          <KpiTile
            icon={<CreditCard className="h-3.5 w-3.5" />}
            label="Credits Spent"
            value={data.totalCreditsSpent}
            subtext={`~${Math.round(data.totalCreditsSpent / Math.max(1, data.totalFixes))} per fix`}
            iconColor="text-orange-400"
          />
          <KpiTile
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Avg Fix Time"
            value={formattedAvgTime}
            subtext={`${data.queued + data.processing} in progress`}
            iconColor="text-cyan"
          />
        </div>

        {/* Severity Breakdown */}
        <div className="bg-white/[0.02] rounded-lg p-3">
          <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            Severity Breakdown
          </p>
          <SeverityRow
            label="Critical"
            icon={<AlertTriangle className="h-3 w-3 text-red-400" />}
            count={data.criticalFixes}
            successRate={data.criticalSuccessRate}
            color="bg-red-500/20"
          />
          <SeverityRow
            label="Warning"
            icon={<Zap className="h-3 w-3 text-yellow-400" />}
            count={data.warningFixes}
            successRate={data.warningSuccessRate}
            color="bg-yellow-500/20"
          />
        </div>

        {/* Fixes Over Time Chart */}
        {data.fixesOverTime.length > 1 && (
          <div>
            <p className="text-xs font-medium text-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              Fixes Over Time
            </p>
            <ChartContainer config={chartConfig} className="h-[140px] w-full">
              <BarChart data={data.fixesOverTime} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="completed" stackId="a" fill="var(--color-completed)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}

        {/* Single day summary when only 1 day */}
        {data.fixesOverTime.length === 1 && (
          <div className="bg-white/[0.02] rounded-lg p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Activity on</span>
              <span className="text-xs text-foreground font-medium">
                {new Date(data.fixesOverTime[0].date).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                {data.fixesOverTime[0].completed} completed
              </Badge>
              {data.fixesOverTime[0].failed > 0 && (
                <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                  {data.fixesOverTime[0].failed} failed
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">
                {data.fixesOverTime[0].credits} credits
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
