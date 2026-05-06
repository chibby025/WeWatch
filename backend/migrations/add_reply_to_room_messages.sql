-- Add reply_to_id column to room_messages table
-- This allows messages to reference other messages they're replying to

ALTER TABLE room_messages 
ADD COLUMN reply_to_id INTEGER NULL,
ADD CONSTRAINT fk_room_messages_reply_to 
  FOREIGN KEY (reply_to_id) 
  REFERENCES room_messages(id) 
  ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX idx_room_messages_reply_to_id ON room_messages(reply_to_id);

-- Add comment
COMMENT ON COLUMN room_messages.reply_to_id IS 'References the message this message is replying to';
