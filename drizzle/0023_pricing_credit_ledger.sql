-- Prompt 15: Creator Tier Pricing & Credit Ledger System
-- Migration: Alter subscriptions + create 6 new tables

-- ─── 1. Alter subscriptions table ──────────────────────────────────────
-- Update tier enum to support 5 tiers
ALTER TABLE `subscriptions` MODIFY COLUMN `tier` enum('free_trial','creator','creator_pro','studio','enterprise') NOT NULL DEFAULT 'free_trial';
-- Update status enum to include paused
ALTER TABLE `subscriptions` MODIFY COLUMN `status` enum('trialing','active','past_due','canceled','incomplete','paused') NOT NULL DEFAULT 'trialing';
-- Add new columns for Prompt 15
ALTER TABLE `subscriptions` ADD COLUMN `monthlyCreditGrant` int NOT NULL DEFAULT 15;
ALTER TABLE `subscriptions` ADD COLUMN `rolloverPercentage` decimal(3,2) NOT NULL DEFAULT '0.00';
ALTER TABLE `subscriptions` ADD COLUMN `rolloverCap` int;
ALTER TABLE `subscriptions` ADD COLUMN `episodeLengthCapSeconds` int NOT NULL DEFAULT 300;
ALTER TABLE `subscriptions` ADD COLUMN `allowedModelTiers` json NOT NULL DEFAULT ('["budget"]');
ALTER TABLE `subscriptions` ADD COLUMN `concurrentGenerationLimit` int NOT NULL DEFAULT 1;
ALTER TABLE `subscriptions` ADD COLUMN `teamSeats` int NOT NULL DEFAULT 1;
ALTER TABLE `subscriptions` ADD COLUMN `queuePriority` int NOT NULL DEFAULT 5;
ALTER TABLE `subscriptions` ADD COLUMN `lastDowngradeAt` timestamp NULL;

-- Migrate existing data: free -> free_trial, pro -> creator
UPDATE `subscriptions` SET `tier` = 'free_trial' WHERE `tier` = 'free';
UPDATE `subscriptions` SET `tier` = 'creator' WHERE `tier` = 'pro';

-- ─── 2. Credit Ledger (append-only) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `credit_ledger` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `transactionType` enum('grant_subscription','grant_pack_purchase','grant_promotional','hold_preauth','commit_consumption','release_hold','refund_generation','rollover','expiry','admin_adjustment') NOT NULL,
  `amountCredits` int NOT NULL,
  `holdId` varchar(64),
  `referenceType` varchar(50),
  `referenceId` varchar(255),
  `description` text,
  `metadata` json,
  `balanceAfter` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `createdBy` int,
  CONSTRAINT `credit_ledger_id` PRIMARY KEY(`id`),
  CONSTRAINT `credit_ledger_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `credit_ledger_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
);
CREATE INDEX `idx_credit_ledger_userId` ON `credit_ledger` (`userId`);
CREATE INDEX `idx_credit_ledger_holdId` ON `credit_ledger` (`holdId`);
CREATE INDEX `idx_credit_ledger_createdAt` ON `credit_ledger` (`createdAt`);

-- ─── 3. Credit Balances (materialized projection) ──────────────────────
CREATE TABLE IF NOT EXISTS `credit_balances` (
  `userId` int NOT NULL,
  `committedBalance` int NOT NULL DEFAULT 0,
  `activeHolds` int NOT NULL DEFAULT 0,
  `lifetimeGrants` int NOT NULL DEFAULT 0,
  `lifetimeConsumption` int NOT NULL DEFAULT 0,
  `lastTransactionAt` timestamp,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `credit_balances_userId` PRIMARY KEY(`userId`),
  CONSTRAINT `credit_balances_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- ─── 4. Credit Packs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `credit_packs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `stripePaymentIntentId` varchar(255) NOT NULL,
  `packSize` enum('small','medium','large','custom') NOT NULL,
  `creditsGranted` int NOT NULL,
  `pricePaidCents` int NOT NULL,
  `appliedDiscountPercentage` decimal(3,2) DEFAULT '0.00',
  `ledgerEntryId` int,
  `status` enum('pending','completed','failed','refunded') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `credit_packs_id` PRIMARY KEY(`id`),
  CONSTRAINT `credit_packs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_credit_packs_userId` ON `credit_packs` (`userId`);
CREATE INDEX `idx_credit_packs_stripePaymentIntentId` ON `credit_packs` (`stripePaymentIntentId`);

-- ─── 5. Usage Events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `usage_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `episodeId` int,
  `provider` varchar(100) NOT NULL,
  `modelName` varchar(100) NOT NULL,
  `modelTier` varchar(50) NOT NULL,
  `apiCallType` varchar(100) NOT NULL,
  `usdCostCents` int NOT NULL,
  `creditsConsumed` int NOT NULL,
  `durationSeconds` int,
  `success` int NOT NULL DEFAULT 1,
  `holdLedgerId` int,
  `commitLedgerId` int,
  `metadata` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `usage_events_id` PRIMARY KEY(`id`),
  CONSTRAINT `usage_events_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `usage_events_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE SET NULL
);
CREATE INDEX `idx_usage_events_userId` ON `usage_events` (`userId`);
CREATE INDEX `idx_usage_events_createdAt` ON `usage_events` (`createdAt`);
CREATE INDEX `idx_usage_events_provider` ON `usage_events` (`provider`);

-- ─── 6. Episode Costs ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `episode_costs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `episodeId` int NOT NULL,
  `userId` int NOT NULL,
  `totalCredits` int NOT NULL DEFAULT 0,
  `totalUsdCents` int NOT NULL DEFAULT 0,
  `videoCostCredits` int NOT NULL DEFAULT 0,
  `voiceCostCredits` int NOT NULL DEFAULT 0,
  `musicCostCredits` int NOT NULL DEFAULT 0,
  `postProcessingCostCredits` int NOT NULL DEFAULT 0,
  `scriptCostCredits` int NOT NULL DEFAULT 0,
  `imageCostCredits` int NOT NULL DEFAULT 0,
  `status` enum('in_progress','completed','refunded') NOT NULL DEFAULT 'in_progress',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `episode_costs_id` PRIMARY KEY(`id`),
  CONSTRAINT `episode_costs_episodeId_episodes_id_fk` FOREIGN KEY (`episodeId`) REFERENCES `episodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `episode_costs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `idx_episode_costs_userId` ON `episode_costs` (`userId`);
CREATE INDEX `idx_episode_costs_episodeId` ON `episode_costs` (`episodeId`);

-- ─── 7. Stripe Events Log (idempotency) ────────────────────────────────
CREATE TABLE IF NOT EXISTS `stripe_events_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stripeEventId` varchar(255) NOT NULL,
  `eventType` varchar(100) NOT NULL,
  `processedAt` timestamp NOT NULL DEFAULT (now()),
  `payload` json,
  CONSTRAINT `stripe_events_log_id` PRIMARY KEY(`id`),
  CONSTRAINT `stripe_events_log_stripeEventId_unique` UNIQUE(`stripeEventId`)
);
CREATE INDEX `idx_stripe_events_log_eventType` ON `stripe_events_log` (`eventType`);
