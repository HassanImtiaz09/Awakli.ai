/**
 * ScriptCostAdvisor — Real-time cost heatmap and optimization suggestions
 * for the script editor. Shows per-scene cost breakdown with color coding.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart3, TrendingDown, Sparkles, Loader2, ChevronDown,
  ChevronUp, Lightbulb, ArrowRight, Check, X, Zap,
  DollarSign, AlertTriangle, CircleCheck, Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";

// ─── Types ──────────────────────────────────────────────────────────────
interface SceneAnalysis {
  sceneIndex: number;
  sceneText: string;
  estimatedSceneType: string;
  estimatedCost: number;
  costLevel: "low" | "medium" | "high";
  heatmapColor: string;
  panelCount: number;
  hasDialogue: boolean;
  hasAction: boolean;
  hasSfx: boolean;
}

interface BudgetSuggestion {
  sceneIndex: number;
  currentType: string;
  suggestedType: string;
  currentCost: number;
  suggestedCost: number;
  savings: number;
  reason: string;
  rewriteHint: string;
}

interface ScriptCostBreakdown {
  scenes: SceneAnalysis[];
  totalEstimatedCost: number;
  averageCostPerScene: number;
  costDistribution: { low: number; medium: number; high: number };
  budgetSuggestions: BudgetSuggestion[];
}

// ─── Cost Level Icon ────────────────────────────────────────────────────
function CostLevelIcon({ level }: { level: "low" | "medium" | "high" }) {
  if (level === "low") return <CircleCheck size={12} className="text-emerald-400" />;
  if (level === "medium") return <AlertTriangle size={12} className="text-amber-400" />;
  return <AlertTriangle size={12} className="text-red-400" />;
}

// ─── Scene Cost Row ─────────────────────────────────────────────────────
function SceneCostRow({
  scene,
  suggestion,
  isExpanded,
  onToggle,
  onAcceptSuggestion,
}: {
  scene: SceneAnalysis;
  suggestion?: BudgetSuggestion;
  isExpanded: boolean;
  onToggle: () => void;
  onAcceptSuggestion?: () => void;
}) {
  return (
    <div className="border border-white/5 rounded-lg overflow-hidden">
      {/* Row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.02] transition-colors"
      >
        {/* Heatmap dot */}
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: scene.heatmapColor }}
        />

        {/* Scene number */}
        <span className="text-[10px] font-mono text-white/30 w-6">
          #{scene.sceneIndex + 1}
        </span>

        {/* Scene type badge */}
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] border px-1.5 py-0",
            scene.costLevel === "low" && "border-emerald-500/20 text-emerald-300/70",
            scene.costLevel === "medium" && "border-amber-500/20 text-amber-300/70",
            scene.costLevel === "high" && "border-red-500/20 text-red-300/70",
          )}
        >
          {scene.estimatedSceneType}
        </Badge>

        {/* Scene preview text */}
        <span className="text-[11px] text-white/40 truncate flex-1 text-left">
          {scene.sceneText.slice(0, 60)}...
        </span>

        {/* Cost */}
        <span className={cn(
          "text-xs font-medium tabular-nums",
          scene.costLevel === "low" && "text-emerald-300/80",
          scene.costLevel === "medium" && "text-amber-300/80",
          scene.costLevel === "high" && "text-red-300/80",
        )}>
          ~{scene.estimatedCost} cr
        </span>

        {/* Suggestion indicator */}
        {suggestion && (
          <Lightbulb size={12} className="text-token-gold flex-shrink-0" />
        )}

        {/* Expand chevron */}
        {isExpanded ? (
          <ChevronUp size={12} className="text-white/20" />
        ) : (
          <ChevronDown size={12} className="text-white/20" />
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
              {/* Scene details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-1.5 rounded bg-white/[0.02]">
                  <div className="text-[10px] text-white/30">Panels</div>
                  <div className="text-xs font-medium text-white/60">{scene.panelCount}</div>
                </div>
                <div className="text-center p-1.5 rounded bg-white/[0.02]">
                  <div className="text-[10px] text-white/30">Dialogue</div>
                  <div className="text-xs font-medium text-white/60">{scene.hasDialogue ? "Yes" : "No"}</div>
                </div>
                <div className="text-center p-1.5 rounded bg-white/[0.02]">
                  <div className="text-[10px] text-white/30">Action</div>
                  <div className="text-xs font-medium text-white/60">{scene.hasAction ? "Yes" : "No"}</div>
                </div>
              </div>

              {/* Optimization suggestion */}
              {suggestion && (
                <div className="p-2.5 rounded-lg bg-token-gold/5 border border-token-gold/10">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb size={11} className="text-token-gold" />
                    <span className="text-[10px] font-semibold text-token-gold/80">Optimization Available</span>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed mb-2">
                    {suggestion.reason}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] mb-2">
                    <span className="text-red-300/60">{suggestion.currentType} ({suggestion.currentCost} cr)</span>
                    <ArrowRight size={10} className="text-white/20" />
                    <span className="text-emerald-300/60">{suggestion.suggestedType} ({suggestion.suggestedCost} cr)</span>
                    <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px]">
                      Save {suggestion.savings} cr
                    </Badge>
                  </div>
                  <p className="text-[10px] text-white/25 italic mb-2">
                    Hint: {suggestion.rewriteHint}
                  </p>
                  {onAcceptSuggestion && (
                    <Button
                      size="sm"
                      onClick={onAcceptSuggestion}
                      className="h-6 text-[10px] bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20"
                    >
                      <Check size={10} className="mr-1" /> Apply Suggestion
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Distribution Bar ───────────────────────────────────────────────────
function CostDistributionBar({ distribution }: { distribution: { low: number; medium: number; high: number } }) {
  const total = distribution.low + distribution.medium + distribution.high;
  if (total === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
        {distribution.low > 0 && (
          <div
            className="bg-emerald-500/60 transition-all duration-500"
            style={{ width: `${(distribution.low / total) * 100}%` }}
          />
        )}
        {distribution.medium > 0 && (
          <div
            className="bg-amber-500/60 transition-all duration-500"
            style={{ width: `${(distribution.medium / total) * 100}%` }}
          />
        )}
        {distribution.high > 0 && (
          <div
            className="bg-red-500/60 transition-all duration-500"
            style={{ width: `${(distribution.high / total) * 100}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-[9px] text-white/25">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
          Low ({distribution.low})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
          Med ({distribution.medium})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500/60" />
          High ({distribution.high})
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────
export default function ScriptCostAdvisor({
  scriptText,
  className,
}: {
  scriptText: string;
  className?: string;
}) {
  const [breakdown, setBreakdown] = useState<ScriptCostBreakdown | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [expandedScene, setExpandedScene] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyzeMut = trpc.costOptimizer.analyzeScript.useMutation({
    onSuccess: (data) => {
      setBreakdown(data as ScriptCostBreakdown);
      setIsAnalyzing(false);
    },
    onError: () => {
      setIsAnalyzing(false);
    },
  });

  const recordOutcomeMut = trpc.costOptimizer.recordOutcome.useMutation();

  // Debounced analysis
  const triggerAnalysis = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (text.length >= 50) {
        setIsAnalyzing(true);
        analyzeMut.mutate({ scriptText: text });
      }
    }, 2000);
  }, []);

  useEffect(() => {
    triggerAnalysis(scriptText);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [scriptText, triggerAnalysis]);

  const suggestionMap = new Map(
    (breakdown?.budgetSuggestions ?? []).map((s) => [s.sceneIndex, s]),
  );

  const totalSavings = breakdown?.budgetSuggestions.reduce((sum, s) => sum + s.savings, 0) ?? 0;

  return (
    <div className={cn("border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden", className)}>
      {/* Header */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-token-cyan" />
              <span className="text-xs font-semibold text-white/60">Cost Advisor</span>
              {isAnalyzing && <Loader2 size={12} className="animate-spin text-token-cyan/50" />}
            </div>
            <div className="flex items-center gap-3">
              {breakdown && (
                <span className="text-xs font-medium text-white/40 tabular-nums">
                  ~{breakdown.totalEstimatedCost} cr total
                </span>
              )}
              {totalSavings > 0 && (
                <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px]">
                  <TrendingDown size={9} className="mr-0.5" />
                  Save {totalSavings} cr
                </Badge>
              )}
              {isOpen ? <ChevronUp size={12} className="text-white/20" /> : <ChevronDown size={12} className="text-white/20" />}
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3">
            {!breakdown && !isAnalyzing && (
              <div className="text-center py-6">
                <Info size={20} className="mx-auto text-white/10 mb-2" />
                <p className="text-[11px] text-white/25">
                  Write at least 50 characters of script to see cost analysis.
                </p>
              </div>
            )}

            {isAnalyzing && !breakdown && (
              <div className="text-center py-6">
                <Loader2 size={20} className="mx-auto animate-spin text-token-cyan/30 mb-2" />
                <p className="text-[11px] text-white/25">Analyzing script costs...</p>
              </div>
            )}

            {breakdown && (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <DollarSign size={12} className="mx-auto text-token-cyan mb-0.5" />
                    <div className="text-sm font-bold text-white/70">{breakdown.totalEstimatedCost}</div>
                    <div className="text-[9px] text-white/25">Total Credits</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <BarChart3 size={12} className="mx-auto text-token-violet mb-0.5" />
                    <div className="text-sm font-bold text-white/70">{breakdown.averageCostPerScene.toFixed(1)}</div>
                    <div className="text-[9px] text-white/25">Avg/Scene</div>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <Sparkles size={12} className="mx-auto text-token-gold mb-0.5" />
                    <div className="text-sm font-bold text-white/70">{breakdown.scenes.length}</div>
                    <div className="text-[9px] text-white/25">Scenes</div>
                  </div>
                </div>

                {/* Cost distribution bar */}
                <CostDistributionBar distribution={breakdown.costDistribution} />

                <Separator className="bg-white/5" />

                {/* Scene list */}
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                  {breakdown.scenes.map((scene) => (
                    <SceneCostRow
                      key={scene.sceneIndex}
                      scene={scene}
                      suggestion={suggestionMap.get(scene.sceneIndex)}
                      isExpanded={expandedScene === scene.sceneIndex}
                      onToggle={() =>
                        setExpandedScene(
                          expandedScene === scene.sceneIndex ? null : scene.sceneIndex,
                        )
                      }
                      onAcceptSuggestion={
                        suggestionMap.has(scene.sceneIndex)
                          ? () => {
                              const s = suggestionMap.get(scene.sceneIndex)!;
                              recordOutcomeMut.mutate({
                                currentType: s.currentType as "dialogue" | "transition" | "action" | "establishing" | "reaction" | "montage",
                                suggestedType: s.suggestedType as "dialogue" | "transition" | "action" | "establishing" | "reaction" | "montage",
                                accepted: true,
                              });
                              toast.success(
                                `Scene #${s.sceneIndex + 1}: ${s.currentType} → ${s.suggestedType} (saving ${s.savings} credits)`,
                              );
                            }
                          : undefined
                      }
                    />
                  ))}
                </div>

                {/* Potential savings summary */}
                {totalSavings > 0 && (
                  <div className="p-3 rounded-lg bg-gradient-to-r from-emerald-500/5 to-token-cyan/5 border border-emerald-500/10">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap size={12} className="text-emerald-400" />
                      <span className="text-[11px] font-semibold text-emerald-300/80">
                        {breakdown.budgetSuggestions.length} optimization{breakdown.budgetSuggestions.length !== 1 ? "s" : ""} available
                      </span>
                    </div>
                    <p className="text-[10px] text-white/30">
                      Apply all suggestions to save <strong className="text-emerald-300">{totalSavings} credits</strong> ({Math.round((totalSavings / breakdown.totalEstimatedCost) * 100)}% reduction).
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
