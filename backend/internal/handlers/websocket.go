// WeWatch/backend/internal/handlers/websocket.go

package handlers

import (
	"encoding/json"
	"errors"
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
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/services"
	"wewatch-backend/internal/utils"
    "wewatch-backend/internal/handlers/games"
    "wewatch-backend/internal/handlers/liveshare"
)

// - Define Message Types -
type WebSocketMessage struct {
	Type        string      `json:"type"`
	Command     string      `json:"command,omitempty"` // For playback control, screen share commands
	MediaItemID uint        `json:"media_item_id,omitempty"`
	UserID      uint        `json:"user_id,omitempty"`
	RoomID      uint        `json:"room_id,omitempty"`
	Data        interface{} `json:"data,omitempty"`
	// Seat swap fields (sent at root level)
	RequesterID   uint        `json:"requester_id,omitempty"`
	TargetUserID  uint        `json:"target_user_id,omitempty"`
	TargetID      uint        `json:"target_id,omitempty"`
	TargetSeat    interface{} `json:"target_seat,omitempty"`
	RequesterSeat interface{} `json:"requester_seat,omitempty"`
	// Keep Sdp and Candidate fields for potential future use or other signaling
	Sdp       interface{} `json:"sdp,omitempty"`
	Candidate interface{} `json:"candidate,omitempty"`
	SignalData interface{} `json:"signalData,omitempty"`
}

type ScreenShareSignal struct {
	Type      string      `json:"type"` // "screen_share_started", "screen_share_stopped", etc.
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

// OutgoingMessage represents a message to send to a client and whether it's binary
type OutgoingMessage struct {
	Data     []byte
	IsBinary bool
}

// - WebSocket Client -
type Client struct {
	hub              *Hub
	conn             *websocket.Conn
	send             chan OutgoingMessage // Channel to send messages to the client (with binary flag)
	roomID           uint                 // The room this client is subscribed to
	userID           uint                 // The authenticated user ID
	streamID         string               // Unique stream identifier (optional, for future use)
	sessionID        string               // The watch session this client is participating in (for cleanup)
	
}

// GetUserID returns the client's user ID (implements liveshare.Client interface)
func (c *Client) GetUserID() uint {
	return c.userID
}

// GetRoomID returns the client's room ID (implements liveshare.Client interface)
func (c *Client) GetRoomID() uint {
	return c.roomID
}

// GetSessionID returns the client's session ID (implements liveshare.Client interface)
func (c *Client) GetSessionID() string {
	return c.sessionID
}

// - WebSocket Hub -
var hub *Hub
var mediaSwitchHandler *services.MediaSwitchHandler // ✅ Global handler for media type switching
var gameWebSocketHandler *games.GameWebSocketHandler
var liveShareHandler *liveshare.LiveShareHandler // ✅ Global handler for LiveShare features

// GetWebSocketManager returns the global Hub instance for broadcasting
func GetWebSocketManager() *Hub {
	return hub
}

// Hub maintains the set of active clients and broadcasts messages to the rooms.
type Hub struct {
	// Registered clients for each room.
	rooms map[uint]map[*Client]bool
	// Inbound messages from the clients.
	broadcast        chan OutgoingMessage
	broadcastToRoom  chan RoomBroadcastMessage
	broadcastToUsers chan UserBroadcastMessage
	// Register requests from the clients.
	register chan *Client
	// Unregister requests from clients.
	unregister chan *Client
	// Mutex for concurrent access to rooms map.
	mutex sync.RWMutex
    // Add to Hub struct
    clientRegistry map[uint]map[uint]*Client // userID -> roomID -> *Client
    registryMutex  sync.RWMutex

	// Track active watch sessions by host
	activeSessions map[string]*models.WatchSession
	sessionMembers map[string]map[*Client]bool  // sessionID → clients
	sessionMutex   sync.RWMutex

	// Track disconnections for delayed cleanup
	orphanedSessions map[string]time.Time // session_id → disconnect time
	
	// ⚠️ DISABLED: Auto-end session feature (was used to end sessions after 1 hour of host disconnect)
	// hostDisconnectTimes map[string]time.Time // session_id → host disconnect time
	// hostDisconnectMutex sync.RWMutex

	// Track which user is streaming in each room (server broadcast)
	roomStreamHost  map[uint]uint  // roomID -> userID of the stream host
	roomStreamActive map[uint]bool // roomID -> true if a stream is active
	// Mutex for stream state maps
	streamStateMutex sync.RWMutex
    // Seating assignments - supports lecture hall overflow
    // Structure: roomID → hallNumber → seatID → userID
    // For cinema (no halls): hallNumber is always 1
    // For lecture hall: hallNumber is 1, 2, 3... (each hall has 145 seats)
    seatingAssignments map[uint]map[int]map[string]uint // roomID → hallNumber → "seatID" → userID
    seatingMutex       sync.RWMutex

    // Track mute-all state per session (for persistent mute across joins/refreshes)
    sessionMuteAllState map[string]bool // sessionID → isMuteAllActive
    muteAllMutex        sync.RWMutex

}

type RoomBroadcastMessage struct {
	roomID uint
	data   OutgoingMessage
	sender *Client // The client that sent the original message (to exclude from broadcast)
}

type UserBroadcastMessage struct {
	userIDs []uint
	data    OutgoingMessage
}

type RoomStreamStats struct {
	hostID uint
	startTime time.Time
	chunkCount int64
	lastChunkTime time.Time
	receiverStats map[uint]*ReceiverStats
}

type ReceiverStats struct {
	chunksReceived int64
	lastReceived time.Time
	errors int
}

// Add constants for WebSocket settings
const (
    maxMessageSize = 10 * 1024 * 1024 // 10MB max message size
    writeWait = 10 * time.Second
    pongWait = 60 * time.Second
    pingPeriod = (pongWait * 9) / 10
    closeGracePeriod = 10 * time.Second
)

// Add binary message tracking
type BinaryStreamMetrics struct {
    LastChunkTime    time.Time
    ChunksProcessed  int64
    BytesProcessed   int64
    Errors          int
}

func (hub *Hub) handleDisconnect(client *Client) {
    // Screen share cleanup will be handled by LiveKit
    log.Printf("[handleDisconnect] Client disconnected: user %d, room %d", client.userID, client.roomID)
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	return &Hub{
		broadcast:           make(chan OutgoingMessage, 2048),
		broadcastToRoom:     make(chan RoomBroadcastMessage, 2048),
		broadcastToUsers:    make(chan UserBroadcastMessage, 2048),
		register:            make(chan *Client, 256),
		unregister:          make(chan *Client, 256),
		rooms:               make(map[uint]map[*Client]bool),
		activeSessions:      make(map[string]*models.WatchSession),
		sessionMembers:      make(map[string]map[*Client]bool),
		orphanedSessions:    make(map[string]time.Time),
		// hostDisconnectTimes: make(map[string]time.Time), // ⚠️ DISABLED: Auto-end feature
		roomStreamHost:      make(map[uint]uint),
		roomStreamActive:    make(map[uint]bool),
		clientRegistry:      make(map[uint]map[uint]*Client),
		seatingAssignments:  make(map[uint]map[int]map[string]uint), // ✅ Hall-aware seating
		seatingMutex:        sync.RWMutex{},
		sessionMuteAllState: make(map[string]bool),
		muteAllMutex:        sync.RWMutex{},
	}
}

// InitPreviewSystem initializes the preview generation and media switching system
func InitPreviewSystem(db *gorm.DB, h *Hub) {
	log.Println("🚀 [InitPreviewSystem] Initializing preview generation system...")
	
	// Create wrapper that converts between OutgoingMessage types
	hubWrapper := &hubWrapper{hub: h}
	
	// Initialize preview queue worker
	services.InitPreviewQueue(db, hubWrapper)
	
	// Create media switch handler
	mediaSwitchHandler = services.NewMediaSwitchHandler(db, services.GetPreviewQueue())
	
	// Initialize LiveShare handler with adapter wrapper
	liveShareHubWrapper := &liveShareHubWrapper{hub: h}
	liveShareHandler = liveshare.NewLiveShareHandler(db, liveShareHubWrapper)
	
	log.Println("✅ [InitPreviewSystem] Preview system initialized successfully")
}

// liveShareHubWrapper adapts Hub to liveshare.WebSocketHub interface
type liveShareHubWrapper struct {
	hub *Hub
}

func (lw *liveShareHubWrapper) BroadcastToRoom(roomID uint, message liveshare.OutgoingMessage, sender interface{}) {
	// Convert sender to *Client if provided
	var senderClient *Client
	if sender != nil {
		if c, ok := sender.(*Client); ok {
			senderClient = c
		}
	}
	lw.hub.BroadcastToRoom(roomID, OutgoingMessage{
		Data:     message.Data,
		IsBinary: message.IsBinary,
	}, senderClient)
}

func (lw *liveShareHubWrapper) BroadcastToUser(userID uint, roomID uint, message liveshare.OutgoingMessage) {
	lw.hub.BroadcastToUser(userID, roomID, OutgoingMessage{
		Data:     message.Data,
		IsBinary: message.IsBinary,
	})
}

func (lw *liveShareHubWrapper) BroadcastToLobby(message liveshare.OutgoingMessage) {
	lw.hub.BroadcastToLobby(OutgoingMessage{
		Data:     message.Data,
		IsBinary: message.IsBinary,
	})
}

// hubWrapper adapts Hub to services.WebSocketHub interface
type hubWrapper struct {
	hub *Hub
}

func (hw *hubWrapper) BroadcastToLobby(msg services.OutgoingMessage) {
	hw.hub.BroadcastToLobby(OutgoingMessage{
		Data:     msg.Data,
		IsBinary: msg.IsBinary,
	})
}

// ⚠️ DISABLED: CheckHostDisconnectTimers auto-end feature
// This function was used to auto-end sessions when host is gone > 1 hour
/*
func (h *Hub) CheckHostDisconnectTimers() {
	h.hostDisconnectMutex.Lock()
	defer h.hostDisconnectMutex.Unlock()
	
	now := time.Now()
	const gracePeriod = 60 * time.Minute // 1 hour
	
	// Log current state of all tracked disconnect timers
	if len(h.hostDisconnectTimes) > 0 {
		log.Printf("🔍 [Timer Check] Checking %d host disconnect timer(s):", len(h.hostDisconnectTimes))
		for sid, dt := range h.hostDisconnectTimes {
			elapsed := now.Sub(dt)
			remaining := gracePeriod - elapsed
			log.Printf("  📍 Session %s: Disconnected %.1f min ago, %.1f min remaining until auto-end", 
				sid, elapsed.Minutes(), remaining.Minutes())
		}
	}
	
	for sessionID, disconnectTime := range h.hostDisconnectTimes {
		elapsed := now.Sub(disconnectTime)
		
		if elapsed >= gracePeriod {
			log.Printf("⏰ Host disconnect grace period exceeded for session %s (%.1f minutes) - auto-ending session", 
				sessionID, elapsed.Minutes())
			
			// Remove from tracking map
			delete(h.hostDisconnectTimes, sessionID)
			
			// Auto-end the session (run in goroutine to avoid blocking)
			go func(sid string) {
				if err := AutoEndSession(sid); err != nil {
					log.Printf("❌ Failed to auto-end session %s: %v", sid, err)
				} else {
					log.Printf("✅ Successfully auto-ended session %s after host disconnect", sid)
				}
			}(sessionID)
		}
	}
}
*/

// Start broadcast worker goroutines for the Hub. Processes room/user broadcasts and fans out to clients.
func (h *Hub) startBroadcastWorkers() {
    // Room broadcast worker
    go func() {
        defer func() {
            if r := recover(); r != nil {
                log.Printf("⚠️ [Hub] Recovered from panic in broadcast worker: %v", r)
            }
        }()
        
        for msg := range h.broadcastToRoom {
            roomID := msg.roomID
            data := msg.data
            h.mutex.RLock()
            clients := h.rooms[roomID]
            h.mutex.RUnlock()

            if clients == nil || len(clients) == 0 {
                // nothing to do
                continue
            }

            // Fan-out non-blocking to each client
            for c := range clients {
                // ✅ Check if channel is closed before sending
                func() {
                    defer func() {
                        if r := recover(); r != nil {
                            log.Printf("⚠️ [Hub] Recovered from panic sending to user %d: %v", c.userID, r)
                        }
                    }()
                    
                    select {
                    case c.send <- data:
                        // enqueued ok
                    default:
                        // drop for slow client; log and notify host if possible
                        log.Printf("[Hub] drop outgoing to user %d in room %d (send buffer full)", c.userID, roomID)
                        // Try to notify the room host of backpressure (best-effort)
                        // Produce a lightweight control message
                        bdata, _ := json.Marshal(WebSocketMessage{Type: "screen_share_backpressure", Data: map[string]interface{}{"user_id": c.userID, "room_id": roomID}})
                        // Send backpressure notifications via hub.broadcastToRoom as text so host can react
                        // Note: this may re-enter this loop, but that's acceptable for low-frequency notifications
                        select {
                        case h.broadcastToRoom <- RoomBroadcastMessage{roomID: roomID, data: OutgoingMessage{Data: bdata, IsBinary: false}, sender: nil}:
                        default:
                            // drop notification if queue full
                        }
                    }
                }() // ✅ Close anonymous function
            }
        }
    }()

    // User-targeted broadcast worker (for BroadcastToUsers)
    go func() {
        for msg := range h.broadcastToUsers {
            for _, uid := range msg.userIDs {
                // We need to find client(s) for this uid in all rooms map
                h.mutex.RLock()
                for _, clients := range h.rooms {
                    for c := range clients {
                        if c.userID == uid {
                            select {
                            case c.send <- msg.data:
                            default:
                                log.Printf("[Hub] drop outgoing to user %d (send buffer full)", uid)
                            }
                        }
                    }
                }
                h.mutex.RUnlock()
            }
        }
    }()
}

func (h *Hub) GetUserIDsInRow(roomID uint, row int) []uint {
    h.seatingMutex.RLock()
    defer h.seatingMutex.RUnlock()

    hallsMap, exists := h.seatingAssignments[roomID]
    if !exists {
        return []uint{}
    }

    var users []uint
    // Iterate through all halls
    for _, hallSeats := range hallsMap {
        for seatID, userID := range hallSeats {
            if strings.HasPrefix(seatID, fmt.Sprintf("%d-", row)) {
                users = append(users, userID)
            }
        }
    }
    return users
}

// JoinWatchSession adds a client to an active watch session
func (h *Hub) JoinWatchSession(sessionID string, client *Client) error {
    log.Printf("🎯 [JoinWatchSession] CALLED for user %d, session %s", client.userID, sessionID)
    h.sessionMutex.Lock()
    defer h.sessionMutex.Unlock()

    session, exists := h.activeSessions[sessionID]
    if (!exists) {
        log.Printf("❌ [JoinWatchSession] Session %s NOT found in activeSessions map", sessionID)
        return fmt.Errorf("watch session %s does not exist", sessionID)
    }
    log.Printf("✅ [JoinWatchSession] Found session %s in activeSessions (DB ID: %d, Room: %d)", sessionID, session.ID, session.RoomID)

    // Initialize members map if needed
    if _, exists := h.sessionMembers[sessionID]; !exists {
        h.sessionMembers[sessionID] = make(map[*Client]bool)
    }

    // Add client to session members
    h.sessionMembers[sessionID][client] = true
    
    // ✅ Determine user role: host if user_id matches session host, otherwise viewer
    var watchSession models.WatchSession
    if err := DB.Where("session_id = ?", sessionID).First(&watchSession).Error; err != nil {
        delete(h.sessionMembers[sessionID], client)
        log.Printf("❌ Failed to fetch session %s for role assignment: %v", sessionID, err)
        return fmt.Errorf("failed to fetch session: %v", err)
    }
    
    var room models.Room
    if err := DB.First(&room, watchSession.RoomID).Error; err != nil {
        delete(h.sessionMembers[sessionID], client)
        log.Printf("❌ Failed to fetch room %d for role assignment: %v", watchSession.RoomID, err)
        return fmt.Errorf("failed to fetch room: %v", err)
    }
    
    userRole := "viewer"
    if client.userID == room.HostID {
        userRole = "host"
        log.Printf("✅ User %d identified as HOST for session %s", client.userID, sessionID)
    } else {
        log.Printf("✅ User %d identified as VIEWER for session %s", client.userID, sessionID)
    }

    // ✅ IMPROVED: UPDATE existing inactive member OR INSERT new one
    // This prevents duplicates even with race conditions (database constraint will catch any)
    log.Printf("📝 [JoinWatchSession] Creating/updating DB member record: session.ID=%d, userID=%d, userRole=%s", session.ID, client.userID, userRole)
    
    // First try to UPDATE an existing inactive member (reconnection)
    now := time.Now()
    result := DB.Model(&models.WatchSessionMember{}).
        Where("watch_session_id = ? AND user_id = ? AND is_active = false", session.ID, client.userID).
        Updates(map[string]interface{}{
            "is_active": true,
            "joined_at": now,
            "left_at":   nil,
            "user_role": userRole,
        })
    
    if result.Error != nil {
        delete(h.sessionMembers[sessionID], client)
        log.Printf("❌ Failed to reactivate member for user %d: %v", client.userID, result.Error)
        return fmt.Errorf("failed to reactivate session member: %v", result.Error)
    }
    
    // If no inactive member was updated, INSERT a new one
    if result.RowsAffected == 0 {
        member := models.WatchSessionMember{
            WatchSessionID: session.ID,
            UserID:        client.userID,
            JoinedAt:      now,
            IsActive:      true,
            UserRole:      userRole,
            LeftAt:        nil,
        }
        
        if err := DB.Create(&member).Error; err != nil {
            delete(h.sessionMembers[sessionID], client)
            // Check if error is duplicate key violation (someone else created it just now)
            if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
                log.Printf("⚠️ Duplicate member record detected for user %d in session %s (database constraint caught it)", client.userID, sessionID)
                // This is actually fine - another connection beat us to it
                return nil
            }
            log.Printf("❌ Failed to create session member for user %d: %v", client.userID, err)
            return fmt.Errorf("failed to create session member: %v", err)
        }
        log.Printf("✅ Created NEW session member record for user %d (session: %s)", client.userID, sessionID)
    } else {
        log.Printf("✅ REACTIVATED existing member record for user %d (session: %s)", client.userID, sessionID)
        
        // 🔄 RESTORE SEAT: Check if user had a seat before disconnect
        var reactivatedMember models.WatchSessionMember
        if err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = true", 
            session.ID, client.userID).First(&reactivatedMember).Error; err == nil {
            
            // Check if cinema mode - restore cinema seat from UserTheaterAssignment
            if watchSession.WatchType == "3d_cinema" {
                var assignment models.UserTheaterAssignment
                if err := DB.Where("user_id = ? AND watch_session_id = ?",
                    client.userID, session.ID).
                    Preload("Theater").First(&assignment).Error; err == nil {
                    
                    // Convert seat row/col back to seat key
                    row := int(assignment.SeatRow[0] - 'A')
                    col := assignment.SeatCol - 1
                    seatKey := fmt.Sprintf("%d-%d", row, col)
                    
                    // Restore to memory
                    h.seatingMutex.Lock()
                    if _, exists := h.seatingAssignments[client.roomID]; !exists {
                        h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
                    }
                    if _, exists := h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber]; !exists {
                        h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber] = make(map[string]uint)
                    }
                    h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber][seatKey] = client.userID
                    h.seatingMutex.Unlock()
                    
                    log.Printf("🔄 [RESTORE] User %d seat %s restored to memory (Theater %d)", 
                        client.userID, seatKey, assignment.Theater.TheaterNumber)
                    
                    // Broadcast seat_assigned immediately
                    seatMsg := WebSocketMessage{
                        Type: "seat_assigned",
                        Data: map[string]interface{}{
                            "user_id":        client.userID,
                            "seat_id":        seatKey,
                            "row":            row,
                            "col":            col,
                            "theater_number": assignment.Theater.TheaterNumber,
                        },
                    }
                    if msgBytes, err := json.Marshal(seatMsg); err == nil {
                        h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
                        log.Printf("📢 [RESTORE] Broadcasted seat_assigned for reconnected user %d", client.userID)
                    }
                }
            } else if watchSession.WatchType == "classroom" && reactivatedMember.SeatID != nil {
                // Restore lecture hall seat
                seatIDInt := *reactivatedMember.SeatID
                hallNum := 1
                if reactivatedMember.LectureHallNumber != nil {
                    hallNum = *reactivatedMember.LectureHallNumber
                }
                
                seatKey := fmt.Sprintf("%d", seatIDInt)
                
                h.seatingMutex.Lock()
                if _, exists := h.seatingAssignments[client.roomID]; !exists {
                    h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
                }
                if _, exists := h.seatingAssignments[client.roomID][hallNum]; !exists {
                    h.seatingAssignments[client.roomID][hallNum] = make(map[string]uint)
                }
                h.seatingAssignments[client.roomID][hallNum][seatKey] = client.userID
                h.seatingMutex.Unlock()
                
                log.Printf("🔄 [RESTORE] User %d seat %d restored to memory (Hall %d)", 
                    client.userID, seatIDInt, hallNum)
                
                // Broadcast seat_assigned
                seatMsg := WebSocketMessage{
                    Type: "seat_assigned",
                    Data: map[string]interface{}{
                        "seat_id": seatKey,
                        "user_id": client.userID,
                    },
                }
                if msgBytes, err := json.Marshal(seatMsg); err == nil {
                    h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
                    log.Printf("📢 [RESTORE] Broadcasted seat_assigned for reconnected user %d (lecture hall)", client.userID)
                }
            }
        }
    }
    
    // ✅ Store sessionID in client for cleanup on disconnect
    client.sessionID = sessionID
    
    // ✅ EVENT-DRIVEN: Broadcast session_member_joined to all clients in room
    // Query authoritative count BEFORE broadcasting so every receiver gets ground truth.
    var joinedMemberCount int64
    DB.Model(&models.WatchSessionMember{}).
        Where("watch_session_id = ? AND is_active = ?", session.ID, true).
        Count(&joinedMemberCount)

    var joiningUser models.User
    if err := DB.First(&joiningUser, client.userID).Error; err == nil {
        memberJoinedMsg := WebSocketMessage{
            Type: "session_member_joined",
            Data: map[string]interface{}{
                "user_id":      client.userID,
                "username":     joiningUser.Username,
                "avatar_url":   joiningUser.AvatarURL,
                "session_id":   sessionID,
                "user_role":    userRole,
                "member_count": joinedMemberCount,
            },
        }
        if memberJoinedBytes, err := json.Marshal(memberJoinedMsg); err == nil {
            h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: memberJoinedBytes, IsBinary: false}, nil)
            log.Printf("[JoinWatchSession] 📢 Broadcasted session_member_joined for user %d (%s) — count: %d", client.userID, joiningUser.Username, joinedMemberCount)
        }
    }

    // ✅ EVENT-DRIVEN: Broadcast updated session status with current member list
    // Query active members from database (source of truth)
    var activeMembers []models.WatchSessionMember
    if err := DB.Where("watch_session_id = ? AND is_active = ?", session.ID, true).Find(&activeMembers).Error; err == nil {
        
        // Get user IDs to query usernames
        userIDs := make([]uint, 0, len(activeMembers))
        for _, member := range activeMembers {
            userIDs = append(userIDs, member.UserID)
        }
        
        // Query users for usernames and avatar URLs
        var users []models.User
        userMap := make(map[uint]string)
        avatarMap := make(map[uint]string)
        log.Printf("🔍 [JoinWatchSession] Querying %d users for usernames and avatars", len(userIDs))
        if err := DB.Where("id IN ?", userIDs).Find(&users).Error; err == nil {
            log.Printf("✅ [JoinWatchSession] Found %d users in database", len(users))
            for _, user := range users {
                userMap[user.ID] = user.Username
                avatarMap[user.ID] = user.AvatarURL
                log.Printf("👤 [JoinWatchSession] User %d: username=%s, avatar_url=%s", user.ID, user.Username, user.AvatarURL)
            }
        } else {
            log.Printf("❌ [JoinWatchSession] Failed to query users: %v", err)
        }
        
        // Build member list for broadcast
        memberList := make([]map[string]interface{}, 0, len(activeMembers))
        for _, member := range activeMembers {
            username := userMap[member.UserID]
            if username == "" {
                username = "Unknown"
            }
            avatarURL := avatarMap[member.UserID]
            memberData := map[string]interface{}{
                "id":         member.ID,
                "user_id":    member.UserID,
                "username":   username,
                "avatar_url": avatarURL,
                "user_role":  member.UserRole,
                "is_active":  member.IsActive,
            }
            log.Printf("📦 [JoinWatchSession] Adding member to list: user_id=%d, username=%s, avatar_url=%s", member.UserID, username, avatarURL)
            memberList = append(memberList, memberData)
        }
        log.Printf("✅ [JoinWatchSession] Built member list with %d members", len(memberList))

        // 🪑 BUILD SEATING MAP from in-memory hub (userID -> full "row-col" seatID string)
        // The database only stores row numbers (int), but we need full seat IDs like "5-0"
        seatingMap := make(map[string]interface{})
        
        h.seatingMutex.RLock()
        if hallSeats, roomExists := h.seatingAssignments[client.roomID]; roomExists {
            // For 3D cinema, use hall 1 (default single hall)
            // For lecture halls with overflow, iterate all halls
            for hallNum, seats := range hallSeats {
                for seatID, userID := range seats {
                    // Check if this user is in our active members list
                    for _, member := range activeMembers {
                        if member.UserID == userID {
                            seatingMap[fmt.Sprintf("%d", userID)] = seatID // ✅ Full "row-col" string
                            log.Printf("🪑 [SESSION_STATUS] User %d → Seat %s (Hall %d)", userID, seatID, hallNum)
                            break
                        }
                    }
                }
            }
        }
        h.seatingMutex.RUnlock()
        
        if len(seatingMap) > 0 {
            log.Printf("📊 [SESSION_STATUS] Broadcasting seating map: %+v", seatingMap)
        }

        // 🐛 DEBUG: Log member count before broadcasting
        log.Printf("🔍 [JoinWatchSession] About to broadcast session_status with %d active members", len(activeMembers))
        for i, member := range activeMembers {
            log.Printf("🔍 [JoinWatchSession] Member %d: UserID=%d, Username=%s, AvatarURL=%s, IsActive=%v", 
                i+1, member.UserID, userMap[member.UserID], avatarMap[member.UserID], member.IsActive)
        }
        
        // 🔍 DEBUG: Log the memberList that will be sent
        log.Printf("📤 [JoinWatchSession] Member list to broadcast: %+v", memberList)
        
        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id":   sessionID,
                "host_id":      session.HostID,
                "members":      memberList,
                "member_count": len(activeMembers),
                "started_at":   session.StartedAt,
                "seating":      seatingMap, // ✅ Include persistent seating data
                "current_media_url": session.CurrentMediaURL,
                "current_media_type": session.CurrentMediaType,
                "is_screen_sharing_active": session.IsScreenSharingActive,
                "sharing_source": session.SharingSource,
                "session_title": session.SessionTitle,
                "is_private":    watchSession.IsPrivate, // ✅ Include session privacy flag
                "content_rating": watchSession.ContentRating, // ✅ Include content rating for button filtering
            },
        }
        if statusBytes, err := json.Marshal(statusMsg); err == nil {
            // ✅ Write directly to client.send (buffered, capacity 1024) instead of routing
            // through BroadcastToUser → hub.rooms lookup.  hub.register has not yet been
            // processed for this client at this point, so h.rooms[roomID] does not contain
            // them and BroadcastToUser silently drops the message (pre-registration race).
            // Direct write bypasses the lookup; writePump drains the buffer once it starts.
            log.Printf("📢 [JoinWatchSession] Queueing session_status directly in client.send for user %d: memberCount=%d", client.userID, len(activeMembers))
            select {
            case client.send <- OutgoingMessage{Data: statusBytes, IsBinary: false}:
                log.Printf("✅ [JoinWatchSession] session_status queued in client.send for user %d", client.userID)
            default:
                log.Printf("⚠️ [JoinWatchSession] session_status dropped — client.send full for user %d", client.userID)
            }
        }

        // Push updated count to lobby so session cards update without polling
        if countMsg, err := json.Marshal(map[string]interface{}{
            "type":       "media_state_changed",
            "session_id": sessionID,
            "data":       map[string]interface{}{"member_count": len(activeMembers)},
        }); err == nil {
            h.BroadcastToLobby(OutgoingMessage{Data: countMsg, IsBinary: false})
        }
    }

    return nil
}

