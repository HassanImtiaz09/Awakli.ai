import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { LayoutGrid, ArrowRight, ArrowLeft, Sparkles, Loader2, Image, Check, X, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

export default function WizardPanels() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { data: project } = trpc.projects.get.useQuery({ id: numId }, { enabled: !isNaN(numId) });
  const { data: episodes = [] } = trpc.episodes.listByProject.useQuery({ projectId: numId }, { enabled: !isNaN(numId) });

  const [selectedEp, setSelectedEp] = useState(0);
  const [generating, setGenerating] = useState(false);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    if (episodes.length > 0) s.add(2);
    return s;
  }, [project, episodes]);

  return (
    <CreateWizardLayout
      stage={3}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-cyan text-xs font-semibold uppercase tracking-widest">
            <LayoutGrid className="w-3.5 h-3.5" />
            Stage 04 — Panels
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Generate manga panels
          </h1>
          <p className="text-white/40 text-sm">
            Transform your script into visual panels. Review, approve, or regenerate each one.
          </p>
        </div>

        {/* Episode tabs */}
        {episodes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {episodes.map((ep: any, i: number) => (
              <button
                key={ep.id}
                onClick={() => setSelectedEp(i)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedEp === i
                    ? "bg-token-cyan/20 text-token-cyan ring-1 ring-token-cyan/30"
                    : "bg-white/5 text-white/40 hover:text-white/60"
                }`}
              >
                EP {String(i + 1).padStart(2, "0")}
              </button>
            ))}
          </div>
        )}

        {/* Panel generation area */}
        <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
          <Image className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 text-sm mb-2">
            {episodes.length === 0
              ? "Complete the Script stage first to generate panels."
              : "Ready to generate panels for your episodes."}
          </p>
          {episodes.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setGenerating(true)}
              disabled={generating}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-cyan to-token-violet text-white text-sm font-semibold mt-4"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating Panels..." : "Generate All Panels"}
            </motion.button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/script?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/create/anime-gate?projectId=${projectId}`)}
            className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold text-sm shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
          >
            Continue to Gate
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
