-- Cross-device chat scroll-resume position — shared by room chat, lobby DMs,
-- and lobby groups (see backend/internal/models/chat_read_position.go for
-- the full design comment).
--
-- This model IS included in main.go's AutoMigrate list, so GORM creates this
-- table automatically the next time the backend starts (local dev, and
-- Railway on its next deploy) — no manual SQL needed on any environment.
-- Kept here as a reference/fallback only, matching this project's own
-- established convention for other AutoMigrate'd tables (see the
-- Community Events section of CLAUDE.md).
--
-- Safe to run more than once (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS chat_read_positions (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_type    VARCHAR(20) NOT NULL,
  conversation_key     VARCHAR(100) NOT NULL,
  last_read_message_id BIGINT NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, conversation_type, conversation_key)
);
