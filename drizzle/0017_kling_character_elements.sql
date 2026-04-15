CREATE TABLE `character_elements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `characterId` int NOT NULL,
  `projectId` int NOT NULL,
  `userId` int NOT NULL,
  `klingVoiceTaskId` varchar(255),
  `klingVoiceId` varchar(255),
  `voiceSourceUrl` text,
  `klingElementTaskId` varchar(255),
  `klingElementId` int,
  `referenceImageUrl` text,
  `additionalImageUrls` json,
  `status` enum('pending','creating_voice','voice_ready','creating_element','ready','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `character_elements_id` PRIMARY KEY(`id`)
);

ALTER TABLE `character_elements` ADD CONSTRAINT `character_elements_characterId_characters_id_fk` FOREIGN KEY (`characterId`) REFERENCES `characters`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `character_elements` ADD CONSTRAINT `character_elements_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;
ALTER TABLE `character_elements` ADD CONSTRAINT `character_elements_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;
