/**
 * Cost Dashboard — Image generation cost analytics.
 *
 * Displays per-provider burn, workload mix, budget status,
 * and provider health in a unified dashboard view.
 *
 * @see Prompt 25, Section 14
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  DollarSign,
  Activity,
  BarChart3,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Image,
  Layers,
  TrendingUp,
  Zap,
} from "lucide-react";

// ─── Provider Colors ────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  runware: "bg-blue-500",
  tensorart: "bg-purple-500",
  fal: "bg-emerald-500",
  unknown: "bg-gray-500",
};

const PROVIDER_LABELS: Record<string, string> = {
  runware: "Runware",
  tensorart: "TensorArt",
  fal: "Fal.ai",
};

const WORKLOAD_LABELS: Record<string, string> = {
  manga_panel: "Manga Panels",
  character_sheet: "Character Sheets",
  background_art: "Backgrounds",
  cover_art: "Cover Art",
  thumbnail: "Thumbnails",
  ui_asset: "UI Assets",
};

const WORKLOAD_ICONS: Record<string, typeof Image> = {
  manga_panel: Layers,
  character_sheet: Image,
  background_art: Image,
  cover_art: Image,
  thumbnail: Zap,
  ui_asset: Zap,
};

// ─── Component ──────────────────────────────────────────────────────────

export default function CostDashboard() {
  const { data: budget, isLoading: budgetLoading } = trpc.imageRouter.budget.useQuery();
  const { data: health, isLoading: healthLoading } = trpc.imageRouter.health.useQuery();
  const { data: costStats, isLoading: statsLoading } = trpc.imageRouter.costStats.useQuery();
  const { data: costHistory } = trpc.imageRouter.costHistory.useQuery({ limit: 20 });
  const { data: providers } = trpc.imageRouter.providers.useQuery();

  const isLoading = budgetLoading || healthLoading || statsLoading;

  // ─── Aggregations ───────────────────────────────────────────────────

  const totalSpendThisMonth = costStats?.reduce((sum, s) => sum + s.totalCostUsd, 0) ?? 0;
  const totalJobsThisMonth = costStats?.reduce((sum, s) => sum + s.totalJobs, 0) ?? 0;
  const totalSuccessThisMonth = costStats?.reduce((sum, s) => sum + s.successCount, 0) ?? 0;
  const overallSuccessRate = totalJobsThisMonth > 0
    ? ((totalSuccessThisMonth / totalJobsThisMonth) * 100).toFixed(1)
    : "—";

  // Per-provider aggregation
  const providerAgg = new Map<string, { cost: number; jobs: number; success: number; avgLatency: number }>();
  for (const stat of costStats ?? []) {
    const existing = providerAgg.get(stat.providerId) ?? { cost: 0, jobs: 0, success: 0, avgLatency: 0 };
    existing.cost += stat.totalCostUsd;
    existing.jobs += stat.totalJobs;
    existing.success += stat.successCount;
    existing.avgLatency = stat.avgLatencyMs;
    providerAgg.set(stat.providerId, existing);
  }

  // Per-workload aggregation
  const workloadAgg = new Map<string, { cost: number; jobs: number }>();
  for (const stat of costStats ?? []) {
    const existing = workloadAgg.get(stat.workloadType) ?? { cost: 0, jobs: 0 };
    existing.cost += stat.totalCostUsd;
    existing.jobs += stat.totalJobs;
    workloadAgg.set(stat.workloadType, existing);
  }

  return (
    <div className="space-y-6">
      {/* ─── Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSpendThisMonth.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">This month's image generation costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalJobsThisMonth}</div>
            <p className="text-xs text-muted-foreground">Images generated this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">
              {totalSuccessThisMonth} of {totalJobsThisMonth} succeeded
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Providers</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {providers?.filter((p) => p.configured).length ?? 0}/{providers?.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Configured and available</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Per-Provider Burn ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Provider Burn Rate
            </CardTitle>
            <CardDescription>Monthly spend and budget usage per provider</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {budget?.summary.map((b) => (
              <div key={b.providerId} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[b.providerId] ?? PROVIDER_COLORS.unknown}`} />
                    <span className="font-medium">{PROVIDER_LABELS[b.providerId] ?? b.providerId}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    ${b.currentSpendUsd.toFixed(2)} / ${b.monthlyCapUsd.toFixed(0)}
                  </span>
                </div>
                <Progress value={Math.min(b.percentUsed, 100)} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{b.percentUsed.toFixed(1)}% used</span>
                  <span>${b.remainingUsd.toFixed(2)} remaining</span>
                </div>
              </div>
            ))}

            {budget?.alerts && budget.alerts.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    Budget Alerts
                  </p>
                  {budget.alerts.slice(-3).map((alert, i) => (
                    <div key={i} className="text-xs p-2 rounded bg-muted">
                      <Badge variant={alert.level === "critical" ? "destructive" : "secondary"} className="mr-2">
                        {alert.level}
                      </Badge>
                      {alert.message}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ─── Workload Mix ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Workload Mix
            </CardTitle>
            <CardDescription>Image generation by workload type</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from(workloadAgg.entries())
              .sort((a, b) => b[1].cost - a[1].cost)
              .map(([workload, data]) => {
                const Icon = WORKLOAD_ICONS[workload] ?? Image;
                const pct = totalJobsThisMonth > 0 ? (data.jobs / totalJobsThisMonth) * 100 : 0;
                return (
                  <div key={workload} className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm">
                        <span>{WORKLOAD_LABELS[workload] ?? workload}</span>
                        <span className="text-muted-foreground">{data.jobs} jobs</span>
                      </div>
                      <Progress value={pct} className="h-1.5 mt-1" />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">
                      ${data.cost.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            {workloadAgg.size === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No generation data yet this month
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Provider Health ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Provider Health
            </CardTitle>
            <CardDescription>Real-time circuit breaker and latency status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {health?.map((h) => (
              <div key={h.providerId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {h.isHealthy ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium">{h.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      Circuit: {h.circuitState} · Failures: {h.consecutiveFailures}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  {h.configured ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      No API Key
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    {h.latencyP50Ms != null ? `P50: ${h.latencyP50Ms}ms` : "No data"}
                    {h.successRate1h != null ? ` · ${(h.successRate1h * 100).toFixed(0)}% OK` : ""}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ─── Recent Jobs ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Generations
            </CardTitle>
            <CardDescription>Last 20 image generation jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {costHistory?.map((job) => (
                <div
                  key={job.jobId}
                  className="flex items-center justify-between p-2 rounded text-sm bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    {job.status === "succeeded" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className="text-muted-foreground">
                      {WORKLOAD_LABELS[job.workloadType] ?? job.workloadType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{PROVIDER_LABELS[job.providerId] ?? job.providerId}</span>
                    <span>${job.actualCostUsd.toFixed(4)}</span>
                    {job.latencyMs ? <span>{(job.latencyMs / 1000).toFixed(1)}s</span> : null}
                  </div>
                </div>
              ))}
              {(!costHistory || costHistory.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No generation history yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
