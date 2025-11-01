// backend/internal/handlers/auth.go
package handlers

import (
    "log"
    "net/http"
    "wewatch-backend/internal/models"
    "wewatch-backend/internal/utils"

    "github.com/gin-gonic/gin"
    "gorm.io/gorm"
)

// Global DB variable - assumes it's initialized in main.go
// In a more complex app, you might pass it as a dependency.
var DB *gorm.DB // This will be set from main.go

// RegisterInput defines the expected structure of the request body for registration.
type RegisterInput struct {
    Username string `json:"username" binding:"required,min=3,max=50"`
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=6"`
}

// LoginInput defines the expected structure of the request body for login.
type LoginInput struct {
    Email    string `json:"email" binding:"required,email"` // Can also allow username
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

    // Create the new user instance
    newUser := models.User{
        Username:     input.Username,
        Email:        input.Email,
        PasswordHash: hashedPassword,
    }

    // Save the user to the database
    result = DB.Create(&newUser)
    if result.Error != nil {
        log.Printf("Error creating user in database: %v", result.Error)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
        return
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
    result := DB.Where("email = ?", input.Email).First(&user)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
            return
        } else {
            log.Printf("Database error finding user for login: %v", result.Error)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }

    if !utils.CheckPasswordHash(input.Password, user.PasswordHash) {
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
        Secure:   false, // Set to true in production with HTTPS
        SameSite: http.SameSiteLaxMode,
    }
    http.SetCookie(c.Writer, cookie)

    log.Printf("User logged in successfully: ID=%d, Username=%s", user.ID, user.Username)

    // ✅ DO NOT send token in response body
    c.JSON(http.StatusOK, gin.H{
        "message": "Login successful",
        "user": gin.H{
            "id":       user.ID,
            "username": user.Username,
            "email":    user.Email,
        },
    })
}

// Handle user logout
func LogoutHandler(c *gin.Context) {
    // Clear the cookie
    cookie := &http.Cookie{
        Name:     "wewatch_token",
        Value:    "",
        Path:     "/",
        MaxAge:   -1, // Expire immediately
        HttpOnly: true,
        Secure:   false,
        SameSite: http.SameSiteLaxMode,
    }
    http.SetCookie(c.Writer, cookie)

    c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

// CookieToAuthHeaderMiddleware converts wewatch_token cookie to Authorization header
func CookieToAuthHeaderMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get token from cookie
		token, err := c.Cookie("wewatch_token")
		if err == nil && token != "" {
			// Inject into Authorization header
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

    // ✅ DEV-ONLY: Include token for WebSocket (remove before production)
    token, _ := c.Cookie("wewatch_token")
    response := gin.H{
        "user": gin.H{
            "id":        user.ID,
            "username":  user.Username,
            "email":     user.Email,
            "created_at": user.CreatedAt,
        },
    }
    if token != "" {
        response["ws_token"] = token // Only for WebSocket setup in dev
    }

    log.Printf("Fetched current user details: ID=%d, Username=%s", user.ID, user.Username)
    c.JSON(http.StatusOK, response)
}

// Profile Handler
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
    var req struct {
        AvatarURL string `json:"avatar_url" binding:"required,url"`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": "Invalid request"})
        return
    }
    // ✅ FIXED: Added missing ) after &models.User{}
    // ✅ FIXED: Removed extra . after req.AvatarURL
    DB.Model(&models.User{}).Where("id = ?", userID).Updates(models.User{
        AvatarURL: req.AvatarURL, // ← No dot here
    })
    c.JSON(200, gin.H{"message": "Profile updated"})
}


// AuthMiddleware is a Gin middleware function to protect routes.
// It checks for a valid JWT Bearer token in the Authorization header or query parameter (for WebSockets).
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
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