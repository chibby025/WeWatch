-- Create room_invitations table for private room access control
CREATE TABLE IF NOT EXISTS room_invitations (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    invited_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, -- NULL for invite links
    inviter_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_token VARCHAR(64) UNIQUE, -- For shareable invite links
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, expired
    expires_at TIMESTAMP, -- NULL for permanent invites
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_room_invitations_room_id ON room_invitations(room_id);
CREATE INDEX idx_room_invitations_invited_user_id ON room_invitations(invited_user_id);
CREATE INDEX idx_room_invitations_invite_token ON room_invitations(invite_token);
CREATE INDEX idx_room_invitations_status ON room_invitations(status);
