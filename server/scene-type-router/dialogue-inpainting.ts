/**
 * Prompt 20 — Dialogue Inpainting Sub-Pipeline
 *
 * Replaces full video generation for dialogue scenes (60% of episode).
 * Pipeline: base frame → face landmarks → viseme mapping → mouth inpainting →
 *           blink overlays → head motion → RIFE interpolation → assembly.
 *
 * Cost: ~0.06-0.08 credits per 10s vs 2.60 credits (97% savings).
 */

// ─── Viseme Types ───────────────────────────────────────────────────────

/**
 * 8 viseme shapes for mouth inpainting.
 * Language-agnostic — maps from phonemes to visual mouth shapes.
 */
export type Viseme = "A" | "I" | "U" | "E" | "O" | "Closed" | "N" | "Rest";

export const ALL_VISEMES: Viseme[] = ["A", "I", "U", "E", "O", "Closed", "N", "Rest"];

/**
 * Phoneme-to-viseme mapping table.
 * Covers IPA phonemes used across Japanese, English, Korean, and Chinese.
 */
export const PHONEME_TO_VISEME: Record<string, Viseme> = {
  // Open vowels → A
  "a": "A", "ɑ": "A", "æ": "A", "ɐ": "A",
  // Front close vowels → I
  "i": "I", "ɪ": "I", "iː": "I",
  // Back rounded vowels → U
  "u": "U", "ʊ": "U", "uː": "U", "ɯ": "U",
  // Mid vowels → E
  "e": "E", "ɛ": "E", "eː": "E", "ə": "E", "ɜ": "E",
  // Rounded mid vowels → O
  "o": "O", "ɔ": "O", "oː": "O",
  // Nasal consonants → N
  "m": "N", "n": "N", "ŋ": "N", "ɲ": "N",
  // Plosives (closed mouth) → Closed
  "p": "Closed", "b": "Closed", "t": "Closed", "d": "Closed",
  "k": "Closed", "g": "Closed", "ʔ": "Closed",
  // Fricatives → E (slightly open)
  "f": "E", "v": "E", "s": "E", "z": "E",
  "ʃ": "E", "ʒ": "E", "θ": "E", "ð": "E",
  "h": "E", "ç": "E", "x": "E",
  // Approximants → I
  "j": "I", "w": "U", "ɹ": "E", "l": "E",
  // Affricates → Closed then E
  "tʃ": "Closed", "dʒ": "Closed", "ts": "Closed", "dz": "Closed",
  // Silence → Rest
  "": "Rest", "sil": "Rest", "sp": "Rest",
};

/**
 * Convert a phoneme to its viseme shape.
 * Falls back to "Rest" for unknown phonemes.
 */
export function phonemeToViseme(phoneme: string): Viseme {
  return PHONEME_TO_VISEME[phoneme.toLowerCase()] ?? "Rest";
}

// ─── Face Landmark Types ────────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  /** Bounding box of the mouth region (for inpainting crop) */
  mouthBox: BoundingBox;
  /** Bounding boxes of left and right eye regions (for blink overlay) */
  leftEyeBox: BoundingBox;
  rightEyeBox: BoundingBox;
  /** Head center point and rotation angle in degrees */
  headCenter: Point2D;
  headRotationDeg: number;
  /** Nose tip for reference alignment */
  noseTip: Point2D;
  /** Overall face bounding box */
  faceBox: BoundingBox;
  /** Confidence of landmark detection (0-1) */
  confidence: number;
}

/**
 * Face landmark detector interface.
 * In production, backed by MediaPipe Face Mesh or similar.
 * Can be mocked for testing.
 */
export interface FaceLandmarkDetector {
  /**
   * Detect face landmarks in an image.
   * Returns null if no face is detected.
   */
  detect(imageUrl: string): Promise<FaceLandmarks | null>;

  /**
   * Detect face landmarks in multiple images (batch).
   */
  detectBatch(imageUrls: string[]): Promise<(FaceLandmarks | null)[]>;
}

// ─── Dialogue Timing Types ──────────────────────────────────────────────

export interface DialogueLine {
  character: string;
  text: string;
  emotion?: string;
  startTimeS: number;
  endTimeS: number;
}

export interface PhonemeTimestamp {
  phoneme: string;
  startTimeS: number;
  endTimeS: number;
}

export interface VisemeFrame {
  viseme: Viseme;
  frameIndex: number;
  timeS: number;
  durationS: number;
}

