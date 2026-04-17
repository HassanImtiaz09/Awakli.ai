-- Prompt 23: Tier Sampler Library & Expectation-Setting UX

CREATE TABLE `tier_samples` (
  `id` int AUTO_INCREMENT NOT NULL,
  `archetypeId` varchar(10) NOT NULL,
  `modality` enum('visual','audio') NOT NULL,
  `tier` int NOT NULL,
  `provider` varchar(100) NOT NULL,
  `genreVariant` enum('action','slice_of_life','atmospheric','neutral') NOT NULL,
  `outcomeClass` enum('success','partial_success','expected_failure') NOT NULL,
  `failureMode` varchar(100),
  `creditsConsumed` float NOT NULL,
  `storageUrl` text NOT NULL,
  `thumbnailUrl` text,
  `durationMs` int,
  `generationSeed` bigint NOT NULL,
  `reviewedBy` json NOT NULL,
  `publishedAt` timestamp NOT NULL,
  `stalenessScore` float NOT NULL DEFAULT 0,
  `isActive` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `tier_samples_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_tier_samples_archetype_tier_active` ON `tier_samples` (`archetypeId`, `tier`, `isActive`);
CREATE INDEX `idx_tier_samples_provider_active` ON `tier_samples` (`provider`, `isActive`);
CREATE INDEX `idx_tier_samples_outcome` ON `tier_samples` (`outcomeClass`);

CREATE TABLE `expectation_anchors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `sceneType` varchar(50) NOT NULL,
  `anchoredSampleId` int NOT NULL,
  `anchoredTier` int NOT NULL,
  `selectedTier` int,
  `anchorConfidence` float,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `expectation_anchors_id` PRIMARY KEY(`id`),
  CONSTRAINT `expectation_anchors_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `expectation_anchors_anchoredSampleId_fk` FOREIGN KEY (`anchoredSampleId`) REFERENCES `tier_samples`(`id`)
);

CREATE INDEX `idx_expectation_anchors_user` ON `expectation_anchors` (`userId`);

CREATE TABLE `esg_scores` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `sceneType` varchar(50) NOT NULL,
  `expectationTier` int NOT NULL,
  `actualTier` int NOT NULL,
  `expectedSatisfaction` float NOT NULL,
  `satisfactionScore` float NOT NULL,
  `esg` float NOT NULL,
  `routingAction` enum('none','monitor','investigate','act') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `esg_scores_id` PRIMARY KEY(`id`),
  CONSTRAINT `esg_scores_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_esg_scores_user` ON `esg_scores` (`userId`);
CREATE INDEX `idx_esg_scores_routing` ON `esg_scores` (`routingAction`);

CREATE TABLE `sampler_ab_assignments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `cohort` enum('control','sampler') NOT NULL,
  `enrolledAt` timestamp NOT NULL DEFAULT (now()),
  `exitedAt` timestamp,
  CONSTRAINT `sampler_ab_assignments_id` PRIMARY KEY(`id`),
  CONSTRAINT `sampler_ab_assignments_userId_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `sampler_ab_assignments_userId_unique` UNIQUE(`userId`)
);
