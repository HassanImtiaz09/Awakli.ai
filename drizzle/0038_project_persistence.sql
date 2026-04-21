-- F3: Project Persistence Model
-- Add wizardStage and projectState columns to projects table
ALTER TABLE `projects` ADD COLUMN `wizardStage` int NOT NULL DEFAULT 0;
ALTER TABLE `projects` ADD COLUMN `projectState` enum('draft','published_manga','published_anime','archived') NOT NULL DEFAULT 'draft';

-- Create project_checkpoints table for stage transition history
CREATE TABLE `project_checkpoints` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `userId` int NOT NULL,
  `stageFrom` int NOT NULL,
  `stageTo` int NOT NULL,
  `inputs` json,
  `outputs` json,
  `creditsSpent` int DEFAULT 0,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `project_checkpoints_id` PRIMARY KEY(`id`),
  CONSTRAINT `project_checkpoints_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `project_checkpoints_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
);
