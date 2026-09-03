// backend/internal/handlers/content_rating_preference_handler_test.go
package handlers

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

func setupContentPreferenceTestDB() *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}
	if err := db.AutoMigrate(&models.User{}, &models.UserSettings{}, &models.UserContentRatingPreference{}, &models.Post{}); err != nil {
		panic("failed to migrate test database: " + err.Error())
	}
	return db
}

func newAuthedTestRouter(userID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set("user_id", userID)
		c.Next()
	})
	return router
}

// TestGetPreferredContentRatings_NoRowsMeansNoFilter verifies the "empty
// set = no preference expressed = don't filter" contract every caller
// (posts.go, session_helpers.go, community_events_handler.go) relies on.
func TestGetPreferredContentRatings_NoRowsMeansNoFilter(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "nopref", Email: "nopref@example.com", PasswordHash: "x"}
	DB.Create(&user)

	got := getPreferredContentRatings(DB, user.ID)
	if got != nil {
		t.Errorf("expected nil (no filter) for a user with zero preference rows, got %v", got)
	}
}

// TestGetPreferredContentRatings_ReturnsSavedRatings verifies the read side
// once rows genuinely exist.
func TestGetPreferredContentRatings_ReturnsSavedRatings(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "haspref", Email: "haspref@example.com", PasswordHash: "x"}
	DB.Create(&user)
	DB.Create(&models.UserContentRatingPreference{UserID: user.ID, Rating: "G"})
	DB.Create(&models.UserContentRatingPreference{UserID: user.ID, Rating: "Religious"})

	got := getPreferredContentRatings(DB, user.ID)
	if len(got) != 2 {
		t.Fatalf("expected 2 ratings, got %d: %v", len(got), got)
	}
	set := map[string]bool{got[0]: true, got[1]: true}
	if !set["G"] || !set["Religious"] {
		t.Errorf("expected {G, Religious}, got %v", got)
	}
}

// TestSetContentRatingPreferences_SavesAndDerivesFirstAsPrimary is the core
// end-to-end contract: a real POST with a real gin router, real DB, real
// auth context — confirms the full row-set is saved AND UserSettings.PrimaryRating
// is auto-derived from the FIRST submitted rating (the "smaller secondary
// nudge" signal design — see feed_algorithm.go's affinityBoost).
func TestSetContentRatingPreferences_SavesAndDerivesFirstAsPrimary(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "setpref", Email: "setpref@example.com", PasswordHash: "x"}
	DB.Create(&user)

	router := newAuthedTestRouter(user.ID)
	router.POST("/api/user/content-rating-preferences", SetContentRatingPreferencesHandler)

	body, _ := json.Marshal(SetContentRatingPreferencesRequest{Ratings: []string{"16+", "G", "Religious"}})
	req := httptest.NewRequest("POST", "/api/user/content-rating-preferences", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)

	var resp struct {
		Ratings []string `json:"ratings"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	assert.Equal(t, []string{"16+", "G", "Religious"}, resp.Ratings, "response should preserve submitted order")

	saved := getPreferredContentRatings(DB, user.ID)
	assert.Len(t, saved, 3)

	var settings models.UserSettings
	DB.Where("user_id = ?", user.ID).First(&settings)
	assert.Equal(t, "16+", settings.PrimaryRating, "PrimaryRating should auto-derive from the FIRST submitted rating")
}

// TestSetContentRatingPreferences_RejectsInvalidAndDuplicates confirms
// unknown rating values are silently dropped (not stored, not error-worthy —
// matches user_settings.go's own validRatings tolerance for a bad value)
// and a duplicate in the submitted list doesn't produce a duplicate row or
// shift what "first" means.
func TestSetContentRatingPreferences_RejectsInvalidAndDuplicates(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "dirtyinput", Email: "dirtyinput@example.com", PasswordHash: "x"}
	DB.Create(&user)

	router := newAuthedTestRouter(user.ID)
	router.POST("/api/user/content-rating-preferences", SetContentRatingPreferencesHandler)

	body, _ := json.Marshal(SetContentRatingPreferencesRequest{
		Ratings: []string{"G", "not-a-real-rating", "G", "18+"},
	})
	req := httptest.NewRequest("POST", "/api/user/content-rating-preferences", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)

	saved := getPreferredContentRatings(DB, user.ID)
	assert.Len(t, saved, 2, "the bogus value and the duplicate should both be dropped")

	var settings models.UserSettings
	DB.Where("user_id = ?", user.ID).First(&settings)
	assert.Equal(t, "G", settings.PrimaryRating, "the first VALID, de-duplicated rating should still be G")
}

// TestSetContentRatingPreferences_EmptySubmissionClearsEverything confirms
// unselecting everything genuinely clears both the preference rows and the
// derived PrimaryRating nudge — required for the "zero selections = no
// filter, show everything" contract to actually take effect after a user
// changes their mind, not just on a brand-new account.
func TestSetContentRatingPreferences_EmptySubmissionClearsEverything(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "clearer", Email: "clearer@example.com", PasswordHash: "x"}
	DB.Create(&user)
	DB.Create(&models.UserContentRatingPreference{UserID: user.ID, Rating: "G"})
	DB.Create(&models.UserSettings{UserID: user.ID, PrimaryRating: "G"})

	router := newAuthedTestRouter(user.ID)
	router.POST("/api/user/content-rating-preferences", SetContentRatingPreferencesHandler)

	body, _ := json.Marshal(SetContentRatingPreferencesRequest{Ratings: []string{}})
	req := httptest.NewRequest("POST", "/api/user/content-rating-preferences", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	assert.Nil(t, getPreferredContentRatings(DB, user.ID))

	var settings models.UserSettings
	DB.Where("user_id = ?", user.ID).First(&settings)
	assert.Equal(t, "", settings.PrimaryRating)
}

// TestGetContentRatingPreferences_RoundTrip confirms the GET endpoint
// reflects exactly what was saved via POST.
func TestGetContentRatingPreferences_RoundTrip(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	user := models.User{Username: "roundtrip", Email: "roundtrip@example.com", PasswordHash: "x"}
	DB.Create(&user)
	DB.Create(&models.UserContentRatingPreference{UserID: user.ID, Rating: "Educational"})

	router := newAuthedTestRouter(user.ID)
	router.GET("/api/user/content-rating-preferences", GetContentRatingPreferencesHandler)

	req := httptest.NewRequest("GET", "/api/user/content-rating-preferences", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	var resp struct {
		Ratings []string `json:"ratings"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.Equal(t, []string{"Educational"}, resp.Ratings)
}

