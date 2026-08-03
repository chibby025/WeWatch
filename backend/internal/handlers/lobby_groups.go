// WeWatch/backend/internal/handlers/lobby_groups.go
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// ────────────────────────────────────────────
// Group call in-memory state
// ────────────────────────────────────────────

type GroupCallState struct {
	GroupID     uint
	GroupName   string
	RoomName    string
	StartedAt   time.Time
	InitiatorID uint
}

var (
	groupCallsMutex sync.RWMutex
	activeGroupCalls = make(map[uint]*GroupCallState) // groupID -> state
)

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

// getGroupMemberIDs returns all user IDs in a group.
func getGroupMemberIDs(db *gorm.DB, groupID uint) ([]uint, error) {
	var ids []uint
	err := db.Model(&models.LobbyGroupMember{}).
		Where("group_id = ?", groupID).
		Pluck("user_id", &ids).Error
	return ids, err
}

// isMemberOfGroup checks membership.
func isMemberOfGroup(db *gorm.DB, groupID, userID uint) bool {
	var count int64
	db.Model(&models.LobbyGroupMember{}).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Count(&count)
	return count > 0
}

// broadcastToGroup fans a WS message out to all group members.
func broadcastToGroup(db *gorm.DB, groupID uint, wsMsg map[string]interface{}) {
	memberIDs, err := getGroupMemberIDs(db, groupID)
	if err != nil || len(memberIDs) == 0 {
		return
	}
	msgBytes, err := json.Marshal(wsMsg)
	if err != nil {
		return
	}
	manager := GetWebSocketManager()
	if manager == nil {
		return
	}
	manager.BroadcastToUsers(memberIDs, OutgoingMessage{Data: msgBytes, IsBinary: false})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups   — create group
// ────────────────────────────────────────────

type CreateGroupRequest struct {
	Name      string `json:"name" binding:"required,min=1,max=100"`
	MemberIDs []uint `json:"member_ids" binding:"required,min=1"`
}

func CreateLobbyGroupHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	creatorID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	var req CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Group name cannot be empty"})
		return
	}

	// Cap at 50 members
	if len(req.MemberIDs) > 49 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Group can have at most 50 members"})
		return
	}

	group := models.LobbyGroup{Name: name, CreatedByID: creatorID}
	if err := db.Create(&group).Error; err != nil {
		log.Printf("❌ [LobbyGroups] Create failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create group"})
		return
	}

	// Add creator + requested members (deduplicated)
	seen := map[uint]bool{creatorID: true}
	members := []models.LobbyGroupMember{{GroupID: group.ID, UserID: creatorID}}
	for _, uid := range req.MemberIDs {
		if seen[uid] {
			continue
		}
		seen[uid] = true
		members = append(members, models.LobbyGroupMember{GroupID: group.ID, UserID: uid})
	}
	if err := db.Create(&members).Error; err != nil {
		log.Printf("❌ [LobbyGroups] Add members failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add members"})
		return
	}

	// Notify new members via WS
	var creator models.User
	db.First(&creator, creatorID)
	wsMsg := map[string]interface{}{
		"type": "group_created",
		"data": map[string]interface{}{
			"group_id":   group.ID,
			"group_name": group.Name,
			"created_by": creator.Username,
		},
	}
	msgBytes, _ := json.Marshal(wsMsg)
	manager := GetWebSocketManager()
	if manager != nil {
		var recipientIDs []uint
		for uid := range seen {
			if uid != creatorID {
				recipientIDs = append(recipientIDs, uid)
			}
		}
		if len(recipientIDs) > 0 {
			manager.BroadcastToUsers(recipientIDs, OutgoingMessage{Data: msgBytes, IsBinary: false})
		}
	}

	c.JSON(http.StatusCreated, gin.H{"group": group})
}

// ────────────────────────────────────────────
// GET /api/lobby-groups   — list groups for user
// ────────────────────────────────────────────

func GetLobbyGroupsHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	// Groups where the user is a member
	var memberships []models.LobbyGroupMember
	db.Where("user_id = ?", userID).Find(&memberships)

	if len(memberships) == 0 {
		c.JSON(http.StatusOK, gin.H{"groups": []interface{}{}})
		return
	}

	var groupIDs []uint
	for _, m := range memberships {
		groupIDs = append(groupIDs, m.GroupID)
	}

	var groups []models.LobbyGroup
	db.Where("id IN ?", groupIDs).Preload("Members.User").Find(&groups)

	// Attach last message preview and unread count per group
	type GroupWithMeta struct {
		models.LobbyGroup
		LastMessage    *string   `json:"last_message,omitempty"`
		LastMessageAt  *time.Time `json:"last_message_at,omitempty"`
		UnreadCount    int64      `json:"unread_count"`
	}

	result := make([]GroupWithMeta, 0, len(groups))
	for _, g := range groups {
		meta := GroupWithMeta{LobbyGroup: g}

		// Last message
		var lastChat models.LobbyChat
		if err := db.Where("group_id = ? AND deleted_at IS NULL", g.ID).
			Order("created_at DESC").First(&lastChat).Error; err == nil {
			meta.LastMessage = &lastChat.Message
			meta.LastMessageAt = &lastChat.CreatedAt
		}

		// Unread count: messages after my LastReadAt
		var myMembership models.LobbyGroupMember
		db.Where("group_id = ? AND user_id = ?", g.ID, userID).First(&myMembership)
		var unread int64
		q := db.Model(&models.LobbyChat{}).Where("group_id = ? AND sender_id != ? AND deleted_at IS NULL", g.ID, userID)
		if myMembership.LastReadAt != nil {
			q = q.Where("created_at > ?", *myMembership.LastReadAt)
		}
		q.Count(&unread)
		meta.UnreadCount = unread

		result = append(result, meta)
	}

	c.JSON(http.StatusOK, gin.H{"groups": result})
}

// ────────────────────────────────────────────
// GET /api/lobby-groups/:id/messages
// ────────────────────────────────────────────

func GetLobbyGroupMessagesHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var messages []models.LobbyChat
	db.Where("group_id = ? AND deleted_at IS NULL", groupID).
		Preload("Sender").
		Order("created_at ASC").
		Find(&messages)

	// Update last_read_at
	now := time.Now()
	db.Model(&models.LobbyGroupMember{}).
		Where("group_id = ? AND user_id = ?", groupID, userID).
		Update("last_read_at", now)

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/messages   — send text
// ────────────────────────────────────────────

type SendGroupMessageRequest struct {
	Message string `json:"message" binding:"required,max=1000"`
}

func SendLobbyGroupMessageHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	senderID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, senderID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var req SendGroupMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Message cannot be empty"})
		return
	}

	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: 0, // group messages use group_id
		Message:     msg,
		GroupID:     &groupID,
	}
	if err := db.Create(&chat).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send message"})
		return
	}

	var sender models.User
	db.First(&sender, senderID)

	BroadcastLobbyGroupMessage(db, chat, sender)

	c.JSON(http.StatusOK, gin.H{
		"id":              chat.ID,
		"group_id":        groupID,
		"sender_id":       senderID,
		"sender_username": sender.Username,
		"message":         chat.Message,
		"created_at":      chat.CreatedAt,
	})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/image|video|document|voice-note
// ────────────────────────────────────────────

func UploadLobbyGroupImageHandler(c *gin.Context) {
	uploadGroupAttachment(c, "image", "lobby-images", MaxImageSize, AllowedImageTypes)
}

func UploadLobbyGroupVideoHandler(c *gin.Context) {
	uploadGroupAttachment(c, "video", "lobby-videos", MaxVideoSize, AllowedVideoTypes)
}

func UploadLobbyGroupDocumentHandler(c *gin.Context) {
	uploadGroupAttachment(c, "document", "lobby-documents", MaxDocumentSize, AllowedDocumentTypes)
}

