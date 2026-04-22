import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Share2, Copy, Check, Code, ExternalLink, MessageCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectTitle: string;
}

export default function ShareSheet({ isOpen, onClose, projectId, projectTitle }: ShareSheetProps) {
  const { user } = useAuth();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showEmbed, setShowEmbed] = useState(false);

  const { data: shareData } = trpc.sharing.getShareData.useQuery(
    { projectId },
    { enabled: isOpen }
  );

  const { data: embedData } = trpc.sharing.getEmbedCode.useQuery(
    { projectId },
    { enabled: isOpen && showEmbed && !!user }
  );

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const shareUrl = shareData
    ? `${window.location.origin}${shareData.shareUrl}`
    : `${window.location.origin}/watch/${projectId}`;

  const socialLinks = [
    {
      name: "Twitter / X",
      icon: "𝕏",
      color: "#1DA1F2",
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareData?.socialShareText?.twitter || projectTitle)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      name: "Reddit",
      icon: "R",
      color: "#FF4500",
      url: `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareData?.socialShareText?.reddit || projectTitle)}`,
    },
    {
      name: "WhatsApp",
      icon: "W",
      color: "#25D366",
      url: `https://wa.me/?text=${encodeURIComponent((shareData?.socialShareText?.whatsapp || projectTitle) + " " + shareUrl)}`,
    },
    {
      name: "Discord",
      icon: "D",
      color: "#5865F2",
      url: shareUrl, // Discord auto-embeds URLs
      copyOnly: true,
    },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="bg-[#12121A] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#6C63FF]/10 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-[#6C63FF]" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Share</h2>
                <p className="text-white/40 text-xs truncate max-w-[200px]">{projectTitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white/70 transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Copy link */}
          <div className="px-6 py-4">
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-2 block">Share Link</label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white/70 text-sm truncate">
                {shareUrl}
              </div>
              <button
                onClick={() => handleCopy(shareUrl, "link")}
                className={`px-3 py-2.5 rounded-lg border transition-all shrink-0 ${
                  copiedField === "link"
                    ? "bg-[#00D4AA]/10 border-[#00D4AA]/30 text-[#00D4AA]"
                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                }`}
              >
                {copiedField === "link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Social buttons */}
          <div className="px-6 pb-4">
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 block">Share On</label>
            <div className="grid grid-cols-4 gap-3">
              {socialLinks.map((social) => (
                <button
                  key={social.name}
                  onClick={() => {
                    if (social.copyOnly) {
                      handleCopy(shareUrl, social.name);
                    } else {
                      window.open(social.url, "_blank", "noopener,noreferrer,width=600,height=400");
                    }
                  }}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-all group"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
                    style={{ backgroundColor: `${social.color}20`, color: social.color }}
                  >
                    {social.icon}
                  </div>
                  <span className="text-white/50 text-xs group-hover:text-white/70 transition">
                    {copiedField === social.name ? "Copied!" : social.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Embed code (Creator/Studio) */}
          {user && (
            <div className="px-6 pb-4">
              <button
                onClick={() => setShowEmbed(!showEmbed)}
                className="flex items-center gap-2 text-white/40 text-sm hover:text-white/60 transition"
              >
                <Code className="w-4 h-4" />
                {showEmbed ? "Hide embed code" : "Get embed code"}
              </button>

              <AnimatePresence>
                {showEmbed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    {embedData ? (
                      <div className="mt-3">
                        <div className="relative">
                          <pre className="p-3 rounded-lg bg-black/40 border border-white/10 text-white/60 text-xs overflow-x-auto">
                            {embedData.iframeCode}
                          </pre>
                          <button
                            onClick={() => handleCopy(embedData.iframeCode, "embed")}
                            className={`absolute top-2 right-2 p-1.5 rounded transition ${
                              copiedField === "embed"
                                ? "bg-[#00D4AA]/20 text-[#00D4AA]"
                                : "bg-white/10 text-white/40 hover:text-white/60"
                            }`}
                          >
                            {copiedField === "embed" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-white/30 text-xs mt-2">
                          Embed requires Creator tier or higher
                        </p>
                      </div>
                    ) : (
                      <p className="text-white/30 text-xs mt-3">
                        Embed widget requires Creator tier or higher. <a href="/pricing" className="text-[#E040FB] hover:underline">Upgrade</a>
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Sneak peek share */}
          {shareData?.hasSneakPeek && (
            <div className="px-6 pb-4">
              <div className="p-3 rounded-xl bg-[#6C63FF]/5 border border-[#6C63FF]/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-4 h-4 text-[#6C63FF]" />
                </div>
                <div className="flex-1">
                  <p className="text-white/70 text-xs">This project has an anime sneak peek!</p>
                  <p className="text-white/40 text-[10px] mt-0.5">Viewers will see the preview when they visit the link.</p>
                </div>
              </div>
            </div>
          )}

          {/* Safe area for mobile */}
          <div className="h-2 sm:h-0" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
