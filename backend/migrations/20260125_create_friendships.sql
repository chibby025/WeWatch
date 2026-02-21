-- Create friendships table for friend request system
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT check_different_users CHECK (requester_id != recipient_id),
    CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'rejected')),
    CONSTRAINT unique_friendship UNIQUE (requester_id, recipient_id)
);

-- Indexes for fast lookups
CREATE INDEX idx_friendships_requester ON friendships(requester_id, status);
CREATE INDEX idx_friendships_recipient ON friendships(recipient_id, status);
CREATE INDEX idx_friendships_mutual ON friendships(requester_id, recipient_id);

-- Comments
COMMENT ON TABLE friendships IS 'Stores friend requests and accepted friendships';
COMMENT ON COLUMN friendships.status IS 'pending: awaiting acceptance, accepted: mutual friends, rejected: request denied';
