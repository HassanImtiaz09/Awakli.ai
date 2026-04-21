import { useState, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Shield, ArrowRight, ArrowLeft, Users, ThumbsUp, ThumbsDown, Clock, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import CreateWizardLayout from "@/layouts/CreateWizardLayout";

export default function WizardAnimeGate() {
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
    s.add(2); // assume script done if we're here
    s.add(3); // assume panels done if we're here
    return s;
  }, [project]);

  // Placeholder voting data
  const votes = { up: 0, down: 0, total: 0 };
  const threshold = 100;
  const progress = Math.min((votes.up / threshold) * 100, 100);
  const gateOpen = votes.up >= threshold;

  return (
    <CreateWizardLayout
      stage={4}
      projectId={projectId}
      projectTitle={project?.title || "Untitled Project"}
      completedStages={completedStages}
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-token-gold text-xs font-semibold uppercase tracking-widest">
            <Shield className="w-3.5 h-3.5" />
            Stage 05 — Anime Gate
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white/90">
            Community approval
          </h1>
          <p className="text-white/40 text-sm">
            Your manga is submitted for community voting. Reach the threshold to unlock anime production.
          </p>
        </div>

        {/* Voting progress */}
        <div className="p-8 rounded-3xl bg-white/[0.03] border border-white/5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-token-gold/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-token-gold" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white/90">{votes.up}</div>
                <div className="text-xs text-white/40">upvotes of {threshold} needed</div>
              </div>
            </div>
            <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
              gateOpen
                ? "bg-token-mint/10 text-token-mint ring-1 ring-token-mint/30"
                : "bg-token-gold/10 text-token-gold ring-1 ring-token-gold/30"
            }`}>
              {gateOpen ? "Gate Open" : "Voting Active"}
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-3 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-token-gold to-token-mint"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
            <div className="flex justify-between text-xs text-white/30">
              <span>{Math.round(progress)}% complete</span>
              <span>{threshold - votes.up} more votes needed</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] text-center">
              <ThumbsUp className="w-5 h-5 text-token-mint mx-auto mb-2" />
              <div className="text-lg font-bold text-white/80">{votes.up}</div>
              <div className="text-xs text-white/30">Upvotes</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] text-center">
              <ThumbsDown className="w-5 h-5 text-token-magenta mx-auto mb-2" />
              <div className="text-lg font-bold text-white/80">{votes.down}</div>
              <div className="text-xs text-white/30">Downvotes</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] text-center">
              <Users className="w-5 h-5 text-token-cyan mx-auto mb-2" />
              <div className="text-lg font-bold text-white/80">{votes.total}</div>
              <div className="text-xs text-white/30">Total Votes</div>
            </div>
          </div>

          {!gateOpen && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-token-gold/5 border border-token-gold/10">
              <Clock className="w-4 h-4 text-token-gold flex-shrink-0" />
              <p className="text-xs text-white/50">
                Share your project on the Feed to gather community votes. Once you reach {threshold} upvotes, the anime production stage unlocks.
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          <button
            onClick={() => navigate(`/create/panels?projectId=${projectId}`)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white/50 hover:text-white/70 text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <motion.button
            whileHover={{ scale: gateOpen ? 1.02 : 1 }}
            whileTap={{ scale: gateOpen ? 0.98 : 1 }}
            onClick={() => gateOpen && navigate(`/create/video?projectId=${projectId}`)}
            disabled={!gateOpen}
            className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold text-sm transition-all ${
              gateOpen
                ? "bg-gradient-to-r from-token-violet to-token-cyan text-white shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
                : "bg-white/5 text-white/20 cursor-not-allowed"
            }`}
          >
            {gateOpen ? "Continue to Video" : "Waiting for Votes"}
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </CreateWizardLayout>
  );
}
