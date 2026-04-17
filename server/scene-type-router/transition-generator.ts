/**
 * Prompt 20 — Rule-Based Transition Generator
 *
 * 5 transition types, all via ffmpeg/canvas compositing. Zero AI cost.
 * Types: fade_to_black, fade_from_black, cross_dissolve, wipe, title_card, manga_panel_reveal
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type TransitionType =
  | "fade_to_black"
  | "fade_from_black"
  | "cross_dissolve"
  | "wipe"
  | "title_card"
  | "manga_panel_reveal";

export type WipeDirection = "left_to_right" | "right_to_left" | "top_to_bottom" | "bottom_to_top";

export interface TransitionConfig {
  type: TransitionType;
  durationS: number;
  fps: number;
  outputWidth: number;
  outputHeight: number;
  // Type-specific options
  wipeDirection?: WipeDirection;
  titleText?: string;
  titleFont?: string;
  titleFontSize?: number;
  backgroundColor?: string;  // hex color
  panelCount?: number;       // for manga_panel_reveal
}

export interface CompositingInstruction {
  type: TransitionType;
  frameCount: number;
  durationS: number;
  ffmpegFilter: string;
  canvasInstructions?: CanvasInstruction[];
  aiCost: number;  // always 0 for rule-based transitions
}

export interface CanvasInstruction {
  frameIndex: number;
  timeS: number;
  operations: CanvasOperation[];
}

export type CanvasOperation =
  | { type: "fill_rect"; x: number; y: number; width: number; height: number; color: string; alpha: number }
  | { type: "draw_image"; source: "incoming" | "outgoing"; x: number; y: number; width: number; height: number; alpha: number }
  | { type: "draw_text"; text: string; x: number; y: number; font: string; color: string; alpha: number; align: "center" | "left" | "right" }
  | { type: "clip_rect"; x: number; y: number; width: number; height: number };

// ─── Default Configs ────────────────────────────────────────────────────

export const DEFAULT_TRANSITION_CONFIG: Partial<TransitionConfig> = {
  durationS: 1.0,
  fps: 24,
  outputWidth: 1920,
  outputHeight: 1080,
  backgroundColor: "#000000",
  wipeDirection: "left_to_right",
  titleFont: "bold 64px sans-serif",
  titleFontSize: 64,
  panelCount: 4,
};

// ─── Transition Type Metadata ───────────────────────────────────────────

export interface TransitionTypeInfo {
  type: TransitionType;
  displayName: string;
  description: string;
  defaultDurationS: number;
  useCase: string;
}

export const TRANSITION_TYPES: TransitionTypeInfo[] = [
  {
    type: "fade_to_black",
    displayName: "Fade to Black",
    description: "Gradually fade outgoing scene to black",
    defaultDurationS: 1.0,
    useCase: "Scene endings, time passage, dramatic pauses",
  },
  {
    type: "fade_from_black",
    displayName: "Fade from Black",
    description: "Gradually reveal incoming scene from black",
    defaultDurationS: 1.0,
    useCase: "Scene beginnings, after time skip, waking up",
  },
  {
    type: "cross_dissolve",
    displayName: "Cross Dissolve",
    description: "Blend outgoing and incoming scenes together",
    defaultDurationS: 1.5,
    useCase: "Smooth scene transitions, related scenes",
  },
  {
    type: "wipe",
    displayName: "Wipe",
    description: "Incoming scene wipes over outgoing scene",
    defaultDurationS: 0.8,
    useCase: "Location changes, parallel action, manga-style",
  },
  {
    type: "title_card",
    displayName: "Title Card",
    description: "Black screen with text overlay (location, time, etc.)",
    defaultDurationS: 2.0,
    useCase: "Chapter titles, location introductions, time stamps",
  },
  {
    type: "manga_panel_reveal",
    displayName: "Manga Panel Reveal",
    description: "Incoming scene revealed through manga panel grid animation",
    defaultDurationS: 1.2,
    useCase: "Manga-to-anime style transitions, dramatic reveals",
  },
];

// ─── Scene Context for Auto-Selection ───────────────────────────────────

export interface TransitionContext {
  previousSceneMood?: string;
  nextSceneMood?: string;
  transitionHint?: string;    // from panel.transition field: 'cut', 'fade', 'dissolve', 'cross-dissolve'
  isChapterBoundary?: boolean;
  isTimeskip?: boolean;
  locationChange?: boolean;
}

/**
 * Auto-select transition type based on scene context.
 */
