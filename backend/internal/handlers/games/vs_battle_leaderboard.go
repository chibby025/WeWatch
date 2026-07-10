package games

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type VsBattlePlayerStat struct {
	UserID     uint    `json:"user_id"`
	Username   string  `json:"username"`
	AvatarURL  string  `json:"avatar_url"`
	TotalGames int     `json:"total_games"`
	Wins       int     `json:"wins"`
	Losses     int     `json:"losses"`
	WinRate    float64 `json:"win_rate"`
}

// GetVsBattleLeaderboardHandler returns top VS Battle players ranked by wins.
// GET /api/games/vs-battle/leaderboard
func GetVsBattleLeaderboardHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats []VsBattlePlayerStat
		err := db.Raw(`
			SELECT
				u.id                                                                           AS user_id,
				u.username,
				COALESCE(u.avatar_url, '')                                                     AS avatar_url,
				COUNT(*)                                                                       AS total_games,
				COUNT(CASE WHEN gs.winner_id = (elem->>'user_id')::bigint THEN 1 END)         AS wins,
				COUNT(CASE WHEN gs.winner_id IS NOT NULL
				           AND gs.winner_id != (elem->>'user_id')::bigint THEN 1 END)         AS losses,
				ROUND(
					COUNT(CASE WHEN gs.winner_id = (elem->>'user_id')::bigint THEN 1 END)::numeric
					/ NULLIF(COUNT(*), 0) * 100
				, 1)                                                                           AS win_rate
			FROM game_sessions gs,
				jsonb_array_elements(gs.players::jsonb) AS elem
			JOIN users u ON u.id = (elem->>'user_id')::bigint
			WHERE gs.game_type = 'vs_battle'
			  AND gs.status IN ('completed', 'forfeited')
			  AND gs.ended_at IS NOT NULL
			  AND gs.deleted_at IS NULL
			GROUP BY u.id, u.username, u.avatar_url
			HAVING COUNT(*) >= 1
			ORDER BY wins DESC, win_rate DESC, total_games DESC
			LIMIT 10
		`).Scan(&stats).Error

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch VS Battle leaderboard"})
			return
		}
		if stats == nil {
			stats = []VsBattlePlayerStat{}
		}
		c.JSON(http.StatusOK, gin.H{"players": stats})
	}
}
