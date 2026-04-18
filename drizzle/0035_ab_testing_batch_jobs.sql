-- A/B Experiments table
CREATE TABLE IF NOT EXISTS `ab_experiments` (
  `id` varchar(36) NOT NULL,
  `name` varchar(200) NOT NULL,
  `description` text,
  `control_provider` varchar(50) NOT NULL,
  `variant_provider` varchar(50) NOT NULL,
  `traffic_split_percent` int NOT NULL DEFAULT 20,
  `workload_types` json DEFAULT ('[]'),
  `status` enum('draft','running','paused','completed','cancelled') NOT NULL DEFAULT 'draft',
  `min_sample_size` int NOT NULL DEFAULT 30,
  `created_by` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `started_at` timestamp NULL,
  `ended_at` timestamp NULL,
  PRIMARY KEY (`id`)
);

-- A/B Experiment Results table
CREATE TABLE IF NOT EXISTS `ab_experiment_results` (
  `id` varchar(36) NOT NULL,
  `experiment_id` varchar(36) NOT NULL,
  `arm` enum('control','variant') NOT NULL,
  `provider_id` varchar(50) NOT NULL,
  `job_id` varchar(36) NOT NULL,
  `workload_type` varchar(50) NOT NULL,
  `latency_ms` int NOT NULL DEFAULT 0,
  `cost_usd` decimal(10,6) NOT NULL DEFAULT 0,
  `quality_score` int,
  `succeeded` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_ab_results_experiment` (`experiment_id`),
  KEY `idx_ab_results_arm` (`experiment_id`, `arm`)
);

-- Batch Jobs table
CREATE TABLE IF NOT EXISTS `batch_jobs` (
  `id` varchar(36) NOT NULL,
  `user_id` int NOT NULL,
  `name` varchar(200) NOT NULL,
  `status` enum('pending','processing','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `total_items` int NOT NULL DEFAULT 0,
  `completed_items` int NOT NULL DEFAULT 0,
  `failed_items` int NOT NULL DEFAULT 0,
  `total_cost_usd` decimal(10,4) NOT NULL DEFAULT 0,
  `webhook_url` text,
  `webhook_secret` varchar(128),
  `config` json,
  `error_summary` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `started_at` timestamp NULL,
  `completed_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batch_jobs_user` (`user_id`),
  KEY `idx_batch_jobs_status` (`status`)
);

-- Batch Job Items table
CREATE TABLE IF NOT EXISTS `batch_job_items` (
  `id` varchar(36) NOT NULL,
  `batch_id` varchar(36) NOT NULL,
  `item_index` int NOT NULL,
  `status` enum('pending','processing','succeeded','failed') NOT NULL DEFAULT 'pending',
  `prompt` text NOT NULL,
  `workload_type` varchar(50) NOT NULL,
  `width` int NOT NULL DEFAULT 1024,
  `height` int NOT NULL DEFAULT 1024,
  `provider_id` varchar(50),
  `result_url` text,
  `cost_usd` decimal(10,6) NOT NULL DEFAULT 0,
  `latency_ms` int,
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `completed_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `idx_batch_items_batch` (`batch_id`),
  KEY `idx_batch_items_status` (`batch_id`, `status`)
);
