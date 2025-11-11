// WeWatch/backend/internal/handlers/websocket.go

package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
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
    // Add to Hub struct
    seatingAssignments map[uint]map[string]uint // roomID → "row-col" → userID
    seatingMutex       sync.RWMutex

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
		clientRegistry:   make(map[uint]map[uint]*Client),
		seatingAssignments: make(map[uint]map[string]uint),
		seatingMutex:     sync.RWMutex{},
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

func (h *Hub) GetUserIDsInRow(roomID uint, row int) []uint {
    h.seatingMutex.RLock()
    defer h.seatingMutex.RUnlock()

    assignments, exists := h.seatingAssignments[roomID]
    if !exists {
        return []uint{}
    }

    var users []uint
    for seatID, userID := range assignments {
        if strings.HasPrefix(seatID, fmt.Sprintf("%d-", row)) {
            users = append(users, userID)
        }
    }
    return users
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

    // 4. Screen share cleanup is now handled by LiveKit
    log.Printf("[cleanupClientSync] Screen share cleanup delegated to LiveKit for room %d", client.roomID)

    // 5. Force-close connection
    log.Printf("[cleanupClientSync] 🔌 Force-closing WebSocket connection for client %p", client)
    client.conn.Close()
    log.Printf("[cleanupClientSync] ✅ Cleanup complete for client %p", client)
}

