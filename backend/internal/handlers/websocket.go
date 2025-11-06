// WeWatch/backend/internal/handlers/websocket.go

package handlers

import (
	"encoding/json"
    "context" 
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// - Define Message Types -
type WebSocketMessage struct {
	Type        string      `json:"type"`
	Command     string      `json:"command,omitempty"` // For playback control, screen share commands
	MediaItemID uint        `json:"media_item_id,omitempty"`
	UserID      uint        `json:"user_id,omitempty"`
	RoomID      uint        `json:"room_id,omitempty"`
	Data        interface{} `json:"data,omitempty"`
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
	isStreamHost     bool                 // Flag to indicate if this client is currently the stream host
	isReceivingStream bool                // Flag to indicate if this client is receiving a screen share
	lastStreamChunk  time.Time            // Last time a stream chunk was received or sent
    hasReceivedInitSegment bool           //
}

// - WebSocket Hub -
var hub *Hub

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

	// Track which user is streaming in each room (server broadcast)
	roomStreamHost  map[uint]uint  // roomID -> userID of the stream host
	roomStreamActive map[uint]bool // roomID -> true if a stream is active
	// Mutex for stream state maps
	streamStateMutex sync.RWMutex

	// Track binary message flow for each room
	roomStreamStats map[uint]*RoomStreamStats
	streamStatsMutex sync.RWMutex

	// Screen sharing state management
	screenShares map[uint]*ScreenShareState  // roomID -> screen share state
	screenShareMutex sync.RWMutex
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

func (h *Hub) trackBinaryMessage(roomID uint, size int) {
    h.streamStatsMutex.Lock()
    defer h.streamStatsMutex.Unlock()

    if stats, exists := h.roomStreamStats[roomID]; exists {
        stats.chunkCount++
        stats.lastChunkTime = time.Now()
    }
}

func (hub *Hub) handleDisconnect(client *Client) {
    // If the disconnecting client is the screen share host, mark DB inactive
    var dbShare models.ScreenShare
    if err := DB.Where("room_id = ? AND host_id = ? AND active = ?", client.roomID, client.userID, true).First(&dbShare).Error; err == nil {
        dbShare.Active = false
        now := time.Now()
        dbShare.EndedAt = &now
        DB.Save(&dbShare)
        // --- Clean up in-memory screen share state if this client is the host ---
        hub.screenShareMutex.Lock()
        state, exists := hub.screenShares[client.roomID]
        if exists && state.Host == client {
            delete(hub.screenShares, client.roomID)
            log.Printf("[ScreenShare] Cleaned up in-memory screen share state for room %d due to host disconnect", client.roomID)
        }
        hub.screenShareMutex.Unlock()
    }
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	return &Hub{
		broadcast:        make(chan OutgoingMessage, 2048),
		broadcastToRoom:  make(chan RoomBroadcastMessage, 2048),
		broadcastToUsers: make(chan UserBroadcastMessage, 2048),
		register:         make(chan *Client, 256),
		unregister:       make(chan *Client, 256),
		rooms:            make(map[uint]map[*Client]bool),
		activeSessions:   make(map[string]*models.WatchSession),
		sessionMembers:   make(map[string]map[*Client]bool),
		orphanedSessions: make(map[string]time.Time),
		roomStreamHost:   make(map[uint]uint),
		roomStreamActive: make(map[uint]bool),
		roomStreamStats:  make(map[uint]*RoomStreamStats),
		screenShares:     make(map[uint]*ScreenShareState),
        clientRegistry: make(map[uint]map[uint]*Client),
	}
}

// Start broadcast worker goroutines for the Hub. Processes room/user broadcasts and fans out to clients.
func (h *Hub) startBroadcastWorkers() {
    // Room broadcast worker
    go func() {
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

// JoinWatchSession adds a client to an active watch session
func (h *Hub) JoinWatchSession(sessionID string, client *Client) error {
    h.sessionMutex.Lock()
    defer h.sessionMutex.Unlock()

    session, exists := h.activeSessions[sessionID]
    if (!exists) {
        return fmt.Errorf("watch session %s does not exist", sessionID)
    }

    // Initialize members map if needed
    if _, exists := h.sessionMembers[sessionID]; !exists {
        h.sessionMembers[sessionID] = make(map[*Client]bool)
    }

    // Add client to session members
    h.sessionMembers[sessionID][client] = true
    

    // Create or update session member record
    member := models.WatchSessionMember{
        WatchSessionID: session.ID,
        UserID:        client.userID,
        JoinedAt:      time.Now(),
        IsActive:      true,
        UserRole:      "viewer",
    }

    if err := DB.Create(&member).Error; err != nil {
        delete(h.sessionMembers[sessionID], client)
        return fmt.Errorf("failed to record session member: %v", err)
    }

    return nil
}

// cleanupClientSync removes a client from all hub state immediately
func (h *Hub) cleanupClientSync(client *Client) {
    log.Printf("[cleanupClientSync] 🧹 Starting cleanup for client %p (user %d, room %d)", client, client.userID, client.roomID)
    
    // 1. Remove from rooms
    h.mutex.Lock()
    if roomClients, ok := h.rooms[client.roomID]; ok {
        if _, exists := roomClients[client]; exists {
            delete(roomClients, client)
            log.Printf("[cleanupClientSync] 🔹 Closing send channel for client %p", client)
            close(client.send)
            if len(roomClients) == 0 {
                delete(h.rooms, client.roomID)
            }
        }
    }
    h.mutex.Unlock()

    // 2. Clean up clientRegistry
    // ⚠️ NO LOCK HERE - caller (WebSocketHandler) already holds registryMutex during deduplication
    // This prevents deadlock when called from within the registryMutex.Lock() block
    if userMap, exists := h.clientRegistry[client.userID]; exists {
        delete(userMap, client.roomID)
        if len(userMap) == 0 {
            delete(h.clientRegistry, client.userID)
        }
    }

    // 3. Clean up stream host state
    h.streamStateMutex.Lock()
    if hostID, isStreaming := h.roomStreamHost[client.roomID]; isStreaming && hostID == client.userID {
        delete(h.roomStreamHost, client.roomID)
        h.roomStreamActive[client.roomID] = false
    }
    h.streamStateMutex.Unlock()

    // 4. DB cleanup for screen share
    var dbShare models.ScreenShare
    if err := DB.Where("room_id = ? AND host_id = ? AND active = ?", client.roomID, client.userID, true).First(&dbShare).Error; err == nil {
        dbShare.Active = false
        now := time.Now()
        dbShare.EndedAt = &now
        DB.Save(&dbShare)
    }

    // 5. Force-close connection
    log.Printf("[cleanupClientSync] 🔌 Force-closing WebSocket connection for client %p", client)
    client.conn.Close()
    log.Printf("[cleanupClientSync] ✅ Cleanup complete for client %p", client)
}

// Run manages the registration, unregistration, and broadcasting of messages.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			roomClients, ok := h.rooms[client.roomID]
			if !ok {
				roomClients = make(map[*Client]bool)
				h.rooms[client.roomID] = roomClients
			}
			roomClients[client] = true
			h.mutex.Unlock()
			log.Printf("Hub: Client %p (User %d) registered for room %d", client, client.userID, client.roomID)

		case client := <-h.unregister:
			h.mutex.Lock()
			roomClients, ok := h.rooms[client.roomID]
			if ok {
				if _, exists := roomClients[client]; exists {
					delete(roomClients, client)
					close(client.send)
					log.Printf("Hub: Client %p (User %d) unregistered from room %d", client, client.userID, client.roomID)

					// Check if this client was the stream host
					h.streamStateMutex.Lock()
					if hostID, isStreaming := h.roomStreamHost[client.roomID]; isStreaming && hostID == client.userID {
						// Stream host disconnected, stop the stream
						delete(h.roomStreamHost, client.roomID)
						h.roomStreamActive[client.roomID] = false
						h.streamStateMutex.Unlock()

						// Broadcast stop message
						stopMsg := ScreenShareSignal{
							Type:      "screen_share_stopped",
							Data:      map[string]interface{}{"user_id": client.userID},
							Timestamp: time.Now().Unix(),
						}
						if broadcastBytes, err := json.Marshal(stopMsg); err == nil {
							h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, client) // Exclude the disconnected host
							log.Printf("Hub: Broadcasted screen share stopped due to host (User %d) disconnection for room %d", client.userID, client.roomID)
						} else {
							log.Printf("Hub: Error marshalling screen share stop message for room %d: %v", client.roomID, err)
						}
					} else {
						h.streamStateMutex.Unlock()
					}

					// If the disconnecting client is the screen share host, mark DB inactive
					var dbShare models.ScreenShare
					if err := DB.Where("room_id = ? AND host_id = ? AND active = ?", client.roomID, client.userID, true).First(&dbShare).Error; err == nil {
						dbShare.Active = false
						now := time.Now()
						dbShare.EndedAt = &now
						DB.Save(&dbShare)
					}

					// Check if the room is now empty
					if len(roomClients) == 0 {
						delete(h.rooms, client.roomID)
						log.Printf("Hub: Room %d is now empty, cleaned up client map.", client.roomID)
						// Potentially clean up other room-specific state here if needed
					}
				}
			}
			h.mutex.Unlock()
            // 🔥 Clean up clientRegistry
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
					select {
					case client.send <- message:
					default:
						log.Printf("Hub: Dropping message for client %p (buffer full)", client)
						// Consider closing the client connection if buffer is consistently full
					}
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
					select {
					case client.send <- roomBroadcast.data:
					default:
						log.Printf("Hub: Dropping message for client %p in room %d (buffer full)", client, roomBroadcast.roomID)
					}
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
    log.Printf("[readPump] 🔄 Entering read loop for user %d in room %d (client=%p)", c.userID, c.roomID, c)
    
    defer func() {
        log.Printf("[readPump] 🛑 Exiting read loop for user %d (client=%p)", c.userID, c)
        c.hub.unregister <- c
        c.conn.Close()
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
        case websocket.BinaryMessage:
            // Log and dispatch binary frames to the screen-share handler
            log.Printf("[readPump][DEBUG] BinaryMessage received: user_id=%d room_id=%d bytes=%d", c.userID, c.roomID, len(message))
            // Best-effort dispatch to handler (do not block read loop)
            go func(msg []byte, clientRef *Client) {
                defer func() {
                    if r := recover(); r != nil {
                        log.Printf("[readPump][ERROR] panic dispatching binary message: %v", r)
                    }
                }()
                clientRef.handleBinaryMessage(msg)
            }(message, c)

        case websocket.TextMessage:
            log.Printf("[readPump][DEBUG] TextMessage received: user_id=%d room_id=%d bytes=%d content=%s", c.userID, c.roomID, len(message), string(message))
            log.Printf("📨 Text message received from user %d: %s", c.userID, string(message))
            c.handleMessage(message)
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
		// Allow frontend dev server and backend
		return origin == "http://localhost:5173" || origin == "http://localhost:8080" || origin == ""
	},
}


// WebSocketHandler handles the WebSocket upgrade request.
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

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocketHandler: WebSocket upgrade failed: %v", err)
		return
	}

	// --- Session logic ---
	var watchSession models.WatchSession
	sessionID := c.Query("session_id")

	if sessionID != "" {
		if err := DB.Where("session_id = ? AND ended_at IS NULL", sessionID).First(&watchSession).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				watchSession = models.WatchSession{
					SessionID: sessionID,
					RoomID:    roomID,
					HostID:    authenticatedUserID,
					StartedAt: time.Now(),
				}
				if err := DB.Create(&watchSession).Error; err != nil {
					log.Printf("Failed to create watch session: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
					return
				}
			} else {
				log.Printf("Error querying watch session: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
		}
	} else {
		if err := DB.Where("room_id = ? AND ended_at IS NULL", roomID).First(&watchSession).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				sessionID = uuid.New().String()
				watchSession = models.WatchSession{
					SessionID: sessionID,
					RoomID:    roomID,
					HostID:    authenticatedUserID,
					StartedAt: time.Now(),
				}
				if err := DB.Create(&watchSession).Error; err != nil {
					log.Printf("Failed to create watch session: %v", err)
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
					return
				}
			} else {
				log.Printf("Error querying watch session: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
				return
			}
		}
		sessionID = watchSession.SessionID
	}

	hub.sessionMutex.Lock()
	hub.activeSessions[watchSession.SessionID] = &watchSession
	hub.sessionMutex.Unlock()

	client := &Client{
		hub:      hub,
		conn:     conn,
		send:     make(chan OutgoingMessage, 1024),
		roomID:   roomID,
		userID:   authenticatedUserID,
		streamID: sessionID,
	}

	// 🔥 SYNCHRONOUS DEDUPLICATION & REGISTRATION
	var oldClient *Client
	log.Printf("[WebSocketHandler] 🔍 Checking for duplicate connections: user %d, room %d", authenticatedUserID, roomID)

	hub.registryMutex.Lock()
	// Check for existing client first
	if userMap, exists := hub.clientRegistry[authenticatedUserID]; exists {
		if existing, ok := userMap[roomID]; ok {
			oldClient = existing
			log.Printf("[WebSocketHandler] ⚠️ Found DUPLICATE client %p for user %d in room %d", oldClient, authenticatedUserID, roomID)
			hub.cleanupClientSync(oldClient)
		}
	}
	
	// ✅ Always ensure the user's map exists before assigning (cleanup may have deleted it)
	if _, exists := hub.clientRegistry[authenticatedUserID]; !exists {
		hub.clientRegistry[authenticatedUserID] = make(map[uint]*Client)
	}
	hub.clientRegistry[authenticatedUserID][roomID] = client
	log.Printf("[WebSocketHandler] ✅ Registered client %p in clientRegistry for user %d, room %d", client, authenticatedUserID, roomID)
	hub.registryMutex.Unlock()

	// Join the watch session
	if err := hub.JoinWatchSession(sessionID, client); err != nil {
		log.Printf("Failed to join watch session: %v", err)
	}

	// --- COLLECT STARTUP MESSAGES (but DO NOT send yet) ---
	var startupMessages []OutgoingMessage

	// Build session_status
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
			trimmedMembers[i] = map[string]interface{}{
				"id":        m.ID,
				"user_id":   m.UserID,
				"user_role": m.UserRole,
			}
		}

		var isScreenSharing bool = false
		var screenShareHostID uint = 0
		hub.screenShareMutex.RLock()
		if state, exists := hub.screenShares[watchSession.RoomID]; exists && state.Active && state.Host != nil {
			hub.mutex.RLock()
			_, hostStillConnected := hub.rooms[watchSession.RoomID][state.Host]
			hub.mutex.RUnlock()
			if hostStillConnected {
				isScreenSharing = true
				screenShareHostID = state.Host.userID
			} else {
				delete(hub.screenShares, watchSession.RoomID)
				log.Printf("Cleaned up stale screen share state for room %d (host gone)", watchSession.RoomID)
			}
		}
		hub.screenShareMutex.RUnlock()

		statusMsg := WebSocketMessage{
			Type: "session_status",
			Data: map[string]interface{}{
				"session_id":           watchSession.SessionID,
				"host_id":              watchSession.HostID,
				"members":              trimmedMembers,
				"started_at":           watchSession.StartedAt,
				"is_screen_sharing":    isScreenSharing,
				"screen_share_host_id": screenShareHostID,
			},
		}
		if msgBytes, err := json.Marshal(statusMsg); err == nil {
			startupMessages = append(startupMessages, OutgoingMessage{Data: msgBytes, IsBinary: false})
		}
	}

	// Build screen_share_started if active (for late joiners)
	hub.screenShareMutex.RLock()
	if state, exists := hub.screenShares[roomID]; exists && state.Active && state.Host != nil {
		hub.mutex.RLock()
		_, hostStillConnected := hub.rooms[roomID][state.Host]
		hub.mutex.RUnlock()
		if hostStillConnected {
			startMsg := ScreenShareSignal{
				Type:      "screen_share_started",
				Data:      map[string]interface{}{"user_id": state.Host.userID, "timestamp": state.StartTime.Unix(), "mime_type": state.MimeType},
				Timestamp: time.Now().Unix(),
			}
			if startBytes, err := json.Marshal(startMsg); err == nil {
				startupMessages = append(startupMessages, OutgoingMessage{Data: startBytes, IsBinary: false})
			}
		}
	}
	hub.screenShareMutex.RUnlock()

	// ✅ Now register in hub.rooms
	hub.mutex.Lock()
	if _, ok := hub.rooms[roomID]; !ok {
		hub.rooms[roomID] = make(map[*Client]bool)
	}
	hub.rooms[roomID][client] = true
	hub.mutex.Unlock()
	log.Printf("Hub: Client %p (User %d) synchronously registered for room %d", client, authenticatedUserID, roomID)

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
        go hub.Run()
        hub.startBroadcastWorkers()
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

