-- C-4: DB-backed budget store
CREATE TABLE IF NOT EXISTS `budget_spend` (
  `provider_id` VARCHAR(64) NOT NULL,
  `month` VARCHAR(10) NOT NULL,
  `spend_usd` DECIMAL(12, 4) NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`provider_id`, `month`),
  INDEX `idx_month` (`month`)
);

-- C-7: Idempotency dedup table
CREATE TABLE IF NOT EXISTS `image_idempotency` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `idempotency_key` VARCHAR(256) NOT NULL,
  `result_url` TEXT NOT NULL,
  `job_id` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_user_key` (`user_id`, `idempotency_key`),
  INDEX `idx_created` (`created_at`)
);
