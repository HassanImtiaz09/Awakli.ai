import { useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { STYLE_IMAGES, STYLE_INFO, type StyleKey } from "../../../../shared/style-images";

interface StylePickerProps {
  value: StyleKey;
  onChange: (style: StyleKey) => void;
  gender: "male" | "female";
  onGenderChange: (gender: "male" | "female") => void;
}

const STYLES_ORDER: StyleKey[] = [
  "shonen", "seinen", "shoujo", "chibi",
  "cyberpunk", "watercolor", "noir", "realistic",
];

export default function StylePicker({ value, onChange, gender, onGenderChange }: StylePickerProps) {
  return (
    <div className="space-y-5">
      {/* Gender toggle for preview images */}
      <div className="flex items-center justify-center gap-2">
        <span className="text-white/40 text-sm mr-2">Preview as:</span>
        {(["male", "female"] as const).map((g) => (
          <button
            key={g}
            onClick={() => onGenderChange(g)}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${
              gender === g
                ? "bg-white/15 text-white border border-white/20"
                : "bg-white/5 text-white/40 border border-transparent hover:bg-white/10"
            }`}
          >
            {g === "male" ? "Male Character" : "Female Character"}
          </button>
        ))}
      </div>

      {/* Style grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STYLES_ORDER.map((styleKey, i) => {
          const info = STYLE_INFO[styleKey];
          const imageUrl = STYLE_IMAGES[gender][styleKey];
          const isSelected = value === styleKey;

          return (
            <motion.button
              key={styleKey}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => onChange(styleKey)}
              className={`relative group rounded-xl overflow-hidden border-2 transition-all ${
                isSelected
                  ? "border-[#E94560] shadow-lg shadow-[#E94560]/20 scale-[1.02]"
                  : "border-white/10 hover:border-white/25 hover:scale-[1.01]"
              }`}
            >
              {/* Image */}
              <div className="aspect-[2/3] relative">
                <img
                  src={imageUrl}
                  alt={info.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                {/* Selected check */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#E94560] flex items-center justify-center shadow-lg"
                  >
                    <Check className="w-4 h-4 text-white" />
                  </motion.div>
                )}

                {/* Label */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="text-white font-semibold text-sm">{info.name}</div>
                  <div className="text-white/50 text-[10px] leading-tight mt-0.5 line-clamp-2">
                    {info.description}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
