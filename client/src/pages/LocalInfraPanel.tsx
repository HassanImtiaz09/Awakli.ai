/**
 * Local Infrastructure Panel — Prompt 19
 * Admin panel for monitoring GPU endpoints, model artifacts, cost analytics,
 * and fallback chains for the hybrid local/API inference layer.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Cpu, HardDrive, Activity, DollarSign, AlertTriangle,
  CheckCircle, XCircle, RotateCcw, ArrowRight, Layers,
  Gauge, Snowflake, TrendingDown, Server, Package,
  RefreshCw, Play, ArrowLeftRight,
} from "lucide-react";

function Spinner() {
  return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  draining: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  disabled: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
};

const ALERT_STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  critical: { bg: "bg-red-500/10 border-red-500/20", icon: <XCircle className="h-4 w-4 text-red-400 shrink-0" /> },
  warn: { bg: "bg-amber-500/10 border-amber-500/20", icon: <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" /> },
  info: { bg: "bg-blue-500/10 border-blue-500/20", icon: <CheckCircle className="h-4 w-4 text-blue-400 shrink-0" /> },
};

// ─── Overview Tab ───────────────────────────────────────────────────────

function OverviewTab() {
  const { data, isLoading, refetch } = trpc.localInfra.overview.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const triggerMonitor = trpc.localInfra.triggerMonitor.useMutation({
    onSuccess: () => { refetch(); toast.success("Monitor cycle completed"); },
    onError: (err) => toast.error(`Monitor failed: ${err.message}`),
  });

  if (isLoading) return <Spinner />;
  if (!data) return <div className="text-center py-12 text-muted-foreground">No data available</div>;

  const activeEndpoints = data.endpoints.filter(ep => ep.status === "active").length;
  const totalWarm = data.endpoints.reduce((sum, ep) => sum + (ep.warmWorkers ?? 0), 0);
  const totalQueue = data.endpoints.reduce((sum, ep) => sum + (ep.queueDepth ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Monitor Status Bar */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${data.monitorRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
          <span className="text-sm">
            GPU Monitor: <span className="font-medium">{data.monitorRunning ? "Running" : "Stopped"}</span>
            {data.lastCheckAt && <span className="text-muted-foreground ml-2">Last: {new Date(data.lastCheckAt).toLocaleTimeString()}</span>}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => triggerMonitor.mutate()} disabled={triggerMonitor.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${triggerMonitor.isPending ? "animate-spin" : ""}`} />
          Run Now
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Server className="h-4 w-4" /> Endpoints</div>
            <div className="text-2xl font-bold">{activeEndpoints}<span className="text-base text-muted-foreground">/{data.endpoints.length}</span></div>
            <div className="text-xs text-muted-foreground">{totalWarm} warm workers</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Gauge className="h-4 w-4" /> Queue Depth</div>
            <div className="text-2xl font-bold">{totalQueue}</div>
            <div className="text-xs text-muted-foreground">across all endpoints</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><DollarSign className="h-4 w-4" /> 24h GPU Cost</div>
            <div className="text-2xl font-bold">${data.cost24h.totalCostUsd.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">{data.cost24h.totalGpuSeconds.toFixed(0)}s GPU time</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Snowflake className="h-4 w-4" /> Cold Start Rate</div>
            <div className={`text-2xl font-bold ${data.cost24h.coldStartRate > 0.2 ? "text-amber-400" : "text-emerald-400"}`}>
              {(data.cost24h.coldStartRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">target &lt; 20%</div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" /> Active Alerts ({data.alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.alerts.map((alert: { severity: string; type: string; message: string; providerId?: string }, i: number) => {
                const style = ALERT_STYLES[alert.severity] ?? ALERT_STYLES.info;
                return (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg}`}>
                    {style.icon}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{alert.message}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {alert.type} {alert.providerId && `· ${alert.providerId}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Version Drift */}
      {data.versionDrift.length > 0 && (
        <Card className="bg-card/50 border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-amber-400" /> Version Drift Detected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.versionDrift.map((drift: { endpointId: number; providerId: string; deployedArtifactId: number | null; activeArtifactId: number | null; activeVersion: string | null }) => (
                <div key={drift.endpointId} className="flex items-center gap-3 p-2 rounded bg-amber-500/5 border border-amber-500/10">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-medium">{drift.providerId}</span>
                  <span className="text-xs text-muted-foreground">
                    deployed: #{drift.deployedArtifactId} → active: #{drift.activeArtifactId} ({drift.activeVersion})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cost Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-lg">24h Cost by Model</CardTitle></CardHeader>
          <CardContent>
            {data.costByModel.length === 0 ? (
              <p className="text-muted-foreground text-sm">No GPU usage in the last 24 hours</p>
            ) : (
              <div className="space-y-3">
                {data.costByModel.map((item) => (
                  <div key={item.modelName} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{item.modelName}</div>
                      <div className="text-xs text-muted-foreground">{item.requests} req · {formatDuration(item.totalGpuSeconds)} GPU</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">${item.totalCostUsd.toFixed(4)}</div>
                      {item.coldStarts > 0 && <div className="text-xs text-amber-400">{item.coldStarts} cold</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-lg">7-Day Totals</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Total GPU Cost</div>
                <div className="text-2xl font-bold">${data.cost7d.totalCostUsd.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Total GPU Time</div>
                <div className="text-2xl font-bold">{formatDuration(data.cost7d.totalGpuSeconds)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Total Requests</div>
                <div className="text-2xl font-bold">{data.cost7d.totalRequests}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Endpoints Tab ──────────────────────────────────────────────────────

function EndpointsTab() {
  const utils = trpc.useUtils();
  const { data: endpoints, isLoading } = trpc.localInfra.listEndpoints.useQuery();
  const updateStatus = trpc.localInfra.updateEndpointStatus.useMutation({
    onSuccess: () => { utils.localInfra.listEndpoints.invalidate(); toast.success("Endpoint status updated"); },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  if (isLoading) return <Spinner />;
  if (!endpoints || endpoints.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center">
          <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Endpoints Registered</h3>
          <p className="text-muted-foreground text-sm">Local GPU endpoints will appear here once provisioned via RunPod or Modal.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {endpoints.map((ep) => (
        <Card key={ep.id} className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="font-medium">{ep.providerId}</span>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[ep.status] ?? ""}`}>{ep.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {ep.platform} · {ep.gpuType} · {ep.endpointId}
                </div>
              </div>
              <div className="flex gap-1">
                {ep.status === "active" && (
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateStatus.mutate({ endpointDbId: ep.id, status: "draining" })}>Drain</Button>
                )}
                {ep.status === "draining" && (
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateStatus.mutate({ endpointDbId: ep.id, status: "active" })}>Reactivate</Button>
                )}
                {ep.status !== "disabled" && (
                  <Button variant="outline" size="sm" className="text-xs h-7 text-red-400" onClick={() => updateStatus.mutate({ endpointDbId: ep.id, status: "disabled" })}>Disable</Button>
                )}
                {ep.status === "disabled" && (
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => updateStatus.mutate({ endpointDbId: ep.id, status: "active" })}>Enable</Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-2 rounded bg-background/50 border border-border/30 text-center">
                <div className="text-xs text-muted-foreground">Warm Workers</div>
                <div className={`text-lg font-bold ${ep.warmWorkers > 0 ? "text-emerald-400" : "text-zinc-500"}`}>{ep.warmWorkers}</div>
              </div>
              <div className="p-2 rounded bg-background/50 border border-border/30 text-center">
                <div className="text-xs text-muted-foreground">Queue Depth</div>
                <div className={`text-lg font-bold ${ep.queueDepth > 10 ? "text-amber-400" : ""}`}>{ep.queueDepth}</div>
              </div>
              <div className="p-2 rounded bg-background/50 border border-border/30 text-center">
                <div className="text-xs text-muted-foreground">Artifact</div>
                <div className="text-lg font-bold">{ep.modelArtifactId ? `#${ep.modelArtifactId}` : "—"}</div>
              </div>
            </div>
            {ep.scalingConfig && (
              <div className="mt-2 text-xs text-muted-foreground">
                Scaling: min={String((ep.scalingConfig as any)?.minWorkers ?? 0)}, max={String((ep.scalingConfig as any)?.maxWorkers ?? "—")}, target queue={String((ep.scalingConfig as any)?.targetQueueDepth ?? "—")}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Artifacts Tab ──────────────────────────────────────────────────────

function ArtifactsTab() {
  const utils = trpc.useUtils();
  const { data: artifacts, isLoading } = trpc.localInfra.listArtifacts.useQuery();
  const activateArtifact = trpc.localInfra.activateArtifact.useMutation({
    onSuccess: () => { utils.localInfra.listArtifacts.invalidate(); toast.success("Artifact activated"); },
    onError: (err) => toast.error(`Activation failed: ${err.message}`),
  });

  if (isLoading) return <Spinner />;
  if (!artifacts || artifacts.length === 0) {
    return (
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Model Artifacts</h3>
          <p className="text-muted-foreground text-sm">Model artifacts will appear here after seeding.</p>
        </CardContent>
      </Card>
    );
  }

  const grouped = artifacts.reduce((acc: Record<string, typeof artifacts>, a) => {
    if (!acc[a.modelName]) acc[a.modelName] = [];
    acc[a.modelName].push(a);
    return acc;
  }, {} as Record<string, typeof artifacts>);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([modelName, versions]) => (
        <Card key={modelName} className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-primary" /> {modelName}
            </CardTitle>
            <CardDescription>{(versions as Array<{ version: string }>).length} version(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(versions as typeof artifacts).map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-2 rounded bg-background/50 border border-border/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{v.version}</span>
                      {v.isActive && <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">Active</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{formatBytes(v.sizeBytes)}</div>
                  </div>
                  {!v.isActive && (
                    <Button variant="outline" size="sm" className="text-xs h-7"
                      onClick={() => activateArtifact.mutate({ modelName: v.modelName, version: v.version })}
                      disabled={activateArtifact.isPending}>
                      <Play className="h-3 w-3 mr-1" /> Activate
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Cost Comparison Tab ────────────────────────────────────────────────

function CostComparisonTab() {
  const { data: comparisons, isLoading } = trpc.localInfra.costComparison.useQuery();

  if (isLoading) return <Spinner />;
  if (!comparisons || comparisons.length === 0) return <div className="text-center py-12 text-muted-foreground">No cost data available</div>;

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingDown className="h-5 w-5 text-emerald-400" /> Local vs API Cost Comparison
        </CardTitle>
        <CardDescription>Estimated costs for a typical operation per provider</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-2 px-3">Model</th>
                <th className="text-left py-2 px-3">GPU</th>
                <th className="text-right py-2 px-3">Local Cost</th>
                <th className="text-right py-2 px-3">Credits</th>
                <th className="text-left py-2 px-3">API Fallback</th>
                <th className="text-right py-2 px-3">API Cost</th>
                <th className="text-right py-2 px-3">Savings</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((c: {
                providerId: string; modelName: string; gpuType: string;
                localCostUsd: number; localCostCredits: number;
                estimatedGpuSeconds: number; primaryFallback: string | null;
                apiFallbackCostUsd: number | null; savingsPercent: number | null;
              }) => (
                <tr key={c.providerId} className="border-b border-border/20">
                  <td className="py-2 px-3">
                    <div className="font-medium">{c.modelName}</div>
                    <div className="text-xs text-muted-foreground">{c.providerId}</div>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{c.gpuType}</td>
                  <td className="py-2 px-3 text-right font-mono">${c.localCostUsd.toFixed(4)}</td>
                  <td className="py-2 px-3 text-right">{c.localCostCredits.toFixed(1)}</td>
                  <td className="py-2 px-3 text-xs">{c.primaryFallback ?? <span className="text-muted-foreground italic">skip</span>}</td>
                  <td className="py-2 px-3 text-right font-mono">
                    {c.apiFallbackCostUsd != null ? `$${c.apiFallbackCostUsd.toFixed(4)}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {c.savingsPercent != null ? (
                      <span className={c.savingsPercent > 0 ? "text-emerald-400 font-medium" : "text-red-400"}>
                        {c.savingsPercent > 0 ? "+" : ""}{c.savingsPercent.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Fallback Map Tab ───────────────────────────────────────────────────

function FallbackMapTab() {
  const { data: fallbacks, isLoading } = trpc.localInfra.fallbackMap.useQuery();

  if (isLoading) return <Spinner />;
  if (!fallbacks) return null;

  return (
    <div className="grid gap-4">
      {fallbacks.map((chain: {
        localProviderId: string;
        fallbacks: Array<{ providerId: string; reason: string }>;
        canSkip: boolean;
        skipBehavior?: string;
      }) => (
        <Card key={chain.localProviderId} className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <ArrowLeftRight className="h-4 w-4 text-primary" />
              <span className="font-medium">{chain.localProviderId}</span>
              {chain.canSkip && (
                <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-300 border-blue-500/30">Can Skip</Badge>
              )}
            </div>
            {chain.fallbacks.length > 0 ? (
              <div className="space-y-2">
                {chain.fallbacks.map((fb, i) => (
                  <div key={fb.providerId} className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{fb.providerId}</span>
                    <span className="text-xs text-muted-foreground">— {fb.reason}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">No API fallbacks configured</div>
            )}
            {chain.skipBehavior && (
              <div className="mt-2 p-2 rounded bg-blue-500/5 border border-blue-500/10 text-xs text-blue-300">
                Skip behavior: {chain.skipBehavior}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Seed Data Tab ──────────────────────────────────────────────────────

function SeedDataTab() {
  const seedData = trpc.localInfra.seedData.useMutation({
    onSuccess: (result) => {
      const msg = [
        `Providers: ${result.providers.seeded.length} seeded, ${result.providers.skipped.length} skipped`,
        `Artifacts: ${result.artifacts.seeded.length} seeded, ${result.artifacts.skipped.length} skipped`,
      ].join(" · ");
      toast.success(msg);
    },
    onError: (err) => toast.error(`Seed failed: ${err.message}`),
  });

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader>
        <CardTitle className="text-lg">Seed Local Providers</CardTitle>
        <CardDescription>
          Register all 6 local providers and their model artifacts in the database.
          This operation is idempotent — existing records will be skipped.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => seedData.mutate()} disabled={seedData.isPending}>
          <RotateCcw className={`h-4 w-4 mr-2 ${seedData.isPending ? "animate-spin" : ""}`} />
          {seedData.isPending ? "Seeding..." : "Seed Provider Data"}
        </Button>
        {seedData.data && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="text-sm font-medium mb-1">Providers</div>
              {seedData.data.providers.seeded.length > 0 && <div className="text-xs text-emerald-400">Seeded: {seedData.data.providers.seeded.join(", ")}</div>}
              {seedData.data.providers.skipped.length > 0 && <div className="text-xs text-muted-foreground">Skipped: {seedData.data.providers.skipped.join(", ")}</div>}
              {seedData.data.providers.errors.length > 0 && <div className="text-xs text-red-400">Errors: {seedData.data.providers.errors.join(", ")}</div>}
            </div>
            <div>
              <div className="text-sm font-medium mb-1">Artifacts</div>
              {seedData.data.artifacts.seeded.length > 0 && <div className="text-xs text-emerald-400">Seeded: {seedData.data.artifacts.seeded.join(", ")}</div>}
              {seedData.data.artifacts.skipped.length > 0 && <div className="text-xs text-muted-foreground">Skipped: {seedData.data.artifacts.skipped.join(", ")}</div>}
              {seedData.data.artifacts.errors.length > 0 && <div className="text-xs text-red-400">Errors: {seedData.data.artifacts.errors.join(", ")}</div>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────

export default function LocalInfraPanel() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="artifacts">Model Artifacts</TabsTrigger>
          <TabsTrigger value="costs">Cost Analysis</TabsTrigger>
          <TabsTrigger value="fallbacks">Fallback Map</TabsTrigger>
          <TabsTrigger value="seed">Seed Data</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="endpoints"><EndpointsTab /></TabsContent>
        <TabsContent value="artifacts"><ArtifactsTab /></TabsContent>
        <TabsContent value="costs"><CostComparisonTab /></TabsContent>
        <TabsContent value="fallbacks"><FallbackMapTab /></TabsContent>
        <TabsContent value="seed"><SeedDataTab /></TabsContent>
      </Tabs>
    </div>
  );
}
