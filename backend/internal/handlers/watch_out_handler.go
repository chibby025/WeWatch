// WeWatch/backend/internal/handlers/watch_out_handler.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// GetRoomsWithActiveSessionsHandler returns rooms the current user has joined that have live sessions.
// GET /api/rooms/with-active-sessions
func GetRoomsWithActiveSessionsHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID, ok := userID.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	type RoomWithSession struct {
		RoomID        uint   `json:"room_id"`
		RoomName      string `json:"room_name"`
		RoomType      string `json:"room_type"`
		WatchType     string `json:"watch_type"`
		SessionTitle  string `json:"session_title"`
		IsPrivate     bool   `json:"is_private"`
		SessionID     string `json:"session_id"`
		WatchingCount int64  `json:"watching_count"`
		HostID        uint   `json:"host_id"`
	}

	var results []RoomWithSession
	err := DB.Raw(`
		SELECT
			r.id AS room_id,
			r.name AS room_name,
			r.room_type,
			ws.watch_type,
			COALESCE(ws.session_title, '') AS session_title,
			ws.is_private,
			ws.session_id,
			r.host_id,
			(SELECT COUNT(*) FROM watch_session_members wsm
			 WHERE wsm.watch_session_id = ws.id AND wsm.is_active = true) AS watching_count
		FROM rooms r
		INNER JOIN user_rooms ur
			ON ur.room_id = r.id
			AND ur.user_id = ?
			AND ur.deleted_at IS NULL
			AND (ur.is_banned = false OR ur.is_banned IS NULL)
			AND ur.status = 'active'
		INNER JOIN watch_sessions ws
			ON ws.room_id = r.id
			AND ws.is_active = true
			AND ws.ended_at IS NULL
			AND ws.deleted_at IS NULL
		WHERE r.deleted_at IS NULL
		ORDER BY watching_count DESC
	`, currentUserID).Scan(&results).Error

	if err != nil {
		log.Printf("GetRoomsWithActiveSessionsHandler: DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sessions"})
		return
	}

	if results == nil {
		results = []RoomWithSession{}
	}

	c.JSON(http.StatusOK, gin.H{"rooms": results})
}

// SendWatchOutRequest is the request body for sending a WatchOut invite.
type SendWatchOutRequest struct {
	RecipientID uint `json:"recipient_id" binding:"required"`
	RoomID      uint `json:"room_id" binding:"required"`
}

// SendWatchOutHandler sends a WatchOut DM invite to a friend for a room's active session.
// POST /api/lobby-chats/watch-out
func SendWatchOutHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	senderID, ok := userID.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req SendWatchOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.RecipientID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send to yourself"})
		return
	}

	db := c.MustGet("db").(*gorm.DB)

	// Verify accepted friendship
	var friendship models.Friendship
	if err := db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		senderID, req.RecipientID, req.RecipientID, senderID, models.FriendshipStatusAccepted,
	).First(&friendship).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "Must be friends to send WatchOut invites"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Block check
	var blockCount int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		senderID, req.RecipientID, req.RecipientID, senderID,
	).Count(&blockCount)
	if blockCount > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send message - user blocked"})
		return
	}

	// Sender must be a member of the room
	var userRoom models.UserRoom
	if err := db.Where("room_id = ? AND user_id = ? AND deleted_at IS NULL", req.RoomID, senderID).First(&userRoom).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "You are not a member of this room"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var room models.Room
	if err := db.First(&room, req.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	var session models.WatchSession
	if err := db.Where("room_id = ? AND is_active = true", req.RoomID).First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "No active session in this room"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Private session: only the host can share
	if session.IsPrivate && room.HostID != senderID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can share private sessions"})
		return
	}

	// Snapshot watching count at send time
	var watchingCount int64
	db.Model(&models.WatchSessionMember{}).
		Where("watch_session_id = ? AND is_active = true", session.ID).
		Count(&watchingCount)

	metadata := map[string]interface{}{
		"room_id":        room.ID,
		"room_name":      room.Name,
		"room_type":      room.RoomType,
		"watch_type":     session.WatchType,
		"session_title":  session.SessionTitle,
		"watching_count": int(watchingCount),
		"session_id":     session.SessionID,
		"host_id":        room.HostID,
	}
	metaJSON, _ := json.Marshal(metadata)
	metaStr := string(metaJSON)

	message := "👀 Watch Out! Join me in " + room.Name

	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: req.RecipientID,
		Message:     message,
		MessageType: "watch_out",
		Metadata:    &metaStr,
	}

	if err := db.Create(&chat).Error; err != nil {
		log.Printf("SendWatchOutHandler: Failed to create message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send WatchOut"})
		return
	}

	var sender models.User
	db.First(&sender, senderID)

	BroadcastLobbyChatMessage(db, chat, sender)

	go CreateNotification(req.RecipientID, "watch_invite", "@"+sender.Username+" invited you to watch", "Join "+room.Name, "room", req.RoomID)

	log.Printf("SendWatchOutHandler: WatchOut sent from user %d to user %d for room %d", senderID, req.RecipientID, req.RoomID)
	c.JSON(http.StatusOK, gin.H{"message": "WatchOut sent"})
}