// ScreenShareState manages the state of screen sharing for a room
type ScreenShareState struct {
    BroadcastChannel chan []byte      // Channel for broadcasting screen data
    Viewers         map[*Client]bool  // Active viewers
    Host           *Client           // Current screen share host
    Active         bool              // Whether screen sharing is active
    MimeType       string            // MIME type negotiated/advertised by the host
    StartTime      time.Time         // When screen sharing started
    InitSegment    []byte            // Store init segment for MP4
    mutex          sync.RWMutex      // Mutex for thread-safe state access

    // ✅ Add context for clean shutdown
    ctx    context.Context
    cancel context.CancelFunc
}

func NewScreenShareState() *ScreenShareState {
    ctx, cancel := context.WithCancel(context.Background())
    return &ScreenShareState{
        BroadcastChannel: make(chan []byte, 1024),
        Viewers:          make(map[*Client]bool),
        Active:           false,
        ctx:              ctx,
        cancel:           cancel,
    }
}

// StartScreenShare initializes screen sharing for a room
func (h *Hub) StartScreenShare(roomID uint, host *Client, mimeType string) error {
	h.screenShareMutex.Lock()
	defer h.screenShareMutex.Unlock()

	if state, exists := h.screenShares[roomID]; exists && state.Active {
		log.Printf("[ScreenShare] StartScreenShare: Screen sharing already active in room %d", roomID)
		return fmt.Errorf("screen sharing already active in room %d", roomID)
	}

	state := NewScreenShareState()
	state.Host = host
	state.MimeType = mimeType
	state.Active = true
	state.StartTime = time.Now()
	h.screenShares[roomID] = state

	// ✅ Collect ALL clients in the room from BOTH h.rooms and clientRegistry
	var allClientsInRoom []*Client

	// 1. From h.rooms (fully registered clients)
	h.mutex.RLock()
	if roomClients, ok := h.rooms[roomID]; ok {
		for client := range roomClients {
			allClientsInRoom = append(allClientsInRoom, client)
		}
	}
	h.mutex.RUnlock()

	// 2. From clientRegistry (may include just-connected clients not yet in h.rooms)
	h.registryMutex.RLock()
	for _, userMap := range h.clientRegistry {
		if client, exists := userMap[roomID]; exists {
			// Avoid duplicates
			found := false
			for _, c := range allClientsInRoom {
				if c == client {
					found = true
					break
				}
			}
			if !found {
				allClientsInRoom = append(allClientsInRoom, client)
			}
		}
	}
	h.registryMutex.RUnlock()

	// ✅ Auto-subscribe all non-host clients as viewers
	if len(allClientsInRoom) > 0 {
		state.mutex.Lock()
		log.Printf("[DEBUG] Auto-subscribing viewers for room %d (host: %d, total clients: %d)", roomID, host.userID, len(allClientsInRoom))
		
		viewerCount := 0
		for _, client := range allClientsInRoom {
			// ✅ CRITICAL: Check userID, not pointer (host may have multiple connections during setup)
			if client.userID == host.userID {
				log.Printf("[ScreenShare] Skipping host client %p (user %d) from viewer list", client, client.userID)
				continue
			}
			
			// 🔍 DEBUG: Check for duplicate viewer registration
			if _, alreadyRegistered := state.Viewers[client]; alreadyRegistered {
				log.Printf("[ScreenShare] ⚠️ DUPLICATE: Client %p (user %d) already in viewer list!", client, client.userID)
			}
			
			state.Viewers[client] = true
			viewerCount++
			client.isReceivingStream = true
			client.lastStreamChunk = time.Now()
			
			log.Printf("[ScreenShare] ➕ Added viewer %d (client %p) to viewer list. Total viewers: %d", client.userID, client, viewerCount)

			// ✅ Send "joined" ack so frontend knows to prepare MediaSource
			ack := WebSocketMessage{
				Type:    "screen_share",
				Command: "joined",
				Data: map[string]interface{}{
					"host_id":     host.userID,
					"start_time":  state.StartTime.Unix(),
				},
			}
			if ackBytes, err := json.Marshal(ack); err == nil {
				select {
				case client.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
				log.Println("✅ Using patched WebSocketHandler with select sends")
                default:
					log.Printf("[ScreenShare] Failed to send auto-join ack to user %d", client.userID)
				}
			}
			
			// ✅ Send init segment if available (for late joiners)
			if state.InitSegment != nil {
				log.Printf("[ScreenShare] Sending init segment (%d bytes) to auto-subscribed viewer %d", len(state.InitSegment), client.userID)
				payload := make([]byte, len(state.InitSegment))
				copy(payload, state.InitSegment)
				select {
				case client.send <- OutgoingMessage{Data: payload, IsBinary: true}:
					log.Printf("[ScreenShare] ✅ Sent init segment to viewer %d", client.userID)
				default:
					log.Printf("[ScreenShare] ❌ Failed to send init segment to viewer %d (buffer full)", client.userID)
				}
			} else {
				log.Printf("[ScreenShare] ⚠️ No init segment yet for viewer %d (will receive when host sends it)", client.userID)
			}
		}
		log.Printf("[ScreenShare] 📊 Auto-subscription complete: %d viewers registered for room %d", viewerCount, roomID)
		state.mutex.Unlock()
	}

	// --- DB update ---
	var dbShare models.ScreenShare
	if err := DB.Where("room_id = ?", roomID).First(&dbShare).Error; err == nil {
		dbShare.HostID = host.userID
		dbShare.Active = true
		dbShare.StartedAt = state.StartTime
		dbShare.EndedAt = nil
		DB.Save(&dbShare)
	} else {
		dbShare = models.ScreenShare{
			RoomID:    roomID,
			HostID:    host.userID,
			Active:    true,
			StartedAt: state.StartTime,
		}
		DB.Create(&dbShare)
	}

	host.isStreamHost = true
	host.lastStreamChunk = time.Now()

	log.Printf("[ScreenShare] User %d started screen sharing in room %d", host.userID, roomID)

	// --- Broadcast start signal to entire room ---
	startMsg := ScreenShareSignal{
		Type:      "screen_share_started",
		Data: map[string]interface{}{
			"user_id":    host.userID,
			"timestamp":  state.StartTime.Unix(),
			"mime_type":  state.MimeType,
		},
		Timestamp: time.Now().Unix(),
	}

	if broadcastBytes, err := json.Marshal(startMsg); err == nil {
		h.BroadcastToRoom(roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, host)
		log.Printf("[ScreenShare] Broadcasted screen_share_started to room %d", roomID)
	} else {
		log.Printf("[ScreenShare] Failed to marshal start message: %v", err)
	}

	go h.handleScreenShareBroadcast(roomID)
	return nil
}

