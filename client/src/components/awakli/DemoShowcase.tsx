import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, PenLine, Layers, Palette, Clapperboard, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

const SLIDES = [
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
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-3-customize-PWTGJeYCJcN9UDKMQQfEuy.webp",
    caption: "Choose your art style and customize every detail",
    label: "Customize",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-4-pipeline-n5eVDS8UjQur4nvN7Ryjwp.webp",
    caption: "AI production pipeline brings your story to life",
    label: "Produce",
  },
  {
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/demo-slide-5-anime-TJqsKZtSuiuHsADcGiRCK4.webp",
    caption: "Your story becomes anime — ready to share",
    label: "Watch",
  },
];

const STEP_ICONS = [PenLine, Sparkles, Palette, Clapperboard, Play];

const AUTO_ADVANCE_MS = 5000;

export default function DemoShowcase() {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const [, navigate] = useLocation();

  // Auto-advance
  useEffect(() => {
    if (isPaused) return;
    timerRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused]);

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
    // Reset timer on manual navigation
    if (timerRef.current) clearInterval(timerRef.current);
    setIsPaused(false);
  }, []);

  const goNext = useCallback(() => goTo((current + 1) % SLIDES.length), [current, goTo]);
  const goPrev = useCallback(() => goTo((current - 1 + SLIDES.length) % SLIDES.length), [current, goTo]);

  // Touch swipe support
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
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-[#E94560]/5 blur-[200px]" />
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

        {/* Slideshow container */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl"
          style={{
            boxShadow: "0 0 80px rgba(233, 69, 96, 0.08), 0 0 40px rgba(108, 99, 255, 0.06)",
          }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Glow border effect */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              background: "linear-gradient(135deg, rgba(233,69,96,0.15) 0%, transparent 50%, rgba(108,99,255,0.15) 100%)",
              mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
              maskComposite: "exclude",
              padding: "1px",
            }}
          />

          {/* Image area with aspect ratio */}
          <div className="relative aspect-video bg-[#0A0A14]">
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
                  src={SLIDES[current].image}
                  alt={SLIDES[current].caption}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Caption overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 md:p-8">
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="text-white text-lg md:text-xl font-medium"
                  >
                    {SLIDES[current].caption}
                  </motion.p>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Navigation arrows */}
            <button
              onClick={goPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 md:opacity-60 hover:opacity-100"
              aria-label="Previous slide"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 md:opacity-60 hover:opacity-100"
              aria-label="Next slide"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-[#E94560] to-[#FF6B81]"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{
                  duration: AUTO_ADVANCE_MS / 1000,
                  ease: "linear",
                  repeat: 0,
                }}
                key={`progress-${current}-${isPaused}`}
                style={isPaused ? { animationPlayState: "paused" } : {}}
              />
            </div>
          </div>
        </motion.div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 mt-6">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                idx === current
                  ? "bg-[#E94560] w-8"
                  : "bg-white/20 hover:bg-white/40"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Step indicator row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-12 md:mt-16"
        >
          <div className="flex items-center justify-center overflow-x-auto pb-2 scrollbar-hide">
            <div className="flex items-center gap-0 min-w-max">
              {SLIDES.map((slide, idx) => {
                const Icon = STEP_ICONS[idx];
                const isActive = idx === current;
                const isCompleted = idx < current;
                return (
                  <div key={idx} className="flex items-center">
                    <button
                      onClick={() => goTo(idx)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 cursor-pointer ${
                        isActive
                          ? "bg-[#E94560]/15 text-[#E94560] border border-[#E94560]/30"
                          : isCompleted
                          ? "text-[#00D4AA] opacity-80"
                          : "text-white/30"
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium whitespace-nowrap">{slide.label}</span>
                    </button>
                    {idx < SLIDES.length - 1 && (
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
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 hover:scale-105 transition-all duration-300"
          >
            <Sparkles className="w-5 h-5" />
            Start Creating — Free
          </button>
        </motion.div>
      </div>
    </section>
  );
}
