CREATE TABLE `anime_promotions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`voteCountAtPromotion` int NOT NULL,
	`promotedAt` timestamp NOT NULL DEFAULT (now()),
	`productionStartedAt` timestamp,
	`productionCompletedAt` timestamp,
	`status` enum('pending_creator','in_production','completed','cancelled') NOT NULL DEFAULT 'pending_creator',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `anime_promotions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_config` (
	`key` varchar(100) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `platform_config_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `type` enum('new_episode','reply','vote_milestone','new_follower','anime_eligible','anime_started','anime_completed') NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `totalVotes` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `projects` ADD `animeStatus` enum('not_eligible','eligible','in_production','completed') DEFAULT 'not_eligible' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `animePromotedAt` timestamp;--> statement-breakpoint
ALTER TABLE `anime_promotions` ADD CONSTRAINT `anime_promotions_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;