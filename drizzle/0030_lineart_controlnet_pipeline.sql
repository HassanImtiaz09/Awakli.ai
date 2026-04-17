-- Prompt 22: Lineart Extraction & ControlNet Conditioning Pipeline

CREATE TABLE `lineart_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `sceneId` int,
  `panelIndex` int NOT NULL,
  `extractionMethod` enum('canny','anime2sketch') NOT NULL,
  `storageUrl` text NOT NULL,
  `sourcePanelUrl` text NOT NULL,
  `resolutionW` int NOT NULL,
  `resolutionH` int NOT NULL,
  `lineartVersion` int NOT NULL DEFAULT 1,
  `snrDb` float,
  `lineartIsActive` int NOT NULL DEFAULT 1,
  `lineartCreatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lineart_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `lineart_assets_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE
);

CREATE TABLE `controlnet_configs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `cnSceneType` enum('dialogue','action','establishing','reaction','montage','transition') NOT NULL,
  `controlnetMode` enum('canny','lineart','lineart_anime','depth') NOT NULL DEFAULT 'lineart_anime',
  `conditioningStrength` float NOT NULL,
  `cnExtractionMethod` enum('canny','anime2sketch') NOT NULL DEFAULT 'anime2sketch',
  `cnIsDefault` int NOT NULL DEFAULT 1,
  `cnCreatedAt` timestamp NOT NULL DEFAULT (now()),
  `cnUpdatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `controlnet_configs_id` PRIMARY KEY(`id`),
  CONSTRAINT `controlnet_configs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `lineart_batch_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batchEpisodeId` int NOT NULL,
  `totalPanels` int NOT NULL,
  `completedPanels` int NOT NULL DEFAULT 0,
  `failedPanels` int NOT NULL DEFAULT 0,
  `batchExtractionMethod` enum('canny','anime2sketch','mixed') NOT NULL,
  `batchStatus` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
  `batchStartedAt` timestamp,
  `batchCompletedAt` timestamp,
  `costCredits` float NOT NULL DEFAULT 0,
  `batchErrorLog` json,
  `batchCreatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lineart_batch_jobs_id` PRIMARY KEY(`id`),
  CONSTRAINT `lineart_batch_jobs_batchEpisodeId_episodes_id_fk` FOREIGN KEY (`batchEpisodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE
);

CREATE INDEX `lineart_assets_episode_idx` ON `lineart_assets` (`episodeId`);
CREATE INDEX `lineart_assets_scene_idx` ON `lineart_assets` (`episodeId`, `sceneId`, `panelIndex`);
CREATE INDEX `controlnet_configs_user_scene_idx` ON `controlnet_configs` (`userId`, `cnSceneType`);
CREATE INDEX `lineart_batch_jobs_episode_idx` ON `lineart_batch_jobs` (`batchEpisodeId`);
