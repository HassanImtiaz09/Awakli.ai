import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { useRef, useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  Play, Star, ChevronRight, ChevronLeft, Sparkles, Zap, Palette,
  Film, Users, TrendingUp, Clock, ArrowRight, BookOpen, Eye
} from "lucide-react";

// ─── Scroll Reveal ─────────────────────────────────────────────────────────
function ScrollReveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Hero Carousel ─────────────────────────────────────────────────────────
const HERO_SLIDES = [
  {
    title: "Transform Manga Into Anime",
    subtitle: "AI-powered pipeline that converts your manga panels into stunning anime-style frames in minutes.",
    gradient: "from-accent-pink/30 via-transparent to-transparent",
    cta: "Start Creating",
    ctaLink: "/studio",
    icon: Sparkles,
  },
  {
    title: "Discover Community Creations",
    subtitle: "Browse thousands of AI-generated anime episodes from creators worldwide.",
    gradient: "from-accent-cyan/30 via-transparent to-transparent",
    cta: "Explore Now",
    ctaLink: "/discover",
    icon: Eye,
  },
  {
    title: "Professional Studio Tools",
    subtitle: "Script generation, character design, panel review, and storyboard export — all in one platform.",
    gradient: "from-accent-purple/30 via-transparent to-transparent",
    cta: "Open Studio",
    ctaLink: "/studio",
    icon: Film,
  },
];

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const slide = HERO_SLIDES[current];
  const Icon = slide.icon;

  return (
    <section className="relative w-full min-h-[85vh] flex items-center overflow-hidden">
      {/* Animated gradient background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className={`absolute inset-0 bg-gradient-to-r ${slide.gradient}`}
        />
      </AnimatePresence>

      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ y: [0, -30, 0], x: [0, 20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-accent-pink/10 blur-3xl"
        />
        <motion.div
          animate={{ y: [0, 20, 0], x: [0, -15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-accent-cyan/10 blur-3xl"
        />
      </div>

      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="container relative z-10 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6"
              >
                <Icon className="w-4 h-4 text-accent-pink" />
                <span className="text-sm text-gray-300">Awakli Studio</span>
              </motion.div>

              <h1 className="text-5xl md:text-7xl font-display font-bold leading-[1.05] mb-6">
                <span className="bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                  {slide.title}
                </span>
              </h1>

              <p className="text-lg md:text-xl text-gray-400 max-w-xl mb-8 leading-relaxed">
                {slide.subtitle}
              </p>

              <div className="flex flex-wrap gap-4">
                <Link href={isAuthenticated ? slide.ctaLink : "/sign-up"}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-8 py-4 rounded-xl bg-gradient-to-r from-accent-pink to-accent-purple text-white font-semibold text-lg shadow-lg shadow-accent-pink/25 hover:shadow-accent-pink/40 transition-shadow"
                  >
                    {slide.cta}
                    <ArrowRight className="inline-block ml-2 w-5 h-5" />
                  </motion.button>
                </Link>
                <Link href="/discover">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-8 py-4 rounded-xl border border-white/10 text-white font-semibold text-lg hover:bg-white/5 transition-colors"
                  >
                    Browse Library
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Visual side — animated demo card */}
          <div className="hidden lg:flex justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                exit={{ opacity: 0, scale: 0.9, rotateY: 10 }}
                transition={{ duration: 0.6 }}
                className="relative w-[420px] h-[520px] rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-surface-1 to-surface-2 shadow-2xl"
              >
                {/* Simulated anime frame */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent-pink/20 via-accent-purple/10 to-accent-cyan/20" />
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className="w-32 h-32 rounded-full border-2 border-dashed border-accent-pink/30 mb-6 flex items-center justify-center"
                  >
                    <Sparkles className="w-12 h-12 text-accent-pink" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-sm text-gray-400 mb-2">AI Processing</p>
                    <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        animate={{ x: ["-100%", "100%"] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1/2 h-full rounded-full bg-gradient-to-r from-accent-pink to-accent-cyan"
                      />
                    </div>
                  </div>
                </div>
                {/* Corner decorations */}
                <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-accent-pink/40 rounded-tl-lg" />
                <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-accent-cyan/40 rounded-br-lg" />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Slide indicators */}
        <div className="flex items-center gap-3 mt-12">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300"
              style={{ width: i === current ? 48 : 24 }}
            >
              <div className="absolute inset-0 bg-white/20 rounded-full" />
              {i === current && (
                <motion.div
                  layoutId="heroIndicator"
                  className="absolute inset-0 bg-gradient-to-r from-accent-pink to-accent-cyan rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Content Row (Netflix-style) ───────────────────────────────────────────
interface ContentRowProps {
  title: string;
  icon: React.ReactNode;
  projects: any[];
  isLoading?: boolean;
  seeAllLink?: string;
}

function ContentRow({ title, icon, projects, isLoading, seeAllLink }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) el.addEventListener("scroll", checkScroll);
    return () => { if (el) el.removeEventListener("scroll", checkScroll); };
  }, [projects]);

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
          <h2 className="text-xl md:text-2xl font-display font-bold text-white">{title}</h2>
        </div>
        {seeAllLink && (
          <Link href={seeAllLink} className="text-sm text-gray-400 hover:text-accent-pink transition-colors flex items-center gap-1">
            See all <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div className="relative group">
        {/* Scroll buttons */}
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-bg-void/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-bg-void/90 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[200px] md:w-[220px] snap-start">
                  <div className="aspect-[3/4] rounded-xl bg-surface-1 animate-pulse" />
                  <div className="mt-3 h-4 bg-surface-1 rounded animate-pulse w-3/4" />
                  <div className="mt-2 h-3 bg-surface-1 rounded animate-pulse w-1/2" />
                </div>
              ))
            : projects.map((project, i) => (
                <PosterCard key={project.id ?? i} project={project} index={i} />
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

// ─── Poster Card ───────────────────────────────────────────────────────────
function PosterCard({ project, index }: { project: any; index: number }) {
  const slug = project.slug || `project-${project.id}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="flex-shrink-0 w-[200px] md:w-[220px] snap-start group/card"
    >
      <Link href={`/watch/${slug}`}>
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/5 bg-surface-1 cursor-pointer">
          {/* Cover image or gradient placeholder */}
          {project.coverImageUrl ? (
            <img src={project.coverImageUrl} alt={project.title} className="w-full h-full object-cover" />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${
              ["from-accent-pink/30 to-accent-purple/20", "from-accent-cyan/30 to-accent-blue/20", "from-accent-purple/30 to-accent-pink/20", "from-emerald-500/30 to-teal-500/20"][index % 4]
            }`}>
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-12 h-12 text-white/20" />
              </div>
            </div>
          )}

          {/* Hover overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 flex items-end p-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-accent-pink/90 flex items-center justify-center">
                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
              </div>
              <span className="text-sm text-white font-medium">Watch Now</span>
            </div>
          </div>

          {/* Genre badge */}
          {project.genre && (
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs text-gray-300 border border-white/10">
              {project.genre}
            </div>
          )}

          {/* Rating */}
          {project.voteScore != null && project.voteScore > 0 && (
            <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-xs text-amber-400">
              <Star className="w-3 h-3 fill-amber-400" />
              {project.voteScore}
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
  );
}

// ─── Stats Bar ─────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { label: "Projects Created", value: "10K+", icon: <Film className="w-5 h-5" /> },
    { label: "Anime Frames", value: "500K+", icon: <Palette className="w-5 h-5" /> },
    { label: "Active Creators", value: "2K+", icon: <Users className="w-5 h-5" /> },
    { label: "Episodes Generated", value: "25K+", icon: <Zap className="w-5 h-5" /> },
  ];

  return (
    <ScrollReveal>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8 px-4 rounded-2xl border border-white/5 bg-surface-1/50 backdrop-blur-sm mb-12">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="text-center"
          >
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-accent-pink/10 text-accent-pink mb-2">
              {stat.icon}
            </div>
            <p className="text-2xl md:text-3xl font-display font-bold text-white">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </ScrollReveal>
  );
}

// ─── Features Section ──────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: <Sparkles className="w-6 h-6" />,
    title: "AI Script Generation",
    description: "Generate complete episode scripts with scenes, panels, and dialogue using advanced LLM technology.",
  },
  {
    icon: <Palette className="w-6 h-6" />,
    title: "10 Art Styles",
    description: "Choose from Shonen, Seinen, Cyberpunk, Watercolor, Noir, and more — each with unique visual characteristics.",
  },
  {
    icon: <Film className="w-6 h-6" />,
    title: "Panel Generation",
    description: "AI generates anime-style frames from your script descriptions with FLUX-powered image generation.",
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: "Character Design",
    description: "Create character reference sheets with AI, train LoRA models for consistent character appearance.",
  },
  {
    icon: <BookOpen className="w-6 h-6" />,
    title: "Storyboard Export",
    description: "Preview your episodes in manga reader format and export as PDF for sharing or printing.",
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: "Community & Voting",
    description: "Share your creations, get votes from the community, and climb the leaderboard.",
  },
];

