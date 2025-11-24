package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	// "strconv" 

	"github.com/joho/godotenv"
	"github.com/gin-gonic/gin"
	"github.com/gin-contrib/cors"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/handlers"
)

// Global variable to hold the database connection
var DB *gorm.DB
// Note: No need to declare a global 'hub' variable here anymore,
// as it's managed internally by the handlers package.

// Global variable to hold the WebSocket hub instance
//var hub *handlers.Hub // Declare the global hub variable
func main() {
	// --- Load .env file ---
	err := godotenv.Load()
	log.Println("LIVEKIT_API_KEY =", os.Getenv("LIVEKIT_API_KEY"))
	log.Println("LIVEKIT_API_SECRET =", os.Getenv("LIVEKIT_API_SECRET"))
	if err != nil {
		log.Println("Warning: Error loading .env file, using environment variables or defaults")
	}

	// --- Database Connection ---
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"))

	// Open connection to the database using GORM
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	log.Println("Connected to the database successfully")

	// Make the DB connection available to handlers
	handlers.DB = DB // Pass DB to handlers package

	// --- Auto Migrate Schema ---
	// GORM to auto creates/updates db tables based on the models
	err = DB.AutoMigrate(&models.User{}, &models.Room{}, &models.MediaItem{}, &models.TemporaryMediaItem{}, &models.UserRoom{}, &models.ScheduledEvent{}, &models.ChatMessage{},&models.Reaction{}, 
		&models.WatchSession{}, &models.PrivateChatHistory{}, &models.PrivateChatMessage{}, &models.WatchSessionMember{}) // Pass pointers to model structs
	if err != nil {
		log.Fatal("Failed to migrate database schema:", err)
	}
	log.Println("Database schema (User, Room, MediaItem) migrated successfully")

	
	// --- Initialize WebSocket Hub ---
	//hub = handlers.NewHub() // Create the global hub instance
	// Make the hub available to handlers
	//handlers.hub = hub // Pass hub to the handlers package // <-- Fix assignment
	// Start the hub's main loop in a separate goroutine
	//go hub.Run()
	handlers.InitializeHub()
	log.Println("WebSocket Hub initialized and running")

	// Start background cleanup goroutine
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			log.Println("🕗 Running scheduled cleanup of expired watch sessions...")
			handlers.CleanupExpiredSessions()
		}
	}()

	// --- Setup GIN ROUTER ---
	// Set Gin to Release mode in production
	gin.SetMode(gin.ReleaseMode)
	//gin.DefaultMaxMultipartMemory = 1 << 30 // 1 GB

	r := gin.Default()

	// ✅ ADD THIS LINE: Allow up to 1GB file uploads
	r.MaxMultipartMemory = 1 << 30 // 1 GB — allows large file uploads
	
	// --- CORS Configuration ---
	config := cors.Config{
		AllowOrigins:     []string{"http://localhost:5173"}, // Allow requests from your frontend origin
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"}, // Important: Allow Authorization header for JWT
		AllowCredentials: true, // If you need to send cookies or Authorization headers
		// ExposeHeaders:    []string{"Content-Length"},
		// AllowOriginFunc: func(origin string) bool { return origin == "http://localhost:5173" }, // Alternative way
	}
	r.Use(cors.New(config)) // Apply the CORS middleware

	r.OPTIONS("/uploads/*filepath", func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Headers", "Range, Content-Type, Origin, Accept")
		c.Header("Access-Control-Allow-Methods", "GET, OPTIONS")
		c.Header("Access-Control-Max-Age", "86400")
		c.Status(http.StatusNoContent)
	})

	// --- STATIC FILE SERVING ---
	// THIS IS THE KEY ADDITION
	// Serve static files from the ./uploads directory at the URL path /uploads
	// This allows the browser to access uploaded files via http://localhost:8080/uploads/filename.ext
	//r.Static("/uploads", "./uploads")
	// ✅ Efficient — uses sendfile() syscall, zero-copy, no extra goroutines
	// Serve static files with explicit CORS headers for canvas security
	// Range-aware static file server
	r.GET("/uploads/*filepath", func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Range, Content-Type, Origin, Accept, Authorization")
		c.Header("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
		c.Header("Accept-Ranges", "bytes")
		c.Header("Cache-Control", "public, max-age=3600")

		urlPath := c.Param("filepath")
		if strings.Contains(urlPath, "..") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}

		fullPath := filepath.Join("./uploads", urlPath)

		// Set MIME type
		mimeType := "video/mp4"
		switch {
		case strings.HasSuffix(urlPath, ".avi"):
			mimeType = "video/x-msvideo"
		case strings.HasSuffix(urlPath, ".mov"):
			mimeType = "video/quicktime"
		case strings.HasSuffix(urlPath, ".mkv"):
			mimeType = "video/x-matroska"
		case strings.HasSuffix(urlPath, ".webm"):
			mimeType = "video/webm"
		}
		c.Header("Content-Type", mimeType)

		http.ServeFile(c.Writer, c.Request, fullPath)
	})
	
	// --- --- ---

	// Health check endpoint
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"message":  "WeWatch Backend is running!",
			"database": "connected",
		})
	})

	// --- Auth Routes ---
	// Public routes (no auth required)
	r.POST("/api/auth/register", handlers.RegisterHandler)
	r.POST("/api/auth/login", handlers.LoginHandler)
	r.POST("/api/auth/logout", handlers.LogoutHandler)

	// Protected routes (auth required)
	// Apply the AuthMiddleware to the /api/auth/me route
	r.GET("/api/auth/me", handlers.AuthMiddleware(), handlers.GetCurrentUserHandler)

	// --- Room Routes (Protected) ---
	// All room-related endpoints require authentication
	roomGroup := r.Group("/api/rooms")
	roomGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware()) // Apply AuthMiddleware to all routes in this group
	{
		roomGroup.POST("", handlers.CreateRoomHandler)                    // POST /api/rooms (Create a new room)
		roomGroup.GET("", handlers.GetRoomsHandler)                       // GET /api/rooms (Get list of rooms)
		roomGroup.GET("/:id", handlers.GetRoomHandler)                    // GET /api/rooms/:id (Get a specific room)
		roomGroup.GET("/:id/livekit-token", handlers.GenerateLiveKitTokenHandler) // ✅ ADD THIS LINE (Generate LiveKit token for a room)
		// --- Media Item Routes (Permanent) ---
		roomGroup.GET("/:id/media", handlers.GetMediaItemsForRoomHandler) // GET /api/rooms/:id/media (Get media items for a room)
		roomGroup.POST("/:id/upload", handlers.UploadMediaHandler)        // POST /api/rooms/:id/upload (Upload media to a room)
		roomGroup.GET("/:id/temporary-media", handlers.GetTemporaryMediaItemsForRoomHandler) // GET /api/rooms/:id/temporary-media (Get list of temporary media items)
		roomGroup.DELETE("/:id/temporary-media", handlers.DeleteTemporaryMediaItemsForRoomHandler) // DELETE /api/rooms/:id/temporary-media (Delete all temporary media items - Host only)
		// --- Instant Watch (Temporary Rooms) ---
		roomGroup.POST("/instant-watch", handlers.CreateInstantWatchHandler) // POST /api/rooms/instant-watch (Create an instant watch temporary room)
		roomGroup.GET("/:id/members", handlers.GetRoomMembersHandler)
		roomGroup.POST("/watch-sessions/:session_id/end", handlers.EndWatchSessionHandler)
		roomGroup.PUT("/:id/users/:user_id/role", handlers.SetUserRoleHandler)
    	roomGroup.GET("/:id/users/:user_id/role", handlers.GetUserRoleHandler)
		roomGroup.POST("/:id/join", handlers.JoinRoomHandler)
		roomGroup.POST("/:id/leave", handlers.LeaveRoomHandler)
		roomGroup.DELETE("/:id", handlers.DeleteRoomHandler)
		roomGroup.PUT("/:id/media/order", handlers.UpdateMediaOrderHandler)
 		roomGroup.PUT("/:id/loop-mode", handlers.UpdateRoomLoopModeHandler)
		roomGroup.POST("/:id/scheduled-events", handlers.CreateScheduledEventHandler)
		roomGroup.GET("/:id/scheduled-events", handlers.GetScheduledEventsHandler)
		roomGroup.POST("/:id/chat", handlers.CreateChatMessageHandler)
		roomGroup.GET("/:id/chat/history", handlers.GetChatHistoryHandler)
		roomGroup.DELETE("/:id/chat/:message_id", handlers.DeleteChatMessageHandler)
		roomGroup.POST("/:id/watch-session", handlers.CreateWatchSessionForRoomHandler) // Regular Room Video Watch
		roomGroup.GET("/:id/active-session", handlers.GetActiveSessionHandler)
		roomGroup.PUT("/:id/status", handlers.UpdateRoomStatusHandler)
		roomGroup.DELETE("/:id/temporary-media/:item_id", handlers.DeleteSingleTemporaryMediaItemHandler)
		
		// --- WebSocket Route (Protected) ---
		// This endpoint upgrades HTTP to WebSocket for real-time communication.
		// It requires authentication.
		// The route parameter is :room_id to distinguish it from other room routes.
		roomGroup.GET("/:id/ws", handlers.WebSocketHandler) // GET /api/rooms/:id/ws (WebSocket connection)
    	// This creates the route: GET /api/rooms/ws/:room_id
    	// Which resolves to: ws://localhost:8080/api/rooms/ws/2 (for room ID 2)
    	// --- --- ---
	}

	// --- SCHEDULED EVENTS ROUTES (Protected, not in roomGroup) ---
	protected := r.Group("/api")
	protected.Use(handlers.AuthMiddleware()) // ✅ Apply auth to all sub-routes

	{
		protected.PUT("/scheduled-events/:id", handlers.UpdateScheduledEventHandler)
		protected.DELETE("/scheduled-events/:id", handlers.DeleteScheduledEventHandler)
		protected.GET("/scheduled-events/:id/ical", handlers.DownloadICalHandler)
	}
	// --- Placeholder for Future Routes ---
	// roomGroup.PUT("/:id", handlers.UpdateRoomHandler)
    // roomGroup.DELETE("/:id", handlers.DeleteRoomHandler)
    // roomGroup.POST("/:id/join", handlers.JoinRoomHandler)
    // roomGroup.POST("/:id/upload", handlers.UploadMediaHandler)
    // roomGroup.POST("/:id/playback", handlers.UpdatePlaybackHandler)

	port := ":8080"
	log.Printf("Starting WeWatch backend server on port %s", port)
	err = r.Run(port) // Use = because err is already declared
	if err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}