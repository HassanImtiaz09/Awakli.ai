/**
 * CharacterChip — Small pill showing a character name.
 *
 * Click opens a character-sheet drawer (slide-in from right) showing:
 * - Character initial avatar with deterministic color
 * - Character name (editable via parent callback)
 * - Scene appearances count
 * - Quick actions: Rename globally, View in characters page
 *
 * If no onDrawerOpen prop is provided, falls back to onClick (rename).
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Edit3, Users, Hash } from "lucide-react";

interface CharacterChipProps {
  name: string;
  onClick?: () => void;
  size?: "sm" | "md";
  /** Number of scenes this character appears in */
  sceneCount?: number;
  /** Dialogue line count for this character */
  dialogueCount?: number;
}

// Deterministic color palette for character chips
const CHIP_COLORS = [
  { bg: "bg-token-violet/10", text: "text-token-violet", border: "border-token-violet/20", ring: "ring-token-violet/30" },
  { bg: "bg-token-cyan/10", text: "text-token-cyan", border: "border-token-cyan/20", ring: "ring-token-cyan/30" },
  { bg: "bg-token-magenta/10", text: "text-token-magenta", border: "border-token-magenta/20", ring: "ring-token-magenta/30" },
  { bg: "bg-emerald-400/10", text: "text-emerald-400", border: "border-emerald-400/20", ring: "ring-emerald-400/30" },
  { bg: "bg-amber-400/10", text: "text-amber-400", border: "border-amber-400/20", ring: "ring-amber-400/30" },
  { bg: "bg-rose-400/10", text: "text-rose-400", border: "border-rose-400/20", ring: "ring-rose-400/30" },
  { bg: "bg-sky-400/10", text: "text-sky-400", border: "border-sky-400/20", ring: "ring-sky-400/30" },
  { bg: "bg-lime-400/10", text: "text-lime-400", border: "border-lime-400/20", ring: "ring-lime-400/30" },
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function CharacterChip({
  name,
  onClick,
  size = "sm",
  sceneCount,
  dialogueCount,
}: CharacterChipProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const color = CHIP_COLORS[hashName(name) % CHIP_COLORS.length];
  const initial = name.charAt(0).toUpperCase();

  const sizeClasses =
    size === "sm" ? "text-[10px] px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";

  const avatarSize =
    size === "sm" ? "w-3.5 h-3.5 text-[8px]" : "w-4.5 h-4.5 text-[10px]";

  const handleChipClick = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleRename = useCallback(() => {
    setDrawerOpen(false);
    onClick?.();
  }, [onClick]);

  return (
    <>
      <button
        onClick={handleChipClick}
        data-component="character-chip"
        data-character-name={name}
        className={`inline-flex items-center rounded-full border ${color.bg} ${color.text} ${color.border} ${sizeClasses} font-medium transition-all hover:opacity-80 active:scale-95`}
        title={`View "${name}" details`}
      >
        <span
          className={`${avatarSize} rounded-full ${color.bg} grid place-items-center font-bold flex-shrink-0`}
        >
          {initial}
        </span>
        {name}
      </button>

      {/* Character Sheet Drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50"
              onClick={() => setDrawerOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              data-component="character-drawer"
              className="fixed right-0 top-0 bottom-0 w-80 bg-[#12121F] border-l border-white/10 z-50 flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <span className="text-xs font-semibold text-white/70">
                  Character Sheet
                </span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-white/20 hover:text-white/50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
                {/* Avatar + Name */}
                <div className="flex flex-col items-center text-center">
                  <div
                    className={`w-16 h-16 rounded-2xl ${color.bg} grid place-items-center text-2xl font-bold ${color.text} mb-3 ring-2 ${color.ring}`}
                  >
                    {initial}
                  </div>
                  <h3 className="text-lg font-semibold text-white/90">{name}</h3>
                  <p className="text-[10px] text-white/30 mt-1 uppercase tracking-wider">
                    Character
                  </p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  {sceneCount !== undefined && (
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 text-center">
                      <div className="flex items-center justify-center gap-1 text-white/30 mb-1">
                        <Hash className="w-3 h-3" />
                        <span className="text-[10px] uppercase tracking-wider">Scenes</span>
                      </div>
                      <span className="text-lg font-bold text-white/70">{sceneCount}</span>
                    </div>
                  )}
                  {dialogueCount !== undefined && (
                    <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 text-center">
                      <div className="flex items-center justify-center gap-1 text-white/30 mb-1">
                        <Users className="w-3 h-3" />
                        <span className="text-[10px] uppercase tracking-wider">Lines</span>
                      </div>
                      <span className="text-lg font-bold text-white/70">{dialogueCount}</span>
                    </div>
                  )}
                </div>

                {/* Color indicator */}
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2">
                    Assigned Color
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-lg ${color.bg} border ${color.border}`} />
                    <span className={`text-xs ${color.text}`}>
                      Deterministic — based on name hash
                    </span>
                  </div>
                </div>
              </div>

              {/* Drawer footer */}
              <div className="px-5 py-4 border-t border-white/5 space-y-2">
                <button
                  onClick={handleRename}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-token-violet/10 text-token-violet hover:bg-token-violet/20 text-xs font-medium transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Rename globally
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
