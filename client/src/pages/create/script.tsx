import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight, ArrowLeft, Sparkles, Loader2, FileText, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

export default function WizardScript() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { data: project } = trpc.projects.get.useQuery(
    { id: numId },
    { enabled: !isNaN(numId) }
  );

  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery(
    { projectId: numId },
    { enabled: !isNaN(numId) }
  );

  const generateMut = trpc.episodes.generateScript.useMutation();
  const [generating, setGenerating] = useState(false);
  const [title, setTitle] = useState(project?.title || "Untitled Project");

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    if (episodes.length > 0 && episodes.some((e: any) => e.status === "approved" || e.status === "generated")) s.add(2);
    return s;
  }, [project, episodes]);

  const handleGenerate = async () => {
    if (generating || isNaN(numId)) return;
    setGenerating(true);
    try {
      await generateMut.mutateAsync({
        projectId: numId,
        episodeNumbers: [episodes.length + 1],
        styleNotes: "",
      });
    } catch (e) {
      console.error("Script generation failed:", e);
    }
    setGenerating(false);
  };

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
          </p>
        </div>

        {/* Episode list */}
        <div className="space-y-3">
          {episodes.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
              <FileText className="w-10 h-10 text-white/10 mx-auto mb-4" />
              <p className="text-white/30 text-sm mb-4">No episodes yet. Generate your first one.</p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-lavender text-white text-sm font-semibold"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {generating ? "Generating..." : "Generate Episode 1"}
              </motion.button>
            </div>
          ) : (
            <>
              {episodes.map((ep: any, i: number) => (
                <div
                  key={ep.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/15 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-white/30 font-mono">EP {String(i + 1).padStart(2, "0")}</span>
                      <h3 className="text-sm font-semibold text-white/80 mt-0.5">
                        {ep.title || `Episode ${i + 1}`}
                      </h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        ep.status === "approved"
                          ? "bg-token-mint/10 text-token-mint"
                          : ep.status === "generated"
                          ? "bg-token-cyan/10 text-token-cyan"
                          : ep.status === "generating"
                          ? "bg-token-gold/10 text-token-gold"
                          : "bg-white/5 text-white/40"
                      }`}
                    >
                      {ep.status}
                    </span>
                  </div>
                  {ep.synopsis && (
                    <p className="text-xs text-white/30 mt-2 line-clamp-2">{ep.synopsis}</p>
                  )}
                </div>
              ))}

              {/* Add more */}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full p-4 rounded-2xl border border-dashed border-white/10 text-white/30 hover:text-white/50 hover:border-white/20 transition-all flex items-center justify-center gap-2 text-sm"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {generating ? "Generating..." : "Generate Next Episode"}
              </button>
            </>
          )}
        </div>

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
            whileHover={{ scale: episodes.length > 0 ? 1.02 : 1 }}
            whileTap={{ scale: episodes.length > 0 ? 0.98 : 1 }}
            onClick={() => episodes.length > 0 && navigate(`/create/panels?projectId=${projectId}`)}
            disabled={episodes.length === 0}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              episodes.length > 0
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
