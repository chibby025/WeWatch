package models

import "time"

// UserContentRatingPreference is one content rating a user has opted into
// seeing in their Feed / WatchOuts — one row per selection, written by the
// multi-select "what do you want to see" picker shared by OnboardingTour and
// UserPreferencesModal's Content Preferences (both write the same set via
// the same backend endpoint, so either surface always reflects the other).
//
// This is a hard INCLUDE filter applied at the SQL layer, ABOVE the feed's
// ranking algorithm — see getPreferredContentRatings/its callers in
// posts.go, session_helpers.go, community_events_handler.go — mirroring how
// canViewContentRating/restrictedContentRatings already gate age-eligibility
// the same way, one layer below this one. Deliberately separate from that
// age gate: this is a preference (what you WANT), the age gate is a safety
// eligibility check (what you're ALLOWED to see) — a rating can be excluded
// by either mechanism independently, and this table's rows never bypass the
// age gate.
//
// A user with zero rows here has expressed no preference yet — every caller
// treats an empty set as "don't filter, show everything" (never "show
// nothing"), same posture restrictedContentRatings already takes when
// nothing is age-restricted.
type UserContentRatingPreference struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;uniqueIndex:idx_user_content_rating_pref" json:"user_id"`
	Rating    string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_user_content_rating_pref" json:"rating"`
	CreatedAt time.Time `json:"created_at"`
}

func (UserContentRatingPreference) TableName() string {
	return "user_content_rating_preferences"
}
