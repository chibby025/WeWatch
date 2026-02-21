-- Create friendships table for user friend requests and connections
-- This enables users to send/accept/reject friend requests and chat in the lobby

CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys to users table
    CONSTRAINT fk_friendships_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_friendships_recipient FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
    
    -- Ensure a user cannot send a friend request to themselves
    CONSTRAINT chk_no_self_friendship CHECK (requester_id != recipient_id),
    
    -- Ensure only one friendship record exists between two users (no duplicates)
    CONSTRAINT uq_friendship_pair UNIQUE (requester_id, recipient_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_recipient ON friendships(recipient_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Create a compound index for common queries (finding friendships between two users)
CREATE INDEX IF NOT EXISTS idx_friendships_pair ON friendships(requester_id, recipient_id);

-- Add a comment to the table
COMMENT ON TABLE friendships IS 'Stores friend requests and accepted friendships between users';
COMMENT ON COLUMN friendships.status IS 'Status can be: pending, accepted, or rejected';
