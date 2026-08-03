// WeWatch/backend/internal/models/lobby_chat_group.go
package models

import (
	"time"

	"gorm.io/gorm"
)

// LobbyGroup represents a lobby group chat (like a DM group)
type LobbyGroup struct {
	ID          uint           `gorm:"primarykey" json:"id"`
	Name        string         `gorm:"type:varchar(100);not null" json:"name"`
	Icon        string         `gorm:"type:varchar(500);default:''" json:"icon"`
	CreatedByID uint           `gorm:"not null;index" json:"created_by_id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`

	CreatedBy *User              `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
	Members   []LobbyGroupMember `gorm:"foreignKey:GroupID" json:"members,omitempty"`
}

func (LobbyGroup) TableName() string { return "lobby_groups" }

// LobbyGroupMember is a member of a lobby group chat
type LobbyGroupMember struct {
	ID         uint       `gorm:"primarykey" json:"id"`
	GroupID    uint       `gorm:"not null;index" json:"group_id"`
	UserID     uint       `gorm:"not null;index" json:"user_id"`
	LastReadAt *time.Time `json:"last_read_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`

	Group *LobbyGroup `gorm:"foreignKey:GroupID" json:"group,omitempty"`
	User  *User       `gorm:"foreignKey:UserID" json:"user,omitempty"`
}

func (LobbyGroupMember) TableName() string { return "lobby_group_members" }
