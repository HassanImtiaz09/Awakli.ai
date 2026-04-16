-- ═══════════════════════════════════════════════════════════════════════════
-- Prompt 17: HITL Gate Architecture Migration
-- Adds pipeline_stages, gates, gate_notifications, gate_audit_log,
-- gate_configs, clip_embeddings tables + ALTER pipeline_runs
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. ALTER pipeline_runs: add HITL columns ───────────────────────────
ALTER TABLE `pipeline_runs`
  ADD COLUMN `currentStageNumber` int DEFAULT 0,
  ADD COLUMN `totalStages` int DEFAULT 12,
  ADD COLUMN `gateConfig` json,
  ADD COLUMN `totalCreditsSpent` decimal(10,4) DEFAULT 0,
  ADD COLUMN `totalCreditsHeld` decimal(10,4) DEFAULT 0,
  ADD COLUMN `abortedAt` timestamp NULL,
  ADD COLUMN `abortReason` text;

-- ─── 2. pipeline_stages ─────────────────────────────────────────────────
CREATE TABLE `pipeline_stages` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `pipelineRunId` int NOT NULL,
  `stageNumber` int NOT NULL,
  `stageName` varchar(128) NOT NULL,
  `status` enum('pending','executing','awaiting_gate','approved','rejected','regenerating','skipped','failed','timed_out') NOT NULL DEFAULT 'pending',
  `generationRequestId` int,
  `gateId` int,
  `creditsEstimated` decimal(10,4),
  `creditsActual` decimal(10,4),
  `holdId` varchar(64),
  `attempts` int NOT NULL DEFAULT 0,
  `maxAttempts` int NOT NULL DEFAULT 3,
  `resultUrl` text,
  `resultMetadata` json,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_pipeline_stages_run` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `uq_stage_per_run` (`pipelineRunId`, `stageNumber`)
);

CREATE INDEX `idx_pipeline_stages_run` ON `pipeline_stages`(`pipelineRunId`, `stageNumber`);

-- ─── 3. gates ───────────────────────────────────────────────────────────
CREATE TABLE `gates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `pipelineStageId` int NOT NULL,
  `pipelineRunId` int NOT NULL,
  `userId` int NOT NULL,
  `gateType` enum('blocking','advisory','ambient') NOT NULL,
  `stageNumber` int NOT NULL,
  `stageName` varchar(128) NOT NULL,

  -- Confidence scoring
  `confidenceScore` int,
  `confidenceDetails` json,
  `autoAdvanceThreshold` int DEFAULT 85,
  `reviewThreshold` int DEFAULT 60,

  -- Decision
  `decision` enum('pending','approved','rejected','regenerate','regenerate_with_edits','auto_approved','auto_rejected','escalated','timed_out') NOT NULL DEFAULT 'pending',
  `decisionSource` enum('creator','auto','escalation','timeout'),
  `decisionReason` text,
  `decisionAt` timestamp NULL,

  -- Regeneration
  `regenParamsDiff` json,
  `regenGenerationRequestId` int,

  -- Credit display
  `creditsSpentSoFar` decimal(10,4),
  `creditsToProceed` decimal(10,4),
  `creditsToRegenerate` decimal(10,4),
  `creditsSavedIfReject` decimal(10,4),

  -- Timeout
  `timeoutAt` timestamp NULL,
  `timeoutAction` enum('auto_approve','auto_reject','auto_pause') DEFAULT 'auto_pause',
  `timeoutNotified1h` int DEFAULT 0,
  `timeoutNotified6h` int DEFAULT 0,
  `timeoutNotified23h` int DEFAULT 0,

  -- Quality feedback
  `qualityScore` int,

  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT `fk_gates_stage` FOREIGN KEY (`pipelineStageId`) REFERENCES `pipeline_stages`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gates_run` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gates_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_gates_pending` ON `gates`(`userId`, `decision`);
CREATE INDEX `idx_gates_pipeline` ON `gates`(`pipelineRunId`, `stageNumber`);

-- Add FK from pipeline_stages.gateId → gates.id
ALTER TABLE `pipeline_stages` ADD CONSTRAINT `fk_stage_gate` FOREIGN KEY (`gateId`) REFERENCES `gates`(`id`);

