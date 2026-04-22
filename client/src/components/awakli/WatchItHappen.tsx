import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, ArrowRight } from "lucide-react";
import { Link } from "wouter";

/* ═══════════════════════════════════════════════════════════════════════
   "See It In Action" — Demo Video Section
   Autoplays muted on scroll-in, pauses on scroll-out.
   User can unmute and toggle play/pause.
   ═══════════════════════════════════════════════════════════════════════ */

const DEMO_VIDEO_URL = "/manus-storage/awakli-demo-homepage-16x9_dee0ca87.mp4";

export function WatchItHappen() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.35 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  /* Autoplay muted on scroll-in, pause on scroll-out */
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

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  return (
    <section
      ref={sectionRef}
      className="relative py-20 md:py-28 overflow-hidden"
      data-component="demo-video"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full opacity-15 blur-[140px]"
          style={{ background: "radial-gradient(circle, #7C4DFF, transparent 70%)" }}
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
          <span className="inline-block px-4 py-1.5 rounded-full border border-[#E040FB]/30 bg-[#E040FB]/5 text-[#E040FB] text-[11px] font-semibold uppercase tracking-[0.16em] mb-4">
            See It In Action
          </span>
          <h2 className="text-h1 text-white mb-4">From words to anime in minutes</h2>
          <p className="text-[#9494B8] text-lg max-w-xl mx-auto">
            Watch the entire pipeline — from typing a sentence to a fully animated anime scene.
          </p>
        </motion.div>

        {/* Video player */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden border border-white/10"
          style={{
            boxShadow: "0 0 80px rgba(124,77,255,0.15), 0 30px 60px -20px rgba(0,0,0,0.6)",
          }}
        >
          <div className="relative aspect-video bg-[#0D0D1A]">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              muted
              loop
              playsInline
              preload="metadata"
              src={DEMO_VIDEO_URL}
            />

            {/* Click overlay to toggle play */}
            <button
              onClick={togglePlay}
              className="absolute inset-0 z-10 cursor-pointer bg-transparent"
              aria-label={isPlaying ? "Pause video" : "Play video"}
            >
              {/* Large center play button — only visible when paused */}
              {!isPlaying && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px] transition-opacity">
                  <div className="w-20 h-20 rounded-full border-2 border-[#E040FB]/50 bg-[#E040FB]/15 flex items-center justify-center backdrop-blur-sm">
                    <Play size={32} className="text-white ml-1" />
                  </div>
                </div>
              )}
            </button>

            {/* Bottom controls bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/70 to-transparent">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
              </button>
              <button
                onClick={toggleMute}
                className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>
        </motion.div>

        {/* CTA below video */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="text-center mt-10"
        >
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-opening-sequence text-white font-semibold text-sm hover:shadow-[0_0_30px_rgba(224,64,251,0.4)] transition-shadow"
          >
            Start Creating
            <ArrowRight size={16} />
          </Link>
          <p className="text-[#6B6B8A] text-xs mt-3">
            No credit card required &middot; Free tier available
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default WatchItHappen;
