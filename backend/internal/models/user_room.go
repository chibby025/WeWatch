// WeWatch/backend/internal/models/user_room.go
package models

import (
    "time"
    "gorm.io/gorm"
)

// UserRoom represents the many-to-many relationship between users and rooms
type UserRoom struct {
    gorm.Model
    UserID        uint       `gorm:"not null" json:"user_id"`
    RoomID        uint       `gorm:"not null" json:"room_id"`
    UserRole      string     `gorm:"type:varchar(20);default:'member'" json:"user_role"`
    // Status is 'active' for confirmed members, 'pending' for join requests awaiting host approval (private rooms)
    Status        string     `gorm:"type:varchar(20);default:'active'" json:"status"`
    User          *User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
    SeatRow       *int       `json:"seat_row"`
    SeatCol       *int       `json:"seat_col"`
    LastVisitedAt *time.Time `gorm:"index" json:"last_visited_at,omitempty"`
    IsBanned      bool       `gorm:"default:false" json:"is_banned"`
    BannedAt      *time.Time `json:"banned_at,omitempty"`
}