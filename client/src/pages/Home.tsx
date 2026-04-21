import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Play, Star, ChevronRight, ChevronLeft, Sparkles, Zap,
  Film, Users, TrendingUp, Clock, ArrowRight, BookOpen, Eye,
  Wand2, Heart, PenTool, Check, ImageIcon, Crown, Swords,
  Globe, Mic, Brain
} from "lucide-react";
import { MarketingLayout } from "@/components/awakli/Layouts";

/* ─── CDN Assets ──────────────────────────────────────────────────────── */
const HERO_IMAGES = [
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-character-1-mYoMVXD46WNd6gsY6gCyep.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-character-2-ZM9cCXhV5CNxu5X5xyaD72.webp",
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/hero-character-3-K3nBEx4a2qUCSu564zqeL5.webp",
];

/* ─── Scroll Reveal ───────────────────────────────────────────────────── */
function ScrollReveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 40, scale: 0.96 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Chromatic Reveal — triggers beat animation on viewport entry ──── */
function ChromaticReveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [hasBeat, setHasBeat] = useState(false);

  useEffect(() => {
    if (isInView && !hasBeat) {
      setHasBeat(true);
      const timer = setTimeout(() => setHasBeat(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isInView, hasBeat]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      transition={{ duration: 0.6 }}
      className={`${className} ${hasBeat ? "animate-beat" : ""}`}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ACT ONE — THE HOOK
   Full-viewport hero with cinematic character art
   ═══════════════════════════════════════════════════════════════════════ */
function ActOneHero() {
  const [bgIndex, setBgIndex] = useState(0);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => setBgIndex((p) => (p + 1) % HERO_IMAGES.length), 8000);
    return () => clearInterval(timer);
  }, []);

  const handleCTA = () => {
    if (isAuthenticated) {
      navigate("/create");
    } else {
      window.location.href = getLoginUrl("/create");
    }
  };

  return (
    <section className="relative w-full min-h-[100vh] flex items-center overflow-hidden">
      {/* Ken Burns background with character art */}
      <AnimatePresence mode="sync">
        <motion.div
          key={bgIndex}
          initial={{ opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.8 }, scale: { duration: 14, ease: "linear" } }}
          className="absolute inset-0"
        >
          <img
            src={HERO_IMAGES[bgIndex]}
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
          />
        </motion.div>
      </AnimatePresence>

      {/* Cinematic overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05050C]/85 via-[#05050C]/60 to-[#05050C]/95" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#05050C]/70 to-transparent" />
      {/* Radial accent glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#6B5BFF]/12 rounded-full blur-[150px]" />

      {/* Content */}
      <div className="container relative z-10 py-32 md:py-0">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/5 text-[#00D4FF] text-sm font-medium mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-[#00D4FF] animate-pulse" />
            Now in Public Beta
          </motion.div>

          {/* Headline — §10 */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-display text-white mb-6 tracking-tighter"
          >
            <span className="block">Tonight, your idea</span>
            <span className="block">becomes <span className="text-gradient-opening drop-shadow-[0_0_40px_rgba(107,91,255,0.35)]">ANIME</span>.</span>
          </motion.h1>

          {/* Subheadline — §10 */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.7 }}
            className="text-[#9494B8] text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
          >
            Type a sentence. We will animate it. Before you go to bed.
          </motion.p>

          {/* Single CTA — §10 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.7 }}
          >
            <motion.button
              onClick={handleCTA}
              whileHover={{ scale: 1.04, boxShadow: "0 0 40px rgba(107,91,255,0.45)" }}
              whileTap={{ scale: 0.96 }}
              className="px-10 py-4 rounded-xl bg-opening-sequence text-white font-semibold text-lg shadow-lg shadow-[#6B5BFF]/35 flex items-center gap-3 mx-auto"
            >
              <PenTool className="w-5 h-5" />
              Write the first scene
            </motion.button>
          </motion.div>

          {/* Daily prompt */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.8 }}
            className="mt-10 flex items-center justify-center"
          >
            <Link href="/create?prompt=A+time-traveling+samurai+discovers+modern+Tokyo">
              <span className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-white/8 bg-white/3 cursor-pointer hover:bg-white/5 transition-colors">
                <Sparkles className="w-4 h-4 text-[#FFB800]" />
                <span className="text-sm text-[#9494B8]">
                  <span className="text-white font-medium">Daily Prompt:</span>{" "}
                  &ldquo;A time-traveling samurai discovers modern Tokyo&rdquo;
                </span>
                <ArrowRight className="w-4 h-4 text-[#5C5C7A]" />
              </span>
            </Link>
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
        <span className="text-xs text-[#5C5C7A] uppercase tracking-widest font-mono">Scroll</span>
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

/* ═══════════════════════════════════════════════════════════════════════
   ACT TWO — PROOF (Five Scroll Sections)
   ═══════════════════════════════════════════════════════════════════════ */

const PROOF_SECTIONS = [
  {
    label: "01",
    heading: "From a sentence.",
    description: "Describe your story in plain text. A single sentence is enough. AI writes the screenplay, designs the world, and draws every panel.",
    icon: PenTool,
    color: "#00F0FF",
    visual: "typewriter",
  },
  {
    label: "02",
    heading: "To a character.",
    description: "AI extracts your characters from the script, generates consistent designs, and builds a visual identity that persists across every panel and episode.",
    icon: Users,
    color: "#6B5BFF",
    visual: "character",
  },
  {
    label: "03",
    heading: "To a world.",
    description: "Six world-setting tiles materialize: cyberpunk alleys, enchanted forests, space stations. Your story gets a universe that feels lived-in.",
    icon: Globe,
    color: "#B388FF",
    visual: "world",
  },
  {
    label: "04",
    heading: "To a story voted on by thousands.",
    description: "Publish your manga. The community reads, votes, and decides which stories deserve to become anime. Your vote is a casting decision.",
    icon: Heart,
    color: "#FFD60A",
    visual: "votes",
  },
  {
    label: "05",
    heading: "To anime.",
    description: "Top-voted manga enter the animation pipeline. Voice acting, music, motion \u2014 all AI-powered. From still panels to streaming episodes.",
    icon: Film,
    color: "#FF2D7A",
    visual: "anime",
  },
];

function ProofSection({ section, index }: { section: typeof PROOF_SECTIONS[0]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <ChromaticReveal>
      <div
        ref={ref}
        className="relative py-24 md:py-32 overflow-hidden"
      >
        {/* Background accent glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[120px] opacity-20"
          style={{ backgroundColor: section.color }}
        />

        <div className="container relative z-10">
          <div className={`flex flex-col ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} items-center gap-12 md:gap-20`}>
            {/* Text side */}
            <div className="flex-1 max-w-lg">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${section.color}15`, border: `1px solid ${section.color}30` }}
                >
                  <section.icon className="w-5 h-5" style={{ color: section.color }} />
                </div>
                <span className="text-xs font-mono tracking-widest" style={{ color: section.color }}>
                  STEP {section.label}
                </span>
              </div>
              <h2 className="text-h1 text-white mb-4">{section.heading}</h2>
              <p className="text-[#9494B8] text-lg leading-relaxed">{section.description}</p>
            </div>

            {/* Visual side — parallax */}
            <motion.div className="flex-1 max-w-lg" style={{ y }}>
              <div
                className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/5"
                style={{ background: `linear-gradient(135deg, ${section.color}10, ${section.color}05)` }}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <section.icon className="w-20 h-20 opacity-20" style={{ color: section.color }} />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </ChromaticReveal>
  );
}

function ActTwoProof() {
  return (
    <section className="relative">
      <div className="absolute inset-0 bg-gradient-to-b from-[#05050C] via-[#0D0D1A] to-[#05050C]" />
      <div className="relative z-10">
        {PROOF_SECTIONS.map((section, i) => (
          <ProofSection key={section.label} section={section} index={i} />
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ACT THREE — THE INVITATION
   Creator cards + prompt box + marquee
   ═══════════════════════════════════════════════════════════════════════ */

function ActThreeInvitation() {
  const [prompt, setPrompt] = useState("");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleCreate = useCallback(() => {
    if (!prompt.trim()) {
      navigate("/create");
      return;
    }
    navigate(`/create?prompt=${encodeURIComponent(prompt.trim())}`);
  }, [prompt, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#05050C]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-[#6B5BFF]/10 blur-[150px]" />

      <div className="container relative z-10">
        {/* Heading */}
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-h1 text-white mb-4">
              This could be you{" "}
              <span className="text-gradient-opening">next Friday.</span>
            </h2>
            <p className="text-[#9494B8] text-lg max-w-lg mx-auto">
              Real creators. Real characters. Real anime. All made on Awakli.
            </p>
          </div>
        </ScrollReveal>

        {/* Creator showcase cards */}
        <ScrollReveal delay={0.2}>
          <CreatorShowcase />
        </ScrollReveal>

        {/* Inline prompt box */}
        <ScrollReveal delay={0.4}>
          <div className="max-w-3xl mx-auto mt-20">
            <div className="relative rounded-2xl overflow-hidden border border-white/5">
              <div className="absolute inset-0 bg-gradient-to-r from-[#00F0FF]/10 via-[#6B5BFF]/8 to-[#FF2D7A]/10" />
              <div className="relative p-8 md:p-12 text-center">
                <h3 className="text-h2 text-white mb-2">
                  Every great anime starts with an{" "}
                  <span className="text-gradient-opening">idea</span>
                </h3>
                <p className="text-[#5C5C7A] text-sm mb-8">Yours could be next.</p>

                <div className="flex w-full max-w-2xl mx-auto gap-3">
                  <div className="flex-1 relative group">
                    {/* Animated conic border */}
                    <div
                      className="absolute -inset-[2px] rounded-xl opacity-90 group-focus-within:opacity-100 transition-opacity"
                      style={{
                        background: "conic-gradient(from 0deg, #00F0FF, #6B5BFF, #FFD60A, #FF2D7A, #00F0FF)",
                        animation: "spin 8s linear infinite",
                        filter: "blur(0.5px)",
                      }}
                    />
                    {/* Inner input surface */}
                    <div className="relative rounded-xl bg-[#0A0A14]">
                      <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="A cyberpunk detective who solves crimes using dreams..."
                        className="w-full bg-transparent rounded-xl text-white placeholder:text-[#5C5C7A] focus:outline-none transition-all px-5 py-4 text-base relative z-10"
                      />
                      {/* Corner sigils */}
                      <svg className="absolute top-1 left-1 w-3 h-3 text-[#00F0FF] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M1 5 V1 H5" />
                      </svg>
                      <svg className="absolute top-1 right-1 w-3 h-3 text-[#00F0FF] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M7 1 H11 V5" />
                      </svg>
                      <svg className="absolute bottom-1 left-1 w-3 h-3 text-[#00F0FF] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M1 7 V11 H5" />
                      </svg>
                      <svg className="absolute bottom-1 right-1 w-3 h-3 text-[#00F0FF] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M7 11 H11 V7" />
                      </svg>
                    </div>
                  </div>
                  <motion.button
                    onClick={handleCreate}
                    whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(0,240,255,0.45)" }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-shrink-0 bg-opening-sequence text-white font-semibold rounded-xl shadow-lg shadow-[#6B5BFF]/35 flex items-center gap-2 px-8 py-4 text-base"
                  >
                    <Wand2 className="w-5 h-5" />
                    Create
                  </motion.button>
                </div>

                <p className="text-[#5C5C7A] text-xs mt-6">
                  Free to start. No credit card required. No artistic skill needed.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

/* ─── Creator Showcase Grid ───────────────────────────────────────────── */
function CreatorShowcase() {
  const featured = trpc.discover.featured.useQuery();
  const items = featured.data ?? [];
  const displayItems = items.slice(0, 6);

  if (displayItems.length === 0) {
    return (
      <div className="text-center py-16">
        <Sparkles className="w-10 h-10 text-[#6B5BFF]/60 mx-auto mb-4" />
        <p className="text-[#9494B8] text-lg mb-2">The gallery is waiting for its first stories.</p>
        <Link href="/create">
          <span className="text-[#00F0FF] hover:text-[#B388FF] transition-colors cursor-pointer font-medium text-sm">
            Be the first creator <ArrowRight className="inline w-4 h-4 ml-1" />
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
      {displayItems.map((item: any, i: number) => (
        <motion.div
          key={item.id ?? i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: i * 0.08 }}
          className="group relative rounded-xl overflow-hidden border border-white/5 cursor-pointer"
        >
          <Link href={`/watch/${item.slug || `project-${item.id}`}`}>
            <div className="relative aspect-[3/4]">
              <img
                src={item.coverImageUrl || HERO_IMAGES[i % 3]}
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              {/* Foil shimmer overlay on hover */}
              <div className="absolute inset-0 foil-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              {/* Info overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <h3 className="text-white font-semibold text-sm truncate">{item.title}</h3>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[#9494B8] text-xs">by {item.userName || "Creator"}</span>
                    <span className="flex items-center gap-1 text-[#FF2D7A] text-xs font-medium">
                      <Heart className="w-3 h-3 fill-current" />
                      {(item.voteScore || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── AI-Powered Feature Strip ────────────────────────────────────────── */
const AI_FEATURES = [
  { name: "AI Screenwriting", icon: Brain, color: "#6B5BFF" },
  { name: "Panel Generation", icon: ImageIcon, color: "#00F0FF" },
  { name: "Video Animation", icon: Film, color: "#B388FF" },
  { name: "Voice Acting", icon: Mic, color: "#FFD60A" },
  { name: "Community Voting", icon: Heart, color: "#FF2D7A" },
  { name: "Full Pipeline", icon: Zap, color: "#00E5A0" },
];

function FeatureStrip() {
  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0D0D1A] to-[#05050C]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-h2 text-white mb-3">Powered by the best AI</h2>
            <p className="text-[#9494B8] max-w-md mx-auto">
              State-of-the-art models working together to bring your stories to life.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-5xl mx-auto">
          {AI_FEATURES.map((feat, i) => (
            <ScrollReveal key={feat.name} delay={i * 0.06}>
              <div className="group p-4 rounded-xl border border-white/5 bg-[#0D0D1A] hover:border-white/10 transition-all text-center">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                  style={{ backgroundColor: `${feat.color}15`, border: `1px solid ${feat.color}25` }}
                >
                  <feat.icon className="w-5 h-5" style={{ color: feat.color }} />
                </div>
                <span className="text-xs font-medium text-[#9494B8] group-hover:text-white transition-colors">
                  {feat.name}
                </span>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Content Row (horizontal scroll) ─────────────────────────────────── */
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
          <Link href={seeAllLink} className="text-sm text-[#9494B8] hover:text-[#00F0FF] transition-colors flex items-center gap-1">
            See all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-[#05050C]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-[#05050C]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                  <div className="aspect-[3/4] rounded-xl skeleton-shimmer" />
                  <div className="mt-3 h-4 skeleton-shimmer rounded w-3/4" />
                  <div className="mt-2 h-3 skeleton-shimmer rounded w-1/2" />
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
                        <img src={project.coverImageUrl} alt={project.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${
                          ["from-[#6B5BFF]/30 to-[#B388FF]/20", "from-[#00F0FF]/30 to-blue-500/20", "from-[#B388FF]/30 to-[#6B5BFF]/20", "from-emerald-500/30 to-teal-500/20"][i % 4]
                        }`}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-12 h-12 text-white/20" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-[#6B5BFF]/90 flex items-center justify-center">
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
                      <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-[#00F0FF] transition-colors">
                        {project.title}
                      </h3>
                      <p className="text-xs text-[#5C5C7A] mt-1 truncate">
                        {project.animeStyle || "Anime"} {project.episodeCount ? `\u00B7 ${project.episodeCount} eps` : ""}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
          {!isLoading && projects.length === 0 && (
            <div className="flex-shrink-0 w-full py-12 text-center text-[#5C5C7A]">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>The director is scouting locations...</p>
            </div>
          )}
        </div>
      </div>
    </ScrollReveal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN HOME PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export default function Home() {
  const trending = trpc.discover.trending.useQuery();
  const newReleases = trpc.discover.newReleases.useQuery();

  return (
    <MarketingLayout>
      {/* ACT ONE — The Hook */}
      <ActOneHero />

      {/* ACT TWO — Proof */}
      <ActTwoProof />

      {/* Feature strip */}
      <FeatureStrip />

      {/* Content rows */}
      <section className="py-8">
        <div className="container">
          <ContentRow
            title="Trending Now"
            icon={<TrendingUp className="w-5 h-5 text-[#00F0FF]" />}
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

      {/* ACT THREE — The Invitation */}
      <ActThreeInvitation />
    </MarketingLayout>
  );
}
