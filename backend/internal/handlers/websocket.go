// WeWatch/backend/internal/handlers/websocket.go

package handlers

import (
	"encoding/json"
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
    // 1. Remove from rooms
    h.mutex.Lock()
    if roomClients, ok := h.rooms[client.roomID]; ok {
        if _, exists := roomClients[client]; exists {
            delete(roomClients, client)
            close(client.send)
            if len(roomClients) == 0 {
                delete(h.rooms, client.roomID)
            }
        }
    }
    h.mutex.Unlock()

    // 2. Clean up clientRegistry
    h.registryMutex.Lock()
    if userMap, exists := h.clientRegistry[client.userID]; exists {
        delete(userMap, client.roomID)
        if len(userMap) == 0 {
            delete(h.clientRegistry, client.userID)
        }
    }
    h.registryMutex.Unlock()

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
    client.conn.Close()
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
    defer func() {
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
    ticker := time.NewTicker(pingPeriod)
    defer func() {
        ticker.Stop()
        c.conn.Close()
    }()

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
func WebSocketHandler(c *gin.Context) {
    log.Println("WebSocketHandler: called")
    // --- Authentication and Room ID Extraction ---
    // Extract authenticated user ID (assuming set by auth middleware)
    userIDVal, exists := c.Get("user_id")
    if (!exists) {
        log.Println("WebSocketHandler: user_id not found in context")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    authenticatedUserID, ok := userIDVal.(uint)
    if (!ok) {
        log.Println("WebSocketHandler: user_id in context is not uint")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid user ID"})
        return
    }

    // Extract room ID from query or URL param
    roomIDStr := c.Query("room_id")
    if roomIDStr == "" {
        roomIDStr = c.Param("room_id")
    }
    if roomIDStr == "" {
        roomIDStr = c.Param("id") // Support both :room_id and :id
    }
    if roomIDStr == "" {
        log.Println("WebSocketHandler: Missing room_id")
        c.JSON(http.StatusBadRequest, gin.H{"error": "Missing room_id"})
        return
    }
    roomID64, err := strconv.ParseUint(roomIDStr, 10, 64)
    if err != nil {
        log.Printf("WebSocketHandler: Invalid room_id: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room_id"})
        return
    }
    roomID := uint(roomID64)

    // Upgrade HTTP connection to WebSocket
    conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
    if err != nil {
        log.Printf("WebSocketHandler: WebSocket upgrade failed: %v", err)
        return
    }

    // --- Existing session logic below ---
    var watchSession models.WatchSession
    sessionID := c.Query("session_id")

    if sessionID != "" {
        // Try to find existing session
        if err := DB.Where("session_id = ? AND ended_at IS NULL", sessionID).First(&watchSession).Error; err != nil {
            if errors.Is(err, gorm.ErrRecordNotFound) {
                // Session not found - create new one
                watchSession = models.WatchSession{
                    SessionID: sessionID,
                    RoomID:   roomID,
                    HostID:   authenticatedUserID,
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
        // No session ID provided - try to find or create an active session for the room
        if err := DB.Where("room_id = ? AND ended_at IS NULL", roomID).First(&watchSession).Error; err != nil {
            if errors.Is(err, gorm.ErrRecordNotFound) {
                // No active session - create one
                sessionID = uuid.New().String()
                watchSession = models.WatchSession{
                    SessionID: sessionID,
                    RoomID:   roomID,
                    HostID:   authenticatedUserID,
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

    // After creating or fetching the session, add it to the hub's activeSessions
    hub.sessionMutex.Lock()
    hub.activeSessions[watchSession.SessionID] = &watchSession
    hub.sessionMutex.Unlock()

    // Create client instance
    client := &Client{
        hub:      hub,
        conn:     conn,
        send:     make(chan OutgoingMessage, 1024),
        roomID:   roomID,
        userID:   authenticatedUserID,
        streamID: sessionID,
    }

    // 🔥 SYNCHRONOUS DEDUPLICATION
    var oldClient *Client
    hub.registryMutex.Lock()
    if userMap, exists := hub.clientRegistry[authenticatedUserID]; exists {
        if existing, ok := userMap[roomID]; ok {
            oldClient = existing
            log.Printf("WebSocketHandler: Found existing client %p for user %d in room %d", oldClient, authenticatedUserID, roomID)
            // ✅ SYNCHRONOUS CLEANUP
            hub.cleanupClientSync(oldClient)
            delete(userMap, roomID)
            if len(userMap) == 0 {
                delete(hub.clientRegistry, authenticatedUserID)
            }
        }
    }
    // Register new client
    if _, exists := hub.clientRegistry[authenticatedUserID]; !exists {
        hub.clientRegistry[authenticatedUserID] = make(map[uint]*Client)
    }
    hub.clientRegistry[authenticatedUserID][roomID] = client
    hub.registryMutex.Unlock()

    // ✅ NOW register with hub (AFTER deduplication and cleanup)
    hub.register <- client  // ← THIS LINE MOVED HERE

    // Join the watch session
    if err := hub.JoinWatchSession(sessionID, client); err != nil {
        log.Printf("Failed to join watch session: %v", err)
    }

    // --- Send session_status message to client ---
    // Fetch session members
    members, err := GetSessionMembers(DB, watchSession.ID)
    if err != nil {
        log.Printf("Failed to fetch session members: %v", err)
        // Send error status to client
        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "error": "Failed to fetch session members",
            },
        }
        if msgBytes, err := json.Marshal(statusMsg); err == nil {
            // ✅ Use hub broadcast to avoid "send on closed channel"
            go func() {
                hub.BroadcastToUsers([]uint{authenticatedUserID}, OutgoingMessage{Data: msgBytes, IsBinary: false})
            }()
        }
    } else {
        // Compose session_status message
        var isScreenSharing bool = false
        var screenShareHostID uint = 0

        // First, check in-memory
        hub.screenShareMutex.RLock()
        if state, exists := hub.screenShares[watchSession.RoomID]; exists && state.Active && state.Host != nil {
            // Verify host client is still registered in the room
            hub.mutex.RLock()
            _, hostStillConnected := hub.rooms[watchSession.RoomID][state.Host]
            hub.mutex.RUnlock()

            if hostStillConnected {
                isScreenSharing = true
                screenShareHostID = state.Host.userID
            } else {
                // Host disconnected — clean up stale in-memory state
                delete(hub.screenShares, watchSession.RoomID)
                log.Printf("Cleaned up stale screen share state for room %d (host gone)", watchSession.RoomID)
            }
        }
        hub.screenShareMutex.RUnlock()

        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id": watchSession.SessionID,
                "host_id": watchSession.HostID,
                "members": members,
                "started_at": watchSession.StartedAt,
                "is_screen_sharing": isScreenSharing,
                "screen_share_host_id": screenShareHostID,
            },
        }
        if msgBytes, err := json.Marshal(statusMsg); err == nil {
            go func() {
                hub.BroadcastToUsers([]uint{authenticatedUserID}, OutgoingMessage{Data: msgBytes, IsBinary: false})
            }()
        }
    }

    // 🔥 NEW: Send screen_share_started to late-joining members if screen share is active
    hub.screenShareMutex.RLock()
    if state, exists := hub.screenShares[roomID]; exists && state.Active && state.Host != nil {
        hub.mutex.RLock()
        _, hostStillConnected := hub.rooms[roomID][state.Host]
        hub.mutex.RUnlock()
        if hostStillConnected {
            startMsg := ScreenShareSignal{
                Type: "screen_share_started",
                Data: map[string]interface{}{
                    "user_id":    state.Host.userID,
                    "timestamp":  state.StartTime.Unix(),
                    "mime_type":  state.MimeType,
                },
                Timestamp: time.Now().Unix(),
            }
            if startBytes, err := json.Marshal(startMsg); err == nil {
                go func() {
                    hub.BroadcastToUsers([]uint{authenticatedUserID}, OutgoingMessage{Data: startBytes, IsBinary: false})
                }()
                log.Printf("[ScreenShare] Sent screen_share_started to late-joining user %d in room %d", authenticatedUserID, roomID)
            }
        }
    }
    hub.screenShareMutex.RUnlock()

    // Start the client pumps
    go client.writePump()
    go client.readPump()

    // Block forever
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
}

func NewScreenShareState() *ScreenShareState {
    return &ScreenShareState{
        BroadcastChannel: make(chan []byte, 1024),
        Viewers:         make(map[*Client]bool),
        Active:         false,
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

    // ✅ Auto-subscribe all current room members (except host)
    h.mutex.RLock()
    roomClients, ok := h.rooms[roomID]
    h.mutex.RUnlock()

    if ok {
        state.mutex.Lock()
        for client := range roomClients {
            if client == host {
                continue
            }
            state.Viewers[client] = true
            client.isReceivingStream = true
            client.lastStreamChunk = time.Now()

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
                default:
                    log.Printf("[ScreenShare] Failed to send auto-join ack to user %d", client.userID)
                }
            }
        }
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

    // --- Broadcast start signal ---
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
        h.BroadcastToRoom(roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
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

    // Verify the request is from the host
    if state.Host != client {
        log.Printf("[ScreenShare] StopScreenShare: Unauthorized stop attempt by user %d in room %d", client.userID, roomID)
        return fmt.Errorf("only the host can stop screen sharing")
    }

    state.Active = false
    state.Host = nil
    log.Printf("[ScreenShare] StopScreenShare: User %d stopped screen sharing in room %d", client.userID, roomID)

    // DB: Mark screen sharing as inactive for this room
    var dbShare models.ScreenShare
    if err := DB.Where("room_id = ?", roomID).First(&dbShare).Error; err == nil {
        dbShare.Active = false
        now := time.Now()
        dbShare.EndedAt = &now
        DB.Save(&dbShare)
    }

    // Notify all clients in room about screen share stop
    stopMsg := ScreenShareSignal{
        Type:      "screen_share_stopped",
        Data:      map[string]interface{}{ "user_id": client.userID },
        Timestamp: time.Now().Unix(),
    }

    if broadcastBytes, err := json.Marshal(stopMsg); err == nil {
        h.BroadcastToRoom(roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, client) // Exclude host from broadcast
        log.Printf("[ScreenShare] StopScreenShare: Broadcasted screen_share_stopped to room %d", roomID)
    } else {
        log.Printf("[ScreenShare] StopScreenShare: Error marshalling screen share stop message for room %d: %v", roomID, err)
    }

    return nil
}

// JoinScreenShare adds a viewer to an active screen share
func (h *Hub) JoinScreenShare(roomID uint, viewer *Client) error {
    h.screenShareMutex.RLock()
    state, exists := h.screenShares[roomID]
    h.screenShareMutex.RUnlock()

    if !exists || !state.Active {
        return fmt.Errorf("no active screen share in room %d", roomID)
    }

    // Don't let the host join as viewer
    if viewer == state.Host {
        return fmt.Errorf("host cannot join as viewer")
    }

    state.mutex.Lock()
    state.Viewers[viewer] = true
    // After adding viewer to state.Viewers
    if state.InitSegment != nil {
        payload := make([]byte, len(state.InitSegment))
        copy(payload, state.InitSegment)
        select {
        case viewer.send <- OutgoingMessage{Data: payload, IsBinary: true}:
            log.Printf("[ScreenShare] Sent init segment to new viewer %d", viewer.userID)
        default:
            log.Printf("[ScreenShare] Failed to send init segment to viewer %d (buffer full)", viewer.userID)
        }
    } else {
        log.Printf("[ScreenShare] No init segment available for viewer %d", viewer.userID)
    }
    state.mutex.Unlock()

    // Set viewer client flags
    viewer.isReceivingStream = true
    viewer.lastStreamChunk = time.Now()

    // Send join acknowledgment to viewer
    ack := WebSocketMessage{
        Type: "screen_share",
        Command: "joined",
        Data: map[string]interface{}{
            "host_id": state.Host.userID,
            "start_time": state.StartTime.Unix(),
        },
    }

    if ackBytes, err := json.Marshal(ack); err == nil {
        select {
        case viewer.send <- OutgoingMessage{Data: ackBytes, IsBinary: false}:
        default:
            log.Printf("Failed to send join acknowledgment to viewer %d", viewer.userID)
        }
    }

    return nil
}

// handleScreenShareBroadcast manages broadcasting screen data to viewers
func (h *Hub) handleScreenShareBroadcast(roomID uint) {
    h.screenShareMutex.RLock()
    state, exists := h.screenShares[roomID]
    h.screenShareMutex.RUnlock()

    if (!exists) {
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
    if len(message) == 0 {
        return
    }

    roomID := client.roomID

    // Verify this client is the active screen share host for the room
    client.hub.screenShareMutex.RLock()
    state, exists := client.hub.screenShares[roomID]
    client.hub.screenShareMutex.RUnlock()

    if !exists || !state.Active || state.Host != client {
        log.Printf("handleBinaryMessage: ignored binary from non-host user %d in room %d", client.userID, roomID)
        return
    }

    // 👇 Capture init segment on first large chunk
    state.mutex.Lock()
    if state.InitSegment == nil && len(message) > 1024 {
        state.InitSegment = make([]byte, len(message))
        copy(state.InitSegment, message)
        log.Printf("[ScreenShare] Captured init segment (%d bytes) for room %d", len(message), roomID)

        // ✅ Immediately send init segment to all current viewers (including auto-subscribed members)
        for viewer := range state.Viewers {
            payload := make([]byte, len(state.InitSegment))
            copy(payload, state.InitSegment)
            select {
            case viewer.send <- OutgoingMessage{Data: payload, IsBinary: true}:
                log.Printf("[ScreenShare] Sent init segment to viewer %d", viewer.userID)
            default:
                log.Printf("[ScreenShare] Failed to send init segment to viewer %d (buffer full)", viewer.userID)
            }
        }
    }
    state.mutex.Unlock()

    // Track stats
    client.hub.streamStatsMutex.Lock()
    stats, ok := client.hub.roomStreamStats[roomID]
    if !ok {
        stats = &RoomStreamStats{
            hostID:         client.userID,
            startTime:      time.Now(),
            receiverStats:  make(map[uint]*ReceiverStats),
        }
        client.hub.roomStreamStats[roomID] = stats
    }
    stats.chunkCount++
    stats.lastChunkTime = time.Now()
    client.hub.streamStatsMutex.Unlock()

    // ✅ Deliver ONLY to state.Viewers (now the single source of truth)
    delivered := int64(0)
    state.mutex.RLock()
    for viewer := range state.Viewers {
        if viewer == client { // skip host
            continue
        }
        payload := make([]byte, len(message))
        copy(payload, message)
        select {
        case viewer.send <- OutgoingMessage{Data: payload, IsBinary: true}:
            delivered++
        default:
            log.Printf("handleBinaryMessage: dropped chunk to viewer %d (buffer full)", viewer.userID)
            // Optional: send backpressure to host
        }
    }
    state.mutex.RUnlock()

    if delivered == 0 {
        log.Printf("handleBinaryMessage: no viewers received chunk in room %d", roomID)
    } else {
        log.Printf("handleBinaryMessage: delivered to %d viewers in room %d", delivered, roomID)
    }
}

func (client *Client) handleMessage(message []byte) {
    var msg WebSocketMessage
    if err := json.Unmarshal(message, &msg); err != nil {
        log.Printf("Error unmarshaling message: %v", err)
        return
    }

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