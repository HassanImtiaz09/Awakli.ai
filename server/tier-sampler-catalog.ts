/**
 * Prompt 23 — Tier Sampler Catalog
 *
 * Defines the canonical visual (V01-V12) and audio (A01-A08) archetypes,
 * sample generation workflow, and retrieval helpers.
 */

// ─── Types ─────────────────────────────────────────────────────────────

export type Modality = "visual" | "audio";
export type GenreVariant = "action" | "slice_of_life" | "atmospheric" | "neutral";
export type OutcomeClass = "success" | "partial_success" | "expected_failure";

export type FailureMode =
  | "morph_artifact"
  | "character_drift"
  | "motion_stall"
  | "composition_drift"
  | "audio_clipping"
  | "tone_mismatch"
  | "other";

export interface VisualArchetype {
  id: string; // V01-V12
  name: string;
  sceneType: string;
  description: string;
}

export interface AudioArchetype {
  id: string; // A01-A08
  name: string;
  sampleLine: string;
  purpose: string;
}

export interface SampleCandidate {
  archetypeId: string;
  tier: number;
  provider: string;
  genreVariant: GenreVariant;
  seed: number;
  qualityScore: number; // 1-5
  failureMode: FailureMode | null;
  representativeness: "typical" | "above_average" | "below_average";
  storageUrl: string;
  thumbnailUrl: string | null;
  durationMs: number | null;
  creditsConsumed: number;
}

export interface BatchSpec {
  archetypes: string[];
  tiers: number[];
  providers: string[];
  genreVariants: GenreVariant[];
  totalTargets: number;
  overGenerationFactor: number; // 5-8 candidates per target
  estimatedTotalCandidates: number;
  estimatedCostUsd: number;
}

export interface SampleRetrievalResult {
  archetypeId: string;
  tier: number;
  genreVariant: GenreVariant;
  successes: SampleCandidate[];
  failures: SampleCandidate[];
}

// ─── Constants ─────────────────────────────────────────────────────────

export const VISUAL_ARCHETYPES: VisualArchetype[] = [
  { id: "V01", name: "Dialogue — close-up", sceneType: "dialogue", description: "Single character speaking directly to camera, neutral emotion." },
  { id: "V02", name: "Dialogue — two-shot", sceneType: "dialogue", description: "Two characters in conversation, shoulder-framed." },
  { id: "V03", name: "Dialogue — emotional", sceneType: "dialogue", description: "Single character speaking with strong emotion (tears / anger)." },
  { id: "V04", name: "Action — punch", sceneType: "action", description: "Single-frame impact between two characters." },
  { id: "V05", name: "Action — running", sceneType: "action", description: "Character running across frame with motion blur." },
  { id: "V06", name: "Action — multi-character combat", sceneType: "action", description: "3+ characters in choreographed combat." },
  { id: "V07", name: "Establishing — city", sceneType: "establishing", description: "Wide urban environment with Ken Burns pan." },
  { id: "V08", name: "Establishing — natural", sceneType: "establishing", description: "Wide forest/mountain/sea landscape with camera push-in." },
  { id: "V09", name: "Reaction — surprise", sceneType: "reaction", description: "Character reaction shot with exaggerated expression." },
  { id: "V10", name: "Reaction — subtle", sceneType: "reaction", description: "Character reaction with understated expression change." },
  { id: "V11", name: "Montage — time-lapse", sceneType: "montage", description: "Rapid-cut training/study sequence." },
  { id: "V12", name: "Transition — scene change", sceneType: "transition", description: "Cross-dissolve or graphic wipe between environments." },
];

export const AUDIO_ARCHETYPES: AudioArchetype[] = [
  { id: "A01", name: "Neutral", sampleLine: "The meeting starts at nine tomorrow.", purpose: "Baseline dialogue tone." },
  { id: "A02", name: "Emotional — sad", sampleLine: "I thought you would never come back.", purpose: "Crying/restrained tone." },
  { id: "A03", name: "Emotional — angry", sampleLine: "You have no idea what you have done.", purpose: "Suppressed anger." },
  { id: "A04", name: "Shouted", sampleLine: "Everyone get out of the building!", purpose: "Projection and urgency." },
  { id: "A05", name: "Whispered", sampleLine: "Do not let them hear us.", purpose: "Intimate low volume." },
  { id: "A06", name: "Narration", sampleLine: "And so the long winter began.", purpose: "Storyteller voice." },
  { id: "A07", name: "Laughter", sampleLine: "I can't believe you actually did that.", purpose: "Affective laughter." },
  { id: "A08", name: "Monotone", sampleLine: "The report is on your desk.", purpose: "Deliberately flat delivery." },
];