func UploadLobbyGroupVoiceNoteHandler(c *gin.Context) {
	// Reuse document limits for voice notes
	uploadGroupAttachment(c, "voice_note", "lobby-voice-notes", MaxDocumentSize, map[string]bool{
		"audio/webm":  true,
		"audio/ogg":   true,
		"audio/mpeg":  true,
		"audio/mp4":   true,
		"audio/wav":   true,
	})
}

func uploadGroupAttachment(c *gin.Context, attachmentType, uploadFolder string, maxSize int64, allowedTypes map[string]bool) {
	userIDVal, _ := c.Get("user_id")
	senderID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, senderID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}

	if fileHeader.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("File too large (max %dMB)", maxSize/(1024*1024))})
		return
	}

	contentType := fileHeader.Header.Get("Content-Type")
	if !allowedTypes[contentType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File type not allowed"})
		return
	}

	ext := filepath.Ext(fileHeader.Filename)
	newFilename := fmt.Sprintf("%d_%d%s", senderID, time.Now().UnixNano(), ext)
	uploadDir := filepath.Join("uploads", uploadFolder, fmt.Sprintf("%d", senderID))
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	filePath := filepath.Join(uploadDir, newFilename)
	if err := c.SaveUploadedFile(fileHeader, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Push to BunnyCDN in production — a bare relative URL here resolves against
	// the frontend's own origin in the browser (Vercel), not the backend's,
	// silently breaking display there even though it works locally via Vite's
	// dev proxy. Same fix already applied to lobby DM voice notes
	// (lobby_chat_voice_notes.go) for the identical reason.
	remotePath := fmt.Sprintf("%s/%d/%s", uploadFolder, senderID, newFilename)
	attachURL, err := utils.UploadLocalFileToBunnyCDN(filePath, remotePath, contentType)
	if err != nil {
		log.Printf("❌ [LobbyGroups] Failed to upload %s to BunnyCDN: %v", attachmentType, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store file"})
		os.Remove(filePath)
		return
	}
	if strings.HasPrefix(attachURL, "http") {
		os.Remove(filePath)
	}
	name := fileHeader.Filename
	size := fileHeader.Size

	var messageText string
	switch attachmentType {
	case "image":
		messageText = "📷 Photo"
	case "video":
		messageText = "🎥 Video"
	case "voice_note":
		messageText = "🎤 Voice note"
	default:
		messageText = fmt.Sprintf("📄 %s", name)
	}

	chat := models.LobbyChat{
		SenderID:       senderID,
		RecipientID:    0,
		Message:        messageText,
		MessageType:    attachmentType,
		AttachmentURL:  &attachURL,
		AttachmentName: &name,
		AttachmentSize: &size,
		GroupID:        &groupID,
	}
	if err := db.Create(&chat).Error; err != nil {
		os.Remove(filePath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save message"})
		return
	}

	var sender models.User
	db.First(&sender, senderID)
	BroadcastLobbyGroupMessage(db, chat, sender)

	log.Printf("✅ [LobbyGroups] %s uploaded by user %d to group %d", attachmentType, senderID, groupID)

	c.JSON(http.StatusOK, gin.H{
		"id":              chat.ID,
		"group_id":        groupID,
		"attachment_url":  attachURL,
		"attachment_name": name,
		"attachment_size": size,
		"message_type":    attachmentType,
		"message":         messageText,
		"sender_id":       senderID,
		"sender_username": sender.Username,
		"created_at":      chat.CreatedAt,
	})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/icon   — upload/replace group icon
// ────────────────────────────────────────────

func UploadLobbyGroupIconHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var group models.LobbyGroup
	if err := db.First(&group, groupID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
		return
	}

	if fileHeader.Size > MaxImageSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("File too large (max %dMB)", MaxImageSize/(1024*1024))})
		return
	}

	contentType := fileHeader.Header.Get("Content-Type")
	if !AllowedImageTypes[contentType] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File type not allowed"})
		return
	}

	// Deterministic, single filename per group — always overwritten in place,
	// unlike per-message chat attachments (uploadGroupAttachment above) which
	// deliberately accumulate one file per upload. If the extension changes
	// between uploads, the old file (a different name) is removed explicitly
	// so it doesn't linger as an orphan.
	ext := filepath.Ext(fileHeader.Filename)
	uploadDir := filepath.Join("uploads", "lobby-group-icons")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}
	newFilename := fmt.Sprintf("%d%s", groupID, ext)
	filePath := filepath.Join(uploadDir, newFilename)

	if group.Icon != "" && strings.HasPrefix(group.Icon, "/uploads/") {
		oldPath := strings.TrimPrefix(group.Icon, "/")
		if oldPath != filePath {
			os.Remove(oldPath)
		}
	}

	if err := c.SaveUploadedFile(fileHeader, filePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save file"})
		return
	}

	// Push to BunnyCDN in production — same reasoning as uploadGroupAttachment
	// above and lobby_chat_voice_notes.go: a bare relative URL resolves against
	// the frontend's own origin on Vercel, not the backend's, so the icon would
	// silently never display there even though it works locally.
	remotePath := fmt.Sprintf("lobby-group-icons/%s", newFilename)
	iconURL, err := utils.UploadLocalFileToBunnyCDN(filePath, remotePath, contentType)
	if err != nil {
		log.Printf("❌ [LobbyGroups] Failed to upload icon to BunnyCDN: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store icon"})
		os.Remove(filePath)
		return
	}
	if strings.HasPrefix(iconURL, "http") {
		os.Remove(filePath)
	}

	if err := db.Model(&models.LobbyGroup{}).Where("id = ?", groupID).Update("icon", iconURL).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update group icon"})
		return
	}

	broadcastToGroup(db, groupID, map[string]interface{}{
		"type": "group_icon_updated",
		"data": map[string]interface{}{
			"group_id": groupID,
			"icon":     iconURL,
		},
	})

	log.Printf("✅ [LobbyGroups] Icon updated for group %d by user %d", groupID, userID)
	c.JSON(http.StatusOK, gin.H{"icon": iconURL})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/watch-out   — share live room to group
