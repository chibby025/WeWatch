-- Add video file metadata columns to room_tv_content table
-- Migration: add_video_fields_to_room_tv_content.sql
-- Created: 2025-12-08

-- Add video file metadata columns
ALTER TABLE room_tv_content 
ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_uploaded BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS video_duration INT DEFAULT NULL, -- Duration in seconds
ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT NULL; -- Relative path in /uploads/tv-content/

-- Add analytics columns (hidden for now, used later)
ALTER TABLE room_tv_content 
ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_count INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_rate DECIMAL(5,2) DEFAULT 0.00;

-- Add monetization columns (hidden for now, used post-Payment)
ALTER TABLE room_tv_content 
ADD COLUMN IF NOT EXISTS ad_type VARCHAR(20) DEFAULT 'host_ad', -- 'host_ad' or 'platform_ad'
ADD COLUMN IF NOT EXISTS revenue_share DECIMAL(5,2) DEFAULT 100.00; -- 100.00 = host keeps 100%

-- Create index for file cleanup queries
CREATE INDEX IF NOT EXISTS idx_room_tv_content_file_path ON room_tv_content(file_path) WHERE file_path IS NOT NULL;

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_room_tv_content_analytics ON room_tv_content(view_count, completion_count);
