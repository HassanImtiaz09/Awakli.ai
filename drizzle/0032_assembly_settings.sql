-- Add assembly_settings JSON column to episodes table
-- Stores per-episode assembly configuration: lip sync, foley, ambient, loudness levels
ALTER TABLE `episodes` ADD COLUMN `assembly_settings` json DEFAULT NULL;
