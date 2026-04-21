import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Image, X, CheckCircle2, AlertCircle, Loader2,
  ChevronDown, Sparkles, ArrowRight
} from "lucide-react";
import React, { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { AwakliButton } from "@/components/awakli/AwakliButton";
import { AwakliProgress } from "@/components/awakli/AwakliProgress";
import { AwakliiBadge } from "@/components/awakli/AwakliiBadge";
import { StudioLayout } from "@/components/awakli/Layouts";
import { toast } from "sonner";

type AnimeStyle = "default" | "shonen" | "seinen" | "shoujo" | "mecha";
type UploadState = "idle" | "uploading" | "processing" | "done" | "error";

interface FileItem {
  file: File;
  preview: string;
  state: UploadState;
  progress: number;
  uploadId?: number;
  jobId?: number;
  resultUrl?: string;
  error?: string;
}

const STYLE_OPTIONS: { value: AnimeStyle; label: string; desc: string }[] = [
  { value: "default", label: "Default", desc: "Clean anime style" },
  { value: "shonen", label: "Shonen", desc: "Bold & dynamic" },
  { value: "seinen", label: "Seinen", desc: "Mature & detailed" },
  { value: "shoujo", label: "Shoujo", desc: "Soft & expressive" },
  { value: "mecha", label: "Mecha", desc: "Mechanical & dramatic" },
];

export default function MangaUpload() {
  const { isAuthenticated } = useAuth();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<AnimeStyle>("default");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: projects } = trpc.projects.list.useQuery(undefined, { enabled: isAuthenticated });
  const getUploadUrlMutation = trpc.uploads.getUploadUrl.useMutation();
  const confirmUploadMutation = trpc.uploads.confirmUpload.useMutation();
  const triggerJobMutation = trpc.jobs.trigger.useMutation();

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => f.type.startsWith("image/") && f.size < 20 * 1024 * 1024);
    if (valid.length !== newFiles.length) {
      toast.error("Some files were skipped (images only, max 20MB)");
    }
    const items: FileItem[] = valid.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      state: "idle",
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
  };

  const processFile = async (index: number) => {
    if (!selectedProjectId) { toast.error("Please select a project first"); return; }
    const item = files[index];

    const updateFile = (patch: Partial<FileItem>) => {
      setFiles((prev) => prev.map((f, i) => i === index ? { ...f, ...patch } : f));
    };

    try {
      updateFile({ state: "uploading", progress: 10 });

      // Step 1: Get upload slot
      const { uploadId } = await getUploadUrlMutation.mutateAsync({
        projectId: selectedProjectId,
        fileName: item.file.name,
        mimeType: item.file.type,
        fileSizeBytes: item.file.size,
      });

      updateFile({ progress: 30, uploadId });

      // Step 2: Read file as base64 and confirm upload
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(item.file);
      });

      updateFile({ progress: 60 });

      const { fileUrl } = await confirmUploadMutation.mutateAsync({
        uploadId,
        fileDataBase64: base64,
        mimeType: item.file.type,
      });

      updateFile({ progress: 80, state: "processing" });

      // Step 3: Trigger AI job
      const { jobId } = await triggerJobMutation.mutateAsync({
        uploadId,
        projectId: selectedProjectId,
        animeStyle: selectedStyle,
      });

      updateFile({ progress: 100, state: "done", jobId });
      toast.success(`Panel queued for processing! Job #${jobId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      updateFile({ state: "error", error: message });
      toast.error(message);
    }
  };

  const processAll = async () => {
    const idleIndices = files.map((f, i) => ({ f, i })).filter(({ f }) => f.state === "idle").map(({ i }) => i);
    for (const idx of idleIndices) {
      await processFile(idx);
    }
  };

  if (!isAuthenticated) {
    return (
      <StudioLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
          <Upload size={48} className="text-[#00F0FF] mb-4" />
          <h2 className="text-h2 text-[#F0F0F5] mb-2">Sign in to upload artwork</h2>
          <a href={getLoginUrl()}>
            <AwakliButton variant="primary" size="lg">Sign In</AwakliButton>
          </a>
        </div>
      </StudioLayout>
    );
  }

  const hasIdle = files.some((f) => f.state === "idle");
  const isProcessing = files.some((f) => f.state === "uploading" || f.state === "processing");

  return (
    <StudioLayout>
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-h2 text-[#F0F0F5]">Upload Your Artwork</h1>
          <p className="text-sm text-[#9494B8] mt-1">Upload existing manga or artwork for the anime pipeline (Pro/Studio)</p>
        </div>

        {/* Project selector */}
        <div className="bg-[#0D0D1A] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#F0F0F5] mb-3">Select Project</h3>
          {projects && projects.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedProjectId(project.id)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    selectedProjectId === project.id
                      ? "bg-[rgba(107,91,255,0.1)] border-[rgba(107,91,255,0.4)] text-[#00F0FF]"
                      : "bg-[#151528] border-white/10 text-[#9494B8] hover:border-white/20"
                  }`}
                >
                  <div className="font-medium truncate">{project.title}</div>
                  <div className="text-xs opacity-60 mt-0.5">{project.animeStyle}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-[#9494B8] mb-3">No projects yet. Create one first.</p>
              <Link href="/studio">
                <AwakliButton variant="secondary" size="sm">Go to Dashboard</AwakliButton>
              </Link>
            </div>
          )}
        </div>

        {/* Style selector */}
        <div className="bg-[#0D0D1A] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[#F0F0F5] mb-3">Anime Style</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {STYLE_OPTIONS.map((style) => (
              <button
                key={style.value}
                onClick={() => setSelectedStyle(style.value)}
                className={`px-3 py-3 rounded-xl border text-left transition-all ${
                  selectedStyle === style.value
                    ? "bg-[rgba(107,91,255,0.1)] border-[rgba(107,91,255,0.4)]"
                    : "bg-[#151528] border-white/10 hover:border-white/20"
                }`}
              >
                <div className={`text-sm font-medium ${selectedStyle === style.value ? "text-[#00F0FF]" : "text-[#F0F0F5]"}`}>
                  {style.label}
                </div>
                <div className="text-xs text-[#5C5C7A] mt-0.5">{style.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <motion.div
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
            isDragging
              ? "border-[#6B5BFF] bg-[rgba(107,91,255,0.05)]"
              : "border-white/10 hover:border-white/20 bg-[#0D0D1A]"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          whileHover={{ scale: 1.005 }}
          transition={{ duration: 0.2 }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <motion.div
            animate={isDragging ? { scale: 1.1 } : { scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <Upload size={40} className={`mx-auto mb-4 ${isDragging ? "text-[#00F0FF]" : "text-[#5C5C7A]"}`} />
          </motion.div>
          <p className="text-base font-medium text-[#F0F0F5] mb-1">
            {isDragging ? "Drop your manga panels here" : "Drag & drop manga panels"}
          </p>
          <p className="text-sm text-[#5C5C7A]">or click to browse — JPG, PNG, WebP up to 20MB each</p>
        </motion.div>

        {/* File list */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#F0F0F5]">{files.length} panel{files.length !== 1 ? "s" : ""} selected</h3>
                {hasIdle && (
                  <AwakliButton
                    variant="primary"
                    size="md"
                    icon={<Sparkles size={16} />}
                    loading={isProcessing}
                    disabled={!selectedProjectId}
                    onClick={processAll}
                  >
                    Convert All to Anime
                  </AwakliButton>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {files.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-[#0D0D1A] border border-white/5 rounded-xl overflow-hidden"
                  >
                    <div className="flex gap-3 p-3">
                      {/* Thumbnail */}
                      <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-[#151528]">
                        <img src={item.preview} alt={item.file.name} className="w-full h-full object-cover" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[#F0F0F5] truncate">{item.file.name}</p>
                          {item.state === "idle" && (
                            <button
                              className="text-[#5C5C7A] hover:text-[#E74C3C] shrink-0"
                              onClick={() => removeFile(index)}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-[#5C5C7A] mt-0.5">
                          {(item.file.size / 1024 / 1024).toFixed(1)} MB
                        </p>

                        {/* State indicator */}
                        <div className="mt-2">
                          {item.state === "idle" && (
                            <AwakliButton
                              variant="secondary"
                              size="sm"
                              disabled={!selectedProjectId}
                              onClick={() => processFile(index)}
                            >
                              Convert
                            </AwakliButton>
                          )}
                          {(item.state === "uploading" || item.state === "processing") && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs text-[#00D4FF]">
                                <Loader2 size={12} className="animate-spin" />
                                {item.state === "uploading" ? "Uploading..." : "Processing..."}
                              </div>
                              <AwakliProgress value={item.progress} variant="cyan" size="sm" />
                            </div>
                          )}
                          {item.state === "done" && (
                            <div className="flex items-center gap-1.5 text-xs text-[#2ECC71]">
                              <CheckCircle2 size={12} />
                              Queued — Job #{item.jobId}
                            </div>
                          )}
                          {item.state === "error" && (
                            <div className="flex items-center gap-1.5 text-xs text-[#E74C3C]">
                              <AlertCircle size={12} />
                              {item.error ?? "Failed"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {files.some((f) => f.state === "done") && (
                <div className="flex justify-end">
                  <Link href="/studio">
                    <AwakliButton variant="ghost" size="md" icon={<ArrowRight size={16} />} iconPosition="right">
                      View in Dashboard
                    </AwakliButton>
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </StudioLayout>
  );
}
