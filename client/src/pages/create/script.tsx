import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, ArrowRight, ArrowLeft, Sparkles, Loader2,
  FileText, Plus, ChevronDown, ChevronUp, Check, Lock,
  Eye, RotateCcw, Wand2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

// ─── Status badge helper ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    generating: { bg: "bg-token-gold/10", text: "text-token-gold", label: "Generating..." },
    generated: { bg: "bg-token-cyan/10", text: "text-token-cyan", label: "Generated" },
    approved: { bg: "bg-token-mint/10", text: "text-token-mint", label: "Approved" },
    locked: { bg: "bg-token-violet/10", text: "text-token-violet", label: "Locked" },
    draft: { bg: "bg-white/5", text: "text-white/40", label: "Draft" },
  };
  const c = config[status] || config.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {status === "generating" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "approved" && <Check className="w-3 h-3" />}
      {status === "locked" && <Lock className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

// ─── Scene/Panel display ─────────────────────────────────────────────────
function ScriptContent({ script }: { script: any }) {
  if (!script?.scenes) return null;
  return (
    <div className="space-y-4 mt-4">
      {script.scenes.map((scene: any) => (
        <div key={scene.scene_number} className="rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden">
          <div className="px-4 py-3 bg-white/[0.03] border-b border-white/5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white/70">
                Scene {scene.scene_number}: {scene.location}
              </h4>
              <div className="flex items-center gap-2 text-xs text-white/30">
                <span className="px-2 py-0.5 rounded-full bg-white/5">{scene.time_of_day}</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5">{scene.mood}</span>
              </div>
            </div>
            <p className="text-xs text-white/30 mt-1">{scene.description}</p>
          </div>
          <div className="divide-y divide-white/5">
            {scene.panels?.map((panel: any) => (
              <div key={panel.panel_number} className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-token-violet/10 text-token-violet text-xs font-bold flex items-center justify-center mt-0.5">
                    {panel.panel_number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/50 leading-relaxed">{panel.visual_description}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/20">
                      <span className="px-1.5 py-0.5 rounded bg-white/5">{panel.camera_angle}</span>
                      {panel.sfx && <span className="px-1.5 py-0.5 rounded bg-token-gold/10 text-token-gold">SFX: {panel.sfx}</span>}
                      {panel.transition && <span className="px-1.5 py-0.5 rounded bg-white/5">{panel.transition}</span>}
                    </div>
                    {panel.dialogue?.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {panel.dialogue.map((d: any, di: number) => (
                          <div key={di} className="text-xs">
                            <span className="font-semibold text-token-cyan">{d.character}</span>
                            <span className="text-white/20 mx-1">({d.emotion})</span>
                            <span className="text-white/60">"{d.text}"</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Episode card ────────────────────────────────────────────────────────
function EpisodeCard({
  episode,
  index,
  onApprove,
  onRegenerate,
  approving,
}: {
  episode: any;
  index: number;
  onApprove: (id: number) => void;
  onRegenerate: (id: number) => void;
  approving: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-token-violet/10 text-token-violet text-xs font-bold flex items-center justify-center font-mono">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white/80 truncate">
              {episode.title || `Episode ${index + 1}`}
            </h3>
            {episode.synopsis && (
              <p className="text-xs text-white/30 mt-0.5 line-clamp-1">{episode.synopsis}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={episode.status} />
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-white/20" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/20" />
          )}
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/5 pt-3">
              {/* Stats row */}
              {(episode.wordCount || episode.panelCount) && (
                <div className="flex gap-4 mb-3 text-xs text-white/30">
                  {episode.wordCount && <span>{episode.wordCount} words</span>}
                  {episode.panelCount && <span>{episode.panelCount} panels</span>}
                  {episode.scriptContent?.scenes && (
                    <span>{episode.scriptContent.scenes.length} scenes</span>
                  )}
                </div>
              )}

              {/* Script content */}
              {episode.scriptContent ? (
                <ScriptContent script={episode.scriptContent} />
              ) : episode.status === "generating" ? (
                <div className="flex items-center justify-center py-8 text-white/20 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI is writing your script...
                </div>
              ) : (
                <p className="text-xs text-white/20 text-center py-6">No script content yet.</p>
              )}

              {/* Action buttons */}
              {(episode.status === "generated" || episode.status === "draft") && (
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/5">
                  {episode.status === "generated" && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => { e.stopPropagation(); onApprove(episode.id); }}
                      disabled={approving === episode.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-token-mint/10 text-token-mint text-xs font-semibold hover:bg-token-mint/20 transition-all"
                    >
                      {approving === episode.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Approve & Lock
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={(e) => { e.stopPropagation(); onRegenerate(episode.id); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/40 text-xs font-medium hover:text-white/60 hover:bg-white/10 transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Regenerate
                  </motion.button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
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

  const generateMut = trpc.episodes.generateScript.useMutation();
  const approveMut = trpc.episodes.approveScript.useMutation();

  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState<number | null>(null);
  const [styleNotes, setStyleNotes] = useState("");
  const [showStyleNotes, setShowStyleNotes] = useState(false);
  const [title, setTitle] = useState(project?.title || "Untitled Project");

  // Poll for generating episodes
  const hasGenerating = episodes.some((e: any) => e.status === "generating");
  useEffect(() => {
    if (!hasGenerating) return;
    const interval = setInterval(() => {
      utils.episodes.listByProject.invalidate({ projectId: numId });
    }, 3000);
    return () => clearInterval(interval);
  }, [hasGenerating, numId, utils]);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    if (episodes.length > 0 && episodes.some((e: any) => e.status === "approved" || e.status === "generated" || e.status === "locked")) s.add(2);
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
      toast.success(`Episode ${nextEp} generation started`, {
        description: "AI is writing your script. This may take 30-60 seconds.",
      });
      // Invalidate to show the new "generating" episode
      utils.episodes.listByProject.invalidate({ projectId: numId });
    } catch (e: any) {
      toast.error("Script generation failed", {
        description: e.message || "Please try again.",
      });
    }
    setGenerating(false);
  }, [generating, numId, episodes.length, styleNotes, generateMut, utils]);

  const handleApprove = useCallback(async (episodeId: number) => {
    setApproving(episodeId);
    try {
      await approveMut.mutateAsync({ id: episodeId });
      toast.success("Episode approved and locked", {
        description: "You can now generate panels for this episode.",
      });
      utils.episodes.listByProject.invalidate({ projectId: numId });
    } catch (e: any) {
      toast.error("Failed to approve episode", { description: e.message });
    }
    setApproving(null);
  }, [approveMut, numId, utils]);

  const handleRegenerate = useCallback(async (episodeId: number) => {
    // Find the episode number
    const ep = episodes.find((e: any) => e.id === episodeId);
    if (!ep) return;
    setGenerating(true);
    try {
      await generateMut.mutateAsync({
        projectId: numId,
        episodeNumbers: [ep.episodeNumber],
        styleNotes: styleNotes || undefined,
      });
      toast.success(`Regenerating Episode ${ep.episodeNumber}`, {
        description: "AI is rewriting the script.",
      });
      utils.episodes.listByProject.invalidate({ projectId: numId });
    } catch (e: any) {
      toast.error("Regeneration failed", { description: e.message });
    }
    setGenerating(false);
  }, [episodes, numId, styleNotes, generateMut, utils]);

  const hasApprovedEpisodes = episodes.some((e: any) => e.status === "approved" || e.status === "locked");
  const canProceed = episodes.length > 0 && hasApprovedEpisodes;

  return (
    <CreateWizardLayout
      stage={2}
      projectId={projectId}
      projectTitle={project?.title || title}
      onTitleChange={setTitle}
      completedStages={completedStages}
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-lavender text-xs font-semibold uppercase tracking-widest">
            <BookOpen className="w-3.5 h-3.5" />
            Stage 03 — Script
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Write your script
          </h1>
          <p className="text-white/40 text-sm">
            Generate episodes with AI or write your own. Each episode becomes a chapter of your manga.
            Approve episodes to lock them for panel generation.
          </p>
        </div>

        {/* Style notes toggle */}
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

        {/* Episode list */}
        <div className="space-y-3">
          {episodes.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
              <FileText className="w-10 h-10 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm mb-2">No episodes yet. Generate your first one.</p>
              <p className="text-white/15 text-xs mb-6 max-w-md mx-auto">
                The AI will create a full screenplay with scenes, panels, dialogue, and visual descriptions based on your story premise.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={generating || hasGenerating}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-lavender text-white text-sm font-semibold disabled:opacity-50"
              >
                {generating || hasGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generating || hasGenerating ? "Generating..." : "Generate Episode 1"}
              </motion.button>
            </div>
          ) : (
            <>
              {episodes.map((ep: any, i: number) => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  index={i}
                  onApprove={handleApprove}
                  onRegenerate={handleRegenerate}
                  approving={approving}
                />
              ))}

              {/* Add more */}
              <button
                onClick={handleGenerate}
                disabled={generating || hasGenerating}
                className="w-full p-4 rounded-2xl border border-dashed border-white/10 text-white/30 hover:text-white/50 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {generating || hasGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {generating || hasGenerating ? "Generating..." : "Generate Next Episode"}
              </button>
            </>
          )}
        </div>

        {/* Proceed hint */}
        {episodes.length > 0 && !canProceed && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-token-gold/5 border border-token-gold/10 text-token-gold text-xs">
            <Eye className="w-4 h-4 flex-shrink-0" />
            Review and approve at least one episode to proceed to panel generation.
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/setup?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: canProceed ? 1.02 : 1 }}
            whileTap={{ scale: canProceed ? 0.98 : 1 }}
            onClick={() => canProceed && navigate(`/create/panels?projectId=${projectId}`)}
            disabled={!canProceed}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              canProceed
                ? "bg-gradient-to-r from-token-violet to-token-cyan text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            Continue to Panels
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
