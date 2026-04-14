CREATE TABLE `episode_sfx` (
	`id` int AUTO_INCREMENT NOT NULL,
	`episodeId` int NOT NULL,
	`panelId` int,
	`sfxType` varchar(100) NOT NULL,
	`sfxUrl` text,
	`timestampMs` int DEFAULT 0,
	`volume` int DEFAULT 80,
	`durationMs` int,
	`source` enum('generated','library') NOT NULL DEFAULT 'library',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `episode_sfx_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`episodeId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneNumber` int NOT NULL,
	`location` text,
	`timeOfDay` varchar(50),
	`mood` varchar(50),
	`sceneContext` json,
	`environmentLoraUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scenes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `pipeline_assets` MODIFY COLUMN `assetType` enum('video_clip','voice_clip','synced_clip','music_segment','sfx_clip','narrator_clip','upscaled_panel','subtitle_srt','final_video','thumbnail') NOT NULL;--> statement-breakpoint
ALTER TABLE `pipeline_assets` MODIFY COLUMN `nodeSource` enum('quality_check','upscale','content_mod','video_gen','voice_gen','narrator_gen','lip_sync','music_gen','sfx_gen','assembly') NOT NULL;--> statement-breakpoint
ALTER TABLE `pipeline_runs` MODIFY COLUMN `currentNode` enum('quality_check','upscale','content_mod','video_gen','voice_gen','narrator_gen','lip_sync','music_gen','sfx_gen','assembly','qa_review','none') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `episodes` ADD `narratorEnabled` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `episodes` ADD `narratorVoiceId` varchar(255);--> statement-breakpoint
ALTER TABLE `episodes` ADD `sfxData` json;--> statement-breakpoint
ALTER TABLE `episodes` ADD `scriptModerationStatus` enum('pending','clean','flagged','revised') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `episodes` ADD `scriptModerationFlags` json;--> statement-breakpoint
ALTER TABLE `episodes` ADD `estimatedCostCents` int;--> statement-breakpoint
ALTER TABLE `panels` ADD `qualityScore` int;--> statement-breakpoint
ALTER TABLE `panels` ADD `qualityDetails` json;--> statement-breakpoint
ALTER TABLE `panels` ADD `generationAttempts` int DEFAULT 1;--> statement-breakpoint
ALTER TABLE `panels` ADD `upscaledImageUrl` text;--> statement-breakpoint
ALTER TABLE `panels` ADD `moderationStatus` enum('pending','clean','flagged','acknowledged') DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `panels` ADD `moderationFlags` json;--> statement-breakpoint
ALTER TABLE `episode_sfx` ADD CONSTRAINT `episode_sfx_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `episode_sfx` ADD CONSTRAINT `episode_sfx_panelId_panels_id_fk` FOREIGN KEY (`panelId`) REFERENCES `panels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scenes` ADD CONSTRAINT `scenes_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scenes` ADD CONSTRAINT `scenes_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;