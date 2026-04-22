import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Download, X, FileImage, FileText, Film, Music, Lock,
  ArrowRight, Loader2, Check,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectTitle: string;
  hasAnime?: boolean;
}

const MANGA_FORMATS = [
  { key: "pdf", label: "PDF Document", icon: FileText, desc: "Full manga with panels and dialogue", tier: "creator" },
  { key: "png", label: "PNG Images", icon: FileImage, desc: "Individual high-res panel images", tier: "creator" },
  { key: "cbz", label: "CBZ Archive", icon: FileText, desc: "Comic book archive format", tier: "studio" },
] as const;

const ANIME_FORMATS = [
  { key: "mp4_1080", label: "MP4 (1080p)", icon: Film, desc: "Standard HD video", tier: "creator" },
  { key: "mp4_4k", label: "MP4 (4K)", icon: Film, desc: "Ultra HD video", tier: "studio" },
  { key: "prores", label: "ProRes", icon: Film, desc: "Professional editing format", tier: "studio" },
  { key: "srt", label: "Subtitles (SRT)", icon: FileText, desc: "Subtitle file for dialogue", tier: "creator" },
  { key: "stems", label: "Audio Stems", icon: Music, desc: "Separate voice, music, SFX tracks", tier: "studio" },
] as const;

export function ExportModal({ isOpen, onClose, projectId, projectTitle, hasAnime }: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<"manga" | "anime">("manga");
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  const exportGenerate = trpc.export.generate.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Export started! You'll be notified when it's ready.");
      setExportingFormat(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setExportingFormat(null);
    },
  });

  const handleExport = (format: string, type: "manga" | "anime") => {
    setExportingFormat(format);
    exportGenerate.mutate({ projectId, type, format });
  };

  const formats = activeTab === "manga" ? MANGA_FORMATS : ANIME_FORMATS;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0D0D1A] overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-heading font-bold text-white">Export</h3>
                <p className="text-xs text-gray-500 mt-0.5">{projectTitle}</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            {hasAnime && (
              <div className="flex border-b border-white/5">
                <button
                  onClick={() => setActiveTab("manga")}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === "manga"
                      ? "text-white border-b-2 border-token-violet"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Manga
                </button>
                <button
                  onClick={() => setActiveTab("anime")}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    activeTab === "anime"
                      ? "text-white border-b-2 border-token-cyan"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Anime
                </button>
              </div>
            )}

            {/* Format list */}
            <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
              {formats.map((fmt) => {
                const Icon = fmt.icon;
                const isExporting = exportingFormat === fmt.key;
                const isLocked = false; // Tier check would go here in real implementation

                return (
                  <button
                    key={fmt.key}
                    onClick={() => !isLocked && handleExport(fmt.key, activeTab)}
                    disabled={isExporting || isLocked}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                      isLocked
                        ? "border-white/5 bg-[#08080F] opacity-50 cursor-not-allowed"
                        : isExporting
                        ? "border-token-violet/30 bg-token-violet/5"
                        : "border-white/5 bg-[#08080F] hover:border-white/10 hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      activeTab === "manga"
                        ? "bg-token-violet/10 text-token-violet"
                        : "bg-token-cyan/10 text-token-cyan"
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{fmt.label}</span>
                        {fmt.tier === "studio" && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-token-cyan/10 text-token-cyan">
                            STUDIO
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{fmt.desc}</p>
                    </div>
                    <div className="shrink-0">
                      {isLocked ? (
                        <Lock className="w-4 h-4 text-gray-600" />
                      ) : isExporting ? (
                        <Loader2 className="w-4 h-4 text-token-violet animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-gray-600">
                Some formats require Creator or Studio plan
              </p>
              <Link
                href="/pricing"
                className="text-xs text-token-violet hover:underline flex items-center gap-1"
              >
                View plans <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
