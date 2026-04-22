/**
 * MangaUpload — Drag-drop zone for uploading manga pages.
 *
 * States:
 * - Idle: drop zone pulses gently every 6s
 * - Dragging: border switches to violet dashed
 * - Uploading: progress ring, filename, cancel control
 * - Parsed: emits onPanelsExtracted with panel data
 * - Error: unsupported format or corrupt file; retry button
 *
 * Accepts: .pdf, .cbz, .zip, .jpg, .jpeg, .png, .webp
 * Max: 40 files, 80MB total
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileImage,
  X,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const MAX_FILES = 40;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024; // 80MB
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/x-cbz",
  "application/x-zip-compressed",
]);
const ACCEPTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".cbz",
  ".zip",
]);

export interface UploadedFile {
  file: File;
  uploadId?: number;
  fileUrl?: string;
  status: "pending" | "uploading" | "uploaded" | "extracting" | "done" | "error";
  progress: number;
  errorMessage?: string;
}

export interface ExtractedPanel {
  id: string;
  index: number;
  url: string;
  fileKey: string;
  width: number;
  height: number;
  sourcePageIndex: number;
}

interface MangaUploadProps {
  projectId: number | null;
  onPanelsExtracted: (panels: ExtractedPanel[]) => void;
  onUploadStart?: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

type DropState = "idle" | "dragging" | "uploading" | "error";

export default function MangaUpload({
  projectId,
  onPanelsExtracted,
  onUploadStart,
  onError,
  disabled = false,
}: MangaUploadProps) {
  const [dropState, setDropState] = useState<DropState>("idle");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [totalProgress, setTotalProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const cancelledRef = useRef(false);

  const getUploadUrl = trpc.uploads.getUploadUrl.useMutation();
  const confirmUpload = trpc.uploads.confirmUpload.useMutation();
  const extractPanels = trpc.uploads.extractPanels.useMutation();

  // Pulse animation for idle state
  const [pulseVisible, setPulseVisible] = useState(false);
  useEffect(() => {
    if (dropState !== "idle") return;
    const interval = setInterval(() => {
      setPulseVisible(true);
      setTimeout(() => setPulseVisible(false), 1500);
    }, 6000);
    // Initial pulse
    setPulseVisible(true);
    setTimeout(() => setPulseVisible(false), 1500);
    return () => clearInterval(interval);
  }, [dropState]);

  const validateFiles = useCallback(
    (fileList: File[]): string | null => {
      if (fileList.length > MAX_FILES) {
        return `Too many files — maximum ${MAX_FILES} files allowed`;
      }
      const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_BYTES) {
        return `Total size exceeds 80MB (${(totalSize / 1024 / 1024).toFixed(1)}MB selected)`;
      }
      for (const file of fileList) {
        const ext = "." + file.name.split(".").pop()?.toLowerCase();
        if (!ACCEPTED_TYPES.has(file.type) && !ACCEPTED_EXTENSIONS.has(ext)) {
          return `Unsupported file: ${file.name}. Accepted: PDF, CBZ, ZIP, JPG, PNG, WebP`;
        }
      }
      return null;
    },
    []
  );

  const processFiles = useCallback(
    async (fileList: File[]) => {
      if (!projectId) {
        setErrorMessage("No project selected — create a project first");
        setDropState("error");
        return;
      }

      const error = validateFiles(fileList);
      if (error) {
        setErrorMessage(error);
        setDropState("error");
        onError?.(error);
        emitAnalytics("stage0_upload_failed", { reason: error });
        return;
      }

      cancelledRef.current = false;
      setDropState("uploading");
      onUploadStart?.();
      emitAnalytics("stage0_upload_start", { fileCount: fileList.length });

      const uploadedFiles: UploadedFile[] = fileList.map((f) => ({
        file: f,
        status: "pending" as const,
        progress: 0,
      }));
      setFiles(uploadedFiles);

      const allPanels: ExtractedPanel[] = [];
      let completedCount = 0;

      for (let i = 0; i < uploadedFiles.length; i++) {
        if (cancelledRef.current) break;

        const uf = uploadedFiles[i];

        try {
          // Step 1: Get upload URL
          uf.status = "uploading";
          uf.progress = 20;
          setFiles([...uploadedFiles]);
          setTotalProgress(Math.round(((completedCount + 0.2) / uploadedFiles.length) * 100));

          const { uploadId } = await getUploadUrl.mutateAsync({
            projectId,
            fileName: uf.file.name,
            mimeType: uf.file.type || "image/jpeg",
            fileSizeBytes: uf.file.size,
          });
          uf.uploadId = uploadId;

          if (cancelledRef.current) break;

          // Step 2: Read file and upload
          uf.progress = 50;
          setFiles([...uploadedFiles]);
          setTotalProgress(Math.round(((completedCount + 0.5) / uploadedFiles.length) * 100));

          const arrayBuffer = await uf.file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );

          const { fileUrl } = await confirmUpload.mutateAsync({
            uploadId,
            fileDataBase64: base64,
            mimeType: uf.file.type || "image/jpeg",
          });
          uf.fileUrl = fileUrl;
          uf.status = "uploaded";
          uf.progress = 70;
          setFiles([...uploadedFiles]);

          if (cancelledRef.current) break;

          // Step 3: Extract panels (for image files)
          const isImage = uf.file.type.startsWith("image/");
          if (isImage) {
            uf.status = "extracting";
            uf.progress = 85;
            setFiles([...uploadedFiles]);

            const { panels } = await extractPanels.mutateAsync({
              uploadId,
              projectId,
              pageIndex: i,
            });
            allPanels.push(...panels);
          }

          uf.status = "done";
          uf.progress = 100;
          completedCount++;
          setFiles([...uploadedFiles]);
          setTotalProgress(Math.round((completedCount / uploadedFiles.length) * 100));
        } catch (err: any) {
          uf.status = "error";
          uf.errorMessage = err?.message || "Upload failed";
          setFiles([...uploadedFiles]);
          emitAnalytics("stage0_upload_failed", {
            fileName: uf.file.name,
            reason: uf.errorMessage,
          });
        }
      }

      if (!cancelledRef.current && allPanels.length > 0) {
        onPanelsExtracted(allPanels);
        emitAnalytics("stage0_upload_complete", {
          fileCount: uploadedFiles.length,
          panelCount: allPanels.length,
        });
      }

      if (cancelledRef.current) {
        setDropState("idle");
        setFiles([]);
      }
    },
    [projectId, validateFiles, onPanelsExtracted, onUploadStart, onError]
  );

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDropState("dragging");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0 && dropState === "dragging") {
      setDropState("idle");
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    if (disabled) return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) processFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) processFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    setDropState("idle");
    setFiles([]);
    setTotalProgress(0);
  };

  const handleRetry = () => {
    setDropState("idle");
    setErrorMessage("");
    setFiles([]);
    setTotalProgress(0);
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => {
          if (dropState === "idle" && !disabled) fileInputRef.current?.click();
        }}
        className={`relative overflow-hidden rounded-3xl transition-all duration-300 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : dropState === "idle"
            ? "cursor-pointer border-2 border-dashed border-white/10 hover:border-token-violet/40 bg-white/[0.02]"
            : dropState === "dragging"
            ? "cursor-copy border-2 border-dashed border-token-violet bg-token-violet/5"
            : dropState === "error"
            ? "border-2 border-dashed border-red-400/30 bg-red-400/5"
            : "border-2 border-white/10 bg-white/[0.02]"
        }`}
      >
        {/* Pulse overlay for idle state */}
        <AnimatePresence>
          {dropState === "idle" && pulseVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0 bg-gradient-to-br from-token-violet/20 to-token-cyan/10 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <div className="p-10 flex flex-col items-center gap-4">
          <AnimatePresence mode="wait">
            {/* ─── Idle State ─── */}
            {dropState === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-white/30" />
                </div>
                <p className="text-sm text-white/50 text-center">
                  Drop PDF, CBZ, or images (up to 80MB)
                </p>
                <p className="text-xs text-white/20">
                  or click to browse · up to {MAX_FILES} files
                </p>
              </motion.div>
            )}

            {/* ─── Dragging State ─── */}
            {dropState === "dragging" && (
              <motion.div
                key="dragging"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-token-violet/10 flex items-center justify-center">
                  <FileImage className="w-6 h-6 text-token-violet" />
                </div>
                <p className="text-sm text-token-violet font-medium">
                  Drop to upload
                </p>
              </motion.div>
            )}

            {/* ─── Uploading State ─── */}
            {dropState === "uploading" && (
              <motion.div
                key="uploading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-4 w-full max-w-sm"
              >
                {/* Progress ring */}
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="4"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      fill="none"
                      stroke="url(#progressGrad)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - totalProgress / 100)}`}
                      className="transition-all duration-300"
                    />
                    <defs>
                      <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#E040FB" />
                        <stop offset="100%" stopColor="#7C4DFF" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white/60">
                    {totalProgress}%
                  </span>
                </div>

                {/* File list */}
                <div className="w-full space-y-1.5 max-h-32 overflow-y-auto">
                  {files.map((uf, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-white/40"
                    >
                      {uf.status === "done" ? (
                        <CheckCircle2 className="w-3 h-3 text-token-mint flex-shrink-0" />
                      ) : uf.status === "error" ? (
                        <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                      ) : (
                        <Loader2 className="w-3 h-3 animate-spin text-token-cyan flex-shrink-0" />
                      )}
                      <span className="truncate flex-1">{uf.file.name}</span>
                      <span className="text-white/20 tabular-nums">
                        {uf.progress}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Cancel */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancel();
                  }}
                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </motion.div>
            )}

            {/* ─── Error State ─── */}
            {dropState === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="w-14 h-14 rounded-2xl bg-red-400/10 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-sm text-red-300/70 text-center max-w-xs">
                  {errorMessage}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry();
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 text-xs text-white/50 hover:bg-white/10 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.pdf,.cbz,.zip"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

// ─── Analytics Helper ─────────────────────────────────────────────────────────
function emitAnalytics(event: string, data?: Record<string, unknown>) {
  try {
    window.dispatchEvent(
      new CustomEvent("awakli:analytics", {
        detail: { event, ...data, timestamp: Date.now() },
      })
    );
  } catch {
    // Silently fail
  }
}
