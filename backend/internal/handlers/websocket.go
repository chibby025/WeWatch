// WeWatch/backend/internal/handlers/websocket.go
package handlers

import (
	"log"
	"net/http"
	"sync"
	"strconv"
	"encoding/json"
	"time"

	"wewatch-backend/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// --- Define Message Types ---
// Struct for incoming/outgoing WebSocket messages related to playback control
type PlaybackCommand struct {
    Type      string  `json:"type"`       // e.g., "playback_control"
    Command   string  `json:"command"`    // e.g., "play", "pause", "seek"
    Timestamp int64   `json:"timestamp"`  // Unix timestamp (milliseconds) when command was sent
    MediaItemID uint  `json:"media_item_id,omitempty"` // ID of the media item to play/load (for "load" command)
    SeekTime  float64 `json:"seek_time,omitempty"`   // Time to seek to (for "seek" command)
    // Add more fields as needed for future enhancements
}

// WebSocketMessage represents the generic structure of a WebSocket message.
// It allows parsing different message types into a common format first.
type WebSocketMessage struct {
    Type      string      `json:"type"`       // e.g., "playback_control", "chat_message"
    Data      interface{} `json:"data"`       // The actual data payload (can be PlaybackCommand or ChatMessage)
    Command   string      `json:"command,omitempty"`    // For playback_control type
    Timestamp int64       `json:"timestamp,omitempty"`  // For playback_control type
    MediaItemID uint     `json:"media_item_id,omitempty"` // For playback_control type
    SeekTime  float64     `json:"seek_time,omitempty"`    // For playback_control type
    // Add more fields as needed for different message types
}

// Define a struct for chat messages
type ChatMessage struct {
	Message		string 		`json:"message"`		// The text content of the chat message
	UserID 		uint 		`json:"user_id"`		// ID of the user who sent the message
	Username	string		`json:"username"`		// Username of the user who sent the message (optional, for display)
	Timestamp	int64		`json:"timestamp"`		// Unix timestamp (milliseconds) when message was sent
	RoomID 		uint		`json:"room_id"`		// ID of the room the message is for
}

func InitializeHub() {
    if hub == nil { // Check if hub is already initialized to prevent multiple initializations
        log.Println("Initializing WebSocket Hub...")
        hub = NewHub()        // Create the Hub instance
        go hub.Run()          // Start the Hub's main loop in a goroutine
        log.Println("WebSocket Hub initialized and running.")
    } else {
        log.Println("WebSocket Hub already initialized.")
    }
}

// --- WebSocket Hub ---
var hub *Hub 
// Hub maintains the set of active clients and broadcasts messages to the rooms.
type Hub struct {
	// Registered clients per room.
	// Key: room ID (uint), Value: map of clients in that room
	// map[uint]map[*Client]bool
	rooms map[uint]map[*Client]bool

	// Register requests from the clients.
	register chan *Client

	// Unregister requests from clients.
	unregister chan *Client

	// Mutex for thread-safe access to the rooms map
	mutex sync.RWMutex
}

// NewHub creates a new Hub instance.
func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[uint]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub's main loop to handle register/unregister/broadcast events.
func (h *Hub) Run() {
	for { // Infinite loop
		select {
		case client := <-h.register:
			h.mutex.Lock()
			// Ensure the room map exists
			if h.rooms[client.roomID] == nil {
				h.rooms[client.roomID] = make(map[*Client]bool)
			}
			// Add the client to the room's client map
			h.rooms[client.roomID][client] = true
			h.mutex.Unlock()
			log.Printf("WebSocket Hub: Client %p registered for room %d. Total clients in room: %d", client, client.roomID, len(h.rooms[client.roomID]))

		case client := <-h.unregister:
			h.mutex.Lock()
			// Check if the room and client exist
			if roomClients, ok := h.rooms[client.roomID]; ok {
				if _, ok := roomClients[client]; ok {
					// Remove the client from the room's client map
					delete(roomClients, client)
					// Close the client's send channel
					close(client.send)
					log.Printf("WebSocket Hub: Client %p unregistered from room %d. Remaining clients in room: %d", client, client.roomID, len(roomClients))
					// If the room is now empty, clean up the map entry
					if len(roomClients) == 0 {
						delete(h.rooms, client.roomID)
						log.Printf("WebSocket Hub: Room %d is now empty, removed from hub.", client.roomID)
					}
				}
			}
			h.mutex.Unlock()
			// Close the WebSocket connection (deferred in client's readPump/writePump)
		}
	}
}

// BroadcastToRoom sends a message to all clients in a specific room.
func (h *Hub) BroadcastToRoom(roomID uint, message []byte) {
	h.mutex.RLock()         // Acquire read lock
	defer h.mutex.RUnlock() // Release read lock

	// Get the map of clients for the specified room
	clients, ok := h.rooms[roomID]
	if !ok {
		log.Printf("WebSocket Hub: No clients in room %d to broadcast to.", roomID)
		return
	}

	// Iterate over clients in the room
	for client := range clients {
		// Send the message to the client's send channel
		// Use select with default to prevent blocking if client's buffer is full
		select {
		case client.send <- message:
			log.Printf("WebSocket Hub: Message sent to client %p in room %d", client, roomID)
		default:
			log.Printf("WebSocket Hub: Client %p send buffer full, closing connection.", client)
			// If buffer is full, close the connection
			close(client.send)
			delete(clients, client)
			// TODO: Handle cleanup properly (unregister client)
		}
	}
	log.Printf("WebSocket Hub: Broadcasted message to room %d (clients: %d)", roomID, len(clients))
}



// --- WebSocket Client ---

// Client is a middleman between the WebSocket connection and the Hub.
type Client struct {
	hub *Hub // Reference to the Hub

	conn *websocket.Conn // The underlying WebSocket connection

	send chan []byte // Buffered channel of outbound messages

	roomID uint // The ID of the room this client belongs to

	userID uint // The ID of the user this client represents
}

// readPump pumps messages from the WebSocket connection to the Hub.
// It's run as a goroutine for each client.
func (c *Client) readPump() {
	defer func() {
		// 1. Cleanup: When readPump exits (due to error or break), unregister the client
		//  and close the WebSocket connection
		c.hub.unregister <- c  // Send client to the unregister channel
		c.conn.Close()			// Close the connection
	}()
	// c.conn.SetReadLimit(maxMessageSize)
	// c.conn.SetReadDeadline(time.Now().Add(pongWait))
	// c.conn.SetPongHandler(func(string) error { c.conn.SetReadDeadline(time.Now().Add(pongWait)); return nil })
	for {
		// 2. Infinite loop to continuously read messages from the WebSocket connection
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			// 3. Handle read errors (connection closed, network issues)
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket Client (readPump): Unexpected close error: %v", err)
			} else {
				log.Printf("WebSocket Client (readPump): Connection closed or read error: %v", err)
			}
			break
		}
		// 4. --- PROCESS INCOMING MESSAGE (Playback Commands) ---
		// Process incoming message (e.g., playback commands from host)
		log.Printf("WebSocket Client (readPump): Received message from client %p (Room %d, User %d): %s", c, c.roomID, c.userID, message)
		
		// 5. Parse the incoming JSON message
		// Use a more generic struct to handle different message types
		var msg WebSocketMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("WebSocket Client (readPump): Error parsing JSON message: %v", err)
			continue  // Skip this malformed message
		}
		
		// 6. --- CHECK MESSAGE TYPE AND HANDLE ACCORDINGLY ---
		// --- ADD THIS SWITCH STATEMENT ---
		switch msg.Type {
		case "playback_control":
			// Log and process playback control commands
			log.Printf("WebSocket Client (readPump): Playback control command received: %s", msg.Command)

			// Create a broadcast version of the playback command
			broadcastCmd := PlaybackCommand {
				Type:		msg.Type,
				Command:	msg.Command,
				Timestamp:	msg.Timestamp,
				MediaItemID: msg.MediaItemID,
				SeekTime:	 msg.SeekTime,
				//SenderID:	 c.userID,
			}
			// Marshal the broadcast command back to JSON
			broadcastMessage, err := json.Marshal(broadcastCmd)
			if err != nil {
				log.Printf("WebSocket Client (readPump): Error marshaling playback command: %v", err)
				continue
			}

			// Broadcast the command to all other clients in the same room via the Hub.
			log.Printf("WebSocket Client (readPump): Broadcasting playback command '%s' for room %d", msg.Command, c.roomID)
			c.hub.BroadcastToRoom(c.roomID, broadcastMessage) // <-- BROADCAST VIA HUB
			// --- --- ---
		case "chat_message":
			// Log and process chat messages
			log.Printf("WebSocket Client (readPump): Chat message received: %+v", msg.Data)

			// Type assert msg.Data to map[string]interface{} to access fields
			chatData, ok := msg.Data.(map[string]interface{})
			if !ok {
				log.Printf("WebSocket Client (readPump): Invalid chat message data format")
				continue // Skip this message
			}

			// Extract the message text from the data
			messageText, ok := chatData["message"].(string)
			if !ok || messageText == "" {
				log.Printf("WebSocket Client (readPump): Invalid or empty chat message content")
				continue // Skip this message
			}

			// Create a ChatMessage struct to broadcast
			// Include sender info and timestamp
			chatMsg := ChatMessage{
				Message:   messageText,
				UserID:    c.userID,      // Set sender ID to the current client's user ID
				Username:  "",            // Optional: Fetch username from DB later
				Timestamp: time.Now().UnixMilli(), // Set current timestamp
				RoomID:    c.roomID,      // Set room ID to the current client's room ID
			}

			// Create the complete message structure with type field for broadcasting
			completeChatMessage := WebSocketMessage{
				Type: "chat_message",
				Data: chatMsg,
			}

			// Marshal the complete message back to JSON for broadcasting
			broadcastChatMessage, err := json.Marshal(completeChatMessage)
			if err != nil {
				log.Printf("WebSocket Client (readPump): Error marshaling complete chat message: %v", err)
				continue // Skip this message
			}

			// Broadcast the complete chat message to all other clients in the same room via the Hub
			log.Printf("WebSocket Client (readPump): Broadcasting complete chat message from user %d in room %d: %s", c.userID, c.roomID, messageText)
			c.hub.BroadcastToRoom(c.roomID, broadcastChatMessage) // <-- BROADCAST COMPLETE CHAT VIA HUB
			// --- --- ---
		default:
			// Log unknown message types.
			log.Printf("WebSocket Client (readPump): Unknown message type received: %s", msg.Type)
		}

	}
}