// cleanupClientSync removes a client from all hub state immediately
// ✅ DEADLOCK FIX: Close send channel FIRST to stop writePump immediately
func (h *Hub) cleanupClientSync(client *Client) {
    log.Printf("[cleanupClientSync] 🧹 Starting cleanup for client %p (user %d, room %d)", client, client.userID, client.roomID)
    
    // 0. ✅ DATABASE CLEANUP FIRST - Mark user inactive in watch_session_members
    if client.sessionID != "" {
        log.Printf("[cleanupClientSync] 🗄️ Marking user %d inactive in session %s", client.userID, client.sessionID)
        now := time.Now()
        var sessionIDToCleanup string
        var watchSessionID uint
        
        // Fast path: we know which session this client was in
        sessionIDToCleanup = client.sessionID
        var session models.WatchSession
        if err := DB.Where("session_id = ?", client.sessionID).First(&session).Error; err == nil {
            watchSessionID = session.ID
        }
        
        if watchSessionID > 0 {
            // Mark user as inactive and set left_at timestamp
            result := DB.Model(&models.WatchSessionMember{}).
                Where("watch_session_id = ? AND user_id = ? AND is_active = ?", watchSessionID, client.userID, true).
                Updates(map[string]interface{}{
                    "is_active": false,
                    "left_at":   now,
                })
            
            if result.Error != nil {
                log.Printf("⚠️ [cleanupClientSync] Failed to mark user %d as left from session %d: %v", client.userID, watchSessionID, result.Error)
            } else if result.RowsAffected > 0 {
                log.Printf("✅ [cleanupClientSync] Marked user %d as left from session %s (watch_session_id=%d)", client.userID, sessionIDToCleanup, watchSessionID)
                
                // ✅ BROADCAST user_left TO ALL ROOM MEMBERS
                var user models.User
                if err := DB.First(&user, client.userID).Error; err == nil {
                    userLeftMsg := WebSocketMessage{
                        Type: "user_left",
                        Data: map[string]interface{}{
                            "userId":    client.userID,
                            "username":  user.Username,
                            "sessionId": sessionIDToCleanup,
                        },
                    }
                    if leftBytes, err := json.Marshal(userLeftMsg); err == nil {
                        // ✅ Use BroadcastToRoom method instead of channel to avoid deadlock
                        h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leftBytes, IsBinary: false}, nil)
                        log.Printf("📢 [cleanupClientSync] Broadcast user_left for user %d (%s) in session %s", client.userID, user.Username, sessionIDToCleanup)
                    }
                }
                
                // 🧹 CLEANUP: Remove client from sessionMembers map
                h.sessionMutex.Lock()
                if members, exists := h.sessionMembers[sessionIDToCleanup]; exists {
                    delete(members, client)
                    log.Printf("🧹 [cleanupClientSync] Removed client %p from sessionMembers[%s]", client, sessionIDToCleanup)
                    
                    // 🗑️ If this was the last member, clean up the entire session from memory
                    if len(members) == 0 {
                        delete(h.sessionMembers, sessionIDToCleanup)
                        delete(h.activeSessions, sessionIDToCleanup)
                        log.Printf("🗑️ [cleanupClientSync] Session %s cleaned up from memory (last member left)", sessionIDToCleanup)
                    } else {
                        log.Printf("ℹ️ [cleanupClientSync] Session %s still has %d members", sessionIDToCleanup, len(members))
                    }
                }
                h.sessionMutex.Unlock()
            } else {
                log.Printf("ℹ️ [cleanupClientSync] User %d was not active in session %s (already marked inactive)", client.userID, sessionIDToCleanup)
            }
        }
    }
    
    // 1. ✅ CLOSE SEND CHANNEL FIRST - This makes writePump exit IMMEDIATELY
    // writePump waits on <-client.send, so closing this channel wakes it up instantly
    func() {
        defer func() {
            if r := recover(); r != nil {
                log.Printf("⚠️ [cleanupClientSync] Recovered from panic closing channel (already closed): %v", r)
            }
        }()
        log.Printf("[cleanupClientSync] 🔹 Closing send channel for client %p (stops writePump)", client)
        close(client.send)
    }()
    
    // 2. ✅ Close connection to stop readPump
    log.Printf("[cleanupClientSync] 🔌 Force-closing WebSocket connection for client %p (stops readPump)", client)
    client.conn.Close()
    
    // 3. ✅ Brief sleep to allow pumps to fully exit and release any locks
    time.Sleep(10 * time.Millisecond)
    log.Printf("[cleanupClientSync] ⏱️ Pumps should have exited by now for client %p", client)
    
    // 4. ✅ NOW SAFE: Remove from rooms (pumps are dead, no deadlock risk)
    log.Printf("[cleanupClientSync] 📍 About to lock h.mutex for client %p (user %d, room %d)", client, client.userID, client.roomID)
    log.Printf("[cleanupClientSync] 🔐 Waiting for h.mutex lock...")
    h.mutex.Lock()
    log.Printf("[cleanupClientSync] ✅ ACQUIRED h.mutex lock for client %p", client)
    if roomClients, ok := h.rooms[client.roomID]; ok {
        if _, exists := roomClients[client]; exists {
            // ✅ Remove from room so broadcasts won't try to send to this client
            delete(roomClients, client)
            if len(roomClients) == 0 {
                delete(h.rooms, client.roomID)
            }
            log.Printf("[cleanupClientSync] 🗑️ Removed client %p from room %d", client, client.roomID)
        }
    }
    log.Printf("[cleanupClientSync] 🔓 About to release h.mutex lock for client %p", client)
    h.mutex.Unlock()
    log.Printf("[cleanupClientSync] ✅ RELEASED h.mutex lock for client %p", client)

    // 5. Clean up clientRegistry
    // ⚠️ NO LOCK HERE - caller (WebSocketHandler) already holds registryMutex during deduplication
    // This prevents deadlock when called from within the registryMutex.Lock() block
    if userMap, exists := h.clientRegistry[client.userID]; exists {
        delete(userMap, client.roomID)
        if len(userMap) == 0 {
            delete(h.clientRegistry, client.userID)
        }
    }

    // 6. Clean up stream host state
    h.streamStateMutex.Lock()
    if hostID, isStreaming := h.roomStreamHost[client.roomID]; isStreaming && hostID == client.userID {
        delete(h.roomStreamHost, client.roomID)
        h.roomStreamActive[client.roomID] = false
    }
    h.streamStateMutex.Unlock()

    // 7. Screen share cleanup is now handled by LiveKit
    log.Printf("[cleanupClientSync] Screen share cleanup delegated to LiveKit for room %d", client.roomID)

    log.Printf("[cleanupClientSync] ✅ Cleanup complete for client %p", client)
	log.Printf("[cleanupClientSync] ✅ COMPLETED cleanup for user %d (client=%p) - EXITING FUNCTION", client.userID, client)
}

// Run manages the registration, unregistration, and broadcasting of messages.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			log.Printf("🔵 [Hub.Run] REGISTER received for client %p (user %d, room %d)", client, client.userID, client.roomID)
			log.Printf("🔵 [Hub.Run] About to lock h.mutex for registration...")
			h.mutex.Lock()
			log.Printf("🔵 [Hub.Run] ✅ Acquired h.mutex lock for registration")
			roomClients, ok := h.rooms[client.roomID]
			if !ok {
				roomClients = make(map[*Client]bool)
				h.rooms[client.roomID] = roomClients
			}
			roomClients[client] = true
			log.Printf("🔵 [Hub.Run] ✅ Registration complete for client %p (user %d, room %d)", client, client.userID, client.roomID)
			log.Printf("Hub: Client %p (User %d) registered for room %d", client, client.userID, client.roomID)
			h.mutex.Unlock()
			log.Printf("🔵 [Hub.Run] ✅ RELEASED h.mutex lock after register for client %p", client)

		case client := <-h.unregister:
			log.Printf("🔴 [Hub.Run] UNREGISTER received for client %p (user %d, room %d)", client, client.userID, client.roomID)
			log.Printf("🔴 [Hub.Run] About to lock h.mutex for unregistration...")
			h.mutex.Lock()
			log.Printf("🔴 [Hub.Run] ✅ Acquired h.mutex lock for unregistration")
			roomClients, ok := h.rooms[client.roomID]
			if ok {
				if _, exists := roomClients[client]; exists {
					// ✅ Clean up seat assignment
					h.seatingMutex.Lock()
					if roomHalls, seatExists := h.seatingAssignments[client.roomID]; seatExists {
						// Check all halls for this user
						for _, hallSeats := range roomHalls {
							for seatID, userID := range hallSeats {
								if userID == client.userID {
									delete(hallSeats, seatID)
									log.Printf("🪑 Auto-cleanup: Seat vacated on disconnect - room=%d, seat=%s, user=%d", client.roomID, seatID, client.userID)

									// Broadcast user_left_seat so clients update their seat maps
									leaveSeatMsg := WebSocketMessage{
										Type: "user_left_seat",
										Data: map[string]interface{}{
											"user_id": client.userID,
										},
									}
									if leaveBytes, err := json.Marshal(leaveSeatMsg); err == nil {
										client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leaveBytes, IsBinary: false}, nil)
									}
									break
								}
							}
						}
					}
					h.seatingMutex.Unlock()

					// ✅ DATABASE CLEANUP: Mark user as left in watch_session_members
					// Use client.sessionID if available for faster lookup
					now := time.Now()
					var sessionIDToCleanup string
					var watchSessionID uint
					
					if client.sessionID != "" {
						// Fast path: we know which session this client was in
						sessionIDToCleanup = client.sessionID
						var session models.WatchSession
						if err := DB.Where("session_id = ?", client.sessionID).First(&session).Error; err == nil {
							watchSessionID = session.ID
						}
					} else {
						// Fallback: find active session for this room
						var activeSession models.WatchSession
						if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err == nil {
							sessionIDToCleanup = activeSession.SessionID
							watchSessionID = activeSession.ID
						}
					}
					
					if watchSessionID > 0 {
						// Mark user as inactive and set left_at timestamp
						result := DB.Model(&models.WatchSessionMember{}).
							Where("watch_session_id = ? AND user_id = ? AND is_active = ?", watchSessionID, client.userID, true).
							Updates(map[string]interface{}{
								"is_active": false,
								"left_at":   now,
							})
						
						if result.Error != nil {
							log.Printf("⚠️ Failed to mark user %d as left from session %d: %v", client.userID, watchSessionID, result.Error)
						} else if result.RowsAffected > 0 {
							log.Printf("✅ Marked user %d as left from session %s (watch_session_id=%d)", client.userID, sessionIDToCleanup, watchSessionID)
							
							// Count remaining members first so the broadcast carries ground truth.
							var newCount int64
							DB.Model(&models.WatchSessionMember{}).
								Where("watch_session_id = ? AND is_active = ?", watchSessionID, true).
								Count(&newCount)

							// ✅ BROADCAST user_left TO ALL ROOM MEMBERS
							var user models.User
							if err := DB.First(&user, client.userID).Error; err == nil {
								userLeftMsg := WebSocketMessage{
									Type: "user_left",
									Data: map[string]interface{}{
										"userId":       client.userID,
										"username":     user.Username,
										"sessionId":    sessionIDToCleanup,
										"member_count": newCount,
									},
								}
								if leftBytes, err := json.Marshal(userLeftMsg); err == nil {
									h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leftBytes, IsBinary: false}, nil)
									log.Printf("📢 Broadcast user_left for user %d (%s) in session %s — count: %d", client.userID, user.Username, sessionIDToCleanup, newCount)
								}
							}
							if countMsg, err := json.Marshal(map[string]interface{}{
								"type":       "media_state_changed",
								"session_id": sessionIDToCleanup,
								"data":       map[string]interface{}{"member_count": newCount},
							}); err == nil {
								h.BroadcastToLobby(OutgoingMessage{Data: countMsg, IsBinary: false})
							}
						}
						
						// ✅ CHECK IF DISCONNECTING USER IS THE HOST
						// ✅ FIXED: Only start timer if ALL host connections are gone (not just this one)
						var room models.Room
						if err := DB.First(&room, client.roomID).Error; err == nil {
							if room.HostID == client.userID && sessionIDToCleanup != "" {
								// ⚠️ DISABLED: Host connection check (was used for auto-end timer)
								// hasOtherHostConnection := false
								// totalRoomConnections := len(roomClients)
								// hostConnectionCount := 0
								// for otherClient := range roomClients {
								// 	if otherClient.userID == room.HostID {
								// 		hostConnectionCount++
								// 	}
								// 	if otherClient != client && otherClient.userID == room.HostID {
								// 		hasOtherHostConnection = true
								// 		log.Printf("🔍 Host still has another active connection (client %p)", otherClient)
								// 	}
								// }
								// log.Printf("📊 [CONNECTION CHECK] Room %d: %d total connections, host has %d connection(s)", 
								// 	client.roomID, totalRoomConnections, hostConnectionCount)
								
								// ⚠️ DISABLED: Auto-end timer feature (was used to start 1-hour countdown when host disconnects)
								/*
								if !hasOtherHostConnection {
									roomName := fmt.Sprintf("room-%d", client.roomID)
									userIdentity := fmt.Sprintf("user-%d", client.userID)
									isActiveInLiveKit := utils.IsHostActiveInLiveKit(roomName, userIdentity)
									
									if isActiveInLiveKit {
										log.Printf("🎙️ [HOST IN LIVEKIT] User %d is ACTIVE in LiveKit room %s", 
											client.userID, roomName)
									} else {
										log.Printf("⏱️ [HOST DISCONNECT] User %d FULLY disconnected from session %s", 
											client.userID, sessionIDToCleanup)
									}
								} else {
									log.Printf("✅ [HOST STILL CONNECTED] User %d has other active connections in session %s", client.userID, sessionIDToCleanup)
								}
								*/
								log.Printf("ℹ️ [HOST DISCONNECT] User %d disconnected from session %s (auto-end disabled)", client.userID, sessionIDToCleanup)
							}
						}
					}

					// ✅ Broadcast 'participant_leave' to others in the room
					leaveMsg := WebSocketMessage{
						Type: "participant_leave",
						Data: map[string]interface{}{
							"userId": client.userID,
						},
					}
					if leaveBytes, err := json.Marshal(leaveMsg); err == nil {
						// ✅ Use BroadcastToRoom method instead of channel to avoid deadlock
						h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leaveBytes, IsBinary: false}, client)
					}

					delete(roomClients, client)
					
					// ✅ Safely close channel (may already be closed by cleanupClientSync)
					func() {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("⚠️ [Hub.unregister] Channel already closed for user %d: %v", client.userID, r)
							}
						}()
						close(client.send)
					}()
					
					log.Printf("Hub: Client %p (User %d) unregistered from room %d", client, client.userID, client.roomID)

					// ✅ Cleanup user from any active calls (lobby clients only)
					if client.roomID == 0 {
						CleanupUserCalls(client.userID)
					}

					// ✅ Cleanup game state on disconnect
					if gameWebSocketHandler != nil {
						gameWebSocketHandler.CleanupPlayerDisconnect(client.roomID, client.userID)
					}

					// Check if this client was the stream host
					h.streamStateMutex.Lock()
					if hostID, isStreaming := h.roomStreamHost[client.roomID]; isStreaming && hostID == client.userID {
						// Stream host disconnected, stop the stream
						delete(h.roomStreamHost, client.roomID)
						h.roomStreamActive[client.roomID] = false
						h.streamStateMutex.Unlock()

						log.Printf("Hub: User %d (stream host) disconnected from room %d", client.userID, client.roomID)
					} else {
						h.streamStateMutex.Unlock()
					}

					// Screen share is now handled by LiveKit

					// Check if the room is now empty
					if len(roomClients) == 0 {
						delete(h.rooms, client.roomID)
						log.Printf("Hub: Room %d is now empty, cleaned up client map.", client.roomID)
						// Potentially clean up other room-specific state here if needed
					}
				}
			}
			// ✅ Release mutex BEFORE registry cleanup to prevent deadlock
			h.mutex.Unlock()
			log.Printf("🔴 [Hub.Run] ✅ RELEASED h.mutex lock after unregister for client %p", client)
			
			// 🔥 Clean up clientRegistry (must be done AFTER mutex unlock to prevent deadlock)
            h.registryMutex.Lock()
            if userMap, exists := h.clientRegistry[client.userID]; exists {
                delete(userMap, client.roomID)
                if len(userMap) == 0 {
                    delete(h.clientRegistry, client.userID) // ✅ CORRECT
                }
            }
            h.registryMutex.Unlock()

		case message := <-h.broadcast:
			// Broadcast message to *all* clients in *all* rooms (if needed, rarely used)
			h.mutex.RLock()
			for _, roomClients := range h.rooms {
				for client := range roomClients {
					// ✅ FIX: Protect against sending to closed channels
					func(c *Client) {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("⚠️ [Hub] Recovered from panic sending to user %d: %v", c.userID, r)
							}
						}()
						select {
						case c.send <- message:
						default:
							log.Printf("Hub: Dropping message for client %p (buffer full)", c)
						}
					}(client)
				}
			}
			h.mutex.RUnlock()

		case roomBroadcast := <-h.broadcastToRoom:
			h.mutex.RLock()
			roomClients, ok := h.rooms[roomBroadcast.roomID]
			if ok {
				for client := range roomClients {
					// Exclude the sender if provided
					if roomBroadcast.sender != nil && client == roomBroadcast.sender {
						continue
					}
					
					// ✅ FIX: Protect against sending to closed channels
					func(c *Client) {
						defer func() {
							if r := recover(); r != nil {
								log.Printf("⚠️ [Hub] Recovered from panic sending to user %d: %v", c.userID, r)
							}
						}()
						select {
						case c.send <- roomBroadcast.data:
						default:
							log.Printf("Hub: Dropping message for client %p in room %d (buffer full)", c, roomBroadcast.roomID)
						}
					}(client)
				}
			} else {
				log.Printf("Hub: Attempted to broadcast to non-existent room %d", roomBroadcast.roomID)
			}
			h.mutex.RUnlock()

		case userBroadcast := <-h.broadcastToUsers:
			h.mutex.RLock()
			for _, targetRoomClients := range h.rooms { // Iterate through all rooms
				for client := range targetRoomClients {
					for _, targetUserID := range userBroadcast.userIDs {
						if client.userID == targetUserID {
							select {
							case client.send <- userBroadcast.data:
							default:
								log.Printf("Hub: Dropping message for targeted client %p (User %d) (buffer full)", client, targetUserID)
							}
							break // Found the user, move to next user ID
						}
					}
				}
			}
			h.mutex.RUnlock()
		}
	}
}



// BroadcastToRoom sends a message to all clients in a specific room.
// sender can be provided to exclude it from the broadcast (e.g., for echo suppression).
func (h *Hub) BroadcastToRoom(roomID uint, message OutgoingMessage, sender *Client) {
    // Debug: log broadcast enqueue
    if message.IsBinary {
        log.Printf("[Hub] Enqueue BroadcastToRoom room=%d binary size=%d", roomID, len(message.Data))
    } else {
        log.Printf("[Hub] Enqueue BroadcastToRoom room=%d text size=%d preview=%s", roomID, len(message.Data), string(message.Data)[:min(len(message.Data), 200)])
    }
	select {
	case h.broadcastToRoom <- RoomBroadcastMessage{roomID: roomID, data: message, sender: sender}:
	default:
		log.Printf("Hub: BroadcastToRoom channel is full, dropping message for room %d", roomID)
	}
}

// BroadcastToRoomBinary broadcasts binary data to all clients in a room except the sender
func (h *Hub) BroadcastToRoomBinary(roomID uint, data []byte, senderUserID uint) {
	h.mutex.RLock()
	clients, exists := h.rooms[roomID]
	h.mutex.RUnlock()

	if !exists {
		log.Printf("[Hub] BroadcastToRoomBinary: room %d not found", roomID)
		return
	}

	log.Printf("[Hub] Broadcasting binary data to room %d: %d bytes from user %d", roomID, len(data), senderUserID)

	for client := range clients {
		// Don't send back to the sender
		if client.userID == senderUserID {
			continue
		}

		select {
		case client.send <- OutgoingMessage{Data: data, IsBinary: true}:
			log.Printf("[Hub] Sent binary chunk to user %d (%d bytes)", client.userID, len(data))
		default:
			log.Printf("[Hub] Failed to send binary to user %d (channel full)", client.userID)
		}
	}
}

// BroadcastToLobby broadcasts a message to all connected clients (lobby-wide)
// Used for notifying all users about room/event changes visible in LobbyPage
func (h *Hub) BroadcastToLobby(message OutgoingMessage) {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	
	sent := 0
	failed := 0
	totalClients := 0
	
	// Iterate through all rooms and all clients
	for _, clients := range h.rooms {
		for client := range clients {
			totalClients++
			select {
			case client.send <- message:
				sent++
			default:
				// Client's send channel is full, skip
				failed++
				log.Printf("[Hub] Failed to send lobby broadcast to user %d (channel full)", client.userID)
			}
		}
	}
	
	log.Printf("[Hub] Lobby broadcast complete: total=%d, sent=%d, failed=%d", totalClients, sent, failed)
}

// DisconnectRoomClients forcefully disconnects all WebSocket clients in a room
func (h *Hub) DisconnectRoomClients(roomID uint) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	clients, exists := h.rooms[roomID]
	if !exists {
		log.Printf("[Hub] DisconnectRoomClients: room %d not found", roomID)
		return
	}

	log.Printf("🔌 [Hub] Disconnecting %d clients from room %d", len(clients), roomID)

	for client := range clients {
		// ✅ Safely close the send channel (may already be closed)
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("⚠️ [Hub.DisconnectAllClients] Channel already closed for user %d: %v", client.userID, r)
				}
			}()
			close(client.send)
			log.Printf("🔌 [Hub] Closed send channel for user %d in room %d", client.userID, roomID)
		}()
	}

	// Clear the room from the hub
	delete(h.rooms, roomID)
	log.Printf("✅ [Hub] Room %d cleared from hub", roomID)
}

// BroadcastToUsers sends a message to specific users by their IDs.
func (h *Hub) BroadcastToUsers(userIDs []uint, message OutgoingMessage) {
    // Debug: log targeted broadcast enqueue
    if message.IsBinary {
        log.Printf("[Hub] Enqueue BroadcastToUsers users=%v binary size=%d", userIDs, len(message.Data))
    } else {
        log.Printf("[Hub] Enqueue BroadcastToUsers users=%v text size=%d preview=%s", userIDs, len(message.Data), string(message.Data)[:min(len(message.Data), 200)])
    }
	select {
	case h.broadcastToUsers <- UserBroadcastMessage{userIDs: userIDs, data: message}:
	default:
		log.Printf("Hub: BroadcastToUsers channel is full, dropping message")
	}
}

// BroadcastToUser sends a message to a single user in a specific room
func (h *Hub) BroadcastToUser(userID uint, roomID uint, message OutgoingMessage) {
	h.BroadcastToUsers([]uint{userID}, message)
}

// GetRoomConnectionCount returns the number of live WebSocket clients in a room.
// Use alongside the DB active-member count to detect ghost entries.
func (h *Hub) GetRoomConnectionCount(roomID uint) int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return len(h.rooms[roomID])
}

// GetRoomActiveUserIDs returns a set of user IDs that have live WS connections in a room.
func (h *Hub) GetRoomActiveUserIDs(roomID uint) map[uint]bool {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	result := make(map[uint]bool)
	for client := range h.rooms[roomID] {
		result[client.userID] = true
	}
	return result
}

// GetActiveSession retrieves the active session for a sessionID.
func (h *Hub) GetActiveSession(sessionID string) (*models.WatchSession, bool) {
	h.sessionMutex.RLock()
	session, exists := h.activeSessions[sessionID]
	h.sessionMutex.RUnlock()
	return session, exists
}

// SetActiveSession updates the active session for a sessionID.
func (h *Hub) SetActiveSession(sessionID string) {
	h.sessionMutex.Lock()
	h.activeSessions[sessionID] = &models.WatchSession{}
	h.sessionMutex.Unlock()
}

// MarkOrphanedSession marks a session as orphaned (user disconnected).
func (h *Hub) MarkOrphanedSession(sessionID string) {
	h.sessionMutex.Lock()
	if _, exists := h.activeSessions[sessionID]; exists {
		h.orphanedSessions[sessionID] = time.Now()
		delete(h.activeSessions, sessionID)
		log.Printf("Hub: Session %s marked as orphaned.", sessionID)
	}
	h.sessionMutex.Unlock()
}

// CancelOrphanedSession removes a session from the orphaned list if it reconnects quickly.
func (h *Hub) CancelOrphanedSession(sessionID string) {
	h.sessionMutex.Lock()
	if _, exists := h.orphanedSessions[sessionID]; exists {
		delete(h.orphanedSessions, sessionID)
		log.Printf("Hub: Orphaned session %s cancelled (reconnected).", sessionID)
	}
	h.sessionMutex.Unlock()
}

// CleanupOrphanedSessions removes sessions that have been orphaned for too long.
func (h *Hub) CleanupOrphanedSessions() {
	h.sessionMutex.Lock()
	now := time.Now()
	for sessionID, disconnectTime := range h.orphanedSessions {
		if now.Sub(disconnectTime) > 5*time.Minute { // Example: 5 minutes
			delete(h.orphanedSessions, sessionID)
			log.Printf("Hub: Cleaned up orphaned session %s.", sessionID)
		}
	}
	h.sessionMutex.Unlock()
}

