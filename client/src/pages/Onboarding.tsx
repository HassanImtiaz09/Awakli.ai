import { useAuth } from "@/_core/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Sparkles, Palette, Film, Users, ArrowRight, ArrowLeft,
  Check, Wand2, Mic, Layers
} from "lucide-react";

const STEPS = [
  {
    title: "Welcome to Awakli",
    subtitle: "Let's set up your creative workspace in 3 quick steps.",
    icon: Sparkles,
    color: "#E94560",
  },
  {
    title: "Choose Your Style",
    subtitle: "What kind of anime do you want to create?",
    icon: Palette,
    color: "#8B5CF6",
    options: [
      { label: "Shonen", desc: "Action-packed, vibrant colors", emoji: "⚔️" },
      { label: "Seinen", desc: "Mature, detailed artwork", emoji: "🎭" },
      { label: "Cyberpunk", desc: "Neon-lit, futuristic", emoji: "🌆" },
      { label: "Watercolor", desc: "Soft, painterly feel", emoji: "🎨" },
      { label: "Noir", desc: "Dark, high-contrast", emoji: "🌑" },
      { label: "Chibi", desc: "Cute, super-deformed", emoji: "✨" },
    ],
  },
  {
    title: "Your First Project",
    subtitle: "How would you like to start?",
    icon: Film,
    color: "#00D4FF",
    options: [
      { label: "Upload Manga", desc: "Transform existing manga panels", emoji: "📄" },
      { label: "AI Script", desc: "Generate a script from scratch", emoji: "🤖" },
      { label: "Explore First", desc: "Browse community creations", emoji: "🔍" },
    ],
  },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const handleSelect = (label: string) => {
    setSelections((prev) => ({ ...prev, [step]: label }));
  };

  const handleNext = () => {
    if (isLast) {
      // Navigate based on selection
      const choice = selections[2];
      if (choice === "Upload Manga") navigate("/studio/upload");
      else if (choice === "AI Script") navigate("/studio/new");
      else navigate("/discover");
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return (
    <div className="min-h-screen bg-[#08080F] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-accent-pink/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-accent-cyan/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-2xl"
      >
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full overflow-hidden bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: i <= step ? "100%" : "0%" }}
                transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-gradient-to-r from-[#E94560] to-[#00D4FF]"
              />
            </div>
          ))}
        </div>

        {/* Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl border border-white/5 bg-[#0D0D1A] p-8 md:p-12"
          >
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ backgroundColor: `${current.color}15`, color: current.color }}
            >
              <Icon className="w-8 h-8" />
            </div>

            <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
              {current.title}
            </h1>
            <p className="text-gray-400 text-lg mb-8">{current.subtitle}</p>

            {/* Options grid */}
            {current.options && (
              <div className={`grid gap-3 mb-8 ${current.options.length > 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1"}`}>
                {current.options.map((opt) => (
                  <motion.button
                    key={opt.label}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect(opt.label)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selections[step] === opt.label
                        ? "border-accent-pink/50 bg-accent-pink/10"
                        : "border-white/5 bg-white/[0.02] hover:border-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </div>
                      {selections[step] === opt.label && (
                        <Check className="w-4 h-4 text-accent-pink ml-auto mt-1" />
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* Welcome step content */}
            {step === 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { icon: Wand2, label: "AI Scripts" },
                  { icon: Palette, label: "10+ Styles" },
                  { icon: Mic, label: "Voice Clone" },
                  { icon: Layers, label: "Storyboards" },
                ].map((f) => (
                  <div key={f.label} className="p-3 rounded-lg border border-white/5 bg-white/[0.02] text-center">
                    <f.icon className="w-5 h-5 text-accent-pink mx-auto mb-2" />
                    <p className="text-xs text-gray-400">{f.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between">
              {step > 0 ? (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBack}
                  className="px-5 py-2.5 rounded-xl border border-white/10 text-gray-400 text-sm font-medium hover:text-white hover:bg-white/5 transition-all"
                >
                  <ArrowLeft className="inline mr-2 w-4 h-4" />
                  Back
                </motion.button>
              ) : (
                <div />
              )}

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleNext}
                disabled={current.options && !selections[step]}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#E94560] to-[#FF6B81] text-white font-semibold text-sm shadow-lg shadow-accent-pink/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {isLast ? "Let's Go!" : "Continue"}
                <ArrowRight className="inline ml-2 w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Skip */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate("/studio")}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            Skip onboarding
          </button>
        </div>
      </motion.div>
    </div>
  );
}