export const ALL_ARCHETYPES = [...VISUAL_ARCHETYPES.map(a => a.id), ...AUDIO_ARCHETYPES.map(a => a.id)];

export const GENRE_VARIANTS: GenreVariant[] = ["action", "slice_of_life", "atmospheric", "neutral"];

export const QUALITY_TIERS = [1, 2, 3, 4, 5] as const;

export const TIER_LABELS: Record<number, string> = {
  1: "Basic",
  2: "Standard",
  3: "Professional",
  4: "Premium",
  5: "Ultra",
};

export const VISUAL_PROVIDERS = ["animatediff_v3", "kling_2_6", "runway_gen3", "stable_video_xt"] as const;
export const AUDIO_PROVIDERS = ["elevenlabs_turbo", "cartesia_sonic", "fish_audio"] as const;

export const FAILURE_MODES: FailureMode[] = [
  "morph_artifact", "character_drift", "motion_stall",
  "composition_drift", "audio_clipping", "tone_mismatch", "other",
];

export const FAILURE_MODE_LABELS: Record<FailureMode, string> = {
  morph_artifact: "Morph Artifact",
  character_drift: "Character Drift",
  motion_stall: "Motion Stall",
  composition_drift: "Composition Drift",
  audio_clipping: "Audio Clipping",
  tone_mismatch: "Tone Mismatch",
  other: "Other",
};

/** Typical cost per sample generation by tier */
const COST_PER_SAMPLE: Record<number, number> = {
  1: 0.50, 2: 1.00, 3: 2.00, 4: 3.50, 5: 5.00,
};

/** Typical failure rates by tier */
export const TIER_FAILURE_RATES: Record<number, number> = {
  1: 0.25, 2: 0.18, 3: 0.12, 4: 0.07, 5: 0.03,
};

// ─── Batch Specification ───────────────────────────────────────────────

/**
 * Generate a batch specification for the quarterly refresh cycle.
 * Default: 12 visual archetypes × 4 tiers × 3 genre variants = 144 visual
 *        + 8 audio archetypes × 3 providers × 3 quality levels = 72 audio
 *        = 216 total targets
 */
export function generateSampleBatchSpec(
  archetypes?: string[],
  tiers?: number[],
  providers?: string[],
  genreVariants?: GenreVariant[],
  overGenerationFactor = 6,
): BatchSpec {
  const archList = archetypes ?? ALL_ARCHETYPES;
  const tierList = tiers ?? [1, 2, 3, 4, 5];
  const providerList = providers ?? [...VISUAL_PROVIDERS, ...AUDIO_PROVIDERS];
  const genreList = genreVariants ?? ["action", "slice_of_life", "atmospheric"];

  // Visual: archetypes × tiers × genres
  const visualArchetypes = archList.filter(a => a.startsWith("V"));
  const audioArchetypes = archList.filter(a => a.startsWith("A"));

  const visualTargets = visualArchetypes.length * tierList.length * genreList.length;
  const audioTargets = audioArchetypes.length * providerList.filter(p =>
    (AUDIO_PROVIDERS as readonly string[]).includes(p)
  ).length * Math.min(tierList.length, 3);

  const totalTargets = visualTargets + audioTargets;
  const estimatedTotalCandidates = totalTargets * overGenerationFactor;

  // Average cost: ~$2-3 per sample
  const avgCostPerSample = tierList.reduce((sum, t) => sum + (COST_PER_SAMPLE[t] ?? 2), 0) / tierList.length;
  const estimatedCostUsd = Math.round(estimatedTotalCandidates * avgCostPerSample * 100) / 100;

  return {
    archetypes: archList,
    tiers: tierList,
    providers: providerList,
    genreVariants: genreList,
    totalTargets,
    overGenerationFactor,
    estimatedTotalCandidates,
    estimatedCostUsd,
  };
}

// ─── Sample Generation (Simulated) ────────────────────────────────────

/** Generate a simulated seed */
function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Simulate over-generation of candidates for a single target.
 * In production, this would call the actual generation pipeline.
 */
