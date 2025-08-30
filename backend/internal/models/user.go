package models

import (
	"gorm.io/gorm"
	//"time"
)

// User represents a user in the Wewatch application
// gorm.Model provides ID, CreatedAt, UpdatedAt, DeletedAt fields automatically
type User struct {
	gorm.Model // Embeds ID, CreatedAt, UpdatedAt, DeletedAT
	Username   string  `gorm:"type:varchar(50);uniqueIndex;not null" json:"username"`
	Email	   string  `gorm:"type:varchar(100);uniqueIndex;not null" json:"email"`
	// Passwordhash to store hashed password not plain text!
	PasswordHash string `gorm:"type:varchar(255);not null" json:"-"`
}

