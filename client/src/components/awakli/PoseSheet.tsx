/**
 * PoseSheet — AI-generated front/side/back pose references.
 *
 * Auto-generates on entry (8 credits/character).
 * Each pose re-generable at 2 credits.
 * User approves each or regenerates.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  RefreshCw,
  Loader2,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Copy strings (exact spec) ─────────────────────────────────────────
export const POSE_SHEET_COPY = {
  regenerate: "Redraw pose · 2c",
};

// ─── Pose types ────────────────────────────────────────────────────────
export type PoseAngle = "front" | "side" | "back";

export const POSE_ANGLES: PoseAngle[] = ["front", "side", "back"];

export interface PoseData {
  angle: PoseAngle;
  imageUrl: string | null;
  status: "pending" | "generating" | "ready" | "failed";
  approved: boolean;
}

export interface CharacterPoses {
  characterId: number;
  characterName: string;
  poses: Record<PoseAngle, PoseData>;
}

// ─── Credit costs ──────────────────────────────────────────────────────
export const POSE_CREDITS = {
  initialGeneration: 8, // per character
  regenerateSingle: 2, // per pose
};

interface PoseSheetProps {
  characterPoses: CharacterPoses[];
  onApprove: (characterId: number, angle: PoseAngle) => void;
  onRegenerate: (characterId: number, angle: PoseAngle) => void;
  onGenerateAll: (characterId: number) => void;
  creditBalance: number;
}

export function PoseSheet({
  characterPoses,
  onApprove,
  onRegenerate,
  onGenerateAll,
  creditBalance,
}: PoseSheetProps) {
  const [activeCharIdx, setActiveCharIdx] = useState(0);
  const activeChar = characterPoses[activeCharIdx];

  // Auto-generate poses on first entry for each character
  useEffect(() => {
    if (!activeChar) return;
    const allPending = POSE_ANGLES.every(
      (a) => activeChar.poses[a].status === "pending"
    );
    if (allPending && creditBalance >= POSE_CREDITS.initialGeneration) {
      onGenerateAll(activeChar.characterId);
    }
  }, [activeChar?.characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const allApproved = activeChar
    ? POSE_ANGLES.every((a) => activeChar.poses[a].approved)
    : false;

  const canRegenerate = creditBalance >= POSE_CREDITS.regenerateSingle;

  return (
    <div className="space-y-6">
      {/* Character navigation */}
      {characterPoses.length > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() =>
              setActiveCharIdx((i) => Math.max(0, i - 1))
            }
            disabled={activeCharIdx === 0}
            className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-white/30" />
            <span className="text-sm font-medium text-white/80">
              {activeChar?.characterName ?? "Character"}
            </span>
            <span className="text-xs text-white/30">
              {activeCharIdx + 1} / {characterPoses.length}
            </span>
            {allApproved && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00E5A0]/10 text-[#00E5A0] text-[10px] font-medium">
                <Check className="w-3 h-3" />
                All approved
              </span>
            )}
          </div>

          <button
            onClick={() =>
              setActiveCharIdx((i) =>
                Math.min(characterPoses.length - 1, i + 1)
              )
            }
            disabled={activeCharIdx === characterPoses.length - 1}
            className="p-2 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pose grid — front / side / back */}
      {activeChar && (
        <div className="grid grid-cols-3 gap-4">
          {POSE_ANGLES.map((angle) => {
            const pose = activeChar.poses[angle];
            return (
              <PoseCard
                key={`${activeChar.characterId}-${angle}`}
                angle={angle}
                pose={pose}
                onApprove={() => onApprove(activeChar.characterId, angle)}
                onRegenerate={() =>
                  onRegenerate(activeChar.characterId, angle)
                }
                canRegenerate={canRegenerate}
              />
            );
          })}
        </div>
      )}

      {/* Credit info */}
      <div className="text-center text-[10px] text-white/20">
        Initial generation: {POSE_CREDITS.initialGeneration}c per character
        &middot; Regenerate: {POSE_CREDITS.regenerateSingle}c per pose
      </div>
    </div>
  );
}

// ─── Individual pose card ──────────────────────────────────────────────
function PoseCard({
  angle,
  pose,
  onApprove,
  onRegenerate,
  canRegenerate,
}: {
  angle: PoseAngle;
  pose: PoseData;
  onApprove: () => void;
  onRegenerate: () => void;
  canRegenerate: boolean;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        pose.approved
          ? "border-[#00E5A0]/30 bg-[#00E5A0]/[0.03]"
          : "border-white/[0.06] bg-white/[0.02]"
      }`}
    >
      {/* Pose image area */}
      <div className="aspect-[3/4] relative bg-white/[0.02]">
        <AnimatePresence mode="wait">
          {pose.status === "pending" && (
            <motion.div
              key="pending"
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="text-center text-white/20 text-xs">
                Waiting…
              </div>
            </motion.div>
          )}

          {pose.status === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-violet-500/[0.03]"
            >
              <div className="text-center space-y-2">
                <Loader2 className="w-6 h-6 text-violet-400 animate-spin mx-auto" />
                <p className="text-xs text-white/30">Generating…</p>
              </div>
            </motion.div>
          )}

          {pose.status === "ready" && pose.imageUrl && (
            <motion.img
              key="image"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              src={pose.imageUrl}
              alt={`${angle} pose`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {pose.status === "ready" && !pose.imageUrl && (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-white/[0.03]"
            >
              <User className="w-12 h-12 text-white/10" />
            </motion.div>
          )}

          {pose.status === "failed" && (
            <motion.div
              key="failed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center bg-red-500/[0.03]"
            >
              <p className="text-xs text-red-400/60">Generation failed</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Approved overlay */}
        {pose.approved && (
          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#00E5A0] flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Label + actions */}
      <div className="p-3 space-y-2">
        <p className="text-xs font-medium text-white/60 capitalize text-center">
          {angle}
        </p>

        {pose.status === "ready" && (
          <div className="flex gap-2">
            {!pose.approved ? (
              <button
                onClick={onApprove}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E5A0]/10 text-[#00E5A0] text-xs font-medium hover:bg-[#00E5A0]/20 transition-colors"
              >
                <Check className="w-3 h-3" />
                Approve
              </button>
            ) : (
              <div className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00E5A0]/5 text-[#00E5A0]/50 text-xs">
                <Check className="w-3 h-3" />
                Approved
              </div>
            )}

            <button
              onClick={onRegenerate}
              disabled={!canRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-xs hover:bg-white/10 hover:text-white/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={POSE_SHEET_COPY.regenerate}
            >
              <RefreshCw className="w-3 h-3" />
              {POSE_SHEET_COPY.regenerate}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
