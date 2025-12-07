-- Add animation fields to room_tv_content table
-- Migration: add_animation_fields_to_room_tv_content.sql

ALTER TABLE room_tv_content
ADD COLUMN animation_type VARCHAR(50),
ADD COLUMN text_color VARCHAR(7),
ADD COLUMN bg_gradient TEXT,
ADD COLUMN animation_speed VARCHAR(20),
ADD COLUMN session_id BIGINT UNSIGNED;

-- Add index for session filtering
CREATE INDEX idx_room_tv_content_session_id ON room_tv_content(session_id);

-- Animation types: 'scroll-left', 'fade-pulse', 'slide-up', 'typewriter', 'bounce-in', 'zoom-flash'
-- Text colors: hex format like '#FF6B35'
-- Animation speeds: 'slow', 'medium', 'fast'
-- Session ID: Links content to specific watch session (NULL = room-level content)
