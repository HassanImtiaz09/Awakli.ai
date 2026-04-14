import { motion } from "framer-motion";
import {
  Plus, Upload, Layers, Zap, Film, Clock, CheckCircle2, XCircle, Loader2,
  FolderOpen, ArrowRight, Sparkles
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge, JobStatusBadge } from "@/components/awakli/AwakliiBadge";
import { AwakliProgress } from "@/components/awakli/AwakliProgress";
import { AwakliCardSkeleton } from "@/components/awakli/AwakliSkeleton";
import { StudioLayout } from "@/components/awakli/Layouts";
import { CreateProjectModal } from "@/components/awakli/CreateProjectModal";
import { toast } from "sonner";

export default function StudioDashboard() {
  const { isAuthenticated, loading } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } =
    trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });

  const { data: jobs, isLoading: jobsLoading } =
    trpc.jobs.list.useQuery(undefined, {
      enabled: isAuthenticated,
      refetchInterval: 5000,
    });

  if (loading) {
    return (
      <StudioLayout>
        <div className="p-8 space-y-4">
          {[1, 2, 3].map((i) => <AwakliCardSkeleton key={i} />)}
        </div>
      </StudioLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <StudioLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <Sparkles size={48} className="text-[#E94560] mb-4" />
          <h2 className="text-h2 text-[#F0F0F5] mb-2">Sign in to access Studio</h2>
          <p className="text-[#9494B8] mb-6">Create manga from your stories and bring them to life.</p>
          <a href={getLoginUrl()}>
            <AwakliButton variant="primary" size="lg">Sign In</AwakliButton>
          </a>
        </div>
      </StudioLayout>
    );
  }

  const activeJobs = jobs?.filter((j) => j.status === "queued" || j.status === "processing") ?? [];
  const recentJobs = jobs?.slice(0, 6) ?? [];

  return (
    <StudioLayout>
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h2 text-[#F0F0F5]">Studio Dashboard</h1>
            <p className="text-sm text-[#9494B8] mt-1">Create, manage, and animate your stories</p>
          </div>
          <Link href="/studio/new">
            <AwakliButton
              variant="primary"
              size="md"
              icon={<Plus size={16} />}
            >
              New Project
            </AwakliButton>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Projects", value: projects?.length ?? 0, icon: <Layers size={20} />, color: "pink" },
            { label: "Active Jobs", value: activeJobs.length, icon: <Zap size={20} />, color: "cyan" },
            { label: "Completed", value: jobs?.filter((j) => j.status === "completed").length ?? 0, icon: <CheckCircle2 size={20} />, color: "success" },
            { label: "Frames Generated", value: jobs?.reduce((acc, j) => acc + ((j.resultUrls as string[])?.length ?? 0), 0) ?? 0, icon: <Film size={20} />, color: "gold" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-[#0D0D1A] border border-white/5 rounded-xl p-4"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                stat.color === "pink" ? "bg-[rgba(233,69,96,0.15)] text-[#E94560]"
                : stat.color === "cyan" ? "bg-[rgba(0,212,255,0.15)] text-[#00D4FF]"
                : stat.color === "success" ? "bg-[rgba(46,204,113,0.15)] text-[#2ECC71]"
                : "bg-[rgba(255,184,0,0.15)] text-[#FFB800]"
              }`}>
                {stat.icon}
              </div>
              <div className="text-2xl font-bold text-[#F0F0F5] font-mono">{stat.value}</div>
              <div className="text-xs text-[#5C5C7A] mt-0.5">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-[#F0F0F5] mb-4 flex items-center gap-2">
              <Loader2 size={16} className="text-[#00D4FF] animate-spin" />
              Processing Jobs
            </h2>
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <AwakliCard key={job.id} variant="elevated" className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <JobStatusBadge status={job.status} />
                      <span className="text-sm text-[#9494B8]">Job #{job.id}</span>
                    </div>
                    <span className="text-xs font-mono text-[#5C5C7A]">
                      {job.animeStyle} style
                    </span>
                  </div>
                  <AwakliProgress
                    value={job.progress ?? 0}
                    variant="cyan"
                    showValue
                    label="Processing manga panel..."
                  />
                </AwakliCard>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[#F0F0F5]">Your Projects</h2>
            <Link href="/studio/projects">
              <span className="text-sm text-[#00D4FF] hover:text-[#33DFFF] cursor-pointer flex items-center gap-1">
                View all <ArrowRight size={14} />
              </span>
            </Link>
          </div>

          {projectsLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <AwakliCardSkeleton key={i} />)}
            </div>
          ) : projects && projects.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 6).map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link href={`/studio/project/${project.id}`}>
                    <AwakliCard variant="default" glow="pink" className="p-5 cursor-pointer group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#E94560] to-[#9B59B6] flex items-center justify-center text-white font-bold text-sm">
                          {project.title[0].toUpperCase()}
                        </div>
                        <AwakliiBadge variant={project.status === "active" ? "success" : project.status === "archived" ? "default" : "warning"}>
                          {project.status}
                        </AwakliiBadge>
                      </div>
                      <h3 className="font-semibold text-[#F0F0F5] mb-1 group-hover:text-[#E94560] transition-colors truncate">
                        {project.title}
                      </h3>
                      {project.description && (
                        <p className="text-xs text-[#5C5C7A] line-clamp-2 mb-3">{project.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {project.genre && <AwakliiBadge variant="default">{project.genre}</AwakliiBadge>}
                        <AwakliiBadge variant="cyan">{project.animeStyle}</AwakliiBadge>
                      </div>
                    </AwakliCard>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FolderOpen size={40} />}
              title="No projects yet"
              description="Write your first story and let AI create a manga from it."
              action={
                <Link href="/studio/new">
                  <AwakliButton variant="primary" size="md" icon={<Plus size={16} />}>
                    Create Project
                  </AwakliButton>
                </Link>
              }
            />
          )}
        </section>

        {/* Recent Jobs */}
        {recentJobs.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-[#F0F0F5] mb-4">Recent Jobs</h2>
            <div className="bg-[#0D0D1A] border border-white/5 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-3 text-xs text-[#5C5C7A] font-medium uppercase tracking-wider">Job</th>
                    <th className="text-left px-4 py-3 text-xs text-[#5C5C7A] font-medium uppercase tracking-wider">Style</th>
                    <th className="text-left px-4 py-3 text-xs text-[#5C5C7A] font-medium uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs text-[#5C5C7A] font-medium uppercase tracking-wider">Frames</th>
                    <th className="text-left px-4 py-3 text-xs text-[#5C5C7A] font-medium uppercase tracking-wider">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map((job, i) => (
                    <motion.tr
                      key={job.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-white/5 last:border-0 hover:bg-[#151528] transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-[#9494B8]">#{job.id}</td>
                      <td className="px-4 py-3">
                        <AwakliiBadge variant="default">{job.animeStyle}</AwakliiBadge>
                      </td>
                      <td className="px-4 py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-[#9494B8]">
                        {(job.resultUrls as string[])?.length ?? 0}
                      </td>
                      <td className="px-4 py-3 text-[#5C5C7A] text-xs">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => { refetchProjects(); setShowCreateModal(false); }}
      />
    </StudioLayout>
  );
}

function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/10 rounded-xl">
      <div className="text-[#5C5C7A] mb-4">{icon}</div>
      <h3 className="text-base font-semibold text-[#F0F0F5] mb-2">{title}</h3>
      <p className="text-sm text-[#9494B8] max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
