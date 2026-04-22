/**
 * IdeaPrompt — Magical-frame textarea with conic-gradient border,
 * 4 corner sigils, and shimmer-on-focus animation.
 *
 * States:
 *  - Empty: placeholder visible, sigils at 40% opacity
 *  - Focused: sigils bloom to 100%, conic border gradient animates once
 *  - Valid: character count >= 40, counter turns mint
 *  - Invalid: < 40 chars, counter stays default
 *  - Over-cap: > 2000 chars, counter turns magenta, soft block
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Corner Sigil SVG ───────────────────────────────────────────────────────
function Sigil({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 2L18.5 13.5L30 16L18.5 18.5L16 30L13.5 18.5L2 16L13.5 13.5L16 2Z"
        fill="url(#sigil-grad)"
        fillOpacity="0.7"
      />
      <circle cx="16" cy="16" r="3" fill="url(#sigil-grad)" fillOpacity="0.5" />
      <defs>
        <linearGradient id="sigil-grad" x1="2" y1="2" x2="30" y2="30">
          <stop stopColor="#E040FB" />
          <stop offset="0.5" stopColor="#7C4DFF" />
          <stop offset="1" stopColor="#FF2D7A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface IdeaPromptProps {
  value: string;
  onChange: (value: string) => void;
  minChars?: number;
  maxChars?: number;
  placeholder?: string;
}

export default function IdeaPrompt({
  value,
  onChange,
  minChars = 40,
  maxChars = 2000,
  placeholder = "A rain-soaked rooftop. Two rivals. One city. Go\u2026",
}: IdeaPromptProps) {
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = value.length;
  const isValid = charCount >= minChars;
  const isOverCap = charCount > maxChars;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Counter color logic
  const counterColor = isOverCap
    ? "text-token-magenta"
    : isValid
      ? "text-token-mint/70"
      : "text-white/30";

  return (
    <div className="relative max-w-3xl mx-auto">
      {/* ─── Conic Gradient Border Frame ─────────────────────────────── */}
      <div
        className={`relative p-[2px] rounded-[36px] transition-all duration-500 ${
          focused
            ? "shadow-[0_0_40px_rgba(124,77,255,0.2),0_0_80px_rgba(224,64,251,0.1)]"
            : ""
        }`}
        style={{
          background: focused
            ? "conic-gradient(from 220deg, #E040FB, #7C4DFF, #FF2D7A, #E040FB)"
            : "conic-gradient(from 220deg, rgba(224,64,251,0.3), rgba(124,77,255,0.3), rgba(255,45,122,0.3), rgba(224,64,251,0.3))",
        }}
      >
        {/* ─── Shimmer Overlay (on focus) ──────────────────────────── */}
        <AnimatePresence>
          {focused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 rounded-[36px] overflow-hidden pointer-events-none"
            >
              <motion.div
                initial={{ rotate: 0 }}
                animate={{ rotate: 360 }}
                transition={{ duration: 4, ease: "linear", repeat: Infinity }}
                className="absolute inset-[-50%] origin-center"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0%, rgba(224,64,251,0.15) 10%, transparent 20%, rgba(124,77,255,0.15) 40%, transparent 50%, rgba(255,45,122,0.1) 70%, transparent 80%)",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Inner Card ──────────────────────────────────────────── */}
        <div className="relative rounded-[34px] bg-[#0D0D1A] px-8 py-7">
          {/* ─── Corner Sigils ──────────────────────────────────────── */}
          <Sigil
            className={`absolute top-3 left-3 h-8 w-8 transition-opacity duration-300 ${
              focused ? "opacity-100" : "opacity-40"
            }`}
          />
          <Sigil
            className={`absolute top-3 right-3 h-8 w-8 transition-opacity duration-300 rotate-90 ${
              focused ? "opacity-100" : "opacity-40"
            }`}
          />
          <Sigil
            className={`absolute bottom-3 left-3 h-8 w-8 transition-opacity duration-300 -rotate-90 ${
              focused ? "opacity-100" : "opacity-40"
            }`}
          />
          <Sigil
            className={`absolute bottom-3 right-3 h-8 w-8 transition-opacity duration-300 rotate-180 ${
              focused ? "opacity-100" : "opacity-40"
            }`}
          />

          {/* ─── Textarea ──────────────────────────────────────────── */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            rows={6}
            className="w-full bg-transparent text-white/90 placeholder:text-white/20 resize-none outline-none text-base leading-relaxed"
            aria-label="Story idea"
            aria-describedby="idea-char-count"
          />

          {/* ─── Character Counter ─────────────────────────────────── */}
          <div
            id="idea-char-count"
            className="flex items-center justify-between mt-2 pt-3 border-t border-white/5"
          >
            <div className={`text-xs font-medium tabular-nums ${counterColor}`}>
              {charCount} / {maxChars}
            </div>
            <div className="text-xs text-white/20">
              {!isValid && charCount > 0 && (
                <span className="text-white/30">
                  {minChars - charCount} more to go
                </span>
              )}
              {isValid && !isOverCap && (
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-token-mint/50"
                >
                  Ready to summon
                </motion.span>
              )}
              {isOverCap && (
                <span className="text-token-magenta/70">
                  Over the limit — trim a bit
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
