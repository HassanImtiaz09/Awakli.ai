/**
 * Prompt 20 — Scene-Type Router barrel exports
 */

// Scene-type classifier
export {
  classifySceneType,
  classifyEpisodeScenes,
  extractSceneMetadata,
  SCENE_TYPE_TO_TEMPLATE,
  HIGH_MOTION_KEYWORDS,
  MEDIUM_MOTION_KEYWORDS,
  ACTION_LINE_KEYWORDS,
  EXTERIOR_KEYWORDS,
  INTERIOR_KEYWORDS,
  MONTAGE_KEYWORDS,
} from "./scene-type-classifier";

export type {
  SceneMetadata,
  MotionIntensity,
  SceneTypeClassification,
  PanelData,
  SceneData,
  SceneWithPanels,
} from "./scene-type-classifier";

// Ken Burns engine
export {
  selectMovement,
  generateKenBurnsParams,
  generateFrameTransforms,
  generateFfmpegFilter,
  applyKenBurns,
  autoKenBurns,
  MOVEMENT_PRESETS,
} from "./ken-burns-engine";

export type {
  KenBurnsMovement,
  KenBurnsParams,
  FrameTransform,
  KenBurnsResult,
  MovementPreset,
  SceneContext,
} from "./ken-burns-engine";

// Transition generator
export {
  selectTransitionType,
  generateTransition,
  TRANSITION_TYPES,
  DEFAULT_TRANSITION_CONFIG,
} from "./transition-generator";

export type {
  TransitionType,
  WipeDirection,
  TransitionConfig,
  CompositingInstruction,
  CanvasInstruction,
  CanvasOperation,
  TransitionTypeInfo,
  TransitionContext,
} from "./transition-generator";

// Router integration
export {
  getProviderHintForSceneType,
  getPipelineStageSkips,
  shouldSkipStage,
  getStageReplacement,
  CREDITS_PER_10S,
  generateCostForecast,
  getPipelineExecutionConfig,
  getAllPipelineConfigs,
} from "./router-integration";

export type {
  ProviderHints,
  StageSkipConfig,
  SceneTypeDistribution,
  CostForecast,
  CostForecastBreakdown,
  PipelineExecutionConfig,
} from "./router-integration";

// Dialogue inpainting sub-pipeline
export {
  ALL_VISEMES,
  PHONEME_TO_VISEME,
  DEFAULT_DIALOGUE_CONFIG,
  phonemeToViseme,
  generateVisemeTimeline,
  generateBlinkSchedule,
  generateHeadMotion,
  estimateDialogueCost,
  planDialoguePipeline,
  generateAssemblyInstructions,
} from "./dialogue-inpainting";

export type {
  Viseme,
  Point2D,
  BoundingBox,
  FaceLandmarks,
  FaceLandmarkDetector,
  DialogueLine,
  PhonemeTimestamp,
  VisemeFrame,
  DialogueSceneConfig,
  BaseFrameResult,
  InpaintingFrame,
  BlinkEvent,
  HeadMotionFrame,
  DialoguePipelineResult,
  DialogueStageResult,
  DialogueCostEstimate,
  DialoguePipelinePlan,
  DialogueStagePlan,
  AssemblyInstruction,
  AssemblyLayer,
} from "./dialogue-inpainting";

// Reaction cache
export {
  ReactionCacheManager,
  getReactionCacheManager,
  resetReactionCacheManager,
  VALID_EMOTIONS,
  VALID_CAMERA_ANGLES,
  CACHE_MISS_GENERATION_CREDITS,
  DEFAULT_REACTION_DURATION_S,
  MAX_CACHE_PER_CHARACTER,
} from "./reaction-cache";

export type {
  ReactionCacheKey,
  ReactionCacheEntry as ReactionCacheEntryType,
  CacheLookupResult,
  GenerationRequest,
  GenerationResult,
  ReactionCacheStats,
} from "./reaction-cache";

// Pipeline templates
export {
  ALL_PIPELINE_TEMPLATES,
  DIALOGUE_INPAINT_TEMPLATE,
  ACTION_PREMIUM_TEMPLATE,
  ESTABLISHING_KEN_BURNS_TEMPLATE,
  TRANSITION_RULE_BASED_TEMPLATE,
  REACTION_CACHED_TEMPLATE,
  MONTAGE_IMAGE_SEQ_TEMPLATE,
  getPipelineTemplateSeedRows,
  getTemplateById,
  getTemplateForSceneType,
  getSkipStagesForSceneType,
  getProviderHintsForSceneType,
  getEstimatedCreditsPerTenS,
} from "./pipeline-templates";

export type {
  PipelineStageConfig,
  ProviderHint,
  PipelineTemplateData,
} from "./pipeline-templates";