// ────────────────────────────────────────────

type SendGroupWatchOutRequest struct {
	RoomID uint `json:"room_id" binding:"required"`
}

func SendLobbyGroupWatchOutHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	senderID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, senderID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var req SendGroupWatchOutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify room and active session exist
	var room models.Room
	if err := db.First(&room, req.RoomID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
		return
	}

	// Verify sender is a member of the room
	var userRoom models.UserRoom
	if err := db.Where("room_id = ? AND user_id = ?", req.RoomID, senderID).First(&userRoom).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You must be a room member to share it"})
		return
	}

	// Build metadata snapshot (same as DM watch-out)
	metadata := map[string]interface{}{
		"room_id":   room.ID,
		"room_name": room.Name,
	}
	metaBytes, _ := json.Marshal(metadata)
	metaStr := string(metaBytes)

	chat := models.LobbyChat{
		SenderID:    senderID,
		RecipientID: 0,
		Message:     fmt.Sprintf("Invited you to watch in %s", room.Name),
		MessageType: "watch_out",
		Metadata:    &metaStr,
		GroupID:     &groupID,
	}
	if err := db.Create(&chat).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send watch-out"})
		return
	}

	var sender models.User
	db.First(&sender, senderID)
	BroadcastLobbyGroupMessage(db, chat, sender)

	c.JSON(http.StatusOK, gin.H{"message": "Watch-out sent to group"})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/call   — start or join group call
// ────────────────────────────────────────────

func StartLobbyGroupCallHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, err := strconv.ParseUint(groupIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid group ID"})
		return
	}
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var group models.LobbyGroup
	if err := db.First(&group, groupID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}

	groupCallsMutex.Lock()
	callState, exists := activeGroupCalls[groupID]
	if !exists {
		// Start new call
		roomName := fmt.Sprintf("group_call_%d_%d", groupID, time.Now().Unix())
		callState = &GroupCallState{
			GroupID:     groupID,
			GroupName:   group.Name,
			RoomName:    roomName,
			StartedAt:   time.Now(),
			InitiatorID: userID,
		}
		activeGroupCalls[groupID] = callState
		groupCallsMutex.Unlock()

		// Fan-out group_call_incoming to all other members
		var initiator models.User
		db.First(&initiator, userID)

		wsMsg := map[string]interface{}{
			"type": "group_call_incoming",
			"data": map[string]interface{}{
				"group_id":           groupID,
				"group_name":         group.Name,
				"room_name":          roomName,
				"initiator_id":       userID,
				"initiator_username": initiator.Username,
			},
		}
		memberIDs, _ := getGroupMemberIDs(db, groupID)
		msgBytes, _ := json.Marshal(wsMsg)
		manager := GetWebSocketManager()
		if manager != nil {
			var others []uint
			for _, mid := range memberIDs {
				if mid != userID {
					others = append(others, mid)
				}
			}
			if len(others) > 0 {
				manager.BroadcastToUsers(others, OutgoingMessage{Data: msgBytes, IsBinary: false})
			}
		}
	} else {
		groupCallsMutex.Unlock()
	}

	// Generate token for this user
	token, err := utils.GenerateLiveKitToken(callState.RoomName, fmt.Sprintf("user_%d", userID), false)
	if err != nil {
		log.Printf("❌ [GroupCall] Token generation failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate call token"})
		return
	}

	livekitURL := getLiveKitURL()
	c.JSON(http.StatusOK, gin.H{
		"token":       token,
		"room_name":   callState.RoomName,
		"livekit_url": livekitURL,
		"group_id":    groupID,
		"group_name":  group.Name,
	})
}

// POST /api/lobby-groups/:id/call/end — end/leave group call (host only or last person)
func EndLobbyGroupCallHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	groupCallsMutex.Lock()
	callState, exists := activeGroupCalls[groupID]
	if !exists {
		groupCallsMutex.Unlock()
		c.JSON(http.StatusOK, gin.H{"message": "No active call"})
		return
	}
	// Only initiator can end the call for everyone; others just leave
	isInitiator := callState.InitiatorID == userID
	if isInitiator {
		delete(activeGroupCalls, groupID)
	}
	groupCallsMutex.Unlock()

	if isInitiator {
		broadcastToGroup(db, groupID, map[string]interface{}{
			"type": "group_call_ended",
			"data": map[string]interface{}{"group_id": groupID},
		})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Left call"})
}

// ────────────────────────────────────────────
// POST /api/lobby-groups/:id/members   — add members
// ────────────────────────────────────────────

type AddGroupMembersRequest struct {
	UserIDs []uint `json:"user_ids" binding:"required"`
}

func AddLobbyGroupMembersHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	requesterID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, requesterID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var req AddGroupMembersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for _, uid := range req.UserIDs {
		if isMemberOfGroup(db, groupID, uid) {
			continue
		}
		db.Create(&models.LobbyGroupMember{GroupID: groupID, UserID: uid})
	}

	var group models.LobbyGroup
	db.First(&group, groupID)

	var adder models.User
	db.First(&adder, requesterID)

	// Notify new members
	newMsgBytes, _ := json.Marshal(map[string]interface{}{
		"type": "group_member_added",
		"data": map[string]interface{}{
			"group_id":   groupID,
			"group_name": group.Name,
			"added_by":   adder.Username,
		},
	})
	manager := GetWebSocketManager()
	if manager != nil {
		manager.BroadcastToUsers(req.UserIDs, OutgoingMessage{Data: newMsgBytes, IsBinary: false})
	}

	c.JSON(http.StatusOK, gin.H{"message": "Members added"})
}

// ────────────────────────────────────────────
// DELETE /api/lobby-groups/:id/leave   — leave group
// ────────────────────────────────────────────

func LeaveLobbyGroupHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	db.Where("group_id = ? AND user_id = ?", groupID, userID).Delete(&models.LobbyGroupMember{})

	// If no members left, soft-delete the group
	var count int64
	db.Model(&models.LobbyGroupMember{}).Where("group_id = ?", groupID).Count(&count)
	if count == 0 {
		db.Delete(&models.LobbyGroup{}, groupID)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Left group"})
}

