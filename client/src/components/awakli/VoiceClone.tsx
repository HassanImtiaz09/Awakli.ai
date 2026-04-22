/**
 * VoiceClone — Upload 30–120s voice sample, consent checkbox, 10-min training.
 *
 * Per-character voice cloning for Studio / Studio Pro.
 * Consent checkbox is NEVER pre-checked.
 * Rejects samples <25s with clear error copy.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Upload,
  Check,
  AlertTriangle,
  Loader2,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const VOICE_CLONE_COPY = {
  consent: "This is my voice, or I have permission to clone it",
  cost: "Clone voice · 80 credits",
  tooShort: "Sample must be at least 25 seconds. Please record a longer clip.",
  tooLong: "Sample must be under 120 seconds.",
  training: "Cloning voice…",
  ready: "Voice clone ready",
  error: "Cloning failed — tap to retry",
  uploadHint: "Upload a 30–120s voice sample (MP3, WAV, or M4A)",
  sampleRange: { min: 25, max: 120 },
};

export const VOICE_CLONE_CREDITS = {
  perVoice: 80,
};

// ─── Types ──────────────────────────────────────────────────────────────
export type VoiceCloneStatus = "idle" | "sampling" | "training" | "ready" | "error";

export interface CharacterVoiceClone {
  characterId: number;
  characterName: string;
  status: VoiceCloneStatus;
  progress: number; // 0-100
  sampleDuration: number | null; // seconds
  sampleUrl: string | null;
  consentGiven: boolean;
  errorMessage?: string;
}

interface VoiceCloneProps {
  characters: CharacterVoiceClone[];
  onUploadSample: (characterId: number, file: File) => void;
  onConsentChange: (characterId: number, consented: boolean) => void;
  onStartCloning: (characterId: number) => void;
  onRetry: (characterId: number) => void;
  creditBalance: number;
}

export function VoiceClone({
  characters,
  onUploadSample,
  onConsentChange,
  onStartCloning,
  onRetry,
  creditBalance,
}: VoiceCloneProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {characters.map((char) => (
          <VoiceCloneCard
            key={char.characterId}
            character={char}
            onUpload={(file) => onUploadSample(char.characterId, file)}
            onConsent={(v) => onConsentChange(char.characterId, v)}
            onStart={() => onStartCloning(char.characterId)}
            onRetry={() => onRetry(char.characterId)}
            creditBalance={creditBalance}
          />
        ))}
      </div>
    </div>
  );
}

function VoiceCloneCard({
  character,
  onUpload,
  onConsent,
  onStart,
  onRetry,
  creditBalance,
}: {
  character: CharacterVoiceClone;
  onUpload: (file: File) => void;
  onConsent: (v: boolean) => void;
  onStart: () => void;
  onRetry: () => void;
  creditBalance: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const canAfford = creditBalance >= VOICE_CLONE_CREDITS.perVoice;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setValidationError(null);
      onUpload(file);
    },
    [onUpload]
  );

  const canClone =
    character.consentGiven &&
    character.sampleDuration !== null &&
    character.sampleDuration >= VOICE_CLONE_COPY.sampleRange.min &&
    canAfford;

  const sampleTooShort =
    character.sampleDuration !== null &&
    character.sampleDuration < VOICE_CLONE_COPY.sampleRange.min;

  return (
    <div className="rounded-xl p-5 bg-[#12121A] border border-white/[0.06] space-y-4">
      {/* Header row */}
      <div className="flex items-center gap-4">
        <div className="shrink-0">
          <AnimatePresence mode="wait">
            {(character.status === "idle" || character.status === "sampling") && (
              <motion.div key="idle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
                <Mic className="w-5 h-5 text-violet-400" />
              </motion.div>
            )}
            {character.status === "training" && (
              <motion.div key="training" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="relative w-12 h-12">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3" className="text-white/5" />
                  <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - character.progress / 100)}`}
                    strokeLinecap="round" className="text-violet-500 transition-all duration-500" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-violet-300">
                  {character.progress}%
                </span>
              </motion.div>
            )}
            {character.status === "ready" && (
              <motion.div key="ready" initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-12 h-12 rounded-full bg-[#00E5A0]/10 flex items-center justify-center">
                <Check className="w-5 h-5 text-[#00E5A0]" />
              </motion.div>
            )}
            {character.status === "error" && (
              <motion.div key="error" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/80 truncate">{character.characterName}</p>
          <p className="text-xs text-white/30 mt-0.5">
            {character.status === "idle" && !character.sampleUrl && VOICE_CLONE_COPY.uploadHint}
            {character.status === "idle" && character.sampleUrl &&
              `Sample: ${character.sampleDuration}s`}
            {character.status === "sampling" && "Processing sample…"}
            {character.status === "training" && VOICE_CLONE_COPY.training}
            {character.status === "ready" && VOICE_CLONE_COPY.ready}
            {character.status === "error" && (character.errorMessage || VOICE_CLONE_COPY.error)}
          </p>
        </div>

        <div className="shrink-0">
          {character.status === "idle" && !character.sampleUrl && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="audio/mp3,audio/wav,audio/x-m4a,audio/mpeg,.mp3,.wav,.m4a"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload sample
              </button>
            </>
          )}
          {character.status === "training" && (
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />~10 min
            </div>
          )}
          {character.status === "ready" && (
            <span className="text-xs text-[#00E5A0]/70 font-medium">{VOICE_CLONE_COPY.ready}</span>
          )}
          {character.status === "error" && (
            <button onClick={onRetry}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />Retry
            </button>
          )}
        </div>
      </div>

      {/* Sample validation error */}
      {sampleTooShort && (
        <p className="text-xs text-red-400 pl-16">{VOICE_CLONE_COPY.tooShort}</p>
      )}

      {/* Consent + Clone CTA (shown when sample uploaded, not yet training) */}
      {character.status === "idle" && character.sampleUrl && !sampleTooShort && (
        <div className="pl-16 space-y-3">
          {/* Consent checkbox — NEVER pre-checked */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={character.consentGiven}
              onChange={(e) => onConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-white/20 bg-transparent text-violet-500 focus:ring-violet-500/30 cursor-pointer"
            />
            <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors leading-relaxed">
              {VOICE_CLONE_COPY.consent}
            </span>
          </label>

          {/* Clone button */}
          <button
            onClick={onStart}
            disabled={!canClone}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Mic className="w-3.5 h-3.5 inline mr-1.5" />
            {VOICE_CLONE_COPY.cost}
          </button>

          {!character.consentGiven && (
            <p className="text-[10px] text-white/20">
              You must agree to the consent statement before cloning.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
