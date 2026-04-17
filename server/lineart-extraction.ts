/**
 * Prompt 22 — Lineart Extraction Engine
 *
 * 5-stage pipeline: Panel Isolation → Text/Bubble Removal → Lineart Extraction
 * → Line Cleanup → Resolution Matching.
 *
 * Two extraction methods:
 *   • Canny  — CPU-only, <100 ms, $0, hard mechanical edges
 *   • Anime2Sketch — GPU (RTX 4090), 2-3 s, $0.01-0.02, soft anime lines
 */

// ─── Types ──────────────────────────────────────────────────────────────

export type ExtractionMethod = "canny" | "anime2sketch";

export interface PanelIsolationResult {
  panelIndex: number;
  cropRegion: { x: number; y: number; w: number; h: number };
  areaPercent: number;
}

export interface TextRemovalResult {
  regionsDetected: number;
  regionsInpainted: number;
  method: "paddleocr_navierstokes";
  expandPx: number;
}

export interface LineartExtractionResult {
  method: ExtractionMethod;
  processingTimeMs: number;
  costUsd: number;
  outputResolution: { w: number; h: number };
  edgePixelCount: number;
  totalPixelCount: number;
  edgeDensity: number;
}

export interface LineCleanupResult {
  noisePixelsRemoved: number;
  gapsBridged: number;
  artifactsFiltered: number;
  skeletonized: boolean;
}

export interface ResolutionMatchResult {
  originalResolution: { w: number; h: number };
  targetResolution: { w: number; h: number };
  resamplingMethod: "lanczos";
  scaleFactor: number;
}

export interface ExtractionPipelineResult {
  panelIndex: number;
  method: ExtractionMethod;
  stages: {
    panelIsolation: PanelIsolationResult;
    textRemoval: TextRemovalResult;
    lineartExtraction: LineartExtractionResult;
    lineCleanup: LineCleanupResult;
    resolutionMatch: ResolutionMatchResult;
  };
  snrDb: number;
  totalProcessingTimeMs: number;
  totalCostUsd: number;
  storageUrl: string;
  sourcePanelUrl: string;
  resolutionW: number;
  resolutionH: number;
}

// ─── Constants ──────────────────────────────────────────────────────────

/** Canny edge detection parameters */
export const CANNY_CONFIG = {
  lowerThreshold: 50,
  upperThreshold: 150,
  gaussianKernel: 5,
  gaussianSigma: 1.0,
  processingTimeMs: { min: 30, max: 90 },
  costUsd: 0,
} as const;

/** Anime2Sketch model parameters */
export const ANIME2SKETCH_CONFIG = {
  modelId: "christopherm/anime2sketch",
  inputResolutions: [768, 1024] as readonly number[],
  processingTimeMs: { min: 2000, max: 3000 },
  costUsd: { min: 0.01, max: 0.02 },
  gpu: "RTX 4090",
} as const;

/** Line cleanup parameters */
export const CLEANUP_CONFIG = {
  erosionKernel: 1,
  erosionIterations: 1,
  dilationKernel: 1,
  dilationIterations: 1,
  closingKernel: 3,
  closingIterations: 1,
  minComponentArea: 10,
  maxGapBridgePx: 5,
} as const;

/** Text/bubble removal parameters */
export const TEXT_REMOVAL_CONFIG = {
  ocrMethod: "paddleocr" as const,
  inpaintMethod: "navierstokes" as const,
  inpaintRadius: 5,
  expandPx: 5,
} as const;

/** Target generation resolutions */
export const TARGET_RESOLUTIONS = [512, 768, 1024] as const;
export type TargetResolution = typeof TARGET_RESOLUTIONS[number];

