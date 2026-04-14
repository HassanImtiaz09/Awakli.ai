import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Wand2, ChevronDown, Loader2, BookOpen, Zap, Lock,
  ArrowLeft, ArrowRight, Palette, Drama, Settings2, ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import StylePicker from "@/components/awakli/StylePicker";
import TonePicker from "@/components/awakli/TonePicker";
import ChapterPrefs from "@/components/awakli/ChapterPrefs";
import CustomizeSummary from "@/components/awakli/CustomizeSummary";
import type { StyleKey, ToneKey } from "../../../shared/style-images";

const GENRES = [
  "Action", "Romance", "Sci-Fi", "Fantasy", "Horror",
  "Comedy", "Mystery", "Slice of Life", "Thriller", "Adventure",
];

type FlowMode = "prompt" | "customize";
type CustomizeStep = 0 | 1 | 2 | 3; // 0=style, 1=tone, 2=chapter, 3=summary

const STEP_TITLES = [
  { title: "Choose Your Art Style", subtitle: "How should your manga look?" },
  { title: "Set the Tone", subtitle: "What mood should your story have?" },
  { title: "Story Structure", subtitle: "How should your chapters be organized?" },
  { title: "Ready to Create", subtitle: "Review your settings and generate!" },
];

// SessionStorage keys for persisting state across OAuth redirects
const STORAGE_KEY_PROMPT = "awakli_create_prompt";
const STORAGE_KEY_GENRE = "awakli_create_genre";
const STORAGE_KEY_PENDING = "awakli_create_pending";

