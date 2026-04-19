/**
 * P26 Character Bible & Spatial Consistency — Module Index
 */

// Types
export type {
  CharacterAttributes,
  CharacterIdentity,
  CharacterEntry,
  CharacterRegistry,
  CharacterPlacement,
  ShotPlan,
  RegionalPrompt,
  QualityTier,
  QaVerdict,
  FaceSimilarityResult,
  HeightRatioResult,
  StyleCoherenceResult,
  SpatialQaCheckResult,
  CharacterAwareGenerationJob,
  CharacterBiblePipelineState,
  PipelineStageStatus,
  IdentityMode,
} from "./types";

export { QUALITY_TIERS, QA_THRESHOLDS } from "./types";

// Extraction (Stage 1)
export { extractCharacterBible, buildAppearanceString } from "./extraction";

// Reference Sheets (Stage 1b)
export {
  generateReferenceSheet,
  generateAllReferenceSheets,
} from "./reference-sheet";

// Shot Planner (Stage 3)
export {
  planShot,
  planAllShots,
  buildCharacterBiblePrompt,
} from "./shot-planner";

// QA Gate (Stage 5)
export {
  runSpatialQaCheck,
  checkFaceSimilarity,
  checkHeightRatio,
  checkStyleCoherence,
  createRegenBudget,
  consumeRegenBudget,
} from "./qa-gate";

// LoRA Training (Stage 2 Premium)
export {
  applyIdentityLock,
  resolveIdentityMode,
  assembleTrainingData,
  buildTrainingConfig,
  applyLoraTrainingResult,
} from "./lora-training";

// Database
export {
  getCharacterRegistry,
  upsertCharacterRegistry,
  getRegistryHistory,
  saveSpatialQaResult,
  getQaResultsForPanel,
  getQaResultsForProject,
  getSceneProviderPin,
  setSceneProviderPin,
  getScenePinsForEpisode,
} from "./db";

// Pipeline Orchestrator
export {
  runCharacterBiblePipeline,
  runStage1,
  runStage2,
  runStage3,
  runStage5,
  buildGenerationJobs,
  getPipelineState,
  cleanupPipelineState,
} from "./pipeline";
