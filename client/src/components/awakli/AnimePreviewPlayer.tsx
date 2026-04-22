import { trpc } from "@/lib/trpc";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Film, Play, Sparkles, Lock, ArrowRight, Loader2, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import { Link } from "wouter";

interface AnimePreviewPlayerProps {
  projectId: number;
  projectTitle: string;
  coverUrl?: string | null;
}

export function AnimePreviewPlayer({ projectId, projectTitle, coverUrl }: AnimePreviewPlayerProps) {
  const { isAuthenticated } = useAuth();
  const [showPlayer, setShowPlayer] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const previewStatus = trpc.animePreview.getStatus.useQuery(
    { projectId },
    { enabled: isAuthenticated }
  );

  const canGenerateQuery = trpc.animePreview.canGenerate.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const generatePreview = trpc.animePreview.generate.useMutation({
    onSuccess: () => {
      toast.success("Anime preview is being generated! This may take a minute.");
      previewStatus.refetch();
      canGenerateQuery.refetch();
    },
    onError: (err) => {
      if (err.message.includes("already used")) {
        setShowUpgradeModal(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const status = previewStatus.data;
  const hasPreview = status?.hasPreview;
  const canGenerate = canGenerateQuery.data?.canGenerate ?? false;

  const handleGenerate = () => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }
    generatePreview.mutate({ projectId });
  };

  return (
    <>
      <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F0FF] to-[#0099CC] flex items-center justify-center">
            <Film className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Anime Preview</h3>
            <p className="text-xs text-gray-500">See your manga animated</p>
          </div>
          {canGenerate && (
            <span className="ml-auto px-2 py-0.5 rounded-full bg-token-cyan/10 text-token-cyan text-xs font-semibold">
              Free
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {hasPreview ? (
            <div className="space-y-3">
              {/* Preview thumbnail / player */}
              {showPlayer ? (
                <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                  <video
                    src={status.previewUrl!}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                  <button
                    onClick={() => setShowPlayer(false)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPlayer(true)}
                  className="relative w-full aspect-video rounded-xl overflow-hidden group"
                >
                  {coverUrl ? (
                    <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#151528] to-[#0D0D1A]" />
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                    <div className="w-16 h-16 rounded-full bg-token-cyan/20 backdrop-blur-sm flex items-center justify-center border border-token-cyan/30 group-hover:scale-110 transition-transform">
                      <Play className="w-7 h-7 text-token-cyan ml-1" />
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-black/60 text-xs text-white font-medium">
                    0:15 Preview
                  </div>
                </button>
              )}

              <p className="text-xs text-gray-500 text-center">
                Upgrade to Creator for full anime episodes
              </p>
            </div>
          ) : canGenerate ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-token-cyan/10 to-token-cyan/5 flex items-center justify-center mx-auto mb-4 border border-token-cyan/20">
                <Sparkles className="w-7 h-7 text-token-cyan" />
              </div>
              <p className="text-sm text-gray-300 mb-1">
                Get a free 15-second anime preview
              </p>
              <p className="text-xs text-gray-500 mb-4">
                See your manga panels come alive with AI animation
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={generatePreview.isPending}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#0099CC] text-white font-semibold text-sm shadow-lg shadow-token-cyan/20 hover:shadow-token-cyan/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generatePreview.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Film className="w-4 h-4" />
                    Generate Free Preview
                  </>
                )}
              </motion.button>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center mx-auto mb-4 border border-white/5">
                <Lock className="w-7 h-7 text-gray-600" />
              </div>
              <p className="text-sm text-gray-400 mb-1">
                Preview already used
              </p>
              <p className="text-xs text-gray-500 mb-4">
                Upgrade to Creator for unlimited anime production
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold text-sm shadow-lg shadow-[#6B5BFF]/20 hover:shadow-[#6B5BFF]/40 transition-all"
              >
                Upgrade to Creator
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowUpgradeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md p-8 rounded-2xl border border-token-violet/20 bg-[#0D0D1A] text-center"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#6B5BFF] flex items-center justify-center mx-auto mb-6">
                <Film className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-heading font-bold text-white mb-2">
                Unlock Full Anime Production
              </h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                You've used your free anime preview. Upgrade to Creator ($19/mo)
                for 5 anime episodes per month, voice clones, and monetization.
              </p>
              <div className="space-y-3">
                <Link
                  href="/pricing"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold text-sm shadow-lg shadow-[#6B5BFF]/20 hover:shadow-[#6B5BFF]/40 transition-all"
                >
                  View Plans
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="w-full py-3 rounded-xl border border-white/10 text-gray-400 text-sm hover:text-white hover:bg-white/5 transition-all"
                >
                  Maybe Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
