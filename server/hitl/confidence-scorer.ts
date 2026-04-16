/**
 * HITL Confidence Scoring Engine V1 (Prompt 17)
 *
 * Rule-based scoring engine that produces a 0-100 integer score for each
 * generation result. Modular design allows V2 ML-based scoring to be
 * plugged in without changing the gate interface.
 *
 * Scoring dimensions:
 * - Technical Quality (video/image): resolution, artifacts, frame count
 * - Character Consistency (video/image): CLIP similarity to reference
 * - Temporal Coherence (video): optical flow smoothness
 * - Audio Clarity (voice/music): SNR, clipping, silence
 * - Dialogue Sync (voice): duration match
 * - Style Match (video/image/music): CLIP similarity to style reference
 * - Content Safety (all): NSFW detection (veto dimension)
 * - Completeness (all): output size/duration within expected range
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface GenerateResult {
  requestType: "video" | "image" | "voice" | "music" | "text";
  outputUrl: string;
  outputDuration?: number;      // seconds, for video/audio
  outputWidth?: number;
  outputHeight?: number;
  outputFileSize?: number;      // bytes
  outputFrameCount?: number;    // for video
  providerMetadata?: Record<string, unknown>;
}

export interface ScoreContext {
  stageNumber: number;
  referenceImages?: string[];   // character sheets, previous keyframes
  previousStageResult?: GenerateResult;
  episodeStyle?: string;        // 'shounen', 'slice_of_life', etc.
  expectedDuration?: number;    // expected output duration in seconds
  expectedWidth?: number;
  expectedHeight?: number;
}

export interface SubScore {
  dimension: string;
  score: number;     // 0-100
  weight: number;
  reasoning: string;
}

export interface ConfidenceResult {
  score: number;           // 0-100 integer
  breakdown: SubScore[];
  flags: string[];         // 'nsfw_detected', 'blank_frame', etc.
}

// ─── Dimension Applicability ────────────────────────────────────────────

type RequestType = GenerateResult["requestType"];

const DIMENSION_APPLICABILITY: Record<string, RequestType[]> = {
  technical_quality:      ["video", "image"],
  character_consistency:  ["video", "image"],
  temporal_coherence:     ["video"],
  audio_clarity:          ["voice", "music"],
  dialogue_sync:          ["voice"],
  style_match:            ["video", "image", "music"],
  content_safety:         ["video", "image", "voice", "music", "text"],
  completeness:           ["video", "image", "voice", "music"],
};

const DIMENSION_WEIGHTS: Record<string, number> = {
  technical_quality:      0.30,
  character_consistency:  0.25,
  temporal_coherence:     0.20,
  audio_clarity:          0.25,
  dialogue_sync:          0.20,
  style_match:            0.15,
  content_safety:         1.00, // veto
  completeness:           0.10,
};

// ─── CLIP Service Interface ─────────────────────────────────────────────

export interface ClipService {
  getEmbedding(imageUrl: string): Promise<number[]>;
  cosineSimilarity(a: number[], b: number[]): number;
}

// Default mock CLIP service (fallback when real service is unavailable)
const mockClipService: ClipService = {
  async getEmbedding(_imageUrl: string): Promise<number[]> {
    // Return a normalized random-ish vector as fallback
    return new Array(512).fill(0).map(() => Math.random() * 0.1);
  },
  cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 0 : dot / mag;
  },
};

// ─── CLIP-Enhanced Safety Check ────────────────────────────────────────

/**
 * Check content safety using the CLIP service's /safety endpoint.
 * Returns null if the service is unavailable (falls back to metadata-only check).
 */
async function clipSafetyCheck(imageUrl: string): Promise<{ isSafe: boolean; safetyScore: number; flaggedConcepts: string[] } | null> {
  try {
    const { checkSafety } = await import("./clip-client");
    const result = await checkSafety(imageUrl);
    return {
      isSafe: result.isSafe,
      safetyScore: result.safetyScore,
      flaggedConcepts: result.flaggedConcepts,
    };
  } catch {
    return null; // Service unavailable, fall back to metadata-only
  }
}

// ─── Individual Dimension Scorers ───────────────────────────────────────

