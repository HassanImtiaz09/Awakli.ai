/**
 * Pipeline Modules — Production-hardened audio mixing, voice validation, and lip sync.
 *
 * These modules encode the lessons learned from the Seraphis Recognition production:
 *
 * 1. SAFE AUDIO MIXING (audioMixer)
 *    Never use bare `amix`. Always use sequential overlay with `weights=1 1:normalize=0`.
 *
 * 2. VOICE VALIDATION GATE (voiceValidator)
 *    Validate voice presence at every dialogue timecode (>-30 LUFS) before final mux.
 *
 * 3. ROBUST LIP SYNC (lipSyncProcessor)
 *    Pad audio to >=3s, use floor(duration_ms)-50 for sound_end_time,
 *    verify face-audio overlap >=2s.
 */

export {
  // Audio Mixer
  buildVoiceTrack,
  buildMusicTrack,
  buildFoleyTrack,
  buildAmbientTrack,
  mixVoiceAndMusic,
  mixAllAudioBuses,
  muxVideoWithAudio,
  getAudioDuration,
  measureLoudness,
  normalizeToLufs,
  VOICE_LOUDNESS_THRESHOLD_LUFS,
  DEFAULT_VOICE_LUFS,
  DEFAULT_MUSIC_LUFS,
  DEFAULT_FOLEY_LUFS,
  DEFAULT_AMBIENT_LUFS,
  SIDECHAIN_DUCK_DB,
  type VoicePlacement,
  type MusicPlacement,
  type FoleyPlacement,
  type AmbientPlacement,
  type AudioMixResult,
} from "./audioMixer";

export {
  // Voice Validator
  validateVoicePresence,
  assertVoicePresence,
  isVoicePresent,
  DEFAULT_VOICE_THRESHOLD_LUFS,
  DEFAULT_MEASURE_DURATION_SECONDS,
  type DialogueTimecode,
  type TimecodeValidation,
  type VoiceValidationResult,
} from "./voiceValidator";

export {
  // Lip Sync Processor
  processLipSyncPanel,
  processLipSyncBatch,
  padAudioForLipSync,
  detectFaces,
  selectFaceForCharacter,
  calculateFaceAudioOverlap,
  MIN_AUDIO_DURATION_SECONDS,
  SOUND_END_TIME_SAFETY_MARGIN_MS,
  MIN_FACE_AUDIO_OVERLAP_MS,
  type LipSyncPanelInput,
  type LipSyncPanelResult,
  type LipSyncBatchResult,
  type FaceDetectionResult,
} from "./lipSyncProcessor";
