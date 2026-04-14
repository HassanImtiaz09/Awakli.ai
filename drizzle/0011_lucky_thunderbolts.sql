CREATE TABLE `tier_limits` (
	`tier` varchar(20) NOT NULL,
	`maxProjects` int NOT NULL,
	`maxChaptersPerProject` int NOT NULL,
	`maxPanelsPerChapter` int NOT NULL,
	`maxAnimeEpisodesPerMonth` int NOT NULL,
	`maxLoraCharacters` int NOT NULL,
	`maxVoiceClones` int NOT NULL,
	`scriptModel` varchar(100) NOT NULL,
	`videoResolution` varchar(20) NOT NULL,
	`hasWatermark` int NOT NULL DEFAULT 0,
	`canUploadManga` int NOT NULL DEFAULT 0,
	`canMonetize` int NOT NULL DEFAULT 0,
	`revenueSharePercent` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tier_limits_tier` PRIMARY KEY(`tier`)
);
--> statement-breakpoint
ALTER TABLE `subscriptions` MODIFY COLUMN `tier` enum('free','pro','creator','studio') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `episodes` ADD `isPremium` enum('free','premium','pay_per_view') DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `episodes` ADD `ppvPriceCents` int;--> statement-breakpoint
ALTER TABLE `projects` ADD `previewVideoUrl` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `previewGeneratedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `animePreviewUsed` int DEFAULT 0;