package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// validContentRatingPreferences mirrors the exact 8 content_rating values
// used everywhere else in this codebase (see user_settings.go's own
// validRatings, RATING_SECTIONS in OnboardingTour.jsx). Kept as its own
// small set here rather than exported/shared, since the two call sites
// (user_settings.go's single-value PrimaryRating validation, this file's
// multi-select validation) are independent concerns that happen to share a
// vocabulary, not one that needs a single source of truth to stay correct.
var validContentRatingPreferences = map[string]bool{
	"G": true, "PG": true, "Educational": true, "Religious": true,
	"13+": true, "16+": true, "18+": true, "Mature": true,
}

// getPreferredContentRatings returns the ratings a user has explicitly opted
// into via the multi-select "what do you want to see" picker (see
// UserContentRatingPreference). An empty/nil return means "no preference
// expressed" — every caller (posts.go, session_helpers.go,
// community_events_handler.go) treats that as "don't filter, show
// everything," never "show nothing" — the same posture restrictedContentRatings
// already takes when nothing is age-restricted.
func getPreferredContentRatings(db *gorm.DB, userID uint) []string {
	if userID == 0 {
		return nil
	}
	var rows []models.UserContentRatingPreference
	db.Where("user_id = ?", userID).Find(&rows)
	if len(rows) == 0 {
		return nil
	}
	ratings := make([]string, len(rows))
	for i, r := range rows {
		ratings[i] = r.Rating
	}
	return ratings
}

// GetContentRatingPreferencesHandler handles GET /api/user/content-rating-preferences.
// Returns the current user's selected ratings — empty array means "none set yet."
func GetContentRatingPreferencesHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)
	ratings := getPreferredContentRatings(DB, userID)
	if ratings == nil {
		ratings = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"ratings": ratings})
}

// SetContentRatingPreferencesRequest is the body for
// POST /api/user/content-rating-preferences.
type SetContentRatingPreferencesRequest struct {
	// Ratings is the FULL desired set, in the order the user selected them —
	// this replaces whatever was previously stored, it is not a delta/toggle.
	// Order matters: Ratings[0] becomes the auto-derived UserSettings.PrimaryRating
	// nudge signal (see the comment on that write below).
	Ratings []string `json:"ratings"`
}

// SetContentRatingPreferencesHandler handles POST /api/user/content-rating-preferences.
// Used by both OnboardingTour and UserPreferencesModal's Content Preferences —
// both call the same endpoint with the same full-replace semantics, so
// whichever surface a user last edited from is always the source of truth
// the other one reflects.
//
// As a side effect, also writes UserSettings.PrimaryRating to the first
// submitted rating (or clears it to "" for an empty submission). PrimaryRating
// no longer means "the user's content preference" (that's this table now) —
// it's repurposed as a small, auto-derived ranking nudge: among your several
// selected ratings, whichever one you picked first gets a slight boost over
// the others in ScoreAndSortPosts/affinityBoost (feed_algorithm.go) and the
// same CASE-WHEN tie-break community_events_handler.go already used before
// this feature existed. Deliberately NOT the same value as "Default Session
// Rating" (UserPreferencesModal's separate, client-only localStorage control,
// left untouched by this feature) — the two happen to share a backend column
// today only because PrimaryRating had no other job left once this table
// took over its original purpose.
func SetContentRatingPreferencesHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	var req SetContentRatingPreferencesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Validate + de-duplicate while preserving first-occurrence order (so
	// Ratings[0] below is deterministic even if the client somehow sent a
	// duplicate first).
	seen := make(map[string]bool, len(req.Ratings))
	clean := make([]string, 0, len(req.Ratings))
	for _, r := range req.Ratings {
		if !validContentRatingPreferences[r] || seen[r] {
			continue
		}
		seen[r] = true
		clean = append(clean, r)
	}

	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", userID).Delete(&models.UserContentRatingPreference{}).Error; err != nil {
			return err
		}
		if len(clean) > 0 {
			rows := make([]models.UserContentRatingPreference, len(clean))
			for i, r := range clean {
				rows[i] = models.UserContentRatingPreference{UserID: userID, Rating: r}
			}
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}

		primary := ""
		if len(clean) > 0 {
			primary = clean[0]
		}
		var settings models.UserSettings
		if err := tx.Where("user_id = ?", userID).First(&settings).Error; err == gorm.ErrRecordNotFound {
			return tx.Create(&models.UserSettings{UserID: userID, PrimaryRating: primary}).Error
		} else if err != nil {
			return err
		}
		return tx.Model(&settings).Update("primary_rating", primary).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save preferences"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ratings": clean})
}
