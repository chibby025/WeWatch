-- Migration: Add seat_id to watch_session_members for persistent seating
-- Date: 2026-01-04
-- Purpose: Track which seat each member occupies in a watch session
-- This allows seating state to survive server restarts and be included in session_status broadcasts

-- Add seat_id column to store the seat assignment
ALTER TABLE watch_session_members 
ADD COLUMN IF NOT EXISTS seat_id INTEGER NULL;

-- Add index for faster lookups when querying by seat_id
CREATE INDEX IF NOT EXISTS idx_watch_session_members_seat_id 
ON watch_session_members(seat_id);

-- Add comment explaining the column
COMMENT ON COLUMN watch_session_members.seat_id IS 'The seat ID (1-145) assigned to this member in the 3D classroom. NULL if member has not taken a seat.';

-- Migration complete
-- Note: seat_id is nullable because members might be in session but not seated yet
-- seat_id will be updated by take_seat handler and cleared by release_seat/leave_session handlers
