/**
 * Character Consistency Analysis Module
 *
 * Analyzes all generations using a character across episodes,
 * computing per-frame drift scores and flagging frames where
 * appearance drift exceeds a configurable threshold.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface FrameGeneration {
  generationId: number;
  episodeId: number;
  episodeNumber: number;
  episodeTitle: string;
  sceneId: number | null;
  sceneNumber: number | null;
  frameIndex: number;       // sequential index within episode
  resultUrl: string;
  loraId: number | null;
  loraVersion: number | null;
  loraStrength: number | null;
  createdAt: Date | string;
}

export interface FrameDriftResult {
  generationId: number;
  episodeId: number;
  episodeNumber: number;
  episodeTitle: string;
  sceneId: number | null;
  sceneNumber: number | null;
  frameIndex: number;
  resultUrl: string;
  driftScore: number;         // 0.0 = identical to reference, 1.0 = completely different
  clipDrift: number;          // CLIP embedding distance from reference
  featureDrifts: FeatureDrift;
  isFlagged: boolean;
  severity: "ok" | "warning" | "critical";
  loraVersion: number | null;
  loraStrength: number | null;
  timestamp: number;          // ms since epoch
}

export interface FeatureDrift {
  face: number;       // 0-1 drift in facial features
  hair: number;       // 0-1 drift in hair style/color
  outfit: number;     // 0-1 drift in clothing
  colorPalette: number; // 0-1 drift in overall color scheme
  bodyProportion: number; // 0-1 drift in body proportions
}

export interface EpisodeConsistency {
  episodeId: number;
  episodeNumber: number;
  episodeTitle: string;
  avgDrift: number;
  maxDrift: number;
  minDrift: number;
  stdDev: number;
  frameCount: number;
  flaggedCount: number;
  consistencyScore: number;   // 0-100 (100 = perfectly consistent)
  worstFrameId: number | null;
  loraVersionUsed: number | null;
}

export interface DriftTimelinePoint {
  generationId: number;
  frameIndex: number;         // global frame index across all episodes
  episodeId: number;
  episodeNumber: number;
  driftScore: number;
  isFlagged: boolean;
  timestamp: number;
}

export interface ConsistencyGrade {
  letter: "A" | "B" | "C" | "D" | "F";
  score: number;              // 0-100
  label: string;
  description: string;
}

export interface CharacterConsistencyReport {
  characterId: number;
  characterName: string;
  referenceSheetUrl: string | null;
  totalFrames: number;
  totalFlagged: number;
  avgDrift: number;
  maxDrift: number;
  grade: ConsistencyGrade;
  driftThreshold: number;
  timeline: DriftTimelinePoint[];
  episodes: EpisodeConsistency[];
  flaggedFrames: FrameDriftResult[];
  allFrames: FrameDriftResult[];
  generatedAt: number;
}

export interface FrameDriftDetail {
  frame: FrameDriftResult;
  referenceSheetUrl: string | null;
  nearestGoodFrame: FrameDriftResult | null;
  suggestions: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_DRIFT_THRESHOLD = 0.15;
export const WARNING_THRESHOLD_FACTOR = 0.7;  // 70% of threshold = warning
export const GRADE_THRESHOLDS = {
  A: 90,
  B: 75,
  C: 60,
  D: 45,
};

// Feature weights for composite drift score
const FEATURE_WEIGHTS = {
  face: 0.35,
  hair: 0.20,
  outfit: 0.20,
  colorPalette: 0.15,
  bodyProportion: 0.10,
};

// ─── Seeded RNG (deterministic per generation) ──────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── Core Functions ─────────────────────────────────────────────────────

/**
 * Compute per-feature drift for a single frame.
 * In production, this would use CLIP embeddings and feature extractors.
 * Currently simulates based on LoRA presence, strength, and generation order.
 */