// ─── Inpainting Pipeline Types ──────────────────────────────────────────

export interface DialogueSceneConfig {
  /** Scene duration in seconds */
  durationS: number;
  /** Target FPS for inpainting (8fps, then RIFE to 24fps) */
  inpaintFps: number;
  /** Final output FPS after RIFE interpolation */
  outputFps: number;
  /** Mouth inpainting region size (square) */
  mouthRegionSize: number;
  /** Camera angles to generate base frames for */
  cameraAngles: string[];
  /** Dialogue lines with timing */
  dialogueLines: DialogueLine[];
  /** Character reference images for IP-Adapter */
  characterReferences: Record<string, string>;  // characterName → imageUrl
}

export interface BaseFrameResult {
  cameraAngle: string;
  imageUrl: string;
  landmarks: FaceLandmarks | null;
  characterPositions: Record<string, BoundingBox>;
  creditsUsed: number;
}

export interface InpaintingFrame {
  frameIndex: number;
  timeS: number;
  viseme: Viseme;
  character: string;
  mouthRegion: BoundingBox;
  inpaintedUrl?: string;  // filled after inpainting
  creditsUsed: number;
}

export interface BlinkEvent {
  startFrameIndex: number;
  endFrameIndex: number;  // typically 3 frames
  character: string;
  eyeRegion: BoundingBox;
}

export interface HeadMotionFrame {
  frameIndex: number;
  rotationDeg: number;   // -3 to +3 degrees
  translationX: number;  // -5 to +5 pixels
  translationY: number;  // -5 to +5 pixels
}

// ─── Pipeline Stage Results ─────────────────────────────────────────────

export interface DialoguePipelineResult {
  stages: DialogueStageResult[];
  totalCredits: number;
  totalFrames: number;
  durationS: number;
  outputFps: number;
}

export interface DialogueStageResult {
  stageName: string;
  creditsUsed: number;
  framesProduced: number;
  durationMs: number;
  artifacts: string[];  // URLs of produced artifacts
}

// ─── Default Config ─────────────────────────────────────────────────────

export const DEFAULT_DIALOGUE_CONFIG: Partial<DialogueSceneConfig> = {
  inpaintFps: 8,
  outputFps: 24,
  mouthRegionSize: 256,
};

// ─── Viseme Timeline Generation ─────────────────────────────────────────

/**
 * Generate viseme frames from phoneme timestamps at the target FPS.
 * This is the core timing engine for mouth inpainting.
 */
export function generateVisemeTimeline(
  phonemes: PhonemeTimestamp[],
  durationS: number,
  fps: number,
): VisemeFrame[] {
  const totalFrames = Math.ceil(durationS * fps);
  const frames: VisemeFrame[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const timeS = i / fps;
    const frameDurationS = 1 / fps;

    // Find the active phoneme at this time
    const activePhoneme = phonemes.find(
      p => timeS >= p.startTimeS && timeS < p.endTimeS,
    );

    const viseme = activePhoneme
      ? phonemeToViseme(activePhoneme.phoneme)
      : "Rest";

    frames.push({
      viseme,
      frameIndex: i,
      timeS,
      durationS: frameDurationS,
    });
  }

  return frames;
}

// ─── Blink Schedule Generation ──────────────────────────────────────────

/**
 * Generate natural blink events every 3-5 seconds with 3-frame duration.
 * Blinks are alpha-blended overlays, no AI cost.
 */
export function generateBlinkSchedule(
  durationS: number,
  fps: number,
  character: string,
  eyeRegion: BoundingBox,
): BlinkEvent[] {
  const events: BlinkEvent[] = [];
  const blinkDurationFrames = 3;
  const minIntervalS = 3;
  const maxIntervalS = 5;

  let currentTimeS = minIntervalS + Math.random() * (maxIntervalS - minIntervalS);

  while (currentTimeS < durationS - 0.5) {
    const startFrame = Math.floor(currentTimeS * fps);
    events.push({
      startFrameIndex: startFrame,
      endFrameIndex: startFrame + blinkDurationFrames,
      character,
      eyeRegion,
    });

    // Next blink in 3-5 seconds
    currentTimeS += minIntervalS + Math.random() * (maxIntervalS - minIntervalS);
  }

  return events;
}

// ─── Head Motion Generation ─────────────────────────────────────────────

/**
 * Generate subtle head motion (1-3 degrees rotation, 2-5px translation).
 * Uses sinusoidal curves for natural movement. No AI cost.
 */
