/**
 * Motion LoRA Status Panel (Prompt 24 — TASK-14)
 *
 * Displays motion LoRA capability, training status, scene-type weight map,
 * and evaluation gate results (M1-M14) for a character.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Lock, CheckCircle2, XCircle, AlertTriangle, Loader2,
  ChevronDown, Shield, Activity, TrendingUp, Timer, DollarSign,
  Eye, Film, Swords, MessageSquare, Footprints, Sparkles, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Scene Type Weight Map (mirrors server/motion-lora-training.ts) ────

const SCENE_TYPE_WEIGHTS: Array<{
  sceneType: string;
  label: string;
  weight: number | null;
  icon: typeof Swords;
}> = [
  { sceneType: "action-combat",          label: "Action Combat",           weight: 0.75, icon: Swords },
  { sceneType: "action-locomotion",      label: "Action Locomotion",       weight: 0.65, icon: Footprints },
  { sceneType: "reaction-peak",          label: "Reaction Peak",           weight: 0.70, icon: Sparkles },
  { sceneType: "somatic-peak",           label: "Somatic Peak",            weight: 0.70, icon: Activity },
  { sceneType: "establishing-character", label: "Establishing Character",  weight: 0.50, icon: Eye },
  { sceneType: "dialogue-gestured",      label: "Dialogue Gestured",       weight: 0.55, icon: MessageSquare },
  { sceneType: "montage",                label: "Montage",                 weight: 0.60, icon: Film },
  { sceneType: "establishing-environment", label: "Establishing Environment", weight: null, icon: Eye },
  { sceneType: "dialogue-static",        label: "Dialogue Static",         weight: null, icon: MessageSquare },
  { sceneType: "transition",             label: "Transition",              weight: null, icon: Film },
  { sceneType: "kinetic",                label: "Kinetic",                 weight: null, icon: Activity },
];

// ─── Gate Definitions (mirrors server/motion-lora-evaluation.ts) ────────

interface GateInfo {
  id: string;
  name: string;
  category: "identity" | "motion" | "efficiency" | "regression";
  blocking: boolean;
}

const GATES: GateInfo[] = [
  { id: "M1",  name: "Face Consistency",          category: "identity",   blocking: true },
  { id: "M2",  name: "No Gender Drift",           category: "identity",   blocking: true },
  { id: "M3",  name: "No Style Drift",            category: "identity",   blocking: true },
  { id: "M4",  name: "Feature Stability",          category: "identity",   blocking: false },
  { id: "M5",  name: "Motion-Prompt Alignment",   category: "motion",     blocking: true },
  { id: "M6",  name: "No Limb Teleportation",     category: "motion",     blocking: true },
  { id: "M7",  name: "Temporal Flicker",           category: "motion",     blocking: false },
  { id: "M8",  name: "Gesture Vocabulary",          category: "motion",     blocking: false },
  { id: "M9",  name: "Regen Ratio",               category: "efficiency", blocking: true },
  { id: "M10", name: "Inference Overhead",         category: "efficiency", blocking: false },
  { id: "M11", name: "Cost Reduction",             category: "efficiency", blocking: false },
  { id: "M12", name: "No Regression (Static)",     category: "regression", blocking: true },
  { id: "M13", name: "No Regression (Dialogue)",   category: "regression", blocking: true },
  { id: "M14", name: "No Regression (Action)",     category: "regression", blocking: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  identity: "Identity Preservation",
  motion: "Motion Quality",
  efficiency: "Production Efficiency",
  regression: "Regression",
};

const CATEGORY_COLORS: Record<string, string> = {
  identity: "text-purple-400",
  motion: "text-cyan",
  efficiency: "text-[var(--accent-gold)]",
  regression: "text-[var(--accent-cyan)]",
};

// ─── Types ──────────────────────────────────────────────────────────────

interface MotionLoraStatus {
  /** Whether the user's tier allows motion LoRA */
  tierAllowed: boolean;
  /** Current tier name */
  tierName: string;
  /** Training quota: max per month */
  maxTrainingsPerMonth: number;
  /** Training quota: used this month */
  trainingsUsedThisMonth: number;
  /** Whether a motion LoRA exists for this character */
  hasMotionLora: boolean;
  /** Training status */
  trainingStatus?: "pending" | "preparing" | "training" | "evaluating" | "complete" | "failed";
  /** Training progress (0-100) */
  trainingProgress?: number;
  /** Model version */
  modelVersion?: string;
  /** Evaluation results (if evaluated) */
  evaluationResults?: {
    verdict: "promoted" | "blocked" | "needs_review";
    gates: Array<{
      gateId: string;
      status: "pass" | "fail" | "warn" | "skip";
      score: number | null;
    }>;
    evaluatedAt: number;
  };
}

