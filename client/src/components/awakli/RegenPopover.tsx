/**
 * RegenPopover — Floating popover for regenerating a scene with optional instructions.
 *
 * Features:
 * - Scope toggle: scene / beat / dialogue
 * - Tone slider: 5-level intensity
 * - Credit-cost preview that adjusts by scope
 * - Quick regen button (no instructions)
 * - Text input for custom regen instructions
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, Loader2, X, Zap } from "lucide-react";

type RegenScope = "scene" | "beat" | "dialogue";

const SCOPE_OPTIONS: { value: RegenScope; label: string; desc: string }[] = [
  { value: "scene", label: "Full scene", desc: "Rewrite entire scene" },
  { value: "beat", label: "Beat only", desc: "Adjust pacing & beats" },
  { value: "dialogue", label: "Dialogue", desc: "Rewrite lines only" },
];

const TONE_LABELS = ["Subtle", "Mild", "Moderate", "Strong", "Dramatic"];

const SCOPE_CREDIT_MULTIPLIER: Record<RegenScope, number> = {
  scene: 1,
  beat: 0.6,
  dialogue: 0.3,
};

interface RegenPopoverProps {
  open: boolean;
  onClose: () => void;
  onRegenerate: (instruction?: string) => void;
  regenerating: boolean;
  sceneName?: string;
  creditCost?: number;
}

export function RegenPopover({
  open,
  onClose,
  onRegenerate,
  regenerating,
  sceneName = "this scene",
  creditCost = 3,
}: RegenPopoverProps) {
  const [instruction, setInstruction] = useState("");
  const [scope, setScope] = useState<RegenScope>("scene");
  const [toneLevel, setToneLevel] = useState(2); // 0-4 index
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) {
      setInstruction("");
      setScope("scene");
      setToneLevel(2);
    }
  }, [open]);

  const adjustedCost = Math.max(
    1,
    Math.round(creditCost * SCOPE_CREDIT_MULTIPLIER[scope])
  );

  const handleSubmit = () => {
    const prefix = scope !== "scene" ? `[scope:${scope}][tone:${TONE_LABELS[toneLevel].toLowerCase()}] ` : "";
    onRegenerate((prefix + instruction).trim() || undefined);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Popover */}
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            data-component="regen-popover"
            className="absolute right-0 top-full mt-2 z-50 w-[340px] rounded-2xl bg-[#12121F] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-token-violet" />
                <span className="text-xs font-semibold text-white/70">
                  Regenerate {sceneName}
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-white/20 hover:text-white/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
              {/* Scope toggle */}
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">
                  Scope
                </div>
                <div className="flex gap-1">
                  {SCOPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setScope(opt.value)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${
                        scope === opt.value
                          ? "bg-token-violet/10 text-token-violet border-token-violet/30"
                          : "bg-white/[0.02] text-white/40 border-white/5 hover:border-white/10"
                      }`}
                      title={opt.desc}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">
                    Tone intensity
                  </span>
                  <span className="text-[10px] text-token-gold font-medium">
                    {TONE_LABELS[toneLevel]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  value={toneLevel}
                  onChange={(e) => setToneLevel(parseInt(e.target.value, 10))}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-token-violet [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-token-violet"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-[8px] text-white/15">Subtle</span>
                  <span className="text-[8px] text-white/15">Dramatic</span>
                </div>
              </div>

              {/* Credit cost preview */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.02] border border-white/5">
                <span className="text-[10px] text-white/40">Estimated cost</span>
                <span className="text-xs font-semibold text-token-gold flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {adjustedCost} credit{adjustedCost !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Quick regen */}
              <button
                onClick={() => onRegenerate(undefined)}
                disabled={regenerating}
                className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all group disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-token-gold group-hover:text-token-gold/80" />
                  <span className="text-xs text-white/60 group-hover:text-white/80">
                    Quick regenerate
                  </span>
                </div>
                <span className="text-[10px] text-white/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" />
                  {adjustedCost} cr
                </span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] text-white/20">or add direction</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>

              {/* Instruction input */}
              <textarea
                ref={inputRef}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="E.g., 'Make it more dramatic', 'Add a plot twist', 'Change the mood to mysterious'..."
                rows={3}
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/70 placeholder:text-white/15 resize-none outline-none focus:ring-1 focus:ring-token-violet/50 transition-all leading-relaxed"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && instruction.trim()) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={regenerating || !instruction.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-token-violet/10 text-token-violet hover:bg-token-violet/20 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {regenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Regenerate with direction
                    <span className="text-white/30 ml-1">({adjustedCost} cr)</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