export function selectTransitionType(context: TransitionContext): TransitionType {
  // Chapter boundary → title card
  if (context.isChapterBoundary) return "title_card";

  // Timeskip → fade to/from black
  if (context.isTimeskip) return "fade_to_black";

  // Explicit hint from panel data
  if (context.transitionHint) {
    switch (context.transitionHint.toLowerCase()) {
      case "fade": return "fade_to_black";
      case "dissolve":
      case "cross-dissolve": return "cross_dissolve";
      default: break;
    }
  }

  // Location change → wipe
  if (context.locationChange) return "wipe";

  // Dramatic mood → manga panel reveal
  const dramaticMoods = ["tense", "dramatic", "shocking", "intense", "climactic"];
  if (context.nextSceneMood && dramaticMoods.includes(context.nextSceneMood.toLowerCase())) {
    return "manga_panel_reveal";
  }

  // Default: cross dissolve (most versatile)
  return "cross_dissolve";
}

// ─── Transition Generation ──────────────────────────────────────────────

/**
 * Generate compositing instructions for a transition.
 * Returns ffmpeg filter string and optional canvas instructions.
 */
export function generateTransition(config: TransitionConfig): CompositingInstruction {
  const fullConfig = { ...DEFAULT_TRANSITION_CONFIG, ...config };
  const frameCount = Math.ceil(fullConfig.durationS * fullConfig.fps!);

  switch (config.type) {
    case "fade_to_black":
      return generateFadeToBlack(fullConfig as Required<TransitionConfig>, frameCount);
    case "fade_from_black":
      return generateFadeFromBlack(fullConfig as Required<TransitionConfig>, frameCount);
    case "cross_dissolve":
      return generateCrossDissolve(fullConfig as Required<TransitionConfig>, frameCount);
    case "wipe":
      return generateWipe(fullConfig as Required<TransitionConfig>, frameCount);
    case "title_card":
      return generateTitleCard(fullConfig as Required<TransitionConfig>, frameCount);
    case "manga_panel_reveal":
      return generateMangaPanelReveal(fullConfig as Required<TransitionConfig>, frameCount);
  }
}

// ─── Individual Transition Generators ───────────────────────────────────

function generateFadeToBlack(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    canvasInstructions.push({
      frameIndex: i,
      timeS: i / config.fps,
      operations: [
        { type: "draw_image", source: "outgoing", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: 1 - t },
        { type: "fill_rect", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, color: config.backgroundColor, alpha: t },
      ],
    });
  }

  return {
    type: "fade_to_black",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: `fade=t=out:st=0:d=${config.durationS}`,
    canvasInstructions,
    aiCost: 0,
  };
}

function generateFadeFromBlack(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    canvasInstructions.push({
      frameIndex: i,
      timeS: i / config.fps,
      operations: [
        { type: "fill_rect", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, color: config.backgroundColor, alpha: 1 - t },
        { type: "draw_image", source: "incoming", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: t },
      ],
    });
  }

  return {
    type: "fade_from_black",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: `fade=t=in:st=0:d=${config.durationS}`,
    canvasInstructions,
    aiCost: 0,
  };
}

function generateCrossDissolve(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];

  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    canvasInstructions.push({
      frameIndex: i,
      timeS: i / config.fps,
      operations: [
        { type: "draw_image", source: "outgoing", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: 1 - t },
        { type: "draw_image", source: "incoming", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: t },
      ],
    });
  }

  return {
    type: "cross_dissolve",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: `[0:v][1:v]xfade=transition=fade:duration=${config.durationS}:offset=0`,
    canvasInstructions,
    aiCost: 0,
  };
}

function generateWipe(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];
  const dir = config.wipeDirection || "left_to_right";

  for (let i = 0; i < frameCount; i++) {
    const t = frameCount > 1 ? i / (frameCount - 1) : 1;
    const ops: CanvasOperation[] = [
      { type: "draw_image", source: "outgoing", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: 1 },
    ];

    // Clip the incoming image based on wipe direction
    let clipX = 0, clipY = 0, clipW = config.outputWidth, clipH = config.outputHeight;
    switch (dir) {
      case "left_to_right":
        clipW = Math.round(config.outputWidth * t);
        break;
      case "right_to_left":
        clipX = Math.round(config.outputWidth * (1 - t));
        clipW = Math.round(config.outputWidth * t);
        break;
      case "top_to_bottom":
        clipH = Math.round(config.outputHeight * t);
        break;
      case "bottom_to_top":
        clipY = Math.round(config.outputHeight * (1 - t));
        clipH = Math.round(config.outputHeight * t);
        break;
    }

    ops.push({ type: "clip_rect", x: clipX, y: clipY, width: clipW, height: clipH });
    ops.push({ type: "draw_image", source: "incoming", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, alpha: 1 });

    canvasInstructions.push({ frameIndex: i, timeS: i / config.fps, operations: ops });
  }

  const xfadeTransition = dir.startsWith("left") || dir.startsWith("right") ? "wipeleft" : "wipeup";

  return {
    type: "wipe",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: `[0:v][1:v]xfade=transition=${xfadeTransition}:duration=${config.durationS}:offset=0`,
    canvasInstructions,
    aiCost: 0,
  };
}

