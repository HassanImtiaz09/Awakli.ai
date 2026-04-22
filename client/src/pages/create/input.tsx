/**
 * Stage 0 · Input — Text-only (Apprentice)
 *
 * Magical IdeaPrompt textarea with conic-gradient frame,
 * LengthPicker (20/30/40 pills), locked ChapterPicker,
 * and "Summon script →" CTA.
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, Lock, BookOpen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import IdeaPrompt from "@/components/awakli/IdeaPrompt";
import LengthPicker from "@/components/awakli/LengthPicker";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MIN_CHARS = 40;
const MAX_CHARS = 2000;

export default function WizardInput() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectIdParam = params.get("projectId");
  const promptParam = params.get("prompt");

  const [prompt, setPrompt] = useState(promptParam || "");
  const [panelCount, setPanelCount] = useState(20);
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(
    projectIdParam && projectIdParam !== "new"
      ? parseInt(projectIdParam, 10)
      : null
  );
  const [title, setTitle] = useState("Untitled Project");

  const createMut = trpc.projects.create.useMutation();
  const { advance, advancing } = useAdvanceStage(String(projectId || ""), 0);

  // Load existing project if projectId is set
  const { data: project } = trpc.projects.get.useQuery(
    { id: projectId! },
    { enabled: !!projectId && !isNaN(projectId) }
  );

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setPrompt(project.originalPrompt || project.description || "");
    }
  }, [project]);

  // Auto-provision draft project on first visit
  useEffect(() => {
    if (projectIdParam === "new" && user && !creating) {
      setCreating(true);
      createMut
        .mutateAsync({
          title: "Untitled Project",
          description: promptParam || undefined,
        })
        .then(({ id }) => {
          setProjectId(id);
          navigate(`/create/input?projectId=${id}`, { replace: true });
          setCreating(false);
        })
        .catch(() => setCreating(false));
    }
  }, [projectIdParam, user]);

  // Emit stage0_open analytics on mount
  useEffect(() => {
    emitAnalytics("stage0_open");
  }, []);

  const isValid = prompt.trim().length >= MIN_CHARS;
  const isOverCap = prompt.length > MAX_CHARS;
  const canProceed = isValid && !isOverCap;

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (canProceed) s.add(0);
    return s;
  }, [canProceed]);

  const autosaveData = useMemo(() => {
    if (!projectId) return null;
    return {
      title,
      description: prompt,
      panelCount,
    };
  }, [projectId, title, prompt, panelCount]);

  const handleSummon = async () => {
    if (!canProceed || !projectId) return;
    emitAnalytics("stage0_idea_submit", {
      charCount: prompt.length,
      panelCount,
    });
    await advance({
      inputs: { prompt, panelCount, title },
    });
  };

  if (creating) {
    return (
      <CreateWizardLayout stage={0} projectId="new" projectTitle="Creating...">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-token-violet" />
        </div>
      </CreateWizardLayout>
    );
  }

  return (
    <CreateWizardLayout
      stage={0}
      projectId={String(projectId || "new")}
      projectTitle={title}
      onTitleChange={setTitle}
      autosaveData={autosaveData}
      completedStages={completedStages}
      unsavedChanges={prompt !== (project?.description || "")}
    >
      <div className="max-w-3xl mx-auto space-y-10 py-4">
        {/* ─── Hero Headline ────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90 leading-tight">
            Tonight, your idea becomes{" "}
            <span className="bg-gradient-to-r from-token-cyan via-token-violet to-token-magenta bg-clip-text text-transparent">
              anime
            </span>
            .
          </h1>
        </div>

        {/* ─── IdeaPrompt (magical textarea) ────────────────────────── */}
        <IdeaPrompt
          value={prompt}
          onChange={setPrompt}
          minChars={MIN_CHARS}
          maxChars={MAX_CHARS}
          placeholder="A rain-soaked rooftop. Two rivals. One city. Go\u2026"
        />

        {/* ─── Controls Row ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-6 sm:items-end sm:justify-between">
          {/* Left: Length + Chapter pickers */}
          <div className="space-y-5 flex-1">
            {/* Length Picker */}
            <LengthPicker
              value={panelCount}
              onChange={setPanelCount}
              allUnlocked={false}
            />

            {/* Chapter Picker (locked for Apprentice) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                Chapters
              </label>
              <div className="flex gap-2">
                {/* Active chapter */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-token-violet/10 text-token-violet text-sm font-medium ring-1 ring-token-violet/30">
                  <BookOpen className="w-3.5 h-3.5" />
                  Chapter 1
                </div>

                {/* Locked multi-chapter */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] text-white/20 text-sm border border-white/5 cursor-not-allowed">
                      <Lock className="w-3 h-3" />
                      Multi-chapter
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs"
                  >
                    Multi-chapter stories are part of Mangaka — upgrade to unlock
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Right: Summon button */}
          <div className="flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <motion.button
                    whileHover={{
                      scale: canProceed && !advancing ? 1.02 : 1,
                    }}
                    whileTap={{
                      scale: canProceed && !advancing ? 0.97 : 1,
                    }}
                    onClick={handleSummon}
                    disabled={!canProceed || advancing}
                    className={`flex items-center gap-2.5 px-8 py-3.5 rounded-2xl font-semibold text-sm transition-all whitespace-nowrap ${
                      canProceed && !advancing
                        ? "bg-gradient-to-r from-token-mint to-token-cyan text-[#0B0B18] shadow-[0_4px_24px_rgba(0,229,160,0.25)]"
                        : "bg-white/5 text-white/20 cursor-not-allowed"
                    }`}
                  >
                    {advancing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Summoning...
                      </>
                    ) : (
                      <>
                        Summon script
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </div>
              </TooltipTrigger>
              {!canProceed && !advancing && (
                <TooltipContent
                  side="top"
                  className="bg-[#1A1A2E] border-white/10 text-white/70 text-xs max-w-[260px]"
                >
                  {isOverCap
                    ? "Your idea is over 2,000 characters — trim it down a bit"
                    : "Give us a bit more to work with — at least 40 characters"}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>

        {/* ─── Dynamic Cost Hint ──────────────────────────────────────────── */}
        <CostHint panelCount={panelCount} />
      </div>
    </CreateWizardLayout>
  );
}
// ─── Dynamic Cost Hint Component ─────────────────────────────────────────────
function CostHint({ panelCount }: { panelCount: number }) {
  const { user } = useAuth();
  const { data: creditData } = trpc.projects.creditBalance.useQuery(undefined, {
    enabled: !!user,
  });

  // Scale costs based on panel count (base costs are for 20 panels)
  const scaleFactor = panelCount / 20;

  // Stage 0 cost (input → setup) is always 0 from server
  const stageCost = creditData?.stageCosts?.[0]?.cost ?? 0;

  // Total project forecast: scale panel-dependent stages by panel count
  // Stages 2 (script→panels) and 3 (panels→gate) scale with panel count
  // Stages 0,1 (free) and 4 (free gate) don't scale
  // Stage 5 (video→publish) scales with panel count
  const baseTotalCost = creditData?.totalProjectCost ?? 17;
  const scalableCosts = (creditData?.stageCosts ?? []).reduce(
    (sum: number, s: { cost: number; stage: number }) =>
      [2, 3, 5].includes(s.stage) ? sum + s.cost : sum,
    0
  );
  const fixedCosts = baseTotalCost - scalableCosts;
  const scaledTotal = Math.round(fixedCosts + scalableCosts * scaleFactor);

  const balance = creditData?.balance ?? 0;
  const canAfford = balance >= scaledTotal;

  return (
    <div className="text-center">
      <p className="text-[11px] text-white/20">
        This stage: {stageCost === 0 ? "free" : `${stageCost}c`}
        {" \u00b7 "}
        full project forecast:{" "}
        <span className={canAfford ? "text-token-mint/40" : "text-red-400/50"}>
          ~{scaledTotal}c
        </span>
        {panelCount > 20 && (
          <span className="text-white/15"> ({panelCount} panels)</span>
        )}
      </p>
    </div>
  );
}

// ─── Analytics Helper ─────────────────────────────────────────────────────────
function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
