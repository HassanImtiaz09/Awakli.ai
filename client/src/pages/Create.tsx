import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Wand2, ChevronDown, Loader2, BookOpen, Zap,
  ArrowLeft, ArrowRight, Palette, Drama, Settings2, ChevronRight,
  Clapperboard,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import StylePicker from "@/components/awakli/StylePicker";
import TonePicker from "@/components/awakli/TonePicker";
import ChapterPrefs from "@/components/awakli/ChapterPrefs";
import CustomizeSummary from "@/components/awakli/CustomizeSummary";
import type { StyleKey, ToneKey } from "../../../shared/style-images";
import PageBackground from "@/components/awakli/PageBackground";

const GENRES = [
  "Action", "Romance", "Sci-Fi", "Fantasy", "Horror",
  "Comedy", "Mystery", "Slice of Life", "Thriller", "Adventure",
];

/* ─── Rotating placeholder prompts — §3.4 ─────────────────────────── */
const PLACEHOLDER_PROMPTS = [
  "A samurai who can see 10 seconds into the future must protect a blind oracle from an army of shadow assassins...",
  "In a world where dreams are currency, a broke teenager discovers she can forge them from thin air...",
  "Two rival chefs compete in a cooking tournament where the dishes come alive and fight each other...",
  "A detective in Neo-Tokyo discovers that every unsolved case leads back to the same AI that runs the city...",
  "A girl wakes up in a manga she drew as a child, but the villain remembers her too...",
  "The last librarian on Earth guards a book that rewrites reality every time someone reads it aloud...",
  "A street musician's songs literally change the weather, and a secret agency wants to weaponize her voice...",
  "In a floating city above the clouds, a mechanic discovers the engines are powered by trapped souls...",
];

type FlowMode = "prompt" | "customize";
type CustomizeStep = 0 | 1 | 2 | 3;

const STEP_TITLES = [
  { title: "Choose Your Art Style", subtitle: "How should your manga look?" },
  { title: "Set the Tone", subtitle: "What mood should your story have?" },
  { title: "Story Structure", subtitle: "How should your chapters be organized?" },
  { title: "Ready to Create", subtitle: "Review your settings and generate!" },
];

const STORAGE_KEY_PROMPT = "awakli_create_prompt";
const STORAGE_KEY_GENRE = "awakli_create_genre";
const STORAGE_KEY_PENDING = "awakli_create_pending";
const STORAGE_KEY_AUTH_ATTEMPT = "awakli_auth_attempt";

/* ─── Typewriter placeholder hook ──────────────────────────────────── */
function useTypewriterPlaceholder(prompts: string[], cycleMs = 4000) {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const target = prompts[index];
    if (isTyping) {
      if (displayed.length < target.length) {
        const timer = setTimeout(() => {
          setDisplayed(target.slice(0, displayed.length + 1));
        }, 22);
        return () => clearTimeout(timer);
      } else {
        // Pause at full text before erasing
        const timer = setTimeout(() => setIsTyping(false), cycleMs);
        return () => clearTimeout(timer);
      }
    } else {
      if (displayed.length > 0) {
        const timer = setTimeout(() => {
          setDisplayed(displayed.slice(0, -1));
        }, 12);
        return () => clearTimeout(timer);
      } else {
        setIndex((i) => (i + 1) % prompts.length);
        setIsTyping(true);
      }
    }
  }, [displayed, isTyping, index, prompts, cycleMs]);

  return displayed;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function PlatformStats() {
  const { data, isLoading } = trpc.platformStats.useQuery(undefined, {
    staleTime: 60_000, // cache for 1 minute
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(() => [
    { label: "Manga Created", value: data ? formatCount(data.totalProjects) : null },
    { label: "Panels Generated", value: data ? formatCount(data.totalPanels) : null },
    { label: "Active Creators", value: data ? formatCount(data.activeCreators) : null },
  ], [data]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 1 }}
      className="mt-8 flex justify-center gap-8 text-center"
    >
      {stats.map((stat) => (
        <div key={stat.label}>
          <div className="text-[#F0F0F5]/80 font-semibold text-lg font-mono">
            {isLoading || stat.value === null ? (
              <span className="inline-block w-12 h-5 rounded bg-white/5 skeleton-shimmer" />
            ) : (
              stat.value
            )}
          </div>
          <div className="text-[#9494B8]/40 text-xs">{stat.label}</div>
        </div>
      ))}
    </motion.div>
  );
}

