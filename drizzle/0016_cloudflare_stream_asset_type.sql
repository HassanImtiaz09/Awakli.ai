-- Add stream_video to pipeline_assets assetType enum
ALTER TABLE pipeline_assets MODIFY COLUMN assetType ENUM('video_clip', 'voice_clip', 'synced_clip', 'music_segment', 'sfx_clip', 'narrator_clip', 'upscaled_panel', 'subtitle_srt', 'final_video', 'thumbnail', 'stream_video') NOT NULL;
