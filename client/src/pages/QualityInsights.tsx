/**
 * QualityInsights — Creator quality insights tab (Prompt 17 §12.3)
 *
 * Route: /studio/quality-insights
 *
 * Shows:
 * - Approval rate per stage (% approved on first attempt) over 30 days
 * - Average confidence score per stage
 * - Credits saved by HITL (rejected downstream stages)
 * - Most-regenerated stages (helps identify prompting issues)
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
  Shield, CheckCircle, RefreshCw, Zap,
  Loader2, ArrowLeft, TrendingUp, Lightbulb, Target
} from "lucide-react";

const STAGE_NAMES: Record<number, string> = {
  1: "Manga Analysis", 2: "Scene Planning", 3: "Character Sheet",
  4: "Keyframe Gen", 5: "Video Gen", 6: "Voice Synthesis",
  7: "Music Scoring", 8: "SFX & Foley", 9: "Audio Mix",
  10: "Video Composite", 11: "Subtitle Render", 12: "Episode Publish",
};

function InsightCard({ icon: Icon, title, value, description, color }: {
  icon: React.ElementType; title: string; value: string | number;
  description: string; color: string;
}) {
  return (
    <AwakliCard className="p-5">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
          <p className="text-xs text-gray-400 mt-2">{description}</p>
        </div>
      </div>
    </AwakliCard>
  );
}

export default function QualityInsights() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [days] = useState(30);

  const dashboardQuery = trpc.qualityAnalytics.dashboard.useQuery(
    { days },
    { enabled: !!user }
  );

  const dashboard = dashboardQuery.data;

  const insights = useMemo(() => {
    if (!dashboard) return null;

    const totalApproved = dashboard.approvalRates.reduce((sum: number, r: any) => sum + (r.approved || 0), 0);
    const totalGates = dashboard.approvalRates.reduce((sum: number, r: any) => sum + (r.total || 0), 0);
    const overallApprovalRate = totalGates > 0 ? ((totalApproved / totalGates) * 100) : 0;

    const avgConfidence = dashboard.avgConfidence.length > 0
      ? dashboard.avgConfidence.reduce((sum: number, r: any) => sum + (r.avgConfidence || 0), 0) / dashboard.avgConfidence.length
      : 0;

    // Find the weakest stage (lowest approval rate)
    const weakestStage = dashboard.approvalRates.reduce((worst: any, r: any) => {
      const rate = r.total > 0 ? (r.approved / r.total) : 1;
      if (!worst || rate < worst.rate) return { ...r, rate };
      return worst;
    }, null);

    // Find the strongest stage
    const strongestStage = dashboard.approvalRates.reduce((best: any, r: any) => {
      const rate = r.total > 0 ? (r.approved / r.total) : 0;
      if (!best || rate > best.rate) return { ...r, rate };
      return best;
    }, null);

    return {
      overallApprovalRate: overallApprovalRate.toFixed(1),
      avgConfidence: avgConfidence.toFixed(0),
      creditsSaved: Number(dashboard.creditsSaved || 0).toFixed(1),
      totalRegenerated: dashboard.mostRegenerated.reduce((sum: number, r: any) => sum + (r.regenCount || 0), 0),
      weakestStage,
      strongestStage,
    };
  }, [dashboard]);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <AwakliButton variant="ghost" size="sm" onClick={() => navigate("/studio")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Studio
        </AwakliButton>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white font-display">Quality Insights</h1>
          <p className="text-gray-400 text-sm mt-1">
            Your pipeline quality metrics over the last {days} days
          </p>
        </div>
      </div>

      {dashboardQuery.isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InsightCard
              icon={Target}
              title="First-Attempt Approval"
              value={`${insights?.overallApprovalRate || 0}%`}
              description="Percentage of gates approved on the first attempt without regeneration"
              color="bg-emerald-500/10 text-emerald-400"
            />
            <InsightCard
              icon={Shield}
              title="Average Confidence"
              value={insights?.avgConfidence || "—"}
              description="Average AI confidence score across all your pipeline stages"
              color="bg-amber-500/10 text-amber-400"
            />
            <InsightCard
              icon={Zap}
              title="Credits Saved"
              value={`${insights?.creditsSaved || 0} cr`}
              description="Credits saved by rejecting stages early before downstream processing"
              color="bg-violet-500/10 text-violet-400"
            />
            <InsightCard
              icon={RefreshCw}
              title="Total Regenerations"
              value={insights?.totalRegenerated || 0}
              description="Number of times you requested a stage to be regenerated"
              color="bg-accent-pink/10 text-accent-pink"
            />
          </div>

          {/* Actionable Insights */}
          <AwakliCard className="p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              Actionable Insights
            </h3>
            <div className="space-y-3">
              {insights?.weakestStage && insights.weakestStage.total > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                  <div className="w-6 h-6 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-red-400">!</span>
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">
                      Weakest stage: {STAGE_NAMES[insights.weakestStage.stageNumber]}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Only {(insights.weakestStage.rate * 100).toFixed(0)}% approval rate.
                      Consider refining your prompts or character references for this stage.
                    </p>
                  </div>
                </div>
              )}

              {insights?.strongestStage && insights.strongestStage.total > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">
                      Strongest stage: {STAGE_NAMES[insights.strongestStage.stageNumber]}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {(insights.strongestStage.rate * 100).toFixed(0)}% approval rate.
                      This stage consistently produces quality results.
                    </p>
                  </div>
                </div>
              )}

              {Number(insights?.creditsSaved || 0) > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                  <div className="w-6 h-6 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">
                      HITL saved you {insights?.creditsSaved} credits
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      By catching issues early, you avoided spending credits on downstream stages
                      that would have needed to be redone.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </AwakliCard>

          {/* Stage-by-Stage Breakdown */}
          <AwakliCard className="p-5">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent-cyan" />
              Stage-by-Stage Performance
            </h3>
            {dashboard?.approvalRates && dashboard.approvalRates.length > 0 ? (
              <div className="space-y-2">
                {dashboard.approvalRates.map((r: any) => {
                  const rate = r.total > 0 ? ((r.approved / r.total) * 100) : 0;
                  const confidence = dashboard.avgConfidence.find((c: any) => c.stageNumber === r.stageNumber);
                  const regenCount = dashboard.mostRegenerated.find((m: any) => m.stageNumber === r.stageNumber);

                  return (
                    <div key={r.stageNumber} className="flex items-center gap-3 py-2 border-b border-gray-800/30 last:border-0">
                      <span className="text-xs text-gray-500 w-6 text-right">{r.stageNumber}</span>
                      <span className="text-sm text-gray-300 w-32 truncate">
                        {STAGE_NAMES[r.stageNumber]}
                      </span>

                      {/* Approval bar */}
                      <div className="flex-1 h-4 bg-gray-800/50 rounded overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${rate}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full rounded ${
                            rate >= 85 ? "bg-emerald-500" :
                            rate >= 60 ? "bg-amber-500" :
                            "bg-red-500"
                          }`}
                        />
                      </div>

                      <span className="text-xs font-mono text-gray-300 w-12 text-right">
                        {rate.toFixed(0)}%
                      </span>

                      {/* Confidence */}
                      <AwakliiBadge variant={
                        (confidence?.avgConfidence || 0) >= 85 ? "success" :
                        (confidence?.avgConfidence || 0) >= 60 ? "warning" : "error"
                      }>
                        {confidence?.avgConfidence?.toFixed(0) || "—"}
                      </AwakliiBadge>

                      {/* Regen count */}
                      {regenCount && regenCount.regenCount > 0 && (
                        <span className="text-xs text-violet-400">
                          <RefreshCw className="w-3 h-3 inline mr-0.5" />
                          {regenCount.regenCount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">
                No pipeline data yet. Run your first episode to see insights.
              </p>
            )}
          </AwakliCard>

          {/* Most Regenerated */}
          {dashboard?.mostRegenerated && dashboard.mostRegenerated.length > 0 && (
            <AwakliCard className="p-5">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-violet-400" />
                Most Regenerated Stages
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                These stages needed the most regenerations. Consider improving your prompts or references for these.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {dashboard.mostRegenerated.slice(0, 6).map((r: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg bg-gray-800/30 border border-gray-800/50 text-center">
                    <p className="text-2xl font-bold text-violet-400">{r.regenCount}×</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {STAGE_NAMES[r.stageNumber] || `Stage ${r.stageNumber}`}
                    </p>
                  </div>
                ))}
              </div>
            </AwakliCard>
          )}
        </>
      )}
    </div>
  );
}
