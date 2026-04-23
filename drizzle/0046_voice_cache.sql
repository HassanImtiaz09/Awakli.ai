CREATE TABLE `voice_cache` (
  `id` int AUTO_INCREMENT NOT NULL,
  `voiceId` varchar(128) NOT NULL,
  `textHash` varchar(64) NOT NULL,
  `text` text NOT NULL,
  `emotion` varchar(32),
  `audioUrl` text NOT NULL,
  `fileKey` text,
  `durationMs` int,
  `usageCount` int NOT NULL DEFAULT 0,
  `projectId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `voice_cache_id` PRIMARY KEY(`id`)
);

CREATE INDEX `vc_voice_text_idx` ON `voice_cache` (`voiceId`, `textHash`);
CREATE INDEX `vc_project_idx` ON `voice_cache` (`projectId`);
