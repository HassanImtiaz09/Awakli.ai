import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "wouter";
import {
  Play, Star, ChevronRight, ChevronLeft, Sparkles, Zap, Palette,
  Film, Users, TrendingUp, Clock, ArrowRight, BookOpen, Eye,
  Wand2, Layers, Mic, Shield, Crown, Check, ChevronDown,
  MousePointer, Upload, Clapperboard, Download
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

// ─── 1. Hero Section with Ken Burns ────────────────────────────────────────
function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrent((p) => (p + 1) % HERO_IMAGES.length), 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section ref={heroRef} className="relative w-full min-h-[100vh] flex items-center overflow-hidden">
      {/* Ken Burns background images */}
      <AnimatePresence mode="sync">
        <motion.div
          key={current}
          initial={{ opacity: 0, scale: 1.15 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.5 }, scale: { duration: 12, ease: "linear" } }}
          className="absolute inset-0"
        >
          <img
            src={HERO_IMAGES[current]}
            alt=""
            className="w-full h-full object-cover"
          />
        </motion.div>
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080F]/95 via-[#08080F]/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080F] via-transparent to-[#08080F]/30" />

      {/* Animated particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-accent-pink/40"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{
              y: [0, -100 - Math.random() * 200],
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 5,
              ease: "easeOut",
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="container relative z-10 pt-32 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="max-w-3xl"
        >
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent-pink/30 bg-accent-pink/10 backdrop-blur-sm mb-8"
          >
            <Sparkles className="w-4 h-4 text-accent-pink" />
            <span className="text-sm text-accent-pink font-medium">AI-Powered Manga to Anime Pipeline</span>
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold leading-[1.02] mb-8">
            <span className="block text-white">Your Manga.</span>
            <span className="block text-gradient-pink">Animated.</span>
          </h1>

          <p className="text-lg md:text-xl text-gray-300 max-w-xl mb-10 leading-relaxed">
            Upload your manga panels and watch AI transform them into stunning anime-style frames, complete with scripts, voice acting, and cinematic effects.
          </p>

          <div className="flex flex-wrap gap-4 mb-12">
            <Link href={isAuthenticated ? "/studio" : "/signup"}>
              <motion.button
                whileHover={{ scale: 1.03, boxShadow: "0 0 40px rgba(233,69,96,0.4)" }}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-accent-pink/25 transition-all"
              >
                Start Creating Free
                <ArrowRight className="inline-block ml-2 w-5 h-5" />
              </motion.button>
            </Link>
            <Link href="/discover">
              <motion.button
                whileHover={{ scale: 1.03, backgroundColor: "rgba(255,255,255,0.08)" }}
                whileTap={{ scale: 0.97 }}
                className="px-8 py-4 rounded-xl border border-white/15 text-white font-semibold text-lg backdrop-blur-sm transition-all"
              >
                <Play className="inline-block mr-2 w-5 h-5" />
                Watch Demos
              </motion.button>
            </Link>
          </div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="flex items-center gap-6 text-sm text-gray-400"
          >
            <div className="flex -space-x-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#08080F] bg-gradient-to-br from-accent-pink/60 to-accent-cyan/60" />
              ))}
            </div>
            <span>Join <strong className="text-white">2,000+</strong> creators already using Awakli</span>
          </motion.div>
        </motion.div>

        {/* Slide indicators */}
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-3">
          {HERO_IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="relative h-1.5 rounded-full overflow-hidden transition-all duration-500"
              style={{ width: i === current ? 48 : 16 }}
            >
              <div className="absolute inset-0 bg-white/20 rounded-full" />
              {i === current && (
                <motion.div
                  layoutId="heroIndicator"
                  className="absolute inset-0 bg-gradient-to-r from-[#E94560] to-[#00D4FF] rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-6 h-6 text-white/40" />
        </motion.div>
      </div>
    </section>
  );
}

// ─── 2. Before/After Comparison Slider ─────────────────────────────────────
function BeforeAfterSlider() {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseUp = () => { isDragging.current = false; };
  const handleMouseMove = (e: React.MouseEvent) => { if (isDragging.current) handleMove(e.clientX); };
  const handleTouchMove = (e: React.TouchEvent) => { handleMove(e.touches[0].clientX); };

  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F] via-[#0D0D1A] to-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-accent-cyan/30 bg-accent-cyan/10 mb-6">
            <Wand2 className="w-4 h-4 text-accent-cyan" />
            <span className="text-sm text-accent-cyan font-medium">See the Magic</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
            Manga to Anime in <span className="text-gradient-pink">Seconds</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Drag the slider to see how our AI transforms black-and-white manga panels into vibrant, cinematic anime frames.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div
            ref={containerRef}
            className="relative max-w-2xl mx-auto aspect-[3/4] rounded-2xl overflow-hidden border border-white/10 cursor-col-resize select-none shadow-2xl"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
          >
            {/* Anime (full background) */}
            <img src={ANIME_IMG} alt="Anime result" className="absolute inset-0 w-full h-full object-cover" />

            {/* Manga (clipped) */}
            <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
              <img src={MANGA_IMG} alt="Manga original" className="absolute inset-0 w-full h-full object-cover" />
            </div>

            {/* Slider line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white/80 z-10"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                <div className="flex items-center gap-0.5">
                  <ChevronLeft className="w-3 h-3 text-gray-800" />
                  <ChevronRight className="w-3 h-3 text-gray-800" />
                </div>
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-xs font-semibold text-white border border-white/10">
              MANGA
            </div>
            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-accent-pink/80 backdrop-blur-sm text-xs font-semibold text-white">
              ANIME
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─── 3. How It Works ───────────────────────────────────────────────────────
const STEPS = [
  { icon: Upload, title: "Upload Manga", desc: "Drop your manga pages or create from scratch with our AI script generator.", color: "from-[#E94560] to-[#FF6B81]" },
  { icon: Wand2, title: "AI Processes", desc: "Our pipeline detects panels, generates scripts, and creates anime-style frames.", color: "from-[#8B5CF6] to-[#A78BFA]" },
  { icon: Palette, title: "Customize Style", desc: "Choose from 10+ art styles — Shonen, Cyberpunk, Watercolor, Noir, and more.", color: "from-[#00D4FF] to-[#33DFFF]" },
  { icon: Download, title: "Export & Share", desc: "Download your anime episodes, share on the platform, and grow your audience.", color: "from-[#2ECC71] to-[#27AE60]" },
];

function HowItWorks() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
            How It <span className="text-gradient-cyan">Works</span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-lg">Four simple steps from manga to anime.</p>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <ScrollReveal key={step.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -8, borderColor: "rgba(233,69,96,0.3)" }}
                  className="relative p-8 rounded-2xl border border-white/5 bg-gradient-to-b from-[#0D0D1A] to-[#08080F] group transition-all"
                >
                  {/* Step number */}
                  <div className="absolute -top-3 -left-1 text-7xl font-display font-bold text-white/[0.03] select-none">
                    {String(i + 1).padStart(2, "0")}
                  </div>

                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>

                  <h3 className="text-xl font-heading font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{step.desc}</p>

                  {/* Connector line (not on last) */}
                  {i < STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-1/2 -right-3 w-6 border-t border-dashed border-white/10" />
                  )}
                </motion.div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 4. Feature Grid ───────────────────────────────────────────────────────
const FEATURES = [
  { icon: Sparkles, title: "AI Script Generation", desc: "Generate complete episode scripts with scenes, panels, and dialogue using advanced LLM technology.", accent: "#E94560" },
  { icon: Palette, title: "10+ Art Styles", desc: "Shonen, Seinen, Cyberpunk, Watercolor, Noir — each with unique visual characteristics and mood.", accent: "#8B5CF6" },
  { icon: Film, title: "Panel Generation", desc: "AI generates anime-style frames from your script descriptions with FLUX-powered image generation.", accent: "#00D4FF" },
  { icon: Users, title: "Character Design", desc: "Create character reference sheets with AI, train LoRA models for consistent character appearance.", accent: "#FFB800" },
  { icon: Mic, title: "Voice Cloning", desc: "Clone voices for your characters and generate dialogue audio for immersive anime episodes.", accent: "#2ECC71" },
  { icon: Clapperboard, title: "Video Pipeline", desc: "Automated video rendering with transitions, camera movements, and cinematic effects.", accent: "#FF6B81" },
  { icon: Layers, title: "Storyboard Export", desc: "Preview episodes in manga reader format and export as PDF for sharing or printing.", accent: "#A78BFA" },
  { icon: TrendingUp, title: "Community & Voting", desc: "Share creations, get votes from the community, and climb the leaderboard.", accent: "#33DFFF" },
  { icon: Shield, title: "Content Moderation", desc: "AI-assisted content review keeps the platform safe and welcoming for all creators.", accent: "#F39C12" },
];

function FeatureGrid() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F] via-[#0D0D1A] to-[#08080F]" />

      {/* Decorative orbs */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-accent-pink/5 blur-[100px]" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 rounded-full bg-accent-cyan/5 blur-[100px]" />

      <div className="container relative z-10">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
            Everything You Need to <span className="text-gradient-pink">Create Anime</span>
          </h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            From script to screen — a complete AI-powered pipeline for manga-to-anime conversion.
          </p>
        </ScrollReveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <ScrollReveal key={feature.title} delay={i * 0.06}>
                <motion.div
                  whileHover={{ y: -4, borderColor: `${feature.accent}40` }}
                  className="p-6 rounded-xl border border-white/5 bg-[#0D0D1A]/80 backdrop-blur-sm transition-all group"
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${feature.accent}15`, color: feature.accent }}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-heading font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
                </motion.div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 5. Pricing Preview ────────────────────────────────────────────────────
const PRICING_TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    desc: "Perfect for trying out Awakli",
    features: ["1 project", "3 episodes per project", "100 credits/month", "5 panels/day", "Community features", "Watermarked output"],
    cta: "Get Started",
    ctaLink: "/signup",
    popular: false,
    accent: "border-white/10",
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    desc: "For serious creators",
    features: ["5 projects", "12 episodes per project", "2,000 credits/month", "100 panels/day", "3 video episodes/month", "2 LoRA models", "2 voice clones", "No watermark"],
    cta: "Start Pro Trial",
    ctaLink: "/pricing",
    popular: true,
    accent: "border-accent-pink/50",
  },
  {
    name: "Studio",
    price: "$99",
    period: "/month",
    desc: "For professional studios",
    features: ["Unlimited projects", "Unlimited episodes", "10,000 credits/month", "Unlimited panels/day", "20 video episodes/month", "Unlimited LoRA models", "Unlimited voice clones", "API access", "Priority support"],
    cta: "Contact Sales",
    ctaLink: "/pricing",
    popular: false,
    accent: "border-accent-cyan/30",
  },
];

function PricingPreview() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
            Simple, Transparent <span className="text-gradient-cyan">Pricing</span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-lg">Start free. Upgrade when you're ready.</p>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PRICING_TIERS.map((tier, i) => (
            <ScrollReveal key={tier.name} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -6 }}
                className={`relative p-8 rounded-2xl border ${tier.accent} bg-gradient-to-b from-[#0D0D1A] to-[#08080F] transition-all ${tier.popular ? "ring-1 ring-accent-pink/30" : ""}`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-xs font-semibold text-white">
                    Most Popular
                  </div>
                )}

                <h3 className="text-xl font-heading font-bold text-white mb-1">{tier.name}</h3>
                <p className="text-sm text-gray-500 mb-6">{tier.desc}</p>

                <div className="mb-6">
                  <span className="text-4xl font-display font-bold text-white">{tier.price}</span>
                  <span className="text-gray-500 ml-1">{tier.period}</span>
                </div>

                <Link href={tier.ctaLink}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                      tier.popular
                        ? "bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white shadow-lg shadow-accent-pink/20"
                        : "border border-white/10 text-white hover:bg-white/5"
                    }`}
                  >
                    {tier.cta}
                  </motion.button>
                </Link>

                <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-accent-pink mt-0.5 flex-shrink-0" />
                      <span className="text-gray-400">{f}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 6. Testimonials ───────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    name: "Yuki Tanaka",
    role: "Manga Artist",
    text: "Awakli transformed my workflow completely. What used to take weeks of coloring now happens in minutes. The AI understands manga composition beautifully.",
    avatar: "YT",
  },
  {
    name: "Alex Chen",
    role: "Animation Studio Lead",
    text: "We use Awakli for rapid prototyping. The quality of the AI-generated anime frames is remarkable — it's like having an entire colorist team on demand.",
    avatar: "AC",
  },
  {
    name: "Sarah Kim",
    role: "Independent Creator",
    text: "The voice cloning feature is incredible. My characters now have unique voices, and the community features help me grow my audience organically.",
    avatar: "SK",
  },
];

function Testimonials() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080F] via-[#0D0D1A] to-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-4">
            Loved by <span className="text-gradient-pink">Creators</span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-lg">See what creators are saying about Awakli.</p>
        </ScrollReveal>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 0.1}>
              <motion.div
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl border border-white/5 bg-[#0D0D1A]/80 backdrop-blur-sm"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-pink to-accent-cyan flex items-center justify-center text-xs font-bold text-white">
                    {t.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── 7. Stats Bar ─────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { label: "Projects Created", value: "10K+", icon: Film },
    { label: "Anime Frames", value: "500K+", icon: Palette },
    { label: "Active Creators", value: "2K+", icon: Users },
    { label: "Episodes Generated", value: "25K+", icon: Zap },
  ];

  return (
    <section className="py-16 relative">
      <div className="absolute inset-0 bg-[#08080F]" />
      <div className="container relative z-10">
        <ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 py-10 px-8 rounded-2xl border border-white/5 bg-gradient-to-r from-[#0D0D1A] via-[#151528] to-[#0D0D1A]">
            {stats.map((stat, i) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-pink/10 text-accent-pink mb-3">
                    <Icon className="w-6 h-6" />
                  </div>
                  <p className="text-3xl md:text-4xl font-display font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{stat.label}</p>
                </motion.div>
              );
            })}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ─── 8. Content Rows (Netflix-style) ──────────────────────────────────────
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
          <Link href={seeAllLink} className="text-sm text-gray-400 hover:text-accent-pink transition-colors flex items-center gap-1">
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
                        <img src={project.coverImageUrl} alt={project.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${
                          ["from-accent-pink/30 to-accent-purple/20", "from-accent-cyan/30 to-blue-500/20", "from-purple-500/30 to-accent-pink/20", "from-emerald-500/30 to-teal-500/20"][i % 4]
                        }`}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Film className="w-12 h-12 text-white/20" />
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-end p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-accent-pink/90 flex items-center justify-center">
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
                      <h3 className="text-sm font-semibold text-white truncate group-hover/card:text-accent-pink transition-colors">
                        {project.title}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {project.animeStyle || "Anime"} {project.episodeCount ? `· ${project.episodeCount} eps` : ""}
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

