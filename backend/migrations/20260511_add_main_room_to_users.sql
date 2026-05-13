-- Add main_room_id field to users table
-- This allows users to have a primary room that posts default to if no room is explicitly selected

ALTER TABLE users ADD COLUMN IF NOT EXISTS main_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_main_room_id ON users(main_room_id);

-- Add comment to explain the column
COMMENT ON COLUMN users.main_room_id IS 'User''s primary room ID - posts default to this room if not explicitly assigned';