// SearchUsersHandler returns users matching a username/email query (excludes self).
// GET /api/users/search?q=...
func SearchUsersHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	currentUserID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	q := strings.TrimSpace(c.Query("q"))
	// Strip leading @ so users can type @username naturally
	q = strings.TrimPrefix(q, "@")
	if len(q) < 2 {
		c.JSON(http.StatusOK, gin.H{"users": []interface{}{}})
		return
	}

	// Use package-level DB — this handler is registered in the protected group which doesn't inject "db"
	db := DB

	type UserResult struct {
		ID        uint   `json:"id"`
		Username  string `json:"username"`
		AvatarURL string `json:"avatar_url"`
	}

	var users []UserResult
	err := db.Model(&models.User{}).
		Select("id, username, avatar_url").
		Where("(username ILIKE ? OR email ILIKE ?) AND id != ? AND deleted_at IS NULL", "%"+q+"%", "%"+q+"%", currentUserID).
		Limit(10).
		Find(&users).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Search failed"})
		return
	}
	if users == nil {
		users = []UserResult{}
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}

// GetWatchoutAllowedRatingsHandler returns the content ratings both users may watch together.
// Educational and Religious are always included regardless of age.
// GET /api/lobby-chats/watchout-ratings?recipient_id=X
func GetWatchoutAllowedRatingsHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	senderID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	recipientIDStr := c.Query("recipient_id")
	recipientID64, err := strconv.ParseUint(recipientIDStr, 10, 64)
	if err != nil || recipientIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid recipient_id"})
		return
	}
	recipientID := uint(recipientID64)

	db := DB

	var sender, recipient models.User
	if err := db.Select("id, date_of_birth").First(&sender, senderID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}
	if err := db.Select("id, date_of_birth").First(&recipient, recipientID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recipient not found"})
		return
	}

	allRatings := []string{"G", "PG", "Educational", "Religious", "13+", "16+", "18+", "Mature"}
	alwaysAllowed := map[string]bool{"Educational": true, "Religious": true}

	var allowed []string
	for _, rating := range allRatings {
		if alwaysAllowed[rating] || (sender.CanViewContent(rating) && recipient.CanViewContent(rating)) {
			allowed = append(allowed, rating)
		}
	}
	if len(allowed) == 0 {
		allowed = []string{"G", "PG", "Educational", "Religious"}
	}

	c.JSON(http.StatusOK, gin.H{"allowed_ratings": allowed})
}

