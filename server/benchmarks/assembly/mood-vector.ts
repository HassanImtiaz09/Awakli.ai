/**
 * Mood Vector — A1 Music Bed Prompt Extraction
 *
 * Extracts a mood vector from the Director's ProjectPlan emotion arc
 * and translates it into a MiniMax Music prompt. This replaces the
 * static default prompt in music-bed.ts with a dynamic, episode-aware one.
 *
 * The mood vector captures:
 * - Dominant emotion across the episode
 * - Emotion transitions (calm→tension→climax→resolution)
 * - Tempo/energy curve
 * - Instrumentation hints based on scene types
 */

export interface MoodVector {
  /** Primary mood keyword (e.g., "melancholic", "triumphant", "tense") */
  primaryMood: string;
  /** Secondary mood for contrast (e.g., "hopeful" in a mostly dark episode) */
  secondaryMood: string;
  /** Energy level 1-10 (1=ambient, 10=intense action) */
  energyLevel: number;
  /** Tempo hint */
  tempo: "slow" | "moderate" | "fast" | "variable";
  /** Instrumentation hints */
  instruments: string[];
  /** Whether the episode has a clear climax beat */
  hasClimax: boolean;
  /** Generated music prompt */
  musicPrompt: string;
}

// ─── Emotion → Music Mapping ────────────────────────────────────────────────

const EMOTION_MOOD_MAP: Record<string, { mood: string; energy: number; instruments: string[] }> = {
  calm:           { mood: "serene",       energy: 2, instruments: ["piano", "strings", "ambient pads"] },
  determination:  { mood: "resolute",     energy: 5, instruments: ["cello", "drums", "brass"] },
  awe:            { mood: "wonder",       energy: 4, instruments: ["choir", "strings", "harp"] },
  confrontation:  { mood: "intense",      energy: 8, instruments: ["taiko drums", "electric guitar", "brass stabs"] },
  resolution:     { mood: "triumphant",   energy: 6, instruments: ["full orchestra", "piano", "choir"] },
  tension:        { mood: "suspenseful",  energy: 6, instruments: ["low strings", "synth bass", "percussion"] },
  joy:            { mood: "uplifting",     energy: 5, instruments: ["piano", "acoustic guitar", "light percussion"] },
  sadness:        { mood: "melancholic",  energy: 3, instruments: ["solo violin", "piano", "rain ambiance"] },
  fear:           { mood: "ominous",      energy: 7, instruments: ["low brass", "dissonant strings", "heartbeat percussion"] },
  anger:          { mood: "aggressive",   energy: 9, instruments: ["distorted guitar", "heavy drums", "brass"] },
  hope:           { mood: "hopeful",      energy: 4, instruments: ["piano", "strings", "flute"] },
  mystery:        { mood: "enigmatic",    energy: 3, instruments: ["celesta", "low strings", "electronic textures"] },
  love:           { mood: "romantic",     energy: 3, instruments: ["piano", "violin", "harp"] },
  excitement:     { mood: "energetic",    energy: 7, instruments: ["synth", "drums", "brass"] },
};

const DEFAULT_MAPPING = { mood: "atmospheric", energy: 4, instruments: ["piano", "strings", "ambient pads"] };

// ─── Extract Mood Vector ────────────────────────────────────────────────────

export interface ProjectPlanEmotionData {
  /** The Director's emotion arc array (e.g., ["calm", "determination", "awe", "confrontation", "resolution"]) */
  emotionArc?: string[];
  /** Alternative: emotion_arc field name */
  emotion_arc?: string[];
  /** Scene types present in the episode */
  sceneTypes?: string[];
  /** Whether there's a stylised_action slice */
  hasActionSetpiece?: boolean;
}

export function extractMoodVector(plan: ProjectPlanEmotionData): MoodVector {
  const arc = plan.emotionArc || plan.emotion_arc || ["calm", "determination", "resolution"];

  // Count emotion frequencies
  const emotionCounts: Record<string, number> = {};
  for (const emotion of arc) {
    const normalised = emotion.toLowerCase().trim();
    emotionCounts[normalised] = (emotionCounts[normalised] || 0) + 1;
  }

  // Find dominant emotion
  const sorted = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);
  const dominantEmotion = sorted[0]?.[0] || "calm";
  const secondaryEmotion = sorted[1]?.[0] || "determination";

  const primaryMapping = EMOTION_MOOD_MAP[dominantEmotion] || DEFAULT_MAPPING;
  const secondaryMapping = EMOTION_MOOD_MAP[secondaryEmotion] || DEFAULT_MAPPING;

  // Calculate average energy
  const energies = arc.map((e) => (EMOTION_MOOD_MAP[e.toLowerCase().trim()] || DEFAULT_MAPPING).energy);
  const avgEnergy = Math.round(energies.reduce((a, b) => a + b, 0) / energies.length);

  // Determine tempo from energy curve
  const energyRange = Math.max(...energies) - Math.min(...energies);
  let tempo: MoodVector["tempo"] = "moderate";
  if (energyRange >= 5) tempo = "variable";
  else if (avgEnergy >= 7) tempo = "fast";
  else if (avgEnergy <= 3) tempo = "slow";

  // Check for climax
  const hasClimax = arc.some((e) =>
    ["confrontation", "anger", "excitement"].includes(e.toLowerCase().trim())
  ) || plan.hasActionSetpiece === true;

  // Collect unique instruments
  const allInstruments = new Set<string>();
  for (const emotion of arc) {
    const mapping = EMOTION_MOOD_MAP[emotion.toLowerCase().trim()] || DEFAULT_MAPPING;
    mapping.instruments.forEach((i) => allInstruments.add(i));
  }
  const instruments = Array.from(allInstruments).slice(0, 6); // cap at 6

  // Build the music prompt
  const musicPrompt = buildMusicPrompt({
    primaryMood: primaryMapping.mood,
    secondaryMood: secondaryMapping.mood,
    tempo,
    instruments,
    hasClimax,
    energyLevel: avgEnergy,
  });

  return {
    primaryMood: primaryMapping.mood,
    secondaryMood: secondaryMapping.mood,
    energyLevel: avgEnergy,
    tempo,
    instruments,
    hasClimax,
    musicPrompt,
  };
}

// ─── Build Music Prompt ─────────────────────────────────────────────────────

function buildMusicPrompt(params: {
  primaryMood: string;
  secondaryMood: string;
  tempo: string;
  instruments: string[];
  hasClimax: boolean;
  energyLevel: number;
}): string {
  const { primaryMood, secondaryMood, tempo, instruments, hasClimax, energyLevel } = params;

  const parts: string[] = [
    `Cinematic anime orchestral background music.`,
    `Primary mood: ${primaryMood} with ${secondaryMood} undertones.`,
    `Tempo: ${tempo}.`,
    `Instrumentation: ${instruments.join(", ")}.`,
    `Energy level: ${energyLevel}/10.`,
  ];

  if (hasClimax) {
    parts.push(`Build to an intense climax in the middle third, then resolve.`);
  }

  parts.push(
    `No vocals, instrumental only.`,
    `Neo-futuristic Japanese city ambiance with subtle electronic elements.`,
    `Suitable for anime scene background.`
  );

  return parts.join(" ");
}
