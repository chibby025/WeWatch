-- Add voice note fields to room_messages table
ALTER TABLE room_messages 
ADD COLUMN IF NOT EXISTS audio_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS duration INT,
ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT 'text';

-- Add index for faster queries by message type
CREATE INDEX IF NOT EXISTS idx_room_messages_type ON room_messages(message_type);

-- Add comment for documentation
COMMENT ON COLUMN room_messages.audio_url IS 'Cloud storage URL for voice note audio file';
COMMENT ON COLUMN room_messages.duration IS 'Duration of voice note in seconds';
COMMENT ON COLUMN room_messages.message_type IS 'Type: text, voice_note, image, video, document';