// StopScreenShare gracefully stops screen sharing for a room
func (h *Hub) StopScreenShare(roomID uint, client *Client) error {
    h.screenShareMutex.Lock()
    defer h.screenShareMutex.Unlock()

    state, exists := h.screenShares[roomID]
    if !exists || !state.Active {
        log.Printf("[ScreenShare] StopScreenShare: No active screen share in room %d", roomID)
        return fmt.Errorf("no active screen share in room %d", roomID)
    }

    if state.Host != client {
        log.Printf("[ScreenShare] StopScreenShare: Unauthorized stop attempt by user %d", client.userID)
        return fmt.Errorf("only the host can stop screen sharing")
    }

    // ✅ 1. Mark as inactive
    state.Active = false
    state.Host = nil

    // ✅ 2. Cancel context → signals all goroutines to stop
    if state.cancel != nil {
        state.cancel()
        log.Printf("[ScreenShare] Canceled screen share context for room %d", roomID)
    }

    // ✅ 3. Close broadcast channel (idempotent safe)
    if state.BroadcastChannel != nil {
        close(state.BroadcastChannel)
        state.BroadcastChannel = nil
        log.Printf("[ScreenShare] Closed broadcast channel for room %d", roomID)
    }

    // ✅ 4. Clear viewers
    state.mutex.Lock()
    for viewer := range state.Viewers {
        viewer.isReceivingStream = false
        // Optional: send stop signal to each viewer
    }
    state.Viewers = make(map[*Client]bool)
    state.InitSegment = nil
    state.mutex.Unlock()

    // ✅ 5. Clean up DB
    var dbShare models.ScreenShare
    if err := DB.Where("room_id = ? AND active = ?", roomID, true).First(&dbShare).Error; err == nil {
        dbShare.Active = false
        now := time.Now()
        dbShare.EndedAt = &now
        DB.Save(&dbShare)
    }

    // ✅ 6. Broadcast stop to room
    stopMsg := ScreenShareSignal{
        Type:      "screen_share_stopped",
        Data:      map[string]interface{}{"user_id": client.userID},
        Timestamp: time.Now().Unix(),
    }
    if broadcastBytes, err := json.Marshal(stopMsg); err == nil {
        h.BroadcastToRoom(roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, client)
        log.Printf("[ScreenShare] Broadcasted screen_share_stopped to room %d", roomID)
    }

    // ✅ 7. Remove from hub (CRITICAL)
    delete(h.screenShares, roomID)
    log.Printf("[ScreenShare] Removed screen share state for room %d", roomID)

    return nil
}

