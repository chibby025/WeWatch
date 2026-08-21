package models

import "time"

// ChatReadPosition tracks, per user and per conversation, the highest
// message ID that user has scrolled past — a single shared mechanism used
// by all three chat surfaces (room chat, lobby DMs, lobby groups) to resume
// a conversation where the user actually left off, cross-device, rather
// than always jumping to the newest message. Deliberately separate from
// LobbyChat.ReadAt (per-message, unused by the frontend, written as a side
// effect of fetching) and LobbyGroupMember.LastReadAt (per-group timestamp,
// used only for the group-list unread-count badge) — those keep serving
// their existing narrower purposes unchanged.
//
// ConversationType is one of "room" | "dm" | "group".
// ConversationKey identifies the specific conversation within that type:
//   - room:  "<roomID>:<roomGroupID>" or "<roomID>:main" for the ungrouped
//     room-wide chat — matches the key shape the room-chat frontend already
//     used for its own (now-replaced) localStorage-only marker.
//   - dm:    the other participant's user ID, as a string.
//   - group: the lobby group's ID, as a string.
type ChatReadPosition struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	UserID            uint      `gorm:"not null;uniqueIndex:idx_chat_read_position_unique" json:"user_id"`
	ConversationType  string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_chat_read_position_unique" json:"conversation_type"`
	ConversationKey   string    `gorm:"type:varchar(100);not null;uniqueIndex:idx_chat_read_position_unique" json:"conversation_key"`
	LastReadMessageID uint      `gorm:"not null" json:"last_read_message_id"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (ChatReadPosition) TableName() string {
	return "chat_read_positions"
}
