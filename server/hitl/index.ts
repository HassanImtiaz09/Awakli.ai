/**
 * HITL Gate Architecture — Public API
 *
 * Re-exports all HITL modules for clean imports:
 * import { createGate, scoreGeneration, ... } from "./hitl";
 */

// Stage configuration & constants
export {
  TOTAL_STAGES,
  STAGE_NAMES,
  STAGE_DISPLAY_NAMES,
  STAGE_CREDIT_ESTIMATES,
  DEFAULT_GATE_ASSIGNMENTS,
  AMBIENT_ESCALATION_THRESHOLD,
  isStageSkippable,
  type GateType,
  type GateDecision,
  type DecisionSource,
  type StageStatus,
  type PipelineRunStatus,
} from "./stage-config";

// Gate manager
export {
  resolveGateConfig,
  resolveAllGateConfigs,
  createGate,
  recordGateDecision,
  getGateById,
  getPendingGatesForUser,
  getGatesForPipelineRun,
  getAutoAdvancedGatesForReview,
  getTimedOutGates,
  determineGateBehavior,
  writeAuditLog,
  getAuditLogForGate,
  type GateConfig,
  type CreateGateParams,
  type GateDecisionParams,
  type GateRow,
} from "./gate-manager";

// Confidence scorer
export {
  scoreGeneration,
  type GenerateResult,
  type ScoreContext,
  type ConfidenceResult,
  type SubScore,
  type ClipService,
} from "./confidence-scorer";

// Pipeline state machine
export {
  initializePipelineStages,
  startStageExecution,
  completeStageGeneration,
  approveStage,
  rejectStage,
  startRegeneration,
  failStage,
  skipStage,
  abortPipeline,
  cascadeRewind,
  getStageByNumber,
  getAllStages,
  getNextPendingStage,
  isPipelineComplete,
  type PipelineStageRow,
  type InitPipelineParams,
  type StageCompletionResult,
} from "./pipeline-state-machine";

// Notification dispatcher
export {
  registerWsConnection,
  hasActiveWsConnection,
  notifyGateReady,
  notifyAutoAdvanced,
  notifyTimeoutWarning,
  notifyEscalation,
  getUndeliveredEmailNotifications,
  markEmailNotificationsDelivered,
  type NotificationType,
  type NotificationChannel,
  type GateNotificationPayload,
} from "./notification-dispatcher";

// Quality feedback loop
export {
  mapDecisionToQualityScore,
  writeQualityScore,
  getApprovalRateByStage,
  getAvgConfidenceByStage,
  getCreditsSavedByHitl,
  getMostRegeneratedStages,
  type QualityFeedbackParams,
} from "./quality-feedback";

// Timeout handler
export {
  checkTimeoutWarnings,
  processTimedOutGates,
  getBatchReviewableGates,
  processBatchReviewDecision,
} from "./timeout-handler";
