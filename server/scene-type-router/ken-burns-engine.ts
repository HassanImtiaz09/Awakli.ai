/**
 * Prompt 20 — Ken Burns Engine
 *
 * Generates frame-by-frame affine transform parameters for establishing shots.
 * 5 movement types: slow zoom in, slow zoom out, pan left/right, pan up/down, combo pan+zoom.
 * Zero AI cost — all transforms are programmatic.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type KenBurnsMovement =
  | "slow_zoom_in"
  | "slow_zoom_out"
  | "pan_left_to_right"
  | "pan_right_to_left"
  | "pan_up_to_down"
  | "pan_down_to_up"
  | "combo_pan_zoom";

export interface KenBurnsParams {
  movement: KenBurnsMovement;
  durationS: number;
  fps: number;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  // Movement-specific parameters
  startScale: number;
  endScale: number;
  startX: number;       // 0.0 – 1.0 normalized center X
  startY: number;       // 0.0 – 1.0 normalized center Y
  endX: number;
  endY: number;
  easing: "linear" | "ease_in_out" | "ease_out";
}

export interface FrameTransform {
  frameIndex: number;
  timeS: number;
  scale: number;
  centerX: number;      // pixel coordinates
  centerY: number;
  cropX: number;        // top-left crop position in source image
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export interface KenBurnsResult {
  params: KenBurnsParams;
  totalFrames: number;
  frames: FrameTransform[];
  ffmpegFilter: string;  // Ready-to-use ffmpeg filter_complex string
}

// ─── Movement Presets ───────────────────────────────────────────────────

export interface MovementPreset {
  movement: KenBurnsMovement;
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationRange: [number, number];  // min, max seconds
  useCase: string;
}

export const MOVEMENT_PRESETS: Record<KenBurnsMovement, MovementPreset> = {
  slow_zoom_in: {
    movement: "slow_zoom_in",
    startScale: 1.0,
    endScale: 1.15,
    startX: 0.5,
    startY: 0.4,
    endX: 0.5,
    endY: 0.4,
    durationRange: [4, 6],
    useCase: "Approaching building, focusing on detail",
  },
  slow_zoom_out: {
    movement: "slow_zoom_out",
    startScale: 1.15,
    endScale: 1.0,
    startX: 0.5,
    startY: 0.5,
    endX: 0.5,
    endY: 0.5,
    durationRange: [4, 6],
    useCase: "Revealing landscape, pulling back from detail",
  },
  pan_left_to_right: {
    movement: "pan_left_to_right",
    startScale: 1.1,
    endScale: 1.1,
    startX: 0.3,
    startY: 0.5,
    endX: 0.7,
    endY: 0.5,
    durationRange: [3, 5],
    useCase: "Sweeping cityscape, horizontal reveal",
  },
  pan_right_to_left: {
    movement: "pan_right_to_left",
    startScale: 1.1,
    endScale: 1.1,
    startX: 0.7,
    startY: 0.5,
    endX: 0.3,
    endY: 0.5,
    durationRange: [3, 5],
    useCase: "Reverse sweep, following movement",
  },
  pan_up_to_down: {
    movement: "pan_up_to_down",
    startScale: 1.1,
    endScale: 1.1,
    startX: 0.5,
    startY: 0.3,
    endX: 0.5,
    endY: 0.7,
    durationRange: [3, 5],
    useCase: "Revealing tower, descending view",
  },
  pan_down_to_up: {
    movement: "pan_down_to_up",
    startScale: 1.1,
    endScale: 1.1,
    startX: 0.5,
    startY: 0.7,
    endX: 0.5,
    endY: 0.3,
    durationRange: [3, 5],
    useCase: "Looking up at building, ascending view",
  },
  combo_pan_zoom: {
    movement: "combo_pan_zoom",
    startScale: 1.0,
    endScale: 1.2,
    startX: 0.3,
    startY: 0.6,
    endX: 0.6,
    endY: 0.4,
    durationRange: [5, 8],
    useCase: "Dramatic establishing shot, sweeping and zooming",
  },
};

// ─── Scene Context for Auto-Selection ───────────────────────────────────

export interface SceneContext {
  location?: string;
  mood?: string;
  timeOfDay?: string;
  visualDescription?: string;
}

// ─── Movement Auto-Selection ────────────────────────────────────────────

const ZOOM_IN_KEYWORDS = ["approaching", "entering", "close", "detail", "focus", "narrow"];
const ZOOM_OUT_KEYWORDS = ["revealing", "wide", "panorama", "vast", "expansive", "overview", "landscape"];
const PAN_HORIZONTAL_KEYWORDS = ["city", "cityscape", "street", "horizon", "skyline", "coast", "shore"];
const PAN_VERTICAL_KEYWORDS = ["tower", "building", "tall", "mountain", "cliff", "waterfall", "skyscraper"];
const DRAMATIC_KEYWORDS = ["dramatic", "epic", "grand", "majestic", "imposing", "awe"];

/**
 * Auto-select Ken Burns movement type based on scene context.
 */
