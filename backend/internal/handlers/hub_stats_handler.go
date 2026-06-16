package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetHubStatsHandler exposes the WebSocket Hub's Phase 3 observability counters —
// channel-full drop counts and current queue depths — so a slow-down can be
// confirmed by checking a number instead of grepping Railway logs after the fact.
// GET /api/admin/hub-stats (super_admin only)
func GetHubStatsHandler(c *gin.Context) {
	if hub == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "hub not initialized"})
		return
	}
	c.JSON(http.StatusOK, hub.Stats())
}
