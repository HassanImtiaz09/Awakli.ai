/**
 * AnimeGateHero — Full-bleed "Your manga is ready to breathe" hero.
 *
 * Uses CSS shimmer animation on the user's cover panel as background.
 * Audio preview toggle for ambient mood clip (muted by default).
 */
import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX, Sparkles } from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const ANIME_GATE_HERO_COPY = {
  title: "Your manga is ready to breathe.",
  subhead: "Pick the studio that fits the story you're telling.",
};

interface AnimeGateHeroProps {
  coverImageUrl?: string | null;
  ambientAudioUrl?: string | null;
}

export function AnimeGateHero({
  coverImageUrl,
  ambientAudioUrl,
}: AnimeGateHeroProps) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Audio toggle
  useEffect(() => {
    if (!ambientAudioUrl) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(ambientAudioUrl);
      audioRef.current.loop = true;
      audioRef.current.volume = 0.3;
    }
    if (audioEnabled) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
    return () => {
      audioRef.current?.pause();
    };
  }, [audioEnabled, ambientAudioUrl]);

  return (
    <div className="min-h-[70vh] grid place-items-center bg-[#0A0A0F] text-white overflow-hidden relative">
      {/* Background: cover image with shimmer overlay */}
      {coverImageUrl && (
        <div className="absolute inset-0">
          <img
            src={coverImageUrl}
            alt=""
            className="w-full h-full object-cover opacity-20 blur-sm scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0F]/60 via-transparent to-[#0A0A0F]" />
        </div>
      )}

      {/* CSS shimmer canvas replacement */}
      <div className="absolute inset-0 pointer-events-none opacity-70 mix-blend-screen overflow-hidden">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 600px 400px at 50% 50%, rgba(139,92,246,0.08), transparent 70%)",
          }}
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 400px 300px at 30% 60%, rgba(0,229,160,0.06), transparent 70%)",
          }}
          animate={{
            x: [0, -25, 20, 0],
            y: [0, 15, -10, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Particle field */}
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-white/20"
            style={{
              left: `${10 + (i * 4.2) % 80}%`,
              top: `${15 + (i * 3.7) % 70}%`,
            }}
            animate={{
              opacity: [0, 0.6, 0],
              y: [0, -30, -60],
              scale: [0.5, 1, 0.5],
            }}
            transition={{
              duration: 3 + (i % 3),
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 space-y-6 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center justify-center gap-2 text-[#8B5CF6] text-xs font-semibold uppercase tracking-widest"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Stage 04 — Anime Gate
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight"
        >
          {ANIME_GATE_HERO_COPY.title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="text-white/40 text-lg md:text-xl"
        >
          {ANIME_GATE_HERO_COPY.subhead}
        </motion.p>
      </div>

      {/* Audio toggle (bottom-right) */}
      {ambientAudioUrl && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          onClick={() => setAudioEnabled(!audioEnabled)}
          className="absolute bottom-6 right-6 z-20 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          title={audioEnabled ? "Mute ambient audio" : "Play ambient audio"}
        >
          {audioEnabled ? (
            <Volume2 className="w-4 h-4 text-white/50" />
          ) : (
            <VolumeX className="w-4 h-4 text-white/30" />
          )}
        </motion.button>
      )}
    </div>
  );
}
