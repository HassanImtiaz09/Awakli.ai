CREATE TABLE `lora_marketplace` (
  `id` int AUTO_INCREMENT NOT NULL,
  `creatorId` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` text,
  `previewImages` text,
  `downloads` int NOT NULL DEFAULT 0,
  `ratingSum` int NOT NULL DEFAULT 0,
  `ratingCount` int NOT NULL DEFAULT 0,
  `lora_license` enum('free','attribution','commercial','exclusive') NOT NULL DEFAULT 'free',
  `priceCents` int NOT NULL DEFAULT 0,
  `tags` text,
  `lora_category` enum('character','style','background','effect','general') NOT NULL DEFAULT 'character',
  `loraFileKey` text,
  `loraFileUrl` text,
  `baseModelId` varchar(64),
  `trainingCreditsUsed` int,
  `isPublished` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lora_marketplace_id` PRIMARY KEY(`id`)
);

CREATE TABLE `lora_marketplace_reviews` (
  `id` int AUTO_INCREMENT NOT NULL,
  `loraId` int NOT NULL,
  `userId` int NOT NULL,
  `rating` int NOT NULL,
  `comment` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lora_marketplace_reviews_id` PRIMARY KEY(`id`)
);

CREATE INDEX `lm_creator_idx` ON `lora_marketplace` (`creatorId`);
CREATE INDEX `lm_published_idx` ON `lora_marketplace` (`isPublished`);
CREATE INDEX `lmr_lora_idx` ON `lora_marketplace_reviews` (`loraId`);
CREATE INDEX `lmr_user_idx` ON `lora_marketplace_reviews` (`userId`);
