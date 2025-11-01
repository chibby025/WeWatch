package handlers

import (
	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// GetSessionMembers fetches all active members for a given watch session.
func GetSessionMembers(DB *gorm.DB, sessionID uint) ([]models.WatchSessionMember, error) {
	var members []models.WatchSessionMember
	err := DB.Where("watch_session_id = ? AND is_active = ?", sessionID, true).Find(&members).Error
	return members, err
}
