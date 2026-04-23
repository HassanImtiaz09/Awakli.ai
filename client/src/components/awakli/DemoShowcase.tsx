import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, PenLine, Layers, Palette, Clapperboard, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

// ─── Bandwidth Detection Hook ───────────────────────────────────────────────

function useIsSlowConnection(): boolean {
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (conn) {
      const check = () => {
        // saveData flag or effective type 2g/slow-2g/3g
        setIsSlow(
          conn.saveData === true ||
          ["slow-2g", "2g", "3g"].includes(conn.effectiveType)
        );
      };
      check();
      conn.addEventListener?.("change", check);
      return () => conn.removeEventListener?.("change", check);
    }
  }, []);
  return isSlow;
}

// ─── Fallback static slides (used when no video or platform_config panels exist) ──

const STATIC_SLIDES = [
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-1-prompt-fnvbYHwNSTavV5tPQhvpHX.webp",
    caption: "Describe your story idea in a simple prompt",
    label: "Write",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-2-panels-bx3sj59aGdoDpjz4rgNNqY.webp",
    caption: "AI generates stunning manga panels in seconds",
    label: "Generate",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/beat5-anime-result-iL44imGnqqkTNjeLVbBgnC.webp",
    caption: "Watch manga transform into full anime — same characters, same scenes",
    label: "Transform",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/beat6-ws-dashboard-WhHV4ovRF9zbYJKjLp6Ve9.webp",
    caption: "Track every frame in real time with the live generation dashboard",
    label: "Track",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/beat7-lora-detail-FymtiH3tSnHM6XDzhb2jo4.webp",
    caption: "Browse the LoRA marketplace — fork models and save 75% on training",
    label: "Marketplace",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-5-anime-TJqsKZtSuiuHsADcGiRCK4.webp",
    caption: "Your story becomes anime — ready to share",
    label: "Watch",
  },
];

const STEP_ICONS = [PenLine, Sparkles, Clapperboard, Layers, Palette, Play];
const AUTO_ADVANCE_MS = 5000;

// ─── Video Player Component ──────────────────────────────────────────────