export function generateHeadMotion(
  durationS: number,
  fps: number,
): HeadMotionFrame[] {
  const totalFrames = Math.ceil(durationS * fps);
  const frames: HeadMotionFrame[] = [];

  // Use multiple sine waves at different frequencies for natural motion
  const rotFreq = 0.3 + Math.random() * 0.2;   // 0.3-0.5 Hz
  const transXFreq = 0.15 + Math.random() * 0.1; // 0.15-0.25 Hz
  const transYFreq = 0.1 + Math.random() * 0.1;  // 0.1-0.2 Hz

  const rotAmp = 1 + Math.random() * 2;    // 1-3 degrees
  const transXAmp = 2 + Math.random() * 3; // 2-5 pixels
  const transYAmp = 1 + Math.random() * 2; // 1-3 pixels

  // Random phase offsets
  const rotPhase = Math.random() * Math.PI * 2;
  const transXPhase = Math.random() * Math.PI * 2;
  const transYPhase = Math.random() * Math.PI * 2;

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;

    frames.push({
      frameIndex: i,
      rotationDeg: rotAmp * Math.sin(2 * Math.PI * rotFreq * t + rotPhase),
      translationX: transXAmp * Math.sin(2 * Math.PI * transXFreq * t + transXPhase),
      translationY: transYAmp * Math.sin(2 * Math.PI * transYFreq * t + transYPhase),
    });
  }

  return frames;
}

// ─── Cost Estimation ────────────────────────────────────────────────────

export interface DialogueCostEstimate {
  baseFrameCredits: number;
  inpaintingCredits: number;
  rifeCredits: number;
  totalCredits: number;
  comparedToFullVideo: number;
  savingsPercent: number;
}

/**
 * Estimate the cost of the dialogue inpainting pipeline for a scene.
 */
export function estimateDialogueCost(
  durationS: number,
  cameraAngleCount: number,
  inpaintFps: number = 8,
): DialogueCostEstimate {
  // Base frame generation: ~0.015 credits per frame via local_controlnet + local_ip_adapter
  const baseFrameCredits = cameraAngleCount * 0.015;

  // Mouth inpainting: ~0.001 credits per frame (256x256 region, very cheap)
  const inpaintFrameCount = Math.ceil(durationS * inpaintFps);
  const inpaintingCredits = inpaintFrameCount * 0.001;

  // RIFE interpolation: ~0.01 credits per 10s
  const rifeCredits = (durationS / 10) * 0.01;

  const totalCredits = baseFrameCredits + inpaintingCredits + rifeCredits;

  // Full video comparison: ~0.26 credits per second (Kling 2.6)
  const fullVideoCredits = durationS * 0.26;

  return {
    baseFrameCredits: Math.round(baseFrameCredits * 10000) / 10000,
    inpaintingCredits: Math.round(inpaintingCredits * 10000) / 10000,
    rifeCredits: Math.round(rifeCredits * 10000) / 10000,
    totalCredits: Math.round(totalCredits * 10000) / 10000,
    comparedToFullVideo: Math.round(fullVideoCredits * 10000) / 10000,
    savingsPercent: Math.round((1 - totalCredits / fullVideoCredits) * 100),
  };
}

// ─── Pipeline Orchestration ─────────────────────────────────────────────

/**
 * Plan the full dialogue inpainting pipeline.
 * Returns a structured plan that can be executed by the pipeline executor.
 */