// JoinScreenShare adds a viewer to an active screen share
// In websocket.go, JoinScreenShare function

func (h *Hub) JoinScreenShare(roomID uint, viewer *Client) error {
    h.screenShareMutex.Lock()
    defer h.screenShareMutex.Unlock()

    state, exists := h.screenShares[roomID]
    if !exists || !state.Active {
        return errors.New("no active screen share")
    }

    // Don't let the host join as viewer
    if state.Host != nil && viewer.userID == state.Host.userID {
        log.Printf("[JoinScreenShare] ⚠️ User %d is the host, cannot join as viewer", viewer.userID)
        return errors.New("host cannot join as viewer")
    }
    
    // ✅ CRITICAL: Check if THIS EXACT CLIENT is already registered
    if _, alreadyRegistered := state.Viewers[viewer]; alreadyRegistered {
        log.Printf("[JoinScreenShare] ⚠️ Client %p (user %d) already registered, skipping", viewer, viewer.userID)
        return nil // Idempotent
    }

    // Add to viewers
    state.Viewers[viewer] = true
    log.Printf("[JoinScreenShare] ✅ Added client %p (user %d) as viewer, total viewers: %d", 
        viewer, viewer.userID, len(state.Viewers))

    // Mark that this viewer hasn't received init yet
    viewer.hasReceivedInitSegment = false

    // ✅ Send init segment IMMEDIATELY if available
    if len(state.InitSegment) > 0 {
        log.Printf("[JoinScreenShare] 📤 Sending init segment (%d bytes) to NEW viewer %d", 
            len(state.InitSegment), viewer.userID)
        
        select {
        case viewer.send <- OutgoingMessage{Data: state.InitSegment, IsBinary: true}:
            viewer.hasReceivedInitSegment = true
            log.Printf("[JoinScreenShare] ✅ Init segment SENT to viewer %d", viewer.userID)
        case <-time.After(2 * time.Second):
            log.Printf("[JoinScreenShare] ⚠️ TIMEOUT sending init to viewer %d", viewer.userID)
            return errors.New("timeout sending init segment")
        }
    } else {
        log.Printf("[JoinScreenShare] ⚠️ No init segment available for viewer %d (will receive with first chunk)", 
            viewer.userID)
    }

    // Set viewer flags
    viewer.isReceivingStream = true
    viewer.lastStreamChunk = time.Now()

    // Send join acknowledgment
    joinMsg := map[string]interface{}{
        "type":      "screen_share_viewer_joined",
        "user_id":   viewer.userID,
        "mime_type": state.MimeType,
        "timestamp": time.Now().Unix(),
    }
    if jsonData, err := json.Marshal(joinMsg); err == nil {
        select {
        case viewer.send <- OutgoingMessage{Data: jsonData, IsBinary: false}:
            log.Printf("[JoinScreenShare] ✅ Join ack sent to viewer %d", viewer.userID)
        default:
            log.Printf("[JoinScreenShare] ⚠️ Join ack dropped for viewer %d", viewer.userID)
        }
    }

    return nil
}

