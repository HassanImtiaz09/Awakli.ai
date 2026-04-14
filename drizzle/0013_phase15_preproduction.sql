-- Phase 15: Pre-Production Suite tables

CREATE TABLE IF NOT EXISTS `pre_production_configs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `status` enum('in_progress','locked','archived') NOT NULL DEFAULT 'in_progress',
  `currentStage` int NOT NULL DEFAULT 1,
  `characterApprovals` json,
  `voiceAssignments` json,
  `animationStyle` varchar(50),
  `styleMixing` json,
  `colorGrading` varchar(50),
  `atmosphericEffects` json,
  `aspectRatio` varchar(20) DEFAULT '16:9',
  `openingStyle` varchar(50) DEFAULT 'title_card',
  `endingStyle` varchar(50) DEFAULT 'credits_roll',
  `pacing` varchar(50) DEFAULT 'standard_tv',
  `subtitleConfig` json,
  `audioConfig` json,
  `environmentApprovals` json,
  `estimatedCostCredits` int,
  `lockedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pre_production_configs_id` PRIMARY KEY(`id`),
  CONSTRAINT `pre_production_configs_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  CONSTRAINT `pre_production_configs_projectId_unique` UNIQUE(`projectId`)
);

CREATE TABLE IF NOT EXISTS `character_versions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `versionNumber` int NOT NULL,
  `images` json,
  `descriptionUsed` text,
  `qualityScores` json,
  `isApproved` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `character_versions_id` PRIMARY KEY(`id`),
  CONSTRAINT `character_versions_characterId_fk` FOREIGN KEY (`characterId`) REFERENCES `characters`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `voice_auditions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `voiceId` varchar(255) NOT NULL,
  `voiceName` varchar(255),
  `dialogueText` text,
  `audioUrl` text,
  `isSelected` int DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `voice_auditions_id` PRIMARY KEY(`id`),
  CONSTRAINT `voice_auditions_characterId_fk` FOREIGN KEY (`characterId`) REFERENCES `characters`(`id`) ON DELETE CASCADE
);