// TestAffinityBoost_SmallNudgeOnlyWhenMatchingPrimary is the pure-function
// contract for the (now-simplified) secondary ranking nudge: exact match to
// the viewer's auto-derived primary = small boost; anything else, including
// an unset primary, = neutral. No adjacency tiers anymore — see
// feed_algorithm.go's comment on why that concept stopped being meaningful
// once a hard preference filter runs upstream.
func TestAffinityBoost_SmallNudgeOnlyWhenMatchingPrimary(t *testing.T) {
	cases := []struct {
		name          string
		viewerPrimary string
		postRating    string
		want          float64
	}{
		{"exact match gets the nudge", "G", "G", affinityFocusBoost},
		{"different rating stays neutral", "G", "PG", 1.0},
		{"formerly-adjacent rating is now just neutral", "G", "Educational", 1.0},
		{"no primary set is always neutral", "", "G", 1.0},
		{"no primary set, empty post rating too", "", "", 1.0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := affinityBoost(c.viewerPrimary, c.postRating)
			assert.Equal(t, c.want, got)
		})
	}
}

// TestColdPostsQuery_PreferredRatingsAppliesHardInclude confirms the new
// preferredRatings parameter genuinely filters at the SQL layer (not just in
// Go), matching the same pushdown discipline excludedRatings already has —
// required for offset-based pagination to stay exact.
func TestColdPostsQuery_PreferredRatingsAppliesHardInclude(t *testing.T) {
	DB = setupContentPreferenceTestDB()
	cutoff := time.Now().Add(time.Hour) // safely after every post's CreatedAt below

	posts := []models.Post{
		{UserID: 1, ContentRating: "G", IsPublic: true, Description: "g post"},
		{UserID: 1, ContentRating: "PG", IsPublic: true, Description: "pg post"},
		{UserID: 1, ContentRating: "Religious", IsPublic: true, Description: "religious post"},
	}
	for i := range posts {
		DB.Create(&posts[i])
	}

	var noFilter []models.Post
	coldPostsQuery(cutoff, "", nil, nil).Find(&noFilter)
	assert.Len(t, noFilter, 3, "no preference set — everything should still show")

	var filtered []models.Post
	coldPostsQuery(cutoff, "", nil, []string{"G", "Religious"}).Find(&filtered)
	assert.Len(t, filtered, 2, "only the preferred ratings should survive")
	for _, p := range filtered {
		assert.Contains(t, []string{"G", "Religious"}, p.ContentRating)
	}
}
