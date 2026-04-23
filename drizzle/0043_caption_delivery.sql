-- Milestone 10: VTT Caption Upload to Cloudflare Stream
-- Adds vttUrl, captionLanguage, and captionStatus fields to episodes table

ALTER TABLE `episodes` ADD COLUMN `vtt_url` text;
ALTER TABLE `episodes` ADD COLUMN `caption_language` varchar(10) DEFAULT 'en';
ALTER TABLE `episodes` ADD COLUMN `caption_status` enum('none','converting','uploading','ready','error') DEFAULT 'none';