// handleScreenShareBroadcast manages broadcasting screen data to viewers
func (h *Hub) handleScreenShareBroadcast(roomID uint) {
    h.screenShareMutex.RLock()
    state, exists := h.screenShares[roomID]
    h.screenShareMutex.RUnlock()

    if !exists || state.BroadcastChannel == nil {
        return
    }

    for chunk := range state.BroadcastChannel {
        log.Printf("[ScreenShare][DEBUG] handleScreenShareBroadcast: received chunk size=%d for room %d; viewers=%d", len(chunk), roomID, len(state.Viewers))
        state.mutex.RLock()
        for viewer := range state.Viewers {
            select {
            case viewer.send <- OutgoingMessage{Data: chunk, IsBinary: true}:
                // Successfully sent to viewer
                log.Printf("[ScreenShare] Enqueued chunk to viewer %d in room %d", viewer.userID, roomID)
            default:
                // Viewer's buffer is full, skip this frame and notify host about backpressure
                log.Printf("Dropped frame for viewer in room %d due to full buffer", roomID)
                // Notify host (non-blocking)
                if state.Host != nil {
                    bp := WebSocketMessage{
                        Type: "screen_share_backpressure",
                        Data: map[string]interface{}{ "viewer_id": viewer.userID, "room_id": roomID },
                    }
                    if bpBytes, err := json.Marshal(bp); err == nil {
                        select {
                        case state.Host.send <- OutgoingMessage{Data: bpBytes, IsBinary: false}:
                        default:
                            // If host can't receive, drop notification
                        }
                    }
                }
            }
        }
        state.mutex.RUnlock()
    }
}

