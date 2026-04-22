import { motion } from "framer-motion";
import {
  ArrowLeft, Upload, Zap, CheckCircle2, XCircle, Loader2,
  Film, Image, Trash2, Settings
} from "lucide-react";
import React, { useState } from "react";
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliCard } from "@/components/awakli/AwakliCard";
import { AwakliiBadge, JobStatusBadge } from "@/components/awakli/AwakliiBadge";
import { AwakliProgress } from "@/components/awakli/AwakliProgress";
import { AwakliCardSkeleton } from "@/components/awakli/AwakliSkeleton";
import { StudioLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0", 10);

  const { data: project, isLoading: projectLoading } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  );

  const { data: uploads, isLoading: uploadsLoading } = trpc.uploads.listByProject.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const { data: jobs, isLoading: jobsLoading, refetch: refetchJobs } = trpc.jobs.listByProject.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      refetchInterval: 5000,
    }
  );

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      window.location.href = "/studio";
    },
    onError: (err) => toast.error(err.message),
  });

  if (projectLoading) {
    return (
      <StudioLayout>
        <div className="p-8 space-y-4">
          <AwakliCardSkeleton />
          <AwakliCardSkeleton />
        </div>
      </StudioLayout>
    );
  }

  if (!project) {
    return (
      <StudioLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <h2 className="text-h2 text-[#F0F0F5] mb-4">Project not found</h2>
          <Link href="/studio">
            <AwakliButton variant="secondary" size="md">Back to Dashboard</AwakliButton>
          </Link>
        </div>
      </StudioLayout>
    );
  }

  const completedJobs = jobs?.filter((j) => j.status === "completed") ?? [];
  const activeJobs = jobs?.filter((j) => j.status === "queued" || j.status === "processing") ?? [];

  return (
    <StudioLayout>
      <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/studio">
              <button className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#151528] border border-white/10 text-[#9494B8] hover:text-[#F0F0F5] transition-colors">
                <ArrowLeft size={16} />
              </button>
            </Link>
            <div>
              <h1 className="text-h2 text-[#F0F0F5]">{project.title}</h1>
              <div className="flex items-center gap-2 mt-1">
                <AwakliiBadge variant={project.status === "active" ? "success" : project.status === "archived" ? "default" : "warning"}>
                  {project.status}
                </AwakliiBadge>
                <AwakliiBadge variant="cyan">{project.animeStyle}</AwakliiBadge>
                {project.genre && <AwakliiBadge variant="default">{project.genre}</AwakliiBadge>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/studio/upload`}>
              <AwakliButton variant="primary" size="sm" icon={<Upload size={14} />}>
                Upload Panel
              </AwakliButton>
            </Link>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#151528] border border-white/10 text-[#9494B8] hover:text-[#E74C3C] transition-colors"
              onClick={() => {
                if (confirm("Delete this project and all its uploads?")) {
                  deleteMutation.mutate({ id: projectId });
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-[#9494B8] text-sm max-w-2xl">{project.description}</p>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Uploads", value: uploads?.length ?? 0, icon: <Image size={18} />, color: "pink" },
            { label: "Active Jobs", value: activeJobs.length, icon: <Zap size={18} />, color: "cyan" },
            { label: "Frames Generated", value: completedJobs.reduce((acc, j) => acc + ((j.resultUrls as string[])?.length ?? 0), 0), icon: <Film size={18} />, color: "gold" },
          ].map((stat) => (
            <div key={stat.label} className="bg-[#0D0D1A] border border-white/5 rounded-xl p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${
                stat.color === "pink" ? "bg-[rgba(107,91,255,0.15)] text-[#00F0FF]"
                : stat.color === "cyan" ? "bg-token-cyan/15 text-token-cyan"
                : "bg-[rgba(255,184,0,0.15)] text-[#FFD60A]"
              }`}>
                {stat.icon}
              </div>
              <div className="text-2xl font-bold text-[#F0F0F5] font-mono">{stat.value}</div>
              <div className="text-xs text-[#5C5C7A]">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-[#F0F0F5] mb-4 flex items-center gap-2">
              <Loader2 size={16} className="text-[#00F0FF] animate-spin" />
              Processing
            </h2>
            <div className="space-y-3">
              {activeJobs.map((job) => (
                <AwakliCard key={job.id} variant="elevated" className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <JobStatusBadge status={job.status} />
                    <span className="text-xs font-mono text-[#5C5C7A]">Job #{job.id}</span>
                  </div>
                  <AwakliProgress value={job.progress ?? 0} variant="cyan" showValue label="Generating anime frames..." />
                </AwakliCard>
              ))}
            </div>
          </section>
        )}

        {/* Generated Frames */}
        {completedJobs.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-[#F0F0F5] mb-4 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-[#2ECC71]" />
              Generated Frames
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {completedJobs.flatMap((job) =>
                ((job.resultUrls as string[]) ?? []).map((url, i) => (
                  <motion.div
                    key={`${job.id}-${i}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="relative group rounded-xl overflow-hidden bg-[#151528] aspect-[3/4]"
                  >
                    <img src={url} alt={`Frame ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white bg-[rgba(107,91,255,0.8)] px-2 py-1 rounded"
                      >
                        View Full
                      </a>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Uploads */}
        <section>
          <h2 className="text-base font-semibold text-[#F0F0F5] mb-4">Uploaded Panels</h2>
          {uploadsLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              <AwakliCardSkeleton /><AwakliCardSkeleton />
            </div>
          ) : uploads && uploads.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploads.map((upload, i) => (
                <motion.div
                  key={upload.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-[#0D0D1A] border border-white/5 rounded-xl p-4 flex gap-3"
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-[#151528]">
                    {upload.fileUrl ? (
                      <img src={upload.fileUrl} alt={upload.fileName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image size={20} className="text-[#5C5C7A]" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#F0F0F5] truncate">{upload.fileName}</p>
                    <p className="text-xs text-[#5C5C7A] mt-0.5">
                      {upload.fileSizeBytes ? `${(upload.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
                    </p>
                    <div className="mt-1.5">
                      <JobStatusBadge status={upload.status as any} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
              <Image size={32} className="mx-auto text-[#5C5C7A] mb-3" />
              <p className="text-sm text-[#9494B8]">No panels uploaded yet</p>
              <Link href="/studio/upload">
                <AwakliButton variant="secondary" size="sm" className="mt-4">Upload First Panel</AwakliButton>
              </Link>
            </div>
          )}
        </section>
      </div>
    </StudioLayout>
  );
}
