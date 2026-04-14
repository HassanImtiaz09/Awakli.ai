import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Download, FileText, Image, BookOpen, Archive, Film, Music, Subtitles,
  Lock, Crown, Loader2, CheckCircle, ExternalLink, HardDrive,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectTitle: string;
  hasAnime?: boolean;
}

const FORMAT_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  png_zip: Image,
  epub: BookOpen,
  cbz: Archive,
  tiff_zip: Image,
  mp4_1080: Film,
  mp4_4k: Film,
  prores: Film,
  stems: Music,
  srt: Subtitles,
  thumbnail: Image,
};

const FORMAT_LABELS: Record<string, string> = {
  pdf: "PDF",
  png_zip: "PNG ZIP",
  epub: "ePub",
  cbz: "CBZ",
  tiff_zip: "TIFF ZIP",
  mp4_1080: "MP4 1080p",
  mp4_4k: "MP4 4K",
  prores: "ProRes 422",
  stems: "Audio Stems",
  srt: "SRT Subtitles",
  thumbnail: "Thumbnails",
};

function formatFileSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} KB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

export default function DownloadModal({ isOpen, onClose, projectId, projectTitle, hasAnime }: DownloadModalProps) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"manga" | "anime">("manga");
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const { data: formats, isLoading } = trpc.downloads.getFormats.useQuery(
    { projectId },
    { enabled: isOpen }
  );

  const generateMutation = trpc.downloads.generate.useMutation({
    onSuccess: (data) => {
      setDownloadUrl(data.fileUrl);
      setExportingFormat(null);
    },
    onError: () => {
      setExportingFormat(null);
    },
  });

  const handleDownload = (format: string) => {
    if (exportingFormat) return;
    setExportingFormat(format);
    setDownloadUrl(null);
    generateMutation.mutate({ projectId, format: format as any });
  };

  if (!isOpen) return null;

  const currentFormats = activeTab === "manga" ? formats?.mangaFormats : formats?.animeFormats;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#12121A] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00D4AA]/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-[#00D4AA]" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Download</h2>
                <p className="text-white/40 text-xs">{projectTitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tier info */}
          {formats && (
            <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-xs">Your tier:</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  formats.userTier === "studio" ? "bg-[#6C63FF]/20 text-[#6C63FF]" :
                  formats.userTier === "creator" ? "bg-[#E94560]/20 text-[#E94560]" :
                  "bg-white/10 text-white/60"
                }`}>
                  {formats.userTier.charAt(0).toUpperCase() + formats.userTier.slice(1)}
                </span>
              </div>
              <div className="text-white/40 text-xs">
                {formats.chapterCount} chapter{formats.chapterCount !== 1 ? "s" : ""} · {formats.panelCount} panels
              </div>
            </div>
          )}

          {/* Tabs */}
          {hasAnime && (
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setActiveTab("manga")}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  activeTab === "manga"
                    ? "text-white border-b-2 border-[#E94560]"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Manga Formats
              </button>
              <button
                onClick={() => setActiveTab("anime")}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  activeTab === "anime"
                    ? "text-white border-b-2 border-[#6C63FF]"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                Anime Formats
              </button>
            </div>
          )}

          {/* Format list */}
          <div className="px-4 py-3 max-h-[400px] overflow-y-auto space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
              </div>
            ) : currentFormats && currentFormats.length > 0 ? (
              currentFormats.map((fmt) => {
                const Icon = FORMAT_ICONS[fmt.format] || FileText;
                const isExporting = exportingFormat === fmt.format;
                const isReady = downloadUrl && exportingFormat === null && generateMutation.variables?.format === fmt.format;

                return (
                  <div
                    key={fmt.format}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      fmt.unlocked
                        ? "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                        : "bg-white/[0.01] border-white/5 opacity-60"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      fmt.unlocked ? "bg-white/5" : "bg-white/[0.02]"
                    }`}>
                      <Icon className={`w-5 h-5 ${fmt.unlocked ? "text-white/70" : "text-white/30"}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${fmt.unlocked ? "text-white" : "text-white/40"}`}>
                          {FORMAT_LABELS[fmt.format] || fmt.format}
                        </span>
                        {!fmt.unlocked && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#6C63FF]/20 text-[#6C63FF] uppercase">
                            {fmt.minTier}
                          </span>
                        )}
                        {(fmt as any).watermarked && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">
                            Watermark
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-white/30 text-xs">{fmt.description}</span>
                        <span className="text-white/20 text-xs">·</span>
                        <span className="text-white/30 text-xs flex items-center gap-1">
                          <HardDrive className="w-3 h-3" />
                          ~{formatFileSize(fmt.estimatedSizeMb)}
                        </span>
                        {(fmt as any).dpi && (
                          <>
                            <span className="text-white/20 text-xs">·</span>
                            <span className="text-white/30 text-xs">{(fmt as any).dpi} DPI</span>
                          </>
                        )}
                        {(fmt as any).resolution && (
                          <>
                            <span className="text-white/20 text-xs">·</span>
                            <span className="text-white/30 text-xs">{(fmt as any).resolution}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action button */}
                    {fmt.unlocked ? (
                      isExporting ? (
                        <Loader2 className="w-5 h-5 text-[#00D4AA] animate-spin shrink-0" />
                      ) : isReady ? (
                        <a
                          href={downloadUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg bg-[#00D4AA]/10 text-[#00D4AA] hover:bg-[#00D4AA]/20 transition shrink-0"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </a>
                      ) : (
                        <button
                          onClick={() => handleDownload(fmt.format)}
                          disabled={!!exportingFormat}
                          className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition shrink-0 disabled:opacity-30"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => navigate("/pricing")}
                        className="p-2 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] hover:bg-[#6C63FF]/20 transition shrink-0"
                      >
                        <Lock className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <p className="text-white/40 text-sm">
                  {activeTab === "anime" ? "No anime content available for this project yet." : "No formats available."}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
            <p className="text-white/30 text-xs">
              Downloads expire after 24 hours
            </p>
            {formats && formats.userTier === "free" && (
              <button
                onClick={() => navigate("/pricing")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white text-xs font-medium hover:shadow-lg hover:shadow-[#E94560]/20 transition-all"
              >
                <Crown className="w-3.5 h-3.5" />
                Unlock All Formats
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
