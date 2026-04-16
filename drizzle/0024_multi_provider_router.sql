-- Prompt 16: Multi-Provider API Router & Generation Abstraction Layer
-- Migration: 8 new tables + 2 summary tables (replacing materialized views)

-- 1. Providers Registry
CREATE TABLE IF NOT EXISTS `providers` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `displayName` VARCHAR(128) NOT NULL,
  `vendor` VARCHAR(64) NOT NULL,
  `modality` ENUM('video','voice','music','image') NOT NULL,
  `tier` ENUM('budget','standard','premium','flagship') NOT NULL,
  `capabilities` JSON NOT NULL,
  `pricing` JSON NOT NULL,
  `endpointUrl` TEXT NOT NULL,
  `authScheme` ENUM('bearer','api_key_header','signed_request') NOT NULL,
  `adapterClass` VARCHAR(128) NOT NULL,
  `status` ENUM('active','disabled','deprecated') NOT NULL DEFAULT 'active',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `idx_providers_modality_tier` ON `providers`(`modality`, `tier`);

-- 2. Provider API Keys
CREATE TABLE IF NOT EXISTS `provider_api_keys` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `providerId` VARCHAR(64) NOT NULL,
  `encryptedKey` TEXT NOT NULL,
  `keyLabel` VARCHAR(64) NOT NULL,
  `rateLimitRpm` INT NOT NULL DEFAULT 60,
  `dailySpendCapUsd` DECIMAL(10,2),
  `isActive` INT NOT NULL DEFAULT 1,
  `rotatedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_api_keys_provider_active` ON `provider_api_keys`(`providerId`, `isActive`);

-- 3. Provider Health
CREATE TABLE IF NOT EXISTS `provider_health` (
  `providerId` VARCHAR(64) NOT NULL PRIMARY KEY,
  `circuitState` ENUM('closed','open','half_open') NOT NULL DEFAULT 'closed',
  `consecutiveFailures` INT NOT NULL DEFAULT 0,
  `lastSuccessAt` TIMESTAMP NULL,
  `lastFailureAt` TIMESTAMP NULL,
  `latencyP50Ms` INT,
  `latencyP95Ms` INT,
  `latencyP99Ms` INT,
  `successRate1h` DECIMAL(5,4),
  `successRate24h` DECIMAL(5,4),
  `successRate7d` DECIMAL(5,4),
  `requestCount1h` INT DEFAULT 0,
  `openedAt` TIMESTAMP NULL,
  `nextRetryAt` TIMESTAMP NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. Generation Requests (append-only)
CREATE TABLE IF NOT EXISTS `generation_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requestUid` VARCHAR(32) NOT NULL UNIQUE,
  `userId` INT NOT NULL,
  `episodeId` INT,
  `sceneId` INT,
  `requestType` ENUM('video','voice','music','image') NOT NULL,
  `providerId` VARCHAR(64) NOT NULL,
  `providerHint` VARCHAR(64),
  `fallbackChain` JSON,
  `tier` ENUM('budget','standard','premium','flagship') NOT NULL,
  `params` JSON NOT NULL,
  `holdId` VARCHAR(64),
  `estimatedCostCredits` DECIMAL(10,4) NOT NULL,
  `estimatedCostUsd` DECIMAL(10,4) NOT NULL,
  `actualCostCredits` DECIMAL(10,4),
  `actualCostUsd` DECIMAL(10,4),
  `requestStatus` ENUM('pending','executing','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending',
  `errorCode` VARCHAR(64),
  `errorDetail` TEXT,
  `latencyMs` INT,
  `retryCount` INT DEFAULT 0,
  `parentRequestId` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` TIMESTAMP NULL
);
CREATE INDEX `idx_gen_req_user_created` ON `generation_requests`(`userId`, `createdAt`);
CREATE INDEX `idx_gen_req_provider_status` ON `generation_requests`(`providerId`, `requestStatus`, `createdAt`);
CREATE INDEX `idx_gen_req_episode` ON `generation_requests`(`episodeId`);

-- 5. Generation Results
CREATE TABLE IF NOT EXISTS `generation_results` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `requestId` INT NOT NULL UNIQUE,
  `storageUrl` TEXT NOT NULL,
  `storageSizeBytes` BIGINT,
  `mimeType` VARCHAR(128),
  `durationSeconds` DECIMAL(8,3),
  `metadata` JSON,
  `isDraft` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Provider Rate Limits
CREATE TABLE IF NOT EXISTS `provider_rate_limits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `providerId` VARCHAR(64) NOT NULL,
  `apiKeyId` INT NOT NULL,
  `windowStart` TIMESTAMP NOT NULL,
  `requestCount` INT NOT NULL DEFAULT 0,
  `spendUsd` DECIMAL(10,4) NOT NULL DEFAULT 0
);
CREATE INDEX `idx_rate_limits_window` ON `provider_rate_limits`(`providerId`, `apiKeyId`, `windowStart`);

-- 7. Provider Quality Scores
CREATE TABLE IF NOT EXISTS `provider_quality_scores` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `providerId` VARCHAR(64) NOT NULL,
  `sceneType` VARCHAR(64) NOT NULL,
  `qualityScore` DECIMAL(4,2) NOT NULL,
  `sampleCount` INT NOT NULL DEFAULT 0,
  `ratingSource` ENUM('creator','auto_clip','admin') NOT NULL,
  `notes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_quality_provider_scene` ON `provider_quality_scores`(`providerId`, `sceneType`);

-- 8. Provider Events (operational log)
CREATE TABLE IF NOT EXISTS `provider_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `providerId` VARCHAR(64) NOT NULL,
  `eventType` VARCHAR(64) NOT NULL,
  `severity` ENUM('info','warn','error','critical') NOT NULL,
  `detail` JSON,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_provider_events_recent` ON `provider_events`(`createdAt`);

-- 9. Provider Spend 24h Summary (replaces materialized view)
CREATE TABLE IF NOT EXISTS `provider_spend_24h` (
  `providerId` VARCHAR(64) NOT NULL PRIMARY KEY,
  `requests` INT NOT NULL DEFAULT 0,
  `spendUsd` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `avgLatencyMs` INT,
  `successRate` DECIMAL(5,4),
  `refreshedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Creator Provider Mix 7d Summary (replaces materialized view)
CREATE TABLE IF NOT EXISTS `creator_provider_mix_7d` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `providerId` VARCHAR(64) NOT NULL,
  `requests` INT NOT NULL DEFAULT 0,
  `creditsSpent` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `platformCogsUsd` DECIMAL(10,4) NOT NULL DEFAULT 0,
  `refreshedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_creator_mix_user` ON `creator_provider_mix_7d`(`userId`);
