package models

import "time"

// UserFollow represents a unidirectional follow relationship.
// Follow and room membership are independent — unfollowing does not remove the user from any room.
type UserFollow struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	FollowerID  uint      `gorm:"not null;index;uniqueIndex:idx_follow_pair" json:"follower_id"`
	FollowingID uint      `gorm:"not null;index;uniqueIndex:idx_follow_pair" json:"following_id"`
	CreatedAt   time.Time `json:"created_at"`
	Follower    *User     `gorm:"foreignKey:FollowerID" json:"follower,omitempty"`
	Following   *User     `gorm:"foreignKey:FollowingID" json:"following,omitempty"`
}