// Run manages the registration, unregistration, and broadcasting of messages.
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
					// ✅ Broadcast 'participant_leave' to others in the room
					leaveMsg := WebSocketMessage{
						Type: "participant_leave",
						Data: map[string]interface{}{
							"userId": client.userID,
						},
					}
					if leaveBytes, err := json.Marshal(leaveMsg); err == nil {
						h.broadcastToRoom <- RoomBroadcastMessage{
							roomID: client.roomID,
							data:   OutgoingMessage{Data: leaveBytes, IsBinary: false},
							sender: client, // exclude self (though client is leaving)
						}
					}

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
		// Close the send channel to trigger graceful shutdown
		select {
		case <-client.send:
			// Already closed
		default:
			close(client.send)
			log.Printf("🔌 [Hub] Closed send channel for user %d in room %d", client.userID, roomID)
		}
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
		// Allow frontend dev server and backend
		return origin == "http://localhost:5173" || origin == "http://localhost:8080" || origin == ""
	},
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
		// ✅ DO NOT auto-create sessions for RoomPage WebSocket connections
		// Only VideoWatch should create sessions (via session_id query param)
		if err := DB.Where("room_id = ? AND ended_at IS NULL", roomID).First(&watchSession).Error; err != nil {
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
			// Found an existing active session
			sessionID = watchSession.SessionID
			log.Printf("WebSocketHandler: Found existing active session %s for room %d", sessionID, roomID)
		}
	}

	// ✅ Only register in activeSessions if there's an actual session
	if sessionID != "" {
		hub.sessionMutex.Lock()
		hub.activeSessions[watchSession.SessionID] = &watchSession
		hub.sessionMutex.Unlock()
	}

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

	// Join the watch session (only if there's an active session)
	if sessionID != "" {
		if err := hub.JoinWatchSession(sessionID, client); err != nil {
			log.Printf("Failed to join watch session: %v", err)
		}
	}

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
				trimmedMembers[i] = map[string]interface{}{
					"id":        m.ID,
					"user_id":   m.UserID,
					"user_role": m.UserRole,
				}
			}

			// Screen sharing is now handled by LiveKit
			statusMsg := WebSocketMessage{
				Type: "session_status",
				Data: map[string]interface{}{
					"session_id": watchSession.SessionID,
					"host_id":    watchSession.HostID,
					"members":    trimmedMembers,
					"started_at": watchSession.StartedAt,
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

	// ✅ Now register in hub.rooms
	hub.mutex.Lock()
	if _, ok := hub.rooms[roomID]; !ok {
		hub.rooms[roomID] = make(map[*Client]bool)
	}
	hub.rooms[roomID][client] = true
	hub.mutex.Unlock()
	log.Printf("Hub: Client %p (User %d) synchronously registered for room %d", client, authenticatedUserID, roomID)

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


// handleMessage processes incoming messages from the client.
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

        // Build session_status (screen sharing handled by LiveKit)
        statusMsg := WebSocketMessage{
            Type: "session_status",
            Data: map[string]interface{}{
                "session_id": watchSession.SessionID,
                "host_id":    watchSession.HostID,
                "members":    members,
                "started_at": watchSession.StartedAt,
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
    // Inside handleMessage in websocket.go
    if msg.Type == "user_audio_state" {
        var audioData struct {
            UserID            uint   `json:"userId"`
            IsAudioActive     bool   `json:"isAudioActive"`
            IsSeatedMode      bool   `json:"isSeatedMode"`
            IsGlobalBroadcast bool   `json:"isGlobalBroadcast"`
            Row               *int   `json:"row"` // nullable
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            if err := json.Unmarshal(dataBytes, &audioData); err != nil {
                log.Printf("[audio] Failed to parse audio state: %v", err)
                return
            }
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            // Fallback if Data is already a map (Gin sometimes does this)
            audioData.UserID = uint(m["userId"].(float64))
            audioData.IsAudioActive = m["isAudioActive"].(bool)
            audioData.IsSeatedMode = m["isSeatedMode"].(bool)
            audioData.IsGlobalBroadcast = m["isGlobalBroadcast"].(bool)
            if rowVal, exists := m["row"]; exists && rowVal != nil {
                row := int(rowVal.(float64))
                audioData.Row = &row
            }
        } else {
            log.Printf("[audio] Unexpected data type for user_audio_state")
            return
        }

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
                h.seatingAssignments[client.roomID] = make(map[string]uint)
            }
            
            // Clear existing assignments for this room
            h.seatingAssignments[client.roomID] = make(map[string]uint)
            
            // Assign seats in order to connected users
            for i, userID := range userIDs {
                row := i / 5  // Row 0 = A, Row 1 = B, etc.
                col := i % 5  // Column 0-4 = positions 1-5
                seatID := fmt.Sprintf("%d-%d", row, col)
                h.seatingAssignments[client.roomID][seatID] = userID
                log.Printf("🪑 [seating_mode_toggle] Assigned seat %s to user %d", seatID, userID)
            }
            h.seatingMutex.Unlock()

            log.Printf("🪑 [seating_mode_toggle] Total seats assigned: %d", len(h.seatingAssignments[client.roomID]))

            // Build userSeats map for broadcast
            userSeats := make(map[uint]string)
            for seatID, userID := range h.seatingAssignments[client.roomID] {
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
            h.seatingAssignments[client.roomID] = make(map[string]uint)
        }
        h.seatingAssignments[client.roomID][assign.SeatId] = assign.UserID
        h.seatingMutex.Unlock()

        log.Printf("Seat assigned: room=%d, seat=%s, user=%d", client.roomID, assign.SeatId, assign.UserID)
        return // Don't broadcast
    }

    // Handle take_seat - user claims an empty seat
    if msg.Type == "take_seat" {
        var takeSeat struct {
            SeatID string `json:"seat_id"` // "row-col"
            Row    int    `json:"row"`
            Col    int    `json:"col"`
            UserID uint   `json:"user_id"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &takeSeat)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            takeSeat.SeatID = m["seat_id"].(string)
            takeSeat.Row = int(m["row"].(float64))
            takeSeat.Col = int(m["col"].(float64))
            takeSeat.UserID = uint(m["user_id"].(float64))
        }

        // Update seating map
        h := client.hub
        h.seatingMutex.Lock()
        if _, exists := h.seatingAssignments[client.roomID]; !exists {
            h.seatingAssignments[client.roomID] = make(map[string]uint)
        }
        h.seatingAssignments[client.roomID][takeSeat.SeatID] = takeSeat.UserID
        h.seatingMutex.Unlock()

        log.Printf("Seat taken: room=%d, seat=%s, user=%d", client.roomID, takeSeat.SeatID, takeSeat.UserID)
        
        // Broadcast to all room members so they see the updated grid
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, nil)
        return
    }

    // Handle seat_swap_request - user wants to swap with another user
    if msg.Type == "seat_swap_request" {
        var swapReq struct {
            RequesterID  uint   `json:"requester_id"`
            TargetUserID uint   `json:"target_user_id"`
            TargetSeat   map[string]interface{} `json:"target_seat"` // {row, col}
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &swapReq)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            swapReq.RequesterID = uint(m["requester_id"].(float64))
            swapReq.TargetUserID = uint(m["target_user_id"].(float64))
            if ts, ok := m["target_seat"].(map[string]interface{}); ok {
                swapReq.TargetSeat = ts
            }
        }

        // Get requester's current seat
        h := client.hub
        h.seatingMutex.RLock()
        var requesterSeat map[string]interface{}
        if roomSeats, exists := h.seatingAssignments[client.roomID]; exists {
            for seatID, userID := range roomSeats {
                if userID == swapReq.RequesterID {
                    // Parse "row-col" format
                    var row, col int
                    fmt.Sscanf(seatID, "%d-%d", &row, &col)
                    requesterSeat = map[string]interface{}{
                        "row": row,
                        "col": col,
                    }
                    break
                }
            }
        }
        h.seatingMutex.RUnlock()

        // Get requester name
        var requester models.User
        if err := DB.First(&requester, swapReq.RequesterID).Error; err != nil {
            log.Printf("Failed to fetch requester user %d: %v", swapReq.RequesterID, err)
            return
        }

        // Send swap request only to target user
        swapMsg := map[string]interface{}{
            "type":           "seat_swap_request",
            "requester_id":   swapReq.RequesterID,
            "requester_name": requester.Username,
            "requester_seat": requesterSeat,
            "target_seat":    swapReq.TargetSeat,
        }
        
        if msgBytes, err := json.Marshal(swapMsg); err == nil {
            client.hub.BroadcastToUsers([]uint{swapReq.TargetUserID}, OutgoingMessage{Data: msgBytes, IsBinary: false})
            log.Printf("Sent swap request from user %d to user %d", swapReq.RequesterID, swapReq.TargetUserID)
        }
        return
    }

    // Handle seat_swap_accepted - target user accepted swap
    if msg.Type == "seat_swap_accepted" {
        var accept struct {
            RequesterID   uint                   `json:"requester_id"`
            TargetID      uint                   `json:"target_id"`
            RequesterSeat map[string]interface{} `json:"requester_seat"` // {row, col}
            TargetSeat    map[string]interface{} `json:"target_seat"`    // {row, col}
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &accept)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            accept.RequesterID = uint(m["requester_id"].(float64))
            accept.TargetID = uint(m["target_id"].(float64))
            if rs, ok := m["requester_seat"].(map[string]interface{}); ok {
                accept.RequesterSeat = rs
            }
            if ts, ok := m["target_seat"].(map[string]interface{}); ok {
                accept.TargetSeat = ts
            }
        }

        // Swap seats in seating map
        h := client.hub
        h.seatingMutex.Lock()
        if roomSeats, exists := h.seatingAssignments[client.roomID]; exists {
            requesterSeatID := fmt.Sprintf("%d-%d", 
                int(accept.RequesterSeat["row"].(float64)), 
                int(accept.RequesterSeat["col"].(float64)))
            targetSeatID := fmt.Sprintf("%d-%d", 
                int(accept.TargetSeat["row"].(float64)), 
                int(accept.TargetSeat["col"].(float64)))
            
            roomSeats[requesterSeatID] = accept.TargetID
            roomSeats[targetSeatID] = accept.RequesterID
            
            log.Printf("Swapped seats: user %d ↔ user %d in room %d", accept.RequesterID, accept.TargetID, client.roomID)
        }
        h.seatingMutex.Unlock()

        // Broadcast to entire room
        client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, nil)
        return
    }

    // Handle seat_swap_declined - target user declined swap
    if msg.Type == "seat_swap_declined" {
        var decline struct {
            RequesterID uint `json:"requester_id"`
            TargetID    uint `json:"target_id"`
        }

        if dataBytes, ok := msg.Data.([]byte); ok {
            json.Unmarshal(dataBytes, &decline)
        } else if m, ok := msg.Data.(map[string]interface{}); ok {
            decline.RequesterID = uint(m["requester_id"].(float64))
            decline.TargetID = uint(m["target_id"].(float64))
        }

        // Send declined notification only to requester
        client.hub.BroadcastToUsers([]uint{decline.RequesterID}, OutgoingMessage{Data: message, IsBinary: false})
        log.Printf("Swap declined: user %d declined swap with user %d", decline.TargetID, decline.RequesterID)
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

        // Broadcast enriched message with DB ID
        enrichedMsg := map[string]interface{}{
            "type": "chat_message",
            "data": map[string]interface{}{
                "ID":         chatMessage.ID,
                "UserID":     chatMessage.UserID,
                "Username":   chatMessage.Username,
                "Message":    chatMessage.Message,
                "session_id": chatMessage.SessionID,
                "CreatedAt":  chatMessage.CreatedAt,
                "reactions":  []interface{}{}, // Empty reactions initially
            },
        }

        if broadcastBytes, err := json.Marshal(enrichedMsg); err == nil {
            client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: broadcastBytes, IsBinary: false}, nil)
            log.Printf("[chat_message] 📢 Broadcasted message to room %d", client.roomID)
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
    
    // ✅ Default: Broadcast all other message types to room
    // This handles: playback_control, update_room_status, platform_selected, etc.
    log.Printf("[handleMessage] 📢 Broadcasting message type '%s' to room %d", msg.Type, client.roomID)
    client.hub.BroadcastToRoom(client.roomID, OutgoingMessage{Data: message, IsBinary: false}, client)
}