-- ─── 4. gate_notifications ──────────────────────────────────────────────
CREATE TABLE `gate_notifications` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `gateId` int NOT NULL,
  `userId` int NOT NULL,
  `channel` enum('websocket','email','push') NOT NULL,
  `notificationType` enum('gate_ready','review_recommended','review_required','timeout_warning_1h','timeout_warning_6h','timeout_warning_23h','timeout_fired','escalation') NOT NULL,
  `delivered` int NOT NULL DEFAULT 0,
  `deliveredAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT `fk_gate_notif_gate` FOREIGN KEY (`gateId`) REFERENCES `gates`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gate_notif_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_gate_notif_gate` ON `gate_notifications`(`gateId`);

-- ─── 5. gate_audit_log ──────────────────────────────────────────────────
CREATE TABLE `gate_audit_log` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `gateId` int NOT NULL,
  `pipelineRunId` int NOT NULL,
  `stageNumber` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `oldState` json,
  `newState` json,
  `actor` varchar(128) NOT NULL,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_gate_audit_gate` ON `gate_audit_log`(`gateId`, `createdAt`);
CREATE INDEX `idx_gate_audit_pipeline` ON `gate_audit_log`(`pipelineRunId`, `stageNumber`);

-- ─── 6. gate_configs ────────────────────────────────────────────────────
CREATE TABLE `gate_configs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `scope` enum('tier_default','user_override') NOT NULL,
  `scopeRef` varchar(128) NOT NULL,
  `stageNumber` int NOT NULL,
  `gateType` enum('blocking','advisory','ambient') NOT NULL,
  `autoAdvanceThreshold` int DEFAULT 85,
  `reviewThreshold` int DEFAULT 60,
  `timeoutHours` int DEFAULT 24,
  `timeoutAction` enum('auto_approve','auto_reject','auto_pause') DEFAULT 'auto_pause',
  `isLocked` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_gate_config` (`scope`, `scopeRef`, `stageNumber`)
);

-- ─── 7. clip_embeddings ─────────────────────────────────────────────────
CREATE TABLE `clip_embeddings` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `referenceType` enum('character_sheet','style_reference','keyframe','generated_output') NOT NULL,
  `referenceId` int NOT NULL,
  `imageUrl` text NOT NULL,
  `embedding` json NOT NULL,
  `modelVersion` varchar(64) DEFAULT 'clip-vit-base-patch32',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `idx_clip_embeddings_ref` ON `clip_embeddings`(`referenceType`, `referenceId`);

-- ─── 8. Seed gate_configs with tier defaults ────────────────────────────
-- 12-stage pipeline: 1=Script, 2=Panel Art, 3=Video Gen, 4=Voice Gen,
-- 5=Lip Sync, 6=Music Gen, 7=SFX Gen, 8=Assembly, 9=QA Review,
-- 10=Subtitles, 11=Final Review, 12=Publish

-- Free Trial: all blocking (maximum oversight)
INSERT INTO `gate_configs` (`scope`, `scopeRef`, `stageNumber`, `gateType`, `autoAdvanceThreshold`, `reviewThreshold`, `timeoutHours`, `timeoutAction`, `isLocked`) VALUES
('tier_default', 'free_trial', 1, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 2, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 3, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 4, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 5, 'advisory', 80, 50, 24, 'auto_approve', 0),
('tier_default', 'free_trial', 6, 'advisory', 80, 50, 24, 'auto_approve', 0),
('tier_default', 'free_trial', 7, 'ambient', 70, 40, 24, 'auto_approve', 0),
('tier_default', 'free_trial', 8, 'advisory', 80, 50, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 9, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 10, 'ambient', 70, 40, 24, 'auto_approve', 0),
('tier_default', 'free_trial', 11, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'free_trial', 12, 'blocking', 90, 70, 24, 'auto_pause', 1);

-- Creator: blocking on key stages, advisory on others
INSERT INTO `gate_configs` (`scope`, `scopeRef`, `stageNumber`, `gateType`, `autoAdvanceThreshold`, `reviewThreshold`, `timeoutHours`, `timeoutAction`, `isLocked`) VALUES
('tier_default', 'creator', 1, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'creator', 2, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'creator', 3, 'blocking', 80, 55, 24, 'auto_pause', 0),
('tier_default', 'creator', 4, 'advisory', 80, 50, 24, 'auto_approve', 0),
('tier_default', 'creator', 5, 'advisory', 75, 45, 24, 'auto_approve', 0),
('tier_default', 'creator', 6, 'advisory', 75, 45, 24, 'auto_approve', 0),
('tier_default', 'creator', 7, 'ambient', 70, 40, 24, 'auto_approve', 0),
('tier_default', 'creator', 8, 'advisory', 80, 50, 24, 'auto_approve', 0),
('tier_default', 'creator', 9, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'creator', 10, 'ambient', 70, 40, 24, 'auto_approve', 0),
('tier_default', 'creator', 11, 'blocking', 85, 60, 24, 'auto_pause', 0),
('tier_default', 'creator', 12, 'blocking', 90, 70, 24, 'auto_pause', 1);

-- Creator Pro: more auto-advance, fewer blocking gates
INSERT INTO `gate_configs` (`scope`, `scopeRef`, `stageNumber`, `gateType`, `autoAdvanceThreshold`, `reviewThreshold`, `timeoutHours`, `timeoutAction`, `isLocked`) VALUES
('tier_default', 'creator_pro', 1, 'advisory', 80, 50, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 2, 'blocking', 80, 55, 48, 'auto_pause', 0),
('tier_default', 'creator_pro', 3, 'blocking', 75, 50, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 4, 'advisory', 75, 45, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 5, 'ambient', 70, 40, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 6, 'ambient', 70, 40, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 7, 'ambient', 65, 35, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 8, 'advisory', 75, 45, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 9, 'advisory', 80, 55, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 10, 'ambient', 65, 35, 48, 'auto_approve', 0),
('tier_default', 'creator_pro', 11, 'blocking', 80, 55, 48, 'auto_pause', 0),
('tier_default', 'creator_pro', 12, 'blocking', 90, 70, 48, 'auto_pause', 1);

-- Studio: mostly advisory/ambient, auto-advance aggressive
INSERT INTO `gate_configs` (`scope`, `scopeRef`, `stageNumber`, `gateType`, `autoAdvanceThreshold`, `reviewThreshold`, `timeoutHours`, `timeoutAction`, `isLocked`) VALUES
('tier_default', 'studio', 1, 'ambient', 70, 40, 72, 'auto_approve', 0),
('tier_default', 'studio', 2, 'advisory', 75, 45, 72, 'auto_approve', 0),
('tier_default', 'studio', 3, 'advisory', 70, 40, 72, 'auto_approve', 0),
('tier_default', 'studio', 4, 'ambient', 65, 35, 72, 'auto_approve', 0),
('tier_default', 'studio', 5, 'ambient', 65, 35, 72, 'auto_approve', 0),
('tier_default', 'studio', 6, 'ambient', 65, 35, 72, 'auto_approve', 0),
('tier_default', 'studio', 7, 'ambient', 60, 30, 72, 'auto_approve', 0),
('tier_default', 'studio', 8, 'ambient', 70, 40, 72, 'auto_approve', 0),
('tier_default', 'studio', 9, 'advisory', 75, 45, 72, 'auto_approve', 0),
('tier_default', 'studio', 10, 'ambient', 60, 30, 72, 'auto_approve', 0),
('tier_default', 'studio', 11, 'advisory', 75, 45, 72, 'auto_approve', 0),
('tier_default', 'studio', 12, 'blocking', 85, 65, 72, 'auto_pause', 1);

-- Enterprise: maximum auto-advance, only Publish is blocking
INSERT INTO `gate_configs` (`scope`, `scopeRef`, `stageNumber`, `gateType`, `autoAdvanceThreshold`, `reviewThreshold`, `timeoutHours`, `timeoutAction`, `isLocked`) VALUES
('tier_default', 'enterprise', 1, 'ambient', 65, 35, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 2, 'ambient', 65, 35, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 3, 'advisory', 65, 35, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 4, 'ambient', 60, 30, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 5, 'ambient', 60, 30, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 6, 'ambient', 60, 30, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 7, 'ambient', 55, 25, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 8, 'ambient', 65, 35, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 9, 'ambient', 65, 35, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 10, 'ambient', 55, 25, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 11, 'advisory', 70, 40, 168, 'auto_approve', 0),
('tier_default', 'enterprise', 12, 'blocking', 80, 60, 168, 'auto_pause', 1);
