import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, Sparkles, Crown, X, Loader2, Film } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";

interface SneakPeekCardProps {
  projectId: number;
  projectTitle: string;
  coverUrl?: string | null;
  variant?: "reader" | "project"; // reader = inline in reader, project = on project page
}

export default function SneakPeekCard({ projectId, projectTitle, coverUrl, variant = "project" }: SneakPeekCardProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showPostPlay, setShowPostPlay] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: status, isLoading } = trpc.sneakPeek.getStatus.useQuery({ projectId });
  const generateMutation = trpc.sneakPeek.generate.useMutation({
    onSuccess: () => {
      setIsGenerating(false);
    },
    onError: () => {
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    setIsGenerating(true);
    generateMutation.mutate({ projectId });
  };

  const handlePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setShowPostPlay(true);
  };

  if (isLoading) {
    return (
      <div className={`rounded-xl bg-white/[0.03] border border-white/10 p-6 ${variant === "reader" ? "mx-4 my-4" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/5 animate-pulse" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
            <div className="h-3 w-48 bg-white/5 rounded animate-pulse mt-2" />
          </div>
        </div>
      </div>
    );
  }

  // No sneak peek available yet - show generate CTA
  if (!status || status.status === "none" || status.status === "failed") {
    if (!user) return null; // Don't show to non-authenticated users

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl bg-gradient-to-br from-[#6C63FF]/10 to-[#7C4DFF]/10 border border-[#6C63FF]/20 p-5 ${variant === "reader" ? "mx-4 my-4" : ""}`}
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
            <Film className="w-6 h-6 text-[#6C63FF]" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-semibold text-sm">Anime Sneak Peek</h3>
            <p className="text-white/50 text-xs mt-1">
              See a 5-10 second anime clip of the best scene from this manga. Powered by AI.
            </p>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#7C4DFF] text-white text-sm font-medium hover:shadow-lg hover:shadow-[#6C63FF]/25 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Generate Sneak Peek
                </span>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Generating state
  if (status.status === "generating") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl bg-white/[0.03] border border-[#6C63FF]/20 p-5 ${variant === "reader" ? "mx-4 my-4" : ""}`}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
            <Loader2 className="w-6 h-6 text-[#6C63FF] animate-spin" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Generating Sneak Peek...</h3>
            <p className="text-white/50 text-xs mt-1">
              AI is creating a short anime clip. This may take a minute.
            </p>
          </div>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#6C63FF] to-[#7C4DFF]"
            initial={{ width: "0%" }}
            animate={{ width: "80%" }}
            transition={{ duration: 30, ease: "linear" }}
          />
        </div>
      </motion.div>
    );
  }

  // Ready - show player
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-xl overflow-hidden border border-white/10 ${variant === "reader" ? "mx-4 my-4" : ""}`}
      >
        {/* Video container */}
        <div className="relative aspect-video bg-black group cursor-pointer" onClick={handlePlay}>
          {/* Cover image / video */}
          {status.url ? (
            <video
              ref={videoRef}
              src={status.url}
              poster={coverUrl || undefined}
              muted={isMuted}
              onEnded={handleVideoEnd}
              className="w-full h-full object-cover"
              playsInline
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#12121A] to-[#1a1a2e] flex items-center justify-center">
              {coverUrl && <img src={coverUrl} alt="" className="w-full h-full object-cover opacity-40" />}
            </div>
          )}

          {/* Play/Pause overlay */}
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${isPlaying ? "opacity-0 group-hover:opacity-100" : "opacity-100"}`}>
            <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20">
              {isPlaying ? (
                <Pause className="w-7 h-7 text-white" />
              ) : (
                <Play className="w-7 h-7 text-white ml-1" />
              )}
            </div>
          </div>

          {/* Badge */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm border border-white/10">
            <Sparkles className="w-3 h-3 text-[#E040FB]" />
            <span className="text-white text-xs font-medium">Sneak Peek</span>
          </div>

          {/* Mute button */}
          {isPlaying && (
            <button
              onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10 hover:bg-black/80 transition"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-white" /> : <Volume2 className="w-4 h-4 text-white" />}
            </button>
          )}

          {/* Duration badge */}
          <div className="absolute bottom-3 left-3 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white/80 text-xs">
            5-10s
          </div>
        </div>

        {/* Info bar */}
        <div className="bg-white/[0.03] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-white/80 text-sm font-medium">{projectTitle} — Anime Preview</p>
            <p className="text-white/40 text-xs mt-0.5">AI-generated from the best scene</p>
          </div>
          <button
            onClick={() => navigate("/pricing")}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#E040FB] to-[#7C4DFF] text-white text-xs font-medium hover:shadow-lg hover:shadow-[#7C4DFF]/20 transition-all"
          >
            <Crown className="w-3 h-3 inline mr-1" />
            Full Anime
          </button>
        </div>
      </motion.div>

      {/* Post-play modal */}
      <AnimatePresence>
        {showPostPlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4"
            onClick={() => setShowPostPlay(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#12121A] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowPostPlay(false)}
                className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7C4DFF]/20 to-[#6C63FF]/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[#E040FB]" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-2">Liked the preview?</h2>
              <p className="text-white/50 mb-6">
                Upgrade to Creator or Studio to get full anime episodes with voice acting, music, and 4K quality.
              </p>

              <div className="space-y-3">
                <button
                  onClick={() => { setShowPostPlay(false); navigate("/pricing"); }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-[#E040FB] to-[#7C4DFF] text-white font-semibold shadow-lg shadow-[#7C4DFF]/25 hover:shadow-[#7C4DFF]/40 transition-all"
                >
                  <Crown className="inline w-5 h-5 mr-2" />
                  Upgrade Now
                </button>
                <button
                  onClick={() => { setShowPostPlay(false); handlePlay(); }}
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white/80 hover:bg-white/10 transition-all"
                >
                  <Play className="inline w-4 h-4 mr-2" />
                  Watch Again
                </button>
              </div>

              {/* Comparison */}
              <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/10">
                  <p className="text-white/40 text-xs font-medium uppercase">Sneak Peek</p>
                  <ul className="mt-2 space-y-1 text-white/50 text-xs">
                    <li>5-10 seconds</li>
                    <li>720p quality</li>
                    <li>Watermarked</li>
                    <li>No voice acting</li>
                  </ul>
                </div>
                <div className="p-3 rounded-lg bg-[#7C4DFF]/5 border border-[#7C4DFF]/20">
                  <p className="text-[#E040FB] text-xs font-medium uppercase">Full Anime</p>
                  <ul className="mt-2 space-y-1 text-white/60 text-xs">
                    <li>Full episodes</li>
                    <li>Up to 4K</li>
                    <li>No watermark</li>
                    <li>Voice + music</li>
                  </ul>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
