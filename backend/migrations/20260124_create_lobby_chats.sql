-- WeWatch/backend/migrations/20260124_create_lobby_chats.sql
-- Migration: Create lobby_chats table for persistent direct messaging outside watch sessions
-- Purpose: Enable users to continue conversations after leaving watch sessions (sticky social connections)

-- Create lobby_chats table
CREATE TABLE IF NOT EXISTS lobby_chats (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    read_at TIMESTAMP,
    
    -- Ensure users can't message themselves
    CONSTRAINT check_different_users CHECK (sender_id != recipient_id),
    
    -- Ensure message is not empty
    CONSTRAINT check_message_not_empty CHECK (LENGTH(TRIM(message)) > 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lobby_chats_sender ON lobby_chats(sender_id);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_recipient ON lobby_chats(recipient_id);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_conversation ON lobby_chats(sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_unread ON lobby_chats(recipient_id, read_at) WHERE read_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lobby_chats_deleted ON lobby_chats(deleted_at) WHERE deleted_at IS NULL;

-- Add table comment
COMMENT ON TABLE lobby_chats IS 'Persistent direct messages between users in the lobby, creating sticky social connections outside of watch sessions. Enables cinema-like experience where conversations continue before/after events.';

-- Add column comments
COMMENT ON COLUMN lobby_chats.sender_id IS 'User who sent the message';
COMMENT ON COLUMN lobby_chats.recipient_id IS 'User who receives the message';
COMMENT ON COLUMN lobby_chats.message IS 'Message content (max 1000 chars enforced in app)';
COMMENT ON COLUMN lobby_chats.read_at IS 'Timestamp when recipient read the message (NULL = unread)';
COMMENT ON COLUMN lobby_chats.deleted_at IS 'Soft delete timestamp (NULL = not deleted)';