export default function Create() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const hasAutoTriggered = useRef(false);

  // Prompt state — restore from sessionStorage if available
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

  // Flow mode
  const [flowMode, setFlowMode] = useState<FlowMode>("prompt");
  const [customizeStep, setCustomizeStep] = useState<CustomizeStep>(0);

  // Customization state
  const [style, setStyle] = useState<StyleKey>("shonen");
  const [previewGender, setPreviewGender] = useState<"male" | "female">("male");
  const [tone, setTone] = useState<ToneKey>("epic");
  const [chapters, setChapters] = useState(3);
  const [chapterLength, setChapterLength] = useState<"short" | "standard" | "long">("standard");
  const [pacingStyle, setPacingStyle] = useState<"action_heavy" | "dialogue_heavy" | "balanced">("balanced");
  const [endingStyle, setEndingStyle] = useState<"cliffhanger" | "resolution" | "serialized">("cliffhanger");

  // UI state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Persist prompt and genre to sessionStorage whenever they change
  useEffect(() => {
    if (prompt) sessionStorage.setItem(STORAGE_KEY_PROMPT, prompt);
  }, [prompt]);
  useEffect(() => {
    if (genre) sessionStorage.setItem(STORAGE_KEY_GENRE, genre);
  }, [genre]);

  const quickCreate = trpc.quickCreate.start.useMutation({
    onSuccess: (data) => {
      // Clear saved state on successful creation
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

    if (!isAuthenticated) {
      // Save pending action so we can auto-trigger after login
      sessionStorage.setItem(STORAGE_KEY_PENDING, useCustomization ? "customize" : "quick");
      setShowAuthModal(true);
      return;
    }

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
  }, [prompt, genre, style, chapters, tone, isAuthenticated, quickCreate]);

  const handleQuickGenerate = useCallback(() => handleGenerate(false), [handleGenerate]);
  const handleCustomGenerate = useCallback(() => handleGenerate(true), [handleGenerate]);

  // Auto-trigger generation after OAuth redirect if there was a pending action
  useEffect(() => {
    if (authLoading || hasAutoTriggered.current) return;
    if (!isAuthenticated) return;

    const pending = sessionStorage.getItem(STORAGE_KEY_PENDING);
    if (!pending) return;
    if (!prompt.trim() || prompt.trim().length < 10) return;

    hasAutoTriggered.current = true;
    sessionStorage.removeItem(STORAGE_KEY_PENDING);

    // Small delay to let the UI render first
    const timer = setTimeout(() => {
      handleGenerate(pending === "customize");
    }, 500);

    return () => clearTimeout(timer);
  }, [authLoading, isAuthenticated, prompt, handleGenerate]);

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

  // Build login URL that returns to /create after OAuth
  const loginUrl = useMemo(() => getLoginUrl("/create"), []);

  // Progress bar
  const progress = useMemo(() => ((customizeStep + 1) / 4) * 100, [customizeStep]);

  return (
    <div className="min-h-screen bg-[#08080F] relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-[#E94560]/5 blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-[#6C63FF]/5 blur-[150px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#00D4AA]/3 blur-[200px] animate-pulse" style={{ animationDelay: "4s" }} />
      </div>

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Top nav */}
      <div className="relative z-10 pt-6 px-6 flex items-center justify-between">
        <button onClick={() => flowMode === "customize" ? handleBack() : navigate("/")} className="text-white/40 hover:text-white/70 transition text-sm flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          {flowMode === "customize" ? (customizeStep === 0 ? "Back to prompt" : "Previous step") : "Back to Awakli"}
        </button>

        {/* Progress indicator for customize mode */}
        {flowMode === "customize" && (
          <div className="flex items-center gap-2">
            {[0, 1, 2, 3].map((step) => (
              <div
                key={step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  step <= customizeStep ? "bg-[#E94560] w-8" : "bg-white/10 w-4"
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
              className="w-full max-w-2xl mt-8"
            >
              {/* Heading */}
              <div className="text-center mb-8">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-sm mb-6"
                >
                  <Sparkles className="w-4 h-4 text-[#E94560]" />
                  No artistic skill needed
                </motion.div>
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                  What story will{" "}
                  <span className="bg-gradient-to-r from-[#E94560] via-[#FF6B81] to-[#6C63FF] bg-clip-text text-transparent">
                    you tell?
                  </span>
                </h1>
                <p className="text-white/40 mt-3 text-lg">
                  Describe your story and AI will create the manga panels for you.
                </p>
              </div>

              {/* Auto-generating indicator */}
              {isSubmitting && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 px-4 py-3 rounded-xl bg-[#E94560]/10 border border-[#E94560]/20 text-center"
                >
                  <span className="flex items-center justify-center gap-2 text-[#E94560]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Creating your manga...
                  </span>
                </motion.div>
              )}

              {/* Prompt textarea */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="relative"
              >
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A young hacker discovers that the city's AI defense system is actually sentient and has been protecting a secret for 50 years..."
                  className="w-full min-h-[180px] p-6 rounded-2xl bg-white/[0.03] border border-white/10 text-white text-lg placeholder:text-white/20 focus:outline-none focus:border-[#E94560]/40 focus:ring-1 focus:ring-[#E94560]/20 resize-none transition-all"
                  maxLength={5000}
                />
                <div className="absolute bottom-3 right-4 text-white/20 text-xs">
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
                        ? "bg-[#E94560] text-white shadow-lg shadow-[#E94560]/25"
                        : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </motion.div>

              {/* Two-path buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {/* Generate Now */}
                <button
                  onClick={handleQuickGenerate}
                  disabled={!canProceed || isSubmitting}
                  className="py-4 px-6 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none relative overflow-hidden group"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Zap className="w-5 h-5" />
                      Generate Now
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                </button>

                {/* Customize First */}
                <button
                  onClick={handleStartCustomize}
                  disabled={!canProceed || isSubmitting}
                  className="py-4 px-6 rounded-xl bg-white/[0.05] border border-white/15 text-white font-semibold text-lg hover:bg-white/[0.08] hover:border-white/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed group"
                >
                  <span className="flex items-center justify-center gap-2">
                    <Palette className="w-5 h-5 text-[#6C63FF]" />
                    Customize First
                    <ChevronRight className="w-4 h-4 text-white/40 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </button>
              </motion.div>

              {canProceed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center text-white/25 text-xs mt-3"
                >
                  "Generate Now" uses smart defaults. "Customize First" lets you pick art style, tone, and more.
                </motion.p>
              )}

              {prompt.trim().length > 0 && prompt.trim().length < 10 && (
                <p className="text-[#E94560]/60 text-sm mt-3 text-center">
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
                <p className="text-white/30 text-sm mb-3">Need inspiration? Try one of these:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {[
                    "A samurai who can see 10 seconds into the future must protect a blind oracle",
                    "In a world where dreams are currency, a broke teenager discovers she can forge them",
                    "Two rival chefs compete in a cooking tournament where the dishes come alive",
                  ].map((idea, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(idea)}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-white/30 text-xs hover:text-white/60 hover:bg-white/[0.06] hover:border-white/10 transition-all text-left max-w-[280px] truncate"
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-8 flex justify-center gap-8 text-center"
              >
                {[
                  { label: "Manga Created", value: "12K+" },
                  { label: "Panels Generated", value: "180K+" },
                  { label: "Active Creators", value: "3.2K" },
                ].map((stat) => (
                  <div key={stat.label}>
                    <div className="text-white/80 font-semibold text-lg">{stat.value}</div>
                    <div className="text-white/30 text-xs">{stat.label}</div>
                  </div>
                ))}
              </motion.div>
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
              {/* Step header */}
              <div className="text-center mb-6">
                <h2 className="text-2xl md:text-3xl font-bold text-white">
                  {STEP_TITLES[customizeStep].title}
                </h2>
                <p className="text-white/40 mt-1">
                  {STEP_TITLES[customizeStep].subtitle}
                </p>
              </div>

              {/* Prompt preview pill */}
              <div className="mb-6 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-start gap-3">
                <BookOpen className="w-4 h-4 text-[#E94560] mt-0.5 shrink-0" />
                <p className="text-white/50 text-sm line-clamp-2">{prompt}</p>
              </div>

              {/* Step content */}
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

              {/* Navigation buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleBack}
                  className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 font-medium hover:bg-white/10 hover:text-white transition-all"
                >
                  <ArrowLeft className="w-4 h-4 inline mr-1.5" />
                  Back
                </button>

                {customizeStep < 3 ? (
                  <button
                    onClick={handleNext}
                    className="flex-1 py-3 rounded-xl bg-white/10 border border-white/15 text-white font-semibold hover:bg-white/15 transition-all"
                  >
                    Next Step
                    <ArrowRight className="w-4 h-4 inline ml-1.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleCustomGenerate}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all disabled:opacity-40 relative overflow-hidden group"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Creating your manga...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <Wand2 className="w-5 h-5" />
                        Generate My Manga
                      </span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            onClick={() => setShowAuthModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#12121A] border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#E94560]/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-7 h-7 text-[#E94560]" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Sign in to create</h2>
                <p className="text-white/50 mb-6">
                  Create a free account to generate your manga and save your stories.
                </p>
                <a
                  href={loginUrl}
                  className="block w-full py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-lg shadow-lg shadow-[#E94560]/25 hover:shadow-[#E94560]/40 transition-all text-center"
                >
                  <Zap className="inline w-5 h-5 mr-2" />
                  Sign Up Free
                </a>
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="mt-3 text-white/40 hover:text-white/60 text-sm transition"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