function FeaturesSection() {
  return (
    <ScrollReveal className="mb-16">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
          Everything You Need to Create Anime
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          From script to screen — a complete AI-powered pipeline for manga-to-anime conversion.
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -4, borderColor: "rgba(236,72,153,0.3)" }}
            className="p-6 rounded-xl border border-white/5 bg-surface-1/50 backdrop-blur-sm transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-accent-pink/10 text-accent-pink flex items-center justify-center mb-4">
              {feature.icon}
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
          </motion.div>
        ))}
      </div>
    </ScrollReveal>
  );
}

// ─── CTA Section ───────────────────────────────────────────────────────────
function CTASection() {
  const { isAuthenticated } = useAuth();
  return (
    <ScrollReveal className="mb-16">
      <div className="relative rounded-2xl overflow-hidden border border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-accent-pink/20 via-accent-purple/10 to-accent-cyan/20" />
        <div className="relative p-12 md:p-16 text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold text-white mb-4">
            Ready to Create Your Anime?
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto mb-8 text-lg">
            Join thousands of creators transforming their manga into stunning anime with AI.
          </p>
          <Link href={isAuthenticated ? "/studio" : "/sign-up"}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-10 py-4 rounded-xl bg-gradient-to-r from-accent-pink to-accent-purple text-white font-semibold text-lg shadow-lg shadow-accent-pink/25"
            >
              Get Started Free
              <ArrowRight className="inline-block ml-2 w-5 h-5" />
            </motion.button>
          </Link>
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
  const topRated = trpc.discover.topRated.useQuery();

  return (
    <div className="min-h-screen bg-bg-void text-white">
      <HeroCarousel />

      <div className="container py-8">
        {/* Featured row */}
        <ContentRow
          title="Featured"
          icon={<Star className="w-5 h-5 text-amber-400" />}
          projects={featured.data ?? []}
          isLoading={featured.isLoading}
          seeAllLink="/discover"
        />

        {/* Trending row */}
        <ContentRow
          title="Trending Now"
          icon={<TrendingUp className="w-5 h-5 text-accent-pink" />}
          projects={trending.data ?? []}
          isLoading={trending.isLoading}
          seeAllLink="/discover"
        />

        {/* Stats */}
        <StatsBar />

        {/* New Releases */}
        <ContentRow
          title="New Releases"
          icon={<Clock className="w-5 h-5 text-accent-cyan" />}
          projects={newReleases.data ?? []}
          isLoading={newReleases.isLoading}
          seeAllLink="/discover"
        />

        {/* Top Rated */}
        <ContentRow
          title="Top Rated"
          icon={<Star className="w-5 h-5 text-amber-400" />}
          projects={topRated.data ?? []}
          isLoading={topRated.isLoading}
          seeAllLink="/discover"
        />

        {/* Features */}
        <FeaturesSection />

        {/* CTA */}
        <CTASection />
      </div>
    </div>
  );
}
