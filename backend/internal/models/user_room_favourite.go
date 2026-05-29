package models

import "time"

// UserRoomFavourite stores rooms a user has starred from WatchOut cards or the room list.
type UserRoomFavourite struct {
	ID        uint      `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID    uint      `gorm:"not null;uniqueIndex:idx_user_room_fav" json:"user_id"`
	RoomID    uint      `gorm:"not null;uniqueIndex:idx_user_room_fav" json:"room_id"`
	Room      *Room     `gorm:"foreignKey:RoomID" json:"room,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
