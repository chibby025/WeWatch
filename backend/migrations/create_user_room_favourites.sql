-- Create user_room_favourites table (bookmark/favourite a room from WatchOut cards
-- or the room list). This model is NOT in main.go's AutoMigrate list, so it must be
-- created manually here rather than relying on GORM to create it on backend startup.
--
-- Schema mirrors exactly what GORM's AutoMigrate produced for this table locally
-- (confirmed via \d user_room_favourites against the local dev DB before writing
-- this file), so behavior is identical between local dev and this manual migration.
--
-- Safe to run more than once (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS user_room_favourites (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id    BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, room_id)
);
