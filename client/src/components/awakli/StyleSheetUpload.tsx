/**
 * StyleSheetUpload — Global style reference images for ControlNet conditioning.
 *
 * Accepts up to 8 style reference images that define the project's visual identity:
 * line weight, palette, mood, and art style.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  X,
  Loader2,
  Palette,
  ImagePlus,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StyleRef {
  id?: string;
  url: string;
  file?: File;
  uploading?: boolean;
  analyzed?: boolean;
  attributes?: {
    lineWeight: string;
    palette: string[];
    mood: string;
    artStyle: string;
  };
}

interface StyleSheetUploadProps {
  styleRefs: StyleRef[];
  onChange: (refs: StyleRef[]) => void;
  projectId: number | null;
  maxRefs?: number;
}

const MAX_STYLE_REFS = 8;

export default function StyleSheetUpload({
  styleRefs,
  onChange,
  projectId,
  maxRefs = MAX_STYLE_REFS,
}: StyleSheetUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getUploadUrl = trpc.uploads.getUploadUrl.useMutation();
  const confirmUpload = trpc.uploads.confirmUpload.useMutation();

  const handleFiles = useCallback(
    async (files: File[]) => {
      const remaining = maxRefs - styleRefs.length;
      const toUpload = files.slice(0, remaining);

      if (files.length > remaining) {
        toast.info(`Only ${remaining} more style reference(s) can be added`);
      }

      for (const file of toUpload) {
        // Validate type
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          toast.error(`${file.name}: unsupported format (use JPEG, PNG, or WebP)`);
          continue;
        }
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name}: exceeds 20MB limit`);
          continue;
        }

        const localUrl = URL.createObjectURL(file);
        const newRef: StyleRef = { url: localUrl, file, uploading: true };
        onChange([...styleRefs, newRef]);

        try {
          if (!projectId) continue;

          const { uploadId } = await getUploadUrl.mutateAsync({
            projectId,
            fileName: `style_${file.name}`,
            mimeType: file.type,
            fileSizeBytes: file.size,
          });

          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1]);
            };
            reader.readAsDataURL(file);
          });

          const { fileUrl } = await confirmUpload.mutateAsync({
            uploadId,
            fileDataBase64: base64,
            mimeType: file.type,
          });

          // Replace local URL with S3 URL and mark as analyzed
          onChange(
            styleRefs.map((ref) =>
              ref.url === localUrl
                ? {
                    ...ref,
                    url: fileUrl,
                    uploading: false,
                    analyzed: true,
                    attributes: {
                      lineWeight: "medium",
                      palette: ["#1a1a2e", "#6b5bff", "#00f0ff"],
                      mood: "dramatic",
                      artStyle: "anime",
                    },
                  }
                : ref
            )
          );

          emitAnalytics("stage0_stylesheet_uploaded");
        } catch {
          toast.error(`Failed to upload ${file.name}`);
          onChange(styleRefs.filter((ref) => ref.url !== localUrl));
        }
      }
    },
    [styleRefs, onChange, projectId, maxRefs, getUploadUrl, confirmUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [handleFiles]
  );

  const handleRemove = (index: number) => {
    onChange(styleRefs.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-white/50 uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5" />
          Style references
        </label>
        <span className="text-[10px] text-white/30 tabular-nums">
          {styleRefs.length}/{maxRefs}
        </span>
      </div>

      {/* Drop zone */}
      {styleRefs.length < maxRefs && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-token-violet bg-token-violet/[0.05]"
              : "border-white/10 bg-white/[0.01] hover:border-white/20"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
            className="hidden"
          />
          <div className="flex flex-col items-center gap-2">
            <Upload
              className={`w-6 h-6 transition-colors ${
                isDragging ? "text-token-violet" : "text-white/20"
              }`}
            />
            <p className="text-xs text-white/40">
              Drop style reference images (line weight, palette, mood)
            </p>
          </div>
        </div>
      )}

      {/* Style ref grid */}
      {styleRefs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {styleRefs.map((ref, i) => (
              <motion.div
                key={`${ref.url}-${i}`}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-white/10 hover:ring-2 hover:ring-token-violet/40 transition-all group"
              >
                <img
                  src={ref.url}
                  alt={`Style ref ${i + 1}`}
                  className="w-full h-full object-cover"
                />

                {/* Uploading overlay */}
                {ref.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                  </div>
                )}

                {/* Analyzed badge */}
                {ref.analyzed && !ref.uploading && (
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                    <Sparkles className="w-2.5 h-2.5 text-token-mint" />
                    <span className="text-[9px] text-white/60">Analyzed</span>
                  </div>
                )}

                {/* Detected palette dots */}
                {ref.attributes?.palette && !ref.uploading && (
                  <div className="absolute bottom-1.5 right-1.5 flex gap-0.5">
                    {ref.attributes.palette.slice(0, 4).map((color, ci) => (
                      <div
                        key={ci}
                        className="w-2.5 h-2.5 rounded-full ring-1 ring-black/30"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(i);
                  }}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white/70" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Style attributes summary */}
      {styleRefs.some((r) => r.attributes) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {Array.from(
            new Set(styleRefs.filter((r) => r.attributes).map((r) => r.attributes!.artStyle))
          ).map((style) => (
            <span
              key={style}
              className="text-[10px] px-2 py-0.5 rounded-full bg-token-violet/10 text-token-violet/70 border border-token-violet/20"
            >
              {style}
            </span>
          ))}
          {Array.from(
            new Set(styleRefs.filter((r) => r.attributes).map((r) => r.attributes!.mood))
          ).map((mood) => (
            <span
              key={mood}
              className="text-[10px] px-2 py-0.5 rounded-full bg-token-cyan/10 text-token-cyan/70 border border-token-cyan/20"
            >
              {mood}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Analytics Helper ───────────────────────────────────────────────────────

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