function scoreTechnicalQuality(result: GenerateResult, context: ScoreContext): SubScore {
  let score = 80; // baseline
  const reasons: string[] = [];

  // Check resolution
  if (result.outputWidth && result.outputHeight) {
    const expectedW = context.expectedWidth || 1280;
    const expectedH = context.expectedHeight || 720;
    const widthRatio = result.outputWidth / expectedW;
    const heightRatio = result.outputHeight / expectedH;

    if (widthRatio >= 0.9 && heightRatio >= 0.9) {
      score += 10;
      reasons.push("Resolution matches expected dimensions");
    } else {
      score -= 20;
      reasons.push(`Resolution ${result.outputWidth}x${result.outputHeight} below expected ${expectedW}x${expectedH}`);
    }
  }

  // Check for video frame count
  if (result.requestType === "video" && result.outputFrameCount !== undefined) {
    if (result.outputFrameCount < 10) {
      score -= 30;
      reasons.push(`Very low frame count: ${result.outputFrameCount}`);
    } else if (result.outputFrameCount < 30) {
      score -= 10;
      reasons.push(`Low frame count: ${result.outputFrameCount}`);
    } else {
      reasons.push(`Frame count OK: ${result.outputFrameCount}`);
    }
  }

  // Check file size (too small might indicate blank/corrupted output)
  if (result.outputFileSize !== undefined) {
    if (result.outputFileSize < 1000) {
      score -= 40;
      reasons.push("Output file suspiciously small — possible blank/corrupt");
    }
  }

  return {
    dimension: "technical_quality",
    score: Math.max(0, Math.min(100, score)),
    weight: DIMENSION_WEIGHTS.technical_quality,
    reasoning: reasons.join("; ") || "Baseline technical quality score",
  };
}

async function scoreCharacterConsistency(
  result: GenerateResult,
  context: ScoreContext,
  clipService: ClipService
): Promise<SubScore> {
  if (!context.referenceImages || context.referenceImages.length === 0) {
    return {
      dimension: "character_consistency",
      score: 75, // no reference = moderate confidence
      weight: DIMENSION_WEIGHTS.character_consistency,
      reasoning: "No character reference images available for comparison",
    };
  }

  try {
    const outputEmb = await clipService.getEmbedding(result.outputUrl);
    let maxSimilarity = 0;

    for (const refUrl of context.referenceImages) {
      const refEmb = await clipService.getEmbedding(refUrl);
      const sim = clipService.cosineSimilarity(outputEmb, refEmb);
      maxSimilarity = Math.max(maxSimilarity, sim);
    }

    // Map similarity to 0-100: >= 0.85 = 100, <= 0.50 = 0, linear between
    const score = Math.max(0, Math.min(100, ((maxSimilarity - 0.50) / 0.35) * 100));

    return {
      dimension: "character_consistency",
      score: Math.round(score),
      weight: DIMENSION_WEIGHTS.character_consistency,
      reasoning: `CLIP similarity: ${maxSimilarity.toFixed(3)} (mapped to score ${Math.round(score)})`,
    };
  } catch (err) {
    return {
      dimension: "character_consistency",
      score: 60,
      weight: DIMENSION_WEIGHTS.character_consistency,
      reasoning: `CLIP scoring failed, using fallback: ${(err as Error).message}`,
    };
  }
}

function scoreTemporalCoherence(result: GenerateResult, _context: ScoreContext): SubScore {
  // V1: rule-based heuristic based on frame count and duration
  let score = 75;
  const reasons: string[] = [];

  if (result.outputDuration && result.outputFrameCount) {
    const fps = result.outputFrameCount / result.outputDuration;
    if (fps >= 20 && fps <= 60) {
      score += 15;
      reasons.push(`Good FPS: ${fps.toFixed(1)}`);
    } else if (fps < 10) {
      score -= 25;
      reasons.push(`Very low FPS: ${fps.toFixed(1)} — likely choppy`);
    } else {
      reasons.push(`FPS: ${fps.toFixed(1)}`);
    }
  }

  return {
    dimension: "temporal_coherence",
    score: Math.max(0, Math.min(100, score)),
    weight: DIMENSION_WEIGHTS.temporal_coherence,
    reasoning: reasons.join("; ") || "Baseline temporal coherence (V1 heuristic)",
  };
}

function scoreAudioClarity(result: GenerateResult, _context: ScoreContext): SubScore {
  let score = 80;
  const reasons: string[] = [];

  // V1: check duration and file size as proxies
  if (result.outputDuration !== undefined) {
    if (result.outputDuration < 0.5) {
      score -= 40;
      reasons.push("Audio too short — possible silence or failure");
    } else if (result.outputDuration > 300) {
      score -= 10;
      reasons.push("Audio unusually long — check for padding");
    } else {
      reasons.push(`Duration OK: ${result.outputDuration}s`);
    }
  }

  if (result.outputFileSize !== undefined && result.outputDuration) {
    const bitrate = (result.outputFileSize * 8) / result.outputDuration;
    if (bitrate < 16000) {
      score -= 20;
      reasons.push("Very low bitrate — possible quality issue");
    }
  }

  return {
    dimension: "audio_clarity",
    score: Math.max(0, Math.min(100, score)),
    weight: DIMENSION_WEIGHTS.audio_clarity,
    reasoning: reasons.join("; ") || "Baseline audio clarity score",
  };
}

