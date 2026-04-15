-- Smart Kling Model Router: add routing columns to pipeline_assets and create model_routing_stats table

ALTER TABLE `pipeline_assets`
  ADD COLUMN `klingModelUsed` varchar(30),
  ADD COLUMN `complexityTier` int,
  ADD COLUMN `lipSyncMethod` varchar(20),
  ADD COLUMN `classificationReasoning` text,
  ADD COLUMN `costActual` float,
  ADD COLUMN `costIfV3Omni` float,
  ADD COLUMN `userOverride` int DEFAULT 0;

CREATE TABLE `model_routing_stats` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `pipelineRunId` int,
  `totalPanels` int NOT NULL,
  `tier1Count` int NOT NULL DEFAULT 0,
  `tier2Count` int NOT NULL DEFAULT 0,
  `tier3Count` int NOT NULL DEFAULT 0,
  `tier4Count` int NOT NULL DEFAULT 0,
  `actualCost` float NOT NULL,
  `v3OmniCost` float NOT NULL,
  `savings` float NOT NULL,
  `savingsPercent` float NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `model_routing_stats_id` PRIMARY KEY(`id`),
  CONSTRAINT `model_routing_stats_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `model_routing_stats_pipelineRunId_pipeline_runs_id_fk` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
