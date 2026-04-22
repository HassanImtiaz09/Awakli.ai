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
import { TiltCard } from "@/components/awakli/TiltCard";
import ScrollBackground from "@/components/awakli/ScrollBackground";
import { WatchItHappen } from "@/components/awakli/WatchItHappen";
// import { StreamingTonight } from "@/components/awakli/StreamingTonight";
// import { MarqueeStrip } from "@/components/awakli/MarqueeStrip";

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
    const HERO_ROTATION_MS = 8e3;
    const timer = setInterval(() => setBgIndex((p) => (p + 1) % HERO_IMAGES.length), HERO_ROTATION_MS);
    return () => clearInterval(timer);
  }, []);

  const handleCTA = () => {
    if (isAuthenticated) {
      navigate("/create/input?projectId=new");
    } else {
      window.location.href = getLoginUrl("/create/input?projectId=new");
    }
  };

  /* Floating particle data — seeded once per mount */
  const particles = useMemo(() =>
    Array.from({ length: 35 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 6,
      duration: 12 + Math.random() * 18,
      opacity: 0.15 + Math.random() * 0.35,
    })),
  []);

  return (
    <section className="relative w-full min-h-[100vh] flex items-center overflow-hidden" data-hero-animated>
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

      {/* ── Subtle background animation layer ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden hero-anim-layer" aria-hidden="true">
        {/* Drifting gradient orbs */}
        <div
          className="absolute w-[600px] h-[600px] rounded-full blur-[180px] hero-orb-1"
          style={{
            top: "10%",
            left: "-5%",
            background: "radial-gradient(circle, rgba(224,64,251,0.12) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[160px] hero-orb-2"
          style={{
            bottom: "5%",
            right: "-8%",
            background: "radial-gradient(circle, rgba(124,77,255,0.10) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[140px] hero-orb-3"
          style={{
            top: "40%",
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(255,110,127,0.08) 0%, transparent 70%)",
          }}
        />

        {/* Floating particles */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute rounded-full hero-particle"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              opacity: p.opacity,
              background: p.id % 3 === 0 ? "#E040FB" : p.id % 3 === 1 ? "#7C4DFF" : "#FF6E7F",
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
            }}
          />
        ))}

        {/* Subtle scan-line sweep */}
        <div className="absolute inset-0 hero-scanline" />
      </div>

      {/* Radial accent glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#7C4DFF]/12 rounded-full blur-[150px]" />

      {/* Content */}
      <div className="container relative z-10 py-32 md:py-0">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#E040FB]/30 bg-[#E040FB]/5 text-[#E040FB] text-[11px] font-semibold uppercase tracking-[0.16em] mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-[#E040FB] animate-pulse" />
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
            <span className="block">becomes <span className="text-gradient-opening drop-shadow-[0_0_40px_rgba(124,77,255,0.35)]" style={{ textShadow: "0 0 60px rgba(224,64,251,0.3)" }}>ANIME</span>.</span>
          </motion.h1>

          {/* Subheadline — §10 */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.7 }}
            className="text-[#B8B8CC] text-lg md:text-xl max-w-xl mx-auto mb-10 leading-relaxed"
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
              whileHover={{ scale: 1.04, boxShadow: "0 0 40px rgba(224,64,251,0.5)" }}
              whileTap={{ scale: 0.96 }}
              className="px-10 py-4 rounded-xl bg-opening-sequence text-white font-semibold text-lg flex items-center gap-3 mx-auto relative overflow-hidden"
              style={{
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 14px 34px -10px rgba(224,64,251,0.5), 0 4px 10px rgba(0,0,0,0.4)",
              }}
            >
              {/* Shimmer sweep */}
              <span
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.18) 55%, transparent 65%)",
                  backgroundSize: "250% 100%",
                  animation: "shimmer-sweep 3s ease-in-out infinite",
                }}
              />
              <PenTool className="w-5 h-5 relative z-10" strokeWidth={1.75} />
              <span className="relative z-10">Write the first scene</span>
            </motion.button>
          </motion.div>

          {/* Second CTA — B4 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.6 }}
            className="mt-4 text-center"
          >
            <Link
              href="/discover"
              className="inline-flex items-center gap-2 text-sm text-[#9494B8] hover:text-white transition-colors"
            >
              <Eye className="w-4 h-4" strokeWidth={1.5} />
              Watch what the community made
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </Link>
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
                <Sparkles className="w-4 h-4 text-[#FFD60A]" strokeWidth={1.5} />
                <span className="text-sm text-[#9494B8]">
                  <span className="text-white font-medium">Daily Prompt:</span>{" "}
                  &ldquo;A time-traveling samurai discovers modern Tokyo&rdquo;
                </span>
                <ArrowRight className="w-4 h-4 text-[#5C5C7A]" strokeWidth={1.5} />
              </span>
            </Link>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator removed per UI improvement brief */}
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
    color: "#E040FB",
    visual: "typewriter",
    iconImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step01-icon-ZhgJFNjN2NbN3yYVHa8mGM.webp",
    panelImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step01-panel-6JkYCd3cPfjfaqNUyWmLHw.webp",
    bgImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step01-bg-TGS4eiwe2EZxR5WSTNFos2.webp",
  },
  {
    label: "02",
    heading: "To a character.",
    description: "AI extracts your characters from the script, generates consistent designs, and builds a visual identity that persists across every panel and episode.",
    icon: Users,
    color: "#7C4DFF",
    visual: "character",
    iconImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step02-icon-SNLB3dDwDNfZzwFHfA2syi.webp",
    panelImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step02-panel-erd4jMX29QPXQ7KRqAisod.webp",
    bgImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step02-bg-d9FgZGRVZzpiSynZYFm7sk.webp",
  },
  {
    label: "03",
    heading: "To a world.",
    description: "Six world-setting tiles materialize: cyberpunk alleys, enchanted forests, space stations. Your story gets a universe that feels lived-in.",
    icon: Globe,
    color: "#B388FF",
    visual: "world",
    iconImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step03-icon-QaNFups7xAAhTNknJmYoiD.webp",
    panelImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step03-panel-6tiPQARMFdJ4i9FXdLbcSr.webp",
    bgImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step03-bg-ibDguddXeje5rgxDXKzgCH.webp",
  },
  {
    label: "04",
    heading: "To a story voted on by thousands.",
    description: "Publish your manga. The community reads, votes, and decides which stories deserve to become anime. Your vote is a casting decision.",
    icon: Heart,
    color: "#FFD60A",
    visual: "votes",
    iconImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step04-icon-PFNjLRprrgeodNodWumDaM.webp",
    panelImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step04-panel-AGcYJNK5y5EfmyGqniUyox.webp",
    bgImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step04-bg-fh6D5yWC97hmxePaTGTK2h.webp",
  },
  {
    label: "05",
    heading: "To anime.",
    description: "Top-voted manga enter the animation pipeline. Voice acting, music, motion \u2014 all AI-powered. From still panels to streaming episodes.",
    icon: Film,
    color: "#FF2D7A",
    visual: "anime",
    iconImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step05-icon-5JxRDWTajURyYiX5FoHoMq.webp",
    panelImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step05-panel-E9rvmaGBsgiFvYei34TY3B.webp",
    bgImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/step05-bg-ENAGtHB7Zas5dsQYrQWQWu.webp",
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
      <div ref={ref} className="relative py-16 md:py-24 overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[120px] opacity-20"
          style={{ backgroundColor: section.color }}
        />
        <div className="container relative z-10">
          <div
            className={`relative flex flex-col ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} items-center gap-10 md:gap-16 rounded-[28px] p-8 md:p-12 overflow-hidden`}
            style={{
              background: "linear-gradient(160deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 30px 60px -30px rgba(0,0,0,0.7)",
            }}
          >
            {/* Faded background artwork */}
            <img
              src={section.bgImg}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{ opacity: 0.20, filter: "blur(1px) saturate(0.7)" }}
              loading="lazy"
            />
            {/* Dark vignette over background */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `radial-gradient(ellipse at center, transparent 30%, rgba(5,5,12,0.85) 100%), linear-gradient(180deg, rgba(5,5,12,0.6) 0%, transparent 30%, transparent 70%, rgba(5,5,12,0.6) 100%)`,
              }}
            />
            {/* Floating ghost numeral */}
            <span
              className="pointer-events-none absolute -top-4 right-6 md:right-10 font-black leading-none select-none"
              style={{
                fontSize: "180px",
                letterSpacing: "-0.08em",
                background: `linear-gradient(135deg, ${section.color} 0%, ${section.color}33 100%)`,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                opacity: 0.14,
              }}
            >
              {section.label}
            </span>
            {/* Left accent rule */}
            <span
              className="absolute left-0 top-8 bottom-8 w-[3px] rounded-full"
              style={{ background: `linear-gradient(180deg, ${section.color} 0%, transparent 100%)` }}
            />
            {/* Text side */}
            <div className="flex-1 max-w-lg relative z-10">
              <div className="flex items-center gap-3 mb-5">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                  style={{
                    backgroundColor: `${section.color}1A`,
                    border: `1px solid ${section.color}40`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 24px -6px ${section.color}55`,
                  }}
                >
                  <img
                    src={section.iconImg}
                    alt={section.heading}
                    className="w-8 h-8 object-contain"
                    loading="lazy"
                  />
                </div>
                <span
                  className="text-[11px] font-mono font-semibold tabular-nums uppercase"
                  style={{ color: section.color, letterSpacing: "0.22em" }}
                >
                  STEP {section.label}
                </span>
              </div>
              <h2 className="text-h1 text-white mb-4 tracking-tight">{section.heading}</h2>
              <p className="text-[#B8B8CC] text-lg leading-relaxed">{section.description}</p>
            </div>
            {/* Visual side */}
            <motion.div className="flex-1 max-w-lg relative z-10" style={{ y }}>
              <div
                className="aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 relative group"
                style={{
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 60px -20px ${section.color}40`,
                }}
              >
                <img
                  src={section.panelImg}
                  alt={section.heading}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Subtle color overlay for brand consistency */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(135deg, ${section.color}15, transparent 60%)`,
                  }}
                />
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
      <div className="absolute inset-0 bg-gradient-to-b from-[#05050C]/60 via-[#0D0D1A]/40 to-[#05050C]/60" />
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
    if (!isAuthenticated) {
      window.location.href = getLoginUrl("/create/input?projectId=new");
      return;
    }
    if (!prompt.trim()) {
      navigate("/create/input?projectId=new");
      return;
    }
    navigate(`/create/input?projectId=new&prompt=${encodeURIComponent(prompt.trim())}`);
  }, [prompt, navigate, isAuthenticated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
  };

  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#05050C]/50" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-[#7C4DFF]/10 blur-[150px]" />

      <div className="container relative z-10">
        {/* Heading */}
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="text-h1 text-white mb-4">
              This could be you{" "}
              <span className="text-gradient-opening">next Friday.</span>
            </h2>
            <p className="text-[#B8B8CC] text-lg max-w-lg mx-auto">
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
            <div className="relative rounded-2xl overflow-hidden border border-white/10">
              {/* Anime creation background artwork */}
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/cta-creation-bg-hwwkeC3eP8rTc9neY3jnhC.webp"
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: 0.35, filter: "blur(1px) saturate(1.2)" }}
                loading="lazy"
              />
              {/* Dark vignette overlay for text readability */}
              <div
                className="absolute inset-0"
                style={{
                  background: "radial-gradient(ellipse at center, rgba(5,5,12,0.3) 0%, rgba(5,5,12,0.75) 100%)",
                }}
              />
              <div className="relative p-8 md:p-12 text-center z-10">
                <h3 className="text-h2 text-white mb-2">
                  Every great anime starts with an{" "}
                  <span className="text-gradient-opening">idea</span>
                </h3>
                <p className="text-[#5C5C7A] text-sm mb-8">Yours could be next.</p>

                <div className="flex w-full max-w-2xl mx-auto gap-3">
                  <div className="flex-1 relative group">
                    {/* Static gradient border */}
                    <div
                      className="absolute -inset-[1px] rounded-xl opacity-60 group-focus-within:opacity-100 transition-opacity"
                      style={{
                        background: "linear-gradient(135deg, #E040FB40, #7C4DFF40, #FF2D7A40)",
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
                      <svg className="absolute top-1 left-1 w-3 h-3 text-[#E040FB] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M1 5 V1 H5" />
                      </svg>
                      <svg className="absolute top-1 right-1 w-3 h-3 text-[#7C4DFF] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M7 1 H11 V5" />
                      </svg>
                      <svg className="absolute bottom-1 left-1 w-3 h-3 text-[#FFD60A] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M1 7 V11 H5" />
                      </svg>
                      <svg className="absolute bottom-1 right-1 w-3 h-3 text-[#FF2D7A] opacity-70" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
                        <path d="M7 11 H11 V7" />
                      </svg>
                    </div>
                  </div>
                  <motion.button
                    onClick={handleCreate}
                    whileHover={{ scale: 1.03, boxShadow: "0 0 40px rgba(224,64,251,0.5)" }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-shrink-0 bg-opening-sequence text-white font-bold rounded-xl flex items-center gap-2 px-10 py-4 text-lg tracking-wide relative overflow-hidden group/summon"
                    style={{
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 12px 30px -8px rgba(224,64,251,0.45), 0 4px 8px rgba(0,0,0,0.4)",
                    }}
                  >
                    {/* Shimmer sweep */}
                    <span
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.18) 55%, transparent 65%)",
                        backgroundSize: "250% 100%",
                        animation: "shimmer-sweep 3s ease-in-out infinite",
                      }}
                    />
                    <Wand2 className="w-5 h-5 relative z-10" strokeWidth={2.2} />
                    <span className="relative z-10">Summon</span>
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
        <Sparkles className="w-10 h-10 text-[#7C4DFF]/60 mx-auto mb-4" strokeWidth={2} />
        <p className="text-[#B8B8CC] text-lg mb-2">The gallery is waiting for its first stories.</p>
        <Link href="/create">
          <span className="text-[#E040FB] hover:text-[#B388FF] transition-colors cursor-pointer font-medium text-sm">
            Be the first creator <ArrowRight className="inline w-4 h-4 ml-1" strokeWidth={1.5} />
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
                      <Heart className="w-4 h-4 fill-current" />
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
  { name: "AI Screenwriting", icon: Brain, color: "#7C4DFF", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-screenwriting-HsAEycmYpa3TuhFXcpny9U.webp" },
  { name: "Panel Generation", icon: ImageIcon, color: "#E040FB", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-panel-gen-2QJtuqX7x7L5NdixecJQAc.webp" },
  { name: "Video Animation", icon: Film, color: "#B388FF", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-video-anim-nh8rKgBmQiLzcwkzDt5sti.webp" },
  { name: "Voice Acting", icon: Mic, color: "#FFD60A", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-voice-acting-kADJ9u6puCy5tBmEumnhrE.webp" },
  { name: "Community Voting", icon: Heart, color: "#FF2D7A", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-community-voting-bGSg8MyBdujfSUrdiJF8M6.webp" },
  { name: "Full Pipeline", icon: Zap, color: "#00E5A0", chipImg: "https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/chip-full-pipeline-b7bxNE7zefdjYkLTUtBTYS.webp" },
];

function FeatureStrip() {
  return (
    <section className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0D0D1A]/50 to-[#05050C]/50" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="text-center mb-12">
            <h2 className="text-h2 text-white mb-3">Powered by the best AI</h2>
            <p className="text-[#B8B8CC] max-w-md mx-auto">
              State-of-the-art models working together to bring your stories to life.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-5xl mx-auto">
          {AI_FEATURES.map((feat, i) => (
            <ScrollReveal key={feat.name} delay={i * 0.06}>
              <TiltCard color={feat.color}>
                <div
                  className="w-12 h-12 rounded-[14px] flex items-center justify-center mx-auto mb-3 transition-all duration-300 group-hover:scale-110"
                  style={{
                    backgroundColor: `${feat.color}18`,
                    border: `1px solid ${feat.color}40`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 20px -6px ${feat.color}55`,
                  }}
                >
                  <img
                    src={feat.chipImg}
                    alt={feat.name}
                    className="w-8 h-8 object-contain transition-all duration-300 group-hover:drop-shadow-[0_0_8px_var(--glow)] group-hover:brightness-125"
                    style={{ "--glow": `${feat.color}AA` } as React.CSSProperties}
                    loading="lazy"
                  />
                </div>
                {/* Glow pulse ring on hover */}
                <div
                  className="absolute inset-0 rounded-[14px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    boxShadow: `0 0 20px 4px ${feat.color}30, inset 0 0 20px 2px ${feat.color}15`,
                    animation: "glowPulse 2s ease-in-out infinite",
                  }}
                />
                <span className="text-xs font-semibold text-[#B8B8CC] group-hover:text-white transition-colors tracking-wide">
                  {feat.name}
                </span>
              </TiltCard>
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
          <Link href={seeAllLink} className="text-sm text-[#9494B8] hover:text-[#E040FB] transition-colors flex items-center gap-1">
            See all <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          </Link>
        )}
      </div>

      <div className="relative group">
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-[#05050C]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-6 h-6 text-white" strokeWidth={1.75} />
        </button>
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-[#05050C]/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="w-6 h-6 text-white" strokeWidth={1.75} />
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
                          ["from-[#7C4DFF]/30 to-[#B388FF]/20", "from-[#E040FB]/30 to-blue-500/20", "from-[#B388FF]/30 to-[#7C4DFF]/20", "from-emerald-500/30 to-teal-500/20"][i % 4]
                        }`}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-12 h-12 text-white/20" strokeWidth={1.5} />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-[#7C4DFF]/90 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" strokeWidth={1.5} />
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
                      <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-[#E040FB] transition-colors">
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
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" strokeWidth={2} />
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
/** Filter out broken catalog entries — only show titles with a slug and cover */
function filterLiveTitles(projects: any[]): any[] {
  return projects.filter(
    (p) => p && p.slug && (p.coverImageUrl || p.title)
  );
}

export default function Home() {
  const trending = trpc.discover.trending.useQuery();
  const newReleases = trpc.discover.newReleases.useQuery();

  const liveTrending = useMemo(() => filterLiveTitles(trending.data ?? []), [trending.data]);
  const liveNewReleases = useMemo(() => filterLiveTitles(newReleases.data ?? []), [newReleases.data]);

  return (
    <MarketingLayout>
      {/* Scroll-reactive anime backgrounds */}
      <ScrollBackground />

      {/* All content sits above the scroll background */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* ACT ONE — The Hook */}
        <ActOneHero />

        {/* Demo video section */}
        <WatchItHappen />

        {/* ACT TWO — How It Works */}
        <ActTwoProof />

        {/* Feature strip */}
        <FeatureStrip />

        {/* Content rows — only render if there are live titles */}
        <section className="py-8">
          <div className="container">
          {(trending.isLoading || liveTrending.length > 0) && (
            <ContentRow
              title="Trending Now"
              icon={<TrendingUp className="w-5 h-5 text-[#E040FB]" strokeWidth={1.5} />}
              projects={liveTrending}
              isLoading={trending.isLoading}
              seeAllLink="/discover"
            />
          )}
          {(newReleases.isLoading || liveNewReleases.length > 0) && (
            <ContentRow
              title="New Releases"
              icon={<Clock className="w-5 h-5 text-[#E040FB]" strokeWidth={1.5} />}
              projects={liveNewReleases}
              isLoading={newReleases.isLoading}
              seeAllLink="/discover"
            />
          )}
          {!trending.isLoading && !newReleases.isLoading && liveTrending.length === 0 && liveNewReleases.length === 0 && (
            <div className="py-16 text-center">
              <Film className="w-12 h-12 text-[#5C5C7A] mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-[#9494B8] text-lg font-medium">More titles coming tonight</p>
              <p className="text-[#5C5C7A] text-sm mt-1">Our creators are hard at work — check back soon.</p>
            </div>
          )}
          </div>
        </section>

        {/* ACT THREE — The Invitation */}
        <ActThreeInvitation />
      </div>
    </MarketingLayout>
  );
}