// ─── 9. Final CTA ──────────────────────────────────────────────────────────
function FinalCTA() {
  const { isAuthenticated } = useAuth();
  return (
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#08080F]" />

      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent-pink/10 blur-[120px]" />

      <div className="container relative z-10">
        <ScrollReveal>
          <div className="relative rounded-3xl overflow-hidden border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-r from-accent-pink/15 via-[#8B5CF6]/10 to-accent-cyan/15" />
            <div className="relative p-12 md:p-20 text-center">
              <motion.div
                initial={{ scale: 0.9 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-4xl md:text-6xl font-display font-bold text-white mb-6">
                  Ready to Create Your <span className="text-gradient-pink">Anime</span>?
                </h2>
                <p className="text-gray-400 max-w-xl mx-auto mb-10 text-lg leading-relaxed">
                  Join thousands of creators transforming their manga into stunning anime with AI. Start free — no credit card required.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Link href={isAuthenticated ? "/studio" : "/signup"}>
                    <motion.button
                      whileHover={{ scale: 1.03, boxShadow: "0 0 50px rgba(233,69,96,0.4)" }}
                      whileTap={{ scale: 0.97 }}
                      className="px-10 py-4 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-accent-pink/25"
                    >
                      Get Started Free
                      <ArrowRight className="inline-block ml-2 w-5 h-5" />
                    </motion.button>
                  </Link>
                  <Link href="/pricing">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="px-10 py-4 rounded-xl border border-white/15 text-white font-semibold text-lg hover:bg-white/5 transition-all"
                    >
                      View Pricing
                    </motion.button>
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
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

      <BeforeAfterSlider />

      <HowItWorks />

      <StatsBar />

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
            icon={<TrendingUp className="w-5 h-5 text-accent-pink" />}
            projects={trending.data ?? []}
            isLoading={trending.isLoading}
            seeAllLink="/discover"
          />
          <ContentRow
            title="New Releases"
            icon={<Clock className="w-5 h-5 text-accent-cyan" />}
            projects={newReleases.data ?? []}
            isLoading={newReleases.isLoading}
            seeAllLink="/discover"
          />
        </div>
      </section>

      <FeatureGrid />

      <PricingPreview />

      <Testimonials />

      <FinalCTA />
    </MarketingLayout>
  );
}
