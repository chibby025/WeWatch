CREATE TABLE IF NOT EXISTS private_messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    CONSTRAINT private_messages_sender_receiver_check CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_private_messages_sender_id ON private_messages(sender_id);
CREATE INDEX idx_private_messages_receiver_id ON private_messages(receiver_id);
CREATE INDEX idx_private_chat ON private_messages(sender_id, receiver_id);
CREATE INDEX idx_private_messages_created_at ON private_messages(created_at DESC);
CREATE INDEX idx_private_messages_deleted_at ON private_messages(deleted_at);

-- Index for fetching conversation between two users (both directions)
CREATE INDEX idx_private_messages_conversation ON private_messages(
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
);
