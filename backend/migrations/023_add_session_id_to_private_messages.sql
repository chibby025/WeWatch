-- Add session_id to private_messages for ephemeral session-based messaging
ALTER TABLE private_messages 
ADD COLUMN session_id VARCHAR(36);

-- Add index for fast deletion by session
CREATE INDEX idx_private_messages_session_id ON private_messages(session_id);

-- Add comment explaining the column
COMMENT ON COLUMN private_messages.session_id IS 'Optional session_id for ephemeral messages that should be deleted when session ends';
