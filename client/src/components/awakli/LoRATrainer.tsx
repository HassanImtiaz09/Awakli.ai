/**
 * LoRATrainer — Per-character LoRA training (Studio / Studio Pro).
 *
 * Uses S0-C reference images + S2 approved panels as training set (up to 30 images).
 * States: idle → training (progress ring, ~10 min est) → ready → error (can retry).
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Loader2,
  Check,
  AlertTriangle,
  RotateCcw,
  Zap,
} from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const LORA_COPY = {
  cta: (name: string) => `Train ${name}'s LoRA`,
  cost: "Train LoRA · 120 credits (~10 min)",
  training: "Training LoRA…",
  ready: "LoRA ready",
  error: "Training failed — tap to retry",
  batchCta: "Batch train all characters",
  batchNote: "Studio Pro: batch LoRA across up to 8 characters",
  monthlyPool: "500c monthly LoRA credit pool",
};

export const LORA_CREDITS = {
  perCharacter: 120,
  studioProBatchMax: 8,
  studioProMonthlyPool: 500,
};

// ─── Types ──────────────────────────────────────────────────────────────
export type LoRAStatus = "idle" | "training" | "ready" | "error";

export interface CharacterLoRA {
  characterId: number;
  characterName: string;
  referenceCount: number;
  status: LoRAStatus;
  progress: number;
  errorMessage?: string;
}

interface LoRATrainerProps {
  characters: CharacterLoRA[];
  onStartTraining: (characterId: number) => void;
  onBatchTrain?: (characterIds: number[]) => void;
  onRetry: (characterId: number) => void;
  creditBalance: number;
  currentTier: string;
}

export function LoRATrainer({
  characters,
  onStartTraining,
  onBatchTrain,
  onRetry,
  creditBalance,
  currentTier,
}: LoRATrainerProps) {
  const isStudioPro = currentTier === "enterprise";

  return (
    <div className="space-y-4">
      {isStudioPro && onBatchTrain && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-violet-500/[0.06] border border-violet-500/10">
          <div>
            <p className="text-sm font-medium text-white/80">{LORA_COPY.batchNote}</p>
            <p className="text-xs text-white/30 mt-0.5">{LORA_COPY.monthlyPool}</p>
          </div>
          <button
            onClick={() => {
              const ids = characters
                .filter((c) => c.status === "idle" || c.status === "error")
                .slice(0, LORA_CREDITS.studioProBatchMax)
                .map((c) => c.characterId);
              if (ids.length > 0) onBatchTrain(ids);
            }}
            disabled={characters.every((c) => c.status === "training" || c.status === "ready")}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5 inline mr-1.5" />
            {LORA_COPY.batchCta}
          </button>
        </div>
      )}

      <div className="grid gap-3">
        {characters.map((char) => (
          <LoRACharacterCard
            key={char.characterId}
            character={char}
            onStart={() => onStartTraining(char.characterId)}
            onRetry={() => onRetry(char.characterId)}
            creditBalance={creditBalance}
          />
        ))}
      </div>
    </div>
  );
}

function LoRACharacterCard({
  character,
  onStart,
  onRetry,
  creditBalance,
}: {
  character: CharacterLoRA;
  onStart: () => void;
  onRetry: () => void;
  creditBalance: number;
}) {
  const canAfford = creditBalance >= LORA_CREDITS.perCharacter;

  return (
    <div className="rounded-xl p-5 bg-[#12121A] border border-white/[0.06] flex items-center gap-4">
      <div className="shrink-0">
        <AnimatePresence mode="wait">
          {character.status === "idle" && (
            <motion.div key="idle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
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
          {character.status === "idle" && `${character.referenceCount} reference images`}
          {character.status === "training" && LORA_COPY.training}
          {character.status === "ready" && LORA_COPY.ready}
          {character.status === "error" && (character.errorMessage || LORA_COPY.error)}
        </p>
      </div>

      <div className="shrink-0">
        {character.status === "idle" && (
          <button onClick={onStart} disabled={!canAfford}
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={!canAfford ? "Not enough credits" : undefined}>
            <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
            {LORA_COPY.cta(character.characterName)}
          </button>
        )}
        {character.status === "training" && (
          <div className="flex items-center gap-2 text-xs text-white/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />~10 min
          </div>
        )}
        {character.status === "ready" && (
          <span className="text-xs text-[#00E5A0]/70 font-medium">{LORA_COPY.ready}</span>
        )}
        {character.status === "error" && (
          <button onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />Retry
          </button>
        )}
      </div>
    </div>
  );
}
