-- Prompt 25: Image Router — generation_costs table
CREATE TABLE IF NOT EXISTS `generation_costs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `job_id` varchar(64) NOT NULL,
  `idempotency_key` varchar(128) NOT NULL,
  `provider_id` varchar(64) NOT NULL,
  `workload_type` varchar(32) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `estimated_cost_usd` decimal(10,6),
  `actual_cost_usd` decimal(10,6),
  `actual_cost_credits` decimal(10,4),
  `prompt` text,
  `width` int,
  `height` int,
  `num_images` int DEFAULT 1,
  `control_net_model` varchar(64),
  `lora_model_url` text,
  `result_url` text,
  `result_mime_type` varchar(32),
  `latency_ms` int,
  `attempt_count` int DEFAULT 1,
  `error_message` text,
  `error_code` varchar(32),
  `user_id` int NOT NULL,
  `episode_id` int,
  `chapter_id` int,
  `scene_id` int,
  `provider_metadata` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `submitted_at` timestamp,
  `completed_at` timestamp,
  CONSTRAINT `generation_costs_id` PRIMARY KEY(`id`),
  CONSTRAINT `idx_gc_idempotency` UNIQUE(`idempotency_key`)
);

CREATE INDEX `idx_gc_provider_created` ON `generation_costs` (`provider_id`, `created_at`);
CREATE INDEX `idx_gc_workload_created` ON `generation_costs` (`workload_type`, `created_at`);
CREATE INDEX `idx_gc_user_created` ON `generation_costs` (`user_id`, `created_at`);
CREATE INDEX `idx_gc_chapter` ON `generation_costs` (`chapter_id`, `created_at`);
CREATE INDEX `idx_gc_job_id` ON `generation_costs` (`job_id`);
