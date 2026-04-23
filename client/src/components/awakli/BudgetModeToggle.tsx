/**
 * BudgetModeToggle — One-click toggle that applies all cost optimizations:
 * RIFE default for non-action scenes, importance-based provider routing,
 * background reuse, and voice caching. Shows before/after cost comparison.
 */
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Zap, TrendingDown, Shield, ChevronDown, ChevronUp,
  Sparkles, Layers, Mic, Image, Film,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

// ─── Optimization categories ────────────────────────────────────────────
interface OptimizationItem {
  id: string;
  label: string;
  description: string;
  icon: typeof Zap;
  savingsPercent: number; // estimated percentage savings for this category
  enabled: boolean;
}

const DEFAULT_OPTIMIZATIONS: OptimizationItem[] = [
  {
    id: "rife",
    label: "RIFE Upsampling",
    description: "Use 8fps + frame interpolation for non-action scenes",
    icon: Film,
    savingsPercent: 25,
    enabled: true,
  },
  {
    id: "importance",
    label: "Adaptive Routing",
    description: "Route low-importance scenes to budget providers",
    icon: Layers,
    savingsPercent: 15,
    enabled: true,
  },
  {
    id: "backgrounds",
    label: "Background Reuse",
    description: "Reuse existing backgrounds from your location library",
    icon: Image,
    savingsPercent: 10,
    enabled: true,
  },
  {
    id: "voiceCache",
    label: "Voice Caching",
    description: "Cache common voice lines to avoid regeneration",
    icon: Mic,
    savingsPercent: 5,
    enabled: true,
  },
];

// ─── Savings Visualization ──────────────────────────────────────────────
function SavingsComparison({
  baseCost,
  optimizedCost,
}: {
  baseCost: number;
  optimizedCost: number;
}) {
  const savings = baseCost - optimizedCost;
  const savingsPercent = baseCost > 0 ? Math.round((savings / baseCost) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-center p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
        <div className="text-[9px] text-white/25 mb-0.5">Standard</div>
        <div className="text-sm font-bold text-white/50 line-through decoration-red-400/40">
          ~{baseCost} cr
        </div>
      </div>
      <div className="text-center p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
        <div className="text-[9px] text-emerald-300/50 mb-0.5">Budget Mode</div>
        <div className="text-sm font-bold text-emerald-300">
          ~{optimizedCost} cr
        </div>
      </div>
      <div className="text-center p-2.5 rounded-lg bg-token-gold/5 border border-token-gold/10">
        <div className="text-[9px] text-token-gold/50 mb-0.5">You Save</div>
        <div className="text-sm font-bold text-token-gold">
          {savings} cr
        </div>
        <div className="text-[8px] text-token-gold/40">({savingsPercent}%)</div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function BudgetModeToggle({
  baseCost,
  className,
  onChange,
}: {
  /** Base episode cost without optimizations */
  baseCost: number;
  className?: string;
  /** Callback when budget mode or individual optimizations change */
  onChange?: (enabled: boolean, optimizations: Record<string, boolean>) => void;
}) {
  const [budgetMode, setBudgetMode] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [optimizations, setOptimizations] = useState(DEFAULT_OPTIMIZATIONS);

  // Calculate optimized cost based on enabled optimizations
  const optimizedCost = useMemo(() => {
    if (!budgetMode) return baseCost;
    let totalSavingsPercent = 0;
    for (const opt of optimizations) {
      if (opt.enabled) {
        totalSavingsPercent += opt.savingsPercent;
      }
    }
    // Cap at 60% max savings (diminishing returns)
    totalSavingsPercent = Math.min(totalSavingsPercent, 60);
    return Math.round(baseCost * (1 - totalSavingsPercent / 100));
  }, [budgetMode, optimizations, baseCost]);

  // Notify parent of changes
  useEffect(() => {
    if (onChange) {
      const optMap: Record<string, boolean> = {};
      for (const opt of optimizations) {
        optMap[opt.id] = budgetMode && opt.enabled;
      }
      onChange(budgetMode, optMap);
    }
  }, [budgetMode, optimizations]);

  const toggleOptimization = (id: string) => {
    setOptimizations((prev) =>
      prev.map((opt) => (opt.id === id ? { ...opt, enabled: !opt.enabled } : opt)),
    );
  };

  const enabledCount = optimizations.filter((o) => o.enabled).length;

  return (
    <div className={cn("border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden", className)}>
      {/* Toggle header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center transition-colors",
            budgetMode ? "bg-emerald-500/15" : "bg-white/5",
          )}>
            <Zap size={14} className={budgetMode ? "text-emerald-400" : "text-white/20"} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white/60">Budget Mode</span>
              {budgetMode && (
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[8px] py-0">
                  <TrendingDown size={8} className="mr-0.5" />
                  {Math.round(((baseCost - optimizedCost) / baseCost) * 100)}% off
                </Badge>
              )}
            </div>
            <p className="text-[9px] text-white/25 mt-0.5">
              {budgetMode
                ? `${enabledCount} optimization${enabledCount !== 1 ? "s" : ""} active`
                : "Apply all cost optimizations at once"}
            </p>
          </div>
        </div>
        <Switch
          checked={budgetMode}
          onCheckedChange={setBudgetMode}
          className="data-[state=checked]:bg-emerald-500/40"
        />
      </div>

      {/* Cost comparison (always visible when budget mode is on) */}
      <AnimatePresence>
        {budgetMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3">
              <SavingsComparison baseCost={baseCost} optimizedCost={optimizedCost} />

              {/* Details toggle */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="w-full flex items-center justify-center gap-1 text-[10px] text-white/25 hover:text-white/40 transition-colors py-1"
              >
                {showDetails ? "Hide" : "Show"} optimization details
                {showDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>

              {/* Individual optimization toggles */}
              <AnimatePresence>
                {showDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-1.5 overflow-hidden"
                  >
                    {optimizations.map((opt) => {
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => toggleOptimization(opt.id)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
                            opt.enabled
                              ? "bg-emerald-500/5 border-emerald-500/10"
                              : "bg-white/[0.01] border-white/5 opacity-50",
                          )}
                        >
                          <Icon size={12} className={opt.enabled ? "text-emerald-300/60" : "text-white/20"} />
                          <div className="flex-1 text-left">
                            <div className="text-[10px] font-medium text-white/50">{opt.label}</div>
                            <div className="text-[9px] text-white/20">{opt.description}</div>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[8px]",
                              opt.enabled
                                ? "border-emerald-500/20 text-emerald-300/60"
                                : "border-white/10 text-white/20",
                            )}
                          >
                            ~{opt.savingsPercent}%
                          </Badge>
                          <div className={cn(
                            "w-3 h-3 rounded-full border-2 transition-colors",
                            opt.enabled
                              ? "bg-emerald-400 border-emerald-400"
                              : "bg-transparent border-white/20",
                          )} />
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Quality note */}
              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-white/[0.01]">
                <Shield size={10} className="text-token-violet/50 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-white/20 leading-relaxed">
                  Budget mode optimizes cost while preserving quality for key scenes.
                  Action sequences and climactic moments always use premium generation.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
