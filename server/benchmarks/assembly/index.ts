/**
 * Assembly Pipeline — Orchestrates all post-generation assembly steps
 *
 * Steps (in order):
 *   1. Download all generated clips
 *   2. Apply transitions between clips (A1)
 *   3. Generate and mix music bed (A2)
 *   4. Apply audio mastering (Q3)
 *   5. Wrap with title + end cards (A3)
 *   6. Upload final output to S3
 */

export { buildTTSParams, getVoiceConfig, injectEmotionTag, VOICE_LIBRARY } from "./voice-design.js";
export { masterAudio, masterAudioFromUrl, measureLoudness } from "./audio-mastering.js";
export {
  classifyTransition,
  generateTransitionPlan,
  assembleWithTransitions,
  applyTransition,
  type TransitionSpec,
  type TransitionType,
} from "./transitions.js";
export { generateMusicBed, mixMusicBed, downloadAndMixMusic } from "./music-bed.js";
export { generateTitleCard, generateEndCard, wrapWithCards } from "./title-cards.js";
