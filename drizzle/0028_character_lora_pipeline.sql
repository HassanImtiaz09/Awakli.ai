-- Prompt 21: Character LoRA Training Pipeline & Asset Library
-- Migration: character_library, character_loras, lora_training_jobs, character_assets, pipeline_run_lora_pins
-- ALTER: generation_requests (add characterId, loraId, loraStrength)

CREATE TABLE `character_library` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `seriesId` int,
  `description` text,
  `appearanceTags` json,
  `referenceSheetUrl` text,
  `loraStatus` enum('untrained','training','validating','active','needs_retraining','failed') NOT NULL DEFAULT 'untrained',
  `activeLoraId` int,
  `activeIpEmbeddingUrl` text,
  `activeClipEmbeddingUrl` text,
  `usageCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `character_library_id` PRIMARY KEY(`id`)
);

CREATE TABLE `character_loras` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `version` int NOT NULL,
  `artifactPath` text NOT NULL,
  `artifactSizeBytes` bigint NOT NULL,
  `trainingParams` json NOT NULL,
  `trainingLossFinal` decimal(8,6),
  `qualityScore` int,
  `clipSimilarity` decimal(5,4),
  `validationStatus` enum('pending','validating','approved','rejected','deprecated') NOT NULL DEFAULT 'pending',
  `loraVersionStatus` enum('training','active','deprecated','failed') NOT NULL DEFAULT 'training',
  `triggerWord` varchar(100) NOT NULL,
  `validationImageUrls` json,
  `deprecatedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `character_loras_id` PRIMARY KEY(`id`)
);

CREATE TABLE `lora_training_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `loraId` int,
  `userId` int NOT NULL,
  `trainingJobStatus` enum('queued','preprocessing','training','validating','completed','failed') NOT NULL DEFAULT 'queued',
  `priority` int NOT NULL DEFAULT 5,
  `runpodJobId` varchar(255),
  `gpuType` varchar(32),
  `gpuSeconds` decimal(10,3),
  `costUsd` decimal(10,4),
  `costCredits` decimal(10,4),
  `errorMessage` text,
  `batchId` varchar(64),
  `startedAt` timestamp,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lora_training_jobs_id` PRIMARY KEY(`id`)
);

CREATE TABLE `character_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `assetType` enum('reference_sheet','reference_image','lora','ip_adapter_embedding','clip_embedding') NOT NULL,
  `storageUrl` text NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `metadata` json,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `character_assets_id` PRIMARY KEY(`id`)
);

CREATE TABLE `pipeline_run_lora_pins` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pipelineRunId` int NOT NULL,
  `characterId` int NOT NULL,
  `loraId` int NOT NULL,
  `pinnedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pipeline_run_lora_pins_id` PRIMARY KEY(`id`)
);

-- ALTER generation_requests to add character/LoRA tracking columns
ALTER TABLE `generation_requests` ADD COLUMN `characterId` int;
ALTER TABLE `generation_requests` ADD COLUMN `loraId` int;
ALTER TABLE `generation_requests` ADD COLUMN `loraStrength` decimal(3,2) DEFAULT 0.80;

-- Foreign keys for character_library
ALTER TABLE `character_library` ADD CONSTRAINT `character_library_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Foreign keys for character_loras
ALTER TABLE `character_loras` ADD CONSTRAINT `character_loras_characterId_character_library_id_fk` FOREIGN KEY (`characterId`) REFERENCES `character_library`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Foreign keys for lora_training_jobs
ALTER TABLE `lora_training_jobs` ADD CONSTRAINT `lora_training_jobs_characterId_character_library_id_fk` FOREIGN KEY (`characterId`) REFERENCES `character_library`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `lora_training_jobs` ADD CONSTRAINT `lora_training_jobs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Foreign keys for character_assets
ALTER TABLE `character_assets` ADD CONSTRAINT `character_assets_characterId_character_library_id_fk` FOREIGN KEY (`characterId`) REFERENCES `character_library`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Foreign keys for pipeline_run_lora_pins
ALTER TABLE `pipeline_run_lora_pins` ADD CONSTRAINT `pipeline_run_lora_pins_pipelineRunId_pipeline_runs_id_fk` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `pipeline_run_lora_pins` ADD CONSTRAINT `pipeline_run_lora_pins_characterId_character_library_id_fk` FOREIGN KEY (`characterId`) REFERENCES `character_library`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE `pipeline_run_lora_pins` ADD CONSTRAINT `pipeline_run_lora_pins_loraId_character_loras_id_fk` FOREIGN KEY (`loraId`) REFERENCES `character_loras`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Indexes for common queries
CREATE INDEX `idx_char_lib_user` ON `character_library`(`userId`);
CREATE INDEX `idx_char_lora_character` ON `character_loras`(`characterId`, `loraVersionStatus`);
CREATE INDEX `idx_training_jobs_queue` ON `lora_training_jobs`(`trainingJobStatus`, `priority`);
CREATE INDEX `idx_char_assets_active` ON `character_assets`(`characterId`, `assetType`, `isActive`);
CREATE INDEX `idx_lora_pins_run` ON `pipeline_run_lora_pins`(`pipelineRunId`);
