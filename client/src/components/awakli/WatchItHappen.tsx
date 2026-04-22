import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Volume2, VolumeX, ArrowRight, Maximize } from "lucide-react";
import { Link } from "wouter";

/* ═══════════════════════════════════════════════════════════════════════
   "See It In Action" — Demo Video Section
   Features:
   - Poster start slide with play button ("See how the magic happens")
   - Full video controls: play/pause, scrubber/seek, volume slider, fullscreen
   - No autoplay — user initiates playback from the poster
   ═══════════════════════════════════════════════════════════════════════ */

const DEMO_VIDEO_URL = "/manus-storage/awakli-demo-homepage-v3-16x9_a11cfbab.mp4";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function WatchItHappen() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubberRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);

  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Time update ── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => { if (!isScrubbing) setCurrentTime(v.currentTime); };
    const onMeta = () => setDuration(v.duration);
    const onEnd = () => { setIsPlaying(false); setControlsVisible(true); };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended", onEnd);
    };
  }, [isScrubbing]);

  /* ── Auto-hide controls after 3s of inactivity ── */
  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying) { setControlsVisible(true); return; }
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [isPlaying]);

  /* ── Play / Pause ── */
  const startVideo = () => {
    const v = videoRef.current;
    if (!v) return;
    setHasStarted(true);
    v.volume = volume;
    v.muted = false;
    setIsMuted(false);
    v.play().then(() => setIsPlaying(true)).catch(() => {});
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (!hasStarted) { startVideo(); return; }
    if (v.paused) {
      v.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  /* ── Mute / Volume ── */
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  };

  const handleVolumeChange = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setVolume(pct);
    if (videoRef.current) {
      videoRef.current.volume = pct;
      videoRef.current.muted = pct === 0;
      setIsMuted(pct === 0);
    }
  };

  /* ── Scrubber / Seek ── */
  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    if (videoRef.current) videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const onScrubStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    seekTo(e);
    const onMove = (ev: MouseEvent) => {
      if (scrubberRef.current) {
        const rect = scrubberRef.current.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const newTime = pct * duration;
        if (videoRef.current) videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ── Fullscreen ── */
  const toggleFullscreen = () => {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      v.requestFullscreen?.();
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          onMouseMove={resetHideTimer}
        >
          <div className="relative aspect-video bg-[#0D0D1A]">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              preload="metadata"
              src={DEMO_VIDEO_URL}
            />

            {/* ── Poster / Start Slide ── */}
            {!hasStarted && (
              <button
                onClick={startVideo}
                className="absolute inset-0 z-30 cursor-pointer flex flex-col items-center justify-center bg-[#0D0D1A]/85 backdrop-blur-md transition-all group"
                aria-label="Play demo video"
                data-testid="poster-slide"
              >
                {/* Decorative ring */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-[#E040FB]" style={{ animationDuration: "2s" }} />
                  <div className="w-24 h-24 rounded-full border-2 border-[#E040FB]/60 bg-[#E040FB]/10 flex items-center justify-center backdrop-blur-sm group-hover:bg-[#E040FB]/25 group-hover:border-[#E040FB] group-hover:scale-110 transition-all duration-300">
                    <Play size={40} className="text-white ml-1.5" />
                  </div>
                </div>
                <p className="text-white text-xl md:text-2xl font-bold tracking-wide mb-2" style={{ fontFamily: "var(--font-display)" }}>
                  See how the magic happens
                </p>
                <p className="text-[#E040FB] text-sm tracking-[0.2em] uppercase">
                  here at Awakli
                </p>
              </button>
            )}

            {/* ── Click overlay to toggle play (after started) ── */}
            {hasStarted && (
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
            )}

            {/* ── Bottom controls bar ── */}
            {hasStarted && (
              <div
                className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ${controlsVisible ? "opacity-100" : "opacity-0"}`}
                data-testid="video-controls"
              >
                {/* Scrubber / progress bar */}
                <div
                  ref={scrubberRef}
                  className="relative w-full h-6 flex items-end cursor-pointer group px-4"
                  onMouseDown={onScrubStart}
                  data-testid="video-scrubber"
                >
                  <div className="w-full h-1 group-hover:h-1.5 bg-white/20 rounded-full transition-all relative">
                    {/* Buffered / progress fill */}
                    <div
                      className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-[#E040FB] to-[#7C4DFF]"
                      style={{ width: `${progress}%` }}
                    />
                    {/* Scrubber thumb */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(224,64,251,0.6)] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ left: `calc(${progress}% - 6px)` }}
                    />
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause */}
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                      className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                    </button>

                    {/* Volume group */}
                    <div
                      className="flex items-center gap-2"
                      onMouseEnter={() => setShowVolumeSlider(true)}
                      onMouseLeave={() => setShowVolumeSlider(false)}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                        className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>

                      {/* Volume slider */}
                      <div
                        ref={volumeRef}
                        className={`w-20 h-1.5 rounded-full bg-white/20 cursor-pointer transition-all duration-200 ${showVolumeSlider ? "opacity-100 w-20" : "opacity-0 w-0"}`}
                        onClick={(e) => { e.stopPropagation(); handleVolumeChange(e); }}
                        data-testid="volume-slider"
                      >
                        <div
                          className="h-full rounded-full bg-white/70"
                          style={{ width: `${isMuted ? 0 : volume * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Time display */}
                    <span className="text-white/60 text-xs font-mono tabular-nums">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Right controls */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                    className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-colors"
                    aria-label="Fullscreen"
                  >
                    <Maximize size={14} />
                  </button>
                </div>
              </div>
            )}
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