export function simulateSampleGeneration(
  archetypeId: string,
  tier: number,
  provider: string,
  genreVariant: GenreVariant,
  candidateCount = 6,
): SampleCandidate[] {
  const isVisual = archetypeId.startsWith("V");
  const failureRate = TIER_FAILURE_RATES[tier] ?? 0.15;

  return Array.from({ length: candidateCount }, (_, i) => {
    const isFailure = Math.random() < failureRate;
    const qualityBase = tier + (isFailure ? -1.5 : 0);
    const qualityScore = Math.max(1, Math.min(5, Math.round(qualityBase + (Math.random() - 0.5))));

    const failureMode: FailureMode | null = isFailure
      ? FAILURE_MODES[Math.floor(Math.random() * (isVisual ? 4 : 6)) % FAILURE_MODES.length]
      : null;

    const representativeness = isFailure
      ? "below_average" as const
      : qualityScore >= tier + 1
        ? "above_average" as const
        : "typical" as const;

    return {
      archetypeId,
      tier,
      provider,
      genreVariant,
      seed: randomSeed(),
      qualityScore,
      failureMode,
      representativeness,
      storageUrl: `https://cdn.awakli.ai/samples/${archetypeId}/${tier}/${genreVariant}/${provider}_seed${randomSeed()}.${isVisual ? "mp4" : "mp3"}`,
      thumbnailUrl: isVisual
        ? `https://cdn.awakli.ai/samples/${archetypeId}/${tier}/${genreVariant}/thumb_${i}.jpg`
        : null,
      durationMs: isVisual ? 3000 + Math.floor(Math.random() * 5000) : 1500 + Math.floor(Math.random() * 3000),
      creditsConsumed: COST_PER_SAMPLE[tier] ?? 2.0,
    };
  });
}

/**
 * Label a candidate with quality assessment.
 * In production, this would be done by the data labeling team.
 */
export function labelCandidate(candidate: SampleCandidate): SampleCandidate & {
  outcomeClass: OutcomeClass;
  isRepresentative: boolean;
} {
  let outcomeClass: OutcomeClass;
  if (candidate.failureMode) {
    outcomeClass = "expected_failure";
  } else if (candidate.qualityScore >= candidate.tier) {
    outcomeClass = "success";
  } else {
    outcomeClass = "partial_success";
  }

  // Representative = typical quality, not cherry-picked
  const isRepresentative = candidate.representativeness === "typical";

  return { ...candidate, outcomeClass, isRepresentative };
}

// ─── Sample Retrieval ──────────────────────────────────────────────────

/**
 * Get samples for a specific archetype×tier combination.
 * Returns 2-3 successes and 1 failure (the standard display format).
 * In production, this reads from the tier_samples table.
 */
export function getSamplesForArchetype(
  archetypeId: string,
  tier: number,
  genreVariant: GenreVariant = "neutral",
): SampleRetrievalResult {
  const archetype = VISUAL_ARCHETYPES.find(a => a.id === archetypeId)
    ?? AUDIO_ARCHETYPES.find(a => a.id === archetypeId);

  if (!archetype) {
    return { archetypeId, tier, genreVariant, successes: [], failures: [] };
  }

  const isVisual = archetypeId.startsWith("V");
  const provider = isVisual ? "kling_2_6" : "elevenlabs_turbo";

  // Generate and label candidates
  const candidates = simulateSampleGeneration(archetypeId, tier, provider, genreVariant, 8);
  const labeled = candidates.map(labelCandidate);

  // Select 2-3 representative successes
  const successes = labeled
    .filter(c => c.outcomeClass === "success" && c.isRepresentative)
    .slice(0, 3);

  // If not enough representative successes, include partial successes
  if (successes.length < 2) {
    const partials = labeled
      .filter(c => c.outcomeClass === "partial_success" || (c.outcomeClass === "success" && !c.isRepresentative))
      .slice(0, 3 - successes.length);
    successes.push(...partials);
  }

  // Select 1 representative failure
  const failures = labeled
    .filter(c => c.outcomeClass === "expected_failure")
    .slice(0, 1);

  return { archetypeId, tier, genreVariant, successes, failures };
}

/**
 * Get voice samples for the provider × quality grid.
 */
export function getSamplesForVoice(
  archetypeId: string,
  provider: string,
  qualityLevel: number,
): SampleCandidate[] {
  const candidates = simulateSampleGeneration(archetypeId, qualityLevel, provider, "neutral", 4);
  return candidates.filter(c => !c.failureMode).slice(0, 2);
}

/**
 * Get all visual archetypes for a given scene type.
 */
export function getArchetypesForSceneType(sceneType: string): VisualArchetype[] {
  return VISUAL_ARCHETYPES.filter(a => a.sceneType === sceneType);
}

/**
 * Get archetype by ID.
 */
export function getArchetypeById(id: string): VisualArchetype | AudioArchetype | undefined {
  return VISUAL_ARCHETYPES.find(a => a.id === id) ?? AUDIO_ARCHETYPES.find(a => a.id === id);
}
