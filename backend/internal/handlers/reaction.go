// WeWatch/backend/internal/handlers/reaction.go
package handlers

import (
    "net/http"
    "time"
    "strconv"
    "log" // Add log import for error logging if needed elsewhere
    
    "github.com/gin-gonic/gin"
    "wewatch-backend/internal/models"
)

// SendReactionHandler handles POST /api/rooms/:id/reactions
// Allows users to send reactions to a room
// NOTE: This HTTP endpoint likely shouldn't save reactions directly.
// Reactions should be sent via WebSocket { "type": "reaction", ... }.
// This handler could be removed or used for other purposes.
// For now, if kept, it should NOT broadcast using hub.BroadcastToRoom.
func SendReactionHandler(c *gin.Context) {
    // Get room ID from URL parameter
    roomIDStr := c.Param("id")
    if roomIDStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
        return
    }
    
    // Get authenticated user ID
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    
    // Convert user ID to uint
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }
    
    // Convert room ID to uint
    roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil || roomID == 0 {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
        return
    }
    
    // Parse reaction data
    var reactionData struct {
        Emoji string `json:"emoji" binding:"required"`
        SessionID string `json:"session_id,omitempty"`
        MessageID uint   `json:"message_id,omitempty"`
    }
    if err := c.ShouldBindJSON(&reactionData); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid reaction data"})
        return
    }
    
    // Validate emoji (basic validation)
    validEmojis := map[string]bool{
        "👍": true, "😂": true, "❤️": true, "🔥": true, "👏": true,
        "😍": true, "🙌": true, "🤔": true, "😢": true, "😡": true,
    }
    
    if !validEmojis[reactionData.Emoji] {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid emoji"})
        return
    }
    
    // Create reaction in database
    reaction := models.Reaction{
        UserID:    userID,
        RoomID:    uint(roomID),
        SessionID: reactionData.SessionID,
        Emoji:     reactionData.Emoji,
        Timestamp: time.Now(),
        MessageID: reactionData.MessageID,
    }
    
    result := DB.Create(&reaction)
    if result.Error != nil {
        log.Printf("Database error saving reaction: %v", result.Error) // Log the error
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save reaction"})
        return
    }
    
    // No broadcast here - broadcasting happens in websocket.go when a WebSocket message is received
    // e.g., a client sends { "type": "reaction", "data": { "emoji": "👍", ... } }
    // The readPump in websocket.go handles it, saves, and broadcasts using c.hub.BroadcastToRoom(c.roomID, broadcastBytes, c)

    // Consider if this HTTP endpoint should exist for saving reactions.
    // Real-time reactions are usually sent via WebSocket for immediate broadcast.
    // This HTTP endpoint just saves without broadcasting or notifying others.
    // You might want to deprecate this endpoint in favor of WebSocket messages.

    c.JSON(http.StatusOK, gin.H{
        "message": "Reaction received (saved via HTTP - no broadcast)",
        "reaction": reaction,
    })
}