export function computeFrameDrift(
  frame: FrameGeneration,
  characterQualityScore: number | null,
  referenceClipSimilarity: number | null,
): FrameDriftResult {
  const rng = seededRandom(frame.generationId * 7919 + (frame.episodeId ?? 0) * 31);

  // Base drift influenced by LoRA quality and strength
  const hasLora = frame.loraId !== null;
  const loraStrength = frame.loraStrength ?? 0.75;
  const qualityFactor = characterQualityScore != null ? characterQualityScore / 100 : 0.5;
  const clipBase = referenceClipSimilarity != null ? Number(referenceClipSimilarity) : 0.8;

  // Better LoRA = lower drift, no LoRA = higher drift
  const baseDrift = hasLora
    ? (1 - qualityFactor) * 0.3 * (1 - loraStrength * 0.5)
    : 0.2 + rng() * 0.15;

  // Per-feature drifts with some variance
  const featureDrifts: FeatureDrift = {
    face: Math.max(0, Math.min(1, baseDrift * (0.7 + rng() * 0.6))),
    hair: Math.max(0, Math.min(1, baseDrift * (0.8 + rng() * 0.5))),
    outfit: Math.max(0, Math.min(1, baseDrift * (0.6 + rng() * 0.8))),
    colorPalette: Math.max(0, Math.min(1, baseDrift * (0.5 + rng() * 0.6))),
    bodyProportion: Math.max(0, Math.min(1, baseDrift * (0.4 + rng() * 0.5))),
  };

  // Composite drift score (weighted average of features)
  const driftScore =
    featureDrifts.face * FEATURE_WEIGHTS.face +
    featureDrifts.hair * FEATURE_WEIGHTS.hair +
    featureDrifts.outfit * FEATURE_WEIGHTS.outfit +
    featureDrifts.colorPalette * FEATURE_WEIGHTS.colorPalette +
    featureDrifts.bodyProportion * FEATURE_WEIGHTS.bodyProportion;

  // CLIP drift is inverse of similarity, with noise
  const clipDrift = Math.max(0, Math.min(1, 1 - clipBase + baseDrift * 0.5 + (rng() - 0.5) * 0.05));

  const ts = frame.createdAt instanceof Date
    ? frame.createdAt.getTime()
    : new Date(frame.createdAt).getTime();

  return {
    generationId: frame.generationId,
    episodeId: frame.episodeId,
    episodeNumber: frame.episodeNumber,
    episodeTitle: frame.episodeTitle,
    sceneId: frame.sceneId,
    sceneNumber: frame.sceneNumber,
    frameIndex: frame.frameIndex,
    resultUrl: frame.resultUrl,
    driftScore: Math.round(driftScore * 10000) / 10000,
    clipDrift: Math.round(clipDrift * 10000) / 10000,
    featureDrifts,
    isFlagged: false,  // set by detectDriftSpikes
    severity: "ok",     // set by detectDriftSpikes
    loraVersion: frame.loraVersion,
    loraStrength: frame.loraStrength,
    timestamp: ts,
  };
}

/**
 * Flag frames that exceed the drift threshold.
 */
export function detectDriftSpikes(
  frames: FrameDriftResult[],
  threshold: number = DEFAULT_DRIFT_THRESHOLD,
): FrameDriftResult[] {
  const warningThreshold = threshold * WARNING_THRESHOLD_FACTOR;

  return frames.map(f => ({
    ...f,
    isFlagged: f.driftScore >= threshold,
    severity: f.driftScore >= threshold
      ? "critical" as const
      : f.driftScore >= warningThreshold
      ? "warning" as const
      : "ok" as const,
  }));
}

/**
 * Build a timeline of drift scores across all frames, ordered by episode and frame index.
 */
export function generateConsistencyTimeline(
  frames: FrameDriftResult[],
): DriftTimelinePoint[] {
  // Sort by episode number, then frame index
  const sorted = [...frames].sort((a, b) => {
    if (a.episodeNumber !== b.episodeNumber) return a.episodeNumber - b.episodeNumber;
    return a.frameIndex - b.frameIndex;
  });

  return sorted.map((f, globalIndex) => ({
    generationId: f.generationId,
    frameIndex: globalIndex,
    episodeId: f.episodeId,
    episodeNumber: f.episodeNumber,
    driftScore: f.driftScore,
    isFlagged: f.isFlagged,
    timestamp: f.timestamp,
  }));
}

/**
 * Compute consistency metrics for a single episode.
 */
