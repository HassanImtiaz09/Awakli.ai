/**
 * CharacterBakery — Per-character style preset selection (Mangaka variant).
 *
 * 12 pre-baked style presets. No custom LoRA.
 * Shows "Train a LoRA" tier-locked affordance for Studio upgrade.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Sparkles, Lock } from "lucide-react";
import { useUpgradeModal } from "@/store/upgradeModal";

// ─── 12 Pre-baked style presets ────────────────────────────────────────
export interface StylePreset {
  key: string;
  label: string;
  description: string;
  colorAccent: string; // Tailwind bg class for the swatch
}

export const STYLE_PRESETS: StylePreset[] = [
  { key: "classic_anime", label: "Classic Anime", description: "Clean lines, vibrant colors", colorAccent: "bg-blue-500" },
  { key: "cel_shaded", label: "Cel Shaded", description: "Bold outlines, flat colors", colorAccent: "bg-indigo-500" },
  { key: "watercolor", label: "Watercolor", description: "Soft edges, painterly feel", colorAccent: "bg-teal-400" },
  { key: "noir", label: "Noir", description: "High contrast, dramatic shadows", colorAccent: "bg-gray-600" },
  { key: "pastel", label: "Pastel", description: "Soft, dreamy palette", colorAccent: "bg-pink-300" },
  { key: "cyberpunk", label: "Cyberpunk", description: "Neon glow, dark backgrounds", colorAccent: "bg-cyan-400" },
  { key: "ghibli", label: "Ghibli", description: "Warm, detailed, natural", colorAccent: "bg-green-500" },
  { key: "shonen", label: "Shonen", description: "Dynamic, energetic, bold", colorAccent: "bg-orange-500" },
  { key: "seinen", label: "Seinen", description: "Mature, realistic detail", colorAccent: "bg-slate-500" },
  { key: "chibi", label: "Chibi", description: "Cute, exaggerated proportions", colorAccent: "bg-yellow-400" },
  { key: "ukiyo_e", label: "Ukiyo-e", description: "Traditional woodblock style", colorAccent: "bg-red-600" },
  { key: "sketch", label: "Sketch", description: "Pencil-drawn, raw energy", colorAccent: "bg-stone-400" },
];

// ─── Character type ────────────────────────────────────────────────────
export interface CharacterForBakery {
  id: number;
  name: string;
  role: string;
  referenceImageUrl?: string | null;
}

interface CharacterBakeryProps {
  characters: CharacterForBakery[];
  selections: Record<number, string>; // characterId → presetKey
  onSelect: (characterId: number, presetKey: string) => void;
  currentTier: string;
}

export function CharacterBakery({
  characters,
  selections,
  onSelect,
  currentTier,
}: CharacterBakeryProps) {
  const { openFromGate } = useUpgradeModal();
  const [expandedChar, setExpandedChar] = useState<number | null>(
    characters[0]?.id ?? null
  );

  const handleTrainLoRA = () => {
    // stage5_lora_gate
    openFromGate({
      currentTier,
      required: "studio",
      requiredDisplayName: "Studio",
      upgradeSku: "studio",
      ctaText: "Upgrade to Studio for custom LoRA training",
      pricingUrl: "/pricing",
    });
  };

  return (
    <div className="space-y-4">
      {characters.map((char) => {
        const isExpanded = expandedChar === char.id;
        const selectedPreset = selections[char.id];

        return (
          <div
            key={char.id}
            className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden"
          >
            {/* Character header row */}
            <button
              onClick={() => setExpandedChar(isExpanded ? null : char.id)}
              className="w-full grid grid-cols-[120px_1fr_200px] gap-5 p-4 items-center text-left hover:bg-white/[0.02] transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-[120px] h-[120px] rounded-lg bg-white/5 overflow-hidden flex-shrink-0">
                {char.referenceImageUrl ? (
                  <img
                    src={char.referenceImageUrl}
                    alt={char.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20 text-2xl font-bold">
                    {char.name.charAt(0)}
                  </div>
                )}
              </div>

              {/* Name + role */}
              <div>
                <h4 className="text-sm font-semibold text-white/90">
                  {char.name}
                </h4>
                <p className="text-xs text-white/40 capitalize">{char.role}</p>
              </div>

              {/* Selected preset badge */}
              <div className="text-right">
                {selectedPreset ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#00E5A0]/10 text-[#00E5A0] text-xs font-medium">
                    <Check className="w-3 h-3" />
                    {STYLE_PRESETS.find((p) => p.key === selectedPreset)?.label}
                  </span>
                ) : (
                  <span className="text-xs text-white/30">Choose a style</span>
                )}
              </div>
            </button>

            {/* Expanded preset grid */}
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-4 pb-4"
              >
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
                  {STYLE_PRESETS.map((preset) => {
                    const isSelected = selectedPreset === preset.key;
                    return (
                      <button
                        key={preset.key}
                        onClick={() => onSelect(char.id, preset.key)}
                        className={`relative p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? "border-violet-500/40 bg-violet-500/[0.08] ring-1 ring-violet-500/20"
                            : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                        }`}
                      >
                        {/* Color swatch */}
                        <div
                          className={`w-8 h-8 rounded-md ${preset.colorAccent} mb-2`}
                        />
                        <p className="text-xs font-medium text-white/80">
                          {preset.label}
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {preset.description}
                        </p>

                        {isSelected && (
                          <motion.div
                            layoutId={`check-${char.id}`}
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tier-locked LoRA affordance */}
                <button
                  onClick={handleTrainLoRA}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-dashed border-white/[0.08] text-white/30 hover:text-white/50 hover:border-white/15 transition-colors text-xs"
                >
                  <Lock className="w-3 h-3" />
                  <span>Train a LoRA for {char.name}</span>
                  <span className="ml-auto text-[10px] text-violet-400/60 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Studio
                  </span>
                </button>
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}
