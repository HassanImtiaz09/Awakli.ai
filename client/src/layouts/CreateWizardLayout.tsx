import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pen, Settings2, BookOpen, LayoutGrid, Shield, Film, Send,
  Lock, Check, ChevronLeft, HelpCircle, Loader2, AlertCircle,
  Home, ChevronRight, CreditCard, Zap, ChevronDown,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageBackground from "@/components/awakli/PageBackground";
import { UpgradeModalBus } from "@/components/awakli/UpgradeModal";

/* ─── Stage definitions ──────────────────────────────────────────────── */
export const STAGES = [
  { key: "input",      label: "Input",      icon: Pen,        path: "input" },
  { key: "setup",      label: "Setup",      icon: Settings2,  path: "setup" },
  { key: "script",     label: "Script",     icon: BookOpen,   path: "script" },
  { key: "panels",     label: "Panels",     icon: LayoutGrid, path: "panels" },
  { key: "anime-gate", label: "Gate",       icon: Shield,     path: "anime-gate" },
  { key: "video",      label: "Video",      icon: Film,       path: "video" },
  { key: "publish",    label: "Publish",    icon: Send,       path: "publish" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

const BG_URL = "https://manus-storage.oss-cn-beijing.aliyuncs.com/user-file/e7a2e5e5c8f2e3a4b6d8c9f1a3b5d7e9/page-bg-create.png";

/* ─── Autosave hook ──────────────────────────────────────────────────── */
function useAutosave(projectId: number | null, data: Record<string, unknown> | null) {
  const updateMut = trpc.projects.update.useMutation();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dataRef = useRef(data);
  const dirtyRef = useRef(false);

  useEffect(() => { dataRef.current = data; dirtyRef.current = true; }, [data]);

  const doSave = useCallback(async () => {
    if (!projectId || !dataRef.current || !dirtyRef.current) return;
    setSaveStatus("saving");
    try {
      await updateMut.mutateAsync({ id: projectId, ...dataRef.current });
      dirtyRef.current = false;
      setSaveStatus("saved");
      setLastSaved(new Date());
      // Analytics: wizard_autosave_ok
    } catch {
      setSaveStatus("error");
      // Analytics: wizard_autosave_fail
    }
  }, [projectId, updateMut]);

  useEffect(() => {
    if (!projectId) return;
    timerRef.current = setInterval(doSave, 8000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [projectId, doSave]);

  return { saveStatus, lastSaved, forceSave: doSave };
}

/* ─── Save indicator text ────────────────────────────────────────────── */
function saveLabel(status: string, lastSaved: Date | null): string {
  if (status === "saving") return "Saving...";
  if (status === "error") return "Couldn't save — we'll retry in 5s";
  if (status === "saved" && lastSaved) {
    const secs = Math.round((Date.now() - lastSaved.getTime()) / 1000);
    if (secs < 5) return "Saved · just now";
    return `Saved · ${secs}s ago`;
  }
  return "";
}

/* ─── StageRail (vertical, desktop) ──────────────────────────────────── */
function StageRail({
  currentStage,
  completedStages,
  projectId,
}: {
  currentStage: number;
  completedStages: Set<number>;
  projectId: string;
}) {
  const [, navigate] = useLocation();

  return (
    <nav className="hidden lg:flex flex-col items-center gap-8 py-10 border-r border-white/5 bg-black/20 backdrop-blur-sm">
      {STAGES.map((s, i) => {
        const isCurrent = i === currentStage;
        const isComplete = completedStages.has(i);
        const isLocked = i > 0 && !completedStages.has(i - 1) && i !== currentStage;
        const Icon = s.icon;

        return (
          <button
            key={s.key}
            onClick={() => {
              if (!isLocked) {
                navigate(`/create/${s.path}?projectId=${projectId}`);
              }
            }}
            disabled={isLocked}
            className="group relative flex flex-col items-center gap-1.5"
            title={isLocked ? "Complete the previous stage first" : s.label}
          >
            {/* Connector line above */}
            {i > 0 && (
              <div
                className={`absolute -top-5 w-px h-4 transition-colors ${
                  isComplete || isCurrent ? "bg-token-cyan/60" : "bg-white/10"
                }`}
              />
            )}

            {/* Node */}
            <motion.div
              animate={isCurrent ? { scale: 1.08 } : { scale: 1 }}
              className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                isCurrent
                  ? "bg-token-violet/30 ring-2 ring-token-violet shadow-[0_0_20px_rgba(107,91,255,0.4)]"
                  : isComplete
                  ? "bg-token-mint/20 ring-2 ring-token-mint"
                  : isLocked
                  ? "bg-white/5 ring-1 ring-white/10 opacity-40 cursor-not-allowed"
                  : "bg-white/5 ring-1 ring-white/10 hover:ring-white/30"
              }`}
            >
              {isComplete ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.4 }}
                >
                  <Check className="w-4 h-4 text-token-mint" />
                </motion.div>
              ) : isLocked ? (
                <Lock className="w-3.5 h-3.5 text-white/30" />
              ) : (
                <Icon className={`w-4 h-4 ${isCurrent ? "text-token-violet" : "text-white/50"}`} />
              )}
            </motion.div>

            {/* Label */}
            <span
              className={`text-[10px] font-medium tracking-wider uppercase transition-colors ${
                isCurrent
                  ? "text-token-violet"
                  : isComplete
                  ? "text-token-mint"
                  : isLocked
                  ? "text-white/20"
                  : "text-white/40"
              }`}
            >
              {s.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ─── StageRail (horizontal, mobile) ─────────────────────────────────── */
function MobileStageStrip({
  currentStage,
  completedStages,
  projectId,
}: {
  currentStage: number;
  completedStages: Set<number>;
  projectId: string;
}) {
  const [, navigate] = useLocation();

  return (
    <nav className="flex lg:hidden items-center justify-center gap-2 px-4 py-3 border-b border-white/5 bg-black/30 backdrop-blur-sm overflow-x-auto">
      {STAGES.map((s, i) => {
        const isCurrent = i === currentStage;
        const isComplete = completedStages.has(i);
        const isLocked = i > 0 && !completedStages.has(i - 1) && i !== currentStage;
        const Icon = s.icon;

        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div className={`w-4 h-px ${isComplete ? "bg-token-mint/40" : "bg-white/10"}`} />
            )}
            <button
              onClick={() => {
                if (!isLocked) navigate(`/create/${s.path}?projectId=${projectId}`);
              }}
              disabled={isLocked}
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                isCurrent
                  ? "bg-token-violet/30 ring-2 ring-token-violet"
                  : isComplete
                  ? "bg-token-mint/20 ring-1 ring-token-mint"
                  : isLocked
                  ? "bg-white/5 opacity-30"
                  : "bg-white/5 ring-1 ring-white/10"
              }`}
              title={isLocked ? "Complete the previous stage first" : s.label}
            >
              {isComplete ? (
                <Check className="w-3 h-3 text-token-mint" />
              ) : isLocked ? (
                <Lock className="w-3 h-3 text-white/30" />
              ) : (
                <Icon className={`w-3 h-3 ${isCurrent ? "text-token-violet" : "text-white/40"}`} />
              )}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* ─── TopStatusBar ───────────────────────────────────────────────────── */
function TopStatusBar({
  projectTitle,
  onTitleChange,
  saveStatus,
  lastSaved,
  currentStage,
  unsavedChanges,
}: {
  projectTitle: string;
  onTitleChange: (title: string) => void;
  saveStatus: string;
  lastSaved: Date | null;
  currentStage: number;
  unsavedChanges: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(projectTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setEditValue(projectTitle); }, [projectTitle]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commitTitle = () => {
    setEditing(false);
    if (editValue.trim() && editValue !== projectTitle) {
      onTitleChange(editValue.trim());
    } else {
      setEditValue(projectTitle);
    }
  };

  const label = saveLabel(saveStatus, lastSaved);

  return (
    <div className="flex items-center justify-between px-4 lg:px-6 py-3 border-b border-white/5 bg-black/20 backdrop-blur-sm">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Link href="/" className="text-white/40 hover:text-white/60 transition-colors">
          Home
        </Link>
        <ChevronRight className="w-3 h-3 text-white/20 flex-shrink-0" />
        <Link href="/create" className="text-white/40 hover:text-white/60 transition-colors">
          Create
        </Link>
        <ChevronRight className="w-3 h-3 text-white/20 flex-shrink-0" />
        <span className="text-white/70 truncate">{STAGES[currentStage]?.label}</span>
      </div>

      {/* Title (editable) */}
      <div className="flex items-center gap-3 min-w-0 max-w-md">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setEditing(false); setEditValue(projectTitle); } }}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white/90 outline-none focus:ring-1 focus:ring-token-violet w-48"
            maxLength={255}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors truncate"
          >
            <span className="truncate">{projectTitle || "Untitled Project"}</span>
            {unsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />
            )}
          </button>
        )}

        {/* Save indicator */}
        {label && (
          <span
            className={`text-xs flex-shrink-0 ${
              saveStatus === "error"
                ? "text-red-400"
                : saveStatus === "saving"
                ? "text-white/40"
                : "text-token-mint/70"
            }`}
          >
            {saveStatus === "saving" && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
            {saveStatus === "error" && <AlertCircle className="w-3 h-3 inline mr-1" />}
            {label}
          </span>
        )}
      </div>

      {/* Help */}
      <button className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5">
        <HelpCircle className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ─── Credit Meter (right sidebar) ───────────────────────────────────── */
// Fallback stage costs (used only if server data hasn't loaded yet)
const FALLBACK_STAGE_COSTS: { label: string; cost: number }[] = [
  { label: "Input → Setup", cost: 0 },
  { label: "Setup → Script", cost: 0 },
  { label: "Script → Panels", cost: 2 },
  { label: "Panels → Gate", cost: 5 },
  { label: "Gate → Video", cost: 0 },
  { label: "Video → Publish", cost: 10 },
];

// Stage transition display names
const STAGE_LABELS: Record<string, string> = {
  input: "Input → Setup",
  setup: "Setup → Script",
  script: "Script → Panels",
  panels: "Panels → Gate",
  "anime-gate": "Gate → Video",
  video: "Video → Publish",
  publish: "Complete",
};

function CreditMeter() {
  const { user } = useAuth();
  const { data: creditData, isLoading } = trpc.projects.creditBalance.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000, // refresh every 30s
  });

  const balance = creditData?.balance ?? 0;
  const monthlyGrant = creditData?.monthlyGrant ?? 15;
  const used = Math.max(0, monthlyGrant - balance);
  const pct = monthlyGrant > 0 ? Math.round((used / monthlyGrant) * 100) : 0;
  const totalProjectCost = creditData?.totalProjectCost ?? 17;

  // Use server-provided stage costs or fallback
  const stageCosts = creditData?.stageCosts
    ? creditData.stageCosts
        .filter((s: { label: string }) => s.label !== "publish") // publish has no transition cost
        .map((s: { label: string; cost: number }) => ({
          label: STAGE_LABELS[s.label] || s.label,
          cost: s.cost,
        }))
    : FALLBACK_STAGE_COSTS;

  return (
    <div className="hidden lg:flex flex-col gap-6 p-6 border-l border-white/5 bg-white/[0.02] backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-token-gold" />
        <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Credits</span>
      </div>

      {/* Balance display */}
      {isLoading ? (
        <div className="space-y-2">
          <div className="h-8 w-20 bg-white/5 rounded animate-pulse" />
          <div className="h-2 bg-white/5 rounded-full animate-pulse" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <motion.span
              key={balance}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-bold text-white/90 tabular-nums"
            >
              {balance}
            </motion.span>
            <span className="text-xs text-white/30">remaining</span>
          </div>

          {/* Bar */}
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  balance <= 3
                    ? "bg-gradient-to-r from-red-500 to-red-400"
                    : "bg-gradient-to-r from-token-cyan to-token-violet"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${100 - pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/40">
              <span>{used} used</span>
              <span>{balance} left</span>
            </div>
          </div>
        </>
      )}

      {/* Per-stage cost estimates */}
      <div className="space-y-2.5 mt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Stage Costs</span>
        {stageCosts.map((s: { label: string; cost: number }, i: number) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-white/40">{s.label}</span>
            <span className={`font-medium ${
              s.cost === 0
                ? "text-token-mint/60"
                : s.cost > balance
                ? "text-red-400/80"
                : "text-white/60"
            }`}>
              {s.cost === 0 ? "Free" : `${s.cost} cr`}
            </span>
          </div>
        ))}
        {/* Total project forecast */}
        <div className="flex items-center justify-between text-xs pt-2 mt-1 border-t border-white/5">
          <span className="text-white/50 font-medium">Full project</span>
          <span className={`font-semibold ${
            totalProjectCost > balance ? "text-red-400/80" : "text-token-cyan/80"
          }`}>
            ~{totalProjectCost} cr
          </span>
        </div>
      </div>

      {/* Low balance warning */}
      {!isLoading && balance <= 3 && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/10">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300/70 leading-relaxed">
            Low credits. Upgrade your plan to continue creating.
          </p>
        </div>
      )}

      {/* Upgrade CTA */}
      <button
        onClick={() => balance <= 3 ? UpgradeModalBus.openCredits() : UpgradeModalBus.openVoluntary()}
        className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-token-violet/20 to-token-cyan/20 border border-token-violet/20 text-sm text-white/70 hover:text-white transition-all hover:border-token-violet/40 w-full"
      >
        <Zap className="w-3.5 h-3.5" />
        {balance <= 3 ? "Top Up Credits" : "Upgrade Plan"}
      </button>
    </div>
  );
}

/* ─── Mobile Credit Bottom Sheet ─────────────────────────────────────── */
function MobileCreditSheet() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { data: creditData } = trpc.projects.creditBalance.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const balance = creditData?.balance ?? 0;
  const totalProjectCost = creditData?.totalProjectCost ?? 17;

  // Use server-provided stage costs or fallback
  const mobileStageCosts = creditData?.stageCosts
    ? creditData.stageCosts
        .filter((s: { label: string }) => s.label !== "publish")
        .map((s: { label: string; cost: number }) => ({
          label: STAGE_LABELS[s.label] || s.label,
          cost: s.cost,
        }))
    : FALLBACK_STAGE_COSTS;

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/80 border border-white/10 backdrop-blur-sm shadow-lg"
      >
        <CreditCard className="w-4 h-4 text-token-gold" />
        <span className="text-xs font-medium text-white/70">{balance} credits</span>
        <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-30 p-6 rounded-t-3xl bg-[#0D0D1A] border-t border-white/10 backdrop-blur-xl"
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-token-gold" />
                <span className="text-sm font-semibold text-white/80">Credit Balance</span>
              </div>
              <span className="text-lg font-bold text-white/90 tabular-nums">{balance}</span>
            </div>

            {/* Per-stage costs */}
            <div className="space-y-2 mb-4">
              {mobileStageCosts.map((s: { label: string; cost: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-white/40">{s.label}</span>
                  <span className={`font-medium ${
                    s.cost === 0 ? "text-token-mint/60" : s.cost > balance ? "text-red-400/80" : "text-white/60"
                  }`}>
                    {s.cost === 0 ? "Free" : `${s.cost} cr`}
                  </span>
                </div>
              ))}
              {/* Total project forecast */}
              <div className="flex items-center justify-between text-xs pt-2 mt-1 border-t border-white/5">
                <span className="text-white/50 font-medium">Full project</span>
                <span className={`font-semibold ${totalProjectCost > balance ? "text-red-400/80" : "text-token-cyan/80"}`}>
                  ~{totalProjectCost} cr
                </span>
              </div>
            </div>

            <button
              onClick={() => { setOpen(false); balance <= 3 ? UpgradeModalBus.openCredits() : UpgradeModalBus.openVoluntary(); }}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-token-violet/20 to-token-cyan/20 border border-token-violet/20 text-sm text-white/70"
            >
              <Zap className="w-3.5 h-3.5" />
              {balance <= 3 ? "Top Up Credits" : "Upgrade Plan"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Main Layout ────────────────────────────────────────────────────── */
export interface CreateWizardProps {
  stage: number;
  children: React.ReactNode;
  projectId: string;
  projectTitle?: string;
  onTitleChange?: (title: string) => void;
  autosaveData?: Record<string, unknown> | null;
  completedStages?: Set<number>;
  unsavedChanges?: boolean;
}

// ─── Analytics helper ───────────────────────────────────────────────────
function trackEvent(name: string, data?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && (window as any).__awakli_track) {
      (window as any).__awakli_track(name, data);
    }
  } catch {}
}

export default function CreateWizardLayout({
  stage,
  children,
  projectId,
  projectTitle = "Untitled Project",
  onTitleChange,
  autosaveData = null,
  completedStages = new Set<number>(),
  unsavedChanges = false,
}: CreateWizardProps) {
  const numericId = projectId && projectId !== "new" ? parseInt(projectId, 10) : null;
  const { saveStatus, lastSaved } = useAutosave(
    numericId && !isNaN(numericId) ? numericId : null,
    autosaveData
  );

  // Fire wizard_stage_enter whenever the stage changes
  const stageRef = useRef(stage);
  useEffect(() => {
    const stageKey = STAGES[stage]?.key ?? String(stage);
    trackEvent("wizard_stage_enter", {
      stage: stageKey,
      stageIndex: stage,
      projectId,
    });
    stageRef.current = stage;
  }, [stage, projectId]);

  return (
    <div className="relative min-h-screen bg-[#05050C]">
      <PageBackground src={BG_URL} opacity={0.15} />

      {/* Top status bar */}
      <div className="relative z-10">
        <TopStatusBar
          projectTitle={projectTitle}
          onTitleChange={onTitleChange ?? (() => {})}
          saveStatus={saveStatus}
          lastSaved={lastSaved}
          currentStage={stage}
          unsavedChanges={unsavedChanges}
        />
      </div>

      {/* Mobile stage strip */}
      <div className="relative z-10">
        <MobileStageStrip
          currentStage={stage}
          completedStages={completedStages}
          projectId={projectId}
        />
      </div>

      {/* Three-column grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[88px_1fr_320px] min-h-[calc(100vh-49px)] lg:min-h-[calc(100vh-49px)]">
        {/* Left rail */}
        <StageRail
          currentStage={stage}
          completedStages={completedStages}
          projectId={projectId}
        />

        {/* Center canvas */}
        <main className="px-4 lg:px-12 py-6 lg:py-10 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Right credit meter */}
        <CreditMeter />
      </div>

      {/* Mobile credit sheet */}
      <MobileCreditSheet />
    </div>
  );
}
