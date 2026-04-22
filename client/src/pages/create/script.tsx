import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, ArrowRight, ArrowLeft, Sparkles, Loader2,
  FileText, Wand2, ChevronDown, ChevronUp, Check,
  CheckCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";
import { ScriptEditor } from "@/components/awakli/ScriptEditor";

// ─── Analytics helper ────────────────────────────────────────────────────
function trackEvent(name: string, props?: Record<string, unknown>) {
  if (typeof window !== "undefined" && (window as any).__awakli_track) {
    (window as any).__awakli_track(name, props);
  }
}

// ─── Main component ──────────────────────────────────────────────────────
export default function WizardScript() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const utils = trpc.useUtils();

  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) }
  );

  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) }
  );

  // Fetch scenes for the first episode (primary script)
  const primaryEpisode = episodes[0];
  const { data: scenesData, isLoading: scenesLoading } = trpc.episodes.getScenes.useQuery(
    { episodeId: primaryEpisode?.id ?? 0 },
    { enabled: !!primaryEpisode?.id }
  );

  const generateMut = trpc.episodes.generateScript.useMutation();

  const [generating, setGenerating] = useState(false);
  const { advance, advancing } = useAdvanceStage(projectId, 1);
  const [styleNotes, setStyleNotes] = useState("");
  const [showStyleNotes, setShowStyleNotes] = useState(false);
  const [title, setTitle] = useState(project?.title || "Untitled Project");
  const [allApproved, setAllApproved] = useState(false);
  const [scenes, setScenes] = useState<any[]>([]);

  // Track page open
  useEffect(() => {
    trackEvent("stage1_open", { projectId });
  }, [projectId]);

  // Sync scenes from server
  useEffect(() => {
    if (scenesData?.scenes) {
      setScenes(scenesData.scenes);
      setAllApproved(scenesData.allApproved ?? false);
    }
  }, [scenesData]);

  // Poll for generating episodes
  const hasGenerating = episodes.some((e: any) => e.status === "generating");
  useEffect(() => {
    if (!hasGenerating) return;
    const interval = setInterval(() => {
      utils.episodes.listByProject.invalidate({ projectId: numId });
      if (primaryEpisode?.id) {
        utils.episodes.getScenes.invalidate({ episodeId: primaryEpisode.id });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [hasGenerating, numId, primaryEpisode?.id, utils]);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (episodes.length > 0 && episodes.some((e: any) => e.status === "approved" || e.status === "locked")) s.add(1);
    return s;
  }, [project, episodes]);

  const handleGenerate = useCallback(async () => {
    if (generating || isNaN(numId)) return;
    setGenerating(true);
    try {
      const nextEp = episodes.length + 1;
      await generateMut.mutateAsync({
        projectId: numId,
        episodeNumbers: [nextEp],
        styleNotes: styleNotes || undefined,
      });
      toast.success("Script generation started", {
        description: "AI is writing your script. This may take 30-60 seconds.",
      });
      utils.episodes.listByProject.invalidate({ projectId: numId });
      trackEvent("stage1_scene_edit", { action: "generate", projectId });
      trackEvent("stage1_scene_regen", { projectId, sceneIndex: episodes.length, credits: 0 });
    } catch (e: any) {
      toast.error("Script generation failed", {
        description: e.message || "Please try again.",
      });
    }
    setGenerating(false);
  }, [generating, numId, episodes.length, styleNotes, generateMut, utils, projectId]);

  const handleScenesChange = useCallback((newScenes: any[]) => {
    setScenes(newScenes);
  }, []);

  const handleAllApproved = useCallback(() => {
    setAllApproved(true);
    trackEvent("stage1_approve_all", { projectId });
  }, [projectId]);

  const handleProceed = useCallback(() => {
    if (!allApproved || advancing) return;
    trackEvent("stage1_proceed", { projectId });
    advance();
  }, [allApproved, advancing, projectId, advance]);

  // Determine page state
  const isGeneratingScript = hasGenerating || generating;
  const hasScript = scenes.length > 0;
  const canProceed = allApproved && hasScript;

  return (
    <CreateWizardLayout
      stage={1}
      projectId={projectId}
      projectTitle={project?.title || title}
      onTitleChange={setTitle}
      completedStages={completedStages}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-lavender text-xs font-semibold uppercase tracking-widest">
            <BookOpen className="w-3.5 h-3.5" />
            Stage 02 — Script
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Your script
          </h1>
          <p className="text-white/40 text-sm">
            Read it. Change anything. Nothing expensive happens here.
          </p>
        </div>

        {/* Style notes toggle */}
        {!hasScript && (
          <div>
            <button
              onClick={() => setShowStyleNotes(!showStyleNotes)}
              className="flex items-center gap-2 text-xs text-white/40 hover:text-white/60 transition-all"
            >
              <Wand2 className="w-3.5 h-3.5" />
              {showStyleNotes ? "Hide style notes" : "Add style notes for AI"}
              {showStyleNotes ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <AnimatePresence>
              {showStyleNotes && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <textarea
                    value={styleNotes}
                    onChange={(e) => setStyleNotes(e.target.value)}
                    placeholder="E.g., 'Focus on dramatic dialogue, include a plot twist in the middle, keep action scenes fast-paced...'"
                    rows={3}
                    className="w-full mt-3 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white/70 placeholder:text-white/15 resize-none outline-none focus:ring-2 focus:ring-token-violet/50 transition-all text-xs leading-relaxed"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Content area */}
        {!hasScript && !isGeneratingScript ? (
          /* ─── Empty state ─── */
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <FileText className="w-10 h-10 text-white/10 mx-auto mb-4" />
            <p className="text-white/30 text-sm mb-2">No script yet. Generate your first one.</p>
            <p className="text-white/15 text-xs mb-6 max-w-md mx-auto">
              The AI will create a full screenplay with scenes, panels, dialogue, and visual descriptions based on your story premise.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-lavender text-white text-sm font-semibold disabled:opacity-50"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? "Generating..." : "Generate Script"}
            </motion.button>
          </div>
        ) : isGeneratingScript && !hasScript ? (
          /* ─── Generating skeleton state ─── */
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-2xl bg-white/[0.03] border border-white/5 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
                    <div className="h-2 w-2/3 bg-white/[0.03] rounded animate-pulse" />
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <div className="h-2 w-full bg-white/[0.02] rounded animate-pulse" />
                  <div className="h-2 w-4/5 bg-white/[0.02] rounded animate-pulse" />
                  <div className="h-2 w-3/5 bg-white/[0.02] rounded animate-pulse" />
                </div>
              </motion.div>
            ))}
            <div className="flex items-center justify-center py-4 text-white/20 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              AI is writing your script...
            </div>
          </div>
        ) : (
          /* ─── Script Editor ─── */
          <>
            {primaryEpisode && (
              <ScriptEditor
                episodeId={primaryEpisode.id}
                scenes={scenes}
                locked={primaryEpisode.status === "locked"}
                onScenesChange={handleScenesChange}
                onAllApproved={handleAllApproved}
              />
            )}
          </>
        )}

        {/* Approval status bar */}
        {hasScript && !allApproved && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-token-gold/5 border border-token-gold/10"
          >
            <CheckCheck className="w-4 h-4 text-token-gold flex-shrink-0" />
            <p className="text-token-gold text-xs flex-1">
              Approve all scenes to proceed. Edits here are free — changes after this stage cost credits.
            </p>
          </motion.div>
        )}

        {hasScript && allApproved && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-token-mint/5 border border-token-mint/10"
          >
            <Check className="w-4 h-4 text-token-mint flex-shrink-0" />
            <p className="text-token-mint text-xs flex-1">
              All scenes approved. Ready to draw your panels.
            </p>
          </motion.div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/input?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: canProceed && !advancing ? 1.02 : 1 }}
            whileTap={{ scale: canProceed && !advancing ? 0.98 : 1 }}
            onClick={handleProceed}
            disabled={!canProceed || advancing}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              canProceed && !advancing
                ? "bg-gradient-to-r from-token-mint to-token-cyan text-white shadow-[0_4px_20px_rgba(0,240,255,0.2)]"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            {advancing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Advancing...
              </>
            ) : (
              <>
                Draw my panels →
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
