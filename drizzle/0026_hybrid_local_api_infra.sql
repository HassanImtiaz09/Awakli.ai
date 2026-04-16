-- Prompt 19: Hybrid Local/API Inference Infrastructure
-- Migration: 3 new tables for local GPU inference management

-- 1. Model Artifacts — Versioned model weights in object storage
CREATE TABLE IF NOT EXISTS `model_artifacts` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `modelName` VARCHAR(64) NOT NULL,
  `version` VARCHAR(32) NOT NULL,
  `artifactPath` TEXT NOT NULL,
  `sizeBytes` BIGINT NOT NULL,
  `checksumSha256` VARCHAR(64) NOT NULL,
  `isActive` INT NOT NULL DEFAULT 0,
  `metadata` JSON,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `idx_model_artifacts_active` ON `model_artifacts`(`modelName`) ;
CREATE UNIQUE INDEX `idx_model_artifacts_name_version` ON `model_artifacts`(`modelName`, `version`);

-- 2. Local Endpoints — RunPod/Modal serverless endpoints per model
CREATE TABLE IF NOT EXISTS `local_endpoints` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `providerId` VARCHAR(64) NOT NULL,
  `platform` ENUM('runpod','modal') NOT NULL,
  `endpointId` VARCHAR(128) NOT NULL,
  `endpointUrl` TEXT NOT NULL,
  `gpuType` VARCHAR(32) NOT NULL,
  `modelArtifactId` INT,
  `scalingConfig` JSON NOT NULL,
  `endpointStatus` ENUM('active','draining','disabled') NOT NULL DEFAULT 'active',
  `warmWorkers` INT NOT NULL DEFAULT 0,
  `queueDepth` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `idx_local_endpoints_provider` ON `local_endpoints`(`providerId`);

-- 3. GPU Usage Log — Append-only log for cost reconciliation
CREATE TABLE IF NOT EXISTS `gpu_usage_log` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `generationRequestId` INT,
  `endpointId` INT NOT NULL,
  `gpuType` VARCHAR(32) NOT NULL,
  `gpuSeconds` DECIMAL(10,3) NOT NULL,
  `costUsd` DECIMAL(10,6) NOT NULL,
  `wasColdStart` INT NOT NULL DEFAULT 0,
  `coldStartSeconds` DECIMAL(6,2),
  `modelName` VARCHAR(64) NOT NULL,
  `modelVersion` VARCHAR(32) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `idx_gpu_usage_request` ON `gpu_usage_log`(`generationRequestId`);
CREATE INDEX `idx_gpu_usage_daily` ON `gpu_usage_log`(`createdAt`);