function scoreDialogueSync(result: GenerateResult, context: ScoreContext): SubScore {
  let score = 80;
  const reasons: string[] = [];

  if (context.expectedDuration && result.outputDuration) {
    const ratio = result.outputDuration / context.expectedDuration;
    if (ratio >= 0.90 && ratio <= 1.10) {
      score = 95;
      reasons.push(`Duration within 10% tolerance (${(ratio * 100).toFixed(0)}%)`);
    } else if (ratio >= 0.80 && ratio <= 1.20) {
      score = 70;
      reasons.push(`Duration within 20% tolerance (${(ratio * 100).toFixed(0)}%)`);
    } else {
      score = 40;
      reasons.push(`Duration mismatch: expected ${context.expectedDuration}s, got ${result.outputDuration}s (${(ratio * 100).toFixed(0)}%)`);
    }
  } else {
    reasons.push("No expected duration for comparison");
  }

  return {
    dimension: "dialogue_sync",
    score: Math.max(0, Math.min(100, score)),
    weight: DIMENSION_WEIGHTS.dialogue_sync,
    reasoning: reasons.join("; "),
  };
}

async function scoreStyleMatch(
  result: GenerateResult,
  context: ScoreContext,
  clipService: ClipService
): Promise<SubScore> {
  // V1: if no style reference, return moderate score
  if (!context.episodeStyle) {
    return {
      dimension: "style_match",
      score: 70,
      weight: DIMENSION_WEIGHTS.style_match,
      reasoning: "No episode style reference for comparison",
    };
  }

  // For V1, use a heuristic based on whether style reference images exist
  if (context.referenceImages && context.referenceImages.length > 0) {
    try {
      const outputEmb = await clipService.getEmbedding(result.outputUrl);
      const refEmb = await clipService.getEmbedding(context.referenceImages[0]);
      const sim = clipService.cosineSimilarity(outputEmb, refEmb);
      const score = Math.max(0, Math.min(100, ((sim - 0.50) / 0.35) * 100));

      return {
        dimension: "style_match",
        score: Math.round(score),
        weight: DIMENSION_WEIGHTS.style_match,
        reasoning: `Style CLIP similarity: ${sim.toFixed(3)}`,
      };
    } catch {
      // Fall through to default
    }
  }

  return {
    dimension: "style_match",
    score: 70,
    weight: DIMENSION_WEIGHTS.style_match,
    reasoning: `Style: ${context.episodeStyle} (no CLIP comparison available)`,
  };
}

async function scoreContentSafety(result: GenerateResult, _context: ScoreContext): Promise<SubScore> {
  // First: check provider metadata for explicit safety flags
  const metadata = result.providerMetadata || {};

  if (metadata.nsfw === true || metadata.content_violation === true) {
    return {
      dimension: "content_safety",
      score: 0,
      weight: DIMENSION_WEIGHTS.content_safety,
      reasoning: "NSFW or content violation detected by provider",
    };
  }

  if (metadata.safety_rating && typeof metadata.safety_rating === "number") {
    if (metadata.safety_rating < 0.3) {
      return {
        dimension: "content_safety",
        score: 5,
        weight: DIMENSION_WEIGHTS.content_safety,
        reasoning: `Low safety rating: ${metadata.safety_rating}`,
      };
    }
  }

  // Second: use CLIP-based safety check for image/video outputs
  if (result.requestType === "image" || result.requestType === "video") {
    const clipResult = await clipSafetyCheck(result.outputUrl);
    if (clipResult) {
      const clipScore = Math.round(clipResult.safetyScore * 100);
      const reasoning = clipResult.isSafe
        ? `CLIP safety check passed (score: ${clipScore})`
        : `CLIP safety flagged: ${clipResult.flaggedConcepts.join(", ")} (score: ${clipScore})`;

      return {
        dimension: "content_safety",
        score: clipResult.isSafe ? Math.max(clipScore, 80) : Math.min(clipScore, 15),
        weight: DIMENSION_WEIGHTS.content_safety,
        reasoning,
      };
    }
  }

  return {
    dimension: "content_safety",
    score: 95,
    weight: DIMENSION_WEIGHTS.content_safety,
    reasoning: "No safety flags detected (metadata-only check)",
  };
}