// StartPrivateWatchoutHandler creates a private temporary watch room and sends a DM invite.
// POST /api/lobby-chats/private-watchout
func StartPrivateWatchoutHandler(c *gin.Context) {
	userIDValue, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	senderID, ok := userIDValue.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var req struct {
		RecipientID   uint    `json:"recipient_id" binding:"required"`
		WatchType     string  `json:"watch_type"`
		ContentRating string  `json:"content_rating"`
		Price         float64 `json:"price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.RecipientID == senderID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot send to yourself"})
		return
	}

	// Defaults and validation
	validWatchTypes := map[string]bool{"video": true, "3d_cinema": true, "classroom": true, "podcast": true, "livestream": true}
	if req.WatchType == "" || !validWatchTypes[req.WatchType] {
		req.WatchType = "video"
	}
	validRatings := map[string]bool{"G": true, "PG": true, "Educational": true, "Religious": true, "13+": true, "16+": true, "18+": true, "Mature": true}
	if req.ContentRating == "" || !validRatings[req.ContentRating] {
		req.ContentRating = "G"
	}
	if req.Price < 0 {
		req.Price = 0
	}

	db := c.MustGet("db").(*gorm.DB)

	// Friendship check
	var friendship models.Friendship
	if err := db.Where(
		"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
		senderID, req.RecipientID, req.RecipientID, senderID, models.FriendshipStatusAccepted,
	).First(&friendship).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusForbidden, gin.H{"error": "Must be friends to send WatchOut invites"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// Block check
	var blockCount int64
	db.Model(&models.UserBlock{}).Where(
		"(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)",
		senderID, req.RecipientID, req.RecipientID, senderID,
	).Count(&blockCount)
	if blockCount > 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "Cannot send message - user blocked"})
		return
	}

	// Block if sender is already in any active watch session
	var activeMemberCount int64
	db.Model(&models.WatchSessionMember{}).
		Where("user_id = ? AND is_active = true", senderID).
		Count(&activeMemberCount)
	if activeMemberCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "You are already in an active watch session"})
		return
	}

	// Block if sender already has a running private WatchOut (temporary room with live session)
	var existingPrivateCount int64
	db.Model(&models.WatchSession{}).
		Joins("JOIN rooms ON rooms.id = watch_sessions.room_id AND rooms.deleted_at IS NULL").
		Where("watch_sessions.host_id = ? AND watch_sessions.ended_at IS NULL AND rooms.is_temporary = true AND watch_sessions.deleted_at IS NULL", senderID).
		Count(&existingPrivateCount)
	if existingPrivateCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "You already have an active private WatchOut"})
		return
	}

	tx := db.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	var sender models.User
	db.Select("id, username, avatar_url").First(&sender, senderID)

	newRoom := models.Room{
		Name:          fmt.Sprintf("WatchOut – %s", sender.Username),
		Description:   "Private WatchOut – auto-deleted after session",
		HostID:        senderID,
		IsTemporary:   true,
		IsPublic:      false,
		ContentRating: req.ContentRating,
	}
	if err := tx.Create(&newRoom).Error; err != nil {
		tx.Rollback()
		log.Printf("StartPrivateWatchoutHandler: failed to create room: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	if err := tx.Create(&models.UserRoom{UserID: senderID, RoomID: newRoom.ID, UserRole: "host", Status: "active"}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}
	if err := tx.Create(&models.UserRoom{UserID: req.RecipientID, RoomID: newRoom.ID, UserRole: "member", Status: "active"}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	sessionUUID := uuid.New().String()
	watchSession := models.WatchSession{
		SessionID:     sessionUUID,
		RoomID:        newRoom.ID,
		HostID:        senderID,
		WatchType:     req.WatchType,
		IsPrivate:     true,
		ContentRating: req.ContentRating,
		StartedAt:     time.Now(),
	}
	if err := tx.Create(&watchSession).Error; err != nil {
		tx.Rollback()
		log.Printf("StartPrivateWatchoutHandler: failed to create session: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to finalize session"})
		return
	}

	metadata := map[string]interface{}{
		"room_id":             newRoom.ID,
		"room_name":           newRoom.Name,
		"room_type":           "general",
		"watch_type":          req.WatchType,
		"content_rating":      req.ContentRating,
		"price":               req.Price,
		"session_title":       "",
		"watching_count":      1,
		"session_id":          sessionUUID,
		"host_id":             senderID,
		"is_private_watchout": true,
	}
	metaJSON, _ := json.Marshal(metadata)
	metaStr := string(metaJSON)

	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: req.RecipientID,
		Message:     "👀 WatchOut! Let's watch together privately.",
		MessageType: "watch_out",
		Metadata:    &metaStr,
	}
	if err := db.Create(&chat).Error; err != nil {
		log.Printf("StartPrivateWatchoutHandler: failed to create message: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send WatchOut"})
		return
	}

	BroadcastLobbyChatMessage(db, chat, sender)

	log.Printf("StartPrivateWatchoutHandler: private WatchOut from user %d to user %d, room %d", senderID, req.RecipientID, newRoom.ID)
	c.JSON(http.StatusOK, gin.H{
		"message":    "Private WatchOut created",
		"room_id":    newRoom.ID,
		"session_id": sessionUUID,
	})
}
