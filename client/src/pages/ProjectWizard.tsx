import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Loader2,
  Swords, Heart, Rocket, Ghost, Laugh, Wand2, Crown,
  Skull, Palette, Eye, Zap, BookOpen, Baby, GraduationCap, User,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────

const GENRES = [
  { id: "action",   label: "Action",   icon: Swords, color: "#FF4444" },
  { id: "romance",  label: "Romance",  icon: Heart,  color: "#FF69B4" },
  { id: "sci-fi",   label: "Sci-Fi",   icon: Rocket, color: "#00F0FF" },
  { id: "horror",   label: "Horror",   icon: Ghost,  color: "#E74C3C" },
  { id: "comedy",   label: "Comedy",   icon: Laugh,  color: "#F39C12" },
  { id: "fantasy",  label: "Fantasy",  icon: Wand2,  color: "#9B59B6" },
  { id: "drama",    label: "Drama",    icon: Crown,  color: "#FFD60A" },
  { id: "thriller", label: "Thriller", icon: Skull,  color: "#6B5BFF" },
  { id: "slice-of-life", label: "Slice of Life", icon: Palette, color: "#2ECC71" },
] as const;

const TONES = [
  "Dark & Gritty", "Light & Fun", "Epic & Grand", "Mysterious",
  "Emotional", "Action-Packed", "Philosophical", "Whimsical",
] as const;

const AUDIENCES = [
  { id: "kids" as const,  label: "Kids",  icon: Baby,          desc: "Ages 6-12, family-friendly" },
  { id: "teen" as const,  label: "Teen",  icon: GraduationCap, desc: "Ages 13-17, PG-13 content" },
  { id: "adult" as const, label: "Adult", icon: User,          desc: "Ages 18+, mature themes" },
];

const STYLES = [
  { id: "shonen" as const,     label: "Shonen",     desc: "Bold action, vibrant energy" },
  { id: "seinen" as const,     label: "Seinen",     desc: "Mature, cinematic detail" },
  { id: "shoujo" as const,     label: "Shoujo",     desc: "Soft, expressive beauty" },
  { id: "chibi" as const,      label: "Chibi",      desc: "Cute, super-deformed" },
  { id: "cyberpunk" as const,  label: "Cyberpunk",  desc: "Neon-lit, futuristic" },
  { id: "watercolor" as const, label: "Watercolor", desc: "Dreamy, painterly" },
  { id: "noir" as const,       label: "Noir",       desc: "High contrast, shadows" },
  { id: "realistic" as const,  label: "Realistic",  desc: "Photo-real, cinematic" },
] as const;