// ────────────────────────────────────────────
// DELETE /api/lobby-groups/:id   — creator deletes group for everyone
// ────────────────────────────────────────────

func DeleteLobbyGroupHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	var group models.LobbyGroup
	if err := db.First(&group, groupID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Group not found"})
		return
	}
	if group.CreatedByID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Only the group creator can delete the group"})
		return
	}

	memberIDs, _ := getGroupMemberIDs(db, groupID)

	// Soft-delete all messages in the group
	db.Where("group_id = ?", groupID).Delete(&models.LobbyChat{})
	// Remove all memberships
	db.Where("group_id = ?", groupID).Delete(&models.LobbyGroupMember{})
	// Soft-delete the group itself
	db.Delete(&models.LobbyGroup{}, groupID)

	// Notify all former members
	wsMsg := map[string]interface{}{
		"type": "group_deleted",
		"data": map[string]interface{}{
			"group_id":   groupID,
			"group_name": group.Name,
		},
	}
	manager := GetWebSocketManager()
	if manager != nil {
		jsonBytes, _ := json.Marshal(wsMsg)
		manager.BroadcastToUsers(memberIDs, OutgoingMessage{Data: jsonBytes, IsBinary: false})
	}

	log.Printf("DeleteLobbyGroupHandler: Group %d (%s) deleted by creator %d", groupID, group.Name, userID)
	c.JSON(http.StatusOK, gin.H{"message": "Group deleted"})
}

// ────────────────────────────────────────────
// PATCH /api/lobby-groups/:id   — rename group
// ────────────────────────────────────────────

type RenameGroupRequest struct {
	Name string `json:"name" binding:"required,min=1,max=100"`
}

func RenameLobbyGroupHandler(c *gin.Context) {
	userIDVal, _ := c.Get("user_id")
	userID := userIDVal.(uint)
	db := c.MustGet("db").(*gorm.DB)

	groupIDStr := c.Param("id")
	groupID64, _ := strconv.ParseUint(groupIDStr, 10, 32)
	groupID := uint(groupID64)

	if !isMemberOfGroup(db, groupID, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not a member of this group"})
		return
	}

	var req RenameGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	db.Model(&models.LobbyGroup{}).Where("id = ?", groupID).Update("name", strings.TrimSpace(req.Name))

	broadcastToGroup(db, groupID, map[string]interface{}{
		"type": "group_renamed",
		"data": map[string]interface{}{
			"group_id":   groupID,
			"group_name": strings.TrimSpace(req.Name),
		},
	})

	c.JSON(http.StatusOK, gin.H{"message": "Group renamed"})
}

// ────────────────────────────────────────────
// BroadcastLobbyGroupMessage — fan-out to all members
// ────────────────────────────────────────────

func BroadcastLobbyGroupMessage(db *gorm.DB, chat models.LobbyChat, sender models.User) {
	if chat.GroupID == nil {
		return
	}
	groupID := *chat.GroupID

	memberIDs, err := getGroupMemberIDs(db, groupID)
	if err != nil || len(memberIDs) == 0 {
		return
	}

	payload := map[string]interface{}{
		"id":              chat.ID,
		"group_id":        groupID,
		"sender_id":       chat.SenderID,
		"sender_username": sender.Username,
		"sender_avatar":   sender.AvatarURL,
		"message":         chat.Message,
		"message_type":    chat.MessageType,
		"attachment_url":  chat.AttachmentURL,
		"attachment_name": chat.AttachmentName,
		"attachment_size": chat.AttachmentSize,
		"metadata":        chat.Metadata,
		"created_at":      chat.CreatedAt,
	}

	wsMessage := map[string]interface{}{
		"type": "lobby_chat",
		"data": payload,
	}

	msgBytes, err := json.Marshal(wsMessage)
	if err != nil {
		return
	}

	manager := GetWebSocketManager()
	if manager == nil {
		return
	}
	manager.BroadcastToUsers(memberIDs, OutgoingMessage{Data: msgBytes, IsBinary: false})
}
