import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Play, Star, ChevronRight, ChevronLeft, Sparkles, Zap, Palette,
  Film, Users, TrendingUp, Clock, ArrowRight, BookOpen, Eye,
  Wand2, Layers, Mic, Shield, Crown, Check, PenTool, Heart,
  Vote, Clapperboard, Brain, ImageIcon
} from "lucide-react";
import { MarketingLayout } from "@/components/awakli/Layouts";

// CDN URLs
const HERO_IMAGES = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-anime-1-XN9AD8awyDsfJqHWbpYC62.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-anime-2-QdURdQe7Jt7HAmkqTwkZPR.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-anime-3-hNUTRdmkipoQoDb6xCjikH.webp",
];
const MANGA_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/showcase-manga-panel-2MQngyo53ERNqBY8jmTBxR.webp";
const ANIME_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/showcase-anime-result-bEJ68nzw6DFXDMX3bEHsFD.webp";

// ─── Scroll Reveal ─────────────────────────────────────────────────────────
function ScrollReveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Counter Animation ─────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ─── Cycling Word ──────────────────────────────────────────────────────────
const CYCLING_WORDS = ["Ideas", "Stories", "Dreams", "Worlds"];

function CyclingWord() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((p) => (p + 1) % CYCLING_WORDS.length), 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="relative inline-block w-[4.5em] text-left align-bottom overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span
          key={CYCLING_WORDS[index]}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="inline-block text-transparent bg-clip-text bg-gradient-to-r from-[#E94560] to-[#FF6B81]"
        >
          {CYCLING_WORDS[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// ─── Inline Prompt Input ───────────────────────────────────────────────────
function InlinePromptInput({ size = "lg" }: { size?: "lg" | "md" }) {
  const [prompt, setPrompt] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleCreate = useCallback(() => {
    if (!prompt.trim()) {
      navigate("/create");
      return;
    }
    // Encode prompt as URL param so /create can pre-fill
    navigate(`/create?prompt=${encodeURIComponent(prompt.trim())}`);
  }, [prompt, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  const isLg = size === "lg";

  return (
    <div className={`flex w-full max-w-2xl mx-auto ${isLg ? "gap-3" : "gap-2"}`}>
      <div className="flex-1 relative group">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="A cyberpunk detective who solves crimes using dreams..."
          className={`w-full bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:border-[#E94560]/50 focus:ring-1 focus:ring-[#E94560]/30 transition-all ${
            isLg ? "px-5 py-4 text-base" : "px-4 py-3 text-sm"
          }`}
        />
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#E94560]/5 to-[#00D4FF]/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
      </div>
      <motion.button
        onClick={handleCreate}
        whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(233,69,96,0.4)" }}
        whileTap={{ scale: 0.97 }}
        className={`flex-shrink-0 bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold rounded-xl shadow-lg shadow-[#E94560]/25 flex items-center gap-2 ${
          isLg ? "px-8 py-4 text-base" : "px-6 py-3 text-sm"
        }`}
      >
        <Wand2 className={isLg ? "w-5 h-5" : "w-4 h-4"} />
        Create
      </motion.button>
    </div>
  );
}

// ─── 1. Hero Section ──────────────────────────────────────────────────────
function HeroSection() {
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setBgIndex((p) => (p + 1) % HERO_IMAGES.length), 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative w-full min-h-[100vh] flex items-center overflow-hidden">
      {/* Ken Burns background */}
      <AnimatePresence mode="sync">
        <motion.div
          key={bgIndex}
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.5 }, scale: { duration: 12, ease: "linear" } }}
          className="absolute inset-0"
        >
          <img
            src={HERO_IMAGES[bgIndex]}
            alt=""
            className="w-full h-full object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {/* Heavy overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F]/80 via-[#08080F]/70 to-[#08080F]/95" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080F]/60 to-transparent" />

      {/* Content */}
      <div className="container relative z-10 py-32 md:py-0">
        <div className="max-w-3xl mx-auto text-center">
          {/* Beta badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/5 text-[#00D4FF] text-sm font-medium mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-[#00D4FF] animate-pulse" />
            Now in Public Beta
          </motion.div>

          {/* Headline with cycling word */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-bold text-white leading-[1.1] mb-6"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}
          >
            Turn Your <CyclingWord />
            <br />
            Into Anime.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7 }}
            className="text-gray-400 text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
          >
            Write a story. AI creates the manga. The community votes on what becomes anime. No artistic skill needed.
          </motion.p>

          {/* Inline prompt input */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.7 }}
          >
            <InlinePromptInput size="lg" />
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.8 }}
            className="mt-10 flex items-center justify-center gap-6 text-sm text-gray-500"
          >
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#E94560]" />
              <span className="text-white font-semibold"><AnimatedCounter target={12000} suffix="+" /></span> manga created
            </span>
            <span className="w-px h-4 bg-white/10" />
            <span className="flex items-center gap-1.5">
              <Film className="w-4 h-4 text-[#00D4FF]" />
              <span className="text-white font-semibold"><AnimatedCounter target={500} suffix="+" /></span> anime voted
            </span>
            <span className="w-px h-4 bg-white/10 hidden sm:block" />
            <span className="items-center gap-1.5 hidden sm:flex">
              <Users className="w-4 h-4 text-[#FFB800]" />
              <span className="text-white font-semibold"><AnimatedCounter target={8000} suffix="+" /></span> creators
            </span>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-gray-500 uppercase tracking-widest">Scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5"
        >
          <div className="w-1 h-2 rounded-full bg-white/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ─── 2. Showcase Gallery ──────────────────────────────────────────────────
