// WeWatch/backend/internal/models/room_group.go
package models

import (
	"time"
	"gorm.io/gorm"
)

// RoomGroup represents a subgroup/channel within a room (like Discord channels)
// Used for chat segmentation - does NOT have separate watch sessions
type RoomGroup struct {
	gorm.Model
	RoomID      uint   `gorm:"not null;index" json:"room_id"`
	Name        string `gorm:"type:varchar(100);not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	Icon        string `gorm:"type:varchar(50)" json:"icon"` // Emoji or icon identifier
	CreatedBy   uint   `gorm:"not null" json:"created_by"`   // User ID who created the group
	IsPublic    bool   `gorm:"default:true" json:"is_public"` // Public groups are visible to all room members
	DisplayOrder int   `gorm:"default:0" json:"display_order"` // For custom ordering in sidebar
	
	// Associations
	Room      Room   `gorm:"foreignKey:RoomID" json:"room,omitempty"`
	Creator   User   `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	Members   []User `gorm:"many2many:user_room_groups;" json:"members,omitempty"`
}

// UserRoomGroup represents the many-to-many relationship between users and room groups
type UserRoomGroup struct {
	UserID      uint      `gorm:"primaryKey" json:"user_id"`
	RoomGroupID uint      `gorm:"primaryKey" json:"room_group_id"`
	JoinedAt    time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"joined_at"`
	
	// Associations
	User      User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	RoomGroup RoomGroup `gorm:"foreignKey:RoomGroupID" json:"room_group,omitempty"`
}
