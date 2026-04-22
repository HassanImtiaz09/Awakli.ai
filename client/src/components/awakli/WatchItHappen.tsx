import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Play, Pause, Clock, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/* ═══════════════════════════════════════════════════════════════════════
   B3 — "Watch It Happen" demo video section
   Autoplay muted on scroll-in, pause on scroll-out.
   3-up proof strip: before → middle → after with timer badge.
   "Try the demo prompt" CTA deep-links to /create/input?prompt=<encoded>.
   ═══════════════════════════════════════════════════════════════════════ */

const DEMO_PROMPT = "A lonely samurai walks through a neon-lit rain-soaked alley in Neo-Tokyo";
const ENCODED_PROMPT = encodeURIComponent(DEMO_PROMPT);

/* Placeholder poster — gradient overlay until real video is recorded */
const POSTER_GRADIENT =
  "linear-gradient(135deg, rgba(13,13,26,0.95) 0%, rgba(124,77,255,0.2) 50%, rgba(224,64,251,0.15) 100%)";

/* 3-up proof strip stages */
const PROOF_STAGES = [
  { label: "Prompt", time: "0 s", color: "var(--token-cyan)" },
  { label: "Script + Panels", time: "~30 s", color: "var(--token-violet)" },
  { label: "Anime Ready", time: "~60 s", color: "var(--token-gold)" },
];

export function WatchItHappen() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.4 });
  const [isPlaying, setIsPlaying] = useState(false);

  /* Autoplay on scroll-in, pause on scroll-out */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isInView) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }, [isInView]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="relative py-24 overflow-hidden"
      data-component="watch-it-happen"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] rounded-full opacity-20 blur-[120px]"
          style={{ background: "radial-gradient(circle, var(--token-violet), transparent 70%)" }}
        />
      </div>

      <div className="container relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 rounded-full border border-[var(--token-violet)]/30 bg-[var(--token-violet)]/5 text-[var(--token-violet)] text-[11px] font-semibold uppercase tracking-[0.16em] mb-4">
            Live Demo
          </span>
          <h2 className="text-h1 text-white mb-4">Watch it happen</h2>
          <p className="text-[#9494B8] text-lg max-w-lg mx-auto">
            From a single sentence to anime-ready panels in under 60 seconds.
          </p>
        </motion.div>

        {/* Video player */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(124,77,255,0.15)]"
        >
          {/* Video element — placeholder until real screencap is recorded */}
          <div
            className="relative aspect-video bg-[#0D0D1A] flex items-center justify-center"
            style={{ background: POSTER_GRADIENT }}
          >
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              loop
              playsInline
              preload="none"
              poster=""
            >
              {/* Sources will be added when real demo video is recorded */}
              {/* <source src="/demo.webm" type="video/webm" /> */}
              {/* <source src="/demo.mp4" type="video/mp4" /> */}
            </video>

            {/* Placeholder overlay — shown until real video is available */}
            <div className="relative z-10 text-center px-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full border-2 border-[var(--token-cyan)]/40 bg-[var(--token-cyan)]/10 flex items-center justify-center backdrop-blur-sm">
                <Play size={32} className="text-[var(--token-cyan)] ml-1" />
              </div>
              <p className="text-white/60 text-sm font-medium">
                Demo video coming soon — record a 60s screencap of the creation pipeline
              </p>
            </div>
          </div>

          {/* Play/Pause toggle */}
          <button
            onClick={togglePlay}
            className="absolute bottom-4 right-4 z-20 w-10 h-10 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>
        </motion.div>

        {/* 3-up proof strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex items-center justify-center gap-4 md:gap-8 mt-10"
        >
          {PROOF_STAGES.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-4 md:gap-8">
              <div className="text-center">
                <div
                  className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-3 rounded-xl border-2 flex items-center justify-center"
                  style={{
                    borderColor: `color-mix(in oklch, ${stage.color}, transparent 60%)`,
                    background: `color-mix(in oklch, ${stage.color}, transparent 92%)`,
                  }}
                >
                  <Clock size={20} style={{ color: stage.color }} />
                </div>
                <p className="text-white text-sm font-semibold">{stage.label}</p>
                <span
                  className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold"
                  style={{
                    color: stage.color,
                    background: `color-mix(in oklch, ${stage.color}, transparent 88%)`,
                  }}
                >
                  {stage.time}
                </span>
              </div>
              {/* Arrow connector (except after last) */}
              {i < PROOF_STAGES.length - 1 && (
                <ArrowRight size={20} className="text-white/20 shrink-0" />
              )}
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="text-center mt-10"
        >
          <Link
            href={`/create/input?prompt=${ENCODED_PROMPT}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[var(--token-violet)] to-[var(--token-cyan)] text-white font-semibold text-sm hover:shadow-[0_0_30px_rgba(124,77,255,0.4)] transition-shadow"
          >
            Try the demo prompt
            <ArrowRight size={16} />
          </Link>
          <p className="text-[#6B6B8A] text-xs mt-3">
            &ldquo;{DEMO_PROMPT}&rdquo;
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default WatchItHappen;
