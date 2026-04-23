CREATE TABLE `background_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `locationName` varchar(256) NOT NULL,
  `imageUrl` text NOT NULL,
  `fileKey` text,
  `styleTag` varchar(64),
  `resolution` varchar(32),
  `tags` json,
  `usageCount` int NOT NULL DEFAULT 0,
  `sourceEpisodeId` int,
  `sourcePanelId` int,
  `promptUsed` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `background_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `background_assets_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX `bg_project_idx` ON `background_assets` (`projectId`);
CREATE INDEX `bg_location_idx` ON `background_assets` (`projectId`, `locationName`);
