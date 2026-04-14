ALTER TABLE `projects` ADD `originalPrompt` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `creationMode` enum('quick_create','studio','upload') DEFAULT 'quick_create';--> statement-breakpoint
ALTER TABLE `projects` ADD `animeEligible` int DEFAULT 0;