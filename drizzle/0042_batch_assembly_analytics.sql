-- Milestone 8: Assembly Queue table
CREATE TABLE IF NOT EXISTS `assembly_queue` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `episodeId` int NOT NULL,
  `projectId` int NOT NULL,
  `batchId` varchar(64) NOT NULL,
  `assemblyQueueStatus` enum('queued','assembling','streaming','completed','failed') NOT NULL DEFAULT 'queued',
  `priority` int NOT NULL DEFAULT 5,
  `position` int NOT NULL,
  `error` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `estimatedCredits` int DEFAULT 0,
  `actualCredits` int,
  `queuedAt` timestamp NOT NULL DEFAULT (now()),
  `startedAt` timestamp,
  `completedAt` timestamp,
  CONSTRAINT `assembly_queue_id` PRIMARY KEY(`id`),
  CONSTRAINT `assembly_queue_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `assembly_queue_episodeId_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `assembly_queue_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);

-- Index for efficient queue queries
CREATE INDEX `idx_assembly_queue_user_status` ON `assembly_queue` (`userId`, `assemblyQueueStatus`);
CREATE INDEX `idx_assembly_queue_batch` ON `assembly_queue` (`batchId`);

-- Milestone 9: Episode Views table
CREATE TABLE IF NOT EXISTS `episode_views` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `projectId` int NOT NULL,
  `viewerUserId` int,
  `viewerIpHash` varchar(64),
  `watchDurationSeconds` int DEFAULT 0,
  `completionPercent` int DEFAULT 0,
  `country` varchar(2),
  `deviceType` enum('desktop','mobile','tablet','unknown') DEFAULT 'unknown',
  `referrer` varchar(512),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `episode_views_id` PRIMARY KEY(`id`),
  CONSTRAINT `episode_views_episodeId_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `episode_views_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);

-- Indexes for efficient analytics queries
CREATE INDEX `idx_episode_views_episode_date` ON `episode_views` (`episodeId`, `createdAt`);
CREATE INDEX `idx_episode_views_project_date` ON `episode_views` (`projectId`, `createdAt`);
CREATE INDEX `idx_episode_views_viewer` ON `episode_views` (`viewerUserId`);