// Enhanced client read pump with better error handling
func (c *Client) readPump() {
	log.Printf("[readPump] ▶️ STARTED for user %d (client=%p)", c.userID, c)
	log.Printf("[readPump] 🔄 Entering read loop for user %d in room %d (client=%p)", c.userID, c.roomID, c)
	
	// ✅ Panic recovery to prevent server crashes
	defer func() {
		if r := recover(); r != nil {
			log.Printf("🚨 [readPump] PANIC RECOVERED for user %d: %v", c.userID, r)
			log.Printf("📊 [readPump] Stack trace will be printed to stderr")
		}
		log.Printf("[readPump] 🛑 Exiting read loop for user %d (client=%p)", c.userID, c)
		c.hub.unregister <- c
		c.conn.Close()
		log.Printf("[readPump] ⏹️ EXITED for user %d (client=%p)", c.userID, c)
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// metrics removed (unused) — keep BinaryStreamMetrics struct for future use
	
	log.Printf("[readPump] ⏳ Waiting for messages from user %d...", c.userID)

    for {
        messageType, message, err := c.conn.ReadMessage()
        if err != nil {
            if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
                log.Printf("WebSocket error: %v", err)
            }
            break
        }

        switch messageType {
        

        case websocket.TextMessage:
            log.Printf("[readPump][DEBUG] TextMessage received: user_id=%d room_id=%d bytes=%d content=%s", c.userID, c.roomID, len(message), string(message))
            log.Printf("📨 Text message received from user %d: %s", c.userID, string(message))
            c.handleMessage(message)
        
        case websocket.BinaryMessage:
            log.Printf("[readPump][DEBUG] BinaryMessage received: user_id=%d room_id=%d bytes=%d", c.userID, c.roomID, len(message))
            // Broadcast binary data (camera stream) to all other clients in the room
            c.hub.BroadcastToRoomBinary(c.roomID, message, c.userID)
        }
    }
}

// writePump plucks OutgoingMessage values and sends one websocket frame per message (no coalescing)
func (c *Client) writePump() {
    log.Printf("[writePump] 🔄 Entering write loop for user %d in room %d (client=%p)", c.userID, c.roomID, c)
    
    ticker := time.NewTicker(pingPeriod)
    defer func() {
        log.Printf("[writePump] 🛑 Exiting write loop for user %d (client=%p)", c.userID, c)
        ticker.Stop()
        c.conn.Close()
    }()

    log.Printf("[writePump] ⏳ Ready to send messages for user %d...", c.userID)

    for {
        select {
        case msg, ok := <-c.send:
            c.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if !ok {
                // Channel closed
                _ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
                return
            }

            if msg.IsBinary {
                if err := c.conn.WriteMessage(websocket.BinaryMessage, msg.Data); err != nil {
                    log.Printf("writePump: binary write error to user %d: %v", c.userID, err)
                    return
                }
            } else {
                if err := c.conn.WriteMessage(websocket.TextMessage, msg.Data); err != nil {
                    log.Printf("writePump: text write error to user %d: %v", c.userID, err)
                    return
                }
            }

        case <-ticker.C:
            c.conn.SetWriteDeadline(time.Now().Add(writeWait))
            if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
        }
    }
}

// - WebSocket Handler -

// In websocket.go, replace the upgrader var with:
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Allow frontend dev server, backend, tunnels, and Vercel
		return origin == "http://localhost:5173" || 
		       origin == "http://localhost:8080" || 
		       strings.Contains(origin, "trycloudflare.com") || // Cloudflare tunnel
		       strings.Contains(origin, "loca.lt") || // Localtunnel
		       strings.Contains(origin, ".vercel.app") || // Vercel deployments
		       origin == ""
	},
}

// LobbyWebSocketHandler handles lobby-wide WebSocket connections for real-time updates
// This is a lightweight connection that only receives broadcast messages (no room-specific data)
func LobbyWebSocketHandler(c *gin.Context) {
	log.Printf("🏛️ [LobbyWebSocketHandler] Connection request received")
	
	// --- Authentication ---
	userIDVal, exists := c.Get("user_id")
	if !exists {
		log.Println("LobbyWebSocketHandler: Unauthorized - user_id not in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDVal.(uint)
	if !ok {
		log.Println("LobbyWebSocketHandler: Invalid user_id type")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	log.Printf("🏛️ [LobbyWebSocketHandler] Authenticated user %d requesting lobby connection", authenticatedUserID)

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("LobbyWebSocketHandler: Failed to upgrade connection: %v", err)
		return
	}

	// Create a special lobby client (roomID = 0 indicates lobby connection)
	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan OutgoingMessage, 256), // Smaller buffer for lobby (less traffic)
		roomID: 0, // Special value: 0 = lobby connection
		userID: authenticatedUserID,
	}

	log.Printf("🏛️ [LobbyWebSocketHandler] Registering lobby client for user %d", authenticatedUserID)

	// Register in hub.rooms with roomID=0 (lobby clients)
	hub.mutex.Lock()
	if _, exists := hub.rooms[0]; !exists {
		hub.rooms[0] = make(map[*Client]bool)
	}
	hub.rooms[0][client] = true
	hub.mutex.Unlock()

	log.Printf("✅ [LobbyWebSocketHandler] Lobby client registered for user %d", authenticatedUserID)

	// Start pumps
	go client.writePump()
	go client.readPump()

	// Send initial connection confirmation
	welcomeMsg := WebSocketMessage{
		Type: "lobby_connected",
		Data: map[string]interface{}{
			"message": "Connected to lobby updates",
			"user_id": authenticatedUserID,
		},
	}
	welcomeJSON, _ := json.Marshal(welcomeMsg)
	select {
	case client.send <- OutgoingMessage{Data: welcomeJSON, IsBinary: false}:
	default:
	}

	log.Printf("🏛️ [LobbyWebSocketHandler] Pumps started for user %d, connection established", authenticatedUserID)
	select {} // Block forever (pumps handle the connection lifecycle)
}

// WebSocketHandler handles the WebSocket upgrade request.
func WebSocketHandler(c *gin.Context) {
	timestamp := time.Now().Format("15:04:05.000")
	log.Printf("🔌🔌🔌 [%s] WebSocketHandler CALLED", timestamp)
	log.Printf("🔍 [%s] Request headers: Origin=%s, User-Agent=%s", 
		timestamp, c.Request.Header.Get("Origin"), c.Request.Header.Get("User-Agent"))
	
	// --- Authentication and Room ID Extraction ---
	userIDVal, exists := c.Get("user_id")
	if !exists {
		log.Printf("❌ [%s] WebSocketHandler: user_id not found in context", timestamp)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDVal.(uint)
	if !ok {
		log.Printf("❌ [%s] WebSocketHandler: user_id in context is not uint", timestamp)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
		return
	}

	roomIDStr := c.Query("room_id")
	if roomIDStr == "" {
		roomIDStr = c.Param("room_id")
	}
	if roomIDStr == "" {
		roomIDStr = c.Param("id")
	}
	if roomIDStr == "" {
		log.Printf("❌ [%s] WebSocketHandler: Missing room_id", timestamp)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing room_id"})
		return
	}
	roomID64, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil {
		log.Printf("❌ [%s] WebSocketHandler: Invalid room_id: %v", timestamp, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room_id"})
		return
	}
	roomID := uint(roomID64)
	
	log.Printf("📡 [%s] WebSocket connection request: User %d → Room %d", timestamp, authenticatedUserID, roomID)

	// --- Session validation BEFORE WebSocket upgrade ---
	sessionID := c.Query("session_id")
	log.Printf("🔍 [%s] Extracted session_id from query: '%s'", timestamp, sessionID)
	if sessionID != "" {
		// ✅ Check if session exists and is active (using is_active field)
		var session models.WatchSession
		if err := DB.Where("session_id = ?", sessionID).First(&session).Error; err == nil {
			// Session exists - check if it's active
			if !session.IsActive || session.EndedAt != nil {
				log.Printf("❌ WebSocket connection rejected: session %s is not active (is_active=%v, ended_at=%v)", 
					sessionID, session.IsActive, session.EndedAt)
				c.JSON(http.StatusGone, gin.H{
					"error":   "session_ended",
					"message": "This watch session has ended. Please start a new session.",
				})
				return
			}
		}
	}

	// Now safe to upgrade WebSocket connection
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocketHandler: WebSocket upgrade failed: %v", err)
		return
	}

	// --- Session logic ---
	var watchSession models.WatchSession

	if sessionID != "" {
		log.Printf("🔍 [WebSocketHandler] sessionID from query: '%s', checking database...", sessionID)
		if err := DB.Where("session_id = ? AND ended_at IS NULL AND is_active = ?", sessionID, true).First(&watchSession).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// Session doesn't exist at all - create new one
				log.Printf("⚠️ [WebSocketHandler] Session %s not found in DB, creating it...", sessionID)
				watchSession = models.WatchSession{
					SessionID:      sessionID,
					RoomID:         roomID,
					HostID:         authenticatedUserID,
					StartedAt:      time.Now(),
					IsActive:       true,
					PreviewEnabled: true,
				}
				if err := DB.Create(&watchSession).Error; err != nil {
					log.Printf("Failed to create watch session: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
					return
				}
				log.Printf("✅ [WebSocketHandler] Created session %s in DB", sessionID)
			} else {
				log.Printf("Error querying watch session: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
		} else {
			log.Printf("✅ [WebSocketHandler] Found session %s in DB (ID: %d)", sessionID, watchSession.ID)
		}
		log.Printf("🔍 [WebSocketHandler] After DB lookup, sessionID='%s', watchSession.ID=%d", sessionID, watchSession.ID)
	} else {
		// ✅ DO NOT auto-create sessions for RoomPage WebSocket connections
		// Only VideoWatch should create sessions (via session_id query param)
		if err := DB.Where("room_id = ? AND ended_at IS NULL AND is_active = ?", roomID, true).First(&watchSession).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// No active session - this is just a RoomPage connection, don't create a session
				log.Printf("WebSocketHandler: No active session for room %d, not creating one (RoomPage connection)", roomID)
				// Use a placeholder session to avoid nil issues
				watchSession = models.WatchSession{
					SessionID: "", // Empty session ID indicates no active session
					RoomID:    roomID,
					HostID:    authenticatedUserID,
				}
				sessionID = "" // No session for RoomPage connections
			} else {
				log.Printf("Error querying watch session: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
		} else {
			// Found an existing active session, but user connected via RoomPage (no session_id param)
			// 🔍 User connected to RoomPage without session_id - DON'T auto-upgrade
			// If they left the session (clicked "Leave Room"), they should stay on RoomPage
			// They can rejoin by navigating to PositionCalculator with the session_id
			log.Printf("WebSocketHandler: Found existing active session %s for room %d, user connected without session_id param - keeping on RoomPage", watchSession.SessionID, roomID)
			sessionID = "" // Don't auto-join - user is just viewing RoomPage
		}
	}

	// ✅ Only register in activeSessions if there's an actual session
	if sessionID != "" {
		hub.sessionMutex.Lock()
		hub.activeSessions[watchSession.SessionID] = &watchSession
		hub.sessionMutex.Unlock()
		
		// 🔞 AGE VERIFICATION: Check content rating before allowing connection
		if watchSession.ContentRating != "" {
			// Host is exempt from age checks
			isHost := authenticatedUserID == watchSession.HostID
			
			if !isHost {
				// Get user's date of birth
				var user models.User
				if err := DB.Select("date_of_birth").First(&user, authenticatedUserID).Error; err != nil {
					log.Printf("❌ [WebSocketHandler] Failed to get user %d for age verification: %v", authenticatedUserID, err)
					errorMsg := map[string]interface{}{
						"type": "age_verification_error",
						"data": map[string]interface{}{
							"message": "Failed to verify your age. Please try again.",
						},
					}
					if err := conn.WriteJSON(errorMsg); err == nil {
						log.Printf("📤 [WebSocketHandler] Sent age_verification_error message to user %d", authenticatedUserID)
					}
					conn.Close()
					return
				}
				
				// Check if user has DOB set
				if user.DateOfBirth == nil {
					log.Printf("❌ [WebSocketHandler] User %d has no date of birth - rejecting connection to rated session %s", authenticatedUserID, sessionID)
					errorMsg := map[string]interface{}{
						"type": "age_verification_required",
						"data": map[string]interface{}{
							"content_rating": watchSession.ContentRating,
							"message":        "Please set your date of birth to view this content.",
						},
					}
					if err := conn.WriteJSON(errorMsg); err == nil {
						log.Printf("📤 [WebSocketHandler] Sent age_verification_required message to user %d", authenticatedUserID)
					}
					conn.Close()
					return
				}
				
				// Calculate user's age
				now := time.Now()
				age := now.Year() - user.DateOfBirth.Year()
				if now.YearDay() < user.DateOfBirth.YearDay() {
					age--
				}
				
				// Check age requirement based on content rating
				ageRequirements := map[string]int{
					"G":      0,
					"PG":     0,
					"13+":    13,
					"16+":    16,
					"18+":    18,
					"Mature": 18,
				}
				
				requiredAge, ok := ageRequirements[watchSession.ContentRating]
				if !ok {
					log.Printf("⚠️ [WebSocketHandler] Unknown content rating: %s", watchSession.ContentRating)
					requiredAge = 0 // Default to no restriction if rating is unrecognized
				}
				
				if age < requiredAge {
					log.Printf("❌ [WebSocketHandler] Age verification failed: User %d is %d years old, needs %d for %s - rejecting connection", 
						authenticatedUserID, age, requiredAge, watchSession.ContentRating)
					
					// Build dynamic error message
					var message string
					if watchSession.ContentRating == "13+" {
						message = fmt.Sprintf("This session is rated %s. You must be 13 or older to view this content.", watchSession.ContentRating)
					} else if watchSession.ContentRating == "16+" {
						message = fmt.Sprintf("This session is rated %s. You must be 16 or older to view this content.", watchSession.ContentRating)
					} else if watchSession.ContentRating == "18+" || watchSession.ContentRating == "Mature" {
						message = fmt.Sprintf("This session is rated %s. You must be 18 or older to view this content.", watchSession.ContentRating)
					} else {
						message = fmt.Sprintf("This session is rated %s. You do not meet the age requirement.", watchSession.ContentRating)
					}
					
					errorMsg := map[string]interface{}{
						"type": "age_restricted",
						"data": map[string]interface{}{
							"content_rating": watchSession.ContentRating,
							"required_age":   requiredAge,
							"user_age":       age,
							"message":        message,
						},
					}
					
					if err := conn.WriteJSON(errorMsg); err == nil {
						log.Printf("📤 [WebSocketHandler] Sent age_restricted message to user %d", authenticatedUserID)
					}
					
					conn.Close()
					log.Printf("🔌 [WebSocketHandler] Closed connection for user %d (age restriction)", authenticatedUserID)
					return
				}
				
				log.Printf("✅ [WebSocketHandler] Age verified: User %d is %d years old, %s requires %d", 
					authenticatedUserID, age, watchSession.ContentRating, requiredAge)
			}
		}
		
		// 🎫 TICKET ENFORCEMENT: Check if session requires tickets
		if watchSession.TicketingEnabled {
			// Host is always allowed
			if authenticatedUserID != watchSession.HostID {
				log.Printf("🎫 [WebSocketHandler] Checking ticket for user %d in paid session %s", authenticatedUserID, sessionID)
				
				// Check if user owns a ticket (SessionTicket.SessionID is uint, watchSession.ID is uint)
				var ticket models.SessionTicket
				err := DB.Where("user_id = ? AND session_id = ?", authenticatedUserID, watchSession.ID).First(&ticket).Error
				
				if err != nil {
					if err == gorm.ErrRecordNotFound {
						log.Printf("❌ [WebSocketHandler] User %d has no ticket for paid session %s - rejecting connection", authenticatedUserID, sessionID)
					} else {
						log.Printf("❌ [WebSocketHandler] Database error checking ticket for user %d: %v - rejecting connection", authenticatedUserID, err)
					}
					
					// Send ticket_required error to client
					errorMsg := map[string]interface{}{
						"type": "ticket_required",
						"data": map[string]interface{}{
							"session_id":           sessionID,
							"ticket_price_tokens":  watchSession.TicketPriceTokens,
							"message":              "This is a paid session. Please purchase a ticket to join.",
						},
					}
					
					if err := conn.WriteJSON(errorMsg); err == nil {
						log.Printf("📤 [WebSocketHandler] Sent ticket_required message to user %d", authenticatedUserID)
					}
					
					// Close connection
					conn.Close()
					log.Printf("🔌 [WebSocketHandler] Closed connection for user %d (no ticket or db error)", authenticatedUserID)
					return
				}
				
				// ✅ Additional validation: Check ticket ID is valid (not zero)
				if ticket.ID == 0 {
					log.Printf("❌ [WebSocketHandler] User %d has invalid ticket (ID=0) for paid session %s - rejecting connection", authenticatedUserID, sessionID)
					
					errorMsg := map[string]interface{}{
						"type": "ticket_required",
						"data": map[string]interface{}{
							"session_id":           sessionID,
							"ticket_price_tokens":  watchSession.TicketPriceTokens,
							"message":              "This is a paid session. Please purchase a ticket to join.",
						},
					}
					
					conn.WriteJSON(errorMsg)
					conn.Close()
					log.Printf("🔌 [WebSocketHandler] Closed connection for user %d (invalid ticket)", authenticatedUserID)
					return
				}
				
				log.Printf("✅ [WebSocketHandler] User %d has valid ticket (ID: %d) for session %s", authenticatedUserID, ticket.ID, sessionID)
			} else {
				log.Printf("👑 [WebSocketHandler] User %d is host - skipping ticket check", authenticatedUserID)
			}
		}
	}

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan OutgoingMessage, 1024),
		roomID:   roomID,
		userID:   authenticatedUserID,
		streamID: sessionID,
	}

	// 🔥 CRITICAL: Detect and cleanup duplicate connections BEFORE JoinWatchSession
	// This ensures old client is marked inactive before new client tries to create DB record
	var oldClient *Client
	log.Printf("[WebSocketHandler] 🔍 Checking for duplicate connections: user %d, room %d", authenticatedUserID, roomID)
	
	hub.registryMutex.Lock()
	if userMap, exists := hub.clientRegistry[authenticatedUserID]; exists {
		if existing, ok := userMap[roomID]; ok {
			oldClient = existing
			log.Printf("[WebSocketHandler] ⚠️ Found DUPLICATE client %p for user %d in room %d", oldClient, authenticatedUserID, roomID)
			
			// ✅ FAST FIX: Just close the old connection and unregister from Hub
			// Let the old client's readPump/writePump handle cleanup via normal unregister flow
			log.Printf("[WebSocketHandler] 📤 Sending old client %p to Hub.unregister channel", oldClient)
			// ✅ Use non-blocking send to avoid deadlock if Hub.Run is stuck
			select {
			case hub.unregister <- oldClient:
				log.Printf("[WebSocketHandler] ✅ Old client queued for cleanup")
			default:
				log.Printf("[WebSocketHandler] ⚠️ Hub.unregister channel full, skipping cleanup")
			}
			
			// Brief sleep to let unregister process (avoids race with DB operations)
			time.Sleep(50 * time.Millisecond)
		}
	}
	// Register new client
	if _, exists := hub.clientRegistry[authenticatedUserID]; !exists {
		hub.clientRegistry[authenticatedUserID] = make(map[uint]*Client)
	}
	hub.clientRegistry[authenticatedUserID][roomID] = client
	log.Printf("[WebSocketHandler] ✅ Registered client %p in clientRegistry for user %d, room %d", client, authenticatedUserID, roomID)
	hub.registryMutex.Unlock()

	// ✅ Join the watch session AFTER duplicate cleanup (so DB record is available for reactivation)
	log.Printf("[WebSocketHandler] 📍 After duplicate handling, about to check sessionID. sessionID='%s', client=%p", sessionID, client)
	log.Printf("🔍 [WebSocketHandler] Checking if should join session: sessionID='%s'", sessionID)
	if sessionID != "" {
		log.Printf("✅ [WebSocketHandler] Calling JoinWatchSession for user %d, session %s", authenticatedUserID, sessionID)
		if err := hub.JoinWatchSession(sessionID, client); err != nil {
			log.Printf("❌ [WebSocketHandler] Failed to join watch session: %v", err)
		} else {
			log.Printf("✅ [WebSocketHandler] Successfully joined watch session %s", sessionID)
		}
	} else {
		log.Printf("⚠️ [WebSocketHandler] sessionID is empty, NOT calling JoinWatchSession")
	}

	// ⚠️ SEAT RESTORATION DISABLED FOR CINEMA
	// The seat restoration logic was causing issues where users from ended sessions would
	// appear seated when a new session started. This logic is only useful for temporary
	// network disconnections, but we don't have a reliable way to distinguish between:
	// 1. Network disconnection (should restore seat)
	// 2. Explicit leave_session or session end (should NOT restore seat)
	//
	// For now, seat restoration is disabled. Users will get a fresh seat assignment each time.
	//
	// TODO: If we want to restore seats for reconnections, we need to:
	// - Add a "disconnect_reason" field to track WHY a member became inactive
	// - Only restore seats if disconnect_reason == "connection_lost" (not "left" or "session_ended")
	// - Clear all seat assignments when a session ends (already implemented above)
	
	/* DISABLED SEAT RESTORATION LOGIC
	var restoredSeatID string
	sessionIDFromQuery := c.Query("session_id")
	log.Printf("🔍 [Reconnection Check] sessionIDFromQuery='%s', watchSession.ID=%d, user=%d", sessionIDFromQuery, watchSession.ID, authenticatedUserID)
	if sessionIDFromQuery != "" && watchSession.ID != 0 {
		var inactiveMember models.WatchSessionMember
		err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
			watchSession.ID, authenticatedUserID, false).
			Order("left_at DESC"). // Get most recent disconnect
			First(&inactiveMember).Error
		
		if err == nil {
			// User was previously in this session! Reactivate them
			log.Printf("🔄 User %d reconnecting to session %s (with session_id param) - reactivating membership", authenticatedUserID, sessionID)
			
			now := time.Now()
			result := DB.Model(&models.WatchSessionMember{}).
				Where("id = ?", inactiveMember.ID).
				Updates(map[string]interface{}{
					"is_active": true,
					"left_at":   nil,
					"joined_at": now, // Update rejoin time
				})
			
			if result.Error != nil {
				log.Printf("⚠️ Failed to reactivate member: %v", result.Error)
			} else {
				log.Printf("✅ Reactivated session membership for user %d", authenticatedUserID)
				
				// ⚠️ DISABLED: Auto-end timer cancellation on host reconnect
				// var room models.Room
				// if err := DB.First(&room, watchSession.RoomID).Error; err == nil {
				// 	if room.HostID == authenticatedUserID {
				// 		hub.hostDisconnectMutex.Lock()
				// 		if disconnectTime, exists := hub.hostDisconnectTimes[sessionID]; exists {
				// 			delete(hub.hostDisconnectTimes, sessionID)
				// 			elapsed := time.Since(disconnectTime)
				// 			remaining := 10*time.Minute - elapsed
				// 			log.Printf("✅ [HOST RECONNECTED] User %d reconnected to session %s", authenticatedUserID, sessionID)
				// 			log.Printf("   ⏱️ Was disconnected for: %.1f seconds (%.1f minutes)", elapsed.Seconds(), elapsed.Minutes())
				// 			log.Printf("   ✅ Auto-end timer CANCELLED (had %.1f minutes remaining)", remaining.Minutes())
				// 		} else {
				// 			log.Printf("ℹ️ [HOST CONNECTED] User %d connected to session %s (no timer was active)", authenticatedUserID, sessionID)
				// 		}
				// 		hub.hostDisconnectMutex.Unlock()
				// 	}
				// }
				
				// Try to restore their previous seat
				hub.seatingMutex.Lock()
				if _, exists := hub.seatingAssignments[roomID]; !exists {
				hub.seatingAssignments[roomID] = make(map[int]map[string]uint)
			}
			if _, exists := hub.seatingAssignments[roomID][1]; !exists {
				hub.seatingAssignments[roomID][1] = make(map[string]uint)
			}
			roomSeats := hub.seatingAssignments[roomID][1]
				// Look for user's previous seat assignment
				for seatID, uID := range roomSeats {
					if uID == authenticatedUserID {
						restoredSeatID = seatID
						log.Printf("🪑 User %d's seat %s is still reserved for them", authenticatedUserID, seatID)
						break
					}
				}
				
				// If seat not found, they'll get auto-assigned by frontend
				if restoredSeatID == "" {
					log.Printf("🪑 User %d's previous seat not found in current assignments - frontend will assign new seat", authenticatedUserID)
				}
				
				hub.seatingMutex.Unlock()
			}
		} else if err != gorm.ErrRecordNotFound {
			log.Printf("⚠️ Error checking for previous membership: %v", err)
		} else {
			// First time joining this session - normal flow (or record was deleted/cleaned up)
			log.Printf("👋 User %d joining session %s for the first time (no inactive record found)", authenticatedUserID, sessionID)
			log.Printf("🔍 [Reconnection] No inactive member record for user %d in session %d", authenticatedUserID, watchSession.ID)
		}
	} else if sessionID != "" && sessionIDFromQuery == "" {
		// Active session exists but user connected to RoomPage (no session_id param)
		// Do NOT reactivate membership - let the auto-end timer continue
		log.Printf("⏸️ User %d connected to RoomPage while session %s exists - NOT reactivating (auto-end timer preserved)", authenticatedUserID, sessionID)
	} else {
		log.Printf("🔍 [Reconnection] Skipped - sessionIDFromQuery='%s', sessionID='%s', watchSession.ID=%d", sessionIDFromQuery, sessionID, watchSession.ID)
	}
	*/
	
	log.Printf("🪑 [Cinema] Seat restoration disabled - user will receive fresh seat assignment")

	// --- COLLECT STARTUP MESSAGES (but DO NOT send yet) ---
	var startupMessages []OutgoingMessage

	// Build session_status (only if there's an active session)
	if sessionID != "" && watchSession.ID != 0 {
		members, err := GetSessionMembers(DB, watchSession.ID)
		if err != nil {
			log.Printf("Failed to fetch session members: %v", err)
			statusMsg := WebSocketMessage{
				Type: "session_status",
				Data: map[string]interface{}{
					"error": "Failed to fetch session members",
				},
			}
			if msgBytes, err := json.Marshal(statusMsg); err == nil {
				startupMessages = append(startupMessages, OutgoingMessage{Data: msgBytes, IsBinary: false})
			}
		} else {
			trimmedMembers := make([]map[string]interface{}, len(members))
			for i, m := range members {
				// ✅ Fetch username AND avatar_url for each member
				var user models.User
				username := fmt.Sprintf("User %d", m.UserID) // Fallback
				avatarURL := "" // Fallback
				if err := DB.Where("id = ?", m.UserID).First(&user).Error; err == nil {
					username = user.Username
					avatarURL = user.AvatarURL
				}
				
				trimmedMembers[i] = map[string]interface{}{
					"id":         m.ID,
					"user_id":    m.UserID,
					"user_role":  m.UserRole,
					"username":   username,
					"avatar_url": avatarURL, // ✅ Include avatar_url
				}
			}

			// Get current seating assignments for this room
			hub.seatingMutex.Lock()
			seatingMap := make(map[string]uint)
			if roomHalls, exists := hub.seatingAssignments[roomID]; exists {
				// Flatten all halls into single seating map (for cinema/theater)
				for _, hallSeats := range roomHalls {
					for seatID, userID := range hallSeats {
						seatingMap[seatID] = userID
					}
				}
			}
			hub.seatingMutex.Unlock()

			// Screen sharing is now handled by LiveKit
			statusMsg := WebSocketMessage{
				Type: "session_status",
				Data: map[string]interface{}{
					"session_id":     watchSession.SessionID,
					"host_id":        watchSession.HostID,
					"members":        trimmedMembers,
					"started_at":     watchSession.StartedAt,
					"seating":        seatingMap, // Include current seating assignments
					"session_title":  watchSession.SessionTitle,
					"is_private":     watchSession.IsPrivate,     // ✅ Session privacy flag
					"content_rating": watchSession.ContentRating, // ✅ Gates LeftSidebar buttons (Bible/Hymn, Game, WatchFrom)
				},
			}
			if msgBytes, err := json.Marshal(statusMsg); err == nil {
				startupMessages = append(startupMessages, OutgoingMessage{Data: msgBytes, IsBinary: false})
			}
		}
	} else {
		// No active session - send empty session_status
		log.Printf("WebSocketHandler: No active session for room %d, sending empty session_status", roomID)
		statusMsg := WebSocketMessage{
			Type: "session_status",
			Data: map[string]interface{}{
				"session_id": nil,
				"host_id":    nil,
				"members":    []interface{}{},
				"started_at": nil,
			},
		}
		if msgBytes, err := json.Marshal(statusMsg); err == nil {
			startupMessages = append(startupMessages, OutgoingMessage{Data: msgBytes, IsBinary: false})
		}
	}

	// Screen sharing startup is now handled by LiveKit

	// ✅ Register client with Hub via register channel (non-blocking)
	// This avoids deadlock by delegating registration to Hub.Run() goroutine
	log.Printf("[WebSocketHandler] 📍 Sending client %p to hub.register channel for room %d (user %d)", client, roomID, authenticatedUserID)
	select {
	case hub.register <- client:
		log.Printf("[WebSocketHandler] ✅ Client %p enqueued for registration", client)
	case <-time.After(100 * time.Millisecond):
		log.Printf("[WebSocketHandler] ⚠️ Hub.register channel blocked, registration may be delayed")
		// Still proceed - Hub.Run() will eventually process it
		hub.register <- client // blocking send as fallback
	}
	
	// ✅ Brief wait to ensure Hub.Run() processes the registration
	time.Sleep(10 * time.Millisecond)

	// ✅ FETCH USERNAME FOR JOIN MESSAGE
	var username string
	if err := DB.Model(&models.User{}).Select("username").Where("id = ?", authenticatedUserID).Scan(&username).Error; err != nil {
		log.Printf("⚠️ Could not fetch username for user %d: %v", authenticatedUserID, err)
		username = "Anonymous"
	}

	// ✅ Broadcast 'participant_join' to OTHER clients in the room
	joinMsg := WebSocketMessage{
		Type: "participant_join",
		Data: map[string]interface{}{
			"userId":   authenticatedUserID,
			"username": username,
		},
	}
	if joinBytes, err := json.Marshal(joinMsg); err == nil {
		hub.BroadcastToRoom(roomID, OutgoingMessage{Data: joinBytes, IsBinary: false}, client) // exclude self
	}

	// --- START PUMPS FIRST ---
	log.Printf("[WebSocketHandler] 🚀 Starting pumps for user %d in room %d, client=%p", authenticatedUserID, roomID, client)
	go func() {
		log.Printf("[writePump] ▶️ STARTED for user %d (client=%p)", client.userID, client)
		client.writePump()
		log.Printf("[writePump] ⏹️ EXITED for user %d (client=%p)", client.userID, client)
	}()
	go func() {
		log.Printf("[readPump] ▶️ STARTED for user %d (client=%p)", client.userID, client)
		client.readPump()
		log.Printf("[readPump] ⏹️ EXITED for user %d (client=%p)", client.userID, client)
	}()

	// --- SEND STARTUP MESSAGES AFTER PUMPS ARE RUNNING ---
	go func() {
		// Small delay to ensure writePump is listening
		time.Sleep(10 * time.Millisecond)
		
		// ✅ Recover from panic if channel is closed during send
		defer func() {
			if r := recover(); r != nil {
				log.Printf("⚠️ Recovered from panic sending startup messages to user %d (client was cleaned up): %v", client.userID, r)
			}
		}()
		
		for _, msg := range startupMessages {
			select {
			case client.send <- msg:
				log.Printf("✅ Sent startup message to user %d", client.userID)
			case <-time.After(100 * time.Millisecond):
				log.Printf("⚠️ Timeout sending startup message to user %d (client likely cleaned up)", client.userID)
				return // Stop trying if we timeout
			}
		}
	}()

	log.Printf("[WebSocketHandler] ✅ Pumps launched for user %d, blocking forever", authenticatedUserID)
	select {}
}

