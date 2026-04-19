-- P26: Character Bible & Spatial Consistency Pipeline
-- Tables: character_registries, spatial_qa_results, scene_provider_pins

CREATE TABLE IF NOT EXISTS `character_registries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `story_id` int NOT NULL,
  `registry_json` json NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `character_registries_story_id_projects_id_fk` FOREIGN KEY (`story_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_character_registries_story_version` ON `character_registries` (`story_id`, `version`);

CREATE TABLE IF NOT EXISTS `spatial_qa_results` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `panel_id` int NOT NULL,
  `episode_id` int NOT NULL,
  `project_id` int NOT NULL,
  `face_similarity_score` float,
  `face_similarity_verdict` enum('pass','soft_fail','hard_fail','skipped') DEFAULT 'skipped',
  `height_ratio_deviation` float,
  `height_ratio_verdict` enum('pass','soft_fail','hard_fail','skipped') DEFAULT 'skipped',
  `style_coherence_score` float,
  `style_coherence_verdict` enum('pass','soft_fail','hard_fail','skipped') DEFAULT 'skipped',
  `overall_verdict` enum('pass','soft_fail','hard_fail') DEFAULT 'pass',
  `regeneration_count` int DEFAULT 0,
  `details` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `spatial_qa_results_panel_id_panels_id_fk` FOREIGN KEY (`panel_id`) REFERENCES `panels`(`id`) ON DELETE CASCADE,
  CONSTRAINT `spatial_qa_results_episode_id_episodes_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON DELETE CASCADE,
  CONSTRAINT `spatial_qa_results_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_spatial_qa_panel` ON `spatial_qa_results` (`panel_id`);
CREATE INDEX `idx_spatial_qa_project` ON `spatial_qa_results` (`project_id`);

CREATE TABLE IF NOT EXISTS `scene_provider_pins` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `project_id` int NOT NULL,
  `episode_id` int NOT NULL,
  `scene_number` int NOT NULL,
  `provider_id` varchar(50) NOT NULL,
  `quality_tier` enum('draft','hero') NOT NULL DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `scene_provider_pins_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
  CONSTRAINT `scene_provider_pins_episode_id_episodes_id_fk` FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_scene_pins_project_episode` ON `scene_provider_pins` (`project_id`, `episode_id`, `scene_number`);
