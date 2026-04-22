/**
 * RegenPopover — Floating popover for regenerating a scene with optional instructions.
 *
 * Triggered from SceneCard or SceneDetailPanel, shows:
 * - Quick regen button (no instructions, 3 credits)
 * - Text input for custom regen instructions
 * - Submit button with loading state
 *
 * Anchored to the trigger element via a portal-free absolute positioning approach.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, Loader2, X, Zap } from "lucide-react";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) setInstruction("");
  }, [open]);

  const handleSubmit = () => {
    onRegenerate(instruction.trim() || undefined);
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
            className="absolute right-0 top-full mt-2 z-50 w-80 rounded-2xl bg-[#12121F] border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
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
                  {creditCost} cr
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
                    <span className="text-white/30 ml-1">({creditCost} cr)</span>
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
