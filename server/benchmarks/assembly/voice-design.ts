/**
 * Q1: Voice Library — Character-specific voice configuration
 * Q2: Emotion Tags — Per-line emotion tag injection for TTS
 *
 * ElevenLabs Turbo v2.5 supports SSML-like emotion/style tags natively.
 * This module maps character identities to voice IDs and injects emotion
 * tags into dialogue text before TTS dispatch.
 */

// ─── Voice Library (Q1) ──────────────────────────────────────────────────────

export interface CharacterVoice {
  voiceId: string;
  voiceName: string;
  description: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

/**
 * Character voice profiles — tuned for anime dialogue.
 * Voice IDs are ElevenLabs voice library entries.
 *
 * Mira: Sarah — young female, confident, determined
 * Ren:  Harry — young male, sharp, energetic
 */
export const VOICE_LIBRARY: Record<string, CharacterVoice> = {
  Mira: {
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah
    voiceName: "Sarah",
    description: "Young woman, silver-white hair, cerulean blue tips. Determined, compassionate. Speaks with quiet strength.",
    stability: 0.45,       // Slightly lower for more expressive range
    similarityBoost: 0.80,
    style: 0.15,           // Mild style exaggeration for anime feel
    useSpeakerBoost: true,
  },
  Ren: {
    voiceId: "SOYHLrjzK2X1ezoPC6cr", // Harry
    voiceName: "Harry",
    description: "Young man, spiky dark hair, cyan streaks. Confident, protective. Speaks with sharp energy.",
    stability: 0.50,
    similarityBoost: 0.75,
    style: 0.10,
    useSpeakerBoost: true,
  },
  Narrator: {
    voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel
    voiceName: "Rachel",
    description: "Neutral narrator voice. Calm, clear, authoritative.",
    stability: 0.60,
    similarityBoost: 0.70,
    style: 0.0,
    useSpeakerBoost: true,
  },
};

export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel (fallback)

/**
 * Get voice configuration for a character.
 * Falls back to Narrator if character not found.
 */
export function getVoiceConfig(character: string): CharacterVoice {
  return VOICE_LIBRARY[character] ?? VOICE_LIBRARY.Narrator;
}

// ─── Emotion Tags (Q2) ──────────────────────────────────────────────────────

/**
 * Emotion-to-SSML tag mapping for ElevenLabs Turbo v2.5.
 *
 * ElevenLabs supports these style hints as text prefixes that influence
 * the prosody and emotional quality of the generated speech:
 *   - Bracketed tags: [whispered], [shouting], [laughing], [crying]
 *   - Descriptive prefixes: "In a soft, hesitant voice:", "Urgently:"
 *
 * We use a hybrid approach: bracketed tags for strong emotions,
 * descriptive prefixes for nuanced ones.
 */
const EMOTION_TAG_MAP: Record<string, string> = {
  // Strong emotions — bracketed tags
  whispered: "[whispered]",
  shouting: "[shouting]",
  laughing: "[laughing]",
  crying: "[crying]",
  angry: "[angry]",

  // Nuanced emotions — descriptive prefixes
  determined: "With quiet determination:",
  nostalgic: "In a soft, nostalgic voice:",
  urgent: "Urgently:",
  hesitant: "Hesitantly, with uncertainty:",
  confident: "With confidence:",
  worried: "With worry in the voice:",
  surprised: "With surprise:",
  sad: "Sadly:",
  hopeful: "With hope:",
  defiant: "Defiantly:",
  calm: "Calmly:",
  excited: "With excitement:",
  tender: "Tenderly:",
  fierce: "Fiercely:",
  reflective: "Reflectively:",
  playful: "Playfully:",
  serious: "In a serious tone:",
  relieved: "With relief:",
};

/**
 * Inject emotion tag into dialogue text for TTS.
 *
 * @param text - The raw dialogue text
 * @param emotion - The emotion tag from the script fixture
 * @returns Text with emotion prefix prepended
 *
 * @example
 * injectEmotionTag("Today is the day.", "determined")
 * // → "With quiet determination: Today is the day."
 *
 * injectEmotionTag("Don't go!", "whispered")
 * // → "[whispered] Don't go!"
 */
export function injectEmotionTag(text: string, emotion?: string | null): string {
  if (!emotion) return text;
  const tag = EMOTION_TAG_MAP[emotion.toLowerCase()];
  if (!tag) return text;

  // Bracketed tags go directly before the text
  if (tag.startsWith("[")) {
    return `${tag} ${text}`;
  }
  // Descriptive prefixes are separated by a space
  return `${tag} ${text}`;
}

/**
 * Build the full TTS parameters for a dialogue line.
 * Combines voice selection (Q1) with emotion injection (Q2).
 */
export function buildTTSParams(dialogue: {
  text: string;
  character: string;
  emotion?: string;
}): {
  text: string;
  voiceId: string;
  voiceSettings: {
    stability: number;
    similarity_boost: number;
    style: number;
    use_speaker_boost: boolean;
  };
} {
  const voice = getVoiceConfig(dialogue.character);
  const emotionText = injectEmotionTag(dialogue.text, dialogue.emotion);

  return {
    text: emotionText,
    voiceId: voice.voiceId,
    voiceSettings: {
      stability: voice.stability,
      similarity_boost: voice.similarityBoost,
      style: voice.style,
      use_speaker_boost: voice.useSpeakerBoost,
    },
  };
}
