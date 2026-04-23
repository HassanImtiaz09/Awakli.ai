-- Migration: Add Cloudflare Stream delivery fields to episodes table
-- These fields track the video delivery pipeline state after assembly completes

ALTER TABLE `episodes` ADD COLUMN `stream_uid` varchar(255);
ALTER TABLE `episodes` ADD COLUMN `stream_embed_url` text;
ALTER TABLE `episodes` ADD COLUMN `stream_hls_url` text;
ALTER TABLE `episodes` ADD COLUMN `stream_thumbnail_url` text;
ALTER TABLE `episodes` ADD COLUMN `stream_status` enum('none','uploading','processing','ready','error') DEFAULT 'none';
