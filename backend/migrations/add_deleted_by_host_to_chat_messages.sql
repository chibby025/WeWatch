-- Add deleted_by_host column to chat_messages table
ALTER TABLE chat_messages ADD COLUMN deleted_by_host BOOLEAN DEFAULT FALSE;