// handleBinaryMessage processes incoming binary messages for screen sharing
func (client *Client) handleBinaryMessage(message []byte) {
    roomID := client.roomID
    
    client.hub.screenShareMutex.Lock()
    state, exists := client.hub.screenShares[roomID]
    client.hub.screenShareMutex.Unlock()

    if !exists || !state.Active {
        log.Printf("[handleBinaryMessage] ⚠️ No active screen share for room %d", roomID)
        return
    }

    // Verify this client is the host
    state.mutex.RLock()
    isHost := state.Host == client
    state.mutex.RUnlock()

    if !isHost {
        log.Printf("[handleBinaryMessage] ⚠️ User %d not the host, ignoring binary", client.userID)
        return
    }

    // ✅ Detect init segment by WebM EBML header
    arr := message
    isWebMHeader := len(arr) >= 4 && arr[0] == 0x1A && arr[1] == 0x45 && arr[2] == 0xDF && arr[3] == 0xA3
    
    state.mutex.Lock()
    
    // ✅ Store init segment if we don't have it yet
    if len(state.InitSegment) == 0 {
        if isWebMHeader {
            state.InitSegment = make([]byte, len(message))
            copy(state.InitSegment, message)
            log.Printf("[handleBinaryMessage] 📦 Captured init segment (WebM header): %d bytes", len(state.InitSegment))
        } else if len(message) > 1024 {
            // Assume first large chunk contains init
            state.InitSegment = make([]byte, len(message))
            copy(state.InitSegment, message)
            log.Printf("[handleBinaryMessage] 📦 Captured init segment (first chunk): %d bytes", len(state.InitSegment))
        }
    }
    
    state.mutex.Unlock()

    // ✅ CRITICAL FIX: Determine if this is the init segment
    // Don't skip it early - we need to deliver it to viewers who haven't received it
    state.mutex.RLock()
    viewerCount := len(state.Viewers)
    hasInit := len(state.InitSegment) > 0
    isThisInit := isWebMHeader
    state.mutex.RUnlock()

    log.Printf("[ScreenShare] 📤 Starting chunk delivery for room %d", roomID)
    log.Printf("[ScreenShare] 🔍 Delivery check: hasInitSegment=%v, isThisTheInitSegment=%v, viewerCount=%d, chunkSize=%d", 
        hasInit, isThisInit, viewerCount, len(message))

    deliveryCount := 0
    skippedCount := 0
    
    // ✅ Use write lock when delivering init (need to modify hasReceivedInitSegment flag)
    if isThisInit {
        state.mutex.Lock()
    } else {
        state.mutex.RLock()
    }
    
    for viewer := range state.Viewers {
        // 🔍 DEBUG: Log viewer details
        log.Printf("[ScreenShare] 🔍 Checking viewer %d (client %p): hasReceivedInit=%v", 
            viewer.userID, viewer, viewer.hasReceivedInitSegment)
        
        // ✅ Deliver logic:
        // - If this is init segment: send to viewers who haven't received it
        // - If this is regular chunk: send to viewers who have received init
        shouldDeliver := false
        if isThisInit {
            // Init segment: only send if viewer hasn't received it yet
            shouldDeliver = !viewer.hasReceivedInitSegment
        } else {
            // Regular chunk: only send if viewer has received init
            shouldDeliver = viewer.hasReceivedInitSegment
        }

        if shouldDeliver {
            // ✅ Wrap send in anonymous function with recover to catch panics
            func() {
                defer func() {
                    if r := recover(); r != nil {
                        log.Printf("[ScreenShare] ⚠️ Recovered from panic sending to viewer %d: %v", viewer.userID, r)
                    }
                }()
                
                select {
                case viewer.send <- OutgoingMessage{Data: message, IsBinary: true}:
                    if isThisInit {
                        viewer.hasReceivedInitSegment = true
                        log.Printf("[ScreenShare] ✅ Delivered INIT segment (%d bytes) to viewer %d (client %p)", len(message), viewer.userID, viewer)
                    } else {
                        log.Printf("[ScreenShare] ✅ Delivered chunk (%d bytes) to viewer %d (client %p)", len(message), viewer.userID, viewer)
                    }
                    deliveryCount++
                default:
                    log.Printf("[ScreenShare] ⚠️ Viewer %d send channel full, dropping chunk", viewer.userID)
                }
            }()
        } else {
            skippedCount++
            if isThisInit {
                log.Printf("[ScreenShare] ⏭️ Skipping viewer %d (already has init)", viewer.userID)
            } else {
                log.Printf("[ScreenShare] ⏭️ Skipping viewer %d (hasn't received init yet)", viewer.userID)
            }
        }
    }
    
    if isThisInit {
        state.mutex.Unlock()
    } else {
        state.mutex.RUnlock()
    }

    log.Printf("[ScreenShare] 📊 Delivery summary: delivered=%d, skipped=%d, total_viewers=%d, room=%d", 
        deliveryCount, skippedCount, viewerCount, roomID)
}

