CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` enum('protagonist','antagonist','supporting','background') NOT NULL DEFAULT 'supporting',
	`personalityTraits` json,
	`visualTraits` json,
	`referenceImages` json,
	`bio` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`episodeNumber` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`synopsis` text,
	`scriptContent` json,
	`status` enum('draft','generating','generated','approved','locked') NOT NULL DEFAULT 'draft',
	`wordCount` int DEFAULT 0,
	`panelCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `episodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `panels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`episodeId` int NOT NULL,
	`projectId` int NOT NULL,
	`sceneNumber` int NOT NULL,
	`panelNumber` int NOT NULL,
	`visualDescription` text,
	`cameraAngle` enum('wide','medium','close-up','extreme-close-up','birds-eye') DEFAULT 'medium',
	`dialogue` json,
	`sfx` varchar(255),
	`transition` enum('cut','fade','dissolve'),
	`imageUrl` text,
	`status` enum('draft','generating','generated','approved') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `panels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `projects` MODIFY COLUMN `animeStyle` enum('shonen','seinen','shoujo','chibi','cyberpunk','watercolor','noir','realistic','mecha','default') NOT NULL DEFAULT 'default';--> statement-breakpoint
ALTER TABLE `projects` ADD `tone` varchar(100);--> statement-breakpoint
ALTER TABLE `projects` ADD `targetAudience` enum('kids','teen','adult') DEFAULT 'teen';--> statement-breakpoint
ALTER TABLE `characters` ADD CONSTRAINT `characters_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `characters` ADD CONSTRAINT `characters_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `episodes` ADD CONSTRAINT `episodes_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `panels` ADD CONSTRAINT `panels_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `panels` ADD CONSTRAINT `panels_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;