interface MotionLoraPanelProps {
  characterId: number;
  characterName: string;
}

// ─── Component ──────────────────────────────────────────────────────────

export function MotionLoraPanel({ characterId, characterName }: MotionLoraPanelProps) {
  const [sceneMapOpen, setSceneMapOpen] = useState(false);
  const [gatesOpen, setGatesOpen] = useState(false);

  // ─── tRPC Queries ───
  const statusQuery = trpc.motionLora.status.useQuery(
    { characterId },
    { refetchInterval: 15000 } // Poll every 15s for training progress
  );

  const submitTraining = trpc.motionLora.submitTraining.useMutation({
    onSuccess: (data) => {
      toast.success(`Training job submitted! Estimated ${data.estimatedMinutes} min (${data.estimatedCostCredits} credits)`);
      statusQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const runEvaluation = trpc.motionLora.runEvaluation.useMutation({
    onSuccess: (data) => {
      toast.success(`Evaluation complete: ${data.verdict} (${data.passCount}/${data.passCount + data.failCount} gates passed)`);
      statusQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const cancelTraining = trpc.motionLora.cancelTraining.useMutation({
    onSuccess: () => {
      toast.info("Training job cancelled");
      statusQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  // Map tRPC data to the display shape
  const data = statusQuery.data;
  const s: MotionLoraStatus = data ? {
    tierAllowed: data.tierAllowed,
    tierName: data.tierName,
    maxTrainingsPerMonth: data.maxTrainingsPerMonth,
    trainingsUsedThisMonth: data.trainingsUsedThisMonth,
    hasMotionLora: data.hasMotionLora,
    trainingStatus: data.trainingStatus as MotionLoraStatus["trainingStatus"],
    trainingProgress: data.trainingProgress ?? undefined,
    modelVersion: data.modelVersion ?? undefined,
    evaluationResults: data.evaluationResults ? {
      verdict: data.evaluationResults.verdict,
      gates: data.evaluationResults.gates,
      evaluatedAt: data.evaluationResults.evaluatedAt,
    } : undefined,
  } : {
    tierAllowed: false,
    tierName: "Free",
    maxTrainingsPerMonth: 0,
    trainingsUsedThisMonth: 0,
    hasMotionLora: false,
  };

  const isLoading = statusQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* ─── Tier Gate Banner ─── */}
      {!s.tierAllowed && (
        <div className="rounded-xl border border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/5 p-5">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-[var(--accent-gold)] mt-0.5 shrink-0" />
            <div>
              <h3 className="font-heading font-bold text-[var(--accent-gold)]">
                Motion LoRA — Creator Pro+ Required
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Motion LoRA trains character-specific animation models for more consistent and expressive
                anime clips. Available on Creator Pro ($99/mo), Studio ($499/mo), and Enterprise plans.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Your current plan: <span className="font-semibold text-foreground">{s.tierName}</span>
              </p>
              <Link href="/pricing">
                <Button
                  size="sm"
                  className="mt-3 bg-gradient-to-r from-[var(--accent-gold)] to-[var(--accent-cyan)] text-white border-0"
                >
                  <Zap className="w-3.5 h-3.5 mr-1" /> Upgrade to Unlock
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ─── Motion LoRA Status Card ─── */}
      {s.tierAllowed && (
        <div className={cn(
          "rounded-xl border p-5",
          s.hasMotionLora && s.evaluationResults?.verdict === "promoted"
            ? "border-[var(--status-success)]/20 bg-[var(--status-success)]/5"
            : s.hasMotionLora && s.evaluationResults?.verdict === "blocked"
              ? "border-[var(--status-error)]/20 bg-[var(--status-error)]/5"
              : s.trainingStatus && s.trainingStatus !== "complete" && s.trainingStatus !== "failed"
                ? "border-cyan/20 bg-cyan/5"
                : "border-white/10 bg-[var(--bg-base)]"
        )}>
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              s.hasMotionLora && s.evaluationResults?.verdict === "promoted"
                ? "bg-[var(--status-success)]/20"
                : "bg-cyan/20"
            )}>
              {s.hasMotionLora && s.evaluationResults?.verdict === "promoted" ? (
                <CheckCircle2 className="w-5 h-5 text-[var(--status-success)]" />
              ) : s.trainingStatus === "training" || s.trainingStatus === "preparing" || s.trainingStatus === "evaluating" ? (
                <Loader2 className="w-5 h-5 animate-spin text-cyan" />
              ) : (
                <Zap className="w-5 h-5 text-cyan" />
              )}
            </div>
            <div>
              <h3 className="font-heading font-bold">
                Motion LoRA {s.hasMotionLora ? `— ${s.modelVersion || "v1"}` : "— Not Trained"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {s.hasMotionLora
                  ? s.evaluationResults?.verdict === "promoted"
                    ? "Active in production — character animation model applied during video generation"
                    : s.evaluationResults?.verdict === "blocked"
                      ? "Blocked — evaluation gates failed, needs retraining"
                      : "Trained — awaiting evaluation"
                  : s.trainingStatus === "training"
                    ? "Training in progress..."
                    : "No motion LoRA trained yet for this character"}
              </p>
            </div>
          </div>

          {/* Training progress bar */}
          {s.trainingStatus && s.trainingStatus !== "complete" && s.trainingStatus !== "failed" && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="capitalize">{s.trainingStatus}</span>
                <span>{s.trainingProgress ?? 0}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan to-[var(--accent-cyan)] rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${s.trainingProgress ?? 0}%` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                />
              </div>
            </div>
          )}

          {/* Training quota + v1.1 economics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="rounded bg-white/5 p-2">
              <div className="text-xs text-muted-foreground">Quota</div>
              <div className="font-mono">
                {s.trainingsUsedThisMonth}/{s.maxTrainingsPerMonth}
              </div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-xs text-muted-foreground">Surcharge</div>
              <div className="font-mono">+15%</div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-xs text-muted-foreground">Training Cost</div>
              <div className="font-mono">8 credits</div>
            </div>
            <div className="rounded bg-white/5 p-2">
              <div className="text-xs text-muted-foreground">Cost Savings</div>
              <div className="font-mono text-[var(--status-success)]">~55%</div>
            </div>
          </div>

          {/* v1.1 Provider & Economics Info */}
          <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/5 p-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Inference Provider</span>
                <div className="font-medium mt-0.5">Wan 2.6 Pro (fal.ai)</div>
              </div>
              <div>
                <span className="text-muted-foreground">Inference Cost</span>
                <div className="font-mono mt-0.5">$0.10/sec (720p)</div>
              </div>
              <div>
                <span className="text-muted-foreground">Regen Ratio (before)</span>
                <div className="font-mono mt-0.5 text-[var(--status-error)]">3.5x</div>
              </div>
              <div>
                <span className="text-muted-foreground">Regen Ratio (after)</span>
                <div className="font-mono mt-0.5 text-[var(--status-success)]">1.5x</div>
              </div>
            </div>
          </div>

          {/* Train button for untrained characters */}
          {!s.hasMotionLora && !s.trainingStatus && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <Button
                className="bg-gradient-to-r from-cyan to-[var(--accent-cyan)] text-white border-0"
                disabled={s.trainingsUsedThisMonth >= s.maxTrainingsPerMonth || submitTraining.isPending}
                onClick={() => {
                  toast.info("Motion LoRA training requires at least 40 video clips. Upload clips in the Assets tab first.");
                  // In production, this would open a training configuration dialog
                  // For now, show the info toast
                }}
              >
                <Zap className="w-4 h-4 mr-2" /> Train Motion LoRA
              </Button>
              {s.trainingsUsedThisMonth >= s.maxTrainingsPerMonth && (
                <p className="text-xs text-[var(--status-warning)] mt-2">
                  Monthly training quota reached ({s.maxTrainingsPerMonth} jobs)
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Scene-Type Weight Map ─── */}
      <Collapsible open={sceneMapOpen} onOpenChange={setSceneMapOpen}>
        <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] overflow-hidden">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <Film className="w-4 h-4 text-cyan" />
                <div className="text-left">
                  <h4 className="text-sm font-semibold">Scene-Type Weight Map</h4>
                  <p className="text-[10px] text-muted-foreground">
                    Motion LoRA weight per scene type (7 active, 4 skipped)
                  </p>
                </div>
              </div>
              <ChevronDown className={cn(
                "w-4 h-4 text-muted-foreground transition-transform",
                sceneMapOpen && "rotate-180"
              )} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              <div className="space-y-1.5">
                {SCENE_TYPE_WEIGHTS.map((st) => {
                  const Icon = st.icon;
                  return (
                    <div
                      key={st.sceneType}
                      className={cn(
                        "flex items-center justify-between py-2 px-3 rounded-lg text-sm",
                        st.weight !== null ? "bg-white/[0.02]" : "opacity-50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className={st.weight !== null ? "text-foreground" : "text-muted-foreground"}>
                          {st.label}
                        </span>
                      </div>
                      {st.weight !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan to-[var(--accent-cyan)] rounded-full"
                              style={{ width: `${st.weight * 100}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs text-cyan w-10 text-right">
                            {st.weight.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-white/10 text-muted-foreground">
                          Skipped
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* ─── Evaluation Gates M1-M14 ─── */}
      <Collapsible open={gatesOpen} onOpenChange={setGatesOpen}>
        <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] overflow-hidden">
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-[var(--accent-cyan)]" />
                <div className="text-left">
                  <h4 className="text-sm font-semibold">Evaluation Gates (M1-M14)</h4>
                  <p className="text-[10px] text-muted-foreground">
                    {s.evaluationResults
                      ? `${s.evaluationResults.gates.filter(g => g.status === "pass").length}/14 passed — ${s.evaluationResults.verdict}`
                      : "14 quality gates must pass before production use"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {s.evaluationResults && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] border-0",
                      s.evaluationResults.verdict === "promoted"
                        ? "bg-[var(--status-success)]/10 text-[var(--status-success)]"
                        : s.evaluationResults.verdict === "blocked"
                          ? "bg-[var(--status-error)]/10 text-[var(--status-error)]"
                          : "bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                    )}
                  >
                    {s.evaluationResults.verdict.toUpperCase()}
                  </Badge>
                )}
                <ChevronDown className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  gatesOpen && "rotate-180"
                )} />
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              {(["identity", "motion", "efficiency", "regression"] as const).map((cat) => {
                const catGates = GATES.filter(g => g.category === cat);
                return (
                  <div key={cat} className="mb-4 last:mb-0">
                    <h5 className={cn(
                      "text-xs font-semibold uppercase tracking-wider mb-2",
                      CATEGORY_COLORS[cat]
                    )}>
                      {CATEGORY_LABELS[cat]}
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {catGates.map((gate) => {
                        const result = s.evaluationResults?.gates.find(g => g.gateId === gate.id);
                        return (
                          <div
                            key={gate.id}
                            className={cn(
                              "flex items-center justify-between py-1.5 px-3 rounded-lg text-xs",
                              result?.status === "pass" ? "bg-[var(--status-success)]/5" :
                              result?.status === "fail" ? "bg-[var(--status-error)]/5" :
                              result?.status === "warn" ? "bg-[var(--accent-gold)]/5" :
                              "bg-white/[0.02]"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {result ? (
                                result.status === "pass" ? (
                                  <CheckCircle2 className="w-3 h-3 text-[var(--status-success)]" />
                                ) : result.status === "fail" ? (
                                  <XCircle className="w-3 h-3 text-[var(--status-error)]" />
                                ) : result.status === "warn" ? (
                                  <AlertTriangle className="w-3 h-3 text-[var(--accent-gold)]" />
                                ) : (
                                  <div className="w-3 h-3 rounded-full border border-white/20" />
                                )
                              ) : (
                                <div className="w-3 h-3 rounded-full border border-white/20" />
                              )}
                              <span className="text-muted-foreground">{gate.id}</span>
                              <span className="text-foreground">{gate.name}</span>
                              {gate.blocking && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 border-[var(--status-error)]/30 text-[var(--status-error)]">
                                  blocking
                                </Badge>
                              )}
                            </div>
                            {result?.score !== null && result?.score !== undefined && (
                              <span className="font-mono text-muted-foreground">
                                {typeof result.score === "number" ? result.score.toFixed(2) : "—"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {!s.evaluationResults && (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  Evaluation gates will be populated after motion LoRA training completes.
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* ─── LoRA Stack Diagram (v1.1: tier-aware layers) ─── */}
      <div className="rounded-xl border border-white/10 bg-[var(--bg-base)] p-4">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan" /> LoRA Stack (Load Order)
        </h4>
        <div className="flex flex-col gap-1">
          {[
            { layer: "Base Model", desc: "SD/SDXL/Wan 2.6 foundation", color: "bg-white/10", active: true, stackKey: null },
            { layer: "Motion Module", desc: "AnimateDiff / Wan temporal", color: "bg-white/10", active: true, stackKey: null },
            { layer: "Style LoRA", desc: "Art style consistency", color: "bg-purple-500/20", active: true, stackKey: "style" as const },
            { layer: "Appearance LoRA", desc: "Character visual identity", color: "bg-[var(--accent-cyan)]/20", active: true, stackKey: "appearance" as const },
            { layer: "Motion LoRA", desc: "Character animation patterns", color: "bg-cyan/20", active: s.hasMotionLora, stackKey: "motion" as const },
            { layer: "Environment LoRA", desc: "Scene-specific environment", color: "bg-[var(--accent-gold)]/20", active: false, stackKey: "environment" as const },
          ].map((item, i) => (
            <div
              key={item.layer}
              className={cn(
                "flex items-center gap-3 py-2 px-3 rounded-lg text-sm transition-opacity",
                item.active ? "opacity-100" : "opacity-40"
              )}
            >
              <div className={cn("w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold", item.color)}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs">{item.layer}</div>
                <div className="text-[10px] text-muted-foreground">{item.desc}</div>
              </div>
              {item.active ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
