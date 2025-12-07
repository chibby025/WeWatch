-- Add deleted_by_host column to room_messages table
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS deleted_by_host BOOLEAN DEFAULT FALSE;
