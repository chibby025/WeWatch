-- ============================================
-- Lobby Chat Enhancements Migration
-- Date: 2026-02-06
-- Description: Adds support for attachments, voice notes, stickers, polls, blocking
-- ============================================

-- Step 1: Add new columns to lobby_chats table for rich message types
ALTER TABLE lobby_chats 
ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN IF NOT EXISTS attachment_url TEXT,
ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
ADD COLUMN IF NOT EXISTS metadata JSONB,
ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_by_sender BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deleted_by_recipient BOOLEAN DEFAULT FALSE;

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lobby_chats_type ON lobby_chats(message_type);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_sender_deleted ON lobby_chats(sender_id, deleted_by_sender);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_recipient_deleted ON lobby_chats(recipient_id, deleted_by_recipient);
CREATE INDEX IF NOT EXISTS idx_lobby_chats_edited ON lobby_chats(edited) WHERE edited = TRUE;

-- Step 3: Create user_blocks table
CREATE TABLE IF NOT EXISTS user_blocks (
    id SERIAL PRIMARY KEY,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_block UNIQUE(blocker_id, blocked_id),
    CONSTRAINT check_no_self_block CHECK (blocker_id != blocked_id)
);

-- Step 4: Create indexes for user_blocks
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_pair ON user_blocks(blocker_id, blocked_id);

-- Step 5: Add comments for documentation
COMMENT ON COLUMN lobby_chats.message_type IS 'Message type: text, voice_note, image, video, document, link, sticker, poll';
COMMENT ON COLUMN lobby_chats.attachment_url IS 'URL/path to uploaded file or external resource (stickers, links)';
COMMENT ON COLUMN lobby_chats.attachment_name IS 'Original filename for downloads';
COMMENT ON COLUMN lobby_chats.attachment_size IS 'File size in bytes';
COMMENT ON COLUMN lobby_chats.metadata IS 'JSON data for polls (votes, options), voice notes (duration), stickers (provider, id), etc.';
COMMENT ON COLUMN lobby_chats.edited IS 'TRUE if message has been edited';
COMMENT ON COLUMN lobby_chats.deleted_by_sender IS 'TRUE if sender deleted this message';
COMMENT ON COLUMN lobby_chats.deleted_by_recipient IS 'TRUE if recipient deleted this message';

COMMENT ON TABLE user_blocks IS 'User blocking system - prevents messaging without removing friendship';
COMMENT ON COLUMN user_blocks.blocker_id IS 'User who initiated the block';
COMMENT ON COLUMN user_blocks.blocked_id IS 'User who is blocked';

-- Step 6: Add constraint to prevent empty messages for text type
ALTER TABLE lobby_chats 
DROP CONSTRAINT IF EXISTS check_message_not_empty;

ALTER TABLE lobby_chats 
ADD CONSTRAINT check_message_not_empty 
CHECK (
    message_type != 'text' OR 
    (message_type = 'text' AND LENGTH(TRIM(message)) > 0)
);

-- ============================================
-- Success Message
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '✅ Lobby chat enhancements migration completed successfully!';
    RAISE NOTICE '📁 Next step: Create upload directories (see LOBBY_CHAT_ENHANCEMENTS.md)';
END $$;
