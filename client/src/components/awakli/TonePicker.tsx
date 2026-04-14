import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { TONE_IMAGES, TONE_INFO, type ToneKey } from "../../../../shared/style-images";

interface TonePickerProps {
  value: ToneKey;
  onChange: (tone: ToneKey) => void;
}

const TONES_ORDER: ToneKey[] = ["epic", "fun", "dark", "romantic", "mystery", "comedy"];

export default function TonePicker({ value, onChange }: TonePickerProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {TONES_ORDER.map((toneKey, i) => {
        const info = TONE_INFO[toneKey];
        const imageUrl = TONE_IMAGES[toneKey];
        const isSelected = value === toneKey;

        return (
          <motion.button
            key={toneKey}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            onClick={() => onChange(toneKey)}
            className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
              isSelected
                ? "border-[#6C63FF] shadow-lg shadow-[#6C63FF]/20 scale-[1.02]"
                : "border-white/10 hover:border-white/25 hover:scale-[1.01]"
            }`}
          >
            <div className="aspect-[4/3] relative">
              <img
                src={imageUrl}
                alt={info.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#6C63FF] flex items-center justify-center shadow-lg"
                >
                  <Check className="w-4 h-4 text-white" />
                </motion.div>
              )}

              <div className="absolute bottom-0 left-0 right-0 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{info.emoji}</span>
                  <span className="text-white font-semibold text-sm">{info.name}</span>
                </div>
                <div className="text-white/50 text-[10px] leading-tight mt-0.5">
                  {info.description}
                </div>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