export function selectMovement(context: SceneContext): KenBurnsMovement {
  const text = [
    context.location || "",
    context.mood || "",
    context.timeOfDay || "",
    context.visualDescription || "",
  ].join(" ").toLowerCase();

  // Check dramatic first (combo)
  if (DRAMATIC_KEYWORDS.some(kw => text.includes(kw))) return "combo_pan_zoom";

  // Check vertical panning
  if (PAN_VERTICAL_KEYWORDS.some(kw => text.includes(kw))) {
    return text.includes("up") || text.includes("ascend") ? "pan_down_to_up" : "pan_up_to_down";
  }

  // Check horizontal panning
  if (PAN_HORIZONTAL_KEYWORDS.some(kw => text.includes(kw))) return "pan_left_to_right";

  // Check zoom in
  if (ZOOM_IN_KEYWORDS.some(kw => text.includes(kw))) return "slow_zoom_in";

  // Check zoom out
  if (ZOOM_OUT_KEYWORDS.some(kw => text.includes(kw))) return "slow_zoom_out";

  // Default: slow zoom in (most cinematic for establishing shots)
  return "slow_zoom_in";
}

// ─── Easing Functions ───────────────────────────────────────────────────

function easeLinear(t: number): number {
  return t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function getEasingFn(easing: KenBurnsParams["easing"]): (t: number) => number {
  switch (easing) {
    case "ease_in_out": return easeInOut;
    case "ease_out": return easeOut;
    default: return easeLinear;
  }
}

// ─── Ken Burns Parameter Generation ─────────────────────────────────────

/**
 * Generate full Ken Burns parameters from a movement type and scene context.
 */
export function generateKenBurnsParams(
  movement: KenBurnsMovement,
  options: {
    durationS?: number;
    fps?: number;
    sourceWidth?: number;
    sourceHeight?: number;
    outputWidth?: number;
    outputHeight?: number;
    easing?: KenBurnsParams["easing"];
  } = {},
): KenBurnsParams {
  const preset = MOVEMENT_PRESETS[movement];
  const durationS = options.durationS ?? (preset.durationRange[0] + preset.durationRange[1]) / 2;
  const fps = options.fps ?? 24;

  return {
    movement,
    durationS,
    fps,
    sourceWidth: options.sourceWidth ?? 2048,
    sourceHeight: options.sourceHeight ?? 2048,
    outputWidth: options.outputWidth ?? 1920,
    outputHeight: options.outputHeight ?? 1080,
    startScale: preset.startScale,
    endScale: preset.endScale,
    startX: preset.startX,
    startY: preset.startY,
    endX: preset.endX,
    endY: preset.endY,
    easing: options.easing ?? "ease_in_out",
  };
}

// ─── Frame Transform Generation ─────────────────────────────────────────

/**
 * Generate per-frame transforms for the Ken Burns effect.
 * Each frame specifies the crop region in the source image.
 */
export function generateFrameTransforms(params: KenBurnsParams): FrameTransform[] {
  const totalFrames = Math.ceil(params.durationS * params.fps);
  const easingFn = getEasingFn(params.easing);
  const frames: FrameTransform[] = [];

  const outputAspect = params.outputWidth / params.outputHeight;

  for (let i = 0; i < totalFrames; i++) {
    const t = totalFrames > 1 ? i / (totalFrames - 1) : 0;
    const easedT = easingFn(t);

    // Interpolate scale and center
    const scale = params.startScale + (params.endScale - params.startScale) * easedT;
    const normCenterX = params.startX + (params.endX - params.startX) * easedT;
    const normCenterY = params.startY + (params.endY - params.startY) * easedT;

    // Calculate crop dimensions (viewport size decreases as scale increases)
    const cropHeight = params.sourceHeight / scale;
    const cropWidth = cropHeight * outputAspect;

    // Convert normalized center to pixel coordinates
    const centerX = normCenterX * params.sourceWidth;
    const centerY = normCenterY * params.sourceHeight;

    // Calculate top-left crop position, clamped to source bounds
    let cropX = Math.max(0, centerX - cropWidth / 2);
    let cropY = Math.max(0, centerY - cropHeight / 2);

    // Clamp to prevent going outside source image
    cropX = Math.min(cropX, params.sourceWidth - cropWidth);
    cropY = Math.min(cropY, params.sourceHeight - cropHeight);

    // Ensure non-negative
    cropX = Math.max(0, cropX);
    cropY = Math.max(0, cropY);

    frames.push({
      frameIndex: i,
      timeS: i / params.fps,
      scale,
      centerX,
      centerY,
      cropX: Math.round(cropX),
      cropY: Math.round(cropY),
      cropWidth: Math.round(Math.min(cropWidth, params.sourceWidth)),
      cropHeight: Math.round(Math.min(cropHeight, params.sourceHeight)),
    });
  }

  return frames;
}

// ─── ffmpeg Filter Generation ───────────────────────────────────────────

/**
 * Generate an ffmpeg filter_complex string for the Ken Burns effect.
 * Uses the zoompan filter for smooth animation.
 */
export function generateFfmpegFilter(params: KenBurnsParams): string {
  const totalFrames = Math.ceil(params.durationS * params.fps);

  // ffmpeg zoompan filter expressions
  // zoom: interpolates from startScale to endScale
  const zoomExpr = params.startScale === params.endScale
    ? `${params.startScale}`
    : `${params.startScale}+(${params.endScale}-${params.startScale})*on/${totalFrames}`;

  // x,y: interpolate center position
  const xExpr = params.startX === params.endX
    ? `(iw-iw/zoom)*${params.startX}`
    : `(iw-iw/zoom)*(${params.startX}+(${params.endX}-${params.startX})*on/${totalFrames})`;

  const yExpr = params.startY === params.endY
    ? `(ih-ih/zoom)*${params.startY}`
    : `(ih-ih/zoom)*(${params.startY}+(${params.endY}-${params.startY})*on/${totalFrames})`;

  return [
    `zoompan=z='${zoomExpr}'`,
    `x='${xExpr}'`,
    `y='${yExpr}'`,
    `d=${totalFrames}`,
    `s=${params.outputWidth}x${params.outputHeight}`,
    `fps=${params.fps}`,
  ].join(":");
}

// ─── Full Ken Burns Generation ──────────────────────────────────────────

/**
 * Generate the complete Ken Burns result including params, frames, and ffmpeg filter.
 */
export function applyKenBurns(
  movement: KenBurnsMovement,
  options?: Parameters<typeof generateKenBurnsParams>[1],
): KenBurnsResult {
  const params = generateKenBurnsParams(movement, options);
  const frames = generateFrameTransforms(params);
  const ffmpegFilter = generateFfmpegFilter(params);

  return {
    params,
    totalFrames: frames.length,
    frames,
    ffmpegFilter,
  };
}

/**
 * Auto-select movement and generate Ken Burns result from scene context.
 */
export function autoKenBurns(
  context: SceneContext,
  options?: Parameters<typeof generateKenBurnsParams>[1],
): KenBurnsResult {
  const movement = selectMovement(context);
  return applyKenBurns(movement, options);
}
