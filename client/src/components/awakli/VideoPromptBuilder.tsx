/**
 * VideoPromptBuilder — UI for selecting camera presets, mood intensity, and transitions
 * for enhanced Kling video generation.
 */

import { useState } from "react";
import { Camera, Palette, Film, Wand2, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface VideoPromptBuilderProps {
  visualDescription: string;
  onPromptBuilt?: (prompt: string, transitionFilter: string) => void;
  className?: string;
}

const CAMERA_LABELS: Record<string, string> = {
  "wide": "Wide Shot",
  "medium": "Medium Shot",
  "close-up": "Close-Up",
  "extreme-close-up": "Extreme Close-Up",
  "birds-eye": "Bird's Eye",
};

const MOOD_LABELS: Record<string, string> = {
  "tense": "Tense",
  "romantic": "Romantic",
  "action": "Action",
  "peaceful": "Peaceful",
  "dramatic": "Dramatic",
  "mysterious": "Mysterious",
  "comedic": "Comedic",
};

const TRANSITION_LABELS: Record<string, string> = {
  "cut": "Hard Cut",
  "fade": "Fade to Black",
  "dissolve": "Dissolve",
  "wipe_right": "Wipe Right",
  "slide_left": "Slide Left",
  "flash_white": "Flash White",
};

export function VideoPromptBuilder({ visualDescription, onPromptBuilt, className = "" }: VideoPromptBuilderProps) {
  const [camera, setCamera] = useState("medium");
  const [mood, setMood] = useState("dramatic");
  const [transition, setTransition] = useState("dissolve");
  const [expanded, setExpanded] = useState(false);

  const { data: promptData } = trpc.videoPrompt.build.useQuery(
    { visualDescription, cameraAngle: camera, mood, transition },
    { enabled: !!visualDescription }
  );

  const handleApply = () => {
    if (promptData && onPromptBuilt) {
      onPromptBuilt(promptData.prompt, promptData.transitionFilter);
    }
  };

  return (
    <div className={`bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Film className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <span className="text-sm font-medium text-zinc-200">Video Generation Settings</span>
        </div>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Camera Angle */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
              <Camera className="w-3.5 h-3.5" />
              Camera Angle
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CAMERA_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCamera(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    camera === key
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mood */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
              <Palette className="w-3.5 h-3.5" />
              Mood & Intensity
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(MOOD_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMood(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    mood === key
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Transition */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
              <Film className="w-3.5 h-3.5" />
              Transition
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(TRANSITION_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTransition(key)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    transition === key
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Generated Prompt Preview */}
          {promptData && (
            <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
              <div className="text-[10px] font-medium text-zinc-500 mb-1">Generated Video Prompt</div>
              <p className="text-xs text-zinc-300 leading-relaxed">{promptData.prompt}</p>
              {promptData.transitionFilter && (
                <div className="mt-2 text-[10px] text-zinc-500">
                  FFmpeg filter: <code className="text-cyan-400/70">{promptData.transitionFilter}</code>
                </div>
              )}
            </div>
          )}

          {/* Apply Button */}
          <button
            onClick={handleApply}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            <Wand2 className="w-4 h-4" />
            Apply Settings
          </button>
        </div>
      )}
    </div>
  );
}
