-- Fix Drift Jobs: persistence for targeted re-generation of flagged frames

CREATE TABLE `fix_drift_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `userId` int NOT NULL,
  `generationId` int NOT NULL,
  `episodeId` int NOT NULL,
  `sceneId` int,
  `frameIndex` int NOT NULL,
  `originalResultUrl` text,
  `originalDriftScore` float NOT NULL,
  `originalLoraStrength` float,
  `boostedLoraStrength` float NOT NULL,
  `boostDelta` float NOT NULL,
  `fixSeverity` enum('warning','critical') NOT NULL,
  `targetFeatures` json,
  `fixConfidence` enum('high','medium','low') NOT NULL,
  `estimatedCredits` int NOT NULL,
  `estimatedSeconds` int NOT NULL,
  `fixDriftStatus` enum('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
  `fixProgress` int NOT NULL DEFAULT 0,
  `newResultUrl` text,
  `newDriftScore` float,
  `driftImprovement` float,
  `fixErrorMessage` text,
  `queuedAt` timestamp NOT NULL DEFAULT (now()),
  `fixStartedAt` timestamp,
  `fixCompletedAt` timestamp,
  CONSTRAINT `fix_drift_jobs_id` PRIMARY KEY(`id`)
);

ALTER TABLE `fix_drift_jobs` ADD CONSTRAINT `fix_drift_jobs_characterId_character_library_id_fk` FOREIGN KEY (`characterId`) REFERENCES `character_library`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `fix_drift_jobs` ADD CONSTRAINT `fix_drift_jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;

CREATE INDEX `idx_fix_drift_character` ON `fix_drift_jobs` (`characterId`);
CREATE INDEX `idx_fix_drift_generation` ON `fix_drift_jobs` (`generationId`);
CREATE INDEX `idx_fix_drift_status` ON `fix_drift_jobs` (`fixDriftStatus`);
CREATE INDEX `idx_fix_drift_user` ON `fix_drift_jobs` (`userId`);
