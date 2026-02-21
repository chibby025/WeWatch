-- Migration: Add lecture hall number support for overflow halls
-- Date: 2026-01-20
-- Purpose: Enable multiple lecture halls when capacity exceeds 145 seats

-- Add lecture_hall_number column to watch_session_members
ALTER TABLE watch_session_members 
ADD COLUMN lecture_hall_number INT DEFAULT 1;

-- Create index for efficient hall-based queries
CREATE INDEX idx_watch_session_members_hall 
ON watch_session_members(watch_session_id, lecture_hall_number);

-- Add comment for documentation
COMMENT ON COLUMN watch_session_members.lecture_hall_number IS 'Lecture hall number (1, 2, 3...) for overflow support. Each hall has 145 seats.';