/** Panel isolation thresholds */
export const PANEL_ISOLATION_CONFIG = {
  cannyLow: 30,
  cannyHigh: 200,
  minAreaPercent: 5,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// ─── Stage 1: Panel Isolation ───────────────────────────────────────────

export function simulatePanelIsolation(
  pageWidth: number,
  pageHeight: number,
  panelIndex: number,
  totalPanels: number,
): PanelIsolationResult {
  // Simulate dividing a page into panels
  const cols = totalPanels <= 2 ? totalPanels : Math.min(3, Math.ceil(totalPanels / 2));
  const rows = Math.ceil(totalPanels / cols);
  const col = panelIndex % cols;
  const row = Math.floor(panelIndex / cols);

  const panelW = Math.floor(pageWidth / cols);
  const panelH = Math.floor(pageHeight / rows);
  const areaPercent = roundTo((panelW * panelH) / (pageWidth * pageHeight) * 100, 1);

  return {
    panelIndex,
    cropRegion: {
      x: col * panelW,
      y: row * panelH,
      w: panelW,
      h: panelH,
    },
    areaPercent: Math.max(areaPercent, PANEL_ISOLATION_CONFIG.minAreaPercent + 1),
  };
}

// ─── Stage 2: Text/Bubble Removal ───────────────────────────────────────

export function simulateTextRemoval(panelIndex: number): TextRemovalResult {
  // Simulate detecting 1-4 text regions per panel
  const regionsDetected = Math.floor(Math.random() * 4) + 1;
  return {
    regionsDetected,
    regionsInpainted: regionsDetected,
    method: "paddleocr_navierstokes",
    expandPx: TEXT_REMOVAL_CONFIG.expandPx,
  };
}

// ─── Stage 3: Lineart Extraction ────────────────────────────────────────

export function simulateLineartExtraction(
  method: ExtractionMethod,
  panelWidth: number,
  panelHeight: number,
): LineartExtractionResult {
  const totalPixels = panelWidth * panelHeight;

  if (method === "canny") {
    const processingTimeMs = Math.round(
      randomInRange(CANNY_CONFIG.processingTimeMs.min, CANNY_CONFIG.processingTimeMs.max)
    );
    // Canny typically produces 5-15% edge density
    const edgeDensity = roundTo(randomInRange(0.05, 0.15), 4);
    const edgePixelCount = Math.round(totalPixels * edgeDensity);

    return {
      method: "canny",
      processingTimeMs,
      costUsd: CANNY_CONFIG.costUsd,
      outputResolution: { w: panelWidth, h: panelHeight },
      edgePixelCount,
      totalPixelCount: totalPixels,
      edgeDensity,
    };
  }

  // Anime2Sketch
  const processingTimeMs = Math.round(
    randomInRange(ANIME2SKETCH_CONFIG.processingTimeMs.min, ANIME2SKETCH_CONFIG.processingTimeMs.max)
  );
  const costUsd = roundTo(
    randomInRange(ANIME2SKETCH_CONFIG.costUsd.min, ANIME2SKETCH_CONFIG.costUsd.max), 4
  );
  // Anime2Sketch produces denser, softer lines: 8-20% edge density
  const edgeDensity = roundTo(randomInRange(0.08, 0.20), 4);
  const edgePixelCount = Math.round(totalPixels * edgeDensity);

  return {
    method: "anime2sketch",
    processingTimeMs,
    costUsd,
    outputResolution: { w: panelWidth, h: panelHeight },
    edgePixelCount,
    totalPixelCount: totalPixels,
    edgeDensity,
  };
}

// ─── Stage 4: Line Cleanup ──────────────────────────────────────────────

export function simulateLineCleanup(
  method: ExtractionMethod,
  edgePixelCount: number,
): LineCleanupResult {
  // Simulate noise removal: 2-8% of edge pixels are noise
  const noiseFraction = randomInRange(0.02, 0.08);
  const noisePixelsRemoved = Math.round(edgePixelCount * noiseFraction);

  // Simulate gap bridging: 5-20 gaps per panel
  const gapsBridged = Math.floor(randomInRange(5, 20));

  // Simulate artifact filtering: 3-15 small artifacts
  const artifactsFiltered = Math.floor(randomInRange(3, 15));

  return {
    noisePixelsRemoved,
    gapsBridged,
    artifactsFiltered,
    skeletonized: method === "canny", // Only Canny uses skeletonization
  };
}

// ─── Stage 5: Resolution Matching ───────────────────────────────────────

export function simulateResolutionMatch(
  currentW: number,
  currentH: number,
  targetRes?: TargetResolution,
): ResolutionMatchResult {
  // If no target specified, use the closest standard resolution
  const target = targetRes ?? (
    currentW >= 896 ? 1024 : currentW >= 640 ? 768 : 512
  ) as TargetResolution;

  // Maintain aspect ratio, fit within target square
  const aspect = currentW / currentH;
  let targetW: number, targetH: number;
  if (aspect >= 1) {
    targetW = target;
    targetH = Math.round(target / aspect);
  } else {
    targetH = target;
    targetW = Math.round(target * aspect);
  }

  const scaleFactor = roundTo(targetW / currentW, 4);

  return {
    originalResolution: { w: currentW, h: currentH },
    targetResolution: { w: targetW, h: targetH },
    resamplingMethod: "lanczos",
    scaleFactor,
  };
}

// ─── SNR Calculation ────────────────────────────────────────────────────

export function computeSnrDb(edgeDensity: number, method: ExtractionMethod): number {
  // SNR in dB: higher edge density with less noise = higher SNR
  // Anime2Sketch generally produces higher SNR due to model-based denoising
  const baseSnr = method === "anime2sketch" ? 22 : 18;
  // Edge density between 0.05-0.20 maps to ±5 dB variation
  const densityFactor = (edgeDensity - 0.10) * 50;
  const noise = randomInRange(-1, 1);
  return roundTo(Math.max(10, baseSnr + densityFactor + noise), 2);
}

// ─── Full Pipeline ──────────────────────────────────────────────────────

export function runExtractionPipeline(
  sourcePanelUrl: string,
  panelIndex: number,
  method: ExtractionMethod,
  pageWidth: number = 1600,
  pageHeight: number = 2400,
  totalPanelsOnPage: number = 4,
  targetResolution?: TargetResolution,
): ExtractionPipelineResult {
  // Stage 1: Panel Isolation
  const panelIsolation = simulatePanelIsolation(
    pageWidth, pageHeight, panelIndex % totalPanelsOnPage, totalPanelsOnPage
  );
  const panelW = panelIsolation.cropRegion.w;
  const panelH = panelIsolation.cropRegion.h;

  // Stage 2: Text/Bubble Removal
  const textRemoval = simulateTextRemoval(panelIndex);

  // Stage 3: Lineart Extraction
  const lineartExtraction = simulateLineartExtraction(method, panelW, panelH);

  // Stage 4: Line Cleanup
  const lineCleanup = simulateLineCleanup(method, lineartExtraction.edgePixelCount);

  // Stage 5: Resolution Matching
  const resolutionMatch = simulateResolutionMatch(panelW, panelH, targetResolution);

  // Compute SNR
  const snrDb = computeSnrDb(lineartExtraction.edgeDensity, method);

  // Total processing time: sum of all stages + overhead
  const stageOverheadMs = 50; // I/O, serialization
  const totalProcessingTimeMs = lineartExtraction.processingTimeMs + stageOverheadMs;

  // Generate a simulated storage URL
  const storageUrl = `https://storage.awakli.ai/lineart/${Date.now()}_panel${panelIndex}_${method}.png`;

  return {
    panelIndex,
    method,
    stages: {
      panelIsolation,
      textRemoval,
      lineartExtraction,
      lineCleanup,
      resolutionMatch,
    },
    snrDb,
    totalProcessingTimeMs,
    totalCostUsd: lineartExtraction.costUsd,
    storageUrl,
    sourcePanelUrl,
    resolutionW: resolutionMatch.targetResolution.w,
    resolutionH: resolutionMatch.targetResolution.h,
  };
}

// ─── Method Selection by Scene Type ─────────────────────────────────────

export const SCENE_TYPE_EXTRACTION_DEFAULTS: Record<string, ExtractionMethod> = {
  dialogue: "anime2sketch",
  action: "canny",
  establishing: "canny",
  reaction: "anime2sketch",
  montage: "anime2sketch",
  transition: "canny",
};

export function getDefaultExtractionMethod(sceneType: string): ExtractionMethod {
  return SCENE_TYPE_EXTRACTION_DEFAULTS[sceneType] ?? "anime2sketch";
}
