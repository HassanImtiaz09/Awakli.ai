CREATE TABLE `pipeline_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pipelineRunId` int NOT NULL,
	`episodeId` int NOT NULL,
	`panelId` int,
	`assetType` enum('video_clip','voice_clip','synced_clip','music_segment','subtitle_srt','final_video','thumbnail') NOT NULL,
	`url` text NOT NULL,
	`metadata` json,
	`nodeSource` enum('video_gen','voice_gen','lip_sync','music_gen','assembly') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipeline_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipeline_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`episodeId` int NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','running','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`currentNode` enum('video_gen','voice_gen','lip_sync','music_gen','assembly','qa_review','none') DEFAULT 'none',
	`nodeStatuses` json,
	`progress` int DEFAULT 0,
	`estimatedTimeRemaining` int,
	`totalCost` int DEFAULT 0,
	`nodeCosts` json,
	`errors` json,
	`qaIssues` json,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pipeline_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `episodes` MODIFY COLUMN `status` enum('draft','generating','generated','approved','locked','pipeline','review','published') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `characters` ADD `voiceId` varchar(255);--> statement-breakpoint
ALTER TABLE `characters` ADD `voiceCloneUrl` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `voiceSettings` json;--> statement-breakpoint
ALTER TABLE `episodes` ADD `videoUrl` text;--> statement-breakpoint
ALTER TABLE `episodes` ADD `thumbnailUrl` text;--> statement-breakpoint
ALTER TABLE `pipeline_assets` ADD CONSTRAINT `pipeline_assets_pipelineRunId_pipeline_runs_id_fk` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipeline_assets` ADD CONSTRAINT `pipeline_assets_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD CONSTRAINT `pipeline_runs_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD CONSTRAINT `pipeline_runs_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD CONSTRAINT `pipeline_runs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;