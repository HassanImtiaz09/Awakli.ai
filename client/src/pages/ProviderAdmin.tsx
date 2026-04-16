/**
 * Provider Admin Dashboard — Prompt 16
 * Admin-only page for managing providers, API keys, circuit breakers, and viewing health.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity, Zap, Shield, AlertTriangle, Server, DollarSign,
  Clock, CheckCircle, XCircle, RotateCcw, ChevronRight,
  Video, Mic, Music, Image, ArrowLeft, Cpu,
} from "lucide-react";
import { Link } from "wouter";
import LocalInfraPanel from "./LocalInfraPanel";

const MODALITY_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="h-4 w-4" />,
  voice: <Mic className="h-4 w-4" />,
  music: <Music className="h-4 w-4" />,
  image: <Image className="h-4 w-4" />,
};

const TIER_COLORS: Record<string, string> = {
  budget: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  standard: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  premium: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  flagship: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const CIRCUIT_COLORS: Record<string, string> = {
  closed: "bg-emerald-500/20 text-emerald-300",
  open: "bg-red-500/20 text-red-300",
  half_open: "bg-amber-500/20 text-amber-300",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300",
  disabled: "bg-zinc-500/20 text-zinc-300",
  deprecated: "bg-red-500/20 text-red-300",
};

// ─── Global Dashboard Tab ──────────────────────────────────────────────
function GlobalDashboard() {
  const { data: dashboard, isLoading } = trpc.providerAdmin.getDashboard.useQuery();

  if (isLoading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!dashboard) return null;

  const totalActive = (dashboard.statusCounts as Record<string, number>)?.active ?? 0;
  const totalDisabled = (dashboard.statusCounts as Record<string, number>)?.disabled ?? 0;
  const circuitOpen = (dashboard.healthOverview as Record<string, number>)?.open ?? 0;
  const totalSpend = dashboard.spendSummary.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.spendUsd ?? 0), 0);
  const totalRequests = dashboard.spendSummary.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.requests ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Server className="h-4 w-4" /> Active Providers</div>
            <div className="text-2xl font-bold">{totalActive}</div>
            <div className="text-xs text-muted-foreground">{totalDisabled} disabled</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Shield className="h-4 w-4" /> Circuit Health</div>
            <div className="text-2xl font-bold">{circuitOpen > 0 ? <span className="text-red-400">{circuitOpen} open</span> : <span className="text-emerald-400">All OK</span>}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><DollarSign className="h-4 w-4" /> 24h Spend</div>
            <div className="text-2xl font-bold">${totalSpend.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Activity className="h-4 w-4" /> 24h Requests</div>
            <div className="text-2xl font-bold">{totalRequests}</div>
          </CardContent>
        </Card>
      </div>

      {/* Modality Breakdown */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3"><CardTitle className="text-lg">Modality Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(dashboard.modalityBreakdown as Record<string, number>).map(([mod, count]) => (
              <div key={mod} className="flex items-center gap-2 p-3 rounded-lg bg-background/50 border border-border/30">
                {MODALITY_ICONS[mod]} <span className="capitalize font-medium">{mod}</span>
                <span className="ml-auto text-muted-foreground">{count} active</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Spenders */}
      {dashboard.topSpenders.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-lg">Top Spenders (24h)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground border-b border-border/30">
                  <th className="text-left py-2 px-3">Provider</th>
                  <th className="text-right py-2 px-3">Requests</th>
                  <th className="text-right py-2 px-3">Cost</th>
                  <th className="text-right py-2 px-3">Avg Latency</th>
                </tr></thead>
                <tbody>
                  {dashboard.topSpenders.map((s: Record<string, unknown>, i: number) => (
                    <tr key={i} className="border-b border-border/20">
                      <td className="py-2 px-3 font-mono text-xs">{String(s.providerId)}</td>
                      <td className="py-2 px-3 text-right">{Number(s.requestCount)}</td>
                      <td className="py-2 px-3 text-right">${Number(s.totalCost ?? 0).toFixed(4)}</td>
                      <td className="py-2 px-3 text-right">{Number(s.avgLatency ?? 0).toFixed(0)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Critical Events */}
      {dashboard.criticalEvents.length > 0 && (
        <Card className="bg-card/50 border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-400" /> Critical Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboard.criticalEvents.map((e: Record<string, unknown>) => (
                <div key={String(e.id)} className="flex items-start gap-3 p-2 rounded bg-red-500/5 border border-red-500/10">
                  <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium">{String(e.providerId)} — {String(e.eventType)}</div>
                    <div className="text-xs text-muted-foreground">{e.createdAt ? new Date(e.createdAt as string).toLocaleString() : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Provider List Tab ─────────────────────────────────────────────────
function ProviderList() {
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const { data: providersList, isLoading } = trpc.providerAdmin.listProviders.useQuery(
    modalityFilter !== "all" ? { modality: modalityFilter as "video" | "voice" | "music" | "image" } : undefined
  );
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  if (selectedProvider) return <ProviderDetail providerId={selectedProvider} onBack={() => setSelectedProvider(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={modalityFilter} onValueChange={setModalityFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All modalities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modalities</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
            <SelectItem value="music">Music</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid gap-3">
          {providersList?.map((p: Record<string, unknown>) => {
            const health = p.health as Record<string, unknown> | null;
            return (
              <Card key={String(p.id)} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors cursor-pointer" onClick={() => setSelectedProvider(String(p.id))}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {MODALITY_ICONS[String(p.modality)] ?? <Zap className="h-4 w-4" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{String(p.displayName)}</span>
                        <Badge variant="outline" className={`text-[10px] ${TIER_COLORS[String(p.tier)] ?? ""}`}>{String(p.tier)}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[String(p.status)] ?? ""}`}>{String(p.status)}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{String(p.vendor)} · {String(p.modality)}</div>
                    </div>
                    {health && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${CIRCUIT_COLORS[String(health.circuitState)] ?? ""}`}>
                          {String(health.circuitState)}
                        </Badge>
                        {health.successRate != null && (
                          <span className="text-xs text-muted-foreground">{(Number(health.successRate) * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Provider Detail ───────────────────────────────────────────────────
function ProviderDetail({ providerId, onBack }: { providerId: string; onBack: () => void }) {
  const utils = trpc.useUtils();
  const { data: provider, isLoading } = trpc.providerAdmin.getProvider.useQuery({ providerId });
  const toggleStatus = trpc.providerAdmin.toggleProvider.useMutation({
    onSuccess: () => { utils.providerAdmin.getProvider.invalidate({ providerId }); utils.providerAdmin.listProviders.invalidate(); toast.success("Status updated"); },
  });
  const resetCircuit = trpc.providerAdmin.resetCircuitBreaker.useMutation({
    onSuccess: () => { utils.providerAdmin.getProvider.invalidate({ providerId }); toast.success("Circuit breaker reset"); },
  });
  const toggleKey = trpc.providerAdmin.toggleApiKey.useMutation({
    onSuccess: () => { utils.providerAdmin.getProvider.invalidate({ providerId }); toast.success("API key toggled"); },
  });

  if (isLoading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!provider) return <div className="text-center py-12 text-muted-foreground">Provider not found</div>;

  const health = provider.health as Record<string, unknown> | null;
  const stats = provider.stats24h as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1"><ArrowLeft className="h-4 w-4" /> Back to list</Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {MODALITY_ICONS[String(provider.modality)]} {String(provider.displayName)}
          </h2>
          <p className="text-muted-foreground mt-1">{String(provider.vendor)} · {String(provider.modality)} · {String(provider.tier)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={STATUS_COLORS[String(provider.status)] ?? ""}>{String(provider.status)}</Badge>
          {provider.status === "active" ? (
            <Button variant="outline" size="sm" onClick={() => toggleStatus.mutate({ providerId, status: "disabled" })}>Disable</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => toggleStatus.mutate({ providerId, status: "active" })}>Enable</Button>
          )}
        </div>
      </div>

      {/* Stats + Health */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">24h Requests</div>
          <div className="text-xl font-bold">{Number(stats?.total ?? 0)}</div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Success Rate</div>
          <div className="text-xl font-bold">{Number(stats?.total) > 0 ? ((Number(stats?.succeeded ?? 0) / Number(stats?.total)) * 100).toFixed(1) : "—"}%</div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Avg Latency</div>
          <div className="text-xl font-bold">{Number(stats?.avgLatency ?? 0).toFixed(0)}ms</div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">24h Cost</div>
          <div className="text-xl font-bold">${Number(stats?.totalCostUsd ?? 0).toFixed(4)}</div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border/50"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">Circuit <Shield className="h-3 w-3" /></div>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className={CIRCUIT_COLORS[String(health?.circuitState ?? "closed")] ?? ""}>{String(health?.circuitState ?? "closed")}</Badge>
            {health?.circuitState !== "closed" && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => resetCircuit.mutate({ providerId })}>
                <RotateCcw className="h-3 w-3 mr-1" /> Reset
              </Button>
            )}
          </div>
        </CardContent></Card>
      </div>

      {/* API Keys */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3"><CardTitle className="text-lg">API Keys</CardTitle><CardDescription>Manage API keys for this provider</CardDescription></CardHeader>
        <CardContent>
          {provider.apiKeys.length === 0 ? (
            <p className="text-muted-foreground text-sm">No API keys configured</p>
          ) : (
            <div className="space-y-2">
              {provider.apiKeys.map((key: Record<string, unknown>) => (
                <div key={Number(key.id)} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{String(key.keyLabel)}</div>
                    <div className="text-xs text-muted-foreground">RPM: {Number(key.rateLimitRpm)} · Cap: {key.dailySpendCapUsd ? `$${key.dailySpendCapUsd}` : "None"}</div>
                  </div>
                  <Badge variant="outline" className={Number(key.isActive) ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-300"}>
                    {Number(key.isActive) ? "Active" : "Inactive"}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => toggleKey.mutate({ keyId: Number(key.id), isActive: !Number(key.isActive) })}>
                    {Number(key.isActive) ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      {provider.events.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3"><CardTitle className="text-lg">Recent Events</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {provider.events.map((e: Record<string, unknown>) => (
                <div key={Number(e.id)} className="flex items-center gap-2 py-1.5 text-sm border-b border-border/20 last:border-0">
                  {String(e.severity) === "critical" ? <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" /> :
                   String(e.severity) === "error" ? <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" /> :
                   String(e.severity) === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" /> :
                   <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                  <span className="font-mono text-xs">{String(e.eventType)}</span>
                  <span className="text-muted-foreground text-xs ml-auto">{e.createdAt ? new Date(e.createdAt as string).toLocaleString() : ""}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Request History Tab ───────────────────────────────────────────────
function RequestHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.providerAdmin.getRequestHistory.useQuery({ page, limit: 30 });

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-2 px-3">UID</th>
                <th className="text-left py-2 px-3">Provider</th>
                <th className="text-left py-2 px-3">Type</th>
                <th className="text-left py-2 px-3">Status</th>
                <th className="text-right py-2 px-3">Cost</th>
                <th className="text-right py-2 px-3">Latency</th>
                <th className="text-right py-2 px-3">Time</th>
              </tr></thead>
              <tbody>
                {data?.requests.map((r: Record<string, unknown>) => (
                  <tr key={Number(r.id)} className="border-b border-border/20">
                    <td className="py-2 px-3 font-mono text-xs">{String(r.requestUid).slice(0, 8)}</td>
                    <td className="py-2 px-3 text-xs">{String(r.providerId)}</td>
                    <td className="py-2 px-3"><Badge variant="outline" className="text-[10px]">{String(r.requestType)}</Badge></td>
                    <td className="py-2 px-3">
                      <Badge variant="outline" className={`text-[10px] ${
                        String(r.status) === "succeeded" ? "bg-emerald-500/20 text-emerald-300" :
                        String(r.status) === "failed" ? "bg-red-500/20 text-red-300" :
                        "bg-amber-500/20 text-amber-300"
                      }`}>{String(r.status)}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-xs">${Number(r.actualCostUsd ?? 0).toFixed(4)}</td>
                    <td className="py-2 px-3 text-right text-xs">{r.latencyMs ? `${r.latencyMs}ms` : "—"}</td>
                    <td className="py-2 px-3 text-right text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt as string).toLocaleTimeString() : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground py-1">Page {page}</span>
            <Button variant="outline" size="sm" disabled={(data?.requests.length ?? 0) < 30} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────
export default function ProviderAdmin() {
  const { user } = useAuth();

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md"><CardContent className="p-6 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground mb-4">This page is restricted to administrators.</p>
          <Link href="/"><Button>Go Home</Button></Link>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Button></Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6 text-primary" /> Provider Router</h1>
            <p className="text-sm text-muted-foreground">Manage AI providers, API keys, circuit breakers, and health</p>
          </div>
        </div>

        <Tabs defaultValue="dashboard" className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="requests">Request Log</TabsTrigger>
            <TabsTrigger value="local-infra" className="gap-1"><Cpu className="h-3.5 w-3.5" /> Local GPU</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><GlobalDashboard /></TabsContent>
          <TabsContent value="providers"><ProviderList /></TabsContent>
          <TabsContent value="requests"><RequestHistory /></TabsContent>
          <TabsContent value="local-infra"><LocalInfraPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
