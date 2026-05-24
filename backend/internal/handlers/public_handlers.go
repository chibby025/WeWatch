package handlers

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetPublicLiveSessionsHandler returns non-private rooms with an active session.
// No auth required — used by the /explore page for logged-out visitors.
// GET /api/public/live-sessions
func GetPublicLiveSessionsHandler(c *gin.Context) {
	type PublicSession struct {
		RoomID        uint   `json:"room_id"`
		RoomName      string `json:"room_name"`
		RoomType      string `json:"room_type"`
		WatchType     string `json:"watch_type"`
		SessionTitle  string `json:"session_title"`
		HostUsername  string `json:"host_username"`
		WatchingCount int64  `json:"watching_count"`
	}

	var results []PublicSession
	err := DB.Raw(`
		SELECT
			r.id             AS room_id,
			r.name           AS room_name,
			r.room_type,
			ws.watch_type,
			COALESCE(ws.session_title, '') AS session_title,
			COALESCE(u.username, '')       AS host_username,
			(
				SELECT COUNT(*)
				FROM watch_session_members wsm
				WHERE wsm.watch_session_id = ws.id AND wsm.is_active = true
			) AS watching_count
		FROM rooms r
		INNER JOIN watch_sessions ws
			ON ws.room_id = r.id
			AND ws.is_active = true
			AND ws.is_private = false
			AND ws.ended_at IS NULL
			AND ws.deleted_at IS NULL
		LEFT JOIN users u ON u.id = r.host_id
		WHERE r.deleted_at IS NULL
		ORDER BY watching_count DESC
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
