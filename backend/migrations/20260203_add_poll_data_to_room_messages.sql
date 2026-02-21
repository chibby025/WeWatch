-- Migration: Add poll support to room_messages
-- Description: Adds poll_data JSONB column to store poll information

-- Add poll_data column for storing poll information as JSONB
ALTER TABLE room_messages 
ADD COLUMN IF NOT EXISTS poll_data JSONB;

-- Create index on poll_data for faster queries
CREATE INDEX IF NOT EXISTS idx_room_messages_poll_data 
ON room_messages USING gin (poll_data);

-- Add comment to describe the column
COMMENT ON COLUMN room_messages.poll_data IS 'Stores poll data as JSON: {question, options, allow_multiple, votes, is_closed}';
