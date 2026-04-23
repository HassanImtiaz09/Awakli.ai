CREATE TABLE `episode_subtitles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `language` varchar(10) NOT NULL,
  `label` varchar(64) NOT NULL,
  `srtUrl` text,
  `vttUrl` text,
  `status` enum('pending','translating','converting','uploading','ready','error') NOT NULL DEFAULT 'pending',
  `error` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `episode_subtitles_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_episode_subtitles_episode` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_episode_subtitles_episode` ON `episode_subtitles` (`episodeId`);
CREATE INDEX `idx_episode_subtitles_lang` ON `episode_subtitles` (`episodeId`, `language`);