// InitializeHub creates and starts the global hub.
func InitializeHub() {
    if hub == nil {
        hub = NewHub()
        gameWebSocketHandler = games.NewGameWebSocketHandler(DB, hub)
        log.Println("✅ Game WebSocket handler initialized")
        go hub.Run()
        hub.startBroadcastWorkers()
        
        // ⚠️ DISABLED: Host disconnect auto-end checker
        /*
        go func() {
            ticker := time.NewTicker(1 * time.Minute)
            defer ticker.Stop()
            for range ticker.C {
                hub.CheckHostDisconnectTimers()
            }
        }()
        log.Println("✅ Host disconnect auto-end checker started (1-hour grace period)")
        */
        
        // ✅ Start stale session cleanup (runs every hour)
        go func() {
            ticker := time.NewTicker(1 * time.Hour)
            defer ticker.Stop()
            for range ticker.C {
                CleanupStaleSessions()
            }
        }()
        log.Println("✅ Stale session cleanup started (runs hourly, ends sessions >24 hours old)")
    }
}

// GetHub returns the global hub instance for use by other packages
func GetHub() *Hub {
	return hub
}

// BroadcastJSON is a helper method to broadcast JSON data to a room
// This method exists to provide a simpler interface for other packages
func (h *Hub) BroadcastJSON(roomID uint, data map[string]interface{}) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		log.Printf("[Hub] Failed to marshal JSON for room %d: %v", roomID, err)
		return
	}
	
	message := OutgoingMessage{
		Data:     jsonData,
		IsBinary: false,
	}
	
	h.BroadcastToRoom(roomID, message, nil)
}

// CleanupStaleSessions ends watch sessions that have been active for more than 24 hours
// This prevents zombie sessions from persisting indefinitely
func CleanupStaleSessions() {
	log.Println("🧹 [CleanupStaleSessions] Running stale session cleanup...")
	
	var staleSessions []models.WatchSession
	cutoffTime := time.Now().Add(-24 * time.Hour)
	
	// Find sessions that started more than 24 hours ago and are still active
	if err := DB.Where("started_at < ? AND ended_at IS NULL", cutoffTime).Find(&staleSessions).Error; err != nil {
		log.Printf("❌ [CleanupStaleSessions] Error querying stale sessions: %v", err)
		return
	}
	
	if len(staleSessions) == 0 {
		log.Println("✅ [CleanupStaleSessions] No stale sessions found")
	} else {
		log.Printf("🗑️ [CleanupStaleSessions] Found %d stale sessions to clean up", len(staleSessions))

		for _, session := range staleSessions {
			sessionAge := time.Since(session.StartedAt)
			log.Printf("🔚 [CleanupStaleSessions] Ending stale session %s (age: %.1f hours)",
				session.SessionID, sessionAge.Hours())

			now := time.Now()
			if err := DB.Model(&session).Update("ended_at", now).Error; err != nil {
				log.Printf("❌ [CleanupStaleSessions] Failed to end session %s: %v", session.SessionID, err)
				continue
			}

			CleanupLiveShareAssets(session.ID)

			var room models.Room
			isTemporary := false
			if err := DB.First(&room, session.RoomID).Error; err == nil {
				isTemporary = room.IsTemporary
			}

			broadcastMsg := OutgoingMessage{
				Data: []byte(fmt.Sprintf(`{"type":"session_ended","data":{"session_id":"%s","room_id":%d,"reason":"stale_cleanup","is_temporary":%t}}`,
					session.SessionID, session.RoomID, isTemporary)),
				IsBinary: false,
			}
			hub.BroadcastToRoom(session.RoomID, broadcastMsg, nil)

			log.Printf("✅ [CleanupStaleSessions] Ended stale session %s", session.SessionID)
		}

		log.Printf("✅ [CleanupStaleSessions] Cleanup complete - ended %d stale sessions", len(staleSessions))
	}

	// Sweep for members still marked active in sessions that have already ended.
	// Catches goroutine failures during EndWatchSessionHandler background cleanup.
	recentCutoff := time.Now().Add(-7 * 24 * time.Hour)
	var endedSessionIDs []uint
	if err := DB.Model(&models.WatchSession{}).
		Where("ended_at IS NOT NULL AND ended_at > ?", recentCutoff).
		Pluck("id", &endedSessionIDs).Error; err != nil {
		log.Printf("⚠️ [CleanupStaleSessions] Failed to query recently ended sessions: %v", err)
	} else if len(endedSessionIDs) > 0 {
		result := DB.Model(&models.WatchSessionMember{}).
			Where("watch_session_id IN ? AND is_active = ?", endedSessionIDs, true).
			Updates(map[string]interface{}{"is_active": false, "left_at": time.Now()})
		if result.Error != nil {
			log.Printf("⚠️ [CleanupStaleSessions] Failed to clean orphaned session members: %v", result.Error)
		} else if result.RowsAffected > 0 {
			log.Printf("✅ [CleanupStaleSessions] Cleaned up %d orphaned active members for ended sessions", result.RowsAffected)
		}
	}
}

// Helper to create a pointer to an int
func intPtr(i int) *int {
	return &i
}

// Helper to get all user IDs in a room (for targeted broadcasts like user_speaking)
func (h *Hub) GetAllUserIDsInRoom(roomID uint) []uint {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	var userIDs []uint
	roomClients, ok := h.rooms[roomID]
	if ok {
		for client := range roomClients {
			userIDs = append(userIDs, client.userID)
		}
	}
	return userIDs
}

// Helper to get minimum of two integers
func min(a, b int) int {
    if a < b {
        return a
    }
    return b
}