function ShowcaseGallery() {
  const showcase = trpc.discover.featured.useQuery();
  const items = showcase.data ?? [];

  // Create a masonry-like grid with placeholder items
  const galleryItems = items.length > 0 ? items.slice(0, 8) : [
    { id: 1, title: "Neon Samurai Chronicles", creator: "AkiraFan", votes: 2340, img: HERO_IMAGES[0], tall: true },
    { id: 2, title: "Dreamwalker Academy", creator: "MangaQueen", votes: 1890, img: HERO_IMAGES[1], tall: false },
    { id: 3, title: "Celestial Blade", creator: "StarWriter", votes: 3120, img: HERO_IMAGES[2], tall: false },
    { id: 4, title: "Cyber Ronin", creator: "NeoTokyo", votes: 1560, img: MANGA_IMG, tall: true },
    { id: 5, title: "Spirit Hunters", creator: "YokaiLord", votes: 2780, img: ANIME_IMG, tall: false },
    { id: 6, title: "Quantum Hearts", creator: "SciFiDreamer", votes: 1920, img: HERO_IMAGES[0], tall: true },
  ];

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F] via-[#0D0D1A] to-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
              Created by People Like You
            </h2>
            <p className="text-gray-400 text-lg max-w-lg mx-auto">
              Real manga and anime made by creators on Awakli. No artistic skill required.
            </p>
          </div>
        </ScrollReveal>

        {/* Masonry grid */}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
          {galleryItems.map((item: any, i: number) => (
            <ScrollReveal key={item.id ?? i} delay={i * 0.08}>
              <div className="break-inside-avoid group relative rounded-xl overflow-hidden border border-white/5 cursor-pointer">
                <img
                  src={item.coverImageUrl || item.img || HERO_IMAGES[i % 3]}
                  alt={item.title}
                  className={`w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                    item.tall || i % 3 === 0 ? "h-[320px] md:h-[400px]" : "h-[200px] md:h-[280px]"
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold text-sm truncate">{item.title}</h3>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-400 text-xs">by {item.userName || item.creator || "Creator"}</span>
                      <span className="flex items-center gap-1 text-[#E94560] text-xs font-medium">
                        <Heart className="w-3 h-3 fill-current" />
                        {(item.voteScore || item.votes || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 3. How It Works (4 Steps) ────────────────────────────────────────────
const STEPS = [
  {
    num: "01",
    title: "Write",
    desc: "Describe your story in plain text. A sentence is enough to get started.",
    icon: PenTool,
    color: "#E94560",
    visual: "prompt",
  },
  {
    num: "02",
    title: "Generate",
    desc: "AI writes the script, designs characters, and draws every panel automatically.",
    icon: Wand2,
    color: "#9B59B6",
    visual: "panels",
  },
  {
    num: "03",
    title: "Share & Vote",
    desc: "Publish your manga. The community reads, votes, and decides what deserves anime.",
    icon: Heart,
    color: "#00D4FF",
    visual: "votes",
  },
  {
    num: "04",
    title: "Animate",
    desc: "Top-voted manga become anime. Voice acting, music, animation \u2014 all AI-powered.",
    icon: Film,
    color: "#FFB800",
    visual: "anime",
  },
];

function HowItWorks() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#08080F]" />

      {/* Subtle radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-[#E94560]/5 rounded-full blur-[150px]" />

      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
              From Idea to Anime in Four Steps
            </h2>
            <p className="text-gray-400 text-lg max-w-lg mx-auto">
              The simplest path from your imagination to a published anime series.
            </p>
          </div>
        </ScrollReveal>

        {/* Steps grid */}
        <div className="grid md:grid-cols-4 gap-6 md:gap-4 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-[60px] left-[12.5%] right-[12.5%] h-px">
            <div className="w-full h-full border-t-2 border-dashed border-white/10" />
            <motion.div
              initial={{ width: "0%" }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
              className="absolute top-0 left-0 h-full border-t-2 border-dashed border-[#E94560]/40"
            />
          </div>

          {STEPS.map((step, i) => (
            <ScrollReveal key={step.num} delay={i * 0.15}>
              <div className="relative group">
                {/* Step number circle */}
                <div className="flex justify-center mb-6">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    className="w-[72px] h-[72px] rounded-2xl flex items-center justify-center relative z-10"
                    style={{ backgroundColor: `${step.color}15`, border: `1px solid ${step.color}30` }}
                  >
                    <step.icon className="w-7 h-7" style={{ color: step.color }} />
                  </motion.div>
                </div>

                {/* Content */}
                <div className="text-center">
                  <div className="text-xs font-mono tracking-widest mb-2" style={{ color: step.color }}>
                    STEP {step.num}
                  </div>
                  <h3 className="text-xl font-heading font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed max-w-[240px] mx-auto">{step.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 4. Live Creation Demo ────────────────────────────────────────────────
function CreationDemo() {
  const [phase, setPhase] = useState<"idle" | "prompt" | "script" | "panels" | "done">("idle");
  const [scriptLines, setScriptLines] = useState<string[]>([]);
  const [panelCount, setPanelCount] = useState(0);

  const DEMO_PROMPT = "A cyberpunk detective who solves crimes by entering people's dreams...";
  const DEMO_SCRIPT = [
    "SCENE 1 - EXT. NEO-TOKYO SKYLINE - NIGHT",
    "Rain cascades down neon-lit towers. A lone figure stands on a rooftop.",
    "",
    "DETECTIVE YUKI (V.O.)",
    "\"In this city, everyone has secrets. Mine is that I can see them.\"",
    "",
    "SCENE 2 - INT. DREAM CLINIC - NIGHT",
    "Yuki connects neural cables to a sleeping suspect.",
    "",
    "YUKI: \"Show me what you're hiding.\"",
  ];

  const startDemo = useCallback(() => {
    setPhase("prompt");
    setScriptLines([]);
    setPanelCount(0);

    // Phase 1: prompt appears (1s)
    setTimeout(() => {
      setPhase("script");
      // Phase 2: script streams in
      DEMO_SCRIPT.forEach((line, i) => {
        setTimeout(() => {
          setScriptLines((prev) => [...prev, line]);
        }, i * 400);
      });

      // Phase 3: panels generate
      setTimeout(() => {
        setPhase("panels");
        [1, 2, 3, 4].forEach((n, i) => {
          setTimeout(() => setPanelCount(n), i * 800);
        });

        // Phase 4: done
        setTimeout(() => setPhase("done"), 4000);
      }, DEMO_SCRIPT.length * 400 + 500);
    }, 1500);
  }, []);

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0D0D1A] to-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
              See It In Action
            </h2>
            <p className="text-gray-400 text-lg max-w-lg mx-auto">
              Watch how a simple idea becomes a full manga in seconds.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="max-w-4xl mx-auto">
            {/* Demo window */}
            <div className="rounded-2xl border border-white/10 bg-[#0D0D1A] overflow-hidden shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#151528]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#E94560]/60" />
                  <div className="w-3 h-3 rounded-full bg-[#FFB800]/60" />
                  <div className="w-3 h-3 rounded-full bg-[#2ECC71]/60" />
                </div>
                <span className="text-xs text-gray-500 font-mono ml-2">awakli.com/create</span>
              </div>

              <div className="p-6 md:p-8 min-h-[400px]">
                {phase === "idle" && (
                  <div className="flex flex-col items-center justify-center h-[360px] text-center">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="w-20 h-20 rounded-2xl bg-[#E94560]/10 border border-[#E94560]/20 flex items-center justify-center mb-6"
                    >
                      <Play className="w-8 h-8 text-[#E94560] ml-1" />
                    </motion.div>
                    <h3 className="text-xl font-heading font-bold text-white mb-2">Click to watch the magic</h3>
                    <p className="text-gray-500 text-sm mb-6">See how AI turns a prompt into a full manga</p>
                    <motion.button
                      onClick={startDemo}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold shadow-lg shadow-[#E94560]/25"
                    >
                      Generate Demo
                    </motion.button>
                  </div>
                )}

                {phase !== "idle" && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* Left: prompt + script */}
                    <div>
                      {/* Prompt */}
                      <div className="mb-4">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Your Prompt</div>
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white">
                          {phase === "prompt" ? (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="text-[#E94560]"
                            >
                              {DEMO_PROMPT}
                            </motion.span>
                          ) : (
                            <span className="text-gray-400">{DEMO_PROMPT}</span>
                          )}
                        </div>
                      </div>

                      {/* Script */}
                      <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                          Script
                          {(phase === "script" || phase === "panels") && (
                            <span className="inline-block w-2 h-2 rounded-full bg-[#2ECC71] animate-pulse" />
                          )}
                        </div>
                        <div className="p-3 rounded-lg bg-black/30 border border-white/5 font-mono text-xs text-gray-400 h-[200px] overflow-y-auto">
                          {scriptLines.map((line, i) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={line.startsWith("SCENE") ? "text-[#00D4FF] font-bold mt-2" : line.startsWith("\"") || line.includes("\"") ? "text-[#FFB800] italic" : ""}
                            >
                              {line || "\u00A0"}
                            </motion.div>
                          ))}
                          {(phase === "script" || phase === "panels") && scriptLines.length < DEMO_SCRIPT.length && (
                            <span className="inline-block w-2 h-4 bg-[#E94560] animate-pulse" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: panels */}
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        Manga Panels
                        {phase === "panels" && (
                          <span className="text-[#E94560]">Generating...</span>
                        )}
                        {phase === "done" && (
                          <span className="text-[#2ECC71]">Complete!</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="aspect-[3/4] rounded-lg overflow-hidden border border-white/5"
                          >
                            {i < panelCount ? (
                              <motion.img
                                initial={{ opacity: 0, scale: 1.1 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5 }}
                                src={HERO_IMAGES[i % 3]}
                                alt={`Panel ${i + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                {(phase === "panels" || phase === "script") && i === panelCount ? (
                                  <div className="w-6 h-6 border-2 border-[#E94560] border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <ImageIcon className="w-6 h-6 text-white/10" />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {phase === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 text-center"
                  >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#2ECC71]/10 border border-[#2ECC71]/20 text-[#2ECC71] text-sm font-medium mb-4">
                      <Check className="w-4 h-4" />
                      Manga generated successfully!
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* CTA below demo */}
            <div className="text-center mt-8">
              <Link href="/create">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold shadow-lg shadow-[#E94560]/25"
                >
                  Try It Yourself — Free <ArrowRight className="inline-block ml-2 w-4 h-4" />
                </motion.button>
              </Link>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─── 5. Two Audiences ─────────────────────────────────────────────────────
function TwoAudiences() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="container relative z-10">
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Readers & Fans */}
          <ScrollReveal delay={0}>
            <div className="relative group rounded-2xl border border-white/5 bg-gradient-to-br from-[#0D0D1A] to-[#151528] p-8 md:p-10 h-full overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#00D4FF]/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-xl bg-[#00D4FF]/10 border border-[#00D4FF]/20 flex items-center justify-center mb-6">
                  <Eye className="w-7 h-7 text-[#00D4FF]" />
                </div>
                <div className="text-xs font-mono tracking-widest text-[#00D4FF] mb-3 uppercase">For Readers & Fans</div>
                <h3 className="text-2xl font-heading font-bold text-white mb-4">Discover & Vote</h3>
                <p className="text-gray-400 leading-relaxed mb-8">
                  Discover AI-generated manga from creators worldwide. Vote for the stories you want to see become anime. Your votes directly decide what gets animated.
                </p>
                <Link href="/discover">
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className="px-6 py-3 rounded-xl border border-[#00D4FF]/30 text-[#00D4FF] font-semibold hover:bg-[#00D4FF]/5 transition-colors"
                  >
                    Explore Manga <ArrowRight className="inline-block ml-2 w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </div>
          </ScrollReveal>

          {/* Creators */}
          <ScrollReveal delay={0.15}>
            <div className="relative group rounded-2xl border border-[#E94560]/10 bg-gradient-to-br from-[#0D0D1A] to-[#1A0A2E]/50 p-8 md:p-10 h-full overflow-hidden">
              <div className="absolute top-0 right-0 w-48 h-48 bg-[#E94560]/5 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-xl bg-[#E94560]/10 border border-[#E94560]/20 flex items-center justify-center mb-6">
                  <Wand2 className="w-7 h-7 text-[#E94560]" />
                </div>
                <div className="text-xs font-mono tracking-widest text-[#E94560] mb-3 uppercase">For Creators</div>
                <h3 className="text-2xl font-heading font-bold text-white mb-4">Create & Animate</h3>
                <p className="text-gray-400 leading-relaxed mb-8">
                  Generate unlimited manga from your ideas. Build an audience. Earn anime conversions through votes. Or go Pro for direct anime pipeline access.
                </p>
                <Link href="/create">
                  <motion.button
                    whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(233,69,96,0.3)" }}
                    whileTap={{ scale: 0.97 }}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold shadow-lg shadow-[#E94560]/25"
                  >
                    Start Creating <ArrowRight className="inline-block ml-2 w-4 h-4" />
                  </motion.button>
                </Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

// ─── 6. Feature Grid (AI-Powered) ─────────────────────────────────────────
const FEATURES = [
  { name: "Claude Opus 4", desc: "Writes screenplays and scripts from your ideas", icon: Brain, color: "#9B59B6" },
  { name: "FLUX 1.1 Pro", desc: "Generates stunning manga panels in any style", icon: ImageIcon, color: "#E94560" },
  { name: "Kling 2.1", desc: "Transforms still panels into animated video", icon: Film, color: "#00D4FF" },
  { name: "ElevenLabs", desc: "Gives your characters unique voices", icon: Mic, color: "#FFB800" },
  { name: "Community", desc: "Votes decide which stories deserve anime", icon: Users, color: "#2ECC71" },
  { name: "Awakli Pipeline", desc: "Orchestrates everything into polished anime episodes", icon: Layers, color: "#E94560" },
];

function FeatureGrid() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F] to-[#0D0D1A]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
              Powered by the Best AI
            </h2>
            <p className="text-gray-400 text-lg max-w-lg mx-auto">
              State-of-the-art models working together to bring your stories to life.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {FEATURES.map((feat, i) => (
            <ScrollReveal key={feat.name} delay={i * 0.08}>
              <div className="group p-6 rounded-xl border border-white/5 bg-[#0D0D1A] hover:border-white/10 transition-all relative overflow-hidden">
                <div
                  className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ backgroundColor: `${feat.color}10` }}
                />
                <div className="relative z-10">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ backgroundColor: `${feat.color}15`, border: `1px solid ${feat.color}25` }}
                  >
                    <feat.icon className="w-6 h-6" style={{ color: feat.color }} />
                  </div>
                  <h3 className="font-heading font-bold text-white mb-1">{feat.name}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 7. Pricing Preview ───────────────────────────────────────────────────
const TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Create manga from your ideas. Publish and earn votes.",
    features: ["100 credits/month", "AI script generation", "Manga panel creation", "Publish to community", "Earn votes for anime"],
    cta: "Start Free",
    href: "/create",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    desc: "More power, direct anime access, no limits.",
    features: ["2,000 credits/month", "Priority generation", "Direct anime pipeline", "Custom art styles", "HD panel export", "Creator analytics"],
    cta: "Go Pro",
    href: "/pricing",
    highlighted: true,
  },
  {
    name: "Studio",
    price: "$99",
    period: "/month",
    desc: "Full pipeline control. Upload your own manga.",
    features: ["10,000 credits/month", "Upload existing manga", "LoRA model training", "Batch processing", "API access", "Priority support"],
    cta: "Get Studio",
    href: "/pricing",
    highlighted: false,
  },
];

function PricingPreview() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
              Start Free. Create Unlimited.
            </h2>
            <p className="text-gray-400 text-lg max-w-lg mx-auto">
              Every creator starts free. Upgrade when you need more power.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TIERS.map((tier, i) => (
            <ScrollReveal key={tier.name} delay={i * 0.1}>
              <div className={`relative rounded-2xl p-6 md:p-8 h-full flex flex-col ${
                tier.highlighted
                  ? "border-2 border-[#E94560]/40 bg-gradient-to-b from-[#E94560]/5 to-[#0D0D1A]"
                  : "border border-white/5 bg-[#0D0D1A]"
              }`}>
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white text-xs font-semibold">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-heading font-bold text-white mb-1">{tier.name}</h3>
                  <p className="text-gray-500 text-sm mb-4">{tier.desc}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-display font-bold text-white">{tier.price}</span>
                    <span className="text-gray-500 text-sm">{tier.period}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
                      <Check className="w-4 h-4 text-[#2ECC71] flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={tier.href}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 rounded-xl font-semibold text-sm ${
                      tier.highlighted
                        ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg shadow-[#E94560]/25"
                        : "border border-white/10 text-white hover:bg-white/5"
                    }`}
                  >
                    {tier.cta}
                  </motion.button>
                </Link>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 8. Final CTA ─────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#E94560]/8 blur-[120px]" />

      <div className="container relative z-10">
        <ScrollReveal>
          <div className="relative rounded-3xl overflow-hidden border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-r from-[#E94560]/10 via-[#9B59B6]/8 to-[#00D4FF]/10" />
            <div className="relative p-10 md:p-20 text-center">
              <h2 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
                Every Great Anime Starts
                <br />
                With an <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E94560] to-[#FF6B81]">Idea</span>
              </h2>
              <p className="text-gray-400 text-xl mb-10">Yours could be next.</p>

              <InlinePromptInput size="md" />

              <p className="text-gray-600 text-xs mt-6">
                Free to start. No credit card required. No artistic skill needed.
              </p>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─── Content Row (preserved from original) ────────────────────────────────
function ContentRow({ title, icon, projects, isLoading, seeAllLink }: {
  title: string; icon: React.ReactNode; projects: any[]; isLoading?: boolean; seeAllLink?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <ScrollReveal className="mb-12">
      <div className="flex items-center justify-between mb-5 px-1">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl md:text-2xl font-heading font-bold text-white">{title}</h2>
        </div>
        {seeAllLink && (
          <Link href={seeAllLink} className="text-sm text-gray-400 hover:text-[#E94560] transition-colors flex items-center gap-1">
            See all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-[#08080F]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-[#08080F]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[200px] md:w-[220px] snap-start">
                  <div className="aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />
                  <div className="mt-3 h-4 bg-white/5 animate-pulse rounded w-3/4" />
                  <div className="mt-2 h-3 bg-white/5 animate-pulse rounded w-1/2" />
                </div>
              ))
            : projects.map((project, i) => (
                <motion.div
                  key={project.id ?? i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="flex-shrink-0 w-[200px] md:w-[220px] snap-start group/card"
                >
                  <Link href={`/watch/${project.slug || `project-${project.id}`}`}>
                    <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/5 bg-[#0D0D1A] cursor-pointer">
                      {project.coverImageUrl ? (
                        <img src={project.coverImageUrl} alt={project.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${
                          ["from-[#E94560]/30 to-purple-500/20", "from-[#00D4FF]/30 to-blue-500/20", "from-purple-500/30 to-[#E94560]/20", "from-emerald-500/30 to-teal-500/20"][i % 4]
                        }`}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-12 h-12 text-white/20" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-[#E94560]/90 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </div>
                          <span className="text-sm text-white font-medium">Watch Now</span>
                        </div>
                      </div>
                      {project.genre && (
                        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs text-gray-300 border border-white/10">
                          {project.genre}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 px-1">
                      <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-[#E94560] transition-colors">
                        {project.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {project.animeStyle || "Anime"} {project.episodeCount ? `\u00B7 ${project.episodeCount} eps` : ""}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
          {!isLoading && projects.length === 0 && (
            <div className="flex-shrink-0 w-full py-12 text-center text-gray-500">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No projects yet. Be the first to create one!</p>
            </div>
          )}
        </div>
      </div>
    </ScrollReveal>
  );
}

// ─── Main Home Page ────────────────────────────────────────────────────────
export default function Home() {
  const featured = trpc.discover.featured.useQuery();
  const trending = trpc.discover.trending.useQuery();
  const newReleases = trpc.discover.newReleases.useQuery();

  return (
    <MarketingLayout>
      <HeroSection />

      <ShowcaseGallery />

      <HowItWorks />

      <CreationDemo />

      <TwoAudiences />

      {/* Content rows */}
      <section className="py-8">
        <div className="container">
          <ContentRow
            title="Featured"
            icon={<Star className="w-5 h-5 text-amber-400" />}
            projects={featured.data ?? []}
            isLoading={featured.isLoading}
            seeAllLink="/discover"
          />
          <ContentRow
            title="Trending Now"
            icon={<TrendingUp className="w-5 h-5 text-[#E94560]" />}
            projects={trending.data ?? []}
            isLoading={trending.isLoading}
            seeAllLink="/discover"
          />
          <ContentRow
            title="New Releases"
            icon={<Clock className="w-5 h-5 text-[#00D4FF]" />}
            projects={newReleases.data ?? []}
            isLoading={newReleases.isLoading}
            seeAllLink="/discover"
          />
        </div>
      </section>

      <FeatureGrid />

      <PricingPreview />

      <FinalCTA />
    </MarketingLayout>
  );
}