export function planDialoguePipeline(config: DialogueSceneConfig): DialoguePipelinePlan {
  const fullConfig = { ...DEFAULT_DIALOGUE_CONFIG, ...config };
  const fps = fullConfig.inpaintFps!;
  const totalInpaintFrames = Math.ceil(fullConfig.durationS * fps);
  const totalOutputFrames = Math.ceil(fullConfig.durationS * fullConfig.outputFps!);

  return {
    config: fullConfig as DialogueSceneConfig,
    stages: [
      {
        name: "base_frame_generation",
        description: "Generate one base frame per camera angle",
        provider: "local_controlnet",
        fallbackProvider: "local_ip_adapter",
        estimatedCredits: fullConfig.cameraAngles.length * 0.015,
        frameCount: fullConfig.cameraAngles.length,
      },
      {
        name: "face_landmark_detection",
        description: "Extract mouth, eye, and head regions from base frames",
        provider: "mediapipe_face_mesh",
        fallbackProvider: null,
        estimatedCredits: 0,  // Local processing
        frameCount: fullConfig.cameraAngles.length,
      },
      {
        name: "viseme_inpainting",
        description: `Inpaint mouth region (${fullConfig.mouthRegionSize}x${fullConfig.mouthRegionSize}) per viseme at ${fps}fps`,
        provider: "local_controlnet",
        fallbackProvider: null,
        estimatedCredits: totalInpaintFrames * 0.001,
        frameCount: totalInpaintFrames,
      },
      {
        name: "blink_overlay",
        description: "Apply eye blink overlays (alpha blend, no AI)",
        provider: null,
        fallbackProvider: null,
        estimatedCredits: 0,
        frameCount: totalInpaintFrames,
      },
      {
        name: "head_motion",
        description: "Apply head bobbing via affine transforms (no AI)",
        provider: null,
        fallbackProvider: null,
        estimatedCredits: 0,
        frameCount: totalInpaintFrames,
      },
      {
        name: "rife_interpolation",
        description: `Interpolate ${fps}fps to ${fullConfig.outputFps}fps via RIFE`,
        provider: "local_rife",
        fallbackProvider: null,
        estimatedCredits: (fullConfig.durationS / 10) * 0.01,
        frameCount: totalOutputFrames,
      },
      {
        name: "assembly",
        description: "Composite all layers into final video",
        provider: null,
        fallbackProvider: null,
        estimatedCredits: 0,
        frameCount: totalOutputFrames,
      },
    ],
    totalInpaintFrames,
    totalOutputFrames,
    estimatedTotalCredits: estimateDialogueCost(
      fullConfig.durationS,
      fullConfig.cameraAngles.length,
      fps,
    ).totalCredits,
  };
}

export interface DialoguePipelinePlan {
  config: DialogueSceneConfig;
  stages: DialogueStagePlan[];
  totalInpaintFrames: number;
  totalOutputFrames: number;
  estimatedTotalCredits: number;
}

export interface DialogueStagePlan {
  name: string;
  description: string;
  provider: string | null;
  fallbackProvider: string | null;
  estimatedCredits: number;
  frameCount: number;
}

// ─── Assembly Instruction Types ─────────────────────────────────────────

export interface AssemblyInstruction {
  frameIndex: number;
  timeS: number;
  layers: AssemblyLayer[];
}

export type AssemblyLayer =
  | { type: "base_frame"; imageUrl: string }
  | { type: "mouth_inpaint"; imageUrl: string; region: BoundingBox }
  | { type: "blink_overlay"; alpha: number; region: BoundingBox }
  | { type: "head_transform"; rotationDeg: number; translationX: number; translationY: number };

/**
 * Generate assembly instructions for compositing all layers.
 * This is the final stage that combines base frame + inpainted mouth +
 * blink overlays + head motion into the output video.
 */
export function generateAssemblyInstructions(
  baseFrameUrl: string,
  visemeFrames: VisemeFrame[],
  blinkEvents: BlinkEvent[],
  headMotion: HeadMotionFrame[],
  mouthRegion: BoundingBox,
): AssemblyInstruction[] {
  const instructions: AssemblyInstruction[] = [];

  for (const vf of visemeFrames) {
    const layers: AssemblyLayer[] = [
      { type: "base_frame", imageUrl: baseFrameUrl },
    ];

    // Mouth inpainting layer (always present)
    layers.push({
      type: "mouth_inpaint",
      imageUrl: "", // filled during execution
      region: mouthRegion,
    });

    // Blink overlay (if active at this frame)
    const activeBlink = blinkEvents.find(
      b => vf.frameIndex >= b.startFrameIndex && vf.frameIndex <= b.endFrameIndex,
    );
    if (activeBlink) {
      const blinkProgress = (vf.frameIndex - activeBlink.startFrameIndex) /
        (activeBlink.endFrameIndex - activeBlink.startFrameIndex);
      // Bell curve: fully closed at midpoint
      const alpha = Math.sin(blinkProgress * Math.PI);
      layers.push({
        type: "blink_overlay",
        alpha,
        region: activeBlink.eyeRegion,
      });
    }

    // Head motion (always present)
    const hm = headMotion.find(h => h.frameIndex === vf.frameIndex);
    if (hm) {
      layers.push({
        type: "head_transform",
        rotationDeg: hm.rotationDeg,
        translationX: hm.translationX,
        translationY: hm.translationY,
      });
    }

    instructions.push({
      frameIndex: vf.frameIndex,
      timeS: vf.timeS,
      layers,
    });
  }

  return instructions;
}
