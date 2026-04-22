import { motion } from "framer-motion";
import { BookOpen, Zap, MessageSquare, Scale, Swords, Heart, ArrowRight } from "lucide-react";

interface ChapterPrefsProps {
  chapters: number;
  onChaptersChange: (n: number) => void;
  chapterLength: "short" | "standard" | "long";
  onChapterLengthChange: (v: "short" | "standard" | "long") => void;
  pacingStyle: "action_heavy" | "dialogue_heavy" | "balanced";
  onPacingStyleChange: (v: "action_heavy" | "dialogue_heavy" | "balanced") => void;
  endingStyle: "cliffhanger" | "resolution" | "serialized";
  onEndingStyleChange: (v: "cliffhanger" | "resolution" | "serialized") => void;
}

const LENGTH_OPTIONS = [
  { key: "short" as const, label: "Short", desc: "8-12 pages per chapter", icon: Zap },
  { key: "standard" as const, label: "Standard", desc: "12-20 pages, weekly manga", icon: BookOpen },
  { key: "long" as const, label: "Long", desc: "20-32 pages, monthly manga", icon: BookOpen },
];

const PACING_OPTIONS = [
  { key: "action_heavy" as const, label: "Action-Heavy", desc: "Fast cuts, dynamic panels", icon: Swords, color: "#7C4DFF" },
  { key: "balanced" as const, label: "Balanced", desc: "Mix of action & dialogue", icon: Scale, color: "#6C63FF" },
  { key: "dialogue_heavy" as const, label: "Dialogue-Heavy", desc: "Character-driven scenes", icon: MessageSquare, color: "#00D4AA" },
];

const ENDING_OPTIONS = [
  { key: "cliffhanger" as const, label: "Cliffhanger", desc: "End on suspense, keep readers hooked" },
  { key: "resolution" as const, label: "Resolution", desc: "Wrap up each chapter neatly" },
  { key: "serialized" as const, label: "Serialized", desc: "Continuous flow between chapters" },
];

export default function ChapterPrefs({
  chapters, onChaptersChange,
  chapterLength, onChapterLengthChange,
  pacingStyle, onPacingStyleChange,
  endingStyle, onEndingStyleChange,
}: ChapterPrefsProps) {
  return (
    <div className="space-y-6">
      {/* Chapter count slider */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 block">
          How many chapters?
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={12}
            value={chapters}
            onChange={(e) => onChaptersChange(parseInt(e.target.value))}
            className="flex-1 h-2 rounded-full appearance-none bg-white/10 accent-[#7C4DFF] cursor-pointer"
          />
          <div className="w-12 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white font-bold text-lg">
            {chapters}
          </div>
        </div>
        <div className="flex justify-between text-white/20 text-xs mt-1 px-1">
          <span>1 chapter</span>
          <span>12 chapters</span>
        </div>
      </motion.div>

      {/* Chapter length */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 block">
          Chapter Length
        </label>
        <div className="flex gap-2">
          {LENGTH_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onChapterLengthChange(opt.key)}
              className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                chapterLength === opt.key
                  ? "bg-[#7C4DFF]/10 border-[#7C4DFF]/40 text-white"
                  : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/[0.05]"
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs opacity-60 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Pacing style */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 block">
          Pacing Style
        </label>
        <div className="flex gap-2">
          {PACING_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                onClick={() => onPacingStyleChange(opt.key)}
                className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                  pacingStyle === opt.key
                    ? `bg-[${opt.color}]/10 border-[${opt.color}]/40 text-white`
                    : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/[0.05]"
                }`}
                style={pacingStyle === opt.key ? { backgroundColor: `${opt.color}15`, borderColor: `${opt.color}66` } : {}}
              >
                <Icon className="w-4 h-4 mb-1" style={pacingStyle === opt.key ? { color: opt.color } : {}} />
                <div className="text-sm font-medium">{opt.label}</div>
                <div className="text-xs opacity-60 mt-0.5">{opt.desc}</div>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Ending style */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <label className="text-white/50 text-xs font-medium uppercase tracking-wider mb-3 block">
          Chapter Endings
        </label>
        <div className="flex gap-2">
          {ENDING_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onEndingStyleChange(opt.key)}
              className={`flex-1 p-3 rounded-lg border text-left transition-all ${
                endingStyle === opt.key
                  ? "bg-[#00D4AA]/10 border-[#00D4AA]/40 text-white"
                  : "bg-white/[0.02] border-white/10 text-white/50 hover:bg-white/[0.05]"
              }`}
            >
              <div className="text-sm font-medium">{opt.label}</div>
              <div className="text-xs opacity-60 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
