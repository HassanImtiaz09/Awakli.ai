/**
 * Model Routing Widget — Shows Smart Kling Model Router results
 * in the Pipeline Dashboard.
 *
 * Displays:
 *   - Tier allocation bar (visual breakdown of T1/T2/T3/T4)
 *   - Cost comparison (actual vs V3-Omni-only)
 *   - Per-panel routing breakdown table
 *   - Savings percentage badge
 */

import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { AwakliCard } from "./AwakliCard";
import { AwakliiBadge } from "./AwakliiBadge";
import { AwakliButton } from "./AwakliButton";
import {
  ChevronDown, ChevronUp, DollarSign, Zap, BarChart3,
  ArrowDownRight, Cpu, Eye, Sparkles, Info,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tier Colors & Labels ─────────────────────────────────────────────

const TIER_CONFIG: Record<number, { color: string; bg: string; label: string; description: string }> = {
  1: { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", label: "V3 Omni", description: "Lip sync critical" },
  2: { color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)", label: "V2.6", description: "High complexity" },
  3: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", label: "V2.1", description: "Medium complexity" },
  4: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)", label: "V1.6", description: "Simple/transition" },
};

// ─── Tier Allocation Bar ──────────────────────────────────────────────

function TierAllocationBar({ tierCounts, totalPanels }: { tierCounts: Record<number, number>; totalPanels: number }) {
  if (totalPanels === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Model Allocation</span>
        <span>{totalPanels} panels</span>
      </div>
      <div className="flex h-6 rounded-lg overflow-hidden border border-zinc-700/50">
        {[1, 2, 3, 4].map(tier => {
          const count = tierCounts[tier] || 0;
          const pct = (count / totalPanels) * 100;
          if (pct === 0) return null;
          const cfg = TIER_CONFIG[tier];
          return (
            <motion.div
              key={tier}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="flex items-center justify-center text-[10px] font-bold relative group"
              style={{ backgroundColor: cfg.bg, borderRight: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ color: cfg.color }}>{count > 0 ? `T${tier}` : ""}</span>
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 px-2 py-1 bg-zinc-800 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {cfg.label}: {count} panel{count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)
                <br />{cfg.description}
              </div>
            </motion.div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px]">
        {[1, 2, 3, 4].map(tier => {
          const count = tierCounts[tier] || 0;
          if (count === 0) return null;
          const cfg = TIER_CONFIG[tier];
          return (
            <div key={tier} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
              <span className="text-gray-400">{cfg.label}</span>
              <span className="text-gray-500">({count})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Cost Comparison Widget ───────────────────────────────────────────

function CostComparison({ actualCost, v3OmniCost, savings, savingsPercent }: {
  actualCost: number;
  v3OmniCost: number;
  savings: number;
  savingsPercent: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-zinc-800/50 rounded-lg p-3 text-center border border-zinc-700/30">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Actual Cost</p>
        <p className="text-lg font-bold text-cyan-400 font-mono">${actualCost.toFixed(2)}</p>
        <p className="text-[10px] text-gray-500">Smart routing</p>
      </div>
      <div className="bg-zinc-800/50 rounded-lg p-3 text-center border border-zinc-700/30">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">V3 Omni Only</p>
        <p className="text-lg font-bold text-gray-400 font-mono line-through">${v3OmniCost.toFixed(2)}</p>
        <p className="text-[10px] text-gray-500">Without routing</p>
      </div>
      <div className="bg-emerald-500/5 rounded-lg p-3 text-center border border-emerald-500/20">
        <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Saved</p>
        <p className="text-lg font-bold text-emerald-400 font-mono">${savings.toFixed(2)}</p>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <ArrowDownRight className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-bold">{savingsPercent.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── Per-Panel Breakdown Table ────────────────────────────────────────

function PanelBreakdownTable({ panels }: { panels: Array<{
  panelId: number | null;
  tier: number | null;
  model: string | null;
  actualCost: number | null;
  v3OmniCost: number | null;
  lipSyncMethod: string | null;
  userOverride: boolean;
}> }) {
  if (panels.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-700/50">
            <th className="text-left py-2 px-2 text-gray-500 font-medium">Panel</th>
            <th className="text-left py-2 px-2 text-gray-500 font-medium">Tier</th>
            <th className="text-left py-2 px-2 text-gray-500 font-medium">Model</th>
            <th className="text-left py-2 px-2 text-gray-500 font-medium">Lip Sync</th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">Cost</th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">V3 Cost</th>
            <th className="text-right py-2 px-2 text-gray-500 font-medium">Saved</th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p, i) => {
            const cfg = TIER_CONFIG[p.tier || 2];
            const saved = (p.v3OmniCost || 0) - (p.actualCost || 0);
            return (
              <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                <td className="py-2 px-2 text-gray-300">#{p.panelId}</td>
                <td className="py-2 px-2">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ color: cfg.color, backgroundColor: cfg.bg }}
                  >
                    T{p.tier}
                    {p.userOverride && (
                      <span className="text-amber-400 text-[8px]" title="User override">*</span>
                    )}
                  </span>
                </td>
                <td className="py-2 px-2 text-gray-400">{cfg.label}</td>
                <td className="py-2 px-2">
                  {p.lipSyncMethod === "native" ? (
                    <span className="text-cyan-400 flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> Native</span>
                  ) : p.lipSyncMethod === "post_sync" ? (
                    <span className="text-purple-400 flex items-center gap-0.5"><Zap className="w-3 h-3" /> Post-sync</span>
                  ) : (
                    <span className="text-gray-500">None</span>
                  )}
                </td>
                <td className="py-2 px-2 text-right text-gray-300 font-mono">${(p.actualCost || 0).toFixed(3)}</td>
                <td className="py-2 px-2 text-right text-gray-500 font-mono">${(p.v3OmniCost || 0).toFixed(3)}</td>
                <td className="py-2 px-2 text-right font-mono">
                  {saved > 0 ? (
                    <span className="text-emerald-400">-${saved.toFixed(3)}</span>
                  ) : (
                    <span className="text-gray-500">$0.000</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Widget ──────────────────────────────────────────────────────

interface ModelRoutingWidgetProps {
  pipelineRunId: number;
  compact?: boolean;
}

export function ModelRoutingWidget({ pipelineRunId, compact = false }: ModelRoutingWidgetProps) {
  const [expanded, setExpanded] = useState(false);

  const statsQuery = trpc.modelRouting.getStatsByRun.useQuery(
    { pipelineRunId },
    { enabled: !!pipelineRunId }
  );

  const costQuery = trpc.modelRouting.getCostComparison.useQuery(
    { pipelineRunId },
    { enabled: !!pipelineRunId && expanded }
  );

  const stat = statsQuery.data;

  if (!stat) {
    if (statsQuery.isLoading) {
      return (
        <AwakliCard className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <Cpu className="w-4 h-4 animate-pulse" />
            Loading model routing data...
          </div>
        </AwakliCard>
      );
    }
    return null; // No routing data for this run
  }

  if (compact) {
    // Compact mode: single line summary for inline use
    return (
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-cyan-400" />
          <span className="text-gray-400">Smart Router:</span>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(tier => {
            const count = stat.tierCounts[tier as keyof typeof stat.tierCounts] || 0;
            if (count === 0) return null;
            const cfg = TIER_CONFIG[tier];
            return (
              <span key={tier} className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                T{tier}:{count}
              </span>
            );
          })}
        </div>
        {stat.savingsPercent > 0 && (
          <AwakliiBadge variant="success">
            <ArrowDownRight className="w-3 h-3 mr-0.5" />
            {stat.savingsPercent.toFixed(0)}% saved
          </AwakliiBadge>
        )}
      </div>
    );
  }

  return (
    <AwakliCard className="overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-zinc-100">Smart Model Router</h3>
            <p className="text-[10px] text-zinc-500">
              {stat.totalPanels} panels routed across {[1, 2, 3, 4].filter(t => (stat.tierCounts[t as keyof typeof stat.tierCounts] || 0) > 0).length} tiers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {stat.savingsPercent > 0 && (
            <AwakliiBadge variant="success">
              <ArrowDownRight className="w-3 h-3 mr-0.5" />
              ${stat.savings.toFixed(2)} saved ({stat.savingsPercent.toFixed(0)}%)
            </AwakliiBadge>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-zinc-800/50 pt-4">
              {/* Tier Allocation Bar */}
              <TierAllocationBar
                tierCounts={stat.tierCounts as Record<number, number>}
                totalPanels={stat.totalPanels}
              />

              {/* Cost Comparison */}
              <CostComparison
                actualCost={stat.actualCost}
                v3OmniCost={stat.v3OmniCost}
                savings={stat.savings}
                savingsPercent={stat.savingsPercent}
              />

              {/* Per-Panel Breakdown */}
              {costQuery.data?.perPanel && costQuery.data.perPanel.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-400 font-medium">Per-Panel Breakdown</span>
                  </div>
                  <PanelBreakdownTable panels={costQuery.data.perPanel} />
                </div>
              )}

              {/* Info Note */}
              <div className="flex items-start gap-2 text-[10px] text-gray-500 bg-zinc-800/30 rounded-lg p-2">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  Smart routing uses deterministic rules (~40% of panels) and LLM classification (~$0.005/panel)
                  to assign each scene to the most cost-effective Kling model while preserving lip sync quality
                  where it matters most.
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AwakliCard>
  );
}
