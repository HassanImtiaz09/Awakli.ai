-- Phase 16: Music Pipeline tables

CREATE TABLE IF NOT EXISTS `music_tracks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `projectId` INT NOT NULL,
  `trackType` ENUM('opening','ending','bgm','stinger','custom') NOT NULL,
  `mood` VARCHAR(100),
  `title` VARCHAR(255),
  `lyrics` TEXT,
  `stylePrompt` TEXT,
  `trackUrl` TEXT,
  `durationSeconds` FLOAT,
  `isVocal` INT DEFAULT 0,
  `isLoopable` INT DEFAULT 0,
  `versionNumber` INT NOT NULL DEFAULT 1,
  `isApproved` INT DEFAULT 0,
  `isUserUploaded` INT DEFAULT 0,
  `sunoGenerationId` VARCHAR(255),
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `music_versions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `musicTrackId` INT NOT NULL,
  `versionNumber` INT NOT NULL,
  `trackUrl` TEXT,
  `stylePrompt` TEXT,
  `refinementNotes` TEXT,
  `createdAt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (`musicTrackId`) REFERENCES `music_tracks`(`id`) ON DELETE CASCADE
);

ALTER TABLE `pre_production_configs` ADD COLUMN `musicConfig` JSON;
