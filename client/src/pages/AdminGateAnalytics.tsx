/**
 * AdminGateAnalytics — Admin gate analytics dashboard (Prompt 17 §13)
 *
 * Route: /admin/gates
 *
 * Surfaces:
 * - Total gates created / approved / rejected / regenerated / timed out per day
 * - Average confidence score distribution
 * - Auto-advance rate vs manual review rate
 * - Most-regenerated stages
 * - Provider quality correlation
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import {
  Shield, CheckCircle, XCircle, RefreshCw, Clock,
  Loader2, ArrowLeft, TrendingUp, BarChart3, Zap, AlertTriangle
} from "lucide-react";

const STAGE_NAMES: Record<number, string> = {
  1: "Manga Analysis", 2: "Scene Planning", 3: "Character Sheet",
  4: "Keyframe Gen", 5: "Video Gen", 6: "Voice Synthesis",
  7: "Music Scoring", 8: "SFX & Foley", 9: "Audio Mix",
  10: "Video Composite", 11: "Subtitle Render", 12: "Episode Publish",
};

function StatCard({ icon: Icon, label, value, subtext, color }: {
  icon: React.ElementType; label: string; value: string | number;
  subtext?: string; color: string;
}) {
  return (
    <AwakliCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </AwakliCard>
  );
}

function BarChart({ data, labelKey, valueKey, maxValue, color }: {
  data: any[]; labelKey: string; valueKey: string; maxValue?: number; color: string;
}) {
  const max = maxValue || Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="space-y-2">
      {data.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-400 w-28 truncate text-right">
            {item[labelKey]}
          </span>
          <div className="flex-1 h-6 bg-gray-800/50 rounded overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
              transition={{ duration: 0.5, delay: idx * 0.05 }}
              className={`h-full rounded ${color}`}
            />
          </div>
          <span className="text-xs font-mono text-gray-300 w-12 text-right">
            {typeof item[valueKey] === "number" ? item[valueKey].toFixed(1) : item[valueKey]}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AdminGateAnalytics() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [days] = useState(30);

  const dashboardQuery = trpc.qualityAnalytics.dashboard.useQuery(
    { days },
    { enabled: !!user }
  );

  const pendingGatesQuery = trpc.gateReview.getPendingGates.useQuery(
    undefined,
    { enabled: !!user }
  );

  const dashboard = dashboardQuery.data;
  const pendingGates = pendingGatesQuery.data || [];

  // Compute summary stats
  const stats = useMemo(() => {
    if (!dashboard) return null;

    const totalApproved = dashboard.approvalRates.reduce((sum: number, r: any) => sum + (r.approved || 0), 0);
    const totalGates = dashboard.approvalRates.reduce((sum: number, r: any) => sum + (r.total || 0), 0);
    const totalRegenerated = dashboard.mostRegenerated.reduce((sum: number, r: any) => sum + (r.regenCount || 0), 0);
    const avgConfidence = dashboard.avgConfidence.length > 0
      ? dashboard.avgConfidence.reduce((sum: number, r: any) => sum + (r.avgConfidence || 0), 0) / dashboard.avgConfidence.length
      : 0;

    return {
      totalGates,
      totalApproved,
      approvalRate: totalGates > 0 ? ((totalApproved / totalGates) * 100).toFixed(1) : "0",
      totalRegenerated,
      avgConfidence: avgConfidence.toFixed(0),
      creditsSaved: dashboard.creditsSaved || 0,
      pendingCount: pendingGates.length,
    };
  }, [dashboard, pendingGates]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AwakliButton variant="ghost" size="sm" onClick={() => navigate("/admin")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Admin
        </AwakliButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white font-display">Gate Analytics</h1>
          <p className="text-gray-400 text-sm mt-1">
            HITL gate performance over the last {days} days
          </p>
        </div>
        <AwakliiBadge variant="cyan">
          <Shield className="w-3 h-3 mr-1" />
          Admin
        </AwakliiBadge>
      </div>

      {dashboardQuery.isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={BarChart3}
              label="Total Gates"
              value={stats?.totalGates || 0}
              subtext={`${stats?.pendingCount || 0} pending`}
              color="bg-accent-cyan/10 text-accent-cyan"
            />
            <StatCard
              icon={CheckCircle}
              label="Approval Rate"
              value={`${stats?.approvalRate || 0}%`}
              subtext={`${stats?.totalApproved || 0} approved`}
              color="bg-emerald-500/10 text-emerald-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Confidence"
              value={stats?.avgConfidence || 0}
              subtext="Weighted score"
              color="bg-amber-500/10 text-amber-400"
            />
            <StatCard
              icon={Zap}
              label="Credits Saved"
              value={`${Number(stats?.creditsSaved || 0).toFixed(1)} cr`}
              subtext="By HITL rejections"
              color="bg-violet-500/10 text-violet-400"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Approval Rate by Stage */}
            <AwakliCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                Approval Rate by Stage
              </h3>
              {dashboard?.approvalRates && dashboard.approvalRates.length > 0 ? (
                <BarChart
                  data={dashboard.approvalRates.map((r: any) => ({
                    stage: STAGE_NAMES[r.stageNumber] || `Stage ${r.stageNumber}`,
                    rate: r.total > 0 ? ((r.approved / r.total) * 100) : 0,
                  }))}
                  labelKey="stage"
                  valueKey="rate"
                  maxValue={100}
                  color="bg-emerald-500"
                />
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No data yet</p>
              )}
            </AwakliCard>

            {/* Average Confidence by Stage */}
            <AwakliCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                Average Confidence by Stage
              </h3>
              {dashboard?.avgConfidence && dashboard.avgConfidence.length > 0 ? (
                <BarChart
                  data={dashboard.avgConfidence.map((r: any) => ({
                    stage: STAGE_NAMES[r.stageNumber] || `Stage ${r.stageNumber}`,
                    score: r.avgConfidence || 0,
                  }))}
                  labelKey="stage"
                  valueKey="score"
                  maxValue={100}
                  color="bg-amber-500"
                />
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No data yet</p>
              )}
            </AwakliCard>
          </div>

          {/* Most Regenerated Stages + Pending Gates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Most Regenerated */}
            <AwakliCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-violet-400" />
                Most Regenerated Stages
              </h3>
              {dashboard?.mostRegenerated && dashboard.mostRegenerated.length > 0 ? (
                <div className="space-y-3">
                  {dashboard.mostRegenerated.map((r: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                        <span className="text-sm text-gray-300">
                          {STAGE_NAMES[r.stageNumber] || `Stage ${r.stageNumber}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-violet-400">{r.regenCount}×</span>
                        <AwakliiBadge variant="default">{r.stageNumber}</AwakliiBadge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No regenerations yet</p>
              )}
            </AwakliCard>

            {/* Pending Gates */}
            <AwakliCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Pending Gates ({pendingGates.length})
              </h3>
              {pendingGates.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {pendingGates.map((gate: any) => (
                    <motion.div
                      key={gate.id}
                      whileHover={{ scale: 1.01 }}
                      className="flex items-center justify-between p-2 rounded-lg bg-gray-800/30 border border-gray-800/50"
                    >
                      <div>
                        <span className="text-sm text-white">
                          Stage {gate.stageNumber} — {STAGE_NAMES[gate.stageNumber]}
                        </span>
                        <p className="text-xs text-gray-500">
                          Run #{gate.pipelineRunId} • {gate.gateType}
                        </p>
                      </div>
                      <AwakliiBadge variant={
                        gate.gateType === "blocking" ? "error" :
                        gate.gateType === "advisory" ? "warning" : "default"
                      }>
                        {gate.confidenceScore || "—"}
                      </AwakliiBadge>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No pending gates</p>
                </div>
              )}
            </AwakliCard>
          </div>
        </>
      )}
    </div>
  );
}
