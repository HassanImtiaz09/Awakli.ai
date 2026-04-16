-- Free-Viewing YouTube Model: publication_status, publishedAt, content_views table

-- Add publication_status enum column to projects
ALTER TABLE `projects` ADD COLUMN `publication_status` ENUM('draft','private','published','archived') NOT NULL DEFAULT 'draft';

-- Add publishedAt timestamp to projects
ALTER TABLE `projects` ADD COLUMN `publishedAt` TIMESTAMP NULL;

-- Set existing public+active projects to published
UPDATE `projects` SET `publication_status` = 'published', `publishedAt` = `createdAt` WHERE `visibility` = 'public' AND `status` = 'active';

-- Set existing private projects to private
UPDATE `projects` SET `publication_status` = 'private' WHERE `visibility` = 'private' AND `status` = 'active';

-- Create content_views table for anonymous + authenticated view tracking
CREATE TABLE IF NOT EXISTS `content_views` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `content_type` ENUM('manga_chapter','anime_episode','project') NOT NULL,
  `content_id` INT NOT NULL,
  `project_id` INT,
  `viewer_hash` VARCHAR(64) NOT NULL,
  `session_id` VARCHAR(64),
  `user_id` INT,
  `duration_seconds` INT,
  `source` ENUM('direct','search','social','internal','embed') DEFAULT 'direct',
  `viewed_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_content_views_content` (`content_id`, `viewed_at`),
  INDEX `idx_content_views_project` (`project_id`, `viewed_at`),
  INDEX `idx_content_views_viewer` (`viewer_hash`, `content_id`)
);
