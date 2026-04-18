/**
 * Cost Dashboard — Image generation cost analytics, A/B testing, and batch jobs.
 *
 * Tabs: Overview | A/B Testing | Batch Jobs
 *
 * @see Prompt 25, Section 14 (Overview)
 * @see Prompt 29 (A/B Testing + Batch Jobs)
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
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
  FlaskConical,
  Play,
  Pause,
  Square,
  ArrowRight,
  Package,
  Loader2,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────

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

// ─── Main Component ─────────────────────────────────────────────────────

export default function CostDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cost Dashboard</h2>
        <p className="text-muted-foreground">
          Monitor image generation costs, run A/B experiments, and manage batch jobs.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <DollarSign className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="ab-testing" className="gap-1.5">
            <FlaskConical className="h-4 w-4" />
            A/B Testing
          </TabsTrigger>
          <TabsTrigger value="batch-jobs" className="gap-1.5">
            <Package className="h-4 w-4" />
            Batch Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="ab-testing">
          <ABTestingTab />
        </TabsContent>

        <TabsContent value="batch-jobs">
          <BatchJobsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Overview Tab (existing functionality)
// ═══════════════════════════════════════════════════════════════════════════

function OverviewTab() {
  const { data: budget } = trpc.imageRouter.budget.useQuery();
  const { data: health } = trpc.imageRouter.health.useQuery();
  const { data: costStats } = trpc.imageRouter.costStats.useQuery();
  const { data: costHistory } = trpc.imageRouter.costHistory.useQuery({ limit: 20 });
  const { data: providers } = trpc.imageRouter.providers.useQuery();

  const totalSpendThisMonth = costStats?.reduce((sum: number, s: any) => sum + s.totalCostUsd, 0) ?? 0;
  const totalJobsThisMonth = costStats?.reduce((sum: number, s: any) => sum + s.totalJobs, 0) ?? 0;
  const totalSuccessThisMonth = costStats?.reduce((sum: number, s: any) => sum + s.successCount, 0) ?? 0;
  const overallSuccessRate = totalJobsThisMonth > 0
    ? ((totalSuccessThisMonth / totalJobsThisMonth) * 100).toFixed(1)
    : "—";

  const providerAgg = new Map<string, { cost: number; jobs: number; success: number; avgLatency: number }>();
  for (const stat of costStats ?? []) {
    const s = stat as any;
    const existing = providerAgg.get(s.providerId) ?? { cost: 0, jobs: 0, success: 0, avgLatency: 0 };
    existing.cost += s.totalCostUsd;
    existing.jobs += s.totalJobs;
    existing.success += s.successCount;
    existing.avgLatency = s.avgLatencyMs;
    providerAgg.set(s.providerId, existing);
  }

  const workloadAgg = new Map<string, { cost: number; jobs: number }>();
  for (const stat of costStats ?? []) {
    const s = stat as any;
    const existing = workloadAgg.get(s.workloadType) ?? { cost: 0, jobs: 0 };
    existing.cost += s.totalCostUsd;
    existing.jobs += s.totalJobs;
    workloadAgg.set(s.workloadType, existing);
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
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
              {providers?.filter((p: any) => p.configured).length ?? 0}/{providers?.length ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Configured and available</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per-Provider Burn */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Provider Burn Rate
            </CardTitle>
            <CardDescription>Monthly spend and budget usage per provider</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {budget?.summary.map((b: any) => (
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
                  {budget.alerts.slice(-3).map((alert: any, i: number) => (
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

        {/* Workload Mix */}
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
        {/* Provider Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Provider Health
            </CardTitle>
            <CardDescription>Real-time circuit breaker and latency status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {health?.map((h: any) => (
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
                    <Badge variant="outline" className="text-green-600 border-green-600">Configured</Badge>
                  ) : (
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">No API Key</Badge>
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

        {/* Recent Jobs */}
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
              {costHistory?.map((job: any) => (
                <div key={job.jobId} className="flex items-center justify-between p-2 rounded text-sm bg-muted/30">
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

// ═══════════════════════════════════════════════════════════════════════════
// A/B Testing Tab
// ═══════════════════════════════════════════════════════════════════════════

function ABTestingTab() {
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);

  const { data: experiments, refetch } = trpc.abTesting.list.useQuery({ limit: 20 });
  const createMutation = trpc.abTesting.create.useMutation({
    onSuccess: () => {
      toast.success("Experiment created");
      setCreateOpen(false);
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });
  const updateStatusMutation = trpc.abTesting.updateStatus.useMutation({
    onSuccess: () => refetch(),
    onError: (err: any) => toast.error(err.message),
  });

  // Form state
  const [formName, setFormName] = useState("");
  const [formControl, setFormControl] = useState("runware");
  const [formVariant, setFormVariant] = useState("fal");
  const [formSplit, setFormSplit] = useState("20");
  const [formMinSamples, setFormMinSamples] = useState("30");

  const handleCreate = () => {
    createMutation.mutate({
      name: formName,
      controlProvider: formControl,
      variantProvider: formVariant,
      trafficSplitPercent: parseInt(formSplit, 10),
      minSampleSize: parseInt(formMinSamples, 10),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Provider A/B Experiments</h3>
          <p className="text-sm text-muted-foreground">
            Route a percentage of jobs to each provider and compare quality, cost, and latency side-by-side.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-1.5">
              <FlaskConical className="h-4 w-4" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create A/B Experiment</DialogTitle>
              <DialogDescription>
                Split traffic between two providers and compare their performance.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Experiment Name</Label>
                <Input
                  placeholder="e.g., Runware vs Fal.ai for manga panels"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Control Provider</Label>
                  <Select value={formControl} onValueChange={setFormControl}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="runware">Runware</SelectItem>
                      <SelectItem value="tensorart">TensorArt</SelectItem>
                      <SelectItem value="fal">Fal.ai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Variant Provider</Label>
                  <Select value={formVariant} onValueChange={setFormVariant}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="runware">Runware</SelectItem>
                      <SelectItem value="tensorart">TensorArt</SelectItem>
                      <SelectItem value="fal">Fal.ai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Variant Traffic %</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={formSplit}
                    onChange={(e) => setFormSplit(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    {formSplit}% variant, {100 - parseInt(formSplit || "0", 10)}% control
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Min Sample Size</Label>
                  <Input
                    type="number"
                    min={5}
                    max={1000}
                    value={formMinSamples}
                    onChange={(e) => setFormMinSamples(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Per arm before significance</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!formName || createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Create Experiment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Experiment List */}
      <div className="space-y-3">
        {experiments?.map((exp: any) => (
          <Card key={exp.id} className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedExperiment(selectedExperiment === exp.id ? null : exp.id)}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FlaskConical className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{exp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_LABELS[exp.controlProvider] ?? exp.controlProvider}
                      <ArrowRight className="h-3 w-3 inline mx-1" />
                      {PROVIDER_LABELS[exp.variantProvider] ?? exp.variantProvider}
                      {" · "}{exp.trafficSplitPercent}% variant split
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    exp.status === "running" ? "default" :
                    exp.status === "completed" ? "secondary" :
                    exp.status === "draft" ? "outline" :
                    "destructive"
                  }>
                    {exp.status}
                  </Badge>
                  {exp.status === "draft" && (
                    <Button size="sm" variant="outline" className="gap-1"
                            onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: exp.id, status: "running" }); }}>
                      <Play className="h-3 w-3" /> Start
                    </Button>
                  )}
                  {exp.status === "running" && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1"
                              onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: exp.id, status: "paused" }); }}>
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1"
                              onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: exp.id, status: "completed" }); }}>
                        <Square className="h-3 w-3" /> End
                      </Button>
                    </>
                  )}
                  {exp.status === "paused" && (
                    <Button size="sm" variant="outline" className="gap-1"
                            onClick={(e) => { e.stopPropagation(); updateStatusMutation.mutate({ id: exp.id, status: "running" }); }}>
                      <Play className="h-3 w-3" /> Resume
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded comparison view */}
              {selectedExperiment === exp.id && (
                <div className="mt-4 pt-4 border-t">
                  <ABComparisonView experimentId={exp.id} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {(!experiments || experiments.length === 0) && (
          <Card>
            <CardContent className="p-8 text-center">
              <FlaskConical className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No experiments yet. Create one to compare providers.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─── A/B Comparison View (side-by-side) ─────────────────────────────────

function ABComparisonView({ experimentId }: { experimentId: string }) {
  const { data: comparison, isLoading } = trpc.abTesting.compare.useQuery({ id: experimentId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading comparison...</span>
      </div>
    );
  }

  if (!comparison) {
    return <p className="text-sm text-muted-foreground text-center py-4">No data available</p>;
  }

  const c = comparison as any;

  return (
    <div className="space-y-4">
      {/* Overall Verdict */}
      <div className="flex items-center gap-2">
        <Badge variant={c.verdict === "variant_wins" ? "default" : c.verdict === "control_wins" ? "secondary" : "outline"}>
          {c.verdict === "variant_wins" ? "Variant Wins" :
           c.verdict === "control_wins" ? "Control Wins" :
           c.verdict === "no_difference" ? "No Significant Difference" : "Insufficient Data"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Confidence: {((c.confidence ?? 0) * 100).toFixed(0)}%
          {" · "}Control: {c.controlSampleSize ?? 0} samples · Variant: {c.variantSampleSize ?? 0} samples
        </span>
      </div>

      {/* Side-by-side metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Control */}
        <Card className="border-blue-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Control: {PROVIDER_LABELS[c.controlProvider] ?? c.controlProvider}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <MetricRow label="Success Rate" value={`${((c.controlStats?.successRate ?? 0) * 100).toFixed(1)}%`} />
            <MetricRow label="Avg Latency" value={`${(c.controlStats?.avgLatencyMs ?? 0).toFixed(0)}ms`} />
            <MetricRow label="Avg Cost" value={`$${(c.controlStats?.avgCostUsd ?? 0).toFixed(4)}`} />
            <MetricRow label="P95 Latency" value={`${(c.controlStats?.p95LatencyMs ?? 0).toFixed(0)}ms`} />
            <MetricRow label="Total Cost" value={`$${(c.controlStats?.totalCostUsd ?? 0).toFixed(2)}`} />
          </CardContent>
        </Card>

        {/* Variant */}
        <Card className="border-emerald-500/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Variant: {PROVIDER_LABELS[c.variantProvider] ?? c.variantProvider}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <MetricRow label="Success Rate" value={`${((c.variantStats?.successRate ?? 0) * 100).toFixed(1)}%`}
                       delta={deltaPercent(c.controlStats?.successRate, c.variantStats?.successRate)} />
            <MetricRow label="Avg Latency" value={`${(c.variantStats?.avgLatencyMs ?? 0).toFixed(0)}ms`}
                       delta={deltaMs(c.controlStats?.avgLatencyMs, c.variantStats?.avgLatencyMs)} />
            <MetricRow label="Avg Cost" value={`$${(c.variantStats?.avgCostUsd ?? 0).toFixed(4)}`}
                       delta={deltaCost(c.controlStats?.avgCostUsd, c.variantStats?.avgCostUsd)} />
            <MetricRow label="P95 Latency" value={`${(c.variantStats?.p95LatencyMs ?? 0).toFixed(0)}ms`}
                       delta={deltaMs(c.controlStats?.p95LatencyMs, c.variantStats?.p95LatencyMs)} />
            <MetricRow label="Total Cost" value={`$${(c.variantStats?.totalCostUsd ?? 0).toFixed(2)}`} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricRow({ label, value, delta }: { label: string; value: string; delta?: { text: string; positive: boolean } | null }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        {delta && (
          <span className={`text-xs ${delta.positive ? "text-green-500" : "text-red-500"}`}>
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

function deltaPercent(control?: number, variant?: number) {
  if (control == null || variant == null || control === 0) return null;
  const diff = ((variant - control) / control) * 100;
  return { text: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`, positive: diff > 0 };
}

function deltaMs(control?: number, variant?: number) {
  if (control == null || variant == null) return null;
  const diff = variant - control;
  return { text: `${diff > 0 ? "+" : ""}${diff.toFixed(0)}ms`, positive: diff < 0 }; // lower is better
}

function deltaCost(control?: number, variant?: number) {
  if (control == null || variant == null) return null;
  const diff = variant - control;
  return { text: `${diff > 0 ? "+" : ""}$${diff.toFixed(4)}`, positive: diff < 0 }; // lower is better
}

// ═══════════════════════════════════════════════════════════════════════════
// Batch Jobs Tab
// ═══════════════════════════════════════════════════════════════════════════

function BatchJobsTab() {
  const { data: batchJobs, refetch } = trpc.abTesting.listBatches.useQuery({ limit: 20 });
  const cancelMutation = trpc.abTesting.cancelBatch.useMutation({
    onSuccess: () => { toast.success("Batch cancelled"); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Batch Generation Jobs</h3>
        <p className="text-sm text-muted-foreground">
          Large-scale image generation with webhook notifications on completion.
          Submit batches via the API and track progress here.
        </p>
      </div>

      <div className="space-y-3">
        {batchJobs?.map((batch: any) => {
          const progress = batch.totalItems > 0
            ? ((batch.completedItems + batch.failedItems) / batch.totalItems) * 100
            : 0;

          return (
            <Card key={batch.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{batch.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {batch.totalItems} items · Created {new Date(batch.createdAt).toLocaleDateString()}
                      {batch.webhookUrl && " · Webhook configured"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      batch.status === "completed" ? "secondary" :
                      batch.status === "processing" ? "default" :
                      batch.status === "failed" ? "destructive" :
                      "outline"
                    }>
                      {batch.status}
                    </Badge>
                    {batch.status === "processing" && (
                      <Button size="sm" variant="outline"
                              onClick={() => cancelMutation.mutate({ id: batch.id })}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                <Progress value={progress} className="h-2 mb-2" />

                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    <CheckCircle2 className="h-3 w-3 inline mr-0.5 text-green-500" />
                    {batch.completedItems} completed
                    {batch.failedItems > 0 && (
                      <>
                        {" · "}
                        <XCircle className="h-3 w-3 inline mr-0.5 text-red-500" />
                        {batch.failedItems} failed
                      </>
                    )}
                  </span>
                  <span>${parseFloat(batch.totalCostUsd ?? "0").toFixed(2)} total cost</span>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {(!batchJobs || batchJobs.length === 0) && (
          <Card>
            <CardContent className="p-8 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No batch jobs yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Submit batch generation jobs via the API to render full chapters at once.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
