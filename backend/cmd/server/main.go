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

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"wewatch-backend/internal/handlers"
	"wewatch-backend/internal/handlers/games"
	"wewatch-backend/internal/middleware"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
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
	// Prefer DATABASE_URL (Railway private networking) over individual vars (public proxy)
	var dsn string
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		dsn = dbURL
		log.Println("🔒 Database: using DATABASE_URL (private network)")
	} else {
		sslMode := "disable"
		if os.Getenv("RAILWAY_ENVIRONMENT") != "" || os.Getenv("DB_HOST") != "localhost" {
			sslMode = "require"
			log.Println("🔒 Database SSL Mode: ENABLED (production)")
		} else {
			log.Println("🔓 Database SSL Mode: DISABLED (local development)")
		}
		dsn = fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
			os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
			os.Getenv("DB_NAME"), os.Getenv("DB_PORT"), sslMode)
		log.Println("🏠 Database: using individual DB_* vars")
	}

	// Open connection to the database using GORM
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
		Logger: gormlogger.New(
			log.New(os.Stderr, "\r\n", log.LstdFlags),
			gormlogger.Config{
				SlowThreshold:             2 * time.Second,
				LogLevel:                  gormlogger.Error,
				IgnoreRecordNotFoundError: true,
				Colorful:                  false,
			},
		),
	})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	log.Println("Connected to the database successfully")

	// --- Connection Pool Tuning ---
	// Previously unconfigured, which left Go's database/sql defaults in place:
	// unlimited max open connections but only 2 idle. Under light load that means
	// connections get closed and reopened constantly; under a burst (e.g. many
	// clients disconnecting/reconnecting at once) there was nothing capping how many
	// connections got opened, risking hitting Postgres's own connection limit.
	if sqlDB, err := DB.DB(); err != nil {
		log.Println("⚠️ Failed to get underlying sql.DB for pool tuning:", err)
	} else {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetConnMaxLifetime(30 * time.Minute)
		sqlDB.SetConnMaxIdleTime(5 * time.Minute)
		log.Println("🔧 DB connection pool configured: max_open=25 max_idle=10 max_lifetime=30m max_idle_time=5m")
	}

	// Make the DB connection available to handlers
	handlers.DB = DB // Pass DB to handlers package

	// --- Auto Migrate Schema ---
	// GORM auto creates/updates db tables based on the models
	// Migrate WatchSession FIRST - other models depend on it
	// NOTE: WatchSession and all related models are DISABLED from AutoMigrate
	// because GORM incorrectly tries to convert session_id from VARCHAR(36) to BIGINT
	// when it encounters foreign key relationships. These schemas are managed via manual migrations.
	// Disabled models: WatchSession, WatchSessionMember, SessionTicket, Theater,
	// UserTheaterAssignment, BroadcastPermission, BroadcastRequest
	log.Println("Migrating models (WatchSession-related models managed via manual migrations)...")
	err = DB.AutoMigrate(&models.User{}, &models.Room{}, &models.MediaItem{}, &models.TemporaryMediaItem{}, &models.UserRoom{}, &models.ScheduledEvent{}, &models.ChatMessage{}, &models.Reaction{},
		&models.RoomMessage{}, &models.RoomTVContent{},
		// Room groups models (Discord-style channels for chat segmentation)
		&models.RoomGroup{}, &models.UserRoomGroup{},
		// Payment system models (excluding SessionTicket which references WatchSession)
		&models.UserWallet{}, &models.TokenTransaction{}, &models.GatewayEarning{},
		&models.Donation{}, &models.InstantWatchEarning{},
		&models.Payout{}, &models.PaymentAccount{}, &models.KYCVerification{}, &models.RefundRequest{},
		// Security models (P0 fixes - April 25, 2026)
		&models.TokenBlacklist{}, &models.ProcessedWebhook{}, &models.SecurityEvent{},
		// Posts system models (Phase 1 - Post & Recording Feature)
		&models.Post{}, &models.PostLike{}, &models.PostComment{}, &models.PostView{},
		// Ads system models (Phase 1 - Ad Campaigns & RoomTV Ads)
		&models.AdSettings{},
		// Friendship and lobby chat models
		&models.Friendship{}, &models.LobbyChat{}, &models.LobbyGroup{}, &models.LobbyGroupMember{},
		// Follow system (decoupled from room membership)
		&models.UserFollow{},
		// User settings model (notifications & privacy)
		&models.UserSettings{},
		// Admin audit log model (compliance & security)
		&models.AdminAuditLog{},
		// Notification model (room posts, session alerts, friend events)
		&models.Notification{},
		// Session likes
		&models.SessionLike{},
		// User statuses (stories)
		&models.UserStatus{}, &models.UserStatusView{}, &models.UserStatusExclusion{},
		// Community Events (requests + upvotes + claims)
		&models.CommunityRequest{}, &models.CommunityRequestUpvote{}, &models.CommunityRequestClaim{},
		// Room message attachments
		&models.RoomMessage{},
		// Sticker packs (user-created, Telegram imports, community)
		&models.StickerPack{}, &models.StickerItem{}, &models.UserStickerPack{})
	if err != nil {
		log.Fatal("Failed to migrate database schema:", err)
	}

	log.Println("Database schema migrated successfully")
	log.Println("✅ Security enhancements: Token blacklist, webhook idempotency, security event logging")
	log.Println("✅ Posts system: User-generated content, recordings, and discovery feed")
	log.Println("✅ Friendships & lobby chat: Direct messaging and friend requests")

	// --- Initialize WebSocket Hub ---
	//hub = handlers.NewHub() // Create the global hub instance
	// Make the hub available to handlers
	//handlers.hub = hub // Pass hub to the handlers package // <-- Fix assignment
	// Start the hub's main loop in a separate goroutine
	//go hub.Run()
	handlers.InitializeHub()
	log.Println("WebSocket Hub initialized and running")

	// ✅ Initialize Preview Generation System
	handlers.InitPreviewSystem(DB, handlers.GetHub())
	log.Println("✅ Preview generation system initialized")

	// --- Initialize Early Bird Scheduler ---
	// Set the WebSocket hub for the early bird broadcaster (still needed for WS notifications)
	utils.SetWebSocketHub(handlers.GetHub())

	// --- Initialize Multi-Account Payment System ---
	err = utils.InitializeAccountManager()
	if err != nil {
		log.Printf("⚠️  Warning: Payment account manager initialization failed: %v", err)
		log.Println("Payment splitting will not work properly. Please check .env file.")
	} else {
		log.Println("✅ Multi-account payment system initialized")
		log.Println("   - Revenue account (25%) ready")
		log.Println("   - Reserve account (75%) ready")
	}

	// --- Validate BunnyCDN Configuration ---
	if err := utils.ValidateBunnyCDNConfig(); err != nil {
		log.Printf("⚠️  Warning: BunnyCDN configuration issue: %v", err)
		log.Println("Using local storage fallback for development. Posts will work but won't be CDN-accelerated.")
	}

	// ── Central scheduler — ONE goroutine replaces 7 separate tickers ──────────────
	// Base tick: 1 minute. Counter drives all less-frequent intervals.
	// Saves ~8 goroutines and cuts DB calls from ~12/min to ~3/min.
	go func() {
		// Run startup tasks immediately (don't wait for first tick)
		utils.DeactivateExpiredEarlyBird(DB)
		utils.CleanupExpiredTrailers(DB)
		utils.CleanupOldEvents(DB)

		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		var tick uint64
		for range ticker.C {
			tick++

			// ── Every 1 min: time-sensitive pricing + trailer expiry ──────
			utils.DeactivateExpiredEarlyBird(DB)
			utils.CleanupExpiredTrailers(DB)

			// ── Every 5 min: temp media, previews, status images ──────────
			if tick%5 == 0 {
				handlers.CleanupAllTemporaryMedia()
				handlers.CleanupOrphanedPreviews()
				handlers.CleanupOrphanedPodcastLogos()
				handlers.CleanupExpiredStatusMedia()
			}

			// ── Every 10 min: expired sessions, orphaned instant rooms ────
			if tick%10 == 0 {
				handlers.CleanupExpiredSessions()
				handlers.CleanupOrphanedInstantWatchRooms()
			}

			// ── Every 60 min: stale sessions + community request close ────
			if tick%60 == 0 {
				handlers.CleanupStaleSessions()
			}

			// ── Every 24 hr: JWT blacklist, old scheduled events ──────────
			if tick%1440 == 0 {
				if err := models.CleanupExpiredTokens(DB); err != nil {
					log.Printf("⚠️ [Scheduler] JWT cleanup error: %v", err)
				}
				utils.CleanupOldEvents(DB)
			}

			// ── Every 7 days: webhook records (reset counter to avoid overflow) ──
			if tick%10080 == 0 {
				if err := models.CleanupOldWebhooks(DB); err != nil {
					log.Printf("⚠️ [Scheduler] Webhook cleanup error: %v", err)
				}
				tick = 0
			}
		}
	}()
	log.Println("✅ Central scheduler started (1-min base tick, 7 tasks consolidated)")

	// RoomTV cleanup: kept at 10 seconds — playlist timing precision requires it
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			handlers.CleanupExpiredRoomTVContent()
		}
	}()

	// ✅ Run initial cleanup on startup to remove any existing orphaned rooms
	log.Println("🧹 Running initial cleanup of orphaned instant watch rooms...")
	handlers.CleanupOrphanedInstantWatchRooms()

	// --- Setup GIN ROUTER ---
	// Set Gin to Release mode in production
	gin.SetMode(gin.ReleaseMode)
	//gin.DefaultMaxMultipartMemory = 1 << 30 // 1 GB

	r := gin.Default()

	// ✅ ADD THIS LINE: Allow up to 1GB file uploads
	r.MaxMultipartMemory = 1 << 30 // 1 GB — allows large file uploads

	// --- CORS Configuration ---
	// ✅ P0 Security Fix: Strict CORS for production
	config := cors.Config{
		AllowOriginFunc: func(origin string) bool {
			// Fires on every single request (CORS preflight + actual) — was an
			// unconditional debug log here, drowning out everything else in the
			// terminal during any real testing session. Removed; the REJECTED log
			// below still fires for the actually-interesting case.

			// Production: Only allow specific domains
			if os.Getenv("ENVIRONMENT") == "production" {
				allowedOrigins := []string{
					"https://letswatchout.com",
					"https://www.letswatchout.com",
					"https://letswatchout.vercel.app", // Vercel preview/staging (uploads bypass Vercel proxy)
				}
				if fu := os.Getenv("FRONTEND_URL"); fu != "" {
					allowedOrigins = append(allowedOrigins, fu)
				}
				for _, allowed := range allowedOrigins {
					if origin == allowed {
						return true
					}
				}
				log.Printf("⚠️  CORS REJECTED (production) - Origin: %s", origin)
				return false
			}

			// Development: Allow localhost and tunnels
			if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
				return true
			}
			// Allow Cloudflare Tunnel (HTTPS)
			if strings.Contains(origin, ".trycloudflare.com") {
				return true
			}
			// Allow Localtunnel (HTTPS)
			if strings.Contains(origin, ".loca.lt") {
				return true
			}
			// Allow Vercel deployments (HTTPS) - DEVELOPMENT ONLY
			if strings.Contains(origin, ".vercel.app") {
				return true
			}
			// Allow specific IPs (HTTP)
			if strings.HasPrefix(origin, "http://192.168.") || strings.HasPrefix(origin, "http://10.") {
				return true
			}

			log.Printf("⚠️  CORS REJECTED - Origin: %s", origin)
			return false
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization"},
		AllowCredentials: true,
		ExposeHeaders:    []string{"Content-Length", "Content-Type"},
		MaxAge:           12 * time.Hour, // Cache preflight for 12 hours
	}
	r.Use(cors.New(config)) // Apply the CORS middleware

	// Add middleware to prevent caching of CORS headers
	r.Use(func(c *gin.Context) {
		c.Header("Vary", "Origin")
		c.Next()
	})

	r.OPTIONS("/uploads/*filepath", func(c *gin.Context) {
		// Let CORS middleware handle this - don't set manual headers
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
		// Don't set manual CORS headers - let the middleware handle it
		c.Header("Accept-Ranges", "bytes")

		urlPath := c.Param("filepath")
		// HLS manifests (.m3u8) get rewritten in place while a device-stream upload is
		// still progressing — a cached response here would serve a stale segment list
		// (or a half-empty one) to a member who joins partway through. Segments (.ts)
		// never change once written, so they keep the long cache.
		if strings.HasSuffix(urlPath, ".m3u8") {
			c.Header("Cache-Control", "no-cache")
		} else {
			c.Header("Cache-Control", "public, max-age=3600")
		}
		if strings.Contains(urlPath, "..") {
			c.AbortWithStatus(http.StatusForbidden)
			return
		}

		// Strip leading slash so filepath.Join produces a relative path
		trimmedPath := strings.TrimPrefix(urlPath, "/")
		fullPath := filepath.Join("./uploads", trimmedPath)
		if strings.HasPrefix(urlPath, "/previews/") {
			log.Printf("📁 [Static] urlPath=%q fullPath=%q", urlPath, fullPath)
		}

		// Set MIME type based on file extension
		mimeType := "application/octet-stream"
		switch {
		case strings.HasSuffix(urlPath, ".mp4"):
			mimeType = "video/mp4"
		case strings.HasSuffix(urlPath, ".webm"):
			mimeType = "video/webm"
		case strings.HasSuffix(urlPath, ".avi"):
			mimeType = "video/x-msvideo"
		case strings.HasSuffix(urlPath, ".mov"):
			mimeType = "video/quicktime"
		case strings.HasSuffix(urlPath, ".mkv"):
			mimeType = "video/x-matroska"
		case strings.HasSuffix(urlPath, ".m3u8"):
			mimeType = "application/vnd.apple.mpegurl"
		case strings.HasSuffix(urlPath, ".ts"):
			mimeType = "video/mp2t"
		case strings.HasSuffix(urlPath, ".png"):
			mimeType = "image/png"
		case strings.HasSuffix(urlPath, ".jpg"), strings.HasSuffix(urlPath, ".jpeg"):
			mimeType = "image/jpeg"
		case strings.HasSuffix(urlPath, ".gif"):
			mimeType = "image/gif"
		case strings.HasSuffix(urlPath, ".webp"):
			mimeType = "image/webp"
		case strings.HasSuffix(urlPath, ".svg"):
			mimeType = "image/svg+xml"
		}
		c.Header("Content-Type", mimeType)

		f, openErr := os.Open(fullPath)
		if openErr != nil {
			log.Printf("❌ [Static] os.Open failed for %q: %v", fullPath, openErr)
			c.Status(http.StatusNotFound)
			return
		}
		defer f.Close()
		stat, statErr := f.Stat()
		if statErr != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		http.ServeContent(c.Writer, c.Request, urlPath, stat.ModTime(), f)
	})

	// --- --- ---

	// Health check endpoint
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":   "ok",
			"message":  "LetsWatchOut Backend is running!",
			"database": "connected",
		})
	})

	// --- Diagnostics Routes (For performance monitoring) ---
	// Remount tracking endpoint (unauthenticated - for quick diagnostics)
	r.POST("/api/diagnostics/remount-log", func(c *gin.Context) {
		var logData map[string]interface{}
		if err := c.ShouldBindJSON(&logData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid log data"})
			return
		}

		// Log to server console for now (could store in DB later)
		log.Printf("🔍 [FRONTEND REMOUNT] Component: %v | Mount#: %v | TimeSince: %v | Triggers: %v | User: %v | Room: %v | Session: %v",
			logData["component"],
			logData["mountNumber"],
			logData["timeSinceLastMount"],
			logData["triggers"],
			logData["userId"],
			logData["roomId"],
			logData["sessionId"])

		c.JSON(http.StatusOK, gin.H{"status": "logged"})
	})

	// --- Auth Routes ---
	// Public routes (no auth required)
	// ✅ Rate limiting for auth endpoints (5 attempts per minute per IP)
	authLimiter := handlers.NewRateLimiter(5, time.Minute)

	// ✅ P0 Security Fix: Rate limiting for payment endpoints (10 req/min per IP)
	paymentLimiter := middleware.NewRateLimiter(10, time.Minute)
	r.POST("/api/auth/register", authLimiter, handlers.RegisterHandler)
	r.POST("/api/auth/login", authLimiter, handlers.LoginHandler)
	r.POST("/api/auth/logout", handlers.LogoutHandler)
	r.POST("/api/auth/refresh", authLimiter, handlers.RefreshTokenHandler)

	// ✅ 2FA Management Routes (protected - require authentication)
	twoFactorGroup := r.Group("/api/auth")
	twoFactorGroup.Use(handlers.AuthMiddleware())
	{
		twoFactorGroup.POST("/setup-2fa", handlers.Setup2FAHandler)              // Generate QR code
		twoFactorGroup.POST("/verify-2fa-setup", handlers.Verify2FASetupHandler) // Confirm and enable 2FA
		twoFactorGroup.POST("/disable-2fa", handlers.Disable2FAHandler)          // Disable 2FA (requires password + code)
		twoFactorGroup.POST("/change-password", handlers.ChangePasswordHandler)  // Change password
	}

	// Password reset routes (public)
	r.POST("/api/auth/forgot-password", handlers.ForgotPasswordHandler)
	r.POST("/api/auth/reset-password", handlers.ResetPasswordHandler)

	// Google OAuth routes
	r.GET("/api/auth/google/login", handlers.GoogleLoginHandler)
	r.GET("/api/auth/google/callback", handlers.GoogleCallbackHandler)

	// Hymn API proxy (public - CORS bypass for Hymnary.org)
	r.GET("/api/hymns/search", handlers.SearchHymnsProxy) // GET /api/hymns/search?query=amazing+grace
	r.GET("/api/hymns/:id", handlers.GetHymnDetailsProxy) // GET /api/hymns/it_is_well

	// Protected routes (auth required)
	// Apply the AuthMiddleware to the /api/auth/me route
	r.GET("/api/auth/me", handlers.AuthMiddleware(), handlers.GetCurrentUserHandler)

	// Date of birth management endpoints
	r.GET("/api/auth/check-dob", handlers.AuthMiddleware(), handlers.CheckDateOfBirthHandler)
	r.POST("/api/auth/update-dob", handlers.AuthMiddleware(), handlers.UpdateDateOfBirthHandler)

	// --- Invite Routes (Semi-public - requires auth) ---
	inviteGroup := r.Group("/api/invites")
	inviteGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	{
		inviteGroup.POST("/:token/accept", handlers.AcceptInviteByTokenHandler) // POST /api/invites/:token/accept (Accept invite link)
	}

	// --- Room Routes (Protected) ---
	// All room-related endpoints require authentication
	roomGroup := r.Group("/api/rooms")
	roomGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware()) // Apply AuthMiddleware to all routes in this group
	{
		roomGroup.POST("", handlers.CreateRoomHandler)                            // POST /api/rooms (Create a new room)
		roomGroup.GET("", handlers.GetRoomsHandler)                               // GET /api/rooms (Get list of rooms)
		roomGroup.GET("/:id", handlers.GetRoomHandler)                            // GET /api/rooms/:id (Get a specific room)
		roomGroup.GET("/:id/ratings", handlers.GetRoomRatingsHandler)             // GET /api/rooms/:id/ratings (Get room ratings and reviews)
		roomGroup.GET("/:id/livekit-token", handlers.GenerateLiveKitTokenHandler) // ✅ ADD THIS LINE (Generate LiveKit token for a room)
		// --- Media Item Routes (Permanent) ---
		roomGroup.GET("/:id/media", handlers.GetMediaItemsForRoomHandler) // GET /api/rooms/:id/media (Get media items for a room)
		// ✅ Rate limit: 3 file uploads per 10 minutes per user (chunk-aware)
		uploadLimiter := handlers.NewUploadRateLimiter(3, 10*time.Minute)
		roomGroup.POST("/:id/upload", uploadLimiter, handlers.UploadMediaHandler)                  // POST /api/rooms/:id/upload (Upload media to a room)
		roomGroup.POST("/:id/upload/confirm", handlers.ConfirmUploadHandler)                       // POST /api/rooms/:id/upload/confirm (Confirm BunnyCDN direct upload)
		roomGroup.POST("/:id/upload/assemble", handlers.AssembleUploadHandler)                     // POST /api/rooms/:id/upload/assemble (Assemble chunked BunnyCDN upload)
		roomGroup.DELETE("/:id/upload/:upload_id", handlers.AbortUploadHandler)                    // DELETE /api/rooms/:id/upload/:upload_id (Abort in-flight chunked upload - Host only)
		roomGroup.POST("/:id/media/stream", handlers.HandleStreamURL)                              // POST /api/rooms/:id/media/stream (Add stream URL to playlist)
		roomGroup.GET("/:id/temporary-media", handlers.GetTemporaryMediaItemsForRoomHandler)       // GET /api/rooms/:id/temporary-media (Get list of temporary media items)
		roomGroup.DELETE("/:id/temporary-media", handlers.DeleteTemporaryMediaItemsForRoomHandler) // DELETE /api/rooms/:id/temporary-media (Delete all temporary media items - Host only)
		roomGroup.POST("/:id/game-assets", handlers.UploadGameAssetHandler)                       // POST /api/rooms/:id/game-assets (Upload VS Battle character images/GIFs during building phase)
		// --- Instant Watch (Temporary Rooms) ---
		roomGroup.POST("/instant-watch", handlers.CreateInstantWatchHandler) // POST /api/rooms/instant-watch (Create an instant watch temporary room)
		roomGroup.GET("/:id/members", handlers.GetRoomMembersHandler)
		roomGroup.PUT("/:id/users/:user_id/role", handlers.SetUserRoleHandler)
		roomGroup.GET("/:id/users/:user_id/role", handlers.GetUserRoleHandler)
		roomGroup.POST("/:id/join", handlers.JoinRoomHandler)
		roomGroup.POST("/:id/leave", handlers.LeaveRoomHandler)
		roomGroup.DELETE("/:id/members/:user_id", handlers.KickMemberHandler)  // DELETE /api/rooms/:id/members/:user_id
		roomGroup.POST("/:id/members/:user_id/ban", handlers.BanMemberHandler) // POST /api/rooms/:id/members/:user_id/ban
		roomGroup.POST("/:id/invite-user", handlers.InviteUserToRoomHandler)   // POST /api/rooms/:id/invite-user
		roomGroup.POST("/:id/favourite", handlers.ToggleRoomFavouriteHandler)  // POST /api/rooms/:id/favourite (Toggle room favourite)
		roomGroup.GET("/favourites", handlers.GetFavouriteRoomsHandler)        // GET /api/rooms/favourites (List user's favourite rooms)
		roomGroup.GET("/leaderboard", handlers.GetRoomsLeaderboardHandler)     // GET /api/rooms/leaderboard (Top 10 rooms by Bayesian rating)
		roomGroup.DELETE("/:id", handlers.DeleteRoomHandler)
		roomGroup.PUT("/:id", handlers.UpdateRoomHandler)
		roomGroup.PUT("/:id/image", handlers.UpdateRoomImageHandler)    // PUT /api/rooms/:id/image (Upload room image)
		roomGroup.DELETE("/:id/image", handlers.DeleteRoomImageHandler) // DELETE /api/rooms/:id/image (Delete room image)
		roomGroup.PUT("/:id/media/order", handlers.UpdateMediaOrderHandler)
		roomGroup.PUT("/:id/loop-mode", handlers.UpdateRoomLoopModeHandler)
		roomGroup.POST("/:id/scheduled-events", handlers.CreateScheduledEventHandler)
		roomGroup.GET("/:id/scheduled-events", handlers.GetScheduledEventsHandler)
		roomGroup.POST("/:id/chat", handlers.CreateChatMessageHandler)
		roomGroup.GET("/:id/chat/history", handlers.GetChatHistoryHandler)
		roomGroup.DELETE("/:id/chat/:message_id", handlers.DeleteChatMessageHandler)
		roomGroup.PUT("/:id/chat/:message_id", handlers.UpdateChatMessageHandler)

		// --- Room-level persistent chat (new) ---
		roomGroup.GET("/:id/messages", handlers.GetRoomMessages)                             // GET /api/rooms/:id/messages (Get all room messages)
		roomGroup.POST("/:id/messages", handlers.CreateRoomMessage)                          // POST /api/rooms/:id/messages (Send room message)
		roomGroup.POST("/:id/system-message", handlers.CreateRoomSystemMessage)               // POST /api/rooms/:id/system-message (Post system message, e.g. game result)
		roomGroup.DELETE("/:id/messages/:message_id", handlers.DeleteRoomMessage)            // DELETE /api/rooms/:id/messages/:message_id (Delete room message)
		roomGroup.PUT("/:id/messages/:message_id", handlers.EditRoomMessage)                 // PUT /api/rooms/:id/messages/:message_id (Edit room message)
		roomGroup.POST("/:id/messages/voice-note", handlers.UploadVoiceNote)                 // POST /api/rooms/:id/messages/voice-note (Upload voice note)
		roomGroup.POST("/:id/rhythm-hero-audio", handlers.UploadRhythmHeroAudioHandler)      // POST /api/rooms/:id/rhythm-hero-audio (Upload Rhythm Hero "Upload Your Own" song to BunnyCDN)
		roomGroup.POST("/:id/messages/attachment", handlers.UploadRoomChatAttachmentHandler) // POST /api/rooms/:id/messages/attachment (Upload image/doc to BunnyCDN)
		roomGroup.POST("/:id/messages/poll", handlers.CreatePoll)                            // POST /api/rooms/:id/messages/poll (Create poll)
		roomGroup.POST("/:id/messages/sticker", handlers.SendRoomChatStickerHandler)         // POST /api/rooms/:id/messages/sticker (Send Tenor/Giphy GIF)

		// --- Poll routes ---
		roomGroup.POST("/:id/polls/:pollId/vote", handlers.VotePoll)     // POST /api/rooms/:id/polls/:pollId/vote (Vote on poll)
		roomGroup.DELETE("/:id/polls/:pollId/vote", handlers.RemoveVote) // DELETE /api/rooms/:id/polls/:pollId/vote (Remove vote)

		// --- Room Groups routes (Discord-style channels for chat segmentation) ---
		roomGroup.POST("/:id/groups", handlers.CreateRoomGroupHandler)                     // POST /api/rooms/:id/groups (Create group - host only)
		roomGroup.GET("/:id/groups", handlers.GetRoomGroupsHandler)                        // GET /api/rooms/:id/groups (List all groups)
		roomGroup.PUT("/:id/groups/:groupId", handlers.UpdateRoomGroupHandler)             // PUT /api/rooms/:id/groups/:groupId (Update group - host only)
		roomGroup.DELETE("/:id/groups/:groupId", handlers.DeleteRoomGroupHandler)          // DELETE /api/rooms/:id/groups/:groupId (Delete group - host only)
		roomGroup.POST("/:id/groups/:groupId/join", handlers.JoinRoomGroupHandler)         // POST /api/rooms/:id/groups/:groupId/join (Join group)
		roomGroup.POST("/:id/groups/:groupId/leave", handlers.LeaveRoomGroupHandler)       // POST /api/rooms/:id/groups/:groupId/leave (Leave group)
		roomGroup.GET("/:id/groups/:groupId/members", handlers.GetRoomGroupMembersHandler) // GET /api/rooms/:id/groups/:groupId/members (List group members)

		// --- RoomTV content routes (new) ---
		roomGroup.GET("/:id/tv-content", handlers.GetRoomTVContent)                             // GET /api/rooms/:id/tv-content (Get active TV content)
		roomGroup.POST("/:id/tv-content", handlers.CreateRoomTVContent)                         // POST /api/rooms/:id/tv-content (Host creates content - URL/announcement)
		roomGroup.POST("/:id/tv-content/upload", handlers.UploadTVMedia)                        // POST /api/rooms/:id/tv-content/upload (Host uploads video file)
		roomGroup.POST("/:id/tv-content/:content_id/complete", handlers.MarkTVContentCompleted) // DEPRECATED: Cron cleanup handles this now
		roomGroup.DELETE("/:id/tv-content/:content_id", handlers.DeleteRoomTVContent)           // DELETE /api/rooms/:id/tv-content/:content_id (Host dismisses content)

		// --- Room invitation routes (for private rooms) ---
		roomGroup.POST("/:id/invites/link", handlers.CreateRoomInviteLinkHandler)     // POST /api/rooms/:id/invites/link (Create invite link)
		roomGroup.GET("/:id/invites", handlers.GetRoomInvitesHandler)                 // GET /api/rooms/:id/invites (List invites)
		roomGroup.DELETE("/:id/invites/:invite_id", handlers.RevokeRoomInviteHandler) // DELETE /api/rooms/:id/invites/:invite_id (Revoke invite)
		roomGroup.GET("/:id/check-access", handlers.CheckUserRoomAccessHandler)       // GET /api/rooms/:id/check-access (Check user access)

		// --- Session management routes (new) ---
		roomGroup.POST("/:id/sessions", handlers.CreateWatchSession)                     // POST /api/rooms/:id/sessions (Create new watch session)
		roomGroup.POST("/:id/sessions/:session_id/end", handlers.EndWatchSessionHandler) // POST /api/rooms/:id/sessions/:session_id/end (End watch session)

		// ⚠️ DEPRECATED (April 2026): Legacy session creation endpoint - DO NOT USE
		// Replaced by POST /api/rooms/:id/sessions (CreateWatchSession handler)
		// Only used by old RoomPage.jsx which is no longer in routing table
		// TODO: Remove after confirming no external API consumers
		// roomGroup.POST("/:id/watch-session", handlers.CreateWatchSessionForRoomHandler)

		roomGroup.POST("/:id/sessions/:session_id/join-attempt", handlers.LogSessionJoinAttemptHandler) // POST /api/rooms/:id/sessions/:session_id/join-attempt (log join attempt before WS connects)
		roomGroup.GET("/:id/sessions/:session_id/join-stats", handlers.GetSessionJoinStatsHandler)      // GET /api/rooms/:id/sessions/:session_id/join-stats (attempted vs confirmed comparison)
		roomGroup.GET("/:id/active-session", handlers.GetActiveSessionHandler)
		roomGroup.POST("/:id/session/heartbeat", handlers.SessionHeartbeatHandler)
		roomGroup.PUT("/:id/status", handlers.UpdateRoomStatusHandler)
		roomGroup.DELETE("/:id/temporary-media/:item_id", handlers.DeleteSingleTemporaryMediaItemHandler)
		roomGroup.GET("/with-active-sessions", handlers.GetRoomsWithActiveSessionsHandler) // GET /api/rooms/with-active-sessions

		// --- WebSocket Route (Protected) ---
		// This endpoint upgrades HTTP to WebSocket for real-time communication.
		// It requires authentication.
		// The route parameter is :room_id to distinguish it from other room routes.
		roomGroup.GET("/:id/ws", handlers.WebSocketHandler) // GET /api/rooms/:id/ws (WebSocket connection)
		// This creates the route: GET /api/rooms/ws/:room_id
		// Which resolves to: ws://localhost:8080/api/rooms/ws/2 (for room ID 2)
		// --- --- ---
	}

	// --- THEATER & BROADCAST ROUTES (Protected) ---
	sessionGroup := r.Group("/api/sessions")
	sessionGroup.Use(handlers.AuthMiddleware())
	{
		// Get all active sessions for lobby
		sessionGroup.GET("/active", handlers.GetAllActiveSessionsHandler) // GET /api/sessions/active

		// ✅ NEW: Get LiveShare state for a specific session
		sessionGroup.GET("/:id/liveshare-state", handlers.GetLiveShareStateHandler) // GET /api/sessions/:id/liveshare-state

		// ✅ Podcast logo upload
		sessionGroup.POST("/:id/podcast-logo", handlers.UploadPodcastLogoHandler) // POST /api/sessions/:id/podcast-logo

		// ✅ NEW: Get temporary media items for a specific session
		sessionGroup.GET("/:id/temporary-media", handlers.GetTemporaryMediaItemsForSessionHandler) // GET /api/sessions/:id/temporary-media

		// ✅ NEW: Session preview generation
		sessionGroup.POST("/:id/generate-preview", handlers.GenerateSessionPreviewHandler)   // POST /api/sessions/:id/generate-preview
		sessionGroup.POST("/:id/upload-frames", handlers.UploadSessionFramesHandler)         // POST /api/sessions/:id/upload-frames
		sessionGroup.POST("/:id/request-frame-capture", handlers.RequestFrameCaptureHandler) // POST /api/sessions/:id/request-frame-capture

		// ✅ Session ratings
		sessionGroup.POST("/:id/ratings", handlers.SubmitSessionRatingHandler) // POST /api/sessions/:id/ratings (Submit rating after session)

		// ✅ Session engagement (likes)
		sessionGroup.POST("/:id/like", handlers.LikeSessionHandler)                // POST /api/sessions/:id/like (Like a session)
		sessionGroup.DELETE("/:id/unlike", handlers.UnlikeSessionHandler)          // DELETE /api/sessions/:id/unlike (Unlike a session)
		sessionGroup.GET("/:id/like-status", handlers.GetSessionLikeStatusHandler) // GET /api/sessions/:id/like-status (Get like status and count)

		// ✅ LiveShare Graphics routes
		sessionGroup.POST("/:id/logo-bug", handlers.UploadLogoBug)                 // POST /api/sessions/:id/logo-bug (Upload logo bug)
		sessionGroup.POST("/:id/media-queue", handlers.UploadMediaQueue)           // POST /api/sessions/:id/media-queue (Upload media to queue)
		sessionGroup.POST("/:id/graphics", handlers.UpdateGraphics)                // POST /api/sessions/:id/graphics (Update graphics state)
		sessionGroup.GET("/:id/graphics", handlers.GetGraphics)                    // GET /api/sessions/:id/graphics (Get all graphics)
		sessionGroup.DELETE("/:id/graphics", handlers.DeleteAllGraphics)           // DELETE /api/sessions/:id/graphics (Delete all graphics when LiveShare ends)
		sessionGroup.POST("/:id/bible-verse", handlers.SaveBibleVerse)             // POST /api/sessions/:id/bible-verse (Save current Bible verse for church mode)
		sessionGroup.DELETE("/:id/bible-verse", handlers.ClearBibleVerse)          // DELETE /api/sessions/:id/bible-verse (Clear Bible verse)
		sessionGroup.GET("/:id/media-queue", handlers.GetMediaQueue)               // GET /api/sessions/:id/media-queue (Get media queue)
		sessionGroup.DELETE("/media-queue/:itemId", handlers.DeleteMediaQueueItem) // DELETE /api/sessions/media-queue/:itemId (Delete queue item)

		// Theater management
		sessionGroup.GET("/:id/theaters", handlers.GetSessionTheaters) // GET /api/sessions/:id/theaters

		// Broadcast permissions
		sessionGroup.POST("/:id/broadcast/request", handlers.RequestBroadcast)            // POST /api/sessions/:id/broadcast/request
		sessionGroup.POST("/:id/broadcast/grant", handlers.GrantBroadcast)                // POST /api/sessions/:id/broadcast/grant
		sessionGroup.POST("/:id/broadcast/revoke", handlers.RevokeBroadcast)              // POST /api/sessions/:id/broadcast/revoke
		sessionGroup.GET("/:id/broadcast/active", handlers.GetActiveBroadcasters)         // GET /api/sessions/:id/broadcast/active
		sessionGroup.GET("/:id/broadcast/requests", handlers.GetPendingBroadcastRequests) // GET /api/sessions/:id/broadcast/requests
	}

	// ✅ Public session engagement routes (no auth required for reading counts)
	sessionPublic := r.Group("/api/sessions")
	{
		sessionPublic.GET("/:id/likes-count", handlers.GetSessionLikesCountHandler)                   // GET /api/sessions/:id/likes-count (Get likes count)
		sessionPublic.GET("/:id/is-liked", handlers.AuthMiddleware(), handlers.IsSessionLikedHandler) // GET /api/sessions/:id/is-liked (Check if user liked - requires auth)
		sessionPublic.GET("/:id/chat-preview", handlers.GetSessionChatPreviewHandler)                 // GET /api/sessions/:id/chat-preview (Get last 10 messages)
		sessionPublic.GET("/:id/chat-count", handlers.GetSessionChatCountHandler)                     // GET /api/sessions/:id/chat-count (Get total chat messages)
	}

	// --- PUBLIC (no-auth) routes for the /explore browse page ---
	r.GET("/api/public/live-sessions", handlers.GetPublicLiveSessionsHandler)
	r.GET("/api/public/rooms", handlers.GetRoomsHandler)                                                  // Guest room browsing — returns only public rooms
	r.GET("/api/public/rooms/by-handle/:handle", handlers.GetRoomByHandleHandler)                         // Share-link resolution (/r/:handle) — works logged-out
	r.GET("/api/community-events", handlers.OptionalAuthMiddleware(), handlers.GetCommunityEventsHandler) // Guest-accessible; user_id injected if token present

	// --- GUEST VIEW ROUTES (no auth — public sessions only) ---
	guestGroup := r.Group("/api/guest")
	{
		guestGroup.GET("/sessions/:id", handlers.GetGuestSessionViewHandler)      // GET /api/guest/sessions/:id
		guestGroup.GET("/sessions/:id/chat", handlers.GetGuestSessionChatHandler) // GET /api/guest/sessions/:id/chat
	}

	// --- POSTS & USER-GENERATED CONTENT ROUTES (Phase 1: Post & Recording Feature) ---
	// Public routes (discover feed, view single post, read comments)
	postsPublic := r.Group("/api/posts")
	{
		postsPublic.GET("", handlers.GetDiscoverFeed)              // GET /api/posts (Discover feed - randomized public posts)
		postsPublic.GET("/:id", handlers.GetPost)                  // GET /api/posts/:id (Get single post)
		postsPublic.POST("/:id/view", handlers.TrackPostView)      // POST /api/posts/:id/view (Track view - no auth required)
		postsPublic.GET("/:id/comments", handlers.GetPostComments) // GET /api/posts/:id/comments (Get comments)
		postsPublic.GET("/:id/download", handlers.DownloadPost)    // GET /api/posts/:id/download (Download post video)
	}

	// Protected routes (create, update, delete, like, comment)
	postsProtected := r.Group("/api/posts")
	postsProtected.Use(handlers.AuthMiddleware())
	{
		postsProtected.POST("", handlers.CreatePost)                                        // POST /api/posts (Create post)
		postsProtected.POST("/:id/upload", handlers.UploadPostMedia)                        // POST /api/posts/:id/upload (Upload media to BunnyCDN)
		postsProtected.PUT("/:id", handlers.UpdatePost)                                     // PUT /api/posts/:id (Update post - owner only)
		postsProtected.DELETE("/:id", handlers.DeletePost)                                  // DELETE /api/posts/:id (Delete post - owner only)
		postsProtected.POST("/:id/like", handlers.LikePost)                                 // POST /api/posts/:id/like (Like post)
		postsProtected.DELETE("/:id/unlike", handlers.UnlikePost)                           // DELETE /api/posts/:id/unlike (Unlike post)
		postsProtected.POST("/:id/comments", handlers.CreatePostComment)                    // POST /api/posts/:id/comments (Add comment)
		postsProtected.PUT("/:id/comments/:commentId", handlers.UpdatePostComment)          // PUT /api/posts/:id/comments/:commentId (Edit comment)
		postsProtected.DELETE("/comments/:id", handlers.DeletePostComment)                  // DELETE /api/posts/comments/:id (Delete comment)
		postsProtected.POST("/:id/purchase", handlers.PurchasePost)                         // POST /api/posts/:id/purchase (Buy paid post with tokens, 75/25 split)
		postsProtected.POST("/:id/tip", handlers.TipPost)                                   // POST /api/posts/:id/tip (Tip post, 1 token)
		postsProtected.POST("/comment-attachment", handlers.UploadCommentAttachmentHandler) // POST /api/posts/comment-attachment (Upload image/DOCX for comment)
	}

	// Following feed (protected — needs auth to know which rooms user joined)
	postsProtected.GET("/following", handlers.GetFollowingFeedHandler) // GET /api/posts/following

	// User posts routes (public)
	r.GET("/api/users/:id/posts", handlers.GetUserPosts) // GET /api/users/:id/posts (Get user's posts)

	// Room posts routes (public)
	r.GET("/api/rooms/:id/posts", handlers.GetRoomPosts) // GET /api/rooms/:id/posts (Get posts created in room context)

	// --- USER STATUSES / STORIES ---
	statusGroup := r.Group("/api/statuses")
	statusGroup.Use(handlers.AuthMiddleware())
	{
		statusGroup.POST("", handlers.CreateStatusHandler)               // POST /api/statuses
		statusGroup.GET("/feed", handlers.GetStatusFeedHandler)          // GET /api/statuses/feed
		statusGroup.DELETE("/:id", handlers.DeleteStatusHandler)         // DELETE /api/statuses/:id
		statusGroup.POST("/:id/view", handlers.MarkStatusViewedHandler)  // POST /api/statuses/:id/view
		statusGroup.POST("/:id/like", handlers.LikeStatusHandler)        // POST /api/statuses/:id/like (toggle)
		statusGroup.GET("/privacy", handlers.GetStatusPrivacyHandler)    // GET /api/statuses/privacy
		statusGroup.PUT("/privacy", handlers.UpdateStatusPrivacyHandler) // PUT /api/statuses/privacy
	}

	// Room visit tracking + unread badge (protected)
	roomVisitGroup := r.Group("/api/rooms")
	roomVisitGroup.Use(handlers.AuthMiddleware())
	{
		roomVisitGroup.POST("/:id/visited", handlers.MarkRoomVisitedHandler)        // POST /api/rooms/:id/visited
		roomVisitGroup.GET("/:id/unread-posts", handlers.GetRoomUnreadPostsHandler) // GET /api/rooms/:id/unread-posts
	}

	// --- NOTIFICATIONS ROUTES (Protected) ---
	notifGroup := r.Group("/api/notifications")
	notifGroup.Use(handlers.AuthMiddleware())
	{
		notifGroup.GET("", handlers.GetMyNotificationsHandler)                  // GET /api/notifications
		notifGroup.PATCH("/read-all", handlers.MarkAllNotificationsReadHandler) // PATCH /api/notifications/read-all
		notifGroup.PATCH("/:id/read", handlers.MarkNotificationReadHandler)     // PATCH /api/notifications/:id/read
		notifGroup.DELETE("", handlers.ClearAllNotificationsHandler)            // DELETE /api/notifications
	}

	theaterGroup := r.Group("/api/theaters")
	theaterGroup.Use(handlers.AuthMiddleware())
	{
		theaterGroup.PUT("/:id/name", handlers.RenameTheater)            // PUT /api/theaters/:id/name
		theaterGroup.GET("/:id/occupancy", handlers.GetTheaterOccupancy) // GET /api/theaters/:id/occupancy
	}

	// --- LOBBY WEBSOCKET & SCHEDULED EVENTS ROUTES (Protected) ---
	protected := r.Group("/api")
	protected.Use(handlers.AuthMiddleware())
	{
		// Lobby WebSocket for real-time updates
		protected.GET("/lobby/ws", handlers.LobbyWebSocketHandler) // GET /api/lobby/ws

		// Scheduled events management
		protected.PUT("/scheduled-events/:id", handlers.UpdateScheduledEventHandler)
		protected.DELETE("/scheduled-events/:id", handlers.DeleteScheduledEventHandler)
		protected.PATCH("/scheduled-events/:id/early-bird", handlers.ToggleEarlyBirdHandler) // Toggle early bird pricing
		protected.GET("/scheduled-events/:id/ical", handlers.DownloadICalHandler)
		protected.GET("/scheduled-events/with-trailers", handlers.GetScheduledEventsWithTrailersHandler)         // ✅ Get events with trailers (paginated)
		protected.POST("/scheduled-events/upload-trailer", handlers.UploadTrailerHandler)                        // ✅ Upload trailer video for event
		protected.POST("/stickers/upload", handlers.UploadCustomStickerHandler)                                  // POST /api/stickers/upload (Upload custom sticker image)
		protected.GET("/stickers/packs", handlers.GetUserStickerPacksHandler)                                    // GET  /api/stickers/packs
		protected.POST("/stickers/packs", handlers.CreateStickerPackHandler)                                     // POST /api/stickers/packs
		protected.POST("/stickers/packs/:pack_id/stickers", handlers.AddStickerToPackHandler)                    // POST /api/stickers/packs/:pack_id/stickers
		protected.DELETE("/stickers/packs/:pack_id/stickers/:sticker_id", handlers.RemoveStickerFromPackHandler) // DELETE /api/stickers/packs/:pack_id/stickers/:sticker_id
		protected.POST("/stickers/packs/:pack_id/publish", handlers.PublishStickerPackHandler)                   // POST /api/stickers/packs/:pack_id/publish
		protected.POST("/stickers/packs/:pack_id/add", handlers.AddCommunityPackHandler)                         // POST /api/stickers/packs/:pack_id/add
		protected.GET("/stickers/community", handlers.GetCommunityPacksHandler)                                  // GET  /api/stickers/community
		protected.POST("/stickers/import/telegram", handlers.ImportTelegramPackHandler)                          // POST /api/stickers/import/telegram
		protected.POST("/upload/custom-background", handlers.UploadCustomBackgroundHandler)                      // POST /api/upload/custom-background (Custom watch type background image)
		protected.GET("/user/calendar", handlers.GetUserCalendarHandler)                                         // GET /api/user/calendar?month=2026-05
		protected.GET("/user/upcoming-events", handlers.GetUserUpcomingEventsHandler)                            // GET /api/user/upcoming-events (next 30 days)

		// ✅ RSVP & Ticketing routes
		protected.POST("/scheduled-events/:id/rsvp", handlers.CreateFreeRSVPHandler)                 // POST /api/scheduled-events/:id/rsvp (RSVP to free event)
		protected.DELETE("/scheduled-events/:id/rsvp", handlers.CancelRSVPHandler)                   // DELETE /api/scheduled-events/:id/rsvp (Cancel RSVP)
		protected.POST("/scheduled-events/:id/purchase-ticket", handlers.PurchaseEventTicketHandler) // POST /api/scheduled-events/:id/purchase-ticket (Buy ticket)
		protected.GET("/users/me/event-tickets", handlers.GetUserEventTicketsHandler)                // GET /api/users/me/event-tickets (Get user's tickets & RSVPs)

		// --- USER PROFILE ROUTES ---
		protected.GET("/users/search", handlers.SearchUsersHandler)                      // GET /api/users/search?q=... (must be static, before /:id)
		protected.GET("/users/:id", handlers.GetUserProfileHandler)                      // GET /api/users/:id (Get user profile with privacy)
		protected.PUT("/users/profile", handlers.UpdateProfileHandler)                   // Update current user's profile
		protected.PATCH("/users/privacy", handlers.UpdateFollowingPrivacyHandler)        // PATCH /api/users/privacy (Toggle following list visibility)
		protected.GET("/users/:id/following-count", handlers.GetFollowingCountHandler)   // GET /api/users/:id/following-count
		protected.GET("/users/:id/following", handlers.GetFollowingListHandler)          // GET /api/users/:id/following (privacy-gated list)
		protected.GET("/users/by-username/:username", handlers.GetUserByUsernameHandler) // GET /api/users/by-username/:username (Lookup user for gifting)

		// --- NDPR / Data Rights Routes ---
		protected.GET("/users/me/data-export", handlers.DataExportHandler(DB))   // GET /api/users/me/data-export (NDPR right of access)
		protected.DELETE("/users/me/account", handlers.DeleteAccountHandler(DB)) // DELETE /api/users/me/account (NDPR right to erasure)

		// --- COMMUNITY EVENTS ROUTES ---
		// GET is public (handled separately below); POST routes require auth
		protected.GET("/games/vs-battle/leaderboard", games.GetVsBattleLeaderboardHandler(DB)) // GET /api/games/vs-battle/leaderboard
		protected.POST("/community-requests", handlers.CreateCommunityRequestHandler)                   // POST /api/community-requests
		protected.POST("/community-requests/upload-image", handlers.UploadCommunityRequestImageHandler) // POST /api/community-requests/upload-image
		protected.POST("/community-requests/:id/upvote", handlers.ToggleCommunityRequestUpvoteHandler)  // POST /api/community-requests/:id/upvote
		protected.POST("/community-requests/:id/claim", handlers.ClaimCommunityRequestHandler)          // POST /api/community-requests/:id/claim

		// --- ADMIN: DEMO MEDIA ROUTES (super_admin only) ---
		protected.GET("/admin/demo-media/library", handlers.GetDemoMediaLibraryHandler)          // List all demo media items
		protected.POST("/admin/demo-media/transcode", handlers.TranscodeDemoMediaHandler)        // Transcode .rmvb/.avi/.mkv → .mp4
		protected.POST("/admin/demo-media/extract-posters", handlers.ExtractDemoPostersHandler)  // Extract thumbnail poster from each video
		protected.POST("/admin/demo-media/apply-faststart", handlers.ApplyFastStartHandler)     // Re-mux MP4s with +faststart (mobile load speed)
		protected.POST("/admin/cleanup-orphaned-chunks", handlers.CleanupOrphanedChunksHandler) // Delete historical chunk dirs left in temp-media/

		// --- SUPPORT ROUTES ---
		protected.POST("/support/send", handlers.SendSupportEmail) // POST /api/support/send (Send help/support email)

		// --- PAYMENT & WALLET ROUTES ---
		// Wallet management
		protected.GET("/wallet/:userId", handlers.GetUserWalletHandler(DB))                      // GET /api/wallet/:userId (Get user's wallet balance)
		protected.GET("/wallet/:userId/transactions", handlers.GetWalletTransactionsHandler(DB)) // GET /api/wallet/:userId/transactions (Get transaction history)

		// Token purchases (per-user: 10/hr)
		protected.POST("/tokens/purchase", middleware.RateLimitTokenPurchases(), handlers.PurchaseTokensHandler(DB)) // POST /api/tokens/purchase (Buy tokens)

		// Earnings & analytics
		protected.GET("/earnings/:userId", handlers.GetUserEarningsHandler(DB)) // GET /api/earnings/:userId (Host earnings dashboard)
	}

	// --- SESSION PAYMENT ROUTES (Protected) ---
	// These routes are nested under sessions for ticket purchases and donations
	// ✅ P0 Security Fix: Apply rate limiting to prevent spam
	paymentGroup := r.Group("/api/sessions")
	paymentGroup.Use(handlers.AuthMiddleware())
	paymentGroup.Use(paymentLimiter.Middleware()) // 10 req/min
	{
		// Ticket management
		paymentGroup.POST("/:id/tickets/purchase", handlers.PurchaseSessionTicketHandler(DB)) // POST /api/sessions/:id/tickets/purchase
		paymentGroup.GET("/:id/tickets", handlers.GetSessionTicketsHandler(DB))               // GET /api/sessions/:id/tickets (Host only)
		paymentGroup.GET("/:id/tickets/me", handlers.GetUserTicketHandler(DB))                // GET /api/sessions/:id/tickets/me (Check own ticket)

		// Donations
		paymentGroup.POST("/:id/donate", handlers.DonateToSessionHandler(DB))        // POST /api/sessions/:id/donate
		paymentGroup.GET("/:id/donations", handlers.GetSessionDonationsHandler(DB))  // GET /api/sessions/:id/donations
		paymentGroup.GET("/:id/top-donors", handlers.GetSessionTopDonorsHandler(DB)) // GET /api/sessions/:id/top-donors
		paymentGroup.POST("/:id/invite", handlers.InviteToSessionHandler)            // POST /api/sessions/:id/invite
	}

	// --- DONATION ROUTES (Protected) - Wallet-to-Wallet Gifts ---
	// ✅ P0 Security Fix: Apply rate limiting
	donationsGroup := r.Group("/api/donations")
	donationsGroup.Use(handlers.AuthMiddleware())
	donationsGroup.Use(paymentLimiter.Middleware()) // 10 req/min
	{
		donationsGroup.POST("/gift", handlers.GiftTokensHandler(DB))        // POST /api/donations/gift (Gift tokens to any room member)
		donationsGroup.GET("/top-donors", handlers.GetTopDonorsHandler(DB)) // GET /api/donations/top-donors (Global leaderboard)
	}

	// --- PAYOUT ROUTES (Protected) ---
	// ✅ P0 Security Fix: Stricter rate limiting for payouts (3 per hour)
	payoutLimiter := middleware.NewRateLimiter(3, time.Hour)
	payoutGroup := r.Group("/api/payouts")
	payoutGroup.Use(handlers.AuthMiddleware())
	{
		payoutGroup.POST("/request", payoutLimiter.Middleware(), handlers.RequestPayoutHandler(DB)) // POST /api/payouts/request (3/hr limit)
		payoutGroup.GET("/:userId", handlers.GetUserPayoutsHandler(DB))                             // GET /api/payouts/:userId (Get payout history)
		payoutGroup.GET("/details/:id", handlers.GetPayoutDetailsHandler(DB))                       // GET /api/payouts/details/:id (Get payout details)
		payoutGroup.POST("/:id/cancel", handlers.CancelPayoutHandler(DB))                           // POST /api/payouts/:id/cancel (Cancel pending payout)
	}

	// --- PAYMENT ACCOUNT ROUTES (Protected) - Phase 3 ---
	paymentAccountGroup := r.Group("/api/payment-accounts")
	paymentAccountGroup.Use(handlers.AuthMiddleware())
	paymentAccountGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		paymentAccountGroup.GET("", handlers.GetPaymentAccounts) // GET /api/payment-accounts (List all accounts)

		// Paystack routes
		paymentAccountGroup.GET("/paystack/banks/:country", handlers.GetPaystackBanks) // GET /api/payment-accounts/paystack/banks/:country (List banks)
		paymentAccountGroup.POST("/paystack", handlers.AddPaystackBankAccount)         // POST /api/payment-accounts/paystack (Add Paystack account)

		// Stripe Connect routes
		paymentAccountGroup.POST("/stripe/connect", handlers.CreateStripeConnectAccount)                  // POST /api/payment-accounts/stripe/connect (Create Stripe account)
		paymentAccountGroup.GET("/stripe/:accountId/status", handlers.GetStripeAccountStatus)             // GET /api/payment-accounts/stripe/:accountId/status (Check status)
		paymentAccountGroup.POST("/stripe/:accountId/refresh-link", handlers.RefreshStripeOnboardingLink) // POST /api/payment-accounts/stripe/:accountId/refresh-link (Refresh onboarding)

		// General account management
		paymentAccountGroup.PUT("/:id/primary", handlers.SetPrimaryPaymentAccount) // PUT /api/payment-accounts/:id/primary (Set as primary)
		paymentAccountGroup.DELETE("/:id", handlers.DeletePaymentAccount)          // DELETE /api/payment-accounts/:id (Delete account)
	}

	// --- WALLET ROUTES (Protected) - Phase 2 Tokenization ---
	walletGroup := r.Group("/api/wallets")
	walletGroup.Use(handlers.AuthMiddleware())
	walletGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		walletGroup.GET("/me", handlers.GetMyWallet)                                                        // GET /api/wallets/me (Get user's wallet)
		walletGroup.POST("/purchase-tokens", middleware.RateLimitTokenPurchases(), handlers.PurchaseTokens) // POST /api/wallets/purchase-tokens (Purchase tokens, 10/hr per user)
	}

	// --- TOKEN TRANSACTION ROUTES (Protected) - Phase 2 ---
	transactionGroup := r.Group("/api/token-transactions")
	transactionGroup.Use(handlers.AuthMiddleware())
	transactionGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		transactionGroup.GET("/me", handlers.GetMyTransactions) // GET /api/token-transactions/me (Get transaction history)
	}

	// --- WITHDRAWAL ROUTES (Protected) - Phase 3 Week 2 ---
	withdrawalGroup := r.Group("/api/withdrawals")
	withdrawalGroup.Use(handlers.AuthMiddleware())
	withdrawalGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	// 🔒 P0 SECURITY FIX: Rate limit withdrawals to prevent spam/abuse (5 per hour)
	withdrawalGroup.Use(middleware.RateLimitWithdrawals())
	{
		withdrawalGroup.POST("/request", handlers.RequestWithdrawal) // POST /api/withdrawals/request (Request withdrawal)
	}

	// --- GATEWAY EARNINGS ROUTES (Protected) - Revenue Tracking ---
	earningsGroup := r.Group("/api/gateway-earnings")
	earningsGroup.Use(handlers.AuthMiddleware())
	earningsGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		earningsGroup.GET("/me", handlers.GetMyGatewayEarnings) // GET /api/gateway-earnings/me (Get user earnings from tickets/donations)
	}

	// --- PAYOUT CONVENIENCE ROUTES (Protected) ---
	payoutMeGroup := r.Group("/api/payouts")
	payoutMeGroup.Use(handlers.AuthMiddleware())
	payoutMeGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		payoutMeGroup.GET("/me", handlers.GetMyPayouts) // GET /api/payouts/me (Get current user's payout history)
	}
	// --- PAYMENT EXPORT ROUTES (Protected) ---
	paymentExportGroup := r.Group("/api/payments")
	paymentExportGroup.Use(handlers.AuthMiddleware())
	paymentExportGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		paymentExportGroup.GET("/export", handlers.ExportPaymentHistory) // GET /api/payments/export (Export payment history CSV)
	}

	// --- KYC ROUTES (Protected) ---
	kycGroup := r.Group("/api/kyc")
	kycGroup.Use(handlers.AuthMiddleware())
	{
		kycGroup.POST("/submit", handlers.SubmitKYCHandler(DB))  // POST /api/kyc/submit (Submit KYC documents)
		kycGroup.PUT("/:kycId", handlers.UpdateKYCHandler(DB))   // PUT /api/kyc/:kycId (Update KYC full_name)
		kycGroup.GET("/:userId", handlers.GetUserKYCHandler(DB)) // GET /api/kyc/:userId (Get KYC status)
	}

	// --- ADMIN KYC ROUTES (Protected + Admin Only) ---
	adminGroup := r.Group("/api/admin")
	adminGroup.Use(handlers.AuthMiddleware())
	adminGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	adminGroup.Use(handlers.RequireAdmin()) // Admin role required
	{
		adminGroup.GET("/kyc", handlers.GetKYCsHandler(DB))                 // GET /api/admin/kyc?status=all|pending|approved|rejected (Get KYC submissions by status)
		adminGroup.GET("/kyc/pending", handlers.GetPendingKYCsHandler(DB))  // GET /api/admin/kyc/pending (Get all pending KYC submissions)
		adminGroup.POST("/kyc/:id/approve", handlers.ApproveKYCHandler(DB)) // POST /api/admin/kyc/:id/approve (Approve KYC)
		adminGroup.POST("/kyc/:id/reject", handlers.RejectKYCHandler(DB))   // POST /api/admin/kyc/:id/reject (Reject KYC)

		// Platform accounting (Phase 4+)
		adminGroup.GET("/accounting", handlers.GetPlatformAccountingHandler(DB))        // GET /api/admin/accounting (Platform accounting summary)
		adminGroup.GET("/accounting/history", handlers.GetAccountingHistoryHandler(DB)) // GET /api/admin/accounting/history (Transaction history)
		adminGroup.GET("/accounting/export", handlers.GetAccountingExportHandler(DB))   // GET /api/admin/accounting/export (Export to CSV)

		// 📋 Admin audit logs
		adminGroup.GET("/audit-logs", handlers.GetAdminAuditLogsHandler(DB)) // GET /api/admin/audit-logs (View audit trail)

		// 🚨 Reports
		adminGroup.GET("/reports", handlers.GetAdminReportsHandler)         // GET /api/admin/reports
		adminGroup.PATCH("/reports/:id", handlers.UpdateAdminReportHandler) // PATCH /api/admin/reports/:id
	}

	// --- REPORTS ROUTES (Protected) ---
	reportsGroup := r.Group("/api/reports")
	reportsGroup.Use(handlers.AuthMiddleware())
	{
		reportsGroup.POST("", handlers.CreateReportHandler)       // POST /api/reports
		reportsGroup.GET("/check", handlers.CheckReportedHandler) // GET /api/reports/check?target_type=...&target_id=...
	}

	// --- LOBBY CHATS ROUTES (Protected) ---
	lobbyChatsGroup := r.Group("/api/lobby-chats")
	lobbyChatsGroup.Use(handlers.AuthMiddleware())
	lobbyChatsGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		// Basic chat functionality
		lobbyChatsGroup.GET("/friends", handlers.GetLobbyChatFriendsHandler)           // GET /api/lobby-chats/friends
		lobbyChatsGroup.GET("/messages/:userId", handlers.GetLobbyChatMessagesHandler) // GET /api/lobby-chats/messages/:userId
		lobbyChatsGroup.POST("/send", handlers.SendLobbyChatMessageHandler)            // POST /api/lobby-chats/send

		// Attachments
		lobbyChatsGroup.POST("/image", handlers.UploadLobbyChatImageHandler)          // POST /api/lobby-chats/image
		lobbyChatsGroup.POST("/video", handlers.UploadLobbyChatVideoHandler)          // POST /api/lobby-chats/video
		lobbyChatsGroup.POST("/document", handlers.UploadLobbyChatDocumentHandler)    // POST /api/lobby-chats/document
		lobbyChatsGroup.POST("/voice-note", handlers.UploadLobbyChatVoiceNoteHandler) // POST /api/lobby-chats/voice-note

		// Stickers & Polls
		lobbyChatsGroup.POST("/sticker", handlers.SendLobbyChatStickerHandler)              // POST /api/lobby-chats/sticker
		lobbyChatsGroup.POST("/poll", handlers.CreateLobbyChatPollHandler)                  // POST /api/lobby-chats/poll
		lobbyChatsGroup.POST("/poll/:messageId/vote", handlers.VoteLobbyChatPollHandler)    // POST /api/lobby-chats/poll/:messageId/vote
		lobbyChatsGroup.POST("/watch-out", handlers.SendWatchOutHandler)                    // POST /api/lobby-chats/watch-out
		lobbyChatsGroup.POST("/game-challenge", handlers.SendGameChallengeHandler)           // POST /api/lobby-chats/game-challenge
		lobbyChatsGroup.POST("/private-watchout", handlers.StartPrivateWatchoutHandler)     // POST /api/lobby-chats/private-watchout
		lobbyChatsGroup.POST("/circle-watchout", handlers.StartCircleWatchoutHandler)       // POST /api/lobby-chats/circle-watchout
		lobbyChatsGroup.GET("/watchout-ratings", handlers.GetWatchoutAllowedRatingsHandler) // GET  /api/lobby-chats/watchout-ratings?recipient_id=X

		// Message actions
		lobbyChatsGroup.PATCH("/:messageId", handlers.EditLobbyChatMessageHandler)    // PATCH /api/lobby-chats/:messageId
		lobbyChatsGroup.DELETE("/:messageId", handlers.DeleteLobbyChatMessageHandler) // DELETE /api/lobby-chats/:messageId
		lobbyChatsGroup.DELETE("/clear/:userId", handlers.ClearLobbyChatHandler)      // DELETE /api/lobby-chats/clear/:userId

		// Blocking functionality
		lobbyChatsGroup.POST("/block/:userId", handlers.BlockUserHandler)            // POST /api/lobby-chats/block/:userId
		lobbyChatsGroup.DELETE("/block/:userId", handlers.UnblockUserHandler)        // DELETE /api/lobby-chats/block/:userId
		lobbyChatsGroup.GET("/blocked", handlers.GetBlockedUsersHandler)             // GET /api/lobby-chats/blocked
		lobbyChatsGroup.GET("/block-status/:userId", handlers.CheckIfBlockedHandler) // GET /api/lobby-chats/block-status/:userId
	}

	// --- LOBBY GROUPS ROUTES (Protected) ---
	lobbyGroupsGroup := r.Group("/api/lobby-groups")
	lobbyGroupsGroup.Use(handlers.AuthMiddleware())
	lobbyGroupsGroup.Use(func(c *gin.Context) { c.Set("db", DB); c.Next() })
	{
		lobbyGroupsGroup.POST("", handlers.CreateLobbyGroupHandler)                         // POST   /api/lobby-groups
		lobbyGroupsGroup.GET("", handlers.GetLobbyGroupsHandler)                            // GET    /api/lobby-groups
		lobbyGroupsGroup.GET("/:id/messages", handlers.GetLobbyGroupMessagesHandler)        // GET    /api/lobby-groups/:id/messages
		lobbyGroupsGroup.POST("/:id/messages", handlers.SendLobbyGroupMessageHandler)       // POST   /api/lobby-groups/:id/messages
		lobbyGroupsGroup.POST("/:id/icon", handlers.UploadLobbyGroupIconHandler)            // POST   /api/lobby-groups/:id/icon
		lobbyGroupsGroup.POST("/:id/image", handlers.UploadLobbyGroupImageHandler)          // POST   /api/lobby-groups/:id/image
		lobbyGroupsGroup.POST("/:id/video", handlers.UploadLobbyGroupVideoHandler)          // POST   /api/lobby-groups/:id/video
		lobbyGroupsGroup.POST("/:id/document", handlers.UploadLobbyGroupDocumentHandler)    // POST   /api/lobby-groups/:id/document
		lobbyGroupsGroup.POST("/:id/voice-note", handlers.UploadLobbyGroupVoiceNoteHandler) // POST   /api/lobby-groups/:id/voice-note
		lobbyGroupsGroup.POST("/:id/watch-out", handlers.SendLobbyGroupWatchOutHandler)     // POST   /api/lobby-groups/:id/watch-out
		lobbyGroupsGroup.POST("/:id/call", handlers.StartLobbyGroupCallHandler)             // POST   /api/lobby-groups/:id/call
		lobbyGroupsGroup.POST("/:id/call/end", handlers.EndLobbyGroupCallHandler)           // POST   /api/lobby-groups/:id/call/end
		lobbyGroupsGroup.POST("/:id/members", handlers.AddLobbyGroupMembersHandler)         // POST   /api/lobby-groups/:id/members
		lobbyGroupsGroup.DELETE("/:id/leave", handlers.LeaveLobbyGroupHandler)              // DELETE /api/lobby-groups/:id/leave
		lobbyGroupsGroup.DELETE("/:id", handlers.DeleteLobbyGroupHandler)                   // DELETE /api/lobby-groups/:id
		lobbyGroupsGroup.PATCH("/:id", handlers.RenameLobbyGroupHandler)                    // PATCH  /api/lobby-groups/:id
	}

	// --- LOBBY CALL HISTORY ROUTE (Protected) ---
	lobbyGroup := r.Group("/api/lobby")
	lobbyGroup.Use(handlers.AuthMiddleware())
	{
		lobbyGroup.GET("/call-history", handlers.GetCallHistoryHandler) // GET /api/lobby/call-history
	}

	// --- FRIENDSHIPS ROUTES (Protected) ---
	friendshipsGroup := r.Group("/api/friendships")
	friendshipsGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	friendshipsGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		friendshipsGroup.POST("/request/:userId", handlers.SendFriendRequestHandler)        // POST /api/friendships/request/:userId (Send friend request)
		friendshipsGroup.POST("/accept/:userId", handlers.AcceptFriendRequestHandler)       // POST /api/friendships/accept/:userId (Accept friend request)
		friendshipsGroup.POST("/reject/:userId", handlers.RejectFriendRequestHandler)       // POST /api/friendships/reject/:userId (Reject friend request)
		friendshipsGroup.GET("/requests/pending", handlers.GetPendingFriendRequestsHandler) // GET /api/friendships/requests/pending (Get pending requests)
		friendshipsGroup.GET("/requests/sent", handlers.GetSentFriendRequestsHandler)       // GET /api/friendships/requests/sent (Get sent requests)
		friendshipsGroup.GET("/list", handlers.GetFriendsListHandler)                       // GET /api/friendships/list (Get accepted friends)
		friendshipsGroup.DELETE("/remove/:userId", handlers.RemoveFriendHandler)            // DELETE /api/friendships/remove/:userId (Remove friend)
		friendshipsGroup.GET("/status/:userId", handlers.GetFriendshipStatusHandler)        // GET /api/friendships/status/:userId (Check friendship status)
		friendshipsGroup.GET("/count/:userId", handlers.GetFriendCountHandler)              // GET /api/friendships/count/:userId (Get friend count)
		friendshipsGroup.GET("/followers/:userId", handlers.GetFollowersCountHandler)       // GET /api/friendships/followers/:userId (Get followers count)
		friendshipsGroup.POST("/check-contacts", handlers.CheckContactsHandler)             // POST /api/friendships/check-contacts (Check imported contacts)
	}

	// --- FOLLOW ROUTES (Protected) ---
	followGroup := r.Group("/api/follow")
	followGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	followGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		followGroup.POST("/:userId", handlers.FollowUserHandler)            // POST /api/follow/:userId (Follow a user)
		followGroup.DELETE("/:userId", handlers.UnfollowUserHandler)        // DELETE /api/follow/:userId (Unfollow a user)
		followGroup.GET("/status/:userId", handlers.GetFollowStatusHandler) // GET /api/follow/status/:userId (Follow status + count)
	}

	// --- JOIN REQUEST ROUTES (Protected, nested under rooms) ---
	joinReqGroup := r.Group("/api/rooms")
	joinReqGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	joinReqGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		joinReqGroup.GET("/:id/join-requests", handlers.GetRoomJoinRequestsHandler)                     // GET /api/rooms/:id/join-requests
		joinReqGroup.POST("/:id/join-requests/:userId/approve", handlers.ApproveRoomJoinRequestHandler) // POST /api/rooms/:id/join-requests/:userId/approve
		joinReqGroup.POST("/:id/join-requests/:userId/reject", handlers.RejectRoomJoinRequestHandler)   // POST /api/rooms/:id/join-requests/:userId/reject
	}

	// --- USER STATS ROUTES (Protected) ---
	userStatsGroup := r.Group("/api/users")
	userStatsGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	userStatsGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		userStatsGroup.GET("/:id/average-watchers", handlers.GetUserAverageWatchersHandler) // GET /api/users/:id/average-watchers (Get average session watchers)
		userStatsGroup.GET("/settings", handlers.GetUserSettings)                           // GET /api/users/settings (Get user notification & privacy settings)
		userStatsGroup.PUT("/settings", handlers.UpdateUserSettings)                        // PUT /api/users/settings (Update user settings)
	}

	// --- PRIVATE MESSAGES ROUTES (Protected) ---
	privateMessagesGroup := r.Group("/api/private-messages")
	privateMessagesGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	{
		privateMessagesGroup.GET("/:id", handlers.GetPrivateMessagesHandler) // GET /api/private-messages/:id (Get private messages with user)
	}

	// --- SUPER ADMIN ANALYTICS ROUTES (Protected + Super Admin Only) ---
	superAdminGroup := r.Group("/api/admin")
	superAdminGroup.Use(handlers.AuthMiddleware())
	superAdminGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	superAdminGroup.Use(handlers.RequireSuperAdmin()) // Super Admin role required
	{
		superAdminGroup.GET("/analytics", handlers.GetPlatformAnalytics)                                // GET /api/admin/analytics (Platform metrics: revenue, users, sessions)
		superAdminGroup.GET("/token-spending-analytics", handlers.GetTokenSpendingAnalytics)            // GET /api/admin/token-spending-analytics (Token spending by rooms/hosts)
		superAdminGroup.GET("/event-analytics", handlers.GetEventAnalytics)                             // GET /api/admin/event-analytics (Event ticketing metrics)
		superAdminGroup.GET("/community-analytics", handlers.GetCommunityAnalyticsHandler)              // GET /api/admin/community-analytics (Community request stats)
		superAdminGroup.GET("/hub-stats", handlers.GetHubStatsHandler)                                  // GET /api/admin/hub-stats (WebSocket Hub drop counters + queue depth)
		superAdminGroup.POST("/transfer-donation-commission", handlers.TransferTokenDonationCommission) // POST /api/admin/transfer-donation-commission (Transfer 5% token gift commissions)
		superAdminGroup.POST("/sweep-withdrawal-fees", handlers.SweepWithdrawalFeeRevenue)              // POST /api/admin/sweep-withdrawal-fees (Sweep accumulated ₦100 withdrawal fees quarterly)

		// Legacy pending payouts (for manually flagged accounts)
		superAdminGroup.GET("/payouts/pending", handlers.GetPendingPayoutsHandler(DB))  // GET /api/admin/payouts/pending (List pending payouts)
		superAdminGroup.POST("/payouts/:id/process", handlers.ProcessPayoutHandler(DB)) // POST /api/admin/payouts/:id/process (Process payout)
		superAdminGroup.POST("/payouts/:id/reject", handlers.RejectPayoutHandler(DB))   // POST /api/admin/payouts/:id/reject (Reject payout)

		// Manual processing payouts (for starter account workaround)
		superAdminGroup.GET("/payouts/processing", handlers.GetProcessingPayoutsHandler(DB))   // GET /api/admin/payouts/processing (List processing payouts)
		superAdminGroup.POST("/payouts/:id/complete", handlers.MarkPayoutCompletedHandler(DB)) // POST /api/admin/payouts/:id/complete (Mark manually transferred payout as completed)

		// Ad Inquiry Management
		superAdminGroup.GET("/ad-inquiries", handlers.GetAdInquiries)                     // GET /api/admin/ad-inquiries (List all ad inquiries)
		superAdminGroup.PATCH("/ad-inquiries/:id/status", handlers.UpdateAdInquiryStatus) // PATCH /api/admin/ad-inquiries/:id/status (Update inquiry status)
		superAdminGroup.DELETE("/ad-inquiries/:id", handlers.DeleteAdInquiry)             // DELETE /api/admin/ad-inquiries/:id (Delete inquiry)

		// Ad Campaign Management (Super Admin)
		superAdminGroup.GET("/campaigns", handlers.GetAllCampaigns)                   // GET /api/admin/campaigns (List all campaigns)
		superAdminGroup.PATCH("/campaigns/:id/status", handlers.UpdateCampaignStatus) // PATCH /api/admin/campaigns/:id/status (Approve/reject campaign)
	}

	// --- PUBLIC AD INQUIRY SUBMISSION ---
	r.POST("/api/ads/inquiries", handlers.SubmitAdInquiry) // POST /api/ads/inquiries (Public form submission)

	// --- AD CAMPAIGN ROUTES (Protected) ---
	adGroup := r.Group("/api/ads")
	adGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	adGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		adGroup.POST("/campaigns", handlers.CreateAdCampaign)    // POST /api/ads/campaigns (Create campaign)
		adGroup.GET("/campaigns", handlers.GetUserCampaigns)     // GET /api/ads/campaigns (List user's campaigns)
		adGroup.POST("/upload/ad-media", handlers.UploadAdMedia) // POST /api/ads/upload/ad-media (Upload ad creative)
	}

	// --- PUBLIC AD SERVING ROUTES ---
	publicAdGroup := r.Group("/api/ads")
	publicAdGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		publicAdGroup.GET("/active", handlers.GetActiveCampaigns)              // GET /api/ads/active (Get active ads for display)
		publicAdGroup.GET("/check-eligibility", handlers.CheckAdEligibility)   // GET /api/ads/check-eligibility?user_id=X&session_id=Y (Check 1-hour frequency cap)
		publicAdGroup.GET("/in-session", handlers.GetInSessionAd)              // GET /api/ads/in-session?user_id=X&session_id=Y (Get highest CPM ad for 80-20 split)
		publicAdGroup.GET("/roomtv", handlers.GetRoomTVAd)                     // GET /api/ads/roomtv?room_id=X&user_id=Y (Get text/banner ad for RoomTV)
		publicAdGroup.GET("/settings", handlers.GetAdSettingsHandler)          // GET /api/ads/settings (Get ad system config - global switch)
		publicAdGroup.POST("/campaigns/:id/track", handlers.TrackAdImpression) // POST /api/ads/campaigns/:id/track (Track impression/click)
	}

	// --- AD SETTINGS ROUTES (Super Admin Only) ---
	adSettingsGroup := r.Group("/api/ads")
	adSettingsGroup.Use(handlers.CookieToAuthHeaderMiddleware(), handlers.AuthMiddleware())
	adSettingsGroup.Use(func(c *gin.Context) {
		c.Set("db", DB)
		c.Next()
	})
	{
		adSettingsGroup.PUT("/settings", handlers.UpdateAdSettingsHandler) // PUT /api/ads/settings (Update ad system config - super admin only)
	}

	// --- REFUND ROUTES (Protected) ---
	refundGroup := r.Group("/api/refunds")
	refundGroup.Use(handlers.AuthMiddleware())
	{
		refundGroup.POST("/request", handlers.RequestRefundHandler(DB))      // POST /api/refunds/request?ticket_id=X (Request refund)
		refundGroup.GET("/user/:userId", handlers.GetUserRefundsHandler(DB)) // GET /api/refunds/user/:userId (User's refund requests)
		refundGroup.GET("/host/:userId", handlers.GetHostRefundsHandler(DB)) // GET /api/refunds/host/:userId (Host's refund requests)
		refundGroup.POST("/:id/approve", handlers.ApproveRefundHandler(DB))  // POST /api/refunds/:id/approve (Host approves refund)
		refundGroup.POST("/:id/deny", handlers.DenyRefundHandler(DB))        // POST /api/refunds/:id/deny (Host denies refund)
	}

	// --- QUIZ REST API ROUTES (Protected) ---
	quizGroup := r.Group("/api/quizzes")
	quizGroup.Use(handlers.AuthMiddleware())
	{
		quizGroup.GET("/session/:session_id", handlers.GetSessionQuizzes)      // GET /api/quizzes/session/:session_id (Get all quizzes for session - host)
		quizGroup.GET("/session/:session_id/history", handlers.GetQuizHistory) // GET /api/quizzes/session/:session_id/history (Get quiz history - students)
		quizGroup.GET("/:quiz_id/progress", handlers.GetQuizProgressREST)      // GET /api/quizzes/:quiz_id/progress (Get quiz progress - host)
	}

	// --- WEBHOOK ROUTES (Public - No Auth) ---
	webhookGroup := r.Group("/api/webhooks")
	{
		webhookGroup.POST("/stripe", handlers.StripeWebhookHandler(DB))     // POST /api/webhooks/stripe (Stripe payment webhooks)
		webhookGroup.POST("/paystack", handlers.PaystackWebhookHandler(DB)) // POST /api/webhooks/paystack (Paystack payment webhooks)
		webhookGroup.GET("/config", handlers.GetWebhookConfigHandler())     // GET /api/webhooks/config (Dev only - webhook config)
		webhookGroup.POST("/test", handlers.TestWebhookHandler(DB))         // POST /api/webhooks/test (Dev only - simulate webhook)
	}
	// --- Placeholder for Future Routes ---
	// roomGroup.PUT("/:id", handlers.UpdateRoomHandler)
	// roomGroup.DELETE("/:id", handlers.DeleteRoomHandler)
	// roomGroup.POST("/:id/join", handlers.JoinRoomHandler)
	// roomGroup.POST("/:id/upload", handlers.UploadMediaHandler)
	// roomGroup.POST("/:id/playback", handlers.UpdatePlaybackHandler)

	port := ":8080"
	log.Printf("Starting LetsWatchOut backend server on port %s", port)
	err = r.Run(port) // Use = because err is already declared
	if err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
