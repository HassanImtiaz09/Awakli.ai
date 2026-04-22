/**
 * UserVoiceOverlay — Record/upload dialogue, choose target AI voice, preview.
 *
 * Voice-conversion: keeps timing/emotion from user take, swaps timbre.
 * 2-minute recording cap. Preview available within 8s of mapping.
 */
import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Upload,
  Play,
  Pause,
  Check,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const OVERLAY_COPY = {
  cost: "Overlay my take · 6 credits/line",
  hint: "Read the line the way you hear it. We'll keep your timing — just swap the voice.",
  recording: "Recording…",
  mapping: "Choose target voice",
  previewing: "Generating preview…",
  previewReady: "Preview ready",
  apply: "Apply overlay",
  maxDuration: 120, // 2 minutes in seconds
  maxDurationLabel: "2-minute cap",
};

export const OVERLAY_CREDITS = {
  perLine: 6,
};

// ─── Types ──────────────────────────────────────────────────────────────
export type OverlayStatus = "idle" | "recording" | "mapping" | "previewing" | "preview_ready" | "applied";

export interface DialogueLine {
  id: string;
  characterId: number;
  characterName: string;
  lineText: string;
  status: OverlayStatus;
  userAudioUrl: string | null;
  userAudioDuration: number | null; // seconds
  targetVoiceId: string | null;
  previewUrl: string | null;
}

export interface TargetVoice {
  id: string;
  name: string;
  gender: "male" | "female" | "neutral";
}

interface UserVoiceOverlayProps {
  lines: DialogueLine[];
  targetVoices: TargetVoice[];
  onRecordStart: (lineId: string) => void;
  onRecordStop: (lineId: string) => void;
  onUploadAudio: (lineId: string, file: File) => void;
  onSelectTargetVoice: (lineId: string, voiceId: string) => void;
  onGeneratePreview: (lineId: string) => void;
  onApply: (lineId: string) => void;
  creditBalance: number;
  consentGiven: boolean;
  onConsentChange: (consented: boolean) => void;
}

export function UserVoiceOverlay({
  lines,
  targetVoices,
  onRecordStart,
  onRecordStop,
  onUploadAudio,
  onSelectTargetVoice,
  onGeneratePreview,
  onApply,
  creditBalance,
  consentGiven,
  onConsentChange,
}: UserVoiceOverlayProps) {
  return (
    <div className="space-y-5">
      {/* Hint */}
      <div className="p-4 rounded-xl bg-violet-500/[0.06] border border-violet-500/10">
        <p className="text-sm text-white/60 leading-relaxed">{OVERLAY_COPY.hint}</p>
        <p className="text-xs text-white/30 mt-1">{OVERLAY_COPY.cost}</p>
      </div>

      {/* Consent checkbox — NEVER pre-checked */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(e) => onConsentChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-white/20 bg-transparent text-violet-500 focus:ring-violet-500/30 cursor-pointer"
        />
        <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors leading-relaxed">
          I have the right to use this voice recording for AI voice conversion.
        </span>
      </label>

      {/* Dialogue lines */}
      <div className="space-y-3">
        {lines.map((line) => (
          <OverlayLineCard
            key={line.id}
            line={line}
            targetVoices={targetVoices}
            onRecordStart={() => onRecordStart(line.id)}
            onRecordStop={() => onRecordStop(line.id)}
            onUpload={(file) => onUploadAudio(line.id, file)}
            onSelectVoice={(voiceId) => onSelectTargetVoice(line.id, voiceId)}
            onPreview={() => onGeneratePreview(line.id)}
            onApply={() => onApply(line.id)}
            creditBalance={creditBalance}
            consentGiven={consentGiven}
          />
        ))}
      </div>
    </div>
  );
}

function OverlayLineCard({
  line,
  targetVoices,
  onRecordStart,
  onRecordStop,
  onUpload,
  onSelectVoice,
  onPreview,
  onApply,
  creditBalance,
  consentGiven,
}: {
  line: DialogueLine;
  targetVoices: TargetVoice[];
  onRecordStart: () => void;
  onRecordStop: () => void;
  onUpload: (file: File) => void;
  onSelectVoice: (voiceId: string) => void;
  onPreview: () => void;
  onApply: () => void;
  creditBalance: number;
  consentGiven: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const canAfford = creditBalance >= OVERLAY_CREDITS.perLine;

  return (
    <div className="rounded-xl p-4 bg-[#12121A] border border-white/[0.06] space-y-3">
      {/* Line text */}
      <div className="flex items-start gap-3">
        <span className="text-xs text-violet-400 font-mono shrink-0 mt-0.5">
          {line.characterName}
        </span>
        <p className="text-sm text-white/70 leading-relaxed italic">
          "{line.lineText}"
        </p>
      </div>

      {/* Status-specific UI */}
      <div className="pl-0">
        {/* Idle: record or upload */}
        {line.status === "idle" && (
          <div className="flex items-center gap-2">
            <button
              onClick={onRecordStart}
              disabled={!consentGiven}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Mic className="w-3.5 h-3.5" />
              Record
            </button>
            <span className="text-xs text-white/20">or</span>
            <input ref={fileRef} type="file" accept="audio/*" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!consentGiven}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/50 text-xs font-medium hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
            <span className="text-[10px] text-white/20 ml-auto">{OVERLAY_COPY.maxDurationLabel}</span>
          </div>
        )}

        {/* Recording */}
        {line.status === "recording" && (
          <div className="flex items-center gap-3">
            <div className="h-10 flex-1 rounded-lg bg-red-500/5 overflow-hidden flex items-center px-3">
              {/* Waveform placeholder */}
              <div className="flex items-center gap-0.5 h-full">
                {Array.from({ length: 40 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 bg-red-400/60 rounded-full"
                    animate={{ height: [4, 12 + Math.random() * 16, 4] }}
                    transition={{ duration: 0.5 + Math.random() * 0.5, repeat: Infinity, repeatType: "reverse" }}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={onRecordStop}
              className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-400 transition-colors"
            >
              Stop
            </button>
          </div>
        )}

        {/* Mapping: choose target voice */}
        {line.status === "mapping" && (
          <div className="space-y-2">
            <p className="text-xs text-white/40">{OVERLAY_COPY.mapping}</p>
            <div className="flex flex-wrap gap-2">
              {targetVoices.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onSelectVoice(v.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    line.targetVoiceId === v.id
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-white/50 hover:bg-white/10"
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
            {line.targetVoiceId && (
              <button
                onClick={onPreview}
                disabled={!canAfford}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mt-2"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Generate preview
              </button>
            )}
          </div>
        )}

        {/* Previewing */}
        {line.status === "previewing" && (
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {OVERLAY_COPY.previewing}
          </div>
        )}

        {/* Preview ready */}
        {line.status === "preview_ready" && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/60 text-xs font-medium hover:bg-white/10 transition-colors"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {isPlaying ? "Pause" : "Play preview"}
            </button>
            <button
              onClick={onApply}
              disabled={!canAfford}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00E5A0]/20 text-[#00E5A0] text-xs font-medium hover:bg-[#00E5A0]/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {OVERLAY_COPY.apply}
            </button>
          </div>
        )}

        {/* Applied */}
        {line.status === "applied" && (
          <div className="flex items-center gap-2 text-xs text-[#00E5A0]/70">
            <Check className="w-3.5 h-3.5" />
            Voice overlay applied
          </div>
        )}
      </div>
    </div>
  );
}
