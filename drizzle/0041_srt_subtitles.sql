-- Migration 0041: Add SRT subtitle fields to episodes table
ALTER TABLE `episodes` ADD COLUMN `srt_url` text;
ALTER TABLE `episodes` ADD COLUMN `srt_generated_at` timestamp;
