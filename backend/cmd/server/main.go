
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
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
	err = DB.AutoMigrate(&models.User{}, &models.Room{}, &models.MediaItem{},&models.UserRoom{}) // Pass pointers to model structs
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

	// --- Setup GIN ROUTER ---
	// Set Gin to Release mode in production
	gin.SetMode(gin.ReleaseMode)

	r := gin.Default()

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

	// --- STATIC FILE SERVING ---
	// THIS IS THE KEY ADDITION
	// Serve static files from the ./uploads directory at the URL path /uploads
	// This allows the browser to access uploaded files via http://localhost:8080/uploads/filename.ext
	r.Static("/uploads", "./uploads")
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

	// Protected routes (auth required)
	// Apply the AuthMiddleware to the /api/auth/me route
	r.GET("/api/auth/me", handlers.AuthMiddleware(), handlers.GetCurrentUserHandler)

	// --- Room Routes (Protected) ---
	// All room-related endpoints require authentication
	roomGroup := r.Group("/api/rooms")
	roomGroup.Use(handlers.AuthMiddleware()) // Apply AuthMiddleware to all routes in this group
	{
		roomGroup.POST("", handlers.CreateRoomHandler)                    // POST /api/rooms (Create a new room)
		roomGroup.GET("", handlers.GetRoomsHandler)                       // GET /api/rooms (Get list of rooms)
		roomGroup.GET("/:id", handlers.GetRoomHandler)                    // GET /api/rooms/:id (Get a specific room)
		roomGroup.GET("/:id/media", handlers.GetMediaItemsForRoomHandler) // GET /api/rooms/:id/media (Get media items for a room)
		roomGroup.POST("/:id/upload", handlers.UploadMediaHandler)        // POST /api/rooms/:id/upload (Upload media to a room)
		roomGroup.GET("/:id/members", handlers.GetRoomMembersHandler)
		roomGroup.PUT("/:id/users/:user_id/role", handlers.SetUserRoleHandler)
    	roomGroup.GET("/:id/users/:user_id/role", handlers.GetUserRoleHandler)
		roomGroup.POST("/:id/join", handlers.JoinRoomHandler)
		roomGroup.POST("/:id/leave", handlers.LeaveRoomHandler)
		// --- WebSocket Route (Protected) ---
		// This endpoint upgrades HTTP to WebSocket for real-time communication.
		// It requires authentication.
		// The route parameter is :room_id to distinguish it from other room routes.
		roomGroup.GET("/:id/ws", handlers.WebSocketHandler) // GET /api/rooms/:id/ws (WebSocket connection)
    	// This creates the route: GET /api/rooms/ws/:room_id
    	// Which resolves to: ws://localhost:8080/api/rooms/ws/2 (for room ID 2)
    	// --- --- ---
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