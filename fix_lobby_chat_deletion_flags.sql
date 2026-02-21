-- Fix lobby_chats deletion flags that are incorrectly set to true
-- These should default to false when messages are created

-- First, let's see the current state
SELECT 
    id, 
    sender_id, 
    recipient_id, 
    deleted_by_sender, 
    deleted_by_recipient,
    LEFT(message, 50) as message_preview,
    created_at 
FROM lobby_chats 
WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7)
ORDER BY created_at;

-- Reset all incorrectly set deletion flags to false
UPDATE lobby_chats 
SET 
    deleted_by_sender = false,
    deleted_by_recipient = false
WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7);

-- Verify the fix
SELECT 
    id, 
    sender_id, 
    recipient_id, 
    deleted_by_sender, 
    deleted_by_recipient,
    LEFT(message, 50) as message_preview,
    created_at 
FROM lobby_chats 
WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7)
ORDER BY created_at;

-- Check the table schema to see default values
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'lobby_chats' 
    AND column_name IN ('deleted_by_sender', 'deleted_by_recipient')
ORDER BY ordinal_position;
