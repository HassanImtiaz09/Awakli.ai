import { useState, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Loader2, Pen } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import CreateWizardLayout, { STAGES } from "@/layouts/CreateWizardLayout";
import { useAdvanceStage } from "@/hooks/useAdvanceStage";

const GENRES = [
  "Action", "Romance", "Sci-Fi", "Fantasy", "Horror",
  "Comedy", "Mystery", "Slice of Life", "Thriller", "Adventure",
];

export default function WizardInput() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectIdParam = params.get("projectId");
  const promptParam = params.get("prompt");

  const [prompt, setPrompt] = useState(promptParam || "");
  const [genre, setGenre] = useState("");
  const [creating, setCreating] = useState(false);
  const [projectId, setProjectId] = useState<number | null>(
    projectIdParam && projectIdParam !== "new" ? parseInt(projectIdParam, 10) : null
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
      setGenre(project.genre || "");
    }
  }, [project]);

  // Auto-provision draft project on first visit
  useEffect(() => {
    if (projectIdParam === "new" && user && !creating) {
      setCreating(true);
      createMut.mutateAsync({
        title: "Untitled Project",
        description: promptParam || undefined,
      }).then(({ id }) => {
        setProjectId(id);
        navigate(`/create/input?projectId=${id}`, { replace: true });
        setCreating(false);
      }).catch(() => setCreating(false));
    }
  }, [projectIdParam, user]);

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    // Stage 0 is complete when prompt is filled
    if (prompt.trim().length > 10 && genre) s.add(0);
    return s;
  }, [prompt, genre]);

  const autosaveData = useMemo(() => {
    if (!projectId) return null;
    return {
      title,
      description: prompt,
      genre,
    };
  }, [projectId, title, prompt, genre]);

  const canProceed = prompt.trim().length > 10 && genre;

  const handleNext = async () => {
    if (!canProceed || !projectId) return;
    await advance({
      inputs: { prompt, genre, title },
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
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-cyan text-xs font-semibold uppercase tracking-widest">
            <Pen className="w-3.5 h-3.5" />
            Stage 01 — Story Input
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            What's your story about?
          </h1>
          <p className="text-white/40 text-sm">
            Describe your anime concept in a few sentences. The more detail you give, the richer the script.
          </p>
        </div>

        {/* Prompt textarea */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Story Premise</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A samurai who can see 10 seconds into the future must protect a blind oracle from an army of shadow assassins..."
            rows={6}
            className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-5 py-4 text-white/90 placeholder:text-white/20 resize-none outline-none focus:ring-2 focus:ring-token-violet/50 transition-all text-sm leading-relaxed"
          />
          <div className="flex justify-between text-xs text-white/30">
            <span>{prompt.length} characters</span>
            <span>Min 10 characters</span>
          </div>
        </div>

        {/* Genre pills */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Genre</label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(genre === g ? "" : g)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  genre === g
                    ? "bg-token-violet/30 text-token-violet ring-1 ring-token-violet/50"
                    : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* AI Enhance */}
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white/50 hover:text-token-cyan hover:border-token-cyan/30 transition-all">
          <Sparkles className="w-4 h-4" />
          AI Enhance Prompt
        </button>

        {/* Next button */}
        <div className="flex justify-end pt-4">
          <motion.button
            whileHover={{ scale: canProceed && !advancing ? 1.02 : 1 }}
            whileTap={{ scale: canProceed && !advancing ? 0.98 : 1 }}
            onClick={handleNext}
            disabled={!canProceed || advancing}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              canProceed && !advancing
                ? "bg-gradient-to-r from-token-violet to-token-cyan text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
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
                Continue to Setup
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