function DemoVideoPlayer({
  streamId,
  embedUrl,
  posterUrl,
}: {
  streamId: string;
  embedUrl?: string | null;
  posterUrl?: string | null;
}) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Use the embed URL from platform config if available, otherwise construct from streamId
  // Cloudflare Stream iframe embed format:
  //   https://customer-<subdomain>.cloudflarestream.com/<uid>/iframe
  // Or the generic format:
  //   https://iframe.cloudflarestream.com/<uid>
  const iframeSrc = useMemo(() => {
    if (embedUrl) {
      // Append autoplay/loop/muted params
      const sep = embedUrl.includes("?") ? "&" : "?";
      return `${embedUrl}${sep}autoplay=1&loop=1&muted=1&preload=auto`;
    }
    // Fallback: use the generic Cloudflare Stream iframe URL
    return `https://iframe.cloudflarestream.com/${streamId}?autoplay=1&loop=1&muted=1&preload=auto`;
  }, [streamId, embedUrl]);

  if (!isPlaying) {
    return (
      <div
        className="relative aspect-video bg-[#0A0A14] cursor-pointer group"
        onClick={() => setIsPlaying(true)}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt="Demo video poster"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-[#0A0A14]">
      <iframe
        src={iframeSrc}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title="Awakli Demo"
        style={{ border: "none" }}
      />
    </div>
  );
}

// ─── Slideshow Component ─────────────────────────────────────────────────

function DemoSlideshow({ slides }: { slides: typeof STATIC_SLIDES }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (isPaused) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, slides.length]);

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    setIsPaused(false);
  }, []);

  const goNext = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);
  const goPrev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [current, goTo, slides.length]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
  }, [goNext, goPrev]);

  return (
    <>
      <div
        className="relative aspect-video bg-[#0A0A14]"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            <img
              src={slides[current].image}
              alt={slides[current].caption}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 md:p-8">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-white text-lg md:text-xl font-medium"
              >
                {slides[current].caption}
              </motion.p>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation arrows */}
        <button
          onClick={goPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all md:opacity-60 hover:opacity-100"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={goNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all md:opacity-60 hover:opacity-100"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#E040FB] to-[#7C4DFF]"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: AUTO_ADVANCE_MS / 1000, ease: "linear" }}
            key={`progress-${current}-${isPaused}`}
            style={isPaused ? { animationPlayState: "paused" } : {}}
          />
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-6">
        {slides.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goTo(idx)}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              idx === current
                ? "bg-[#7C4DFF] w-8"
                : "bg-white/20 hover:bg-white/40 w-2.5"
            }`}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>

      {/* Step indicator row */}
      <StepIndicators current={current} slides={slides} onGoTo={goTo} />
    </>
  );
}

// ─── Step Indicators ─────────────────────────────────────────────────────

function StepIndicators({ current, slides, onGoTo }: {
  current: number;
  slides: typeof STATIC_SLIDES;
  onGoTo: (idx: number) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="mt-12 md:mt-16"
    >
      <div className="flex items-center justify-center overflow-x-auto pb-2 scrollbar-hide">
        <div className="flex items-center gap-0 min-w-max">
          {slides.map((slide, idx) => {
            const Icon = STEP_ICONS[idx];
            const isActive = idx === current;
            const isCompleted = idx < current;
            return (
              <div key={idx} className="flex items-center">
                <button
                  onClick={() => onGoTo(idx)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "bg-[#7C4DFF]/15 text-[#E040FB] border border-[#7C4DFF]/30"
                      : isCompleted
                      ? "text-[#00D4AA] opacity-80"
                      : "text-white/30"
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium whitespace-nowrap">{slide.label}</span>
                </button>
                {idx < slides.length - 1 && (
                  <div className={`w-8 md:w-12 h-px mx-1 transition-colors duration-300 ${
                    idx < current ? "bg-[#00D4AA]/40" : "bg-white/10"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main DemoShowcase ───────────────────────────────────────────────────

export default function DemoShowcase() {
  const [, navigate] = useLocation();
  const isSlow = useIsSlowConnection();

  // Try to load demo config from platform_config (public endpoint)
  const { data: demoConfig } = trpc.discover.getDemoVideo.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  // Skip video on slow connections — fall back to slideshow
  const hasVideo = !!demoConfig?.streamId && !isSlow;
  const slides = useMemo(() => STATIC_SLIDES, []);

  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-[#7C4DFF]/5 blur-[200px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-[#6C63FF]/5 blur-[150px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4">
        {/* Section header */}
        <div className="text-center mb-12 md:mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4"
            style={{ fontFamily: "'Orbitron', sans-serif" }}
          >
            See It In Action
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg md:text-xl text-white/50 max-w-xl mx-auto"
          >
            From a text prompt to anime in minutes
          </motion.p>
        </div>

        {/* Main content container */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{
            boxShadow: "0 0 80px rgba(124,77,255, 0.08), 0 0 40px rgba(108, 99, 255, 0.06)",
          }}
        >
          {/* Glow border effect */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              background: "linear-gradient(135deg, rgba(124,77,255,0.15) 0%, transparent 50%, rgba(108,99,255,0.15) 100%)",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              padding: "1px",
            }}
          />

          {/* Video player or slideshow */}
          {hasVideo ? (
            <DemoVideoPlayer
              streamId={demoConfig!.streamId!}
              embedUrl={demoConfig?.embedUrl}
              posterUrl={demoConfig?.posterUrl}
            />
          ) : (
            <DemoSlideshow slides={slides} />
          )}
        </motion.div>

        {/* Step indicators for video mode (static, no interaction) */}
        {hasVideo && (
          <StepIndicators current={-1} slides={slides} onGoTo={() => {}} />
        )}

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center mt-12 md:mt-16"
        >
          <p className="text-white/50 text-lg mb-6">Ready to create your own?</p>
          <button
            onClick={() => navigate("/create")}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#E040FB] to-[#7C4DFF] text-white font-semibold text-lg shadow-lg shadow-[#7C4DFF]/25 hover:shadow-[#7C4DFF]/40 hover:scale-105 transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" />
            Start Creating — Free
          </button>
        </motion.div>
      </div>
    </section>
  );
}