export function computeEpisodeConsistency(
  episodeFrames: FrameDriftResult[],
): EpisodeConsistency | null {
  if (episodeFrames.length === 0) return null;

  const first = episodeFrames[0];
  const drifts = episodeFrames.map(f => f.driftScore);
  const sum = drifts.reduce((a, b) => a + b, 0);
  const avg = sum / drifts.length;
  const max = Math.max(...drifts);
  const min = Math.min(...drifts);

  // Standard deviation
  const variance = drifts.reduce((s, d) => s + (d - avg) ** 2, 0) / drifts.length;
  const stdDev = Math.sqrt(variance);

  const flaggedCount = episodeFrames.filter(f => f.isFlagged).length;

  // Consistency score: 100 = no drift, 0 = max drift
  // Penalize both average drift and variance
  const consistencyScore = Math.round(
    Math.max(0, Math.min(100, (1 - avg) * 80 + (1 - stdDev) * 20))
  );

  // Find worst frame
  const worstFrame = episodeFrames.reduce((worst, f) =>
    f.driftScore > (worst?.driftScore ?? 0) ? f : worst, episodeFrames[0]);

  // Detect LoRA version used (most common)
  const loraVersions = episodeFrames
    .map(f => f.loraVersion)
    .filter((v): v is number => v !== null);
  const loraVersionUsed = loraVersions.length > 0
    ? loraVersions.sort((a, b) =>
        loraVersions.filter(v => v === b).length - loraVersions.filter(v => v === a).length
      )[0]
    : null;

  return {
    episodeId: first.episodeId,
    episodeNumber: first.episodeNumber,
    episodeTitle: first.episodeTitle,
    avgDrift: Math.round(avg * 10000) / 10000,
    maxDrift: Math.round(max * 10000) / 10000,
    minDrift: Math.round(min * 10000) / 10000,
    stdDev: Math.round(stdDev * 10000) / 10000,
    frameCount: episodeFrames.length,
    flaggedCount,
    consistencyScore,
    worstFrameId: worstFrame?.generationId ?? null,
    loraVersionUsed,
  };
}

/**
 * Compute the overall consistency grade for a character.
 */
export function computeConsistencyGrade(
  avgDrift: number,
  flaggedRatio: number,
  episodeScores: number[],
): ConsistencyGrade {
  // Weighted score: 50% from avg drift, 30% from flagged ratio, 20% from episode consistency
  const driftComponent = (1 - avgDrift) * 100;
  const flaggedComponent = (1 - flaggedRatio) * 100;
  const episodeComponent = episodeScores.length > 0
    ? episodeScores.reduce((a, b) => a + b, 0) / episodeScores.length
    : 50;

  const score = Math.round(
    driftComponent * 0.5 + flaggedComponent * 0.3 + episodeComponent * 0.2
  );

  let letter: ConsistencyGrade["letter"];
  let label: string;
  let description: string;

  if (score >= GRADE_THRESHOLDS.A) {
    letter = "A";
    label = "Excellent";
    description = "Character appearance is highly consistent across all episodes. Minimal drift detected.";
  } else if (score >= GRADE_THRESHOLDS.B) {
    letter = "B";
    label = "Good";
    description = "Character appearance is mostly consistent with minor drift in some frames. Consider reviewing flagged frames.";
  } else if (score >= GRADE_THRESHOLDS.C) {
    letter = "C";
    label = "Fair";
    description = "Noticeable appearance drift in several frames. LoRA retraining or strength adjustment recommended.";
  } else if (score >= GRADE_THRESHOLDS.D) {
    letter = "D";
    label = "Poor";
    description = "Significant appearance inconsistency. Multiple frames show high drift. Retraining with more reference images strongly recommended.";
  } else {
    letter = "F";
    label = "Critical";
    description = "Severe appearance drift across episodes. Character is barely recognizable in many frames. Immediate LoRA retraining required.";
  }

  return { letter, score, label, description };
}

/**
 * Aggregate a full consistency report for a character.
 */