// handleMessage processes incoming messages from the client.
func (client *Client) handleMessage(message []byte) {
	// ✅ Panic recovery to prevent server crashes
	defer func() {
		if r := recover(); r != nil {
			log.Printf("🚨 [handleMessage] PANIC RECOVERED for user %d: %v", client.userID, r)
			log.Printf("📊 [handleMessage] Message: %s", string(message))
		}
	}()
	
    
    var msg WebSocketMessage
    if err := json.Unmarshal(message, &msg); err != nil {
        log.Printf("[handleMessage] ❌ Error unmarshaling message from user %d: %v", client.userID, err)
        return
    }

    log.Printf("[handleMessage] 📋 Message type: '%s' from user %d", msg.Type, client.userID)

    // ✅ Handle call-related messages (lobby only, roomID = 0)
    if client.roomID == 0 {
        switch msg.Type {
        case "call_initiate", "call_accept", "call_decline", "call_cancel", "call_end":
            HandleCallMessage(client, msg)
            return
        }
    }
    // ✅ Handle game-related messages
    // ✅ Handle game-related messages
    if msg.Type == "game" || msg.Type == "start_game" || msg.Type == "make_move" || msg.Type == "end_game" {
        // Convert msg.Data to map
        if dataMap, ok := msg.Data.(map[string]interface{}); ok {
            // Inject action from message type if not present
            if _, hasAction := dataMap["action"]; !hasAction && msg.Type != "game" {
                dataMap["action"] = msg.Type
            }
            gameWebSocketHandler.HandleGameMessage(interface{}(client), dataMap)
            return
        }
        log.Printf("⚠️ [handleMessage] Invalid game message data")
        return
    }
	
	// ✅ Handle LiveShare messages
	if strings.HasPrefix(msg.Type, "liveshare_") {
		log.Printf("🎬 [LiveShare] Handling message type: %s from user %d", msg.Type, client.userID)
		
		// Convert msg.Data to map
		var dataMap map[string]interface{}
		if m, ok := msg.Data.(map[string]interface{}); ok {
			dataMap = m
		} else {
			// Try unmarshaling if it's still raw JSON
			if err := json.Unmarshal(message, &dataMap); err != nil {
				log.Printf("⚠️ [LiveShare] Invalid message data: %v", err)
				return
			}
		}
		
		// Route to LiveShare handler
		if err := liveShareHandler.HandleMessage(msg.Type, dataMap, client); err != nil {
			log.Printf("❌ [LiveShare] Handler error: %v", err)
			// Optionally send error back to client
			errorMsg := map[string]interface{}{
				"type":  "liveshare_error",
				"error": err.Error(),
			}
			if errBytes, _ := json.Marshal(errorMsg); errBytes != nil {
				select {
				case client.send <- OutgoingMessage{Data: errBytes, IsBinary: false}:
				default:
					log.Printf("⚠️ [LiveShare] Failed to send error to client (buffer full)")
				}
			}
		}
		return
	}
	
	if msg.Type == "client_ready" {
        log.Printf("Client %d sent client_ready for room %d", client.userID, client.roomID)

        // Fetch active session
        var watchSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&watchSession).Error; err != nil {
            log.Printf("No active session for room %d: %v", client.roomID, err)
            // Still send session_status with null session_id
            watchSession = models.WatchSession{}
        }

        // Fetch members
        members, err := GetSessionMembers(DB, watchSession.ID)
        if err != nil {
            log.Printf("Failed to fetch members for session %s: %v", watchSession.SessionID, err)
            members = []models.WatchSessionMember{}
        }

        // Get current seating assignments for this room
        client.hub.seatingMutex.Lock()
        seatingMap := make(map[string]uint)
        if roomHalls, exists := client.hub.seatingAssignments[client.roomID]; exists {
            // Flatten all halls into single seating map
            for _, hallSeats := range roomHalls {
                for seatID, userID := range hallSeats {
                    seatingMap[seatID] = userID
                }
            }
        }
        client.hub.seatingMutex.Unlock()
        log.Printf("🪑 [client_ready] Sending seating assignments to user %d: %+v", client.userID, seatingMap)

        // Build set of active user IDs currently connected to this room
        activeUserIDs := make(map[uint]bool)
        client.hub.mutex.RLock()
        if roomClients, ok := client.hub.rooms[client.roomID]; ok {
            for c := range roomClients {
                activeUserIDs[c.userID] = true
            }
        }
        client.hub.mutex.RUnlock()
        log.Printf("🪑 [client_ready] Active users in room %d: %+v", client.roomID, activeUserIDs)

        // ✅ FILTER members array to only include active WebSocket clients
        activeMembers := []models.WatchSessionMember{}
        for _, member := range members {
            if activeUserIDs[member.UserID] {
                activeMembers = append(activeMembers, member)
            } else {
                log.Printf("⚠️ [client_ready] Skipping inactive member %d from members list", member.UserID)
            }
        }
        log.Printf("✅ [client_ready] Filtered members: %d active out of %d total", len(activeMembers), len(members))

        // Build usernames map for seated users - ONLY include active users
        seatedUsernames := make(map[uint]string)
        filteredSeatingMap := make(map[string]uint)
        for seatID, userID := range seatingMap {
            if !activeUserIDs[userID] {
                log.Printf("⚠️ [client_ready] Skipping inactive user %d from seating (seat %s)", userID, seatID)
                continue
            }
            filteredSeatingMap[seatID] = userID
            var user models.User
            if err := DB.First(&user, userID).Error; err == nil {
                seatedUsernames[userID] = user.Username
            } else {
                seatedUsernames[userID] = fmt.Sprintf("User%d", userID)
            }
        }
        log.Printf("🪑 [client_ready] Filtered seated usernames (active only): %+v", seatedUsernames)

        // Build session_status (screen sharing handled by LiveKit)
        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id":       watchSession.SessionID,
                "host_id":          watchSession.HostID,
                "members":          activeMembers, // ✅ Send FILTERED active members only
                "started_at":       watchSession.StartedAt,
                "seating":          filteredSeatingMap, // Include FILTERED seating assignments (active users only)
                "seated_usernames": seatedUsernames,    // Include usernames for seated users (active only)
                "discussion_mode":  watchSession.DiscussionMode, // Include discussion mode state
                "current_media_url": watchSession.CurrentMediaURL, // Lecture hall media state
                "current_media_type": watchSession.CurrentMediaType,
                "is_screen_sharing_active": watchSession.IsScreenSharingActive,
                "sharing_source": watchSession.SharingSource,
                "session_title": watchSession.SessionTitle,
                "content_rating": watchSession.ContentRating, // ✅ Include content rating for button filtering
            },
        }

        if msgBytes, err := json.Marshal(statusMsg); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: msgBytes, IsBinary: false}:
                log.Printf("Sent session_status to client %d", client.userID)
            default:
                log.Printf("Dropped session_status for client %d (buffer full)", client.userID)
            }
        }

        // ✅ Check mute-all state and auto-mute new joiners (if not host)
        if watchSession.SessionID != "" {
            client.hub.muteAllMutex.RLock()
            isMuteAllActive := client.hub.sessionMuteAllState[watchSession.SessionID]
            client.hub.muteAllMutex.RUnlock()

            if isMuteAllActive {
                // Check if this user is the host
                var room models.Room
                isHost := false
                if err := DB.First(&room, client.roomID).Error; err == nil {
                    isHost = (room.HostID == client.userID)
                }

                // Only send force_mute to non-host users
                if !isHost {
                    log.Printf("🔇 [client_ready] Mute-all is active for session %s - sending force_mute to user %d", watchSession.SessionID, client.userID)
                    
                    forceMuteMsg := WebSocketMessage{
                        Type: "force_mute",
                        Data: map[string]interface{}{
                            "hostId": watchSession.HostID,
                        },
                    }

                    if forceMuteBytes, err := json.Marshal(forceMuteMsg); err == nil {
                        select {
                        case client.send <- OutgoingMessage{Data: forceMuteBytes, IsBinary: false}:
                            log.Printf("🔇 [client_ready] Sent force_mute to new joiner %d", client.userID)
                        default:
                            log.Printf("🔇 [client_ready] Dropped force_mute for client %d (buffer full)", client.userID)
                        }
                    }
                }
            }
        }

        // ALSO: send authoritative seat assignments for this room (seats_auto_assigned)
        // Build user->seat map from seatingAssignments (seatId -> userID)
        h := client.hub
        userSeats := make(map[string]string)
        h.seatingMutex.RLock()
        log.Printf("🪑 [seats_auto_assigned] Building seat map for room %d. seatingAssignments: %+v", 
            client.roomID, h.seatingAssignments[client.roomID])
        if roomHalls, exists := h.seatingAssignments[client.roomID]; exists {
            // Flatten all halls
            for _, hallSeats := range roomHalls {
                for seatID, userID := range hallSeats {
                    // Only include active users
                    if !activeUserIDs[userID] {
                        log.Printf("⚠️ [seats_auto_assigned] Skipping inactive user %d from seat %s", userID, seatID)
                        continue
                    }
                    // use numeric userID as string key so JSON keys are strings in JS
                    userSeats[fmt.Sprintf("%d", userID)] = seatID
                }
            }
            log.Printf("🪑 [seats_auto_assigned] Built userSeats map (active only): %+v", userSeats)
        } else {
            log.Printf("⚠️ [seats_auto_assigned] No seating assignments found for room %d", client.roomID)
        }
        h.seatingMutex.RUnlock()

        // Also include usernames AND avatar URLs for currently seated users (help frontend show labels even when session members list is empty)
        usernames := make(map[string]string)
        avatarURLs := make(map[string]string)
        for uidStr := range userSeats {
            // parse uidStr back to uint
            if uidStr == "" {
                continue
            }
            uid64, err := strconv.ParseUint(uidStr, 10, 64)
            if err != nil {
                continue
            }
            var user models.User
            if err := DB.First(&user, uint(uid64)).Error; err == nil {
                usernames[uidStr] = user.Username
                avatarURLs[uidStr] = user.AvatarURL
            } else {
                usernames[uidStr] = fmt.Sprintf("User%d", uid64)
                avatarURLs[uidStr] = ""
            }
        }

        seatsMsg := WebSocketMessage{
            Type: "seats_auto_assigned",
            Data: map[string]interface{}{
                "user_seats": userSeats,
                "usernames": usernames,
                "avatar_urls": avatarURLs,
            },
        }
        if seatsBytes, err := json.Marshal(seatsMsg); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: seatsBytes, IsBinary: false}:
                log.Printf("Sent seats_auto_assigned to client %d", client.userID)
            default:
                log.Printf("Dropped seats_auto_assigned for client %d (buffer full)", client.userID)
            }
        }

        // Optional: send ack
        ackMsg := WebSocketMessage{Type: "client_ready_ack"}
        if ackBytes, err := json.Marshal(ackMsg); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
            default:
                // silently drop if buffer full
                log.Printf("buffer full dropping")
            }
        }
        return // ✅ Important: stop here
    }

    // ✅ Handle request_seat_state: re-send fresh seat data (for periodic refresh)
    if msg.Type == "request_seat_state" {
        log.Printf("🔄 [request_seat_state] Client %d requested seat state refresh for room %d", client.userID, client.roomID)

        // Get current seating assignments for this room
        client.hub.seatingMutex.Lock()
        seatingMap := make(map[string]uint)
        if roomHalls, exists := client.hub.seatingAssignments[client.roomID]; exists {
            // Flatten all halls into single seating map
            for _, hallSeats := range roomHalls {
                for seatID, userID := range hallSeats {
                    seatingMap[seatID] = userID
                }
            }
        }
        client.hub.seatingMutex.Unlock()

        // Build set of active user IDs currently connected to this room
        activeUserIDs := make(map[uint]bool)
        client.hub.mutex.RLock()
        if roomClients, ok := client.hub.rooms[client.roomID]; ok {
            for c := range roomClients {
                activeUserIDs[c.userID] = true
            }
        }
        client.hub.mutex.RUnlock()

        // Build usernames and avatar_urls map for seated users - ONLY include active users
        seatedUsernames := make(map[uint]string)
        seatedAvatarURLs := make(map[uint]string)
        filteredSeatingMap := make(map[string]uint)
        for seatID, userID := range seatingMap {
            if !activeUserIDs[userID] {
                log.Printf("⚠️ [request_seat_state] Skipping inactive user %d from seating (seat %s)", userID, seatID)
                continue
            }
            filteredSeatingMap[seatID] = userID
            var user models.User
            if err := DB.First(&user, userID).Error; err == nil {
                seatedUsernames[userID] = user.Username
                seatedAvatarURLs[userID] = user.AvatarURL
            } else {
                seatedUsernames[userID] = fmt.Sprintf("User%d", userID)
                seatedAvatarURLs[userID] = ""
            }
        }

        // 🐛 DEBUG: Log what we're sending
        log.Printf("🔍 [request_seat_state] Active users in room %d: %d users", client.roomID, len(activeUserIDs))
        log.Printf("🔍 [request_seat_state] Filtered seating map: %d seats", len(filteredSeatingMap))
        
        // Send refreshed seat state
        refreshMsg := WebSocketMessage{
            Type: "seat_state_refresh",
            Data: map[string]interface{}{
                "seating":          filteredSeatingMap,
                "seated_usernames": seatedUsernames,
                "avatar_urls":      seatedAvatarURLs,
            },
        }

        if msgBytes, err := json.Marshal(refreshMsg); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: msgBytes, IsBinary: false}:
                log.Printf("🔄 [request_seat_state] Sent seat_state_refresh to client %d with %d seats", client.userID, len(filteredSeatingMap))
            default:
                log.Printf("⚠️ [request_seat_state] Dropped seat_state_refresh for client %d (buffer full)", client.userID)
            }
        }
        return
    }

    // Handle user_speaking - Audio routing with recipient filtering (from useLectureHallAudio hook)
    if msg.Type == "user_speaking" {
        var speakingData struct {
            UserID         uint     `json:"user_id"`
            Speaking       bool     `json:"speaking"`
            Recipients     []string `json:"recipients"` // Array of user ID strings
            BroadcastScope string   `json:"broadcast_scope"`
            DiscussionMode bool     `json:"discussion_mode"`
            SessionID      string   `json:"session_id"`
        }

        // Parse data from msg.Data
        if m, ok := msg.Data.(map[string]interface{}); ok {
            if uid, ok := m["user_id"].(float64); ok {
                speakingData.UserID = uint(uid)
            }
            if speaking, ok := m["speaking"].(bool); ok {
                speakingData.Speaking = speaking
            }
            if recipients, ok := m["recipients"].([]interface{}); ok {
                for _, r := range recipients {
                    if recipientStr, ok := r.(string); ok {
                        speakingData.Recipients = append(speakingData.Recipients, recipientStr)
                    }
                }
            }
            if scope, ok := m["broadcast_scope"].(string); ok {
                speakingData.BroadcastScope = scope
            }
            if dm, ok := m["discussion_mode"].(bool); ok {
                speakingData.DiscussionMode = dm
            }
            if sid, ok := m["session_id"].(string); ok {
                speakingData.SessionID = sid
            }
        }

        log.Printf("[user_speaking] 🎤 User %d speaking=%v scope=%s discussion=%v recipients=%d", 
            speakingData.UserID, speakingData.Speaking, speakingData.BroadcastScope, 
            speakingData.DiscussionMode, len(speakingData.Recipients))

        // Convert recipient strings to uint array
        recipientIDs := make([]uint, 0, len(speakingData.Recipients))
        for _, recipientStr := range speakingData.Recipients {
            var uid uint64
            if _, err := fmt.Sscanf(recipientStr, "%d", &uid); err == nil {
                recipientIDs = append(recipientIDs, uint(uid))
            }
        }

        // Send to specified recipients (frontend calculated who should hear this user)
        if len(recipientIDs) > 0 {
            client.hub.BroadcastToUsers(recipientIDs, OutgoingMessage{
                Data:     message,
                IsBinary: false,
            })
            log.Printf("[user_speaking] 📢 Broadcasted to %d recipients (scope: %s)", 
                len(recipientIDs), speakingData.BroadcastScope)
        }
        return
    }

    // Handle request_audio_states - new joiner requests current audio states from all members
    if msg.Type == "request_audio_states" {
        log.Printf("🎤 [request_audio_states] Received from user %d in room %d", client.userID, client.roomID)
        
        // Broadcast to all users in room to send their current audio state
        broadcastMsg := WebSocketMessage{
            Type: "broadcast_audio_state",
            Data: map[string]interface{}{
                "requester_id": client.userID,
            },
        }

        broadcastBytes, err := json.Marshal(broadcastMsg)
        if err != nil {
            log.Printf("🎤 [request_audio_states] ❌ Failed to marshal broadcast message: %v", err)
            return
        }

        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{
            Data: broadcastBytes,
            IsBinary: false,
        }, client) // Exclude requester from broadcast

        log.Printf("🎤 [request_audio_states] ✅ Broadcasted to room %d", client.roomID)
        return
    }

    // Inside handleMessage in websocket.go
    if msg.Type == "user_audio_state" {
        log.Printf("[audio] 🔍 Received user_audio_state message")
        log.Printf("[audio] 🔍 msg.Data type: %T, value: %+v", msg.Data, msg.Data)
        log.Printf("[audio] 🔍 msg.UserID: %d", msg.UserID)
        
        var audioData struct {
            UserID            uint   `json:"userId"`
            IsAudioActive     bool   `json:"isAudioActive"`
            IsSeatedMode      bool   `json:"isSeatedMode"`
            IsGlobalBroadcast bool   `json:"isGlobalBroadcast"`
            Row               *int   `json:"row"` // nullable
        }

        // Try unmarshaling the entire message again to get all fields
        if err := json.Unmarshal(message, &audioData); err != nil {
            log.Printf("[audio] ❌ Failed to unmarshal audio data: %v", err)
            return
        }
        
        log.Printf("[audio] ✅ Parsed audioData: %+v", audioData)

        // 🔊 Decide who receives the audio state
        recipients := []uint{}

        if !audioData.IsSeatedMode || audioData.IsGlobalBroadcast {
            // Broadcast to ALL users in room
            recipients = client.hub.GetAllUserIDsInRoom(client.roomID)
        } else if audioData.Row != nil {
            // Only send to users in the same row
            // TODO: Fetch user IDs in same row from seats or userSeats table
            recipients = client.hub.GetUserIDsInRow(client.roomID, *audioData.Row)
        }

        // Send only to relevant users
        if len(recipients) > 0 {
            // Reuse original message bytes to avoid re-encoding
            client.hub.BroadcastToUsers(recipients, OutgoingMessage{
                Data: message, // original raw JSON
                IsBinary: false,
            })
        }
        return // ✅ Do NOT broadcast to whole room
    }

    // Handle mute_all_members - host mutes all non-host participants (toggle ON)
    if msg.Type == "mute_all_members" {
        log.Printf("🔇 [mute_all_members] Received from user %d in room %d", client.userID, client.roomID)
        
        // Extract hostId, sessionId, and exemptGuestId from message
        var muteData struct {
            HostID        uint   `json:"hostId"`
            SessionID     string `json:"sessionId"`
            ExemptGuestID uint   `json:"exemptGuestId"` // 🆕 Guest to exempt from mute
        }
        if err := json.Unmarshal(message, &muteData); err != nil {
            log.Printf("🔇 [mute_all_members] ❌ Failed to unmarshal mute data: %v", err)
            return
        }

        // Verify sender is the host
        if muteData.HostID != client.userID {
            log.Printf("🔇 [mute_all_members] ❌ User %d attempted to mute all but is not the host (%d)", client.userID, muteData.HostID)
            return
        }

        // ✅ Persist mute-all state for this session
        if muteData.SessionID != "" {
            client.hub.muteAllMutex.Lock()
            client.hub.sessionMuteAllState[muteData.SessionID] = true
            client.hub.muteAllMutex.Unlock()
            log.Printf("🔇 [mute_all_members] ✅ Persisted mute-all state for session %s", muteData.SessionID)
        }

        // Get all user IDs in room except host
        client.hub.mutex.RLock()
        roomClients, exists := client.hub.rooms[client.roomID]
        client.hub.mutex.RUnlock()
        
        if !exists {
            log.Printf("🔇 [mute_all_members] ⚠️ Room %d not found", client.roomID)
            return
        }

        // Build list of participants (exclude host AND exempt guest)
        recipientIDs := []uint{}
        for c := range roomClients {
            // 🆕 Skip both host and exempt guest
            if c.userID != muteData.HostID && c.userID != muteData.ExemptGuestID {
                recipientIDs = append(recipientIDs, c.userID)
            }
        }
        
        if muteData.ExemptGuestID > 0 {
            log.Printf("🔇 [mute_all_members] Exempt guest ID: %d, muting %d other users", muteData.ExemptGuestID, len(recipientIDs))
        }

        if len(recipientIDs) == 0 {
            log.Printf("🔇 [mute_all_members] No non-host participants to mute in room %d", client.roomID)
            // Still send ack to host
        }

        // Broadcast force_mute to all non-host participants
        forceMuteMsg := WebSocketMessage{
            Type: "force_mute",
            Data: map[string]interface{}{
                "hostId": muteData.HostID,
            },
        }

        forceMuteBytes, err := json.Marshal(forceMuteMsg)
        if err != nil {
            log.Printf("🔇 [mute_all_members] ❌ Failed to marshal force_mute message: %v", err)
            return
        }

        if len(recipientIDs) > 0 {
            client.hub.BroadcastToUsers(recipientIDs, OutgoingMessage{
                Data: forceMuteBytes,
                IsBinary: false,
            })
        }

        log.Printf("🔇 [mute_all_members] ✅ Broadcasted force_mute to %d participants in room %d", len(recipientIDs), client.roomID)
        return
    }

    // Handle unmute_all_members - host unmutes all participants (toggle OFF)
    if msg.Type == "unmute_all_members" {
        log.Printf("🔊 [unmute_all_members] Received from user %d in room %d", client.userID, client.roomID)
        
        // Extract hostId and sessionId from message
        var unmuteData struct {
            HostID    uint   `json:"hostId"`
            SessionID string `json:"sessionId"`
        }
        if err := json.Unmarshal(message, &unmuteData); err != nil {
            log.Printf("🔊 [unmute_all_members] ❌ Failed to unmarshal unmute data: %v", err)
            return
        }

        // Verify sender is the host
        if unmuteData.HostID != client.userID {
            log.Printf("🔊 [unmute_all_members] ❌ User %d attempted to unmute all but is not the host (%d)", client.userID, unmuteData.HostID)
            return
        }

        // ✅ Clear mute-all state for this session
        if unmuteData.SessionID != "" {
            client.hub.muteAllMutex.Lock()
            delete(client.hub.sessionMuteAllState, unmuteData.SessionID)
            client.hub.muteAllMutex.Unlock()
            log.Printf("🔊 [unmute_all_members] ✅ Cleared mute-all state for session %s", unmuteData.SessionID)
        }

        // Get all user IDs in room except host
        client.hub.mutex.RLock()
        roomClients, exists := client.hub.rooms[client.roomID]
        client.hub.mutex.RUnlock()
        
        if !exists {
            log.Printf("🔊 [unmute_all_members] ⚠️ Room %d not found", client.roomID)
            return
        }

        // Build list of non-host participants
        recipientIDs := []uint{}
        for c := range roomClients {
            if c.userID != unmuteData.HostID {
                recipientIDs = append(recipientIDs, c.userID)
            }
        }

        if len(recipientIDs) == 0 {
            log.Printf("🔊 [unmute_all_members] No non-host participants to unmute in room %d", client.roomID)
            return
        }

        // Broadcast unlock_mute to all non-host participants
        unlockMuteMsg := WebSocketMessage{
            Type: "unlock_mute",
            Data: map[string]interface{}{
                "hostId": unmuteData.HostID,
            },
        }

        unlockMuteBytes, err := json.Marshal(unlockMuteMsg)
        if err != nil {
            log.Printf("🔊 [unmute_all_members] ❌ Failed to marshal unlock_mute message: %v", err)
            return
        }

        client.hub.BroadcastToUsers(recipientIDs, OutgoingMessage{
            Data: unlockMuteBytes,
            IsBinary: false,
        })

        log.Printf("🔊 [unmute_all_members] ✅ Broadcasted unlock_mute to %d participants in room %d", len(recipientIDs), client.roomID)
        return
    }

    // Handle unmute_member - host unmutes a specific member
    if msg.Type == "unmute_member" {
        log.Printf("🔊 [unmute_member] Received from user %d in room %d", client.userID, client.roomID)
        
        var unmuteMemberData struct {
            HostID       uint `json:"hostId"`
            TargetUserID uint `json:"targetUserId"`
        }
        if err := json.Unmarshal(message, &unmuteMemberData); err != nil {
            log.Printf("🔊 [unmute_member] ❌ Failed to unmarshal data: %v", err)
            return
        }

        // Verify sender is the host
        if unmuteMemberData.HostID != client.userID {
            log.Printf("🔊 [unmute_member] ❌ User %d attempted to unmute but is not the host (%d)", client.userID, unmuteMemberData.HostID)
            return
        }

        // Send unlock_mute to target user
        unlockMuteMsg := WebSocketMessage{
            Type: "unlock_mute",
            Data: map[string]interface{}{
                "hostId": unmuteMemberData.HostID,
            },
        }

        unlockMuteBytes, err := json.Marshal(unlockMuteMsg)
        if err != nil {
            log.Printf("🔊 [unmute_member] ❌ Failed to marshal unlock_mute message: %v", err)
            return
        }

        client.hub.BroadcastToUsers([]uint{unmuteMemberData.TargetUserID}, OutgoingMessage{
            Data:     unlockMuteBytes,
            IsBinary: false,
        })

        log.Printf("🔊 [unmute_member] ✅ Sent unlock_mute to user %d", unmuteMemberData.TargetUserID)
        return
    }

    // Handle raise_hand - member raises hand to speak
    if msg.Type == "raise_hand" {
        log.Printf("✋ [raise_hand] Received from user %d in room %d", client.userID, client.roomID)
        
        var raiseHandData struct {
            UserID   uint   `json:"userId"`
            Username string `json:"username"`
        }
        if err := json.Unmarshal(message, &raiseHandData); err != nil {
            log.Printf("✋ [raise_hand] ❌ Failed to unmarshal data: %v", err)
            return
        }

        // Broadcast to all room members
        raiseHandMsg := WebSocketMessage{
            Type: "hand_raised",
            Data: map[string]interface{}{
                "userId":   raiseHandData.UserID,
                "username": raiseHandData.Username,
            },
        }

        raiseHandBytes, err := json.Marshal(raiseHandMsg)
        if err != nil {
            log.Printf("✋ [raise_hand] ❌ Failed to marshal message: %v", err)
            return
        }

        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{
            Data:     raiseHandBytes,
            IsBinary: false,
        }, client)

        log.Printf("✋ [raise_hand] ✅ Broadcasted hand_raised for user %d (%s)", raiseHandData.UserID, raiseHandData.Username)
        return
    }

    // Handle lower_hand - member lowers hand
    if msg.Type == "lower_hand" {
        log.Printf("👋 [lower_hand] Received from user %d in room %d", client.userID, client.roomID)
        
        var lowerHandData struct {
            UserID uint `json:"userId"`
        }
        if err := json.Unmarshal(message, &lowerHandData); err != nil {
            log.Printf("👋 [lower_hand] ❌ Failed to unmarshal data: %v", err)
            return
        }

        // Broadcast to all room members
        lowerHandMsg := WebSocketMessage{
            Type: "hand_lowered",
            Data: map[string]interface{}{
                "userId": lowerHandData.UserID,
            },
        }

        lowerHandBytes, err := json.Marshal(lowerHandMsg)
        if err != nil {
            log.Printf("👋 [lower_hand] ❌ Failed to marshal message: %v", err)
            return
        }

        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{
            Data:     lowerHandBytes,
            IsBinary: false,
        }, client)

        log.Printf("👋 [lower_hand] ✅ Broadcasted hand_lowered for user %d", lowerHandData.UserID)
        return
    }

    // Handle emote - member sends an emote
    if msg.Type == "emote" {
        log.Printf("😊 [emote] Received from user %d in room %d", client.userID, client.roomID)
        
        var emoteData struct {
            UserID    uint   `json:"userId"`
            Username  string `json:"username"`
            Emote     string `json:"emote"`
            Timestamp int64  `json:"timestamp"`
        }

        if err := json.Unmarshal(message, &emoteData); err != nil {
            log.Printf("😊 [emote] ❌ Failed to unmarshal data: %v", err)
            return
        }

        // Broadcast emote to all members in the room
        emoteMsg := WebSocketMessage{
            Type: "emote",
            Data: map[string]interface{}{
                "userId":    emoteData.UserID,
                "username":  emoteData.Username,
                "emote":     emoteData.Emote,
                "timestamp": emoteData.Timestamp,
            },
        }

        emoteBytes, err := json.Marshal(emoteMsg)
        if err != nil {
            log.Printf("😊 [emote] ❌ Failed to marshal message: %v", err)
            return
        }

        // Broadcast to all users in the room (including sender for consistency)
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{
            Data:     emoteBytes,
            IsBinary: false,
        }, client)

        log.Printf("😊 [emote] ✅ Broadcasted emote '%s' from user %d", emoteData.Emote, emoteData.UserID)
        return
    }

    // Handle toggle_preview_generation - host toggles preview thumbnail generation (content moderation)
    if msg.Type == "toggle_preview_generation" {
        log.Printf("🖼️ [toggle_preview_generation] Received from user %d in room %d", client.userID, client.roomID)
        
        // Extract enabled and session_id from message data
        var previewToggleData struct {
            SessionID string `json:"session_id"`
            Enabled   bool   `json:"enabled"`
        }
        
        if dataMap, ok := msg.Data.(map[string]interface{}); ok {
            if sessionID, ok := dataMap["session_id"].(string); ok {
                previewToggleData.SessionID = sessionID
            }
            if enabled, ok := dataMap["enabled"].(bool); ok {
                previewToggleData.Enabled = enabled
            }
        }

        if previewToggleData.SessionID == "" {
            log.Printf("🖼️ [toggle_preview_generation] ❌ Missing session_id")
            return
        }

        // Verify user is the host of this session
        var session models.WatchSession
        if err := DB.Where("session_id = ?", previewToggleData.SessionID).First(&session).Error; err != nil {
            log.Printf("🖼️ [toggle_preview_generation] ❌ Session not found: %v", err)
            return
        }

        if session.HostID != client.userID {
            log.Printf("🖼️ [toggle_preview_generation] ❌ User %d is not the host of session %s (host: %d)", 
                client.userID, previewToggleData.SessionID, session.HostID)
            return
        }

        // Update preview_enabled in database
        if err := DB.Model(&models.WatchSession{}).
            Where("session_id = ?", previewToggleData.SessionID).
            Update("preview_enabled", previewToggleData.Enabled).Error; err != nil {
            log.Printf("🖼️ [toggle_preview_generation] ❌ Failed to update preview_enabled: %v", err)
            return
        }

        log.Printf("🖼️ [toggle_preview_generation] ✅ Updated preview_enabled=%v for session %s", 
            previewToggleData.Enabled, previewToggleData.SessionID)

        if !previewToggleData.Enabled {
            // Stop refresh timer and clear existing preview
            previewQueue := services.GetPreviewQueue()
            if previewQueue != nil {
                previewQueue.StopRefreshTimer(previewToggleData.SessionID)
                previewQueue.ClearSessionPreview(previewToggleData.SessionID)
                log.Printf("🖼️ [toggle_preview_generation] ✅ Stopped preview generation and cleared existing preview for session %s", 
                    previewToggleData.SessionID)
            }
        } else {
            // Re-enable: start fresh generation if media is active
            previewQueue := services.GetPreviewQueue()
            if previewQueue != nil && session.CurrentMediaURL != "" {
                previewQueue.StartRefreshTimer(previewToggleData.SessionID)
                log.Printf("🖼️ [toggle_preview_generation] ✅ Re-enabled preview generation for session %s", 
                    previewToggleData.SessionID)
            }
        }

        return
    }

    // Handle seating_mode_toggle - auto-assign seats when enabled
    if msg.Type == "seating_mode_toggle" {
        log.Printf("🪑 [seating_mode_toggle] Received from user %d in room %d", client.userID, client.roomID)
        
        // ✅ Parse the entire message again to get the "enabled" field at root level
        var toggle struct {
            Type    string `json:"type"`
            Enabled bool   `json:"enabled"`
        }
        
        if err := json.Unmarshal(message, &toggle); err != nil {
            log.Printf("🪑 [seating_mode_toggle] ❌ Failed to unmarshal toggle message: %v", err)
            return
        }

        log.Printf("🪑 [seating_mode_toggle] Enabled = %v", toggle.Enabled)

        h := client.hub
        
        if toggle.Enabled {
            log.Printf("🪑 [seating_mode_toggle] Seating mode enabled, attempting auto-assignment for room %d", client.roomID)
            
            // ✅ Get CURRENTLY CONNECTED users from hub.rooms instead of database
            h.mutex.RLock()
            roomClients, exists := h.rooms[client.roomID]
            h.mutex.RUnlock()
            
            if !exists || len(roomClients) == 0 {
                log.Printf("🪑 [seating_mode_toggle] ❌ No connected clients in room %d", client.roomID)
                return
            }

            // Collect unique user IDs from connected clients
            userIDs := make([]uint, 0, len(roomClients))
            seen := make(map[uint]bool)
            for c := range roomClients {
                if !seen[c.userID] {
                    userIDs = append(userIDs, c.userID)
                    seen[c.userID] = true
                }
            }

            log.Printf("🪑 [seating_mode_toggle] ✅ Found %d connected users in room %d", len(userIDs), client.roomID)

            // Auto-assign seats in order (A1=0-0, A2=0-1, A3=0-2, A4=0-3, A5=0-4, B1=1-0, etc.)
            h.seatingMutex.Lock()
            if _, exists := h.seatingAssignments[client.roomID]; !exists {
                h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
            }
            
            // Initialize hall 1 for cinema/theater (no overflow)
            if _, exists := h.seatingAssignments[client.roomID][1]; !exists {
                h.seatingAssignments[client.roomID][1] = make(map[string]uint)
            }
            
            // Clear existing assignments for this room's hall 1
            h.seatingAssignments[client.roomID][1] = make(map[string]uint)
            
            // Assign seats in order to connected users
            for i, userID := range userIDs {
                row := i / 5  // Row 0 = A, Row 1 = B, etc.
                col := i % 5  // Column 0-4 = positions 1-5
                seatID := fmt.Sprintf("%d-%d", row, col)
                h.seatingAssignments[client.roomID][1][seatID] = userID
                log.Printf("🪑 [seating_mode_toggle] Assigned seat %s to user %d", seatID, userID)
            }
            h.seatingMutex.Unlock()

            log.Printf("🪑 [seating_mode_toggle] Total seats assigned: %d", len(h.seatingAssignments[client.roomID][1]))

            // Build userSeats map for broadcast
            userSeats := make(map[uint]string)
            for seatID, userID := range h.seatingAssignments[client.roomID][1] {
                userSeats[userID] = seatID
            }

            log.Printf("🪑 [seating_mode_toggle] Broadcasting userSeats: %+v", userSeats)

            // Broadcast seat assignments to all users
            assignmentMsg := map[string]interface{}{
                "type":       "seats_auto_assigned",
                "user_seats": userSeats,
            }
            if msgBytes, err := json.Marshal(assignmentMsg); err == nil {
                log.Printf("🪑 [seating_mode_toggle] ✅ Broadcasting seats_auto_assigned to room %d", client.roomID)
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
            } else {
                log.Printf("🪑 [seating_mode_toggle] ❌ Failed to marshal assignment message: %v", err)
            }
        } else {
            log.Printf("🪑 [seating_mode_toggle] Seating mode disabled, clearing seats for room %d", client.roomID)
            
            // Clear seat assignments when seating mode is disabled
            h.seatingMutex.Lock()
            delete(h.seatingAssignments, client.roomID)
            h.seatingMutex.Unlock()

            log.Printf("🪑 [seating_mode_toggle] ✅ Cleared seat assignments")

            // Broadcast clear message
            clearMsg := map[string]interface{}{
                "type": "seats_cleared",
            }
            if msgBytes, err := json.Marshal(clearMsg); err == nil {
                log.Printf("🪑 [seating_mode_toggle] ✅ Broadcasting seats_cleared to room %d", client.roomID)
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
            }
        }
        
        return
    }

    if msg.Type == "seat_assignment" {
        var assign struct {
            SeatId string `json:"seatId"` // e.g., "2-3"
            UserID uint   `json:"userId"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &assign)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            assign.SeatId = m["seatId"].(string)
            assign.UserID = uint(m["userId"].(float64))
        }

        // Update seating map
        h := client.hub
        h.seatingMutex.Lock()
        if _, exists := h.seatingAssignments[client.roomID]; !exists {
            h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
        }
        if _, exists := h.seatingAssignments[client.roomID][1]; !exists {
            h.seatingAssignments[client.roomID][1] = make(map[string]uint)
        }
        h.seatingAssignments[client.roomID][1][assign.SeatId] = assign.UserID
        h.seatingMutex.Unlock()

        log.Printf("Seat assigned: room=%d, seat=%s, user=%d", client.roomID, assign.SeatId, assign.UserID)
        return // Don't broadcast
    }

    // ✅ Handle request_seat - backend assigns first available seat (RACE-CONDITION PROOF)
    if msg.Type == "request_seat" {
        log.Printf("🪑 [REQUEST_SEAT] User %d requesting seat assignment", client.userID)
        
        // Get active session
        h := client.hub
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err != nil {
            log.Printf("❌ [request_seat] No active session for room %d: %v", client.roomID, err)
            return
        }
        
        // 🎭 CINEMA SEAT ASSIGNMENT: Auto-assign seats in back-to-front order
        if activeSession.WatchType == "3d_cinema" {
            log.Printf("🎭 [request_seat] Cinema mode - auto-assigning seat for user %d", client.userID)
            
            // Check if user is host
            var member models.WatchSessionMember
            isHost := false
            if err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, client.userID, true).First(&member).Error; err == nil {
                isHost = member.UserRole == "host"
            }
            
            // Check if user already has a seat (reconnection scenario)
            existingSeatKey, existingTheaterNum := GetUserCinemaSeat(h, client.roomID, client.userID)
            if existingSeatKey != "" {
                // User already has a seat assigned - just resend the assignment message
                log.Printf("✅ [request_seat] User %d already has seat %s in Theater %d, resending assignment", 
                    client.userID, existingSeatKey, existingTheaterNum)
                
                // Get theater info
                var theater models.Theater
                if err := DB.Where("watch_session_id = ? AND theater_number = ?", activeSession.ID, existingTheaterNum).First(&theater).Error; err == nil {
                    // Parse seat key
                    var row, col int
                    fmt.Sscanf(existingSeatKey, "%d-%d", &row, &col)
                    
                    // Send seat_assigned message
                    seatMsg := WebSocketMessage{
                        Type: "seat_assigned",
                        Data: map[string]interface{}{
                            "user_id":        client.userID,
                            "seat_id":        existingSeatKey,
                            "row":            row,
                            "col":            col,
                            "theater_number": existingTheaterNum,
                        },
                    }
                    if msgBytes, err := json.Marshal(seatMsg); err == nil {
                        h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
                        log.Printf("📢 [request_seat] Broadcasted seat_assigned for user %d → seat %s (existing)", client.userID, existingSeatKey)
                    }
                    
                    // Send theater_assigned message to user
                    rowLetter := string(rune('A' + row))
                    theaterMsg := WebSocketMessage{
                        Type: "theater_assigned",
                        Data: map[string]interface{}{
                            "theater_id":     theater.ID,
                            "theater_number": theater.TheaterNumber,
                            "theater_name":   theater.GetDisplayName(),
                            "seat_row":       rowLetter,
                            "seat_col":       col + 1,
                        },
                    }
                    if theaterBytes, err := json.Marshal(theaterMsg); err == nil {
                        select {
                        case client.send <- OutgoingMessage{Data: theaterBytes, IsBinary: false}:
                            log.Printf("✅ Sent theater_assigned to user %d (Theater %d, existing seat)", client.userID, existingTheaterNum)
                        default:
                            log.Printf("⚠️ User %d send buffer full, dropped theater_assigned", client.userID)
                        }
                    }
                    
                    return // ✅ Don't assign a new seat, just return
                }
            }
            
            // Get or create theater for this session
            theater, isNewTheater, err := GetOrCreateTheaterForSession(&activeSession)
            if err != nil {
                log.Printf("❌ [request_seat] Failed to get theater: %v", err)
                errorMsg := WebSocketMessage{
                    Type: "seat_assignment_error",
                    Data: map[string]interface{}{
                        "error": "Failed to create theater",
                    },
                }
                if errBytes, err := json.Marshal(errorMsg); err == nil {
                    client.send <- OutgoingMessage{Data: errBytes, IsBinary: false}
                }
                return
            }
            
            if theater == nil {
                log.Printf("❌ [request_seat] No theater returned for session %d", activeSession.ID)
                return
            }
            
            // Find next available seat in this theater (pass isHost flag)
            seatKey := FindNextAvailableCinemaSeat(h, client.roomID, theater.TheaterNumber, isHost)
            if seatKey == "" {
                log.Printf("⚠️ [request_seat] Theater %d is full, should not happen (overflow detection failed)", theater.TheaterNumber)
                errorMsg := WebSocketMessage{
                    Type: "seat_assignment_error",
                    Data: map[string]interface{}{
                        "error": "Theater is full",
                        "theater_number": theater.TheaterNumber,
                    },
                }
                if errBytes, err := json.Marshal(errorMsg); err == nil {
                    client.send <- OutgoingMessage{Data: errBytes, IsBinary: false}
                }
                return
            }
            
            // Assign seat in seating map
            h.seatingMutex.Lock()
            if _, exists := h.seatingAssignments[client.roomID]; !exists {
                h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
            }
            if _, exists := h.seatingAssignments[client.roomID][theater.TheaterNumber]; !exists {
                h.seatingAssignments[client.roomID][theater.TheaterNumber] = make(map[string]uint)
            }
            h.seatingAssignments[client.roomID][theater.TheaterNumber][seatKey] = client.userID
            h.seatingMutex.Unlock()
            
            log.Printf("🎭 [request_seat] User %d → Seat %s (Theater %d)%s", client.userID, seatKey, theater.TheaterNumber, 
                map[bool]string{true: " [HOST]", false: ""}[isHost])
            
            // Parse seat key for row/col
            var row, col int
            fmt.Sscanf(seatKey, "%d-%d", &row, &col)
            rowLetter := string(rune('A' + row))
            
            // Persist to database
            if err := AssignUserToTheater(client.userID, activeSession.ID, theater.ID, rowLetter, col+1); err != nil {
                log.Printf("❌ [request_seat] Failed to assign user to theater: %v", err)
            } else {
                log.Printf("💾 [DB] User %d assigned to Theater %d, Seat %s-%d", client.userID, theater.TheaterNumber, rowLetter, col+1)
                
                // ✅ ALSO UPDATE watch_session_members.seat_id for quick lookup on reconnect
                // Convert to unique int: row*100 + col (allows up to 100 seats per row)
                seatIDInt := row*100 + col
                result := DB.Model(&models.WatchSessionMember{}).
                    Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
                        activeSession.ID, client.userID, true).
                    Update("seat_id", seatIDInt)
                
                if result.Error != nil {
                    log.Printf("⚠️ [DB] Failed to update member seat_id: %v", result.Error)
                } else if result.RowsAffected > 0 {
                    log.Printf("💾 [DB] Updated member seat_id=%d for user %d", seatIDInt, client.userID)
                }
            }
            
            // Broadcast seat_assigned to all room members
            seatMsg := WebSocketMessage{
                Type: "seat_assigned",
                Data: map[string]interface{}{
                    "user_id":        client.userID,
                    "seat_id":        seatKey,
                    "row":            row,
                    "col":            col,
                    "theater_number": theater.TheaterNumber,
                },
            }
            if msgBytes, err := json.Marshal(seatMsg); err == nil {
                h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
                log.Printf("📢 [request_seat] Broadcasted seat_assigned for user %d → seat %s", client.userID, seatKey)
            }
            
            // Send theater_assigned message to user
            theaterMsg := WebSocketMessage{
                Type: "theater_assigned",
                Data: map[string]interface{}{
                    "theater_id":     theater.ID,
                    "theater_number": theater.TheaterNumber,
                    "theater_name":   theater.GetDisplayName(),
                    "seat_row":       rowLetter,
                    "seat_col":       col + 1,
                },
            }
            if theaterBytes, err := json.Marshal(theaterMsg); err == nil {
                select {
                case client.send <- OutgoingMessage{Data: theaterBytes, IsBinary: false}:
                    log.Printf("✅ Sent theater_assigned to user %d (Theater %d)", client.userID, theater.TheaterNumber)
                default:
                    log.Printf("⚠️ User %d send buffer full, dropped theater_assigned", client.userID)
                }
            }
            
            // Notify host if new theater was created
            if isNewTheater {
                var room models.Room
                if err := DB.First(&room, client.roomID).Error; err == nil {
                    notifyMsg := WebSocketMessage{
                        Type: "theater_created",
                        Data: map[string]interface{}{
                            "theater_number": theater.TheaterNumber,
                            "message": fmt.Sprintf("Theater %d is full (42/42). Theater %d created automatically.", 
                                theater.TheaterNumber-1, theater.TheaterNumber),
                        },
                    }
                    if notifyBytes, err := json.Marshal(notifyMsg); err == nil {
                        h.registryMutex.RLock()
                        if userMap, exists := h.clientRegistry[room.HostID]; exists {
                            if hostClient, ok := userMap[client.roomID]; ok {
                                select {
                                case hostClient.send <- OutgoingMessage{Data: notifyBytes, IsBinary: false}:
                                    log.Printf("✅ Sent theater_created notification to host %d", room.HostID)
                                default:
                                    log.Printf("⚠️ Host %d send buffer full, dropped theater_created", room.HostID)
                                }
                            }
                        }
                        h.registryMutex.RUnlock()
                    }
                }
            }
            
            return
        }
        
        // Determine if this is a lecture hall session
        isLectureHall := activeSession.WatchType == "classroom" && activeSession.ClassType == "lecture_hall"
        
        // Get or create lecture hall assignment
        var lectureHallNumber int = 1
        if isLectureHall {
            hallNum, _, err := GetOrCreateLectureHallForSession(&activeSession)
            if err != nil {
                log.Printf("❌ [request_seat] Failed to get lecture hall: %v", err)
                return
            }
            lectureHallNumber = hallNum
            log.Printf("🏛️ [request_seat] User %d assigned to Lecture Hall %d", client.userID, lectureHallNumber)
        }
        
        // ✅ ATOMIC SEAT ASSIGNMENT: Lock and find first available seat
        h.seatingMutex.Lock()
        
        // Initialize maps if needed
        if _, exists := h.seatingAssignments[client.roomID]; !exists {
            h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
        }
        if _, exists := h.seatingAssignments[client.roomID][lectureHallNumber]; !exists {
            h.seatingAssignments[client.roomID][lectureHallNumber] = make(map[string]uint)
        }
        
        occupiedSeats := h.seatingAssignments[client.roomID][lectureHallNumber]
        
        // Check if user is host (gets seat 145)
        var member models.WatchSessionMember
        isHost := false
        if err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, client.userID, true).First(&member).Error; err == nil {
            isHost = member.UserRole == "host"
        }
        
        var assignedSeatID string
        var assignedSeatInt int
        
        if isHost {
            // Host always gets seat 145
            assignedSeatInt = 145
            assignedSeatID = "145"
            log.Printf("👨‍🏫 [request_seat] Assigning host seat 145 to user %d", client.userID)
        } else {
            // Find first available student seat (1-144)
            for seatID := 1; seatID <= 144; seatID++ {
                seatIDStr := fmt.Sprintf("%d", seatID)
                if _, occupied := occupiedSeats[seatIDStr]; !occupied {
                    assignedSeatInt = seatID
                    assignedSeatID = seatIDStr
                    break
                }
            }
            
            if assignedSeatID == "" {
                h.seatingMutex.Unlock()
                log.Printf("❌ [request_seat] No available seats in hall %d", lectureHallNumber)
                
                // Send error message to user
                errorMsg := WebSocketMessage{
                    Type: "seat_assignment_error",
                    Data: map[string]interface{}{
                        "error": "No available seats",
                        "hall_number": lectureHallNumber,
                    },
                }
                if errBytes, err := json.Marshal(errorMsg); err == nil {
                    client.send <- OutgoingMessage{Data: errBytes, IsBinary: false}
                }
                return
            }
            
            log.Printf("🪑 [request_seat] Assigned seat %s to user %d (hall %d)", assignedSeatID, client.userID, lectureHallNumber)
        }
        
        // Update seating map
        occupiedSeats[assignedSeatID] = client.userID
        h.seatingMutex.Unlock()
        
        log.Printf("🪑 [Seating Map] Room %d, Hall %d, Seat %s → User %d", client.roomID, lectureHallNumber, assignedSeatID, client.userID)
        
        // 💾 PERSIST TO DATABASE
        result := DB.Model(&models.WatchSessionMember{}).
            Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, client.userID, true).
            Updates(map[string]interface{}{
                "seat_id": assignedSeatInt,
                "lecture_hall_number": lectureHallNumber,
            })
        
        if result.Error != nil {
            log.Printf("❌ [DB] Failed to persist seat_id/hall: %v", result.Error)
        } else if result.RowsAffected > 0 {
            log.Printf("💾 [DB] User %d → Hall %d, Seat %d (persisted)", client.userID, lectureHallNumber, assignedSeatInt)
        }
        
        // 🏛️ NOTIFY: Send lecture_hall_assigned message to user
        if isLectureHall {
            hallOccupancy, _ := GetLectureHallOccupancy(activeSession.ID)
            totalHalls := len(hallOccupancy)
            
            lectureHallMsg := WebSocketMessage{
                Type: "lecture_hall_assigned",
                Data: map[string]interface{}{
                    "hall_number": lectureHallNumber,
                    "total_halls": totalHalls,
                    "seat_id": assignedSeatInt,
                    "occupancy": hallOccupancy[lectureHallNumber],
                },
            }
            if hallBytes, err := json.Marshal(lectureHallMsg); err == nil {
                h.registryMutex.RLock()
                if userMap, exists := h.clientRegistry[client.userID]; exists {
                    if userClient, ok := userMap[client.roomID]; ok {
                        select {
                        case userClient.send <- OutgoingMessage{Data: hallBytes, IsBinary: false}:
                            log.Printf("✅ Sent lecture_hall_assigned to user %d (Hall %d)", client.userID, lectureHallNumber)
                        default:
                            log.Printf("⚠️ User %d send buffer full, dropped lecture_hall_assigned", client.userID)
                        }
                    }
                }
                h.registryMutex.RUnlock()
            }
        }
        
        // 📢 BROADCAST seat_assigned to all room members
        seatAssignedMsg := WebSocketMessage{
            Type: "seat_assigned",
            Data: map[string]interface{}{
                "seat_id": assignedSeatID,
                "user_id": client.userID,
            },
        }
        
        if msgBytes, err := json.Marshal(seatAssignedMsg); err == nil {
            h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
            log.Printf("📢 [request_seat] Broadcasted seat_assigned for user %d → seat %s", client.userID, assignedSeatID)
        }
        
        return
    }

    // Handle take_seat - user claims an empty seat
    if msg.Type == "take_seat" {
        var takeSeat struct {
            Type   string `json:"type"`
            SeatID string `json:"seat_id"` // "row-col"
            Row    int    `json:"row"`
            Col    int    `json:"col"`
            UserID uint   `json:"user_id"`
        }

        // ✅ The incoming JSON is flat: {"type":"take_seat","seat_id":"4-6","row":4,"col":6,"user_id":8}
        var rawMsg map[string]interface{}
        if err := json.Unmarshal(message, &rawMsg); err == nil {
            // seat_id can be either string or number
            if seatID, ok := rawMsg["seat_id"].(string); ok {
                takeSeat.SeatID = seatID
            } else if seatIDNum, ok := rawMsg["seat_id"].(float64); ok {
                takeSeat.SeatID = fmt.Sprintf("%d", int(seatIDNum))
            }
            if row, ok := rawMsg["row"].(float64); ok {
                takeSeat.Row = int(row)
            }
            if col, ok := rawMsg["col"].(float64); ok {
                takeSeat.Col = int(col)
            }
            if userID, ok := rawMsg["user_id"].(float64); ok {
                takeSeat.UserID = uint(userID)
            }
            log.Printf("🪑 [TAKE_SEAT] User %d → Seat %s", takeSeat.UserID, takeSeat.SeatID)
        } else {
            log.Printf("❌ [take_seat] Failed to parse message: %v", err)
            return
        }
        
        // ✅ Validate that seat_id is not empty
        if takeSeat.SeatID == "" {
            log.Printf("❌ [take_seat] Invalid seat_id (empty) from user %d", client.userID)
            return
        }

        // Determine hall/theater number from database BEFORE updating seating map
        h := client.hub
        hallOrTheaterNumber := 1 // Default to 1 for single hall/theater
        
        // Get active session to determine watch type
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err == nil {
            if activeSession.WatchType == "classroom" && activeSession.ClassType == "lecture_hall" {
                // Get lecture hall assignment for this user
                hallNum, _ := GetUserLectureHallAssignment(takeSeat.UserID, activeSession.ID)
                if hallNum > 0 {
                    hallOrTheaterNumber = hallNum
                }
            } else if activeSession.WatchType == "3d_cinema" {
                // Get theater assignment for this user
                assignment, err := GetUserTheaterAssignment(takeSeat.UserID, activeSession.ID)
                if err == nil && assignment != nil {
                    hallOrTheaterNumber = assignment.Theater.TheaterNumber
                    log.Printf("🎭 [take_seat] User %d is in Theater %d", takeSeat.UserID, hallOrTheaterNumber)
                    
                    // Validate: For cinema seat swaps, ensure user stays in same theater
                    // The seat being claimed should be empty OR occupied by the swap partner
                    h.seatingMutex.RLock()
                    if roomMap, exists := h.seatingAssignments[client.roomID]; exists {
                        if theaterMap, exists := roomMap[hallOrTheaterNumber]; exists {
                            if occupantID, occupied := theaterMap[takeSeat.SeatID]; occupied && occupantID != client.userID {
                                // Seat is occupied by someone else - only allow if this is part of a swap
                                // For now, we'll allow it (swap validation happens in seat_swap_accepted handler)
                                log.Printf("⚠️ [take_seat] Seat %s occupied by user %d, user %d attempting to take it (swap?)", 
                                    takeSeat.SeatID, occupantID, takeSeat.UserID)
                            }
                        }
                    }
                    h.seatingMutex.RUnlock()
                }
            }
        }

        // Update seating map (now hall/theater-aware)
        h.seatingMutex.Lock()
        if _, exists := h.seatingAssignments[client.roomID]; !exists {
            h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
        }
        if _, exists := h.seatingAssignments[client.roomID][hallOrTheaterNumber]; !exists {
            h.seatingAssignments[client.roomID][hallOrTheaterNumber] = make(map[string]uint)
        }
        
        // 🔧 FIX: Remove user's old seat from ALL theaters/halls before assigning new seat
        // This prevents stale seat data from accumulating when users switch seats
        if roomHalls, exists := h.seatingAssignments[client.roomID]; exists {
            for hallNum, hallSeats := range roomHalls {
                for oldSeatID, occupantID := range hallSeats {
                    if occupantID == takeSeat.UserID && oldSeatID != takeSeat.SeatID {
                        delete(hallSeats, oldSeatID)
                        log.Printf("🧹 [take_seat] Removed old seat %s for user %d (switching to %s in hall/theater %d)", 
                            oldSeatID, takeSeat.UserID, takeSeat.SeatID, hallNum)
                    }
                }
            }
        }
        
        // Now assign the new seat
        h.seatingAssignments[client.roomID][hallOrTheaterNumber][takeSeat.SeatID] = takeSeat.UserID
        h.seatingMutex.Unlock()

        log.Printf("🪑 [Seating Map] Room %d, Hall/Theater %d, Seat %s → User %d", client.roomID, hallOrTheaterNumber, takeSeat.SeatID, takeSeat.UserID)

        // 💾 PERSIST TO DATABASE: Update watch_session_members with seat_id AND lecture_hall_number
        // Reuse activeSession from earlier query
        if activeSession.ID > 0 {
            // Convert seat_id string to int for database storage
            var seatIDInt int
            if _, err := fmt.Sscanf(takeSeat.SeatID, "%d", &seatIDInt); err == nil {
                
                // 🏛️ LECTURE HALL ASSIGNMENT: Get or create lecture hall (for lecture_hall class_type)
                var lectureHallNumber int = 1 // Default to hall 1
                var isNewHall bool = false
                
                if activeSession.WatchType == "classroom" && activeSession.ClassType == "lecture_hall" {
                    hallNum, newHall, err := GetOrCreateLectureHallForSession(&activeSession)
                    if err != nil {
                        log.Printf("❌ [take_seat] Failed to get lecture hall: %v", err)
                    } else {
                        lectureHallNumber = hallNum
                        isNewHall = newHall
                        log.Printf("🏛️ [take_seat] Assigning user %d to Lecture Hall %d", takeSeat.UserID, lectureHallNumber)
                    }
                }
                
                // Update seat_id AND lecture_hall_number for this member
                result := DB.Model(&models.WatchSessionMember{}).
                    Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, takeSeat.UserID, true).
                    Updates(map[string]interface{}{
                        "seat_id": seatIDInt,
                        "lecture_hall_number": lectureHallNumber,
                    })
                
                if result.Error != nil {
                    log.Printf("❌ [DB] Failed to persist seat_id/hall: %v", result.Error)
                } else if result.RowsAffected > 0 {
                    log.Printf("🪑 [DB] User %d → Hall %d, Seat %d (persisted)", takeSeat.UserID, lectureHallNumber, seatIDInt)
                } else {
                    log.Printf("⚠️ [DB] No active member found for user %d", takeSeat.UserID)
                }
                
                // 🏛️ NOTIFY: Send lecture_hall_assigned message to user
                if activeSession.WatchType == "classroom" && activeSession.ClassType == "lecture_hall" {
                    // Get total hall count for this session
                    hallOccupancy, _ := GetLectureHallOccupancy(activeSession.ID)
                    totalHalls := len(hallOccupancy)
                    
                    lectureHallMsg := WebSocketMessage{
                        Type: "lecture_hall_assigned",
                        Data: map[string]interface{}{
                            "hall_number": lectureHallNumber,
                            "total_halls": totalHalls,
                            "seat_id": seatIDInt,
                            "occupancy": hallOccupancy[lectureHallNumber],
                        },
                    }
                    if hallBytes, err := json.Marshal(lectureHallMsg); err == nil {
                        h.registryMutex.RLock()
                        if userMap, exists := h.clientRegistry[takeSeat.UserID]; exists {
                            if userClient, ok := userMap[client.roomID]; ok {
                                select {
                                case userClient.send <- OutgoingMessage{Data: hallBytes, IsBinary: false}:
                                    log.Printf("✅ Sent lecture_hall_assigned to user %d (Hall %d)", takeSeat.UserID, lectureHallNumber)
                                default:
                                    log.Printf("⚠️ User %d send buffer full, dropped lecture_hall_assigned", takeSeat.UserID)
                                }
                            }
                        }
                        h.registryMutex.RUnlock()
                    }
                    
                    // 🏛️ NOTIFY HOST: If new hall was created
                    if isNewHall {
                        var room models.Room
                        if err := DB.First(&room, client.roomID).Error; err == nil {
                            notifyMsg := WebSocketMessage{
                                Type: "lecture_hall_created",
                                Data: map[string]interface{}{
                                    "hall_number": lectureHallNumber,
                                    "total_halls": totalHalls,
                                    "message": fmt.Sprintf("Lecture Hall %d is full (145/145). Lecture Hall %d created automatically.", 
                                        lectureHallNumber-1, lectureHallNumber),
                                },
                            }
                            if notifyBytes, err := json.Marshal(notifyMsg); err == nil {
                                h.registryMutex.RLock()
                                if userMap, exists := h.clientRegistry[room.HostID]; exists {
                                    if hostClient, ok := userMap[client.roomID]; ok {
                                        select {
                                        case hostClient.send <- OutgoingMessage{Data: notifyBytes, IsBinary: false}:
                                            log.Printf("✅ Sent lecture_hall_created notification to host %d", room.HostID)
                                        default:
                                            log.Printf("⚠️ Host %d send buffer full, dropped lecture_hall_created", room.HostID)
                                        }
                                    }
                                }
                                h.registryMutex.RUnlock()
                            }
                        }
                    }
                }
            } else {
                log.Printf("⚠️ [DB] Could not parse seat_id '%s' as int", takeSeat.SeatID)
            }
        }

        // 🎭 THEATER ASSIGNMENT: Update theater assignment for cinema swaps
        if activeSession.ID > 0 && activeSession.WatchType == "3d_cinema" {
            // User is swapping seats - update their theater assignment
            // Get their current theater assignment
            assignment, err := GetUserTheaterAssignment(takeSeat.UserID, activeSession.ID)
            if err == nil && assignment != nil {
                // Update the seat within their existing theater
                // Extract row letter and column from seat ID (e.g., "4-6" -> row E, col 7)
                rowLetter := string(rune('A' + takeSeat.Row))
                
                // Update assignment to new seat (keeps same theater)
                if err := AssignUserToTheater(takeSeat.UserID, activeSession.ID, assignment.TheaterID, rowLetter, takeSeat.Col+1); err != nil {
                    log.Printf("❌ [take_seat] Failed to update theater seat for user %d: %v", takeSeat.UserID, err)
                } else {
                    log.Printf("✅ [take_seat] Updated user %d seat to %s-%d (Theater %d)", 
                        takeSeat.UserID, rowLetter, takeSeat.Col+1, assignment.Theater.TheaterNumber)
                }
                
                // Send theater_assigned confirmation
                theaterMsg := WebSocketMessage{
                    Type: "theater_assigned",
                    Data: map[string]interface{}{
                        "theater_id":     assignment.TheaterID,
                        "theater_number": assignment.Theater.TheaterNumber,
                        "theater_name":   assignment.Theater.GetDisplayName(),
                        "seat_row":       rowLetter,
                        "seat_col":       takeSeat.Col + 1,
                    },
                }
                if theaterBytes, err := json.Marshal(theaterMsg); err == nil {
                    // Send to user via their client
                    h.registryMutex.RLock()
                    if userMap, exists := h.clientRegistry[takeSeat.UserID]; exists {
                        if userClient, ok := userMap[client.roomID]; ok {
                            select {
                            case userClient.send <- OutgoingMessage{Data: theaterBytes, IsBinary: false}:
                                log.Printf("✅ Sent theater_assigned update to user %d", takeSeat.UserID)
                            default:
                                log.Printf("⚠️ User %d send buffer full, dropped theater_assigned", takeSeat.UserID)
                            }
                        }
                    }
                    h.registryMutex.RUnlock()
                }
            }
        }

        log.Printf("✅ Seat taken: room=%d, seat=%s, user=%d", client.roomID, takeSeat.SeatID, takeSeat.UserID)
        
        // Broadcast seat assignment to all room members
        seatAssignedMsg := WebSocketMessage{
            Type: "seat_assigned",
            Data: map[string]interface{}{
                "seat_id": takeSeat.SeatID,
                "user_id": takeSeat.UserID,
                "row":     takeSeat.Row,
                "col":     takeSeat.Col,
            },
        }
        if assignedBytes, err := json.Marshal(seatAssignedMsg); err == nil {
            log.Printf("📢 [take_seat] Broadcasting seat_assigned: seat=%s, user=%d to room %d", takeSeat.SeatID, takeSeat.UserID, client.roomID)
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: assignedBytes, IsBinary: false}, nil)
        } else {
            log.Printf("❌ [take_seat] Failed to marshal seat_assigned message: %v", err)
        }
        return
    }

    // Handle leave_seat - user leaves their seat (explicit leave or disconnect)
    if msg.Type == "leave_seat" {
        var leaveSeat struct {
            UserID uint `json:"user_id"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &leaveSeat)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            leaveSeat.UserID = uint(m["user_id"].(float64))
        }

        // Remove user from seating map (hall-aware)
        h := client.hub
        h.seatingMutex.Lock()
        if roomHalls, exists := h.seatingAssignments[client.roomID]; exists {
            // Search all halls for this user's seat
            for hallNum, hallSeats := range roomHalls {
                for seatID, userID := range hallSeats {
                    if userID == leaveSeat.UserID {
                        delete(hallSeats, seatID)
                        log.Printf("🪑 Seat vacated: room=%d, hall=%d, seat=%s, user=%d", client.roomID, hallNum, seatID, leaveSeat.UserID)
                        break
                    }
                }
            }
        }
        h.seatingMutex.Unlock()

        // ✅ DATABASE CLEANUP: Mark user as left in watch_session_members
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err == nil {
            now := time.Now()
            result := DB.Model(&models.WatchSessionMember{}).
                Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, leaveSeat.UserID, true).
                Updates(map[string]interface{}{
                    "is_active": false,
                    "left_at":   now,
                })
            
            if result.Error != nil {
                log.Printf("⚠️ [leave_seat] Failed to mark user %d as left: %v", leaveSeat.UserID, result.Error)
            } else if result.RowsAffected > 0 {
                log.Printf("✅ [leave_seat] Marked user %d as left from session %s", leaveSeat.UserID, activeSession.SessionID)
            }
            
            // 🎭 THEATER CLEANUP: Remove user from theater assignment
            if activeSession.WatchType == "3d_cinema" {
                if err := RemoveUserFromTheater(leaveSeat.UserID, activeSession.ID); err != nil {
                    log.Printf("⚠️ [leave_seat] Failed to remove theater assignment: %v", err)
                }
            }
        }

        // Broadcast user_left_seat to all room members
        leaveMsg := WebSocketMessage{
            Type: "user_left_seat",
            Data: map[string]interface{}{
                "user_id": leaveSeat.UserID,
            },
        }
        if leaveBytes, err := json.Marshal(leaveMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leaveBytes, IsBinary: false}, nil)
        }
        return
    }

    // Handle seat_swap_request - user wants to swap with another user
    if msg.Type == "seat_swap_request" {
        log.Printf("🪑 [BACKEND seat_swap_request] Received from user %d", client.userID)
        log.Printf("🪑 [PARSED] requester=%d, target=%d, targetSeat=%v (type:%T)", 
            msg.RequesterID, msg.TargetUserID, msg.TargetSeat, msg.TargetSeat)

        if msg.RequesterID == 0 || msg.TargetUserID == 0 {
            log.Printf("🪑 [ERROR] Invalid request: requester=%d, target=%d", msg.RequesterID, msg.TargetUserID)
            return
        }

        // Get requester info
        var requester models.User
        if err := DB.First(&requester, msg.RequesterID).Error; err != nil {
            log.Printf("Failed to fetch requester user %d: %v", msg.RequesterID, err)
            return
        }

        // Get active session
        h := client.hub
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err != nil {
            log.Printf("❌ [seat_swap_request] No active session for room %d: %v", client.roomID, err)
            return
        }

        // Get lecture hall number for requester
        requesterHallNum, _, err := GetOrCreateLectureHallForSession(&activeSession)
        if err != nil {
            log.Printf("❌ [seat_swap_request] Failed to get requester hall: %v", err)
            return
        }

        // Get requester's current seat
        h.seatingMutex.Lock()
        hallSeating, exists := h.seatingAssignments[client.roomID][requesterHallNum]
        requesterSeat := ""
        if exists {
            for seatID, userID := range hallSeating {
                if userID == msg.RequesterID {
                    requesterSeat = seatID
                    break
                }
            }
        }
        h.seatingMutex.Unlock()

        log.Printf("🪑 [SWAP REQUEST] User %d (%s) seat %s wants to swap with user %d (seat %v)", 
            msg.RequesterID, requester.Username, requesterSeat, msg.TargetUserID, msg.TargetSeat)

        // Send swap request only to target user
        swapMsg := map[string]interface{}{
            "type":           "seat_swap_request",
            "requester_id":   msg.RequesterID,
            "requester_name": requester.Username,
            "requester_seat": requesterSeat,
            "target_seat":    msg.TargetSeat,
            "target_user_id": msg.TargetUserID, // ✅ Add target_user_id so frontend knows it's for them
        }
        
        if msgBytes, err := json.Marshal(swapMsg); err == nil {
            log.Printf("📤 [BACKEND] Sending swap request to user %d: %+v", msg.TargetUserID, swapMsg)
            client.hub.BroadcastToUsers([]uint{msg.TargetUserID}, OutgoingMessage{Data: msgBytes, IsBinary: false})
            log.Printf("✅ [BACKEND] Sent swap request from user %d (%s) to user %d", msg.RequesterID, requester.Username, msg.TargetUserID)
        }
        return
    }

    // Handle seat_swap_accepted - target user accepted swap
    if msg.Type == "seat_swap_accepted" {
        log.Printf("🪑 [seat_swap_accepted] Received from user %d", client.userID)
        log.Printf("🪑 [PARSED] requester=%d, target=%d, requesterSeat=%v, targetSeat=%v", 
            msg.RequesterID, msg.TargetID, msg.RequesterSeat, msg.TargetSeat)

        if msg.RequesterID == 0 || msg.TargetID == 0 {
            log.Printf("❌ [seat_swap_accepted] Invalid data: requester=%d, target=%d", msg.RequesterID, msg.TargetID)
            return
        }

        // Convert seat values to strings for map lookup
        var requesterSeatID, targetSeatID string
        
        // Handle requester seat (could be string or number)
        switch v := msg.RequesterSeat.(type) {
        case string:
            requesterSeatID = v
        case float64:
            requesterSeatID = fmt.Sprintf("%d", int(v))
        default:
            log.Printf("❌ [seat_swap_accepted] Invalid requesterSeat type: %T", msg.RequesterSeat)
            return
        }
        
        // Handle target seat (could be string or number)
        switch v := msg.TargetSeat.(type) {
        case string:
            targetSeatID = v
        case float64:
            targetSeatID = fmt.Sprintf("%d", int(v))
        default:
            log.Printf("❌ [seat_swap_accepted] Invalid targetSeat type: %T", msg.TargetSeat)
            return
        }

        log.Printf("🪑 [SWAP SEATS] User %d (seat %s) ↔ User %d (seat %s)", 
            msg.RequesterID, requesterSeatID, msg.TargetID, targetSeatID)

        // Swap seats in seating map
        h := client.hub
        h.seatingMutex.Lock()
        if roomHalls, exists := h.seatingAssignments[client.roomID]; exists {
            // Get hall number (should be 1 for lecture hall)
            for hallNum, hallSeats := range roomHalls {
                // Verify both users are in this hall
                if hallSeats[requesterSeatID] == msg.RequesterID && hallSeats[targetSeatID] == msg.TargetID {
                    // Perform swap
                    hallSeats[requesterSeatID] = msg.TargetID
                    hallSeats[targetSeatID] = msg.RequesterID
                    log.Printf("✅ [SWAP] Completed in Hall %d: seat %s → user %d, seat %s → user %d", 
                        hallNum, requesterSeatID, msg.TargetID, targetSeatID, msg.RequesterID)
                    break
                }
            }
        }
        h.seatingMutex.Unlock()

        // Get active session
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err != nil {
            log.Printf("❌ [seat_swap_accepted] No active session for room %d: %v", client.roomID, err)
            return
        }

        // Update database for both users
        DB.Model(&models.WatchSessionMember{}).
            Where("user_id = ? AND is_active = ?", msg.RequesterID, true).
            Update("seat_id", targetSeatID)
        DB.Model(&models.WatchSessionMember{}).
            Where("user_id = ? AND is_active = ?", msg.TargetID, true).
            Update("seat_id", requesterSeatID)
        log.Printf("💾 [DB] Updated WatchSessionMember seats: user %d → %s, user %d → %s", 
            msg.RequesterID, targetSeatID, msg.TargetID, requesterSeatID)

        // 🎭 UPDATE UserTheaterAssignment for cinema swaps (critical for reconnection)
        if activeSession.WatchType == "3d_cinema" {
            // Parse requester seat (targetSeatID is where requester is moving to)
            var targetRow, targetCol int
            fmt.Sscanf(targetSeatID, "%d-%d", &targetRow, &targetCol)
            targetRowLetter := string(rune('A' + targetRow))
            
            // Parse target seat (requesterSeatID is where target is moving to)
            var requesterRow, requesterCol int
            fmt.Sscanf(requesterSeatID, "%d-%d", &requesterRow, &requesterCol)
            requesterRowLetter := string(rune('A' + requesterRow))
            
            // Update requester's theater assignment
            requesterAssignment, err := GetUserTheaterAssignment(msg.RequesterID, activeSession.ID)
            if err == nil && requesterAssignment != nil {
                if err := AssignUserToTheater(msg.RequesterID, activeSession.ID, requesterAssignment.TheaterID, targetRowLetter, targetCol+1); err != nil {
                    log.Printf("❌ [seat_swap_accepted] Failed to update requester theater seat: %v", err)
                } else {
                    log.Printf("✅ [seat_swap_accepted] Updated requester %d theater seat to %s-%d", 
                        msg.RequesterID, targetRowLetter, targetCol+1)
                }
            }
            
            // Update target's theater assignment
            targetAssignment, err := GetUserTheaterAssignment(msg.TargetID, activeSession.ID)
            if err == nil && targetAssignment != nil {
                if err := AssignUserToTheater(msg.TargetID, activeSession.ID, targetAssignment.TheaterID, requesterRowLetter, requesterCol+1); err != nil {
                    log.Printf("❌ [seat_swap_accepted] Failed to update target theater seat: %v", err)
                } else {
                    log.Printf("✅ [seat_swap_accepted] Updated target %d theater seat to %s-%d", 
                        msg.TargetID, requesterRowLetter, requesterCol+1)
                }
            }
        }

        // Broadcast to entire room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, nil)
        log.Printf("📢 [BROADCAST] Swap accepted notification sent to room %d", client.roomID)
        return
    }

    // Handle seat_swap_declined - target user declined swap
    if msg.Type == "seat_swap_declined" {
        log.Printf("🪑 [seat_swap_declined] Received from user %d", client.userID)
        log.Printf("🪑 [PARSED] requester=%d, target=%d", msg.RequesterID, msg.TargetID)

        if msg.RequesterID == 0 || msg.TargetID == 0 {
            log.Printf("❌ [seat_swap_declined] Invalid data: requester=%d, target=%d", msg.RequesterID, msg.TargetID)
            return
        }

        // Send declined notification only to requester
        client.hub.BroadcastToUsers([]uint{msg.RequesterID}, OutgoingMessage{Data: message, IsBinary: false})
        log.Printf("📢 [DECLINED] User %d declined swap with user %d", msg.TargetID, msg.RequesterID)
        return
    }

    // ✅ Handle chat_message - save to DB and broadcast
    if msg.Type == "chat_message" {
        var chatData struct {
            Message   string `json:"message"`
            SessionID string `json:"session_id"`
            UserID    uint   `json:"user_id"`
            Username  string `json:"username"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &chatData); err != nil {
                log.Printf("[chat_message] Failed to parse chat data: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            chatData.Message = m["message"].(string)
            chatData.SessionID = m["session_id"].(string)
            if uid, ok := m["user_id"].(float64); ok {
                chatData.UserID = uint(uid)
            }
            if uname, ok := m["username"].(string); ok {
                chatData.Username = uname
            }
        }

        // 🎭 Get theater info for this user (only for 3D cinema)
        var theaterNumber int
        var theaterName string
        var totalTheaters int
        
        var activeSession models.WatchSession
        if err := DB.Where("session_id = ?", chatData.SessionID).First(&activeSession).Error; err == nil {
            if activeSession.WatchType == "3d_cinema" {
                // Get user's theater assignment
                assignment, err := GetUserTheaterAssignment(chatData.UserID, activeSession.ID)
                if err == nil && assignment != nil && assignment.Theater != nil {
                    theaterNumber = assignment.Theater.TheaterNumber
                    theaterName = assignment.Theater.GetDisplayName()
                }
                
                // Count total theaters for this session
                var theaters []models.Theater
                if err := DB.Where("watch_session_id = ?", activeSession.ID).Find(&theaters).Error; err == nil {
                    totalTheaters = len(theaters)
                }
            }
        }

        // Save to database
        chatMessage := models.ChatMessage{
            RoomID:    client.roomID,
            SessionID: chatData.SessionID,
            UserID:    chatData.UserID,
            Username:  chatData.Username,
            Message:   chatData.Message,
        }

        if err := DB.Create(&chatMessage).Error; err != nil {
            log.Printf("[chat_message] ❌ Failed to save chat message: %v", err)
        } else {
            log.Printf("[chat_message] ✅ Saved message ID=%d from user %d in session %s", chatMessage.ID, chatData.UserID, chatData.SessionID)
        }

        // Broadcast enriched message with DB ID and theater info
        messageData := map[string]interface{}{
            "ID":         chatMessage.ID,
            "UserID":     chatMessage.UserID,
            "Username":   chatMessage.Username,
            "Message":    chatMessage.Message,
            "session_id": chatMessage.SessionID,
            "CreatedAt":  chatMessage.CreatedAt,
            "reactions":  []interface{}{}, // Empty reactions initially
        }
        
        // ✅ SMART THEATER BADGE: Only include theater info if 2+ theaters exist
        if totalTheaters >= 2 {
            messageData["theater_number"] = theaterNumber
            messageData["theater_name"] = theaterName
            messageData["total_theaters"] = totalTheaters
            log.Printf("[chat_message] 🎭 User %d in Theater %d (total: %d theaters)", chatData.UserID, theaterNumber, totalTheaters)
        }
        
        enrichedMsg := map[string]interface{}{
            "type": "chat_message",
            "data": messageData,
        }

        if broadcastBytes, err := json.Marshal(enrichedMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
            log.Printf("[chat_message] 📢 Broadcasted message to room %d", client.roomID)
        }
        
        // ✅ Broadcast to lobby for real-time chat count updates (for users NOT in the chat)
        var chatCount int64
        DB.Model(&models.ChatMessage{}).Where("session_id = ?", chatData.SessionID).Count(&chatCount)
        
        lobbyEvent := map[string]interface{}{
            "type":       "session_chat_sent",
            "session_id": chatData.SessionID,
            "chat_count": chatCount,
        }
        
        if lobbyBytes, err := json.Marshal(lobbyEvent); err == nil {
            client.hub.BroadcastToLobby(OutgoingMessage{Data: lobbyBytes, IsBinary: false})
            log.Printf("[chat_message] 📢 Broadcasted chat count to lobby for session %s (count: %d)", chatData.SessionID, chatCount)
        }
        
        return
    }

    // ✅ Handle session_title_update - update session title and broadcast
    if msg.Type == "session_title_update" {
        var titleData struct {
            SessionID string `json:"session_id"`
            Title     string `json:"title"`
        }

        if m, ok := msg.Data.(map[string]interface{}); ok {
            if sid, ok := m["session_id"].(string); ok {
                titleData.SessionID = sid
            }
            if title, ok := m["title"].(string); ok {
                titleData.Title = title
            }
        }

        if titleData.SessionID == "" {
            log.Printf("[session_title_update] Missing session_id")
            return
        }

        // Update session title in database
        var session models.WatchSession
        if err := DB.Where("session_id = ?", titleData.SessionID).First(&session).Error; err != nil {
            log.Printf("[session_title_update] Failed to find session %s: %v", titleData.SessionID, err)
            return
        }

        // Only host can update title
        if session.HostID != client.userID {
            log.Printf("[session_title_update] User %d is not host of session %s", client.userID, titleData.SessionID)
            return
        }

        // Update title
        if err := DB.Model(&session).Update("session_title", titleData.Title).Error; err != nil {
            log.Printf("[session_title_update] Failed to update title for session %s: %v", titleData.SessionID, err)
            return
        }

        log.Printf("[session_title_update] ✅ Updated session %s title to: %s", titleData.SessionID, titleData.Title)

        // Push the new title to all lobby tabs immediately
        if lobbyMsg, err := json.Marshal(map[string]interface{}{
            "type":       "media_state_changed",
            "session_id": titleData.SessionID,
            "data": map[string]interface{}{
                "session_title":     titleData.Title,
                "currently_playing": titleData.Title,
            },
        }); err == nil {
            hub.BroadcastToLobby(OutgoingMessage{Data: lobbyMsg, IsBinary: false})
        }

        // Broadcast updated session_status with new title
        var activeMembers []models.WatchSessionMember
        DB.Where("watch_session_id = ? AND is_active = ?", session.ID, true).Find(&activeMembers)

        memberList := []map[string]interface{}{}
        for _, member := range activeMembers {
            var user models.User
            if err := DB.First(&user, member.UserID).Error; err == nil {
                memberList = append(memberList, map[string]interface{}{
                    "user_id":  user.ID,
                    "username": user.Username,
                })
            }
        }

        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id":               titleData.SessionID,
                "host_id":                  session.HostID,
                "members":                  memberList,
                "member_count":             len(activeMembers),
                "started_at":               session.StartedAt,
                "current_media_url":        session.CurrentMediaURL,
                "current_media_type":       session.CurrentMediaType,
                "is_screen_sharing_active": session.IsScreenSharingActive,
                "sharing_source":           session.SharingSource,
                "session_title":            titleData.Title,
                "content_rating":           session.ContentRating, // ✅ Include content rating for button filtering
            },
        }

        if statusBytes, err := json.Marshal(statusMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: statusBytes, IsBinary: false}, nil)
            log.Printf("[session_title_update] 📢 Broadcasted updated session_status to room %d", client.roomID)
        }
        return
    }

    // Handle private_chat_message
    if msg.Type == "private_chat_message" {
        var data struct {
            ToUserID uint   `json:"to_user_id"`
            Message  string `json:"message"`
        }
        if m, ok := msg.Data.(map[string]interface{}); ok {
            data.ToUserID = uint(m["to_user_id"].(float64))
            data.Message = m["message"].(string)
        }

        // Save to DB with session_id for ephemeral messaging
        privateMsg := models.PrivateMessage{
            SenderID:   client.userID,
            ReceiverID: data.ToUserID,
            Message:    data.Message,
            SessionID:  client.sessionID, // ✅ Link to session for auto-cleanup
        }
        if err := DB.Create(&privateMsg).Error; err != nil {
            log.Printf("❌ Failed to save private message: %v", err)
            return
        }

        log.Printf("✅ Private message saved: from user %d to user %d (session: %s)", client.userID, data.ToUserID, client.sessionID)

        // Enrich message with sender info and send to receiver
        enrichedMessage := map[string]interface{}{
            "type": "private_chat_message",
            "data": map[string]interface{}{
                "sender_id":   client.userID,
                "receiver_id": data.ToUserID,
                "message":     data.Message,
                "created_at":  privateMsg.CreatedAt,
                "id":          privateMsg.ID,
            },
        }

        enrichedJSON, _ := json.Marshal(enrichedMessage)
        
        // Check notification settings before sending
        var settings models.UserSettings
        if err := DB.Where("user_id = ?", data.ToUserID).First(&settings).Error; err == nil {
            if settings.PushEnabled && settings.MessagesNotif {
                // ✅ Only deliver to receiver (sender already has optimistic update)
                client.hub.BroadcastToUsers([]uint{data.ToUserID}, OutgoingMessage{
                    Data: enrichedJSON,
                    IsBinary: false,
                })
                log.Printf("📤 Private message sent to user %d", data.ToUserID)
            } else {
                log.Printf("🔕 User %d has message notifications disabled", data.ToUserID)
            }
        }
        return
    }

    // Handle fetch_private_chat
    if msg.Type == "fetch_private_chat" {
        var data struct {
            OtherUserID interface{} `json:"other_user_id"` // Can be string (demo user) or number (real user)
        }
        if m, ok := msg.Data.(map[string]interface{}); ok {
            data.OtherUserID = m["other_user_id"]
        }
        
        // Convert OtherUserID to uint (handle both string and number)
        var otherUserID uint
        switch v := data.OtherUserID.(type) {
        case float64:
            otherUserID = uint(v)
        case string:
            // For demo users or string IDs, skip private chat (demo users can't receive messages)
            log.Printf("⚠️ [fetch_private_chat] Demo user ID detected: %s - skipping private chat fetch", v)
            response := map[string]interface{}{
                "type": "private_chat_history",
                "data": map[string]interface{}{
                    "other_user_id": v,
                    "messages":      []interface{}{}, // Empty array for demo users
                },
            }
            jsonBytes, _ := json.Marshal(response)
            client.send <- OutgoingMessage{Data: jsonBytes, IsBinary: false}
            return // Exit handler for demo users
        default:
            log.Printf("❌ [fetch_private_chat] Invalid other_user_id type: %T", v)
            return // Exit handler on error
        }

        // Fetch messages between client.userID and otherUserID (only for real users)
        var messages []models.PrivateMessage
        DB.Where("(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
            client.userID, otherUserID,
            otherUserID, client.userID).
            Order("created_at ASC").
            Find(&messages)

        // Send back as batch
        response := map[string]interface{}{
            "type": "private_chat_history",
            "data": map[string]interface{}{
                "other_user_id": otherUserID,
                "messages":      messages,
            },
        }
        if bytes, err := json.Marshal(response); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: bytes, IsBinary: false}:
            default:
                log.Printf("Dropped private chat history for user %d", client.userID)
            }
        }
        return
    }

    // ✅ Handle request_broadcast - user requests permission to broadcast to whole room
    if msg.Type == "request_broadcast" {
        var requestData struct {
            UserID    uint   `json:"user_id"`
            SessionID string `json:"session_id"`
        }
        
        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &requestData); err != nil {
                log.Printf("[request_broadcast] ❌ Failed to parse data: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            if uid, ok := m["user_id"].(float64); ok {
                requestData.UserID = uint(uid)
            }
            if sid, ok := m["session_id"].(string); ok {
                requestData.SessionID = sid
            }
        }
        
        log.Printf("[request_broadcast] 🎤 User %d requesting broadcast permission in session %s", 
            requestData.UserID, requestData.SessionID)
        
        // Get session and host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", requestData.SessionID).First(&session).Error; err != nil {
            log.Printf("[request_broadcast] ❌ Session not found: %v", err)
            return
        }
        
        // Get username for the request
        var user models.User
        var username string
        if err := DB.First(&user, requestData.UserID).Error; err == nil {
            username = user.Username
        } else {
            username = "Unknown User"
        }
        
        // Send broadcast_request message to host
        requestMsg := map[string]interface{}{
            "type": "broadcast_request",
            "data": map[string]interface{}{
                "user_id":    requestData.UserID,
                "username":   username,
                "session_id": requestData.SessionID,
            },
        }
        
        if msgBytes, err := json.Marshal(requestMsg); err == nil {
            client.hub.BroadcastToUsers([]uint{session.HostID}, OutgoingMessage{
                Data:     msgBytes,
                IsBinary: false,
            })
            log.Printf("[request_broadcast] ✅ Sent broadcast request from user %d to host %d", 
                requestData.UserID, session.HostID)
        }
        
        return
    }

    // ✅ Handle grant_broadcast - host grants user permission to speak to whole room
    if msg.Type == "grant_broadcast" {
        var broadcastData struct {
            UserID    uint   `json:"user_id"`
            SessionID string `json:"session_id"`
        }
        
        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &broadcastData); err != nil {
                log.Printf("[grant_broadcast] ❌ Failed to parse data: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            if uid, ok := m["user_id"].(float64); ok {
                broadcastData.UserID = uint(uid)
            }
            if sid, ok := m["session_id"].(string); ok {
                broadcastData.SessionID = sid
            }
        }
        
        log.Printf("[grant_broadcast] 🔊 Host (user %d) granting broadcast permission to user %d in session %s", 
            client.userID, broadcastData.UserID, broadcastData.SessionID)
        
        // Verify sender is the host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", broadcastData.SessionID).First(&session).Error; err != nil {
            log.Printf("[grant_broadcast] ❌ Session not found: %v", err)
            return
        }
        
        if session.HostID != client.userID {
            log.Printf("[grant_broadcast] ❌ User %d is not the host (host is %d)", client.userID, session.HostID)
            return
        }
        
        // Update session member's can_broadcast flag
        result := DB.Model(&models.WatchSessionMember{}).
            Where("watch_session_id = ? AND user_id = ? AND is_active = ?", session.ID, broadcastData.UserID, true).
            Update("can_broadcast", true)
        
        if result.Error != nil {
            log.Printf("[grant_broadcast] ❌ Failed to update member: %v", result.Error)
            return
        }
        
        if result.RowsAffected == 0 {
            log.Printf("[grant_broadcast] ⚠️ No active member found for user %d in session %s", broadcastData.UserID, broadcastData.SessionID)
            return
        }
        
        log.Printf("[grant_broadcast] ✅ Granted broadcast permission to user %d", broadcastData.UserID)
        
        // Broadcast permission granted to all room members
        permissionMsg := map[string]interface{}{
            "type": "broadcast_granted",
            "data": map[string]interface{}{
                "user_id":    broadcastData.UserID,
                "session_id": broadcastData.SessionID,
            },
        }
        
        if broadcastBytes, err := json.Marshal(permissionMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
            log.Printf("[grant_broadcast] 📢 Broadcasted permission granted to room %d", client.roomID)
        }
        return
    }

    // ✅ Handle revoke_broadcast - host revokes user's whole-room broadcast permission
    if msg.Type == "revoke_broadcast" {
        var broadcastData struct {
            UserID    uint   `json:"user_id"`
            SessionID string `json:"session_id"`
        }
        
        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &broadcastData); err != nil {
                log.Printf("[revoke_broadcast] ❌ Failed to parse data: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            if uid, ok := m["user_id"].(float64); ok {
                broadcastData.UserID = uint(uid)
            }
            if sid, ok := m["session_id"].(string); ok {
                broadcastData.SessionID = sid
            }
        }
        
        log.Printf("[revoke_broadcast] 🔇 Host (user %d) revoking broadcast permission from user %d in session %s", 
            client.userID, broadcastData.UserID, broadcastData.SessionID)
        
        // Verify sender is the host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", broadcastData.SessionID).First(&session).Error; err != nil {
            log.Printf("[revoke_broadcast] ❌ Session not found: %v", err)
            return
        }
        
        if session.HostID != client.userID {
            log.Printf("[revoke_broadcast] ❌ User %d is not the host (host is %d)", client.userID, session.HostID)
            return
        }
        
        // Update session member's can_broadcast flag
        result := DB.Model(&models.WatchSessionMember{}).
            Where("watch_session_id = ? AND user_id = ? AND is_active = ?", session.ID, broadcastData.UserID, true).
            Update("can_broadcast", false)
        
        if result.Error != nil {
            log.Printf("[revoke_broadcast] ❌ Failed to update member: %v", result.Error)
            return
        }
        
        if result.RowsAffected == 0 {
            log.Printf("[revoke_broadcast] ⚠️ No active member found for user %d in session %s", broadcastData.UserID, broadcastData.SessionID)
            return
        }
        
        log.Printf("[revoke_broadcast] ✅ Revoked broadcast permission from user %d", broadcastData.UserID)
        
        // Broadcast permission revoked to all room members
        permissionMsg := map[string]interface{}{
            "type": "broadcast_revoked",
            "data": map[string]interface{}{
                "user_id":    broadcastData.UserID,
                "session_id": broadcastData.SessionID,
            },
        }
        
        if broadcastBytes, err := json.Marshal(permissionMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
            log.Printf("[revoke_broadcast] 📢 Broadcasted permission revoked to room %d", client.roomID)
        }
        return
    }

    // ✅ Handle reaction - save to DB and broadcast
    if msg.Type == "reaction" {
        var reactionData struct {
            MessageID uint   `json:"message_id"`
            Emoji     string `json:"emoji"`
            UserID    uint   `json:"user_id"`
            SessionID string `json:"session_id"`
            Timestamp int64  `json:"timestamp"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &reactionData); err != nil {
                log.Printf("[reaction] Failed to parse reaction data: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            if mid, ok := m["message_id"].(float64); ok {
                reactionData.MessageID = uint(mid)
            }
            reactionData.Emoji = m["emoji"].(string)
            if uid, ok := m["user_id"].(float64); ok {
                reactionData.UserID = uint(uid)
            }
            if sid, ok := m["session_id"].(string); ok {
                reactionData.SessionID = sid
            }
            if ts, ok := m["timestamp"].(float64); ok {
                reactionData.Timestamp = int64(ts)
            }
        }

        // Save to database
        reaction := models.Reaction{
            UserID:    reactionData.UserID,
            RoomID:    client.roomID,
            SessionID: reactionData.SessionID,
            MessageID: reactionData.MessageID,
            Emoji:     reactionData.Emoji,
            Timestamp: time.Unix(reactionData.Timestamp/1000, 0),
        }

        if err := DB.Create(&reaction).Error; err != nil {
            log.Printf("[reaction] ❌ Failed to save reaction: %v", err)
        } else {
            log.Printf("[reaction] ✅ Saved reaction ID=%d emoji=%s for message %d", reaction.ID, reaction.Emoji, reactionData.MessageID)
        }

        // Broadcast reaction
        reactionMsg := map[string]interface{}{
            "type": "reaction",
            "data": map[string]interface{}{
                "message_id": reactionData.MessageID,
                "emoji":      reactionData.Emoji,
                "user_id":    reactionData.UserID,
                "session_id": reactionData.SessionID,
            },
        }

        if broadcastBytes, err := json.Marshal(reactionMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
            log.Printf("[reaction] 📢 Broadcasted reaction to room %d", client.roomID)
        }
        return
    }
    
    // ✅ Handle raise_hand - Student requests to speak to entire room
    if msg.Type == "raise_hand" {
        // Parse the full message to get fields at root level
        var handMsg struct {
            Type      string      `json:"type"`
            UserID    float64     `json:"user_id"`
            Username  string      `json:"username"`
            SeatID    interface{} `json:"seat_id"` // Can be string or number
            SessionID string      `json:"session_id"`
        }
        
        if err := json.Unmarshal(message, &handMsg); err != nil {
            log.Printf("[raise_hand] ❌ Failed to parse message: %v", err)
            return
        }
        
        // Convert seat_id to string
        var seatIDStr string
        switch v := handMsg.SeatID.(type) {
        case string:
            seatIDStr = v
        case float64:
            seatIDStr = fmt.Sprintf("%.0f", v)
        default:
            log.Printf("[raise_hand] ⚠️ Unexpected seat_id type: %T", handMsg.SeatID)
        }

        log.Printf("[raise_hand] 🙋 User %d (%s) raised hand in seat %s (session %s)", 
            uint(handMsg.UserID), handMsg.Username, seatIDStr, handMsg.SessionID)

        // Get session and host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", handMsg.SessionID).First(&session).Error; err != nil {
            log.Printf("[raise_hand] ❌ Session not found: %v", err)
            return
        }

        // Send raise_hand notification to host only
        notifyMsg := map[string]interface{}{
            "type": "raise_hand",
            "data": map[string]interface{}{
                "user_id":    uint(handMsg.UserID),
                "username":   handMsg.Username,
                "seat_id":    seatIDStr,
                "session_id": handMsg.SessionID,
            },
        }

        if handBytes, err := json.Marshal(notifyMsg); err == nil {
            // Send to host only
            client.hub.BroadcastToUser(session.HostID, client.roomID, OutgoingMessage{Data: handBytes, IsBinary: false})
            log.Printf("[raise_hand] 📢 Sent raise_hand notification to host (user %d)", session.HostID)
        }
        return
    }

    // ✅ Handle lower_hand - Student cancels raise hand request
    if msg.Type == "lower_hand" {
        var handData struct {
            UserID    uint   `json:"user_id"`
            SessionID string `json:"session_id"`
        }

        if m, ok := msg.Data.(map[string]interface{}); ok {
            if uid, ok := m["user_id"].(float64); ok {
                handData.UserID = uint(uid)
            }
            if sid, ok := m["session_id"].(string); ok {
                handData.SessionID = sid
            }
        }

        log.Printf("[lower_hand] 🙋 User %d lowered hand (session %s)", handData.UserID, handData.SessionID)

        // Get session and host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", handData.SessionID).First(&session).Error; err != nil {
            log.Printf("[lower_hand] ❌ Session not found: %v", err)
            return
        }

        // Send lower_hand notification to host only
        lowerMsg := map[string]interface{}{
            "type": "lower_hand",
            "data": map[string]interface{}{
                "user_id":    handData.UserID,
                "session_id": handData.SessionID,
            },
        }

        if lowerBytes, err := json.Marshal(lowerMsg); err == nil {
            client.hub.BroadcastToUser(session.HostID, client.roomID, OutgoingMessage{Data: lowerBytes, IsBinary: false})
            log.Printf("[lower_hand] 📢 Sent lower_hand notification to host (user %d)", session.HostID)
        }
        return
    }

    // ✅ Handle approve_speaker - Host approves student to broadcast
    if msg.Type == "approve_speaker" {
        var approveData struct {
            TargetUserID uint   `json:"target_user_id"`
            SessionID    string `json:"session_id"`
        }

        if m, ok := msg.Data.(map[string]interface{}); ok {
            if tuid, ok := m["target_user_id"].(float64); ok {
                approveData.TargetUserID = uint(tuid)
            }
            if sid, ok := m["session_id"].(string); ok {
                approveData.SessionID = sid
            }
        }

        log.Printf("[approve_speaker] ✅ Host (user %d) approving speaker %d (session %s)", 
            client.userID, approveData.TargetUserID, approveData.SessionID)

        // Verify sender is the host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", approveData.SessionID).First(&session).Error; err != nil {
            log.Printf("[approve_speaker] ❌ Session not found: %v", err)
            return
        }

        if session.HostID != client.userID {
            log.Printf("[approve_speaker] ❌ User %d is not the host (host is %d)", client.userID, session.HostID)
            return
        }

        // Send approval response to student
        responseMsg := map[string]interface{}{
            "type": "hand_raised_response",
            "data": map[string]interface{}{
                "approved":   true,
                "session_id": approveData.SessionID,
            },
        }

        if responseBytes, err := json.Marshal(responseMsg); err == nil {
            client.hub.BroadcastToUser(approveData.TargetUserID, client.roomID, OutgoingMessage{Data: responseBytes, IsBinary: false})
            log.Printf("[approve_speaker] 📨 Sent approval to user %d", approveData.TargetUserID)
        }

        // Broadcast speaker_approved to all room members
        approvedMsg := map[string]interface{}{
            "type": "speaker_approved",
            "data": map[string]interface{}{
                "user_id":    approveData.TargetUserID,
                "session_id": approveData.SessionID,
            },
        }

        if approvedBytes, err := json.Marshal(approvedMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: approvedBytes, IsBinary: false}, nil)
            log.Printf("[approve_speaker] 📢 Broadcasted speaker_approved to room %d", client.roomID)
        }
        return
    }

    // ✅ Handle revoke_speaker - Host removes broadcast permission
    if msg.Type == "revoke_speaker" {
        var revokeData struct {
            TargetUserID uint   `json:"target_user_id"`
            SessionID    string `json:"session_id"`
        }

        if m, ok := msg.Data.(map[string]interface{}); ok {
            if tuid, ok := m["target_user_id"].(float64); ok {
                revokeData.TargetUserID = uint(tuid)
            }
            if sid, ok := m["session_id"].(string); ok {
                revokeData.SessionID = sid
            }
        }

        log.Printf("[revoke_speaker] 🚫 Host (user %d) revoking speaker %d (session %s)", 
            client.userID, revokeData.TargetUserID, revokeData.SessionID)

        // Verify sender is the host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", revokeData.SessionID).First(&session).Error; err != nil {
            log.Printf("[revoke_speaker] ❌ Session not found: %v", err)
            return
        }

        if session.HostID != client.userID {
            log.Printf("[revoke_speaker] ❌ User %d is not the host (host is %d)", client.userID, session.HostID)
            return
        }

        // Send revoke response to student
        responseMsg := map[string]interface{}{
            "type": "hand_raised_response",
            "data": map[string]interface{}{
                "approved":   false,
                "session_id": revokeData.SessionID,
            },
        }

        if responseBytes, err := json.Marshal(responseMsg); err == nil {
            client.hub.BroadcastToUser(revokeData.TargetUserID, client.roomID, OutgoingMessage{Data: responseBytes, IsBinary: false})
            log.Printf("[revoke_speaker] 📨 Sent revoke to user %d", revokeData.TargetUserID)
        }

        // Broadcast speaker_revoked to all room members
        revokedMsg := map[string]interface{}{
            "type": "speaker_revoked",
            "data": map[string]interface{}{
                "user_id":    revokeData.TargetUserID,
                "session_id": revokeData.SessionID,
            },
        }

        if revokedBytes, err := json.Marshal(revokedMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: revokedBytes, IsBinary: false}, nil)
            log.Printf("[revoke_speaker] 📢 Broadcasted speaker_revoked to room %d", client.roomID)
        }
        return
    }

    // ✅ Handle toggle_discussion_mode - Host toggles discussion mode for session
    if msg.Type == "toggle_discussion_mode" {
        var discussionData struct {
            DiscussionMode bool   `json:"discussion_mode"`
            SessionID      string `json:"session_id"`
        }

        if m, ok := msg.Data.(map[string]interface{}); ok {
            if dm, ok := m["discussion_mode"].(bool); ok {
                discussionData.DiscussionMode = dm
            }
            if sid, ok := m["session_id"].(string); ok {
                discussionData.SessionID = sid
            }
        }

        log.Printf("[toggle_discussion_mode] 🎤 User %d toggling discussion mode to %v (session %s)", 
            client.userID, discussionData.DiscussionMode, discussionData.SessionID)

        // Verify sender is the host
        var session models.WatchSession
        if err := DB.Where("session_id = ?", discussionData.SessionID).First(&session).Error; err != nil {
            log.Printf("[toggle_discussion_mode] ❌ Session not found: %v", err)
            return
        }

        if session.HostID != client.userID {
            log.Printf("[toggle_discussion_mode] ❌ User %d is not the host (host is %d)", client.userID, session.HostID)
            return
        }

        // Update session discussion_mode in database
        if err := DB.Model(&session).Update("discussion_mode", discussionData.DiscussionMode).Error; err != nil {
            log.Printf("[toggle_discussion_mode] ❌ Failed to update discussion mode: %v", err)
            return
        }

        log.Printf("[toggle_discussion_mode] ✅ Updated session %s discussion_mode to %v", 
            discussionData.SessionID, discussionData.DiscussionMode)

        // Broadcast discussion_mode_changed to all room members
        modeMsg := map[string]interface{}{
            "type": "discussion_mode_changed",
            "data": map[string]interface{}{
                "discussion_mode": discussionData.DiscussionMode,
                "session_id":      discussionData.SessionID,
            },
        }

        if modeBytes, err := json.Marshal(modeMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: modeBytes, IsBinary: false}, nil)
            log.Printf("[toggle_discussion_mode] 📢 Broadcasted discussion_mode_changed to room %d", client.roomID)
        }
        return
    }

    // ===========================
    // 📝 QUIZ SYSTEM HANDLERS
    // ===========================
    
    // ✅ Handle quiz_create - Host creates a new quiz
    if msg.Type == "quiz_create" {
        client.HandleQuizCreate(msg)
        return
    }

    // ✅ Handle quiz_publish - Host publishes quiz to students
    if msg.Type == "quiz_publish" {
        client.HandleQuizPublish(msg)
        return
    }

    // ✅ Handle quiz_request - Student requests quiz data
    if msg.Type == "quiz_request" {
        client.HandleQuizRequest(msg)
        return
    }

    // ✅ Handle quiz_submit - Student submits answers
    if msg.Type == "quiz_submit" {
        client.HandleQuizSubmit(msg)
        return
    }

    // ✅ Handle quiz_end - Host ends a quiz
    if msg.Type == "quiz_end" {
        client.HandleQuizEnd(msg)
        return
    }

    // ✅ Handle quiz_progress - Host requests quiz progress
    if msg.Type == "quiz_progress" {
        client.HandleQuizProgress(msg)
        return
    }

    // ✅ Handle quiz_history_request - Member requests quiz history
    if msg.Type == "quiz_history_request" {
        client.HandleQuizHistory(msg)
        return
    }

    // ✅ Handle quiz_export_request - Export quiz results to JSON
    if msg.Type == "quiz_export_request" {
        client.HandleQuizExportRequest(msg)
        return
    }
    
    // ✅ Handle leave_session - User explicitly leaves the session
    if msg.Type == "leave_session" {
        var leaveData struct {
            UserID uint `json:"user_id"`
        }

        // ✅ FIX: Frontend sends {"type":"leave_session","user_id":5}
        // This unmarshals into msg.UserID (top-level field), NOT msg.Data
        if msg.UserID > 0 {
            leaveData.UserID = msg.UserID
            log.Printf("[leave_session] ✅ Using msg.UserID: %d", leaveData.UserID)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            // Fallback: try parsing from msg.Data if it exists
            log.Printf("[leave_session] 🔍 Fallback: checking msg.Data = %+v", m)
            if uid, ok := m["user_id"].(float64); ok {
                leaveData.UserID = uint(uid)
                log.Printf("[leave_session] ✅ Parsed from msg.Data as float64: %d", leaveData.UserID)
            }
        } else {
            log.Printf("[leave_session] ❌ No user_id found in msg.UserID or msg.Data")
        }

        log.Printf("[leave_session] 👋 User %d is leaving session in room %d", leaveData.UserID, client.roomID)

        // Mark user as inactive in the database (only if they're in a session)
        var activeSession models.WatchSession
        if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&activeSession).Error; err == nil {
            now := time.Now()
            result := DB.Model(&models.WatchSessionMember{}).
                Where("watch_session_id = ? AND user_id = ? AND is_active = ?", activeSession.ID, leaveData.UserID, true).
                Updates(map[string]interface{}{
                    "is_active": false,
                    "left_at":   now,
                })

            if result.Error != nil {
                log.Printf("[leave_session] ❌ Failed to mark user %d as inactive: %v", leaveData.UserID, result.Error)
            } else if result.RowsAffected > 0 {
                log.Printf("[leave_session] ✅ Marked user %d as inactive in session %s", leaveData.UserID, activeSession.SessionID)
                
                // 💾 CLEAR SEAT_ID FROM DATABASE when leaving session
                clearResult := DB.Model(&models.WatchSessionMember{}).
                    Where("watch_session_id = ? AND user_id = ?", activeSession.ID, leaveData.UserID).
                    Update("seat_id", nil)
                
                if clearResult.Error != nil {
                    log.Printf("❌ [DB] Failed to clear seat_id: %v", clearResult.Error)
                } else if clearResult.RowsAffected > 0 {
                    log.Printf("👋 [DB] User %d seat cleared", leaveData.UserID)
                }
            }
        }

        // Remove user from seating assignments
        client.hub.seatingMutex.Lock()
        if roomHalls, exists := client.hub.seatingAssignments[client.roomID]; exists {
            // Search all halls for this user's seat
            for _, hallSeats := range roomHalls {
                for seatID, userID := range hallSeats {
                    if userID == leaveData.UserID {
                        delete(hallSeats, seatID)
                        log.Printf("👋 [SEAT] User %d left seat %s", leaveData.UserID, seatID)
                    
                        // Broadcast seat_released to inform others
                        seatReleasedMsg := WebSocketMessage{
                            Type: "seat_released",
                            Data: map[string]interface{}{
                                "seat_id": seatID,
                                "user_id": leaveData.UserID,
                            },
                        }
                        if seatBytes, err := json.Marshal(seatReleasedMsg); err == nil {
                            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: seatBytes, IsBinary: false}, client)
                            log.Printf("[leave_session] 📢 Broadcasted seat_released for seat %s", seatID)
                        }
                    }
                }
            }
        }
        client.hub.seatingMutex.Unlock()

        // Count remaining members once — used in session_member_left broadcast AND cleanup below.
        var remainingCount int64
        DB.Model(&models.WatchSessionMember{}).
            Where("watch_session_id = ? AND is_active = ?", activeSession.ID, true).
            Count(&remainingCount)

        // ✅ Fetch user info and broadcast user_left + session_member_left to all room members.
        var leavingUser models.User
        if err := DB.First(&leavingUser, leaveData.UserID).Error; err == nil {
            userLeftMsg := WebSocketMessage{
                Type: "user_left",
                Data: map[string]interface{}{
                    "userId":       leaveData.UserID,
                    "username":     leavingUser.Username,
                    "sessionId":    activeSession.SessionID,
                    "member_count": remainingCount,
                },
            }
            if leftBytes, err := json.Marshal(userLeftMsg); err == nil {
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: leftBytes, IsBinary: false}, client)
                log.Printf("[leave_session] 📢 Broadcasted user_left for user %d (%s) to room %d", leaveData.UserID, leavingUser.Username, client.roomID)
            }

            // ✅ EVENT-DRIVEN: Broadcast session_member_left with authoritative count
            memberLeftMsg := WebSocketMessage{
                Type: "session_member_left",
                Data: map[string]interface{}{
                    "user_id":      leaveData.UserID,
                    "username":     leavingUser.Username,
                    "session_id":   activeSession.SessionID,
                    "member_count": remainingCount,
                },
            }
            if memberLeftBytes, err := json.Marshal(memberLeftMsg); err == nil {
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: memberLeftBytes, IsBinary: false}, nil)
                log.Printf("[leave_session] 📢 Broadcasted session_member_left for user %d (%s) — count: %d", leaveData.UserID, leavingUser.Username, remainingCount)
            }
        }

        // ✅ Last user left — clean up temporary files and previews
        if remainingCount == 0 {
            log.Printf("🔴 [leave_session] Last user left session %s - auto-cleaning temporary files and previews", activeSession.SessionID)

            var tempItems []models.TemporaryMediaItem
            if err := DB.Where("session_id = ?", activeSession.SessionID).Find(&tempItems).Error; err == nil {
                deletedFiles := 0
                for _, item := range tempItems {
                    if err := utils.DeleteMediaFile(item.FilePath); err != nil {
                        log.Printf("⚠️ Failed to delete temp file %s: %v", item.FilePath, err)
                    } else {
                        deletedFiles++
                    }
                    if item.PosterURL != "" && item.PosterURL != "/icons/placeholder-poster.jpg" {
                        utils.DeleteMediaFile(item.PosterURL) //nolint
                    }
                    DB.Delete(&item)
                }
                if deletedFiles > 0 {
                    log.Printf("✅ [leave_session] Deleted %d temporary files", deletedFiles)
                }
            }

            previewsDeleted := 0
            for _, dir := range []string{"./uploads/temp", "./uploads"} {
                if entries, err := os.ReadDir(dir); err == nil {
                    for _, entry := range entries {
                        if strings.Contains(entry.Name(), "_preview") {
                            if err := os.Remove(filepath.Join(dir, entry.Name())); err == nil {
                                previewsDeleted++
                            }
                        }
                    }
                }
            }
            if previewsDeleted > 0 {
                log.Printf("✅ [leave_session] Deleted %d preview files", previewsDeleted)
            }
        }

        // Push updated count to lobby so session cards stay current
        if countMsg, err := json.Marshal(map[string]interface{}{
            "type":       "media_state_changed",
            "session_id": activeSession.SessionID,
            "data":       map[string]interface{}{"member_count": remainingCount},
        }); err == nil {
            client.hub.BroadcastToLobby(OutgoingMessage{Data: countMsg, IsBinary: false})
        }

        // ✅ EVENT-DRIVEN: Send acknowledgment back to the sender
        // This allows frontend to know the leave was processed before disconnecting
        ackMsg := WebSocketMessage{
            Type: "leave_acknowledged",
            Data: map[string]interface{}{
                "user_id": leaveData.UserID,
                "status":  "success",
            },
        }
        if ackBytes, err := json.Marshal(ackMsg); err == nil {
            select {
            case client.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
                log.Printf("[leave_session] ✅ Sent leave_acknowledged to user %d", leaveData.UserID)
            default:
                log.Printf("[leave_session] ⚠️ Failed to send leave_acknowledged (channel full or closed)")
            }
        }

        return
    }
    
    // ✅ Handle update_media_state: Update session's current media state for preview generation
    if msg.Type == "update_media_state" {
        var mediaData struct {
            SessionID             string `json:"session_id"`
            CurrentMediaURL       string `json:"current_media_url"`
            CurrentMediaType      string `json:"current_media_type"`
            IsScreenSharingActive bool   `json:"is_screen_sharing_active"`
            SharingSource         string `json:"sharing_source"`
        }
        
        if err := json.Unmarshal(message, &msg); err == nil {
            if dataBytes, err := json.Marshal(msg.Data); err == nil {
                if err := json.Unmarshal(dataBytes, &mediaData); err == nil {
                    log.Printf("[update_media_state] 📺 Updating media state for session %s: url=%s, type=%s, sharing=%v, source=%s", 
                        mediaData.SessionID, mediaData.CurrentMediaURL, mediaData.CurrentMediaType, 
                        mediaData.IsScreenSharingActive, mediaData.SharingSource)
                    
                // ✅ Read OLD media type BEFORE updating (needed for type change detection)
                var oldSession models.WatchSession
                oldTypeErr := DB.Where("session_id = ?", mediaData.SessionID).First(&oldSession).Error
                oldMediaType := ""
                if oldTypeErr == nil {
                    oldMediaType = oldSession.CurrentMediaType
                }
                
                // Update session in database
                updates := map[string]interface{}{
                    "current_media_url":        mediaData.CurrentMediaURL,
                    "current_media_type":       mediaData.CurrentMediaType,
                    "is_screen_sharing_active": mediaData.IsScreenSharingActive,
                    "sharing_source":           mediaData.SharingSource,
                }
                
                result := DB.Model(&models.WatchSession{}).
                    Where("session_id = ?", mediaData.SessionID).
                    Updates(updates)
                
                if result.Error != nil {
                    log.Printf("[update_media_state] ❌ Failed to update session: %v", result.Error)
                } else {
                    log.Printf("[update_media_state] ✅ Updated media state for session %s (%d rows)", 
                        mediaData.SessionID, result.RowsAffected)
                    
                    // ✅ EVENT-DRIVEN: Handle media state change for preview system
                    // Pass old type so handler can detect type changes
                    if mediaSwitchHandler != nil {
                        // Detect type change and clear old preview
                        if oldMediaType != "" && oldMediaType != mediaData.CurrentMediaType {
                            log.Printf("🔄 [update_media_state] Type change detected: %s → %s", oldMediaType, mediaData.CurrentMediaType)
                            mediaSwitchHandler.ClearOldPreview(mediaData.SessionID, oldMediaType)
                        }
                        
                        mediaSwitchHandler.HandleMediaStateChanged(
                            mediaData.SessionID,
                            mediaData.SharingSource,
                            mediaData.IsScreenSharingActive,
                        )
                    }
                    
                    // ✅ Broadcast to lobby for instant preview generation
                    lobbyNotification := map[string]interface{}{
                        "type":       "media_state_changed",
                        "session_id": mediaData.SessionID,
                        "data": map[string]interface{}{
                            "current_media_type":       mediaData.CurrentMediaType,
                            "is_screen_sharing_active": mediaData.IsScreenSharingActive,
                            "sharing_source":           mediaData.SharingSource,
                        },
                    }
                    notificationJSON, _ := json.Marshal(lobbyNotification)
                    hub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
                    log.Printf("[update_media_state] 📢 Broadcasted media_state_changed to lobby for session %s", mediaData.SessionID)
                }
                } else {
                    log.Printf("[update_media_state] ❌ Failed to unmarshal media data: %v", err)
                }
            }
        }
        
        return
    }
    
    // ✅ Handle media_play: Uploaded media starts playing
    if msg.Type == "media_play" {
        var playData struct {
            SessionID   string `json:"session_id"`
            MediaID     uint   `json:"media_id"`
            URL         string `json:"url"`
            Type        string `json:"type"`
            Title       string `json:"title"`
            IsTemporary bool   `json:"is_temporary"`
        }
        
        if dataBytes, err := json.Marshal(msg.Data); err == nil {
            if err := json.Unmarshal(dataBytes, &playData); err == nil {
                log.Printf("[media_play] 🎬 Media play event: session=%s, media_id=%d, url=%s", 
                    playData.SessionID, playData.MediaID, playData.URL)
                
                // Determine file path from URL or media ID
                var mediaPath string
                if playData.IsTemporary {
                    var tempMedia models.TemporaryMediaItem
                    if err := DB.First(&tempMedia, playData.MediaID).Error; err == nil {
                        mediaPath = tempMedia.FilePath
                    }
                } else {
                    var media models.MediaItem
                    if err := DB.First(&media, playData.MediaID).Error; err == nil {
                        mediaPath = media.FilePath
                    }
                }
                
                if mediaPath != "" && mediaSwitchHandler != nil {
                    mediaSwitchHandler.HandleMediaPlay(
                        playData.SessionID,
                        playData.MediaID,
                        mediaPath,
                        playData.URL,
                        playData.IsTemporary,
                    )
                } else {
                    log.Printf("[media_play] ⚠️ Could not find media path for media_id=%d", playData.MediaID)
                }
            }
        }
        
        // Broadcast to room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
        return
    }
    
    // ✅ Handle video_time_update: Track current playback position for preview refresh
    if msg.Type == "video_time_update" {
        var timeData struct {
            SessionID   string `json:"session_id"`
            CurrentTime int    `json:"current_time"`
        }
        
        if dataBytes, err := json.Marshal(msg.Data); err == nil {
            if err := json.Unmarshal(dataBytes, &timeData); err == nil {
                if mediaSwitchHandler != nil {
                    mediaSwitchHandler.HandleVideoTimeUpdate(timeData.SessionID, timeData.CurrentTime)
                }
            }
        }
        
        // No broadcast needed for time updates
        return
    }
    
    // ✅ Handle media_stop: Media playback stopped
    if msg.Type == "media_stop" {
        var stopData struct {
            SessionID string `json:"session_id"`
        }
        
        if dataBytes, err := json.Marshal(msg.Data); err == nil {
            if err := json.Unmarshal(dataBytes, &stopData); err == nil {
                log.Printf("[media_stop] ⏹️ Media stop event: session=%s", stopData.SessionID)
                
                if mediaSwitchHandler != nil {
                    mediaSwitchHandler.HandleMediaStop(stopData.SessionID)
                }
                
                // ✅ Broadcast media_state_changed to lobby
                lobbyNotification := map[string]interface{}{
                    "type":       "media_state_changed",
                    "session_id": stopData.SessionID,
                    "data": map[string]interface{}{
                        "current_media_type":       "none",
                        "is_screen_sharing_active": false,
                        "sharing_source":           nil,
                    },
                }
                notificationJSON, _ := json.Marshal(lobbyNotification)
                hub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
                log.Printf("[media_stop] 📢 Broadcasted media_state_changed to lobby for session %s", stopData.SessionID)
            }
        }
        
        // Broadcast to room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
        return
    }
    
    // ✅ Handle playback_control: Video player play/pause/seek commands
    if msg.Type == "playback_control" {
        var playbackData struct {
            Type         string `json:"type"`
            Command      string `json:"command"`       // "play", "pause", "seek"
            MediaItemID  uint   `json:"media_item_id"` // Media ID
            FilePath     string `json:"file_path"`     // Server file path
            FileURL      string `json:"file_url"`      // Public URL
            OriginalName string `json:"original_name"` // Display name
            SeekTime     int    `json:"seek_time"`     // Position in seconds
        }
        
        // Unmarshal entire message (fields are at top level, not in msg.Data)
        if err := json.Unmarshal(message, &playbackData); err == nil {
            log.Printf("[playback_control] 🎮 Command=%s, MediaID=%d, FilePath=%s, SeekTime=%d", 
                playbackData.Command, playbackData.MediaItemID, playbackData.FilePath, playbackData.SeekTime)
            
            // Get active session for this room
            var session models.WatchSession
            if err := DB.Where("room_id = ? AND ended_at IS NULL", client.roomID).First(&session).Error; err == nil {
                sessionID := session.SessionID
                
                // ✅ UPDATE PLAYBACK TIME: Track seek position for all commands (play, pause, seek)
                // This ensures 5-minute preview refresh uses accurate timestamp
                if playbackData.SeekTime >= 0 {
                    DB.Model(&models.WatchSession{}).
                        Where("session_id = ?", sessionID).
                        Update("current_playback_time", playbackData.SeekTime)
                    log.Printf("[playback_control] 📍 Updated session %s playback time to %d seconds", sessionID, playbackData.SeekTime)
                }
                
                // Only trigger preview generation on "play" command with valid media
                if playbackData.Command == "play" && playbackData.MediaItemID > 0 && playbackData.FilePath != "" {
                    // Determine if temporary or permanent media
                    var isTemporary bool
                    var tempMedia models.TemporaryMediaItem
                    if err := DB.First(&tempMedia, playbackData.MediaItemID).Error; err == nil {
                        isTemporary = true
                    }
                    
                    log.Printf("[playback_control] 🎬 Triggering preview for session=%s, media=%d, temp=%v", 
                        sessionID, playbackData.MediaItemID, isTemporary)
                    
                    // Trigger preview generation via media switch handler
                    if mediaSwitchHandler != nil {
                        mediaSwitchHandler.HandleMediaPlay(
                            sessionID,
                            playbackData.MediaItemID,
                            playbackData.FilePath,
                            playbackData.FileURL,
                            isTemporary,
                        )
                    }
                    
                    // ✅ Broadcast media_state_changed to lobby
                    lobbyNotification := map[string]interface{}{
                        "type":       "media_state_changed",
                        "session_id": sessionID,
                        "data": map[string]interface{}{
                            "current_media_type":       "upload",
                            "is_screen_sharing_active": false,
                            "sharing_source":           nil,
                            "session_title":            playbackData.OriginalName,
                            "currently_playing":        playbackData.OriginalName,
                        },
                    }
                    notificationJSON, _ := json.Marshal(lobbyNotification)
                    hub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
                    log.Printf("[playback_control] 📢 Broadcasted media_state_changed to lobby for session %s", sessionID)
                }
            } else {
                log.Printf("[playback_control] ⚠️ Could not find active session for room %d", client.roomID)
            }
        }
        
        // Inject server_ts before relay so all members use a common clock for
        // latency compensation instead of comparing two potentially-drifted device clocks.
        var pcMap map[string]interface{}
        if err := json.Unmarshal(message, &pcMap); err == nil {
            pcMap["server_ts"] = time.Now().UnixMilli()
            if relayMsg, err := json.Marshal(pcMap); err == nil {
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: relayMsg, IsBinary: false}, client)
                return
            }
        }
        // Fallback: relay without server_ts
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
        return
    }

    // Handle sync_heartbeat: host → members periodic position sync.
    // Relay immediately with server_ts; no DB write needed (high-frequency, low-cost).
    if msg.Type == "sync_heartbeat" {
        var hbMap map[string]interface{}
        if err := json.Unmarshal(message, &hbMap); err == nil {
            hbMap["server_ts"] = time.Now().UnixMilli()
            if relayMsg, err := json.Marshal(hbMap); err == nil {
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: relayMsg, IsBinary: false}, client)
            }
        }
        return
    }

    // ✅ Handle screen_share_started: LiveShare/WatchFrom screen sharing begins
    if msg.Type == "screen_share_started" {
        var shareData struct {
            SessionID     string `json:"session_id"`
            SharingSource string `json:"sharing_source"` // "liveshare" or "watchfrom"
            UserID        uint   `json:"user_id"`        // Who started sharing
        }
        
        if dataBytes, err := json.Marshal(msg.Data); err == nil {
            if err := json.Unmarshal(dataBytes, &shareData); err == nil {
                log.Printf("[screen_share_started] 📺 Screen sharing started: session=%s, source=%s, user=%d", 
                    shareData.SessionID, shareData.SharingSource, shareData.UserID)
                
                // Trigger preview generation for screen share
                if mediaSwitchHandler != nil {
                    mediaSwitchHandler.HandleMediaStateChanged(
                        shareData.SessionID,
                        shareData.SharingSource,
                        true, // isActive = true
                    )
                }
                
                // ✅ Broadcast media_state_changed to lobby
                lobbyNotification := map[string]interface{}{
                    "type":       "media_state_changed",
                    "session_id": shareData.SessionID,
                    "data": map[string]interface{}{
                        "current_media_type":       shareData.SharingSource, // "liveshare" or "watchfrom"
                        "is_screen_sharing_active": true,
                        "sharing_source":           shareData.SharingSource,
                    },
                }
                notificationJSON, _ := json.Marshal(lobbyNotification)
                hub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
                log.Printf("[screen_share_started] 📢 Broadcasted media_state_changed to lobby for session %s", shareData.SessionID)
            }
        }
        
        // Broadcast to room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
        return
    }
    
    // ✅ Handle screen_share_stopped: LiveShare/WatchFrom screen sharing ends
    if msg.Type == "screen_share_stopped" {
        var shareData struct {
            SessionID string `json:"session_id"`
            UserID    uint   `json:"user_id"`
        }
        
        if dataBytes, err := json.Marshal(msg.Data); err == nil {
            if err := json.Unmarshal(dataBytes, &shareData); err == nil {
                log.Printf("[screen_share_stopped] 📺 Screen sharing stopped: session=%s, user=%d", 
                    shareData.SessionID, shareData.UserID)
                
                // Clear preview and stop refresh timer
                if mediaSwitchHandler != nil {
                    mediaSwitchHandler.HandleMediaStateChanged(
                        shareData.SessionID,
                        "", // Clear sharing source
                        false, // isActive = false
                    )
                }
                
                // ✅ Broadcast media_state_changed to lobby
                lobbyNotification := map[string]interface{}{
                    "type":       "media_state_changed",
                    "session_id": shareData.SessionID,
                    "data": map[string]interface{}{
                        "current_media_type":       "none",
                        "is_screen_sharing_active": false,
                        "sharing_source":           nil,
                    },
                }
                notificationJSON, _ := json.Marshal(lobbyNotification)
                hub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
                log.Printf("[screen_share_stopped] 📢 Broadcasted media_state_changed to lobby for session %s", shareData.SessionID)
            }
        }
        
        // Broadcast to room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
        return
    }
    
    // ✅ Default: Broadcast all other message types to room
    // This handles: update_room_status, platform_selected, etc.
    log.Printf("[handleMessage] 📢 Broadcasting message type '%s' to room %d", msg.Type, client.roomID)
    client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
}