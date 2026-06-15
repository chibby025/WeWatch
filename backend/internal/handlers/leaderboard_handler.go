package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type leaderboardRoom struct {
	RoomID        uint    `json:"room_id"`
	Name          string  `json:"name"`
	ImageURL      string  `json:"image_url"`
	RoomType      string  `json:"room_type"`
	ContentRating string  `json:"content_rating"`
	HostID        uint    `json:"host_id"`
	HostUsername  string  `json:"host_username"`
	HostAvatar    string  `json:"host_avatar_url"`
	AvgRating     float64 `json:"avg_rating"`
	TotalRatings  int64   `json:"total_ratings"`
	BayesScore    float64 `json:"bayes_score"`
}

// GetRoomsLeaderboardHandler handles GET /api/rooms/leaderboard
// Returns top 10 rooms ranked by Bayesian credible rating.
func GetRoomsLeaderboardHandler(c *gin.Context) {
	var rooms []leaderboardRoom
	err := DB.Raw(`
		SELECT
			r.id                                         AS room_id,
			r.name,
			r.image_url,
			r.room_type,
			r.content_rating,
			u.id                                         AS host_id,
			u.username                                   AS host_username,
			u.avatar_url                                 AS host_avatar,
			ROUND(AVG(sr.rating)::numeric, 2)            AS avg_rating,
			COUNT(sr.id)                                 AS total_ratings,
			(COUNT(sr.id) * AVG(sr.rating) + 5 * 3.0) / (COUNT(sr.id) + 5) AS bayes_score
		FROM rooms r
		JOIN session_ratings sr ON sr.room_id = r.id
		JOIN users u ON u.id = r.host_id
		WHERE r.deleted_at IS NULL
		GROUP BY r.id, u.id, u.username, u.avatar_url
		HAVING COUNT(sr.id) >= 2
		ORDER BY bayes_score DESC
		LIMIT 10
	`).Scan(&rooms).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch leaderboard"})
		return
	}
	if rooms == nil {
		rooms = []leaderboardRoom{}
	}
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}
