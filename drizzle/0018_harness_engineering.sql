-- Harness Engineering: Production Bibles + Harness Results + Pipeline Assets updates

CREATE TABLE IF NOT EXISTS `production_bibles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `bibleData` json NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `lockedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `production_bibles_id` PRIMARY KEY(`id`),
  CONSTRAINT `production_bibles_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `harness_results` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `pipelineRunId` int,
  `layer` enum('script','visual','video','audio','integration') NOT NULL,
  `checkName` varchar(100) NOT NULL,
  `targetId` int,
  `targetType` varchar(50),
  `result` enum('pass','warn','retry','block','human_review') NOT NULL,
  `score` float,
  `details` json,
  `autoFixApplied` text,
  `attemptNumber` int NOT NULL DEFAULT 1,
  `costCredits` float DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `harness_results_id` PRIMARY KEY(`id`),
  CONSTRAINT `harness_results_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `harness_results_pipelineRunId_pipeline_runs_id_fk` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE cascade ON UPDATE no action
);

-- Add harness columns to pipeline_assets
ALTER TABLE `pipeline_assets` ADD COLUMN `harnessScore` float;
ALTER TABLE `pipeline_assets` ADD COLUMN `harnessResult` varchar(20);
ALTER TABLE `pipeline_assets` ADD COLUMN `harnessDetails` json;

-- Indexes for efficient harness queries
CREATE INDEX `idx_harness_episode` ON `harness_results` (`episodeId`);
CREATE INDEX `idx_harness_run` ON `harness_results` (`pipelineRunId`);
CREATE INDEX `idx_harness_layer_result` ON `harness_results` (`layer`, `result`);
CREATE INDEX `idx_production_bible_project` ON `production_bibles` (`projectId`);
