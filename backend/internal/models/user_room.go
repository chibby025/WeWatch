// WeWatch/backend/internal/models/user_room.go
package models

import (
    "gorm.io/gorm"
)

// UserRoom represents the many-to-many relationship between users and rooms
type UserRoom struct {
    gorm.Model
    UserID   uint   `gorm:"not null" json:"user_id"`
    RoomID   uint   `gorm:"not null" json:"room_id"`
    UserRole string `gorm:"type:varchar(20);default:'member'" json:"user_role"`
    // User is the associated user (will be preloaded)
    User     *User  `gorm:"foreignKey:UserID" json:"user,omitempty"`
}