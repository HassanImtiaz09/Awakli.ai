import { useMemo } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Pen, Settings2, BookOpen, LayoutGrid, Shield, Film, Send,
  Check, Clock, Archive, Loader2, FolderOpen, Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageBackground from "@/components/awakli/PageBackground";
import { STAGES } from "@/layouts/CreateWizardLayout";

const BG_URL = "https://manus-storage.oss-cn-beijing.aliyuncs.com/user-file/e7a2e5e5c8f2e3a4b6d8c9f1a3b5d7e9/page-bg-create.png";

const STAGE_ICONS = [Pen, Settings2, BookOpen, LayoutGrid, Shield, Film, Send];

const STATE_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "bg-white/5", text: "text-white/40" },
  in_progress: { label: "In Progress", bg: "bg-token-cyan/10", text: "text-token-cyan" },
  published_manga: { label: "Published", bg: "bg-token-mint/10", text: "text-token-mint" },
  published_anime: { label: "Anime Live", bg: "bg-token-gold/10", text: "text-token-gold" },
  archived: { label: "Archived", bg: "bg-white/5", text: "text-white/20" },
};

function StageProgressBar({ wizardStage }: { wizardStage: number }) {
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, i) => {
        const Icon = STAGE_ICONS[i];
        const isComplete = i < wizardStage;
        const isCurrent = i === wizardStage;

        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`w-3 h-px ${isComplete ? "bg-token-mint/50" : "bg-white/10"}`} />
            )}
            <div
              title={s.label}
              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                isComplete
                  ? "bg-token-mint/20 ring-1 ring-token-mint/40"
                  : isCurrent
                  ? "bg-token-violet/20 ring-1 ring-token-violet/40"
                  : "bg-white/5 ring-1 ring-white/10"
              }`}
            >
              {isComplete ? (
                <Check className="w-2.5 h-2.5 text-token-mint" />
              ) : (
                <Icon className={`w-2.5 h-2.5 ${isCurrent ? "text-token-violet" : "text-white/20"}`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectCard({ project }: { project: any }) {
  const [, navigate] = useLocation();
  const stage = project.wizardStage ?? 0;
  const state = project.projectState ?? "draft";
  const badge = STATE_BADGES[state] || STATE_BADGES.draft;
  const stagePath = STAGES[Math.min(stage, STAGES.length - 1)]?.path || "input";
  const isArchived = state === "archived";

  const updatedAt = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative rounded-2xl border transition-all overflow-hidden ${
        isArchived
          ? "bg-white/[0.01] border-white/5 opacity-60"
          : "bg-white/[0.03] border-white/5 hover:border-white/15 hover:shadow-[0_4px_24px_rgba(107,91,255,0.08)]"
      }`}
    >
      <div className="p-5 space-y-4">
        {/* Top row: title + badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white/80 truncate">
              {project.title || "Untitled Project"}
            </h3>
            {project.genre && (
              <span className="text-[10px] text-white/30 uppercase tracking-wider">{project.genre}</span>
            )}
          </div>
          <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-xs text-white/30 line-clamp-2 leading-relaxed">{project.description}</p>
        )}

        {/* Stage progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 uppercase tracking-wider">
              Stage {stage + 1} of 7 — {STAGES[Math.min(stage, STAGES.length - 1)]?.label}
            </span>
          </div>
          <StageProgressBar wizardStage={stage} />
        </div>

        {/* Footer: date + action */}
        <div className="flex items-center justify-between pt-1">
          {updatedAt && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/20">
              <Clock className="w-3 h-3" />
              {updatedAt}
            </div>
          )}
          {!isArchived && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/create/${stagePath}?projectId=${project.id}`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-token-violet/10 text-token-violet text-xs font-semibold hover:bg-token-violet/20 transition-all"
            >
              <Sparkles className="w-3 h-3" />
              Resume
            </motion.button>
          )}
          {isArchived && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/20">
              <Archive className="w-3 h-3" />
              Archived
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function CreateDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: projects, isLoading } = trpc.projects.listMine.useQuery(undefined, {
    enabled: !!user,
  });

  const { activeProjects, archivedProjects } = useMemo(() => {
    if (!projects) return { activeProjects: [], archivedProjects: [] };
    const active = projects.filter((p: any) => p.projectState !== "archived");
    const archived = projects.filter((p: any) => p.projectState === "archived");
    // Sort by updatedAt descending
    active.sort((a: any, b: any) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    return { activeProjects: active, archivedProjects: archived };
  }, [projects]);

  if (authLoading) {
    return (
      <div className="relative min-h-screen bg-[#05050C]">
        <PageBackground src={BG_URL} opacity={0.12} />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-token-violet" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen bg-[#05050C]">
        <PageBackground src={BG_URL} opacity={0.12} />
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen gap-6 px-4">
          <FolderOpen className="w-12 h-12 text-white/10" />
          <h1 className="text-2xl font-bold text-white/80">Sign in to create</h1>
          <p className="text-white/40 text-sm text-center max-w-md">
            Log in to your Awakli account to start creating manga and anime projects.
          </p>
          <Link
            href="/signin"
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-cyan text-white text-sm font-semibold"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#05050C]">
      <PageBackground src={BG_URL} opacity={0.12} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 lg:px-8 py-10 lg:py-16">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-white/90">Your Projects</h1>
            <p className="text-white/40 text-sm mt-1">
              {activeProjects.length === 0
                ? "Start your first anime project"
                : `${activeProjects.length} active project${activeProjects.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/create/input?projectId=new")}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-token-violet to-token-cyan text-white text-sm font-semibold shadow-[0_4px_20px_rgba(107,91,255,0.3)]"
          >
            <Plus className="w-4 h-4" />
            New Project
          </motion.button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-white/[0.02] border border-white/5 p-5 space-y-4 animate-pulse">
                <div className="h-4 w-2/3 bg-white/5 rounded" />
                <div className="h-3 w-full bg-white/5 rounded" />
                <div className="h-3 w-1/2 bg-white/5 rounded" />
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((j) => (
                    <div key={j} className="w-5 h-5 rounded-full bg-white/5" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && activeProjects.length === 0 && archivedProjects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 border border-dashed border-white/10 rounded-3xl bg-white/[0.01]"
          >
            <div className="w-16 h-16 rounded-2xl bg-token-violet/10 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-8 h-8 text-token-violet" />
            </div>
            <h2 className="text-xl font-bold text-white/80 mb-2">Create your first project</h2>
            <p className="text-white/30 text-sm max-w-md mx-auto mb-8">
              Start with a story idea and let AI help you build a full manga or anime — from script to panels to video.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate("/create/input?projectId=new")}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-token-violet to-token-cyan text-white font-semibold shadow-[0_4px_24px_rgba(107,91,255,0.3)]"
            >
              <Plus className="w-5 h-5" />
              New Project
            </motion.button>
          </motion.div>
        )}

        {/* Active projects grid */}
        {!isLoading && activeProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {activeProjects.map((p: any) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}

        {/* Archived projects */}
        {!isLoading && archivedProjects.length > 0 && (
          <div className="mt-12">
            <h2 className="text-sm font-semibold text-white/30 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Archive className="w-3.5 h-3.5" />
              Archived ({archivedProjects.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedProjects.map((p: any) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
