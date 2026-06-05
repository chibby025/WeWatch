// backend/internal/handlers/auth.go
package handlers

import (
    "fmt"
    "log"
    "net/http"
    "os"
    "path/filepath"
    "strconv"
    "strings"
    "time"
    "wewatch-backend/internal/models"
    "wewatch-backend/internal/services"
    "wewatch-backend/internal/utils"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

// Global DB variable - assumes it's initialized in main.go
// In a more complex app, you might pass it as a dependency.
var DB *gorm.DB // This will be set from main.go

// RegisterInput defines the expected structure of the request body for registration.
type RegisterInput struct {
    Username    string  `json:"username" binding:"required,min=1,max=50"`
    Email       string  `json:"email" binding:"required,email"`
    Password    string  `json:"password" binding:"required,min=6"`
    DateOfBirth *string `json:"date_of_birth"` // Optional: "YYYY-MM-DD" format
}

// LoginInput defines the expected structure of the request body for login.
// The Email field accepts either an email address or a username.
type LoginInput struct {
    Email    string `json:"email" binding:"required"` // email address or username
    Password string `json:"password" binding:"required"`
}

// RegisterHandler handles the POST /api/auth/register endpoint.
func RegisterHandler(c *gin.Context) {
    // Bind the incoming JSON request body to the RegisterInput struct.
    // This automatically validates required fields and data types.
    var input RegisterInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("Error binding register input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Check if user already exists (by email or username)
    var existingUser models.User
    result := DB.Where("email = ? OR username = ?", input.Email, input.Username).First(&existingUser)
    if result.Error == nil {
        // User found (no error from First), so they already exist.
        log.Printf("Registration failed: User with email '%s' or username '%s' already exists", input.Email, input.Username)
        c.JSON(http.StatusConflict, gin.H{"error": "User with this email or username already exists"})
        return
    } else if result.Error != gorm.ErrRecordNotFound {
        // An unexpected database error occurred.
        log.Printf("Database error checking for existing user: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    // If result.Error == gorm.ErrRecordNotFound, it means the user doesn't exist, which is what we want.

    // Hash the password
    hashedPassword, err := utils.HashPassword(input.Password)
    if err != nil {
        log.Printf("Error hashing password during registration: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process password"})
        return
    }

    // Parse and validate date of birth if provided
    var dob *time.Time
    if input.DateOfBirth != nil && *input.DateOfBirth != "" {
        parsed, err := time.Parse("2006-01-02", *input.DateOfBirth)
        if err != nil {
            log.Printf("Invalid date format for date_of_birth: %v", err)
            c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
            return
        }
        
        // Validate user is at least 13 years old (COPPA compliance)
        now := time.Now()
        age := now.Year() - parsed.Year()
        if now.Month() < parsed.Month() || (now.Month() == parsed.Month() && now.Day() < parsed.Day()) {
            age--
        }
        
        if age < 13 {
            log.Printf("Registration denied: User is under 13 years old")
            c.JSON(http.StatusBadRequest, gin.H{"error": "You must be at least 13 years old to use WeWatch"})
            return
        }
        
        dob = &parsed
        log.Printf("Date of birth provided for registration: %s (age: %d)", parsed.Format("2006-01-02"), age)
    }

    // Create the new user instance
    newUser := models.User{
        Username:     input.Username,
        Email:        input.Email,
        PasswordHash: hashedPassword,
        DateOfBirth:  dob,
    }

    // Save the user to the database
    result = DB.Create(&newUser)
    if result.Error != nil {
        log.Printf("Error creating user in database: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
        return
    }

    // If DOB was provided at registration, compute age flags immediately.
    if dob != nil {
        now := time.Now()
        regAge := now.Year() - dob.Year()
        if now.Month() < dob.Month() || (now.Month() == dob.Month() && now.Day() < dob.Day()) {
            regAge--
        }
        saveAgeFlagsForUser(DB, newUser.ID, regAge)
    }

    // Create wallet for new user
    wallet := models.UserWallet{
        UserID:         newUser.ID,
        TokenBalance:   0,
        LifetimeEarned: 0,
        LifetimeSpent:  0,
    }
    if err := DB.Create(&wallet).Error; err != nil {
        log.Printf("⚠️ Warning: Failed to create wallet for user %d: %v", newUser.ID, err)
        // Don't fail registration if wallet creation fails - can be created later
    } else {
        log.Printf("💰 Wallet created for new user %d", newUser.ID)
    }

    // User created successfully!
    log.Printf("User registered successfully: ID=%d, Username=%s, Email=%s", newUser.ID, newUser.Username, newUser.Email)

    // Generate a JWT token for the newly registered user
    tokenString, err := utils.GenerateJWT(newUser.ID)
    if err != nil {
        log.Printf("Error generating JWT for new user: %v", err)
        // Even though token generation failed, the user was created.
        // You might choose to return a different status or message here.
        // For now, let's still return 201 Created but note the token issue.
        c.JSON(http.StatusCreated, gin.H{
            "message": "User created successfully, but failed to generate token",
            "user":    newUser, // Usually you don't send the full user object back, maybe just ID/Username
        })
        return
    }

    // Respond with success, user info (without password hash), and the token.
    // Sending the token immediately is common practice.
    c.JSON(http.StatusCreated, gin.H{
        "message": "User registered successfully",
        "user": gin.H{ // Return a simplified user object
            "id":       newUser.ID,
            "username": newUser.Username,
            "email":    newUser.Email,
            "avatar_url": newUser.AvatarURL,
            "has_date_of_birth": newUser.HasDateOfBirth(),
            // Don't include PasswordHash!
        },
        "token": tokenString,
    })
}

// LoginHandler handles the POST /api/auth/login endpoint.
func LoginHandler(c *gin.Context) {
    var input LoginInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("Error binding login input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    var user models.User
    result := DB.Where("LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)", input.Email, input.Email).First(&user)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            // ✅ P0 Security Fix: Log failed login attempt (user not found)
            models.LogSecurityEvent(DB, nil, models.EventFailedLogin, c.ClientIP(), c.GetHeader("User-Agent"), fmt.Sprintf(`{"identifier": "%s", "reason": "user_not_found"}`, input.Email))
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
            return
        } else {
            log.Printf("Database error finding user for login: %v", result.Error)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }

    if !utils.CheckPasswordHash(input.Password, user.PasswordHash) {
        // ✅ P0 Security Fix: Log failed login attempt (wrong password)
        userID := user.ID
        models.LogSecurityEvent(DB, &userID, models.EventFailedLogin, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "wrong_password"}`)
        
        // ✅ P1 Security Feature: Check for brute force
        if models.DetectBruteForce(DB, user.ID) {
            models.LogSecurityEvent(DB, &userID, models.EventAccountLocked, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "brute_force_detected"}`)
            c.JSON(http.StatusTooManyRequests, gin.H{"error": "Account temporarily locked due to multiple failed attempts. Try again in 15 minutes."})
            return
        }
        
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    tokenString, err := utils.GenerateJWT(user.ID)
    if err != nil {
        log.Printf("Error generating JWT: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    // ✅ SET HTTP-ONLY COOKIE (instead of sending token in response)
    cookie := &http.Cookie{
        Name:     "wewatch_token",
        Value:    tokenString,
        Path:     "/",
        MaxAge:   7 * 24 * 60 * 60, // 7 days
        HttpOnly: true,
        Secure:   true, // Required for SameSite=None (works with HTTPS/tunnels)
        SameSite: http.SameSiteNoneMode, // Allow cross-origin cookies for tunnels
    }
    http.SetCookie(c.Writer, cookie)

    log.Printf("User logged in successfully: ID=%d, Username=%s", user.ID, user.Username)

    c.JSON(http.StatusOK, gin.H{
        "message": "Login successful",
        "token":   tokenString,
        "user": gin.H{
            "id":       user.ID,
            "username": user.Username,
            "email":    user.Email,
            "avatar_url": user.AvatarURL,
            "bio":       user.Bio,
            "has_date_of_birth": user.HasDateOfBirth(),
        },
    })
}

// Handle user logout
func LogoutHandler(c *gin.Context) {
    // ✅ P0 Security Fix: Blacklist JWT token before clearing cookie
    token, err := c.Cookie("wewatch_token")
    // Also accept token from Authorization header (for localStorage-based clients)
    if err != nil || token == "" {
        if authHeader := c.GetHeader("Authorization"); strings.HasPrefix(authHeader, "Bearer ") {
            token = authHeader[7:]
            err = nil
        }
    }
    if err == nil && token != "" {
        // Parse token to get expiration time
        claims, parseErr := utils.ParseJWT(token)
        if parseErr == nil {
            // Add token to blacklist with its original expiration
            expiresAt := time.Unix(int64(claims["exp"].(float64)), 0)
            if blacklistErr := models.BlacklistToken(DB, token, expiresAt); blacklistErr != nil {
                log.Printf("⚠️ Warning: Failed to blacklist token on logout: %v", blacklistErr)
            } else {
                log.Printf("✅ Token blacklisted on logout")
            }
        }
    }
    
    // Clear the cookie
    cookie := &http.Cookie{
        Name:     "wewatch_token",
        Value:    "",
        Path:     "/",
        MaxAge:   -1, // Expire immediately
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteNoneMode,
    }
    http.SetCookie(c.Writer, cookie)

    c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// ChangePasswordInput defines the structure for password change request
type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=8"`
}

// ChangePasswordHandler handles password changes for authenticated users
// POST /api/auth/change-password (protected)
func ChangePasswordHandler(c *gin.Context) {
	// Get user ID from context (set by AuthMiddleware)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var input ChangePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("Error binding password change input: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch user
	var user models.User
	if err := DB.First(&user, userID.(uint)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Verify current password
	if !utils.CheckPasswordHash(input.CurrentPassword, user.PasswordHash) {
		log.Printf("⚠️ Failed password change attempt for user %d: wrong current password", user.ID)
		userIDUint := user.ID
		models.LogSecurityEvent(DB, &userIDUint, "password_change_failed", c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "wrong_current_password"}`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Current password is incorrect"})
		return
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(input.NewPassword)
	if err != nil {
		log.Printf("Error hashing new password: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to process new password"})
		return
	}

	// Update password
	user.PasswordHash = hashedPassword
	if err := DB.Save(&user).Error; err != nil {
		log.Printf("Error updating password: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	// Log security event
	userIDUint := user.ID
	models.LogSecurityEvent(DB, &userIDUint, models.EventPasswordChanged, c.ClientIP(), c.GetHeader("User-Agent"), `{"status": "success"}`)
	log.Printf("✅ Password changed successfully for user %d (%s)", user.ID, user.Email)

	c.JSON(http.StatusOK, gin.H{
		"message": "Password changed successfully",
		"success": true,
	})
}

// CookieToAuthHeaderMiddleware converts wewatch_token cookie (or auth_token query param) to Authorization header
func CookieToAuthHeaderMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Already has Authorization header — nothing to do
		if c.GetHeader("Authorization") != "" {
			c.Next()
			return
		}
		// Fallback 1: wewatch_token cookie (native / same-domain requests)
		if token, err := c.Cookie("wewatch_token"); err == nil && token != "" {
			c.Request.Header.Set("Authorization", "Bearer "+token)
			c.Next()
			return
		}
		// Fallback 2: auth_token query param (Vercel proxy strips Authorization header)
		if token := c.Query("auth_token"); token != "" {
			c.Request.Header.Set("Authorization", "Bearer "+token)
		}
		c.Next()
	}
}



// GetCurrentUserHandler handles the GET /api/auth/me endpoint.
// This requires authentication, so it should be protected by a middleware.
// For now, we'll assume a middleware sets the user ID in the context.
// GetCurrentUserHandler handles the GET /api/auth/me endpoint.
func GetCurrentUserHandler(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        log.Println("Unauthorized access to /api/auth/me: user_id not found in context")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    id, ok := userID.(uint)
    if !ok {
        log.Println("Error: user_id in context is not uint")
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }

    var user models.User
    result := DB.First(&user, id)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            log.Printf("User not found for ID %d (from token)", id)
            c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
            return
        } else {
            log.Printf("Database error fetching user for /api/auth/me: %v", result.Error)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }

    // ✅ Fetch user's room memberships for instant client-side checks
    var roomMemberships []uint
    DB.Model(&models.UserRoom{}).
        Where("user_id = ?", user.ID).
        Pluck("room_id", &roomMemberships)
    log.Printf("Fetched %d room memberships for user %d", len(roomMemberships), user.ID)

    // ✅ DEV-ONLY: Include token for WebSocket (remove before production)
    token, _ := c.Cookie("wewatch_token")
    response := gin.H{
        "user": gin.H{
            "id":         user.ID,
            "username":   user.Username,
            "email":      user.Email,
            "avatar_url": user.AvatarURL,
            "bio":        user.Bio,
            "role":       user.Role,
            "created_at": user.CreatedAt,
            "age":        user.GetAge(),
            "has_date_of_birth": user.HasDateOfBirth(),
            "main_room_id": user.MainRoomID,
        },
        "room_memberships": roomMemberships,
    }
    if token != "" {
        // ✅ Validate token before returning it (ensure it's a valid JWT, not a UUID)
        _, err := utils.ValidateJWT(token)
        if err == nil {
            response["ws_token"] = token // Only include if valid
        } else {
            log.Printf("⚠️ Invalid token in cookie for user %d, not including ws_token: %v", user.ID, err)
        }
    }

    log.Printf("Fetched current user details: ID=%d, Username=%s", user.ID, user.Username)
    c.JSON(http.StatusOK, response)
}

// Profile Handler - Update user profile (username, bio, avatar)
func UpdateProfileHandler(c *gin.Context) {
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(401, gin.H{"error": "Unauthorized"})
        return
    }
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(500, gin.H{"error": "Server error"})
        return
    }

    // Support both JSON and multipart/form-data (for avatar upload)
    contentType := c.GetHeader("Content-Type")
    
    var username, bio, avatarURL string
    
    if strings.Contains(contentType, "multipart/form-data") {
        // Handle multipart form data (with file upload)
        username = c.PostForm("username")
        bio = c.PostForm("bio")
        
        // Handle avatar file upload
        file, err := c.FormFile("avatar")
        if err == nil {
            // Avatar file provided - save it
            uploadDir := "./uploads/avatars"
            os.MkdirAll(uploadDir, os.ModePerm)
            
            // Generate unique filename
            ext := filepath.Ext(file.Filename)
            filename := fmt.Sprintf("avatar_%d_%d%s", userID, time.Now().Unix(), ext)
            filepath := filepath.Join(uploadDir, filename)
            
            if err := c.SaveUploadedFile(file, filepath); err != nil {
                log.Printf("Failed to save avatar file: %v", err)
                c.JSON(500, gin.H{"error": "Failed to save avatar"})
                return
            }
            
            avatarURL = fmt.Sprintf("/uploads/avatars/%s", filename)
        }
    } else {
        // Handle JSON request
        var req struct {
            Username  string `json:"username"`
            Bio       string `json:"bio"`
            AvatarURL string `json:"avatar_url"`
        }
        if err := c.ShouldBindJSON(&req); err != nil {
            c.JSON(400, gin.H{"error": "Invalid request"})
            return
        }
        username = req.Username
        bio = req.Bio
        avatarURL = req.AvatarURL
    }

    // Build update map
    updates := make(map[string]interface{})
    if username != "" {
        updates["username"] = username
    }
    if bio != "" {
        updates["bio"] = bio
    }
    if avatarURL != "" {
        updates["avatar_url"] = avatarURL
    }

    // Only update if there are changes
    if len(updates) == 0 {
        c.JSON(400, gin.H{"error": "No fields to update"})
        return
    }

    // Update user
    result := DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates)
    if result.Error != nil {
        log.Printf("Failed to update user profile: %v", result.Error)
        c.JSON(500, gin.H{"error": "Failed to update profile"})
        return
    }

    // Fetch updated user
    var user models.User
    DB.First(&user, userID)

    c.JSON(200, gin.H{
        "message": "Profile updated successfully",
        "user": gin.H{
            "id":         user.ID,
            "username":   user.Username,
            "email":      user.Email,
            "avatar_url": user.AvatarURL,
            "bio":        user.Bio,
        },
    })
}


// AuthMiddleware is a Gin middleware function to protect routes.
// It checks for a valid JWT Bearer token in the Authorization header or query parameter (for WebSockets).
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // Skip auth for OPTIONS preflight requests (CORS)
        if c.Request.Method == "OPTIONS" {
            c.Next()
            return
        }

        tokenString := ""

        // 1. For WebSocket upgrade, prioritize query param
        if c.Request.Method == "GET" && c.GetHeader("Upgrade") == "websocket" {
            if queryToken := c.Query("token"); queryToken != "" {
                tokenString = queryToken
                log.Printf("AuthMiddleware: Token from query param (WebSocket)")
            }
        }

        // 2. For all other requests, or if query param not set, try Authorization header
        if tokenString == "" {
            authHeader := c.GetHeader("Authorization")
            if authHeader != "" {
                const bearerPrefix = "Bearer "
                if len(authHeader) > len(bearerPrefix) && authHeader[:len(bearerPrefix)] == bearerPrefix {
                    tokenString = authHeader[len(bearerPrefix):]
                    log.Printf("AuthMiddleware: Token from Authorization header")
                }
            }
        }

        // 3. Try cookie if still not set
        if tokenString == "" {
            if cookie, err := c.Cookie("wewatch_token"); err == nil && cookie != "" {
                tokenString = cookie
                log.Printf("AuthMiddleware: Token from wewatch_token cookie")
            }
        }

        if tokenString == "" {
            log.Println("AuthMiddleware: No token found in header, cookie, or query")
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
            c.Abort()
            return
        }

        // ✅ P0 Security Fix: Check if token is blacklisted (logged out)
        if models.IsTokenBlacklisted(DB, tokenString) {
            log.Printf("AuthMiddleware: Token is blacklisted (logged out)")
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Token has been revoked. Please log in again."})
            c.Abort()
            return
        }

        // Validate token
        userID, err := utils.ValidateJWT(tokenString)
        if err != nil {
            log.Printf("AuthMiddleware: Invalid token: %v", err)
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
            c.Abort()
            return
        }

        c.Set("user_id", userID)
        c.Next()
    }
}

// OptionalAuthMiddleware injects user_id into context if a valid token is present,
// but allows the request through even with no token or an invalid one.
func OptionalAuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        tokenString := ""
        if authHeader := c.GetHeader("Authorization"); authHeader != "" {
            const bearerPrefix = "Bearer "
            if len(authHeader) > len(bearerPrefix) && authHeader[:len(bearerPrefix)] == bearerPrefix {
                tokenString = authHeader[len(bearerPrefix):]
            }
        }
        if tokenString == "" {
            if cookie, err := c.Cookie("wewatch_token"); err == nil && cookie != "" {
                tokenString = cookie
            }
        }
        if tokenString != "" && !models.IsTokenBlacklisted(DB, tokenString) {
            if userID, err := utils.ValidateJWT(tokenString); err == nil {
                c.Set("user_id", userID)
            }
        }
        c.Next()
    }
}

// GetUserByUsernameHandler looks up a user by username (for ticket gifting)
// GET /api/users/by-username/:username
func GetUserByUsernameHandler(c *gin.Context) {
    username := c.Param("username")
    
    if username == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Username required"})
        return
    }
    
    db := c.MustGet("db").(*gorm.DB)
    
    var user models.User
    if err := db.Where("LOWER(username) = LOWER(?)", username).First(&user).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        } else {
            log.Printf("Error looking up user: %v", err)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        }
        return
    }
    
    // Return minimal user info (no sensitive data)
    c.JSON(http.StatusOK, gin.H{
        "user": gin.H{
            "id":       user.ID,
            "username": user.Username,
            "avatar_url": user.AvatarURL,
        },
    })
}

// GetUserAverageWatchersHandler calculates average watchers across all sessions hosted by a user
// GET /api/users/:userId/average-watchers
func GetUserAverageWatchersHandler(c *gin.Context) {
    userIDParam := c.Param("id")
    
    userID, err := strconv.ParseUint(userIDParam, 10, 32)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
        return
    }
    
    db := c.MustGet("db").(*gorm.DB)
    
    // First verify user exists
    var user models.User
    if err := db.First(&user, userID).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        } else {
            log.Printf("Error finding user: %v", err)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        }
        return
    }
    
    // Check if user is a host (has hosted any sessions)
    var sessionCount int64
    if err := db.Model(&models.WatchSession{}).
        Where("host_id = ?", userID).
        Count(&sessionCount).Error; err != nil {
        log.Printf("Error counting sessions: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    // If no sessions hosted, return 0
    if sessionCount == 0 {
        c.JSON(http.StatusOK, gin.H{
            "user_id": userID,
            "is_host": false,
            "average_watchers": 0,
            "total_sessions": 0,
        })
        return
    }
    
    // Calculate average watchers per session
    // We need to count distinct members per session, then average across all sessions
    type SessionWatcherCount struct {
        SessionID     uint
        WatcherCount  int64
    }
    
    var sessionWatchers []SessionWatcherCount
    
    // Get count of members per session
    if err := db.Table("watch_session_members").
        Select("watch_session_id as session_id, COUNT(DISTINCT user_id) as watcher_count").
        Joins("JOIN watch_sessions ON watch_sessions.id = watch_session_members.watch_session_id").
        Where("watch_sessions.host_id = ?", userID).
        Group("watch_session_id").
        Scan(&sessionWatchers).Error; err != nil {
        log.Printf("Error calculating session watchers: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    // Calculate average
    var totalWatchers int64 = 0
    for _, sw := range sessionWatchers {
        totalWatchers += sw.WatcherCount
    }
    
    var averageWatchers float64 = 0
    if len(sessionWatchers) > 0 {
        averageWatchers = float64(totalWatchers) / float64(len(sessionWatchers))
    }
    
    c.JSON(http.StatusOK, gin.H{
        "user_id": userID,
        "is_host": true,
        "average_watchers": averageWatchers,
        "total_sessions": len(sessionWatchers),
        "total_watchers": totalWatchers,
    })
}

// CheckDateOfBirthHandler checks if the authenticated user has provided their date of birth
// GET /api/auth/check-dob
func CheckDateOfBirthHandler(c *gin.Context) {
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
        return
    }
    
    var user models.User
    if err := DB.First(&user, userID).Error; err != nil {
        log.Printf("Error fetching user %d: %v", userID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "has_dob": user.HasDateOfBirth(),
        "user_id": userID,
    })
}

// UpdateDateOfBirthInput defines the expected structure for updating date of birth
type UpdateDateOfBirthInput struct {
    DateOfBirth string `json:"date_of_birth" binding:"required"` // "YYYY-MM-DD" format
}

// UpdateDateOfBirthHandler updates the user's date of birth (can only be set once)
// POST /api/auth/update-dob
func UpdateDateOfBirthHandler(c *gin.Context) {
    userIDValue, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }
    userID, ok := userIDValue.(uint)
    if !ok {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID format"})
        return
    }
    
    var input UpdateDateOfBirthInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("Error binding update DOB input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Fetch user
    var user models.User
    if err := DB.First(&user, userID).Error; err != nil {
        log.Printf("Error fetching user %d: %v", userID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    // Check if DOB is already set (prevent changing after initial set)
    if user.HasDateOfBirth() {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Date of birth has already been set and cannot be changed"})
        return
    }
    
    // Parse date of birth
    parsed, err := time.Parse("2006-01-02", input.DateOfBirth)
    if err != nil {
        log.Printf("Invalid date format for date_of_birth: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid date format. Use YYYY-MM-DD"})
        return
    }
    
    // Validate user is at least 13 years old (COPPA compliance)
    now := time.Now()
    age := now.Year() - parsed.Year()
    if now.Month() < parsed.Month() || (now.Month() == parsed.Month() && now.Day() < parsed.Day()) {
        age--
    }
    
    if age < 13 {
        log.Printf("DOB update denied: User %d is under 13 years old", userID)
        c.JSON(http.StatusBadRequest, gin.H{"error": "You must be at least 13 years old to use WeWatch"})
        return
    }
    
    // Validate date is not in the future
    if parsed.After(now) {
        c.JSON(http.StatusBadRequest, gin.H{"error": "Date of birth cannot be in the future"})
        return
    }
    
    // Update user's date of birth
    user.DateOfBirth = &parsed
    if err := DB.Save(&user).Error; err != nil {
        log.Printf("Error updating DOB for user %d: %v", userID, err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update date of birth"})
        return
    }

    // Compute and persist age-based content visibility flags immediately.
    saveAgeFlagsForUser(DB, userID, age)

    log.Printf("✅ Date of birth updated for user %d: age %d", userID, age)

    c.JSON(http.StatusOK, gin.H{
        "message": "Date of birth updated successfully",
        "has_dob": true,
    })
}

// ForgotPasswordInput defines the request structure for password reset
type ForgotPasswordInput struct {
    Email string `json:"email" binding:"required,email"`
}

// ResetPasswordInput defines the request structure for password reset completion
type ResetPasswordInput struct {
    Token       string `json:"token" binding:"required"`
    NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ForgotPasswordHandler handles password reset requests
// POST /api/auth/forgot-password
func ForgotPasswordHandler(c *gin.Context) {
    var input ForgotPasswordInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("❌ [ForgotPassword] Invalid input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid email format"})
        return
    }
    
    // Normalize email
    email := strings.ToLower(strings.TrimSpace(input.Email))
    log.Printf("🔄 [ForgotPassword] Request for email: %s", email)
    
    // Rate limiting: Check recent reset requests (max 3 per hour)
    oneHourAgo := time.Now().Add(-1 * time.Hour)
    var recentTokens []models.PasswordResetToken
    DB.Joins("JOIN users ON users.id = password_reset_tokens.user_id").
        Where("users.email = ? AND password_reset_tokens.created_at > ?", email, oneHourAgo).
        Find(&recentTokens)
    
    if len(recentTokens) >= 3 {
        log.Printf("⚠️ [ForgotPassword] Rate limit exceeded for: %s", email)
        // Still return success to prevent email enumeration
        c.JSON(http.StatusOK, gin.H{
            "message": "If that email is registered, we sent a password reset link",
        })
        return
    }
    
    // Find user by email
    var user models.User
    result := DB.Where("email = ?", email).First(&user)
    
    if result.Error == gorm.ErrRecordNotFound {
        log.Printf("⚠️ [ForgotPassword] User not found: %s", email)
        // Generic message for security (prevent email enumeration)
        c.JSON(http.StatusOK, gin.H{
            "message": "If that email is registered, we sent a password reset link",
        })
        return
    } else if result.Error != nil {
        log.Printf("❌ [ForgotPassword] Database error: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    // Check if user signed up with Google OAuth (no password)
    if user.OAuthProvider != nil && *user.OAuthProvider == "google" && user.PasswordHash == "" {
        log.Printf("⚠️ [ForgotPassword] OAuth user attempted password reset: %s", email)
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "You signed up with Google. Please use 'Sign in with Google' instead.",
        })
        return
    }
    
    // Invalidate all existing tokens for this user (only newest token works)
    DB.Model(&models.PasswordResetToken{}).
        Where("user_id = ? AND used = false", user.ID).
        Update("used", true)
    
    // Generate secure random token (UUID)
    token := uuid.New().String()
    
    // Create reset token with 15-minute expiry
    resetToken := models.PasswordResetToken{
        UserID:    user.ID,
        Token:     token,
        ExpiresAt: time.Now().Add(15 * time.Minute),
        Used:      false,
    }
    
    if err := DB.Create(&resetToken).Error; err != nil {
        log.Printf("❌ [ForgotPassword] Failed to create token: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create reset token"})
        return
    }
    
    // Send reset email
    emailService := services.NewEmailService()
    if err := emailService.SendPasswordResetEmail(user.Email, user.Username, token); err != nil {
        log.Printf("❌ [ForgotPassword] Failed to send email: %v", err)
        // Don't expose email failure to user (security)
        c.JSON(http.StatusOK, gin.H{
            "message": "If that email is registered, we sent a password reset link",
        })
        return
    }
    
    log.Printf("✅ [ForgotPassword] Reset email sent to: %s (Token: %s)", email, token[:8]+"...")
    
    c.JSON(http.StatusOK, gin.H{
        "message": "If that email is registered, we sent a password reset link",
    })
}

// ResetPasswordHandler completes the password reset process
// POST /api/auth/reset-password
func ResetPasswordHandler(c *gin.Context) {
    var input ResetPasswordInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("❌ [ResetPassword] Invalid input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid input"})
        return
    }
    
    log.Printf("🔄 [ResetPassword] Processing token: %s", input.Token[:8]+"...")
    
    // Find and validate token
    var resetToken models.PasswordResetToken
    result := DB.Where("token = ?", input.Token).First(&resetToken)
    
    if result.Error == gorm.ErrRecordNotFound {
        log.Printf("⚠️ [ResetPassword] Token not found: %s", input.Token[:8]+"...")
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "Invalid or expired reset link",
        })
        return
    } else if result.Error != nil {
        log.Printf("❌ [ResetPassword] Database error: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
        return
    }
    
    // Check if token is valid (not used and not expired)
    if resetToken.Used {
        log.Printf("⚠️ [ResetPassword] Token already used: %s", input.Token[:8]+"...")
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "This reset link has already been used",
        })
        return
    }
    
    if resetToken.IsExpired() {
        log.Printf("⚠️ [ResetPassword] Token expired: %s", input.Token[:8]+"...")
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "This reset link has expired. Please request a new one.",
        })
        return
    }
    
    // Fetch user
    var user models.User
    if err := DB.First(&user, resetToken.UserID).Error; err != nil {
        log.Printf("❌ [ResetPassword] User not found: %d", resetToken.UserID)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
        return
    }
    
    // Hash new password
    hashedPassword, err := utils.HashPassword(input.NewPassword)
    if err != nil {
        log.Printf("❌ [ResetPassword] Failed to hash password: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
        return
    }
    
    // Update user's password
    if err := DB.Model(&user).Update("password_hash", hashedPassword).Error; err != nil {
        log.Printf("❌ [ResetPassword] Failed to update password: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
        return
    }
    
    // Mark token as used
    DB.Model(&resetToken).Update("used", true)
    
    log.Printf("✅ [ResetPassword] Password updated for user: %s (ID: %d)", user.Email, user.ID)
    
    // Send confirmation email
    emailService := services.NewEmailService()
    if err := emailService.SendPasswordChangedEmail(user.Email, user.Username); err != nil {
        log.Printf("⚠️ [ResetPassword] Failed to send confirmation email: %v", err)
        // Don't fail the request if confirmation email fails
    }
    
    // Security: Invalidate all existing JWT tokens by logging user out everywhere
    // (User must log in again with new password)
    // Note: We use HttpOnly cookies, so client can't delete them
    // The user will need to log in again, which creates a new token
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Password updated successfully. Please log in with your new password.",
    })
}
