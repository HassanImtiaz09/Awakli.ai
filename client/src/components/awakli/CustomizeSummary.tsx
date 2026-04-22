import { motion } from "framer-motion";
import { Palette, Drama, BookOpen, Sparkles } from "lucide-react";
import { STYLE_INFO, TONE_INFO, type StyleKey, type ToneKey } from "../../../../shared/style-images";

interface CustomizeSummaryProps {
  style: StyleKey;
  tone: ToneKey;
  chapters: number;
  chapterLength: string;
  pacingStyle: string;
  endingStyle: string;
  genre: string;
}

export default function CustomizeSummary({
  style, tone, chapters, chapterLength, pacingStyle, endingStyle, genre,
}: CustomizeSummaryProps) {
  const styleInfo = STYLE_INFO[style];
  const toneInfo = TONE_INFO[tone];

  const items = [
    { icon: Palette, label: "Art Style", value: styleInfo.name, color: "#7C4DFF" },
    { icon: Drama, label: "Tone", value: `${toneInfo.emoji} ${toneInfo.name}`, color: "#6C63FF" },
    { icon: BookOpen, label: "Chapters", value: `${chapters} × ${chapterLength}`, color: "#00D4AA" },
    { icon: Sparkles, label: "Genre", value: genre, color: "#B388FF" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl bg-white/[0.03] border border-white/10 p-5"
    >
      <h3 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-4">
        Your Manga Settings
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.02]"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${item.color}15` }}
              >
                <Icon className="w-4 h-4" style={{ color: item.color }} />
              </div>
              <div>
                <div className="text-white/40 text-[10px] uppercase tracking-wider">{item.label}</div>
                <div className="text-white text-sm font-medium">{item.value}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Additional details */}
      <div className="mt-3 flex gap-2 flex-wrap">
        <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px]">
          Pacing: {pacingStyle.replace("_", " ")}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px]">
          Endings: {endingStyle}
        </span>
      </div>
    </motion.div>
  );
}
