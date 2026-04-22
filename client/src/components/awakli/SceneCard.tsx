/**
 * SceneCard — A draggable, expandable card for a single scene in the script editor.
 *
 * States: collapsed (default), expanded (editing), approved (mint ring), regenerating (spinner overlay).
 * Shows: scene number, title, mood pill, character chips, panel count, beat summary.
 * Actions: approve, regenerate, expand/collapse, edit fields.
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Clock,
  Palette,
  MessageSquare,
  Image,
  Edit3,
} from "lucide-react";
import { CharacterChip } from "./CharacterChip";

export interface DialogueLine {
  character: string;
  text: string;
  emotion: string;
}

export interface ScenePanel {
  panel_number: number;
  visual_description: string;
  camera_angle: string;
  dialogue: DialogueLine[];
  sfx: string | null;
  transition: string | null;
}

export interface SceneData {
  scene_number: number;
  location: string;
  time_of_day: string;
  mood: string;
  description: string;
  title?: string;
  characters?: string[];
  beat_summary?: string;
  approved?: boolean;
  panels: ScenePanel[];
}

interface SceneCardProps {
  scene: SceneData;
  isSelected: boolean;
  onSelect: () => void;
  onApprove: (sceneNumber: number) => void;
  onRegenerate: (sceneNumber: number, instruction?: string) => void;
  onCharacterClick: (name: string) => void;
  approving: boolean;
  regenerating: boolean;
  dragHandleProps?: any;
  locked?: boolean;
}

const MOOD_COLORS: Record<string, string> = {
  tense: "bg-red-500/10 text-red-400 border-red-500/20",
  calm: "bg-blue-400/10 text-blue-400 border-blue-400/20",
  action: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  romantic: "bg-pink-400/10 text-pink-400 border-pink-400/20",
  mysterious: "bg-purple-400/10 text-purple-400 border-purple-400/20",
  comedic: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  dark: "bg-gray-400/10 text-gray-400 border-gray-400/20",
  hopeful: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  melancholic: "bg-indigo-400/10 text-indigo-400 border-indigo-400/20",
  dramatic: "bg-amber-400/10 text-amber-400 border-amber-400/20",
};

function getMoodColor(mood: string): string {
  const lower = mood.toLowerCase();
  return MOOD_COLORS[lower] || "bg-white/5 text-white/50 border-white/10";
}

const TIME_ICONS: Record<string, string> = {
  day: "☀️",
  night: "🌙",
  dawn: "🌅",
  dusk: "🌇",
};

export function SceneCard({
  scene,
  isSelected,
  onSelect,
  onApprove,
  onRegenerate,
  onCharacterClick,
  approving,
  regenerating,
  dragHandleProps,
  locked,
}: SceneCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const [showRegenInput, setShowRegenInput] = useState(false);

  const dialogueCount = scene.panels.reduce((sum, p) => sum + p.dialogue.length, 0);
  const isApproved = scene.approved;

  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isApproved && !locked) onApprove(scene.scene_number);
    },
    [isApproved, locked, onApprove, scene.scene_number]
  );

  const handleRegenerate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (showRegenInput && regenInstruction.trim()) {
        onRegenerate(scene.scene_number, regenInstruction.trim());
        setRegenInstruction("");
        setShowRegenInput(false);
      } else {
        setShowRegenInput(!showRegenInput);
      }
    },
    [showRegenInput, regenInstruction, onRegenerate, scene.scene_number]
  );

  const handleQuickRegen = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRegenerate(scene.scene_number);
    },
    [onRegenerate, scene.scene_number]
  );

  return (
    <motion.div
      layout
      className={`relative rounded-2xl border transition-all duration-200 ${
        isSelected
          ? "border-[#6B5BFF]/50 bg-[#6B5BFF]/5 shadow-[0_0_20px_rgba(107,91,255,0.1)]"
          : isApproved
          ? "border-[#00F0FF]/30 bg-[#00F0FF]/[0.02]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      {/* Regenerating overlay */}
      <AnimatePresence>
        {regenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl z-10 grid place-items-center"
          >
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 text-[#6B5BFF] animate-spin" />
              <span className="text-white/60 text-xs">Regenerating scene...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={onSelect}
      >
        {/* Drag handle */}
        {dragHandleProps && !locked && (
          <div
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-white/20 hover:text-white/40 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        {/* Scene number badge */}
        <div
          className={`flex-shrink-0 w-7 h-7 rounded-lg grid place-items-center text-xs font-bold ${
            isApproved
              ? "bg-[#00F0FF]/10 text-[#00F0FF]"
              : "bg-white/5 text-white/40"
          }`}
        >
          {scene.scene_number}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white/80 truncate">
              {scene.title || `${scene.location} — ${scene.mood}`}
            </span>
            {isApproved && (
              <Check className="w-3.5 h-3.5 text-[#00F0FF] flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-white/30 flex items-center gap-1">
              <MapPin className="w-2.5 h-2.5" />
              {scene.location}
            </span>
            <span className="text-[10px] text-white/30">
              {TIME_ICONS[scene.time_of_day] || "🕐"} {scene.time_of_day}
            </span>
          </div>
        </div>

        {/* Mood pill */}
        <span
          className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${getMoodColor(
            scene.mood
          )}`}
        >
          {scene.mood}
        </span>

        {/* Panel count */}
        <span className="flex-shrink-0 text-[10px] text-white/30 flex items-center gap-1">
          <Image className="w-2.5 h-2.5" />
          {scene.panels.length}
        </span>

        {/* Dialogue count */}
        <span className="flex-shrink-0 text-[10px] text-white/30 flex items-center gap-1">
          <MessageSquare className="w-2.5 h-2.5" />
          {dialogueCount}
        </span>

        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-white/20 hover:text-white/50 transition-colors"
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Characters row */}
      {scene.characters && scene.characters.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 pb-2 flex-wrap">
          {scene.characters.map((name) => (
            <CharacterChip
              key={name}
              name={name}
              onClick={() => onCharacterClick(name)}
            />
          ))}
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
              {/* Beat summary */}
              {scene.beat_summary && (
                <div className="text-xs text-white/40 italic leading-relaxed">
                  "{scene.beat_summary}"
                </div>
              )}

              {/* Description */}
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Edit3 className="w-2.5 h-2.5" />
                  Scene Description
                </div>
                <p className="text-xs text-white/50 leading-relaxed">
                  {scene.description}
                </p>
              </div>

              {/* Panel breakdown */}
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Image className="w-2.5 h-2.5" />
                  Panels ({scene.panels.length})
                </div>
                <div className="space-y-2">
                  {scene.panels.map((panel) => (
                    <div
                      key={panel.panel_number}
                      className="bg-white/[0.02] rounded-xl p-3 border border-white/5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-white/30">
                          P{panel.panel_number}
                        </span>
                        <span className="text-[10px] text-[#6B5BFF]/60 px-1.5 py-0.5 rounded bg-[#6B5BFF]/5">
                          {panel.camera_angle}
                        </span>
                        {panel.transition && (
                          <span className="text-[10px] text-white/20">
                            → {panel.transition}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/40 leading-relaxed mb-1">
                        {panel.visual_description}
                      </p>
                      {panel.dialogue.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {panel.dialogue.map((d, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="text-[10px] font-semibold text-[#00F0FF]/60 flex-shrink-0 mt-0.5">
                                {d.character}:
                              </span>
                              <span className="text-[11px] text-white/50">
                                "{d.text}"{" "}
                                <span className="text-white/20">
                                  ({d.emotion})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {panel.sfx && (
                        <div className="text-[10px] text-yellow-400/50 mt-1">
                          SFX: {panel.sfx}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {!locked && (
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleApprove}
                    disabled={isApproved || approving}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      isApproved
                        ? "bg-[#00F0FF]/10 text-[#00F0FF]/60 cursor-default"
                        : approving
                        ? "bg-white/5 text-white/30"
                        : "bg-[#00F0FF]/10 text-[#00F0FF] hover:bg-[#00F0FF]/20"
                    }`}
                  >
                    {approving ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    {isApproved ? "Approved" : "Approve scene"}
                  </button>

                  <button
                    onClick={handleQuickRegen}
                    disabled={regenerating || locked}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate <span className="text-white/20 ml-0.5">(3c)</span>
                  </button>

                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating || locked}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 text-white/40 hover:text-white/60 hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    <Sparkles className="w-3 h-3" />
                    Regen with notes <span className="text-white/20 ml-0.5">(3c)</span>
                  </button>
                </div>
              )}

              {/* Regen instruction input */}
              <AnimatePresence>
                {showRegenInput && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={regenInstruction}
                        onChange={(e) => setRegenInstruction(e.target.value)}
                        placeholder="E.g., 'Make it more dramatic' or 'Add a plot twist'"
                        className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/15 outline-none focus:ring-1 focus:ring-[#6B5BFF]/50"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && regenInstruction.trim()) {
                            onRegenerate(scene.scene_number, regenInstruction.trim());
                            setRegenInstruction("");
                            setShowRegenInput(false);
                          }
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (regenInstruction.trim()) {
                            onRegenerate(scene.scene_number, regenInstruction.trim());
                            setRegenInstruction("");
                            setShowRegenInput(false);
                          }
                        }}
                        disabled={!regenInstruction.trim()}
                        className="px-3 py-2 rounded-xl text-xs font-medium bg-[#6B5BFF]/10 text-[#6B5BFF] hover:bg-[#6B5BFF]/20 transition-all disabled:opacity-50"
                      >
                        Go
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