function generateTitleCard(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];
  const text = config.titleText || "Chapter";
  const fadeInFrames = Math.ceil(frameCount * 0.2);
  const fadeOutFrames = Math.ceil(frameCount * 0.2);
  const holdFrames = frameCount - fadeInFrames - fadeOutFrames;

  for (let i = 0; i < frameCount; i++) {
    let alpha = 1;
    if (i < fadeInFrames) {
      alpha = i / fadeInFrames;
    } else if (i >= fadeInFrames + holdFrames) {
      alpha = 1 - (i - fadeInFrames - holdFrames) / fadeOutFrames;
    }

    canvasInstructions.push({
      frameIndex: i,
      timeS: i / config.fps,
      operations: [
        { type: "fill_rect", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, color: config.backgroundColor, alpha: 1 },
        {
          type: "draw_text",
          text,
          x: config.outputWidth / 2,
          y: config.outputHeight / 2,
          font: config.titleFont || "bold 64px sans-serif",
          color: "#ffffff",
          alpha: Math.max(0, Math.min(1, alpha)),
          align: "center",
        },
      ],
    });
  }

  return {
    type: "title_card",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: [
      `color=c=black:s=${config.outputWidth}x${config.outputHeight}:d=${config.durationS}`,
      `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=${config.titleFontSize}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    ].join(","),
    canvasInstructions,
    aiCost: 0,
  };
}

function generateMangaPanelReveal(config: Required<TransitionConfig>, frameCount: number): CompositingInstruction {
  const canvasInstructions: CanvasInstruction[] = [];
  const panels = config.panelCount || 4;

  // Grid layout: 2 columns
  const cols = 2;
  const rows = Math.ceil(panels / cols);
  const panelW = config.outputWidth / cols;
  const panelH = config.outputHeight / rows;

  // Each panel reveals sequentially with slight overlap
  const panelDuration = frameCount / panels;
  const overlapFrames = Math.ceil(panelDuration * 0.3);

  for (let i = 0; i < frameCount; i++) {
    const ops: CanvasOperation[] = [
      { type: "fill_rect", x: 0, y: 0, width: config.outputWidth, height: config.outputHeight, color: "#ffffff", alpha: 1 },
    ];

    // Determine which panels are visible at this frame
    for (let p = 0; p < panels; p++) {
      const panelStart = p * (panelDuration - overlapFrames);
      const panelProgress = Math.max(0, Math.min(1, (i - panelStart) / panelDuration));

      if (panelProgress > 0) {
        const col = p % cols;
        const row = Math.floor(p / cols);
        const x = col * panelW;
        const y = row * panelH;

        // Scale-in effect
        const scale = 0.8 + 0.2 * panelProgress;
        const scaledW = panelW * scale;
        const scaledH = panelH * scale;
        const offsetX = x + (panelW - scaledW) / 2;
        const offsetY = y + (panelH - scaledH) / 2;

        ops.push({
          type: "clip_rect",
          x: Math.round(offsetX),
          y: Math.round(offsetY),
          width: Math.round(scaledW),
          height: Math.round(scaledH),
        });
        ops.push({
          type: "draw_image",
          source: "incoming",
          x: 0,
          y: 0,
          width: config.outputWidth,
          height: config.outputHeight,
          alpha: panelProgress,
        });
      }
    }

    canvasInstructions.push({ frameIndex: i, timeS: i / config.fps, operations: ops });
  }

  return {
    type: "manga_panel_reveal",
    frameCount,
    durationS: config.durationS,
    ffmpegFilter: `[0:v][1:v]xfade=transition=fade:duration=${config.durationS}:offset=0`,
    canvasInstructions,
    aiCost: 0,
  };
}
