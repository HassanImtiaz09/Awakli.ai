/**
 * VoiceCatalog — 24 stock voices filterable by age/gender/tone.
 *
 * Per-character selection. Click to play 6s preview.
 * "Clone my voice" tier-locked affordance for Studio upgrade.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Check, Lock, Sparkles, Mic } from "lucide-react";
import { useUpgradeModal } from "@/store/upgradeModal";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const VOICE_CATALOG_COPY = {
  preview: "Preview",
  cloneVoice: "Clone my voice",
};

// ─── Voice definitions ─────────────────────────────────────────────────
export interface StockVoice {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
  age: "young" | "adult" | "mature";
  tone: "warm" | "cool" | "energetic" | "calm" | "dramatic" | "soft";
  sampleUrl: string | null; // 6s sample URL
}

export const STOCK_VOICES: StockVoice[] = [
  { id: "v01", name: "Akira", gender: "male", age: "young", tone: "energetic", sampleUrl: null },
  { id: "v02", name: "Haruki", gender: "male", age: "adult", tone: "warm", sampleUrl: null },
  { id: "v03", name: "Kenji", gender: "male", age: "mature", tone: "dramatic", sampleUrl: null },
  { id: "v04", name: "Ryo", gender: "male", age: "young", tone: "cool", sampleUrl: null },
  { id: "v05", name: "Takeshi", gender: "male", age: "adult", tone: "calm", sampleUrl: null },
  { id: "v06", name: "Daichi", gender: "male", age: "mature", tone: "warm", sampleUrl: null },
  { id: "v07", name: "Shin", gender: "male", age: "young", tone: "soft", sampleUrl: null },
  { id: "v08", name: "Kaito", gender: "male", age: "adult", tone: "energetic", sampleUrl: null },
  { id: "v09", name: "Yuki", gender: "female", age: "young", tone: "energetic", sampleUrl: null },
  { id: "v10", name: "Sakura", gender: "female", age: "young", tone: "soft", sampleUrl: null },
  { id: "v11", name: "Hana", gender: "female", age: "adult", tone: "warm", sampleUrl: null },
  { id: "v12", name: "Mei", gender: "female", age: "adult", tone: "calm", sampleUrl: null },
  { id: "v13", name: "Aoi", gender: "female", age: "young", tone: "cool", sampleUrl: null },
  { id: "v14", name: "Rin", gender: "female", age: "mature", tone: "dramatic", sampleUrl: null },
  { id: "v15", name: "Natsuki", gender: "female", age: "adult", tone: "energetic", sampleUrl: null },
  { id: "v16", name: "Kiyomi", gender: "female", age: "mature", tone: "warm", sampleUrl: null },
  { id: "v17", name: "Sora", gender: "neutral", age: "young", tone: "soft", sampleUrl: null },
  { id: "v18", name: "Ren", gender: "neutral", age: "adult", tone: "cool", sampleUrl: null },
  { id: "v19", name: "Hikari", gender: "neutral", age: "young", tone: "warm", sampleUrl: null },
  { id: "v20", name: "Tsubasa", gender: "neutral", age: "adult", tone: "dramatic", sampleUrl: null },
  { id: "v21", name: "Kai", gender: "male", age: "young", tone: "dramatic", sampleUrl: null },
  { id: "v22", name: "Miku", gender: "female", age: "young", tone: "warm", sampleUrl: null },
  { id: "v23", name: "Zen", gender: "neutral", age: "mature", tone: "calm", sampleUrl: null },
  { id: "v24", name: "Nao", gender: "neutral", age: "adult", tone: "energetic", sampleUrl: null },
];

// ─── Filter types ──────────────────────────────────────────────────────
type GenderFilter = "all" | "male" | "female" | "neutral";
type AgeFilter = "all" | "young" | "adult" | "mature";
type ToneFilter = "all" | "warm" | "cool" | "energetic" | "calm" | "dramatic" | "soft";

// ─── Character type ────────────────────────────────────────────────────
export interface CharacterForVoice {
  id: number;
  name: string;
}

interface VoiceCatalogProps {
  characters: CharacterForVoice[];
  selections: Record<number, string>; // characterId → voiceId
  onSelect: (characterId: number, voiceId: string) => void;
  currentTier: string;
}

export function VoiceCatalog({
  characters,
  selections,
  onSelect,
  currentTier,
}: VoiceCatalogProps) {
  const { openFromGate } = useUpgradeModal();
  const [activeCharId, setActiveCharId] = useState<number>(
    characters[0]?.id ?? 0
  );
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [toneFilter, setToneFilter] = useState<ToneFilter>("all");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Filtering ─────────────────────────────────────────────────────
  const filteredVoices = STOCK_VOICES.filter((v) => {
    if (genderFilter !== "all" && v.gender !== genderFilter) return false;
    if (ageFilter !== "all" && v.age !== ageFilter) return false;
    if (toneFilter !== "all" && v.tone !== toneFilter) return false;
    return true;
  });

  // ─── Preview playback ─────────────────────────────────────────────
  const handlePreview = useCallback(
    (voice: StockVoice) => {
      if (playingVoiceId === voice.id) {
        // Stop
        audioRef.current?.pause();
        setPlayingVoiceId(null);
        return;
      }

      // Play sample (or simulate if no URL)
      if (voice.sampleUrl) {
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(voice.sampleUrl);
        audio.onended = () => setPlayingVoiceId(null);
        audio.play().catch(() => setPlayingVoiceId(null));
        audioRef.current = audio;
      }
      setPlayingVoiceId(voice.id);

      // Auto-stop after 6s
      setTimeout(() => {
        setPlayingVoiceId((curr) => (curr === voice.id ? null : curr));
        audioRef.current?.pause();
      }, 6000);
    },
    [playingVoiceId]
  );

  const handleCloneVoice = () => {
    openFromGate({
      currentTier,
      required: "studio",
      requiredDisplayName: "Studio",
      upgradeSku: "studio",
      ctaText: "Upgrade to Studio for voice cloning",
      pricingUrl: "/pricing",
    });
  };

  const activeChar = characters.find((c) => c.id === activeCharId);

  return (
    <div className="space-y-6">
      {/* Character tabs */}
      {characters.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {characters.map((char) => {
            const hasVoice = !!selections[char.id];
            return (
              <button
                key={char.id}
                onClick={() => setActiveCharId(char.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeCharId === char.id
                    ? "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20"
                    : hasVoice
                    ? "bg-[#00E5A0]/10 text-[#00E5A0]/70 hover:bg-[#00E5A0]/15"
                    : "bg-white/5 text-white/40 hover:bg-white/10"
                }`}
              >
                {hasVoice && <Check className="w-3 h-3" />}
                {char.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <FilterGroup
          label="Gender"
          value={genderFilter}
          options={["all", "male", "female", "neutral"]}
          onChange={(v) => setGenderFilter(v as GenderFilter)}
        />
        <FilterGroup
          label="Age"
          value={ageFilter}
          options={["all", "young", "adult", "mature"]}
          onChange={(v) => setAgeFilter(v as AgeFilter)}
        />
        <FilterGroup
          label="Tone"
          value={toneFilter}
          options={["all", "warm", "cool", "energetic", "calm", "dramatic", "soft"]}
          onChange={(v) => setToneFilter(v as ToneFilter)}
        />
      </div>

      {/* Voice grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {filteredVoices.map((voice) => {
            const isSelected = selections[activeCharId] === voice.id;
            const isPlaying = playingVoiceId === voice.id;

            return (
              <motion.div
                key={voice.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`relative p-4 rounded-xl border transition-all ${
                  isSelected
                    ? "border-violet-500/40 bg-violet-500/[0.08] ring-1 ring-violet-500/20"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                }`}
              >
                {/* Voice info */}
                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Mic className="w-3.5 h-3.5 text-white/30" />
                    <span className="text-sm font-medium text-white/80">
                      {voice.name}
                    </span>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/30 capitalize">
                      {voice.gender}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/30 capitalize">
                      {voice.age}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 text-white/30 capitalize">
                      {voice.tone}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePreview(voice)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isPlaying
                        ? "bg-violet-500/20 text-violet-400"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                    }`}
                  >
                    {isPlaying ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    {VOICE_CATALOG_COPY.preview}
                  </button>

                  <button
                    onClick={() => onSelect(activeCharId, voice.id)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isSelected
                        ? "bg-violet-500 text-white"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                    }`}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </button>
                </div>

                {/* Selected check */}
                {isSelected && (
                  <motion.div
                    layoutId={`voice-check-${activeCharId}`}
                    className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredVoices.length === 0 && (
        <div className="text-center py-12 text-white/30 text-sm">
          No voices match your filters. Try adjusting them.
        </div>
      )}

      {/* Tier-locked voice clone affordance */}
      <button
        onClick={handleCloneVoice}
        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.02] border border-dashed border-white/[0.08] text-white/30 hover:text-white/50 hover:border-white/15 transition-colors text-xs w-full"
      >
        <Lock className="w-3.5 h-3.5" />
        <span>{VOICE_CATALOG_COPY.cloneVoice} for {activeChar?.name ?? "character"}</span>
        <span className="ml-auto text-[10px] text-violet-400/60 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Studio
        </span>
      </button>
    </div>
  );
}

// ─── Filter group helper ───────────────────────────────────────────────
function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-white/30 uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-2 py-1 rounded text-[10px] font-medium capitalize transition-colors ${
              value === opt
                ? "bg-violet-500/15 text-violet-400"
                : "bg-white/5 text-white/30 hover:bg-white/10"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
