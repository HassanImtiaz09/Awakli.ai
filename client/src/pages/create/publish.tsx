import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Send, ArrowLeft, Rocket, Globe, Lock, Eye, Share2, Check, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";
import { WithTier } from "@/components/awakli/withTier";

export default function WizardPublish() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId") || "";
  const numId = parseInt(projectId, 10);

  const { data: project } = trpc.projects.get.useQuery({ id: numId }, { enabled: !isNaN(numId) });

  const completedStages = useMemo(() => {
    const s = new Set<number>();
    s.add(0); s.add(1); s.add(2); s.add(3); s.add(4); s.add(5);
    return s;
  }, []);

  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [published, setPublished] = useState(false);

  const handlePublish = () => {
    setPublished(true);
    // In real implementation: trpc.projects.update with visibility + status = "published"
  };

  return (
    <CreateWizardLayout
      stage={6}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <WithTier capability="stage_publish" mode="hard">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-mint text-xs font-semibold uppercase tracking-widest">
            <Send className="w-3.5 h-3.5" />
            Stage 07 — Publish
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            {published ? "Your anime is live!" : "Ready to publish"}
          </h1>
          <p className="text-white/40 text-sm">
            {published
              ? "Congratulations! Your anime is now available for the world to see."
              : "Choose your visibility settings and share your creation with the world."}
          </p>
        </div>

        {published ? (
          /* Success state */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-3xl bg-token-mint/5 border border-token-mint/20 text-center space-y-6"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-token-mint/10 flex items-center justify-center mx-auto"
            >
              <Check className="w-10 h-10 text-token-mint" />
            </motion.div>
            <div>
              <h2 className="text-xl font-bold text-white/90 mb-2">{project?.title || "Your Project"}</h2>
              <p className="text-white/40 text-sm">is now live on Awakli</p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-token-mint/10 text-token-mint text-sm font-semibold hover:bg-token-mint/20 transition-all"
              >
                <Eye className="w-4 h-4" />
                View Project
              </button>
              <button className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 text-sm hover:text-white/70 transition-all">
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </motion.div>
        ) : (
          /* Pre-publish state */
          <>
            {/* Visibility options */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Visibility</label>
              <div className="space-y-2">
                {[
                  { key: "public" as const, icon: Globe, label: "Public", desc: "Anyone can discover and watch your anime" },
                  { key: "unlisted" as const, icon: ExternalLink, label: "Unlisted", desc: "Only people with the link can access it" },
                  { key: "private" as const, icon: Lock, label: "Private", desc: "Only you can see this project" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setVisibility(opt.key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left transition-all ${
                      visibility === opt.key
                        ? "bg-token-violet/10 border-token-violet/40"
                        : "bg-white/[0.02] border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      visibility === opt.key ? "bg-token-violet/20" : "bg-white/5"
                    }`}>
                      <opt.icon className={`w-5 h-5 ${visibility === opt.key ? "text-token-violet" : "text-white/30"}`} />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${visibility === opt.key ? "text-token-violet" : "text-white/70"}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-white/30">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Publish button */}
            <div className="text-center pt-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePublish}
                className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl bg-gradient-to-r from-token-mint via-token-cyan to-token-violet text-white font-bold text-base shadow-[0_4px_30px_rgba(0,229,160,0.3)]"
              >
                <Rocket className="w-5 h-5" />
                Publish to Awakli
              </motion.button>
            </div>
          </>
        )}

        {/* Navigation */}
        {!published && (
          <div className="flex justify-start pt-4">
            <button
              onClick={() => navigate(`/create/video?projectId=${projectId}`)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          </div>
        )}
      </div>
      </WithTier>
    </CreateWizardLayout>
  );
}