func (client *Client) handleMessage(message []byte) {
    log.Printf("[handleMessage] 📥 Processing message from user %d (client=%p), length=%d", client.userID, client, len(message))
    
    var msg WebSocketMessage
    if err := json.Unmarshal(message, &msg); err != nil {
        log.Printf("[handleMessage] ❌ Error unmarshaling message from user %d: %v", client.userID, err)
        return
    }

    log.Printf("[handleMessage] 📋 Message type: '%s' from user %d", msg.Type, client.userID)

    // ✅ Handle client_ready: send session_status
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

        // Build session_status
        var isScreenSharing bool
        var screenShareHostID uint
        client.hub.screenShareMutex.RLock()
        if state, exists := client.hub.screenShares[client.roomID]; exists && state.Active && state.Host != nil {
            isScreenSharing = true
            screenShareHostID = state.Host.userID
        }
        client.hub.screenShareMutex.RUnlock()

        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id":           watchSession.SessionID,
                "host_id":              watchSession.HostID,
                "members":              members,
                "started_at":           watchSession.StartedAt,
                "is_screen_sharing":    isScreenSharing,
                "screen_share_host_id": screenShareHostID,
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

    // Screen sharing specific message handling
    if msg.Type == "screen_share" {
        log.Printf("[ScreenShare] handleMessage: Received screen_share command '%s' from user %d in room %d", msg.Command, client.userID, client.roomID)
        switch msg.Command {
        case "start":
            // msg.Data is expected to be an object like { "mime_type": "video/webm;codecs=vp8,opus" }
            var mimeType string
            if msg.Data != nil {
                if m, ok := msg.Data.(map[string]interface{}); ok {
                    if mt, ok := m["mime_type"].(string); ok {
                        mimeType = mt
                    }
                }
            }
            log.Printf("[ScreenShare][DEBUG] Parsed mime_type from start command: '%s' (raw msg.Data: %T)", mimeType, msg.Data)
            if mimeType == "" {
                // Log a warning and choose a sensible default to help viewers pick a SourceBuffer
                log.Printf("[ScreenShare][WARN] No mime_type provided by host in start command for room %d, user %d. Falling back to default 'video/webm'.", client.roomID, client.userID)
                mimeType = "video/webm"
            }
            if err := client.hub.StartScreenShare(client.roomID, client, mimeType); err != nil {
                errorMsg := WebSocketMessage{
                    Type: "error",
                    Data: map[string]string{"message": err.Error()},
                }
                if errorBytes, err := json.Marshal(errorMsg); err == nil {
                    select {
                    case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
                    default:
                        log.Printf("Dropped error message for user %d (buffer full)", client.userID)
                    }
                }
                return
            }

        case "stop":
            if err := client.hub.StopScreenShare(client.roomID, client); err != nil {
                errorMsg := WebSocketMessage{
                    Type: "error",
                    Data: map[string]string{"message": err.Error()},
                }
                if errorBytes, err := json.Marshal(errorMsg); err == nil {
                    select {
                    case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
                    default:
                        log.Printf("Dropped error message for user %d (buffer full)", client.userID)
                    }
                }
                return
            }

            // Notify room about screen share stop
            notification := ScreenShareSignal{
                Type:      "screen_share_stopped",
                Data:      map[string]interface{}{"user_id": client.userID},
                Timestamp: time.Now().Unix(),
            }
            if notifyBytes, err := json.Marshal(notification); err == nil {
                client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: notifyBytes, IsBinary: false}, nil)
            }

        case "join":
            log.Printf("[DEBUG] User %d sent 'join' for screen share in room %d", client.userID, msg.RoomID);
            client.hub.screenShareMutex.RLock()
            state, exists := client.hub.screenShares[client.roomID] // ✅ Use client.roomID
            client.hub.screenShareMutex.RUnlock()

            if !exists || !state.Active {
                errorMsg := WebSocketMessage{
                    Type: "error",
                    Data: map[string]string{"message": "No active screen share to join"},
                }
                if errorBytes, err := json.Marshal(errorMsg); err == nil {
                    select {
                    case client.send <- OutgoingMessage{Data: errorBytes, IsBinary: false}:
                    default:
                        log.Printf("Dropped error message for viewer %d (buffer full)", client.userID)
                    }
                }
                return
            }

            // Idempotent add
            state.mutex.Lock()
            if _, already := state.Viewers[client]; already {
                log.Printf("JoinScreenShare: user %d already viewer in room %d", client.userID, client.roomID)
            } else {
                state.Viewers[client] = true
            }
            state.mutex.Unlock()

            // ✅ Send acknowledgment safely
            ack := WebSocketMessage{
                Type:    "screen_share",
                Command: "joined",
                Data: map[string]interface{}{
                    "host_id":    state.Host.userID,
                    "start_time": state.StartTime.Unix(),
                },
            }
            if ackBytes, err := json.Marshal(ack); err == nil {
                select {
                case client.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
                    // optional: log success
                default:
                    log.Printf("Dropped join ack for viewer %d (buffer full)", client.userID)
                }
            }
            return

        case "viewer_ready":
            log.Printf("[ScreenShare] Viewer %d is ready in room %d", client.userID, client.roomID)
            log.Printf("[DEBUG] User %d sent 'viewer_ready' in room %d", client.userID, client.roomID);
            client.hub.screenShareMutex.RLock()
            state, exists := client.hub.screenShares[client.roomID] // ✅ Use client.roomID
            client.hub.screenShareMutex.RUnlock()

            if exists && state.Active && state.Host != nil {
                state.mutex.RLock()
                if state.InitSegment != nil {
                    payload := make([]byte, len(state.InitSegment))
                    copy(payload, state.InitSegment)
                    select {
                    case client.send <- OutgoingMessage{Data: payload, IsBinary: true}:
                        log.Printf("[ScreenShare] ✅ Sent init segment to ready viewer %d", client.userID)
                    default:
                        log.Printf("[ScreenShare] ❌ Failed to send init segment to viewer %d (buffer full)", client.userID)
                    }
                } else {
                    log.Printf("[ScreenShare] ⚠️ No init segment yet for viewer %d", client.userID)
                }
                state.mutex.RUnlock()
            }

        case "leave":
            client.hub.screenShareMutex.RLock()
            state, exists := client.hub.screenShares[client.roomID] // ✅ Use client.roomID
            client.hub.screenShareMutex.RUnlock()

            if exists {
                state.mutex.Lock()
                delete(state.Viewers, client)
                state.mutex.Unlock()
            }
        }
        return
    }

    // Handle other message types
    // ...existing message handling code...
}