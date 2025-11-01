package models

import "gorm.io/gorm"

// MigrateScreenShare migrates the ScreenShare model.
func MigrateScreenShare(db *gorm.DB) error {
	return db.AutoMigrate(&ScreenShare{})
}
