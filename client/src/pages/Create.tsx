import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wand2, ChevronDown, Loader2, BookOpen, Zap, Lock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";

const GENRES = [
  "Action", "Romance", "Sci-Fi", "Fantasy", "Horror",
  "Comedy", "Mystery", "Slice of Life", "Thriller", "Adventure",
];

const STYLES: { value: string; label: string }[] = [
  { value: "shonen", label: "Shonen" },
  { value: "seinen", label: "Seinen" },
  { value: "shoujo", label: "Shojo" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "watercolor", label: "Watercolor" },
  { value: "noir", label: "Noir" },
  { value: "realistic", label: "Realistic" },
  { value: "mecha", label: "Mecha" },
];

export default function Create() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("Fantasy");
  const [style, setStyle] = useState("shonen");
  const [chapters, setChapters] = useState(3);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const quickCreate = trpc.quickCreate.start.useMutation({
    onSuccess: (data) => {
      navigate(`/create/${data.projectId}`);
    },
    onError: (err) => {
      setIsSubmitting(false);
      alert(err.message);
    },
  });

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || prompt.trim().length < 10) return;

    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }

    setIsSubmitting(true);
    quickCreate.mutate({
      prompt: prompt.trim(),
      genre,
      style: style as any,
      chapters,
    });
  }, [prompt, genre, style, chapters, isAuthenticated, quickCreate]);

  return (
    <div className="min-h-screen bg-[#08080F] relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-[#E94560]/5 blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#6C63FF]/5 blur-[150px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#00D4AA]/3 blur-[200px] animate-pulse" style={{ animationDelay: "4s" }} />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Top nav link back */}
      <div className="relative z-10 pt-6 px-6">
        <button onClick={() => navigate("/")} className="text-white/40 hover:text-white/70 transition text-sm flex items-center gap-1">
          <BookOpen className="w-4 h-4" /> Back to Awakli
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-4 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-2xl"
        >
          {/* Heading */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm mb-6"
            >
              <Sparkles className="w-4 h-4 text-[#E94560]" />
              No artistic skill needed
            </motion.div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
              What story will{" "}
              <span className="bg-gradient-to-r from-[#E94560] via-[#FF6B81] to-[#6C63FF] bg-clip-text text-transparent">
                you tell?
              </span>
            </h1>
            <p className="text-white/40 mt-3 text-lg">
              Describe your story and AI will create the manga panels for you.
            </p>
          </div>

          {/* Prompt textarea */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A young hacker discovers that the city's AI defense system is actually sentient and has been protecting a secret for 50 years..."
              className="w-full min-h-[200px] p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-lg placeholder:text-white/20 focus:outline-none focus:border-[#E94560]/40 focus:ring-1 focus:ring-[#E94560]/20 resize-none transition-all"
              maxLength={5000}
            />
            <div className="absolute bottom-3 right-4 text-white/20 text-xs">
              {prompt.length}/5000
            </div>
          </motion.div>

          {/* Inline options */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-wrap items-center gap-3 mt-4"
          >
            {/* Genre pills */}
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenre(g)}
                  className={`px-3 py-1 rounded-full text-sm transition-all ${
                    genre === g
                      ? "bg-[#E94560] text-white shadow-lg shadow-[#E94560]/25"
                      : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-white/10 hidden md:block" />

            {/* Style dropdown */}
            <div className="relative">
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="appearance-none bg-white/5 border border-white/10 text-white/70 text-sm rounded-lg px-3 py-1.5 pr-8 focus:outline-none focus:border-[#E94560]/40 cursor-pointer"
              >
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#12121A]">
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
            </div>

            {/* Chapters */}
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-sm">Chapters:</span>
              <input
                type="number"
                min={1}
                max={12}
                value={chapters}
                onChange={(e) => setChapters(Math.max(1, Math.min(12, parseInt(e.target.value) || 1)))}
                className="w-14 bg-white/5 border border-white/10 text-white text-sm rounded-lg px-2 py-1.5 text-center focus:outline-none focus:border-[#E94560]/40"
              />
            </div>
          </motion.div>

          {/* Generate button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-6"
          >
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || prompt.trim().length < 10 || isSubmitting}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none relative overflow-hidden group"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating your manga...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Wand2 className="w-5 h-5" />
                  Generate My Manga
                </span>
              )}
              {/* Glow effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>
            {prompt.trim().length > 0 && prompt.trim().length < 10 && (
              <p className="text-[#E94560]/60 text-sm mt-2 text-center">
                Please write at least 10 characters to describe your story
              </p>
            )}
          </motion.div>

          {/* Inspiration section */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-10 text-center"
          >
            <p className="text-white/30 text-sm mb-3">Need inspiration? Try one of these:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                "A samurai who can see 10 seconds into the future must protect a blind oracle",
                "In a world where dreams are currency, a broke teenager discovers she can forge them",
                "Two rival chefs compete in a cooking tournament where the dishes come alive",
              ].map((idea, i) => (
                <button
                  key={i}
                  onClick={() => setPrompt(idea)}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-white/30 text-xs hover:text-white/60 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left max-w-[280px] truncate"
                >
                  {idea}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-8 flex justify-center gap-8 text-center"
          >
            {[
              { label: "Manga Created", value: "12K+" },
              { label: "Panels Generated", value: "180K+" },
              { label: "Active Creators", value: "3.2K" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-white/80 font-semibold text-lg">{stat.value}</div>
                <div className="text-white/30 text-xs">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#12121A] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#E94560]/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-7 h-7 text-[#E94560]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Sign in to create</h2>
                <p className="text-white/50 mb-6">
                  Create a free account to generate your manga and save your stories.
                </p>
                <a
                  href={getLoginUrl()}
                  className="block w-full py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all text-center"
                >
                  <Zap className="inline w-5 h-5 mr-2" />
                  Sign Up Free
                </a>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="mt-3 text-white/40 hover:text-white/60 text-sm transition"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
