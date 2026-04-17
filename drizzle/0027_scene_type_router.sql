-- Prompt 20: Scene-Type Router & Intelligent Pipeline Selector
-- Migration: scene_classifications, reaction_cache, scene_type_overrides, pipeline_templates

CREATE TABLE `scene_classifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `sceneId` int NOT NULL,
  `sceneType` enum('dialogue','action','establishing','transition','reaction','montage') NOT NULL,
  `classifierVersion` varchar(32) NOT NULL DEFAULT 'v1_rule_based',
  `confidence` decimal(5,4),
  `metadata` json NOT NULL,
  `creatorOverride` enum('dialogue','action','establishing','transition','reaction','montage'),
  `overrideReason` text,
  `pipelineTemplate` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `scene_classifications_id` PRIMARY KEY(`id`)
);

CREATE TABLE `reaction_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `emotion` enum('surprise','anger','joy','sadness','fear','neutral') NOT NULL,
  `reactionCameraAngle` enum('front','three_quarter','side','close_up') NOT NULL,
  `storageUrl` text NOT NULL,
  `durationS` decimal(5,2) NOT NULL,
  `generationRequestId` int,
  `reusableAcrossEpisodes` int NOT NULL DEFAULT 1,
  `usageCount` int NOT NULL DEFAULT 0,
  `createdBy` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `reaction_cache_id` PRIMARY KEY(`id`)
);

CREATE TABLE `scene_type_overrides` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sceneClassificationId` int NOT NULL,
  `originalType` enum('dialogue','action','establishing','transition','reaction','montage') NOT NULL,
  `overriddenType` enum('dialogue','action','establishing','transition','reaction','montage') NOT NULL,
  `userId` int NOT NULL,
  `reason` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `scene_type_overrides_id` PRIMARY KEY(`id`)
);

CREATE TABLE `pipeline_templates` (
  `id` varchar(64) NOT NULL,
  `templateSceneType` enum('dialogue','action','establishing','transition','reaction','montage') NOT NULL,
  `displayName` varchar(128) NOT NULL,
  `stages` json NOT NULL,
  `preferredProviders` json NOT NULL,
  `skipStages` json NOT NULL,
  `estimatedCreditsPerTenS` decimal(10,4) NOT NULL,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pipeline_templates_id` PRIMARY KEY(`id`)
);

-- Foreign keys
ALTER TABLE `scene_classifications` ADD CONSTRAINT `sc_episode_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE;
ALTER TABLE `scene_classifications` ADD CONSTRAINT `sc_scene_fk` FOREIGN KEY (`sceneId`) REFERENCES `scenes`(`id`) ON DELETE CASCADE;
ALTER TABLE `reaction_cache` ADD CONSTRAINT `rc_character_fk` FOREIGN KEY (`characterId`) REFERENCES `characters`(`id`) ON DELETE CASCADE;
ALTER TABLE `reaction_cache` ADD CONSTRAINT `rc_created_by_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE CASCADE;
ALTER TABLE `scene_type_overrides` ADD CONSTRAINT `sto_classification_fk` FOREIGN KEY (`sceneClassificationId`) REFERENCES `scene_classifications`(`id`) ON DELETE CASCADE;
ALTER TABLE `scene_type_overrides` ADD CONSTRAINT `sto_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;

-- Indexes
CREATE INDEX `idx_sc_episode` ON `scene_classifications` (`episodeId`);
CREATE UNIQUE INDEX `idx_sc_episode_scene` ON `scene_classifications` (`episodeId`, `sceneId`);
CREATE INDEX `idx_rc_character_emotion` ON `reaction_cache` (`characterId`, `emotion`);
CREATE UNIQUE INDEX `idx_rc_char_emotion_angle` ON `reaction_cache` (`characterId`, `emotion`, `reactionCameraAngle`);
CREATE INDEX `idx_sto_classification` ON `scene_type_overrides` (`sceneClassificationId`);
