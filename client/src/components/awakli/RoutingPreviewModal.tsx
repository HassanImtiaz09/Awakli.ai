/**
 * RoutingPreviewModal — Batch classification preview for all panels in an episode.
 *
 * Shows:
 *   - Tier allocation bar (visual breakdown of T1/T2/T3/T4)
 *   - Cost comparison (routed vs V3-Omni-only)
 *   - Per-panel classification table with override dropdowns
 *   - "Apply & Start Pipeline" button
 */

import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { AwakliButton } from "./AwakliButton";
import { AwakliiBadge } from "./AwakliiBadge";
import {
  X, Cpu, DollarSign, ArrowDownRight, Play, RotateCcw,
  ChevronDown, ChevronUp, Sparkles, Eye, AlertTriangle,
  Loader2, Zap, Info, Check,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tier Config ─────────────────────────────────────────────────────

const TIER_CONFIG: Record<number, { color: string; bg: string; label: string; shortLabel: string }> = {
  1: { color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)", label: "V3 Omni", shortLabel: "T1" },
  2: { color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)", label: "V2.6", shortLabel: "T2" },
  3: { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", label: "V2.1", shortLabel: "T3" },
  4: { color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)", label: "V1.6", shortLabel: "T4" },
};

// ─── Tier Allocation Bar ─────────────────────────────────────────────

function TierBar({ tierCounts, total }: { tierCounts: Record<number, number>; total: number }) {
  if (total === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Model Allocation</span>
        <span>{total} panels</span>
      </div>
      <div className="flex h-7 rounded-lg overflow-hidden border border-zinc-700/50">
        {[1, 2, 3, 4].map(tier => {
          const count = tierCounts[tier] || 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          const cfg = TIER_CONFIG[tier];
          return (
            <motion.div
              key={tier}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex items-center justify-center text-[11px] font-bold relative group"
              style={{ backgroundColor: cfg.bg, borderRight: "1px solid rgba(255,255,255,0.05)" }}
            >
              <span style={{ color: cfg.color }}>{cfg.shortLabel}: {count}</span>
              <div className="absolute bottom-full mb-1 px-2 py-1 bg-zinc-800 rounded text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {cfg.label}: {count} panel{count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)
              </div>
            </motion.div>
          );
        })}
      </div>
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

// ─── Cost Summary Cards ──────────────────────────────────────────────

function CostSummary({ totalCost, v3Cost, savings, savingsPercent, classificationCost }: {
  totalCost: number;
  v3Cost: number;
  savings: number;
  savingsPercent: number;
  classificationCost: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="bg-zinc-800/50 rounded-lg p-3 text-center border border-zinc-700/30">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Smart Routing</p>
        <p className="text-lg font-bold text-cyan-400 font-mono">${totalCost.toFixed(2)}</p>
        <p className="text-[10px] text-gray-500">estimated</p>
      </div>
      <div className="bg-zinc-800/50 rounded-lg p-3 text-center border border-zinc-700/30">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">V3 Omni Only</p>
        <p className="text-lg font-bold text-gray-400 font-mono line-through">${v3Cost.toFixed(2)}</p>
        <p className="text-[10px] text-gray-500">without routing</p>
      </div>
      <div className="bg-emerald-500/5 rounded-lg p-3 text-center border border-emerald-500/20">
        <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Saved</p>
        <p className="text-lg font-bold text-emerald-400 font-mono">${savings.toFixed(2)}</p>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <ArrowDownRight className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-bold">{savingsPercent.toFixed(0)}%</span>
        </div>
      </div>
      <div className="bg-zinc-800/50 rounded-lg p-3 text-center border border-zinc-700/30">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Classification</p>
        <p className="text-lg font-bold text-amber-400 font-mono">${classificationCost.toFixed(3)}</p>
        <p className="text-[10px] text-gray-500">LLM cost</p>
      </div>
    </div>
  );
}

// ─── Tier Select Dropdown ────────────────────────────────────────────

function TierSelect({ value, onChange, originalTier }: {
  value: number;
  onChange: (tier: number) => void;
  originalTier: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded border border-zinc-700/50 hover:border-zinc-600 transition-colors text-xs"
        style={{ backgroundColor: TIER_CONFIG[value].bg }}
      >
        <span style={{ color: TIER_CONFIG[value].color }} className="font-bold">
          T{value}
        </span>
        <span className="text-gray-400">{TIER_CONFIG[value].label}</span>
        {value !== originalTier && (
          <span className="text-amber-400 text-[8px]">*</span>
        )}
        <ChevronDown className="w-3 h-3 text-gray-500" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-full mt-1 left-0 z-50 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
          >
            {[1, 2, 3, 4].map(tier => {
              const cfg = TIER_CONFIG[tier];
              const isSelected = tier === value;
              const isOriginal = tier === originalTier;
              return (
                <button
                  key={tier}
                  onClick={() => { onChange(tier); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-700/50 transition-colors ${isSelected ? "bg-zinc-700/30" : ""}`}
                >
                  <span style={{ color: cfg.color }} className="font-bold w-6">T{tier}</span>
                  <span className="text-gray-300">{cfg.label}</span>
                  {isOriginal && <span className="text-gray-500 text-[9px] ml-auto">auto</span>}
                  {isSelected && <Check className="w-3 h-3 text-cyan-400 ml-auto" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Per-Panel Table ─────────────────────────────────────────────────

function PanelTable({ panels, overrides, onOverride }: {
  panels: Array<{
    panelId: number;
    sceneNumber: number;
    panelNumber: number;
    visualDescription: string;
    cameraAngle: string | null;
    hasDialogue: boolean;
    tier: number;
    model: string;
    reasoning: string;
    faceVisible: boolean;
    lipSyncNeeded: boolean;
    lipSyncBeneficial: boolean;
    deterministic: boolean;
    overridden: boolean;
    estimatedCost: number;
    v3OmniCost: number;
    savings: number;
  }>;
  overrides: Record<string, number>;
  onOverride: (panelId: number, tier: number) => void;
}) {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-700/50">
            <th className="text-left py-2.5 px-2 text-gray-500 font-medium">Panel</th>
            <th className="text-left py-2.5 px-2 text-gray-500 font-medium">Description</th>
            <th className="text-left py-2.5 px-2 text-gray-500 font-medium">Camera</th>
            <th className="text-center py-2.5 px-2 text-gray-500 font-medium">Dialogue</th>
            <th className="text-center py-2.5 px-2 text-gray-500 font-medium">Lip Sync</th>
            <th className="text-left py-2.5 px-2 text-gray-500 font-medium min-w-[140px]">Model Tier</th>
            <th className="text-right py-2.5 px-2 text-gray-500 font-medium">Cost</th>
            <th className="text-right py-2.5 px-2 text-gray-500 font-medium">Saved</th>
            <th className="text-center py-2.5 px-2 text-gray-500 font-medium w-8"></th>
          </tr>
        </thead>
        <tbody>
          {panels.map((p) => {
            const currentTier = overrides[String(p.panelId)] || p.tier;
            const isExpanded = expandedRow === p.panelId;
            const isOverridden = overrides[String(p.panelId)] !== undefined && overrides[String(p.panelId)] !== p.tier;

            return (
              <motion.tr
                key={p.panelId}
                layout
                className={`border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors ${isOverridden ? "bg-amber-500/5" : ""}`}
              >
                <td className="py-2.5 px-2">
                  <span className="text-gray-300 font-mono">S{p.sceneNumber}P{p.panelNumber}</span>
                </td>
                <td className="py-2.5 px-2 max-w-[200px]">
                  <p className="text-gray-400 truncate" title={p.visualDescription}>
                    {p.visualDescription || "—"}
                  </p>
                </td>
                <td className="py-2.5 px-2">
                  <span className="text-gray-400">{p.cameraAngle || "—"}</span>
                </td>
                <td className="py-2.5 px-2 text-center">
                  {p.hasDialogue ? (
                    <span className="text-cyan-400">Yes</span>
                  ) : (
                    <span className="text-gray-600">No</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center">
                  {p.lipSyncNeeded ? (
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 mx-auto" />
                  ) : p.lipSyncBeneficial ? (
                    <Zap className="w-3.5 h-3.5 text-purple-400 mx-auto" />
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="py-2.5 px-2">
                  <TierSelect
                    value={currentTier}
                    originalTier={p.tier}
                    onChange={(tier) => onOverride(p.panelId, tier)}
                  />
                </td>
                <td className="py-2.5 px-2 text-right">
                  <span className="text-gray-300 font-mono">${p.estimatedCost.toFixed(3)}</span>
                </td>
                <td className="py-2.5 px-2 text-right">
                  {p.savings > 0 ? (
                    <span className="text-emerald-400 font-mono">-${p.savings.toFixed(3)}</span>
                  ) : (
                    <span className="text-gray-600 font-mono">$0.000</span>
                  )}
                </td>
                <td className="py-2.5 px-2 text-center">
                  <button
                    onClick={() => setExpandedRow(isExpanded ? null : p.panelId)}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Info className="w-3.5 h-3.5" />}
                  </button>
                </td>
                {isExpanded && (
                  <td colSpan={9} className="py-2 px-4">
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-zinc-800/40 rounded-lg p-3 text-[11px] text-gray-400 space-y-1"
                    >
                      <p><span className="text-gray-500">Reasoning:</span> {p.reasoning}</p>
                      <div className="flex gap-4">
                        <span>Face visible: {p.faceVisible ? "Yes" : "No"}</span>
                        <span>Deterministic: {p.deterministic ? "Yes (rule-based)" : "No (LLM)"}</span>
                        <span>V3 Omni cost: ${p.v3OmniCost.toFixed(3)}</span>
                      </div>
                    </motion.div>
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────

interface RoutingPreviewModalProps {
  episodeId: number;
  episodeTitle: string;
  onClose: () => void;
  onStartPipeline: (episodeId: number, overrides?: Record<string, number>) => void;
}

export function RoutingPreviewModal({
  episodeId,
  episodeTitle,
  onClose,
  onStartPipeline,
}: RoutingPreviewModalProps) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [hasClassified, setHasClassified] = useState(false);

  const classifyMut = trpc.modelRouting.batchClassifyPreview.useMutation({
    onSuccess: () => {
      setHasClassified(true);
    },
    onError: (err) => {
      toast.error(`Classification failed: ${err.message}`);
    },
  });

  const handleClassify = useCallback(() => {
    classifyMut.mutate({
      episodeId,
      durationSec: 5,
      mode: "pro",
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });
  }, [episodeId, overrides, classifyMut]);

  const handleOverride = useCallback((panelId: number, tier: number) => {
    setOverrides(prev => {
      const next = { ...prev };
      // Find the original tier from the data
      const panel = classifyMut.data?.perPanel.find(p => p.panelId === panelId);
      if (panel && tier === panel.tier) {
        // Remove override if setting back to original
        delete next[String(panelId)];
      } else {
        next[String(panelId)] = tier;
      }
      return next;
    });
  }, [classifyMut.data]);

  const handleReclassify = useCallback(() => {
    classifyMut.mutate({
      episodeId,
      durationSec: 5,
      mode: "pro",
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
    });
  }, [episodeId, overrides, classifyMut]);

  const handleStartWithOverrides = useCallback(() => {
    const activeOverrides = Object.keys(overrides).length > 0 ? overrides : undefined;
    onStartPipeline(episodeId, activeOverrides);
    onClose();
  }, [episodeId, overrides, onStartPipeline, onClose]);

  // Recalculate costs with overrides applied locally
  const displayData = useMemo(() => {
    if (!classifyMut.data) return null;
    const data = classifyMut.data;

    // Apply local overrides to recalculate costs
    const MODEL_COSTS: Record<number, number> = { 1: 0.126, 2: 0.084, 3: 0.056, 4: 0.035 };
    const V3_COST_PER_SEC = 0.126;
    const durationSec = data.durationSec;

    let totalCost = 0;
    let totalV3Cost = 0;
    const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let overriddenCount = 0;

    const adjustedPanels = data.perPanel.map(p => {
      const effectiveTier = overrides[String(p.panelId)] || p.tier;
      const cost = (MODEL_COSTS[effectiveTier] || MODEL_COSTS[2]) * durationSec;
      const v3Cost = V3_COST_PER_SEC * durationSec;
      tierCounts[effectiveTier] = (tierCounts[effectiveTier] || 0) + 1;
      totalCost += cost;
      totalV3Cost += v3Cost;
      const isOverridden = overrides[String(p.panelId)] !== undefined && overrides[String(p.panelId)] !== p.tier;
      if (isOverridden) overriddenCount++;
      return {
        ...p,
        tier: effectiveTier,
        estimatedCost: cost,
        v3OmniCost: v3Cost,
        savings: v3Cost - cost,
        overridden: isOverridden,
      };
    });

    const savings = totalV3Cost - totalCost;
    const savingsPercent = totalV3Cost > 0 ? (savings / totalV3Cost) * 100 : 0;

    return {
      ...data,
      tierCounts,
      totalCost: Math.round(totalCost * 1000) / 1000,
      totalV3OmniCost: Math.round(totalV3Cost * 1000) / 1000,
      savings: Math.round(savings * 1000) / 1000,
      savingsPercent: Math.round(savingsPercent * 10) / 10,
      overriddenCount,
      perPanel: adjustedPanels,
    };
  }, [classifyMut.data, overrides]);

  const overrideCount = Object.keys(overrides).length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-display">Preview Routing</h2>
                <p className="text-xs text-gray-500">{episodeTitle} — Classify all panels before starting</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {overrideCount > 0 && (
                <AwakliiBadge variant="warning">
                  {overrideCount} override{overrideCount !== 1 ? "s" : ""}
                </AwakliiBadge>
              )}
              <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Initial state: classify button */}
            {!hasClassified && !classifyMut.isPending && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-4">
                  <Eye className="w-8 h-8 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Classify All Panels</h3>
                <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
                  Run the Smart Model Router on every panel to see which Kling model will be used,
                  estimated costs, and potential savings before starting the pipeline.
                </p>
                <AwakliButton variant="primary" size="lg" onClick={handleClassify}>
                  <Cpu className="w-5 h-5 mr-2" />
                  Classify Panels
                </AwakliButton>
              </div>
            )}

            {/* Loading state */}
            {classifyMut.isPending && (
              <div className="text-center py-12">
                <Loader2 className="w-10 h-10 animate-spin text-cyan-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Classifying Panels...</h3>
                <p className="text-gray-400 text-sm">
                  Running deterministic rules and LLM classification on all panels.
                  This may take a few seconds.
                </p>
              </div>
            )}

            {/* Results */}
            {displayData && !classifyMut.isPending && (
              <>
                {/* Summary stats row */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{displayData.totalPanels} panels</span>
                  <span className="text-gray-700">|</span>
                  <span>{displayData.deterministicCount} rule-based ({Math.round((displayData.deterministicCount / displayData.totalPanels) * 100)}%)</span>
                  <span className="text-gray-700">|</span>
                  <span>{displayData.totalPanels - displayData.deterministicCount} LLM-classified</span>
                  {displayData.overriddenCount > 0 && (
                    <>
                      <span className="text-gray-700">|</span>
                      <span className="text-amber-400">{displayData.overriddenCount} overridden</span>
                    </>
                  )}
                </div>

                {/* Tier allocation bar */}
                <TierBar tierCounts={displayData.tierCounts} total={displayData.totalPanels} />

                {/* Cost summary */}
                <CostSummary
                  totalCost={displayData.totalCost}
                  v3Cost={displayData.totalV3OmniCost}
                  savings={displayData.savings}
                  savingsPercent={displayData.savingsPercent}
                  classificationCost={displayData.classificationCost}
                />

                {/* Per-panel table */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white">Per-Panel Breakdown</h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <Sparkles className="w-3 h-3 text-cyan-400" /> Native lip sync
                      <Zap className="w-3 h-3 text-purple-400 ml-2" /> Post-sync beneficial
                      <span className="text-amber-400 ml-2">*</span> Overridden
                    </div>
                  </div>
                  <PanelTable
                    panels={displayData.perPanel}
                    overrides={overrides}
                    onOverride={handleOverride}
                  />
                </div>

                {/* Override notice */}
                {overrideCount > 0 && (
                  <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-300/80">
                      <p className="font-medium text-amber-300 mb-1">
                        {overrideCount} panel{overrideCount !== 1 ? "s" : ""} overridden
                      </p>
                      <p>
                        Upgrading panels to a higher tier increases quality but also cost.
                        Downgrading may reduce lip sync quality or visual fidelity.
                        Click "Re-classify with Overrides" to see the updated cost estimate.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {hasClassified && !classifyMut.isPending && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800 bg-zinc-900/80">
              <div className="flex items-center gap-3">
                {overrideCount > 0 && (
                  <AwakliButton variant="ghost" size="sm" onClick={handleReclassify}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Re-classify with Overrides
                  </AwakliButton>
                )}
                <AwakliButton
                  variant="ghost"
                  size="sm"
                  onClick={() => { setOverrides({}); }}
                  disabled={overrideCount === 0}
                >
                  Reset Overrides
                </AwakliButton>
              </div>
              <div className="flex items-center gap-3">
                <AwakliButton variant="secondary" size="sm" onClick={onClose}>
                  Cancel
                </AwakliButton>
                <AwakliButton variant="primary" size="sm" onClick={handleStartWithOverrides}>
                  <Play className="w-4 h-4 mr-1" />
                  {overrideCount > 0 ? `Start with ${overrideCount} Override${overrideCount !== 1 ? "s" : ""}` : "Start Pipeline"}
                </AwakliButton>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