export default function Create() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const hasAutoTriggered = useRef(false);

  const [prompt, setPrompt] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPrompt = params.get("prompt");
    if (urlPrompt) return urlPrompt;
    const saved = sessionStorage.getItem(STORAGE_KEY_PROMPT);
    return saved || "";
  });
  const [genre, setGenre] = useState(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY_GENRE);
    return saved || "Fantasy";
  });

  const [flowMode, setFlowMode] = useState<FlowMode>("prompt");
  const [customizeStep, setCustomizeStep] = useState<CustomizeStep>(0);

  const [style, setStyle] = useState<StyleKey>("shonen");
  const [previewGender, setPreviewGender] = useState<"male" | "female">("male");
  const [tone, setTone] = useState<ToneKey>("epic");
  const [chapters, setChapters] = useState(3);
  const [chapterLength, setChapterLength] = useState<"short" | "standard" | "long">("standard");
  const [pacingStyle, setPacingStyle] = useState<"action_heavy" | "dialogue_heavy" | "balanced">("balanced");
  const [endingStyle, setEndingStyle] = useState<"cliffhanger" | "resolution" | "serialized">("cliffhanger");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Typewriter placeholder — only active when prompt is empty
  const placeholder = useTypewriterPlaceholder(PLACEHOLDER_PROMPTS, 4000);

  useEffect(() => {
    if (prompt) sessionStorage.setItem(STORAGE_KEY_PROMPT, prompt);
  }, [prompt]);
  useEffect(() => {
    if (genre) sessionStorage.setItem(STORAGE_KEY_GENRE, genre);
  }, [genre]);

  const quickCreate = trpc.quickCreate.start.useMutation({
    onSuccess: (data) => {
      sessionStorage.removeItem(STORAGE_KEY_PROMPT);
      sessionStorage.removeItem(STORAGE_KEY_GENRE);
      sessionStorage.removeItem(STORAGE_KEY_PENDING);
      navigate(`/create/${data.projectId}`);
    },
    onError: (err) => {
      setIsSubmitting(false);
      sessionStorage.removeItem(STORAGE_KEY_PENDING);
      alert(err.message);
    },
  });

  const handleGenerate = useCallback((useCustomization: boolean) => {
    if (!prompt.trim() || prompt.trim().length < 10) return;
    setIsSubmitting(true);
    quickCreate.mutate({
      prompt: prompt.trim(),
      genre,
      style: style as any,
      chapters,
      ...(useCustomization ? {
        tone: tone,
        targetAudience: "general",
      } : {}),
    });
  }, [prompt, genre, style, chapters, tone, quickCreate]);

  const handleQuickGenerate = useCallback(() => handleGenerate(false), [handleGenerate]);
  const handleCustomGenerate = useCallback(() => handleGenerate(true), [handleGenerate]);

  useEffect(() => {
    if (hasAutoTriggered.current) return;
    const pending = sessionStorage.getItem(STORAGE_KEY_PENDING);
    if (!pending) return;
    if (!prompt.trim() || prompt.trim().length < 10) return;
    hasAutoTriggered.current = true;
    sessionStorage.removeItem(STORAGE_KEY_PENDING);
    sessionStorage.removeItem(STORAGE_KEY_AUTH_ATTEMPT);
    const timer = setTimeout(() => {
      handleGenerate(pending === "customize");
    }, 500);
    return () => clearTimeout(timer);
  }, [prompt, handleGenerate]);

  const canProceed = prompt.trim().length >= 10;

  const handleStartCustomize = useCallback(() => {
    if (!canProceed) return;
    setFlowMode("customize");
    setCustomizeStep(0);
  }, [canProceed]);

  const handleBack = useCallback(() => {
    if (customizeStep === 0) {
      setFlowMode("prompt");
    } else {
      setCustomizeStep((s) => (s - 1) as CustomizeStep);
    }
  }, [customizeStep]);

  const handleNext = useCallback(() => {
    if (customizeStep < 3) {
      setCustomizeStep((s) => (s + 1) as CustomizeStep);
    }
  }, [customizeStep]);

  const progress = useMemo(() => ((customizeStep + 1) / 4) * 100, [customizeStep]);

  return (
    <div className="min-h-screen bg-[#05050C] relative overflow-hidden">
      {/* Anime-themed background artwork */}
      <PageBackground src="https://d2xsxph8kpxj0f.cloudfront.net/310519663430072618/4V9sAd2k2m2djZEsU8bXCJ/page-bg-create-EMgFtGXcLa2KcTiEqkL5uG.webp" opacity={0.45} />

      {/* Soft character silhouette glow — centre */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[#7C4DFF]/[0.04] blur-[180px]" />

        {/* Subtle floating particles */}
        <div className="absolute top-20 left-[15%] w-1 h-1 rounded-full bg-[#7C4DFF]/30 animate-float" />
        <div className="absolute top-40 right-[20%] w-1.5 h-1.5 rounded-full bg-[#E040FB]/20 animate-float" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-32 left-[30%] w-1 h-1 rounded-full bg-[#B388FF]/25 animate-float" style={{ animationDelay: "4s" }} />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Top nav */}
      <div className="relative z-10 pt-6 px-6 flex items-center justify-between">
        <button
          onClick={() => flowMode === "customize" ? handleBack() : navigate("/")}
          className="text-[#9494B8]/60 hover:text-[#F0F0F5] transition text-sm flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" />
          {flowMode === "customize" ? (customizeStep === 0 ? "Back to prompt" : "Previous step") : "Back to Awakli"}
        </button>

        {flowMode === "customize" && (
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step <= customizeStep ? "bg-opening-sequence w-8" : "bg-white/10 w-4"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center min-h-[calc(100vh-80px)] px-4 pb-12">
        <AnimatePresence mode="wait">
          {flowMode === "prompt" ? (
            <motion.div
              key="prompt-mode"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-2xl mt-8 md:mt-16"
            >
              {/* Heading — §10 copy */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[#9494B8] text-sm mb-6"
                >
                  <Clapperboard className="w-4 h-4 text-[#E040FB]" />
                  No artistic skill needed
                </motion.div>
                <h1 className="text-display text-[#F0F0F5] leading-tight">
                  What story will{" "}
                  <span className="text-gradient-opening">
                    you tell?
                  </span>
                </h1>
                <p className="text-[#9494B8] mt-3 text-lg">
                  Type a sentence. We will animate it. Before you go to bed.
                </p>
              </div>

              {/* Generating indicator */}
              {isSubmitting && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-4 py-3 rounded-xl bg-[#7C4DFF]/10 border border-[#7C4DFF]/20 text-center"
                >
                  <span className="flex items-center justify-center gap-2 text-[#E040FB] font-mono text-sm">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Frame 01 is inking. Frame 02 is loading voice. Hold.
                  </span>
                </motion.div>
              )}

              {/* Prompt textarea — §3.4 glass card with typewriter placeholder */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <div className="relative rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden focus-within:border-[#7C4DFF]/40 focus-within:ring-1 focus-within:ring-[#7C4DFF]/20 transition-all">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder=""
                    className="w-full min-h-[180px] p-6 bg-transparent text-[#F0F0F5] text-lg placeholder:text-transparent focus:outline-none resize-none"
                    maxLength={5000}
                  />
                  {/* Typewriter placeholder overlay */}
                  {!prompt && (
                    <div className="absolute top-6 left-6 right-6 pointer-events-none text-lg text-[#9494B8]/40">
                      {placeholder}
                      <span className="inline-block w-0.5 h-5 bg-[#E040FB] ml-0.5 animate-pulse" />
                    </div>
                  )}
                </div>
                <div className="absolute bottom-3 right-4 text-[#9494B8]/30 text-xs font-mono">
                  {prompt.length}/5000
                </div>
              </motion.div>

              {/* Genre pills */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex flex-wrap gap-1.5 mt-4"
              >
                {GENRES.map((g) => (
                  <button
                    key={g}
                    onClick={() => setGenre(g)}
                    className={`px-3 py-1 rounded-full text-sm transition-all ${
                      genre === g
                        ? "bg-opening-sequence text-white shadow-lg shadow-[#7C4DFF]/25"
                        : "bg-white/5 text-[#9494B8]/60 hover:bg-white/10 hover:text-[#F0F0F5]/70"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </motion.div>

              {/* Two-path buttons — §10 "Write the first scene" */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <motion.button
                  whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(124,77,255,0.3)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleQuickGenerate}
                  disabled={!canProceed || isSubmitting}
                  className="py-4 px-6 rounded-xl bg-opening-sequence text-white font-semibold text-lg shadow-lg shadow-[#7C4DFF]/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none relative overflow-hidden group"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Zap className="w-5 h-5" />
                      Write the First Scene
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleStartCustomize}
                  disabled={!canProceed || isSubmitting}
                  className="py-4 px-6 rounded-xl bg-white/[0.05] border border-white/15 text-white font-semibold text-lg hover:bg-white/[0.08] hover:border-white/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Palette className="w-5 h-5 text-[#B388FF]" />
                    Customize First
                    <ChevronRight className="w-4 h-4 text-[#9494B8]/40 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </motion.button>
              </motion.div>

              {canProceed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-[#9494B8]/30 text-xs mt-3 font-mono"
                >
                  "Write the First Scene" uses smart defaults. "Customize First" lets you pick art style, tone, and more.
                </motion.p>
              )}

              {prompt.trim().length > 0 && prompt.trim().length < 10 && (
                <p className="text-[#E040FB]/60 text-sm mt-3 text-center">
                  Please write at least 10 characters to describe your story
                </p>
              )}

              {/* Inspiration */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-10 text-center"
              >
                <p className="text-[#9494B8]/40 text-sm mb-3">Need inspiration? Try one of these:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {PLACEHOLDER_PROMPTS.slice(0, 3).map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(idea)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[#9494B8]/40 text-xs hover:text-[#F0F0F5]/60 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left max-w-[280px] truncate"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Live Platform Stats */}
              <PlatformStats />
            </motion.div>
          ) : (
            /* Customize Flow */
            <motion.div
              key={`customize-step-${customizeStep}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-3xl mt-6"
            >
              <div className="text-center mb-6">
                <h2 className="text-h2 text-[#F0F0F5]">
                  {STEP_TITLES[customizeStep].title}
                </h2>
                <p className="text-[#9494B8] mt-1">
                  {STEP_TITLES[customizeStep].subtitle}
                </p>
              </div>

              <div className="mb-6 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-[#E040FB] mt-0.5 shrink-0" />
                <p className="text-[#9494B8]/60 text-sm line-clamp-2">{prompt}</p>
              </div>

              <div className="min-h-[400px]">
                {customizeStep === 0 && (
                  <StylePicker
                    value={style}
                    onChange={setStyle}
                    gender={previewGender}
                    onGenderChange={setPreviewGender}
                  />
                )}
                {customizeStep === 1 && (
                  <TonePicker value={tone} onChange={setTone} />
                )}
                {customizeStep === 2 && (
                  <ChapterPrefs
                    chapters={chapters}
                    onChaptersChange={setChapters}
                    chapterLength={chapterLength}
                    onChapterLengthChange={setChapterLength}
                    pacingStyle={pacingStyle}
                    onPacingStyleChange={setPacingStyle}
                    endingStyle={endingStyle}
                    onEndingStyleChange={setEndingStyle}
                  />
                )}
                {customizeStep === 3 && (
                  <div className="space-y-6">
                    <CustomizeSummary
                      style={style}
                      tone={tone}
                      chapters={chapters}
                      chapterLength={chapterLength}
                      pacingStyle={pacingStyle}
                      endingStyle={endingStyle}
                      genre={genre}
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBack}
                  className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[#9494B8] font-medium hover:bg-white/10 hover:text-[#F0F0F5] transition-all"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1.5" />
                  Back
                </motion.button>

                {customizeStep < 3 ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNext}
                    className="flex-1 py-3 rounded-xl bg-white/10 border border-white/15 text-white font-semibold hover:bg-white/15 transition-all"
                  >
                    Next Step
                    <ArrowRight className="w-4 h-4 inline ml-1.5" />
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02, boxShadow: "0 0 40px rgba(124,77,255,0.3)" }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCustomGenerate}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-opening-sequence text-white font-semibold text-lg shadow-lg shadow-[#7C4DFF]/25 transition-all disabled:opacity-40 relative overflow-hidden group"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2 font-mono text-sm">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Frame 01 is inking. Hold.
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Wand2 className="w-5 h-5" />
                        Generate My Manga
                      </span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