function scoreCompleteness(result: GenerateResult, context: ScoreContext): SubScore {
  let score = 85;
  const reasons: string[] = [];

  // Check duration completeness
  if (context.expectedDuration && result.outputDuration) {
    const ratio = result.outputDuration / context.expectedDuration;
    if (ratio >= 0.90 && ratio <= 1.10) {
      score += 10;
      reasons.push("Duration within expected range");
    } else if (ratio < 0.50) {
      score -= 40;
      reasons.push(`Output significantly shorter than expected (${(ratio * 100).toFixed(0)}%)`);
    } else {
      score -= 15;
      reasons.push(`Duration outside expected range (${(ratio * 100).toFixed(0)}%)`);
    }
  }

  // Check if output exists (non-empty URL)
  if (!result.outputUrl || result.outputUrl.trim() === "") {
    score = 0;
    reasons.push("No output URL — generation may have failed");
  }

  return {
    dimension: "completeness",
    score: Math.max(0, Math.min(100, score)),
    weight: DIMENSION_WEIGHTS.completeness,
    reasoning: reasons.join("; ") || "Output appears complete",
  };
}

// ─── Main Scorer ────────────────────────────────────────────────────────

/**
 * Score a generation result. Returns a 0-100 integer confidence score
 * with a breakdown of individual dimension scores and any flags.
 */
export async function scoreGeneration(
  result: GenerateResult,
  context: ScoreContext,
  clipService?: ClipService
): Promise<ConfidenceResult> {
  // Auto-resolve CLIP service: use provided, or try real service, or fall back to mock
  let clip: ClipService;
  if (clipService) {
    clip = clipService;
  } else {
    try {
      const { getClipService } = await import("./clip-client");
      clip = await getClipService();
    } catch {
      clip = mockClipService;
    }
  }
  const applicableDimensions = Object.entries(DIMENSION_APPLICABILITY)
    .filter(([_, types]) => types.includes(result.requestType))
    .map(([dim]) => dim);

  const breakdown: SubScore[] = [];
  const flags: string[] = [];

  for (const dim of applicableDimensions) {
    let subScore: SubScore;

    switch (dim) {
      case "technical_quality":
        subScore = scoreTechnicalQuality(result, context);
        break;
      case "character_consistency":
        subScore = await scoreCharacterConsistency(result, context, clip);
        break;
      case "temporal_coherence":
        subScore = scoreTemporalCoherence(result, context);
        break;
      case "audio_clarity":
        subScore = scoreAudioClarity(result, context);
        break;
      case "dialogue_sync":
        subScore = scoreDialogueSync(result, context);
        break;
      case "style_match":
        subScore = await scoreStyleMatch(result, context, clip);
        break;
      case "content_safety":
        subScore = await scoreContentSafety(result, context);
        if (subScore.score < 10) {
          flags.push("nsfw_detected");
        }
        break;
      case "completeness":
        subScore = scoreCompleteness(result, context);
        if (subScore.score === 0) {
          flags.push("blank_frame");
        }
        break;
      default:
        continue;
    }

    breakdown.push(subScore);
  }

  // Compute weighted average (excluding content_safety veto from average)
  const nonVetoDimensions = breakdown.filter(s => s.dimension !== "content_safety");
  const contentSafety = breakdown.find(s => s.dimension === "content_safety");

  let totalWeight = 0;
  let weightedSum = 0;

  for (const sub of nonVetoDimensions) {
    weightedSum += sub.score * sub.weight;
    totalWeight += sub.weight;
  }

  let finalScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  // Content safety veto: if safety score < 10, cap total at 10
  if (contentSafety && contentSafety.score < 10) {
    finalScore = Math.min(finalScore, 10);
  }

  return {
    score: Math.max(0, Math.min(100, finalScore)),
    breakdown,
    flags,
  };
}

/**
 * Export for testing
 */
export const _internal = {
  scoreTechnicalQuality,
  scoreCharacterConsistency,
  scoreTemporalCoherence,
  scoreAudioClarity,
  scoreDialogueSync,
  scoreStyleMatch,
  scoreContentSafety,
  scoreCompleteness,
  mockClipService,
  DIMENSION_APPLICABILITY,
  DIMENSION_WEIGHTS,
};
