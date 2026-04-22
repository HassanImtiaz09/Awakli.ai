/**
 * MusicBed — pick from 40 licensed cues or upload your own.
 *
 * Auto-ducking: -12dB under dialogue.
 * Studio: catalog free, uploads 2c each.
 * Studio Pro: same + unlimited uploads.
 */
import { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Upload,
  Play,
  Pause,
  Check,
  Volume2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Exported copy strings (exact spec) ─────────────────────────────
export const MUSIC_COPY = {
  title: "Score",
  upload: "Upload a cue (WAV/MP3, ≤20MB)",
  uploadCost: "2 credits per upload",
  catalogLabel: "Licensed catalog",
  searchPlaceholder: "Search cues…",
  selected: "Selected",
  autoDuck: "Auto-ducking: -12dB under dialogue",
  noCue: "No music selected",
  removeCue: "Remove",
  previewPlay: "Preview",
  previewStop: "Stop",
  uploadError: "File must be WAV or MP3, ≤20MB",
} as const;

// ─── Auto-ducking constant ──────────────────────────────────────────
export const AUTO_DUCK_DB = -12;

// ─── Stock cue types ────────────────────────────────────────────────
export interface StockCue {
  id: string;
  title: string;
  artist: string;
  genre: string;
  mood: string;
  durationSeconds: number;
  previewUrl: string | null;
  bpm: number;
}

// ─── Generate 40 stock cues ─────────────────────────────────────────
const GENRES = [
  "Epic Orchestral",
  "Lo-fi Chill",
  "Synthwave",
  "Acoustic Folk",
  "Dark Ambient",
  "J-Pop",
  "Cinematic Piano",
  "Electronic",
];
const MOODS = [
  "Intense",
  "Peaceful",
  "Mysterious",
  "Uplifting",
  "Melancholic",
  "Energetic",
  "Dreamy",
  "Dramatic",
];

export const STOCK_CUES: StockCue[] = Array.from({ length: 40 }, (_, i) => ({
  id: `cue-${i + 1}`,
  title: `${MOODS[i % MOODS.length]} ${GENRES[i % GENRES.length]} ${Math.floor(i / 8) + 1}`,
  artist: `Awakli Studio ${String.fromCharCode(65 + (i % 26))}`,
  genre: GENRES[i % GENRES.length],
  mood: MOODS[i % MOODS.length],
  durationSeconds: 60 + (i % 5) * 30,
  previewUrl: null,
  bpm: 80 + (i % 10) * 10,
}));

// ─── Props ──────────────────────────────────────────────────────────
export interface MusicBedSelection {
  type: "catalog" | "upload";
  cueId?: string;
  fileName?: string;
  fileUrl?: string;
}

export interface MusicBedProps {
  selection: MusicBedSelection | null;
  onSelectionChange: (selection: MusicBedSelection | null) => void;
  tier: string;
  onUploadCue?: (file: File) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ["audio/wav", "audio/mpeg", "audio/mp3"];

export function validateUpload(file: File): string | null {
  if (file.size > MAX_UPLOAD_SIZE) return MUSIC_COPY.uploadError;
  if (
    !ALLOWED_TYPES.includes(file.type) &&
    !file.name.endsWith(".wav") &&
    !file.name.endsWith(".mp3")
  ) {
    return MUSIC_COPY.uploadError;
  }
  return null;
}

// ─── Component ──────────────────────────────────────────────────────
export default function MusicBed({
  selection,
  onSelectionChange,
  tier,
  onUploadCue,
}: MusicBedProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [playingCueId, setPlayingCueId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStudio = tier === "studio" || tier === "studio_pro";

  // ── Filtered cues ─────────────────────────────────────────────────
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return STOCK_CUES;
    const q = searchQuery.toLowerCase();
    return STOCK_CUES.filter(
      (cue) =>
        cue.title.toLowerCase().includes(q) ||
        cue.genre.toLowerCase().includes(q) ||
        cue.mood.toLowerCase().includes(q) ||
        cue.artist.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSelectCue = useCallback(
    (cue: StockCue) => {
      if (selection?.cueId === cue.id) {
        onSelectionChange(null);
      } else {
        onSelectionChange({ type: "catalog", cueId: cue.id });
      }
    },
    [selection, onSelectionChange]
  );

  const handleTogglePlay = useCallback(
    (cueId: string) => {
      setPlayingCueId(playingCueId === cueId ? null : cueId);
    },
    [playingCueId]
  );

  const handleUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const error = validateUpload(file);
      if (error) {
        setUploadError(error);
        return;
      }

      setUploadError(null);
      onSelectionChange({
        type: "upload",
        fileName: file.name,
      });
      onUploadCue?.(file);
    },
    [onSelectionChange, onUploadCue]
  );

  const handleRemoveSelection = useCallback(() => {
    onSelectionChange(null);
  }, [onSelectionChange]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-white/80">
            {MUSIC_COPY.title}
          </h3>
        </div>
        <span className="text-[10px] text-white/30 flex items-center gap-1">
          <Volume2 className="w-3 h-3" />
          {MUSIC_COPY.autoDuck}
        </span>
      </div>

      {/* Current selection */}
      {selection && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="flex items-center justify-between px-4 py-3 rounded-lg bg-violet-500/10 border border-violet-500/20"
        >
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-violet-400" />
            <span className="text-sm text-white/80">
              {selection.type === "catalog"
                ? STOCK_CUES.find((c) => c.id === selection.cueId)?.title ||
                  "Unknown cue"
                : selection.fileName || "Uploaded cue"}
            </span>
            <span className="text-[10px] text-violet-400/60">
              {MUSIC_COPY.selected}
            </span>
          </div>
          <button
            onClick={handleRemoveSelection}
            className="text-white/30 hover:text-red-400 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* Upload */}
      {isStudio && (
        <div className="space-y-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,audio/wav,audio/mpeg"
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-2 text-xs border-white/10 text-white/60 hover:text-white/80 w-full"
          >
            <Upload className="w-3.5 h-3.5" />
            {MUSIC_COPY.upload}
          </Button>
          <p className="text-[10px] text-white/25 text-center">
            {MUSIC_COPY.uploadCost}
          </p>
          {uploadError && (
            <p className="text-[10px] text-red-400 text-center">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={MUSIC_COPY.searchPlaceholder}
          className="pl-9 h-9 text-xs bg-white/[0.03] border-white/5 text-white/70 placeholder:text-white/20"
        />
      </div>

      {/* Catalog label */}
      <p className="text-xs text-white/40">{MUSIC_COPY.catalogLabel}</p>

      {/* Cue list */}
      <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 scrollbar-thin">
        <AnimatePresence>
          {filteredCues.map((cue) => {
            const isSelected = selection?.cueId === cue.id;
            const isPlaying = playingCueId === cue.id;

            return (
              <motion.div
                key={cue.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all cursor-pointer ${
                  isSelected
                    ? "bg-violet-500/10 ring-1 ring-violet-500/30"
                    : "bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
                onClick={() => handleSelectCue(cue)}
              >
                {/* Play button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay(cue.id);
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition flex-shrink-0"
                >
                  {isPlaying ? (
                    <Pause className="w-3.5 h-3.5 text-violet-400" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-white/40 ml-0.5" />
                  )}
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-white/70 truncate">
                    {cue.title}
                  </div>
                  <div className="text-[10px] text-white/30 truncate">
                    {cue.artist} · {cue.genre} · {cue.bpm} BPM
                  </div>
                </div>

                {/* Duration */}
                <span className="text-[10px] text-white/25 font-mono flex-shrink-0">
                  {Math.floor(cue.durationSeconds / 60)}:
                  {String(cue.durationSeconds % 60).padStart(2, "0")}
                </span>

                {/* Selected indicator */}
                {isSelected && (
                  <Check className="w-4 h-4 text-violet-400 flex-shrink-0" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
