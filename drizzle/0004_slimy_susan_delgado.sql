ALTER TABLE `panels` MODIFY COLUMN `status` enum('draft','generating','generated','approved','rejected') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `characters` ADD `loraModelUrl` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `loraStatus` enum('none','uploading','training','validating','ready','failed') DEFAULT 'none';--> statement-breakpoint
ALTER TABLE `characters` ADD `loraTriggerWord` varchar(100);--> statement-breakpoint
ALTER TABLE `characters` ADD `loraTrainingProgress` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `panels` ADD `compositeImageUrl` text;--> statement-breakpoint
ALTER TABLE `panels` ADD `fluxPrompt` text;--> statement-breakpoint
ALTER TABLE `panels` ADD `negativePrompt` text;--> statement-breakpoint
ALTER TABLE `panels` ADD `reviewStatus` enum('pending','approved','rejected','needs_revision') DEFAULT 'pending';