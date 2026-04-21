import { useAuth } from "@/_core/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Sparkles, ArrowRight, Wand2, Eye, Film, Users,
  BookOpen, Heart, PenTool, Palette
} from "lucide-react";

export default function Onboarding() {
  const [path, setPath] = useState<"choose" | "creator" | "reader">("choose");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-[#08080F] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#6B5BFF]/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-[#00D4FF]/5 blur-[120px]" />
      </div>

      <AnimatePresence mode="wait">
        {path === "choose" && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="relative w-full max-w-3xl"
          >
            {/* Welcome header */}
            <div className="text-center mb-10">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#6B5BFF]/20 bg-[#6B5BFF]/5 text-[#00F0FF] text-sm font-medium mb-6"
              >
                <Sparkles className="w-4 h-4" />
                Welcome to Awakli
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-4xl md:text-5xl font-display font-bold text-white mb-4"
              >
                What brings you here?
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-gray-400 text-lg max-w-md mx-auto"
              >
                Choose your path. You can always switch later.
              </motion.p>
            </div>

            {/* Two path cards */}
            <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              {/* Creator path */}
              <motion.button
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                whileHover={{ scale: 1.02, borderColor: "rgba(107,91,255,0.4)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPath("creator")}
                className="text-left p-8 rounded-2xl border border-[#6B5BFF]/15 bg-gradient-to-br from-[#0D0D1A] to-[#1A0A2E]/40 hover:shadow-lg hover:shadow-[#6B5BFF]/10 transition-all group"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#6B5BFF]/10 border border-[#6B5BFF]/20 flex items-center justify-center mb-6 group-hover:bg-[#6B5BFF]/15 transition-colors">
                  <Wand2 className="w-8 h-8 text-[#00F0FF]" />
                </div>
                <h2 className="text-2xl font-heading font-bold text-white mb-3">
                  I Want to Create
                </h2>
                <p className="text-gray-400 leading-relaxed mb-6">
                  Write stories and let AI turn them into manga. Build an audience and earn votes to get your manga animated.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Write Stories", "Generate Manga", "Earn Anime"].map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-[#6B5BFF]/10 text-[#00F0FF] text-xs font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2 text-[#00F0FF] font-semibold text-sm">
                  Start creating <ArrowRight className="w-4 h-4" />
                </div>
              </motion.button>

              {/* Reader path */}
              <motion.button
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.02, borderColor: "rgba(0,212,255,0.4)" }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPath("reader")}
                className="text-left p-8 rounded-2xl border border-[#00D4FF]/15 bg-gradient-to-br from-[#0D0D1A] to-[#0A1A2E]/40 hover:shadow-lg hover:shadow-[#00D4FF]/10 transition-all group"
              >
                <div className="w-16 h-16 rounded-2xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center mb-6 group-hover:bg-[#00D4FF]/15 transition-colors">
                  <Eye className="w-8 h-8 text-[#00D4FF]" />
                </div>
                <h2 className="text-2xl font-heading font-bold text-white mb-3">
                  I Want to Discover
                </h2>
                <p className="text-gray-400 leading-relaxed mb-6">
                  Read AI-generated manga from creators worldwide. Vote for the stories you want to see become anime.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Read Manga", "Vote for Anime", "Follow Creators"].map((tag) => (
                    <span key={tag} className="px-3 py-1 rounded-full bg-[#00D4FF]/10 text-[#00D4FF] text-xs font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-2 text-[#00D4FF] font-semibold text-sm">
                  Start exploring <ArrowRight className="w-4 h-4" />
                </div>
              </motion.button>
            </div>

            {/* Skip */}
            <div className="text-center mt-8">
              <button
                onClick={() => navigate("/discover")}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Skip onboarding
              </button>
            </div>
          </motion.div>
        )}

        {path === "creator" && (
          <motion.div
            key="creator"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="relative w-full max-w-2xl"
          >
            <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] p-8 md:p-12 text-center">
              <div className="w-20 h-20 rounded-2xl bg-[#6B5BFF]/10 border border-[#6B5BFF]/20 flex items-center justify-center mx-auto mb-6">
                <PenTool className="w-10 h-10 text-[#00F0FF]" />
              </div>

              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
                Let's Create Your First Manga
              </h1>
              <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
                We'll drop you into the creator with an example prompt. Edit it or write your own!
              </p>

              {/* Preview of what they'll see */}
              <div className="rounded-xl border border-white/5 bg-black/20 p-6 mb-8 text-left">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Example prompt</div>
                <p className="text-white/80 text-sm italic leading-relaxed">
                  "A cyberpunk detective who solves crimes by entering people's dreams. In a neon-lit Tokyo of 2087, she discovers a conspiracy that blurs the line between dreams and reality..."
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-8">
                {[
                  { icon: PenTool, label: "Write", color: "#6B5BFF" },
                  { icon: Wand2, label: "Generate", color: "#9B59B6" },
                  { icon: Heart, label: "Vote", color: "#00D4FF" },
                  { icon: Film, label: "Animate", color: "#FFB800" },
                ].map((s) => (
                  <div key={s.label} className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-center">
                    <s.icon className="w-5 h-5 mx-auto mb-1.5" style={{ color: s.color }} />
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPath("choose")}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:text-white hover:bg-white/5 transition-all"
                >
                  Back
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(107,91,255,0.4)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate("/create?prompt=" + encodeURIComponent("A cyberpunk detective who solves crimes by entering people's dreams. In a neon-lit Tokyo of 2087, she discovers a conspiracy that blurs the line between dreams and reality..."))}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#6B5BFF] text-white font-semibold shadow-lg shadow-[#6B5BFF]/25"
                >
                  Start Creating <ArrowRight className="inline ml-2 w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {path === "reader" && (
          <motion.div
            key="reader"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
            className="relative w-full max-w-2xl"
          >
            <div className="rounded-2xl border border-white/5 bg-[#0D0D1A] p-8 md:p-12 text-center">
              <div className="w-20 h-20 rounded-2xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center mx-auto mb-6">
                <BookOpen className="w-10 h-10 text-[#00D4FF]" />
              </div>

              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
                Discover Amazing Manga
              </h1>
              <p className="text-gray-400 text-lg mb-8 max-w-md mx-auto">
                We'll take you to the community feed. Vote for manga you want to see become anime!
              </p>

              {/* How voting works */}
              <div className="rounded-xl border border-white/5 bg-black/20 p-6 mb-8 text-left">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">How it works</div>
                <div className="space-y-3">
                  {[
                    { icon: BookOpen, text: "Browse manga created by the community", color: "#00D4FF" },
                    { icon: Heart, text: "Vote for stories you love", color: "#6B5BFF" },
                    { icon: Film, text: "Top-voted manga become anime", color: "#FFB800" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 flex-shrink-0" style={{ color: item.color }} />
                      <span className="text-sm text-gray-400">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setPath("choose")}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:text-white hover:bg-white/5 transition-all"
                >
                  Back
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(0,212,255,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate("/discover")}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#0099CC] text-white font-semibold shadow-lg shadow-[#00D4FF]/25"
                >
                  Explore Manga <ArrowRight className="inline ml-2 w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