// ─── Step Indicator ───────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 py-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <motion.div
            className={cn(
              "w-3 h-3 rounded-full relative z-10 transition-all duration-500",
              i < current ? "bg-[var(--token-cyan)]" :
              i === current ? "bg-[var(--token-cyan)]" :
              "bg-[var(--text-muted)]"
            )}
            animate={{
              scale: i === current ? 1.4 : 1,
              boxShadow: i === current
                ? "0 0 16px rgba(107,91,255,0.6)"
                : i < current
                  ? "0 0 8px rgba(0,212,255,0.4)"
                  : "none",
            }}
            transition={{ duration: 0.4 }}
          />
          {i < total - 1 && (
            <div className="w-16 h-0.5 mx-1">
              <motion.div
                className="h-full rounded-full"
                animate={{
                  backgroundColor: i < current ? "var(--token-cyan)" : "var(--text-muted)",
                  opacity: i < current ? 1 : 0.3,
                }}
                transition={{ duration: 0.4 }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Name Your Story ──────────────────────────────────────────────

function StepName({
  title, setTitle, genres, setGenres, tone, setTone, audience, setAudience,
}: {
  title: string; setTitle: (v: string) => void;
  genres: string[]; setGenres: (v: string[]) => void;
  tone: string; setTone: (v: string) => void;
  audience: "kids" | "teen" | "adult"; setAudience: (v: "kids" | "teen" | "adult") => void;
}) {
  const toggleGenre = (id: string) => {
    setGenres(genres.includes(id) ? genres.filter(g => g !== id) : [...genres, id]);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-display text-[var(--text-primary)]">What will you create?</h1>
        <p className="text-[var(--text-secondary)] text-lg">Give your story a name and choose its identity</p>
      </div>

      {/* Title */}
      <div className="relative">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter your story title..."
          className="w-full bg-transparent text-h2 text-center text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border-0 border-b-2 border-[var(--text-muted)] focus:border-[var(--token-cyan)] outline-none pb-3 transition-colors"
          maxLength={255}
        />
      </div>

      {/* Genre Grid */}
      <div>
        <label className="text-label text-[var(--text-secondary)] mb-3 block">Genre (select one or more)</label>
        <div className="grid grid-cols-3 gap-3">
          {GENRES.map((g) => {
            const Icon = g.icon;
            const selected = genres.includes(g.id);
            return (
              <motion.button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all",
                  selected
                    ? "border-transparent"
                    : "border-white/10 hover:border-white/20"
                )}
                style={{
                  backgroundColor: selected ? `${g.color}20` : "var(--bg-elevated)",
                  boxShadow: selected ? `0 0 20px ${g.color}30` : "none",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon size={16} style={{ color: selected ? g.color : "var(--text-muted)" }} />
                <span className={cn("text-sm font-medium", selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                  {g.label}
                </span>
                {selected && <Check size={14} className="ml-auto" style={{ color: g.color }} />}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Tone */}
      <div>
        <label className="text-label text-[var(--text-secondary)] mb-3 block">Tone</label>
        <div className="grid grid-cols-4 gap-2">
          {TONES.map((t) => (
            <motion.button
              key={t}
              onClick={() => setTone(t)}
              className={cn(
                "px-3 py-2 rounded-lg text-sm font-medium border transition-all",
                tone === t
                  ? "bg-[var(--token-cyan)]/15 border-[var(--token-cyan)]/40 text-[var(--token-cyan)]"
                  : "bg-[var(--bg-elevated)] border-white/10 text-[var(--text-secondary)] hover:border-white/20"
              )}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {t}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Audience */}
      <div>
        <label className="text-label text-[var(--text-secondary)] mb-3 block">Target Audience</label>
        <div className="grid grid-cols-3 gap-3">
          {AUDIENCES.map((a) => {
            const Icon = a.icon;
            const selected = audience === a.id;
            return (
              <motion.button
                key={a.id}
                onClick={() => setAudience(a.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-5 rounded-xl border transition-all",
                  selected
                    ? "bg-[var(--token-cyan)]/10 border-[var(--token-cyan)]/40"
                    : "bg-[var(--bg-elevated)] border-white/10 hover:border-white/20"
                )}
                style={{ boxShadow: selected ? "var(--shadow-glow-pink)" : "none" }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Icon size={24} className={selected ? "text-[var(--token-cyan)]" : "text-[var(--text-muted)]"} />
                <span className={cn("font-medium", selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
                  {a.label}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{a.desc}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Describe Your World ──────────────────────────────────────────

function StepDescribe({
  description, setDescription,
}: {
  description: string; setDescription: (v: string) => void;
}) {
  const [enhanced, setEnhanced] = useState<string | null>(null);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const enhanceMutation = trpc.ai.enhanceDescription.useMutation();

  const handleEnhance = async () => {
    if (!description.trim()) {
      toast.error("Write something first to enhance!");
      return;
    }
    try {
      const result = await enhanceMutation.mutateAsync({ text: description });
      setEnhanced(result.enhanced);
      setShowEnhanced(true);
      toast.success("Description enhanced!");
    } catch {
      toast.error("Enhancement failed. Try again.");
    }
  };

  const acceptEnhanced = () => {
    if (enhanced) {
      setDescription(enhanced);
      setEnhanced(null);
      setShowEnhanced(false);
    }
  };

  // Typewriter heading
  const [headingText, setHeadingText] = useState("");
  const fullHeading = "Tell us your story";
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setHeadingText(fullHeading.slice(0, i + 1));
      i++;
      if (i >= fullHeading.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-display text-[var(--text-primary)]">
          {headingText}
          <motion.span
            className="inline-block w-0.5 h-[0.8em] bg-[var(--token-cyan)] ml-1 align-middle"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
          />
        </h1>
        <p className="text-[var(--text-secondary)] text-lg">Describe your world, characters, and plot</p>
      </div>

      <div className="relative">
        <textarea
          value={showEnhanced && enhanced ? enhanced : description}
          onChange={(e) => {
            if (showEnhanced) {
              setShowEnhanced(false);
              setEnhanced(null);
            }
            setDescription(e.target.value);
          }}
          placeholder="A young warrior discovers an ancient power hidden within manga pages that can bring illustrations to life..."
          className={cn(
            "w-full min-h-[200px] p-5 rounded-xl border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none transition-all",
            "bg-[var(--bg-elevated)] focus:outline-none",
            showEnhanced
              ? "border-[var(--token-cyan)]/40"
              : "border-white/10 focus:border-[var(--token-cyan)]/40"
          )}
          maxLength={5000}
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-[var(--text-muted)]">
            {(showEnhanced && enhanced ? enhanced : description).length} / 5000
          </span>
          <div className="flex items-center gap-2">
            {showEnhanced && enhanced && (
              <>
                <motion.button
                  onClick={() => { setShowEnhanced(false); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--bg-overlay)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  View Original
                </motion.button>
                <motion.button
                  onClick={acceptEnhanced}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--token-cyan)]/15 text-[var(--token-cyan)] hover:bg-[var(--token-cyan)]/25 transition-colors"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <Check size={12} className="inline mr-1" /> Accept Enhanced
                </motion.button>
              </>
            )}
            <motion.button
              onClick={handleEnhance}
              disabled={enhanceMutation.isPending || !description.trim()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                "bg-[var(--token-cyan)]/15 text-[var(--token-cyan)] hover:bg-[var(--token-cyan)]/25",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {enhanceMutation.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {enhanceMutation.isPending ? "Enhancing..." : "AI Enhance"}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Choose Your Style ────────────────────────────────────────────

function StepStyle({
  style, setStyle,
}: {
  style: string; setStyle: (v: string) => void;
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-display text-[var(--text-primary)]">Pick an art style</h1>
        <p className="text-[var(--text-secondary)] text-lg">Choose the visual direction for your anime</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STYLES.map((s) => {
          const selected = style === s.id;
          return (
            <motion.button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={cn(
                "relative overflow-hidden rounded-xl border transition-all",
                "aspect-[3/4] flex flex-col justify-end p-4",
                selected
                  ? "border-[var(--token-cyan)] ring-2 ring-[var(--token-cyan)]/30"
                  : "border-white/10 hover:border-white/20"
              )}
              style={{
                background: `linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)`,
                boxShadow: selected ? "var(--shadow-glow-pink)" : "none",
              }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
              animate={{ scale: selected ? 1.03 : 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Style icon/preview area */}
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <Eye size={64} className="text-[var(--text-muted)]" />
              </div>

              {/* Bottom gradient overlay */}
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[var(--bg-void)]/90 to-transparent" />

              <div className="relative z-10">
                <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)]">{s.label}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1">{s.desc}</p>
              </div>

              {selected && (
                <motion.div
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[var(--token-cyan)] flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <Check size={14} className="text-white" />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 4: Review & Create ──────────────────────────────────────────────

function StepReview({
  title, genres, tone, audience, description, style, isCreating, onCreate,
}: {
  title: string; genres: string[]; tone: string; audience: string;
  description: string; style: string; isCreating: boolean; onCreate: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center space-y-3">
        <h1 className="text-display text-[var(--text-primary)]">Review & Create</h1>
        <p className="text-[var(--text-secondary)] text-lg">Everything looks good? Let's bring it to life.</p>
      </div>

      <motion.div
        className="rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: "var(--gradient-card)" }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="p-6 space-y-5">
          <div>
            <span className="text-label text-[var(--text-muted)]">Title</span>
            <p className="text-h3 text-[var(--text-primary)] mt-1">{title || "Untitled Project"}</p>
          </div>

          {genres.length > 0 && (
            <div>
              <span className="text-label text-[var(--text-muted)]">Genre</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {genres.map((g) => {
                  const genre = GENRES.find(x => x.id === g);
                  return (
                    <span
                      key={g}
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${genre?.color}20`, color: genre?.color }}
                    >
                      {genre?.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {tone && (
            <div>
              <span className="text-label text-[var(--text-muted)]">Tone</span>
              <p className="text-[var(--text-secondary)] mt-1">{tone}</p>
            </div>
          )}

          <div>
            <span className="text-label text-[var(--text-muted)]">Audience</span>
            <p className="text-[var(--text-secondary)] mt-1 capitalize">{audience}</p>
          </div>

          {description && (
            <div>
              <span className="text-label text-[var(--text-muted)]">Description</span>
              <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-4">{description}</p>
            </div>
          )}

          <div>
            <span className="text-label text-[var(--text-muted)]">Art Style</span>
            <p className="text-[var(--text-secondary)] mt-1 capitalize">{STYLES.find(s => s.id === style)?.label || style}</p>
          </div>
        </div>
      </motion.div>

      <motion.button
        onClick={onCreate}
        disabled={isCreating || !title.trim()}
        className={cn(
          "w-full py-4 rounded-xl text-lg font-heading font-semibold transition-all",
          "bg-gradient-to-r from-[var(--token-cyan)] to-[#6B5BFF] text-white",
          "hover:shadow-[var(--shadow-glow-pink)] disabled:opacity-50 disabled:cursor-not-allowed"
        )}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        {isCreating ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={20} className="animate-spin" />
            Creating your project...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Zap size={20} />
            Create Project
          </span>
        )}
      </motion.button>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────

export default function ProjectWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);

  // Form state
  const [title, setTitle] = useState("");
  const [genres, setGenres] = useState<string[]>([]);
  const [tone, setTone] = useState("");
  const [audience, setAudience] = useState<"kids" | "teen" | "adult">("teen");
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState("default");

  const createMutation = trpc.projects.create.useMutation();

  const canNext = useCallback(() => {
    switch (step) {
      case 0: return title.trim().length > 0;
      case 1: return true; // description is optional
      case 2: return style !== "default";
      case 3: return title.trim().length > 0;
      default: return false;
    }
  }, [step, title, style]);

  const handleCreate = async () => {
    try {
      const result = await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        genre: genres.join(", ") || undefined,
        animeStyle: style as any,
        tone: tone || undefined,
        targetAudience: audience,
        visibility: "private",
      });

      // Fire confetti
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#6B5BFF", "#B388FF", "#00F0FF", "#FFD60A", "#9B59B6"],
      });

      toast.success("Project created! Redirecting to studio...");

      setTimeout(() => {
        navigate(`/studio/project/${result.id}`);
      }, 2000);
    } catch {
      toast.error("Failed to create project. Please try again.");
    }
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  const [direction, setDirection] = useState(1);

  const goNext = () => {
    if (canNext() && step < 3) {
      setDirection(1);
      setStep(step + 1);
    }
  };

  const goPrev = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(step - 1);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-void)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <button
          onClick={() => navigate("/studio")}
          className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Studio
        </button>
        <span className="text-label text-[var(--text-muted)]">Step {step + 1} of 4</span>
      </div>

      <StepIndicator current={step} total={4} />

      {/* Step content */}
      <div className="flex-1 px-6 pb-8 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: "easeInOut" }}
          >
            {step === 0 && (
              <StepName
                title={title} setTitle={setTitle}
                genres={genres} setGenres={setGenres}
                tone={tone} setTone={setTone}
                audience={audience} setAudience={setAudience}
              />
            )}
            {step === 1 && (
              <StepDescribe description={description} setDescription={setDescription} />
            )}
            {step === 2 && (
              <StepStyle style={style} setStyle={setStyle} />
            )}
            {step === 3 && (
              <StepReview
                title={title} genres={genres} tone={tone} audience={audience}
                description={description} style={style}
                isCreating={createMutation.isPending}
                onCreate={handleCreate}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="sticky bottom-0 flex items-center justify-between px-6 py-4 border-t border-white/5 bg-[var(--bg-void)]/80 backdrop-blur-sm">
        <motion.button
          onClick={goPrev}
          disabled={step === 0}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
            "border border-white/10 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-white/20",
            "disabled:opacity-30 disabled:cursor-not-allowed"
          )}
          whileHover={{ scale: step > 0 ? 1.02 : 1 }}
          whileTap={{ scale: step > 0 ? 0.98 : 1 }}
        >
          <ChevronLeft size={16} />
          Back
        </motion.button>

        {step < 3 && (
          <motion.button
            onClick={goNext}
            disabled={!canNext()}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              "bg-[var(--token-cyan)] text-white hover:bg-[var(--token-violet-hover)]",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            whileHover={{ scale: canNext() ? 1.02 : 1 }}
            whileTap={{ scale: canNext() ? 0.98 : 1 }}
          >
            Next
            <ChevronRight size={16} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
