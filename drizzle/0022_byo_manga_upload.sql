-- Add source_type and upload_metadata to projects table
ALTER TABLE `projects` ADD COLUMN `source_type` enum('text_prompt','upload_ai','upload_digital','upload_hand_drawn') DEFAULT 'text_prompt';
ALTER TABLE `projects` ADD COLUMN `upload_metadata` json;

-- Create uploaded_assets table
CREATE TABLE IF NOT EXISTS `uploaded_assets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `originalUrl` text NOT NULL,
  `cleanedUrl` text,
  `lineArtUrl` text,
  `processedUrl` text,
  `panelNumber` int NOT NULL,
  `source_type` enum('ai_generated','digital_art','hand_drawn') DEFAULT 'ai_generated',
  `processing_applied` json,
  `style_transfer_option` enum('none','enhance_only','hybrid','full_restyle') DEFAULT 'none',
  `ocr_extracted` json,
  `panel_metadata` json,
  `segmentation_data` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `uploaded_assets_id` PRIMARY KEY(`id`),
  CONSTRAINT `uploaded_assets_projectId_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