// writePump pumps messages from the Hub to the WebSocket connection.
// It's run as a goroutine for each client.
func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			// c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The Hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				log.Printf("WebSocket Client (writePump): Error getting writer: %v", err)
				return
			}
			w.Write(message)

			// Add queued messages to the current WebSocket message.
			// n := len(c.send)
			// for i := 0; i < n; i++ {
			//	 w.Write(newline)
			//	 w.Write(<-c.send)
			// }

			if err := w.Close(); err != nil {
				log.Printf("WebSocket Client (writePump): Error closing writer: %v", err)
				return
			}
		// case <-time.After(pingPeriod): // Periodic ping (optional)
		//	 c.conn.SetWriteDeadline(time.Now().Add(writeWait))
		//	 if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
		//		 log.Printf("WebSocket Client (writePump): Ping error: %v", err)
		//		 return
		//	 }
		}
	}
}

// --- WebSocket Handler ---

// WebSocket upgrade configuration
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from any origin during development.
		// In production, restrict this to your frontend's domain (e.g., "http://localhost:5173").
		// Example for production:
		// origin := r.Header.Get("Origin")
		// return origin == "http://localhost:5173" || origin == "https://yourdomain.com"
		return true // Allow all origins (development)
	},
}

// WebSocketHandler handles the GET /api/ws/:room_id endpoint.
// It upgrades the HTTP connection to a WebSocket connection.
func WebSocketHandler(c *gin.Context) {
	// 1. Get the authenticated user's ID from the context (set by AuthMiddleware).
	userIDValue, exists := c.Get("user_id")
	if !exists {
		log.Println("WebSocketHandler: Unauthorized access, user_id not found in context")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	authenticatedUserID, ok := userIDValue.(uint)
	if !ok {
		log.Println("WebSocketHandler: Error asserting user ID type")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
		return
	}

	// 2. Get the room ID from the URL parameter (:room_id).
	roomIDStr := c.Param("id") // Note: Using :id in the route
	if roomIDStr == "" {
		log.Println("WebSocketHandler: Missing room ID parameter")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Room ID is required"})
		return
	}

	roomID, err := strconv.ParseUint(roomIDStr, 10, 64)
	if err != nil || roomID == 0 {
		log.Printf("WebSocketHandler: Invalid room ID format: %s", roomIDStr)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}
	roomIDUint := uint(roomID)

	// 3. Fetch the room from the database to check existence.
	var room models.Room
	result := DB.First(&room, roomIDUint)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			log.Printf("WebSocketHandler: Room with ID %d not found", roomIDUint)
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		} else {
			log.Printf("WebSocketHandler: Database error fetching room %d: %v", roomIDUint, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// 4. Authorization Check REMOVED/COMMENTED OUT.
	// To allow any user to connect via WebSocket, we skip the check: room.HostID == authenticatedUserID.
	// If you want to restrict WebSocket connections to the host ONLY, uncomment the lines below:
	/*
		if room.HostID != authenticatedUserID {
			log.Printf("WebSocketHandler: User %d is not the host (HostID: %d) of room %d", authenticatedUserID, room.HostID, roomIDUint)
			c.JSON(http.StatusForbidden, gin.H{"error": "Only the room host can connect via WebSocket"})
			return
		}
	*/

	// --- WEBSOCKET CONNECTION ESTABLISHMENT STARTS HERE ---

	// 5. Upgrade the HTTP connection to a WebSocket connection.
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocketHandler: Error upgrading connection: %v", err)
		// c.JSON won't work after Upgrade, so just return
		return
	}
	// Defer closing the connection if Upgrade succeeds
	defer conn.Close()

	// 6. Create a new Client instance.
	client := &Client{
		hub:    hub,          // Use the global hub instance
		conn:   conn,         // The upgraded WebSocket connection
		send:   make(chan []byte, 256), // Buffered channel for outbound messages
		roomID: roomIDUint,   // Link to the room
		userID: authenticatedUserID, // Link to the user
	}
	log.Printf("WebSocketHandler: New WebSocket client connected for room %d, user %d", roomIDUint, authenticatedUserID)

	// 7. Register the client with the Hub.
	hub.register <- client

	// 8. Start the client's read and write pumps concurrently.
	// Allow connection to stay open for communication
	go client.writePump()
	go client.readPump()

	// 9. Keep the connection alive.
	// The readPump and writePump goroutines handle the connection lifecycle.
	// This select block would typically wait for a signal to close the connection,
	// but for now, we let the goroutines run until the connection closes.
	// In a more complex app, you might use a context or channel to signal shutdown.
	select {} // Block forever (until connection closes)
}