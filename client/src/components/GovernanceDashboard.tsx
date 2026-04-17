import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw,
  Users, BarChart3, Activity, Sparkles, ChevronDown, ChevronUp,
  Eye, Send, Timer
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────

interface GovernanceDashboardProps {
  compact?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function getStatusBadge(status: string) {
  switch (status) {
    case "approved": return { color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: CheckCircle };
    case "rejected": return { color: "bg-red-500/20 text-red-300 border-red-500/30", icon: XCircle };
    case "pending": return { color: "bg-amber-500/20 text-amber-300 border-amber-500/30", icon: Clock };
    case "needs_revision": return { color: "bg-orange-500/20 text-orange-300 border-orange-500/30", icon: AlertTriangle };
    default: return { color: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30", icon: Eye };
  }
}

function getStalenessColor(score: number): string {
  if (score < 0.4) return "text-emerald-400";
  if (score < 0.7) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ─────────────────────────────────────────────────────────

export function GovernanceDashboard({ compact = false }: GovernanceDashboardProps) {

  const [expanded, setExpanded] = useState(!compact);
  const [reviewComment, setReviewComment] = useState("");
  const [selectedSampleId, setSelectedSampleId] = useState<number | null>(null);

  const governanceQuery = trpc.tierSampler.getGovernanceStats.useQuery();
  const staleQuery = trpc.tierSampler.getStaleSamples.useQuery({ threshold: 0.7 });
  const abMetricsQuery = trpc.tierSampler.getABMetrics.useQuery();
  const pipelineStatsQuery = trpc.tierSampler.getPipelineStats.useQuery();

  const submitReview = trpc.tierSampler.submitGovernanceReview.useMutation({
    onSuccess: () => {
      toast.success("Governance review submitted.");
      governanceQuery.refetch();
    },
  });

  const publishSample = trpc.tierSampler.publishSample.useMutation({
    onSuccess: (data) => {
      if (data.published) {
        toast.success(`Sample #${data.sampleId} is now live.`);
      } else {
        toast.error(data.error ?? "Publish failed");
      }
    },
  });

  return (
    <Card className="bg-zinc-900/50 border-zinc-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-400" />
              Governance Dashboard
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Sample review, staleness monitoring, and A/B test results
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {staleQuery.data && staleQuery.data.flaggedCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {staleQuery.data.flaggedCount} stale
              </Badge>
            )}
            {compact && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-zinc-400">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent>
          <Tabs defaultValue="reviews" className="space-y-4">
            <TabsList className="bg-zinc-800/50 border border-zinc-700/30">
              <TabsTrigger value="reviews" className="text-xs">
                <Eye className="h-3 w-3 mr-1" /> Reviews
              </TabsTrigger>
              <TabsTrigger value="staleness" className="text-xs">
                <Timer className="h-3 w-3 mr-1" /> Staleness
              </TabsTrigger>
              <TabsTrigger value="ab-test" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" /> A/B Test
              </TabsTrigger>
              <TabsTrigger value="stats" className="text-xs">
                <Activity className="h-3 w-3 mr-1" /> Stats
              </TabsTrigger>
            </TabsList>

            {/* Reviews Tab */}
            <TabsContent value="reviews" className="space-y-3">
              {governanceQuery.isLoading ? (
                <div className="text-center py-4 text-zinc-400 text-sm">Loading reviews...</div>
              ) : !governanceQuery.data?.totalReviews ? (
                <div className="text-center py-6">
                  <Shield className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-sm text-zinc-400">No pending reviews</p>
                  <p className="text-xs text-zinc-500 mt-1">Submit a sample for governance review to get started.</p>
                </div>
              ) : (
                (["approved", "rejected", "pending", "vetoed", "escalated"] as const).filter(status => ((governanceQuery.data as unknown as Record<string, number>)?.[status] ?? 0) > 0).map((status) => {
                  const count = (governanceQuery.data as unknown as Record<string, number>)?.[status] ?? 0;
                  const statusBadge = getStatusBadge(status);
                  const StatusIcon = statusBadge.icon;
                  return (
                    <div key={status} className="flex items-center justify-between p-2 rounded bg-zinc-800/30 border border-zinc-700/20">
                      <div className="flex items-center gap-2">
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm text-zinc-300 capitalize">{status.replace(/_/g, " ")}</span>
                      </div>
                      <Badge className={statusBadge.color}>{count as number}</Badge>
                    </div>
                  );
                })
              )}

              {/* Submit review form */}
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <h4 className="text-xs font-medium text-zinc-300">Submit Review</h4>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Sample ID"
                    className="w-24 bg-zinc-800/50 border-zinc-700 text-xs"
                    value={selectedSampleId ?? ""}
                    onChange={(e) => setSelectedSampleId(e.target.value ? parseInt(e.target.value) : null)}
                  />
                  <Input
                    placeholder="Comment (optional)"
                    className="flex-1 bg-zinc-800/50 border-zinc-700 text-xs"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={!selectedSampleId || submitReview.isPending}
                    onClick={() => {
                      if (selectedSampleId) {
                        submitReview.mutate({ sampleId: selectedSampleId, archetypeId: "V1", tier: 3, provider: "midjourney", genreVariant: "shonen", storageUrl: "" });
                        setReviewComment("");
                        setSelectedSampleId(null);
                      }
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-xs"
                  >
                    Submit
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Staleness Tab */}
            <TabsContent value="staleness" className="space-y-3">
              {staleQuery.isLoading ? (
                <div className="text-center py-4 text-zinc-400 text-sm">Checking staleness...</div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded bg-zinc-800/50">
                      <span className="text-[10px] text-zinc-400">Total Active</span>
                      <p className="text-lg font-bold text-white">{staleQuery.data?.totalSamples ?? 0}</p>
                    </div>
                    <div className="p-2 rounded bg-zinc-800/50">
                      <span className="text-[10px] text-zinc-400">Flagged</span>
                      <p className="text-lg font-bold text-amber-400">{staleQuery.data?.flaggedCount ?? 0}</p>
                    </div>
                    <div className="p-2 rounded bg-zinc-800/50">
                      <span className="text-[10px] text-zinc-400">Outdated</span>
                      <p className="text-lg font-bold text-red-400">{staleQuery.data?.outdatedCount ?? 0}</p>
                    </div>
                  </div>

                  {staleQuery.data?.flaggedSamples?.length ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-zinc-300">Flagged Samples</h4>
                      {staleQuery.data.flaggedSamples.map((s) => (
                        <div key={s.sampleId} className="flex items-center gap-3 p-2 rounded bg-zinc-800/30 border border-zinc-700/20">
                          <span className="text-xs text-zinc-300">#{s.sampleId}</span>
                          <Progress value={s.stalenessScore * 100} className="flex-1 h-2" />
                          <span className={`text-xs font-mono ${getStalenessColor(s.stalenessScore)}`}>
                            {(s.stalenessScore * 100).toFixed(0)}%
                          </span>
                          <span className="text-[10px] text-zinc-500">{s.daysSincePublication}d old</span>
                          {s.showOutdatedBadge && (
                            <Badge className="bg-red-500/20 text-red-300 text-[9px]">Outdated</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle className="h-6 w-6 text-emerald-400 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400">All samples are fresh</p>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            {/* A/B Test Tab */}
            <TabsContent value="ab-test" className="space-y-3">
              {abMetricsQuery.isLoading ? (
                <div className="text-center py-4 text-zinc-400 text-sm">Loading A/B metrics...</div>
              ) : abMetricsQuery.data ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="bg-zinc-800/30 border-zinc-700/30">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-zinc-500/20 text-zinc-300 text-[10px]">Control</Badge>
                          <span className="text-xs text-zinc-400">{abMetricsQuery.data.controlCount} users</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Dissatisfaction</span>
                            <span className="text-zinc-300">
                              {((abMetricsQuery.data.control?.badReviewRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Support Rate</span>
                            <span className="text-zinc-300">
                              {((abMetricsQuery.data.control?.supportTicketRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Regen Rate</span>
                            <span className="text-zinc-300">
                              {((abMetricsQuery.data.control?.regenerationRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-violet-900/20 border-violet-700/30">
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-violet-500/20 text-violet-300 text-[10px]">Sampler</Badge>
                          <span className="text-xs text-zinc-400">{abMetricsQuery.data.samplerCount} users</span>
                        </div>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Dissatisfaction</span>
                            <span className="text-violet-300">
                              {((abMetricsQuery.data.sampler?.badReviewRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Support Rate</span>
                            <span className="text-violet-300">
                              {((abMetricsQuery.data.sampler?.supportTicketRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Regen Rate</span>
                            <span className="text-violet-300">
                              {((abMetricsQuery.data.sampler?.regenerationRate ?? 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Lift metrics */}
                  {abMetricsQuery.data.primaryMetricDeltas && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-zinc-300">Sampler Lift (Deltas)</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(abMetricsQuery.data.primaryMetricDeltas).map(([key, val]) => {
                          const value = val as number;
                          const isPositive = value > 0;
                          return (
                            <div key={key} className="flex items-center justify-between p-2 rounded bg-zinc-800/30 text-xs">
                              <span className="text-zinc-400">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                              <span className={isPositive ? "text-emerald-400" : "text-red-400"}>
                                {isPositive ? "+" : ""}{(value * 100).toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {abMetricsQuery.data.recommendation && (
                    <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                      <div className="flex items-start gap-2">
                        <Sparkles className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-violet-300">Recommendation</p>
                          <p className="text-xs text-zinc-400 mt-0.5">{abMetricsQuery.data.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-4 text-zinc-400 text-sm">No A/B test data available</div>
              )}
            </TabsContent>

            {/* Stats Tab */}
            <TabsContent value="stats" className="space-y-3">
              {pipelineStatsQuery.isLoading ? (
                <div className="text-center py-4 text-zinc-400 text-sm">Loading stats...</div>
              ) : pipelineStatsQuery.data ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Active Samples</span>
                    <p className="text-xl font-bold text-white">{pipelineStatsQuery.data.activeSamples}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Anchors</span>
                    <p className="text-xl font-bold text-violet-400">{pipelineStatsQuery.data.totalAnchors}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">ESG Scores</span>
                    <p className="text-xl font-bold text-amber-400">{pipelineStatsQuery.data.totalESGScores}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">A/B Assignments</span>
                    <p className="text-xl font-bold text-blue-400">{pipelineStatsQuery.data.totalABAssignments}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Avg ESG</span>
                    <p className={`text-xl font-bold ${
                      pipelineStatsQuery.data.avgESG <= 0.5 ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {pipelineStatsQuery.data.avgESG.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/30 text-center">
                    <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Gov Reviews</span>
                    <p className="text-xl font-bold text-rose-400">{pipelineStatsQuery.data.governanceReviews}</p>
                  </div>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