export function aggregateCharacterReport(
  characterId: number,
  characterName: string,
  referenceSheetUrl: string | null,
  generations: FrameGeneration[],
  characterQualityScore: number | null,
  referenceClipSimilarity: number | null,
  driftThreshold: number = DEFAULT_DRIFT_THRESHOLD,
): CharacterConsistencyReport {
  // 1. Compute drift for each frame
  const rawFrames = generations.map(g =>
    computeFrameDrift(g, characterQualityScore, referenceClipSimilarity)
  );

  // 2. Flag spikes
  const allFrames = detectDriftSpikes(rawFrames, driftThreshold);

  // 3. Build timeline
  const timeline = generateConsistencyTimeline(allFrames);

  // 4. Episode breakdown
  const episodeMap = new Map<number, FrameDriftResult[]>();
  for (const f of allFrames) {
    const arr = episodeMap.get(f.episodeId) ?? [];
    arr.push(f);
    episodeMap.set(f.episodeId, arr);
  }

  const episodes: EpisodeConsistency[] = [];
  for (const [, frames] of Array.from(episodeMap)) {
    const ep = computeEpisodeConsistency(frames);
    if (ep) episodes.push(ep);
  }
  episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);

  // 5. Flagged frames sorted by severity
  const flaggedFrames = allFrames
    .filter(f => f.isFlagged)
    .sort((a, b) => b.driftScore - a.driftScore);

  // 6. Overall metrics
  const totalFrames = allFrames.length;
  const totalFlagged = flaggedFrames.length;
  const avgDrift = totalFrames > 0
    ? allFrames.reduce((s, f) => s + f.driftScore, 0) / totalFrames
    : 0;
  const maxDrift = totalFrames > 0
    ? Math.max(...allFrames.map(f => f.driftScore))
    : 0;

  // 7. Grade
  const flaggedRatio = totalFrames > 0 ? totalFlagged / totalFrames : 0;
  const episodeScores = episodes.map(e => e.consistencyScore);
  const grade = computeConsistencyGrade(avgDrift, flaggedRatio, episodeScores);

  return {
    characterId,
    characterName,
    referenceSheetUrl,
    totalFrames,
    totalFlagged,
    avgDrift: Math.round(avgDrift * 10000) / 10000,
    maxDrift: Math.round(maxDrift * 10000) / 10000,
    grade,
    driftThreshold,
    timeline,
    episodes,
    flaggedFrames,
    allFrames,
    generatedAt: Date.now(),
  };
}

/**
 * Get detailed drift analysis for a single flagged frame.
 */
export function getFrameDriftDetail(
  frame: FrameDriftResult,
  allFrames: FrameDriftResult[],
  referenceSheetUrl: string | null,
): FrameDriftDetail {
  // Find nearest "good" frame (lowest drift in same episode)
  const sameEpisode = allFrames
    .filter(f => f.episodeId === frame.episodeId && !f.isFlagged && f.generationId !== frame.generationId)
    .sort((a, b) => a.driftScore - b.driftScore);

  const nearestGoodFrame = sameEpisode.length > 0 ? sameEpisode[0] : null;

  // Generate suggestions based on drift features
  const suggestions: string[] = [];

  if (frame.featureDrifts.face > 0.2) {
    suggestions.push("Face drift is high — consider increasing LoRA strength or retraining with more frontal face references.");
  }
  if (frame.featureDrifts.hair > 0.2) {
    suggestions.push("Hair style/color has drifted — ensure reference sheet includes clear hair views from multiple angles.");
  }
  if (frame.featureDrifts.outfit > 0.25) {
    suggestions.push("Outfit inconsistency detected — add outfit-specific reference images or use stronger negative prompts for clothing.");
  }
  if (frame.featureDrifts.colorPalette > 0.2) {
    suggestions.push("Color palette has shifted — this may be caused by scene lighting. Consider adding lighting-specific training images.");
  }
  if (frame.featureDrifts.bodyProportion > 0.15) {
    suggestions.push("Body proportions have changed — this is common in action scenes. Try using a higher LoRA rank for better anatomy preservation.");
  }
  if (frame.loraVersion === null) {
    suggestions.push("This frame was generated without a LoRA — train and activate a LoRA for this character to improve consistency.");
  }
  if (frame.loraStrength !== null && frame.loraStrength < 0.6) {
    suggestions.push(`LoRA strength is low (${frame.loraStrength}). Try increasing to 0.7-0.85 for better character fidelity.`);
  }

  if (suggestions.length === 0) {
    suggestions.push("Drift is within acceptable range for this feature set. No immediate action needed.");
  }

  return {
    frame,
    referenceSheetUrl,
    nearestGoodFrame,
    suggestions,
  };
}
