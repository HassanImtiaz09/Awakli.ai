import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Film, ArrowRight, ArrowLeft, Play, Pause, Volume2, Loader2, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

export default function WizardVideo() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { data: project } = trpc.projects.get.useQuery({ id: numId }, { enabled: !isNaN(numId) });

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    if (project?.description && project?.genre) s.add(0);
    if (project?.animeStyle && project?.animeStyle !== "default" && project?.tone) s.add(1);
    s.add(2); s.add(3); s.add(4);
    return s;
  }, [project]);

  const [rendering, setRendering] = useState(false);

  return (
    <CreateWizardLayout
      stage={5}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-magenta text-xs font-semibold uppercase tracking-widest">
            <Film className="w-3.5 h-3.5" />
            Stage 06 — Video Production
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Produce your anime
          </h1>
          <p className="text-white/40 text-sm">
            Configure animation settings and render your manga panels into a full anime episode.
          </p>
        </div>

        {/* Video preview area */}
        <div className="aspect-video rounded-3xl bg-black/40 border border-white/5 overflow-hidden relative flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
              <Play className="w-8 h-8 text-white/20 ml-1" />
            </div>
            <p className="text-white/30 text-sm">Video preview will appear here after rendering</p>
          </div>
        </div>

        {/* Render settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/60">
              <Settings className="w-4 h-4" />
              Animation Style
            </div>
            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/70 outline-none focus:ring-1 focus:ring-token-violet/50">
              <option value="smooth">Smooth (24fps)</option>
              <option value="cinematic">Cinematic (30fps)</option>
              <option value="anime">Classic Anime (12fps)</option>
            </select>
          </div>

          <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white/60">
              <Volume2 className="w-4 h-4" />
              Voice & Sound
            </div>
            <select className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/70 outline-none focus:ring-1 focus:ring-token-violet/50">
              <option value="ai">AI Generated Voices</option>
              <option value="none">No Voice (Music Only)</option>
              <option value="narration">Narration Only</option>
            </select>
          </div>
        </div>

        {/* Render button */}
        <div className="text-center">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setRendering(true)}
            disabled={rendering}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-token-magenta to-token-violet text-white font-semibold text-sm shadow-[0_4px_24px_rgba(255,45,122,0.3)]"
          >
            {rendering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            {rendering ? "Rendering..." : "Start Rendering"}
          </motion.button>
          <p className="text-xs text-white/30 mt-3">Estimated time: 5–15 minutes per episode</p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/anime-gate?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/create/publish?projectId=${projectId}`)}
            className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold text-sm shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
          >
            Continue to Publish
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
