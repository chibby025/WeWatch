package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetPublicLiveSessionsHandler returns non-private public sessions for unauthenticated visitors.
// Returns enough fields to render the full session preview card in the WatchOut snap-scroll.
// No auth required.
// GET /api/public/live-sessions
func GetPublicLiveSessionsHandler(c *gin.Context) {
	type PublicSession struct {
		SessionID     string  `json:"session_id"`
		RoomID        uint    `json:"room_id"`
		RoomName      string  `json:"room_name"`
		RoomAvatarURL string  `json:"room_avatar_url"`
		RoomType      string  `json:"room_type"`
		WatchType     string  `json:"watch_type"`
		SessionTitle  string  `json:"session_title"`
		HostID        uint    `json:"host_id"`
		HostUsername  string  `json:"host_username"`
		ContentRating string  `json:"content_rating"`
		MemberCount   int64   `json:"member_count"`
		IsTemporary   bool    `json:"is_temporary"`
		IsPrivate     bool    `json:"is_private"`
		PreviewURL    string  `json:"preview_url"`
		PosterURL     string  `json:"poster_url"`
		AverageRating float64 `json:"average_rating"`
		TotalRatings  int     `json:"total_ratings"`
		StartedAt     string  `json:"started_at"`
	}

	var results []PublicSession
	err := DB.Raw(`
		SELECT
			ws.session_id,
			r.id                              AS room_id,
			r.name                            AS room_name,
			COALESCE(r.image_url, '')         AS room_avatar_url,
			COALESCE(r.room_type, '')         AS room_type,
			ws.watch_type,
			COALESCE(ws.session_title, '')    AS session_title,
			r.host_id,
			COALESCE(u.username, '')          AS host_username,
			COALESCE(ws.content_rating, 'G') AS content_rating,
			(
				SELECT COUNT(*)
				FROM watch_session_members wsm
				WHERE wsm.watch_session_id = ws.id AND wsm.is_active = true
			)                                 AS member_count,
			r.is_temporary,
			ws.is_private,
			COALESCE(ws.preview_url, '')      AS preview_url,
			COALESCE(ws.poster_url, '')       AS poster_url,
			COALESCE(r.average_rating, 0.0)   AS average_rating,
			COALESCE(r.total_ratings, 0)      AS total_ratings,
			ws.started_at
		FROM rooms r
		INNER JOIN watch_sessions ws
			ON ws.room_id = r.id
			AND ws.is_active = true
			AND ws.is_private = false
			AND ws.ended_at IS NULL
			AND ws.deleted_at IS NULL
		LEFT JOIN users u ON u.id = r.host_id AND u.deleted_at IS NULL
		WHERE r.deleted_at IS NULL
		  AND r.is_public = true
		ORDER BY member_count DESC
		LIMIT 50
	`).Scan(&results).Error

	if err != nil {
		log.Printf("GetPublicLiveSessionsHandler: DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sessions"})
		return
	}

	if results == nil {
		results = []PublicSession{}
	}

	c.JSON(http.StatusOK, gin.H{"sessions": results})
}
