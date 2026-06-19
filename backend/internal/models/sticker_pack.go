package models

import "time"

type StickerPack struct {
	ID            uint          `gorm:"primaryKey" json:"id"`
	Name          string        `gorm:"type:varchar(100);not null" json:"name"`
	Source        string        `gorm:"type:varchar(20);not null;default:'user'" json:"source"` // user | telegram | system
	TelegramSlug  string        `gorm:"type:varchar(100);index" json:"telegram_slug,omitempty"`
	CreatorUserID *uint         `gorm:"index" json:"creator_user_id,omitempty"`
	ThumbnailURL  string        `gorm:"type:text" json:"thumbnail_url,omitempty"`
	IsPublic      bool          `gorm:"default:false" json:"is_public"`
	StickerCount  int           `gorm:"default:0" json:"sticker_count"`
	CreatedAt     time.Time     `json:"created_at"`
	UpdatedAt     time.Time     `json:"updated_at"`
	Items         []StickerItem `gorm:"foreignKey:PackID" json:"items,omitempty"`
}

type StickerItem struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PackID    uint      `gorm:"not null;index" json:"pack_id"`
	URL       string    `gorm:"type:text;not null" json:"url"`
	Emoji     string    `gorm:"type:varchar(10)" json:"emoji,omitempty"`
	SortOrder int       `gorm:"default:0" json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type UserStickerPack struct {
	ID      uint      `gorm:"primaryKey" json:"id"`
	UserID  uint      `gorm:"not null;uniqueIndex:idx_user_sticker_pack" json:"user_id"`
	PackID  uint      `gorm:"not null;uniqueIndex:idx_user_sticker_pack" json:"pack_id"`
	AddedAt time.Time `gorm:"autoCreateTime" json:"added_at"`
}
