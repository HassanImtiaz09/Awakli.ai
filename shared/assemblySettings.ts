/**
 * Assembly Settings — per-episode configuration for the 4-bus audio pipeline
 * and lip sync processing.
 *
 * Stored as JSON in episodes.assembly_settings column.
 */

export interface AssemblySettings {
  // ─── Lip Sync ────────────────────────────────────────────────────────
  /** Enable post-production lip sync via Kling API (default: false) */
  enableLipSync: boolean;

  // ─── Audio Buses ─────────────────────────────────────────────────────
  /** Enable foley audio bus — footsteps, impacts, doors (default: false) */
  enableFoley: boolean;
  /** Enable ambient audio bus — ocean hum, wind, city noise (default: false) */
  enableAmbient: boolean;

  // ─── Loudness Levels (LUFS) ──────────────────────────────────────────
  /** Voice bus target loudness (default: -14 LUFS) */
  voiceLufs: number;
  /** Music bus target loudness (default: -24 LUFS) */
  musicLufs: number;
  /** Foley bus target loudness (default: -28 LUFS) */
  foleyLufs: number;
  /** Ambient bus target loudness (default: -32 LUFS) */
  ambientLufs: number;

  // ─── Voice Validation ────────────────────────────────────────────────
  /** Enable voice validation gate before final mux (default: true) */
  enableVoiceValidation: boolean;
  /** Voice validation threshold in LUFS (default: -30) */
  voiceValidationThresholdLufs: number;

  // ─── Sidechain ───────────────────────────────────────────────────────
  /** Enable sidechain ducking on music when voice is present (default: true) */
  enableSidechainDucking: boolean;
  /** Sidechain duck amount in dB (default: 8) */
  sidechainDuckDb: number;

  // ─── Motion LoRA (Prompt 24) ─────────────────────────────────────────
  /** Enable motion LoRA conditioning for video generation (default: false) */
  enableMotionLora: boolean;
  /** Motion LoRA weight override (0.30 - 0.85, default: 0.60 = auto per scene type) */
  motionLoraWeight: number;
  /** Use auto weight per scene type instead of fixed weight (default: true) */
  motionLoraAutoWeight: boolean;
}

/** Default assembly settings for new episodes */
export const DEFAULT_ASSEMBLY_SETTINGS: AssemblySettings = {
  enableLipSync: false,
  enableFoley: false,
  enableAmbient: false,
  voiceLufs: -14,
  musicLufs: -24,
  foleyLufs: -28,
  ambientLufs: -32,
  enableVoiceValidation: true,
  voiceValidationThresholdLufs: -30,
  enableSidechainDucking: true,
  sidechainDuckDb: 8,
  enableMotionLora: false,
  motionLoraWeight: 0.60,
  motionLoraAutoWeight: true,
};

/** Merge partial settings with defaults */
export function mergeAssemblySettings(
  partial?: Partial<AssemblySettings> | null,
): AssemblySettings {
  return { ...DEFAULT_ASSEMBLY_SETTINGS, ...partial };
}
