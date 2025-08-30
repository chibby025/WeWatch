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
    // Bind the incoming JSON request body to the LoginInput struct.
    var input LoginInput
    if err := c.ShouldBindJSON(&input); err != nil {
        log.Printf("Error binding login input: %v", err)
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    // Find the user by email
    var user models.User
    result := DB.Where("email = ?", input.Email).First(&user)
    if result.Error != nil {
        if result.Error == gorm.ErrRecordNotFound {
            // User not found
            log.Printf("Login failed: User with email '%s' not found", input.Email)
            // Security best practice: Don't reveal if email exists.
            // Generic error message.
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
            return
        } else {
            // Database error
            log.Printf("Database error finding user for login: %v", result.Error)
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
            return
        }
    }

    // User found, now check the password
    if !utils.CheckPasswordHash(input.Password, user.PasswordHash) {
        // Password doesn't match
        log.Printf("Login failed: Incorrect password for user ID %d", user.ID)
        // Again, generic error message for security.
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        return
    }

    // Password is correct. Login successful!

    // Generate a JWT token for the logged-in user
    tokenString, err := utils.GenerateJWT(user.ID)
    if err != nil {
        log.Printf("Error generating JWT for logged-in user: %v", err)
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
        return
    }

    log.Printf("User logged in successfully: ID=%d, Username=%s", user.ID, user.Username)

    // Respond with success and the token.
    c.JSON(http.StatusOK, gin.H{
        "message": "Login successful",
        "user": gin.H{ // Return simplified user info
            "id":       user.ID,
            "username": user.Username,
            "email":    user.Email,
        },
        "token": tokenString,
    })
}

// GetCurrentUserHandler handles the GET /api/auth/me endpoint.
// This requires authentication, so it should be protected by a middleware.
// For now, we'll assume a middleware sets the user ID in the context.
func GetCurrentUserHandler(c *gin.Context) {
    // This assumes an auth middleware has run and set the user ID in the context.
    // The key used by the middleware to store the user ID must match here.
    userID, exists := c.Get("user_id") // Key must match middleware
    if !exists {
        log.Println("Unauthorized access to /api/auth/me: user_id not found in context")
        c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
        return
    }

    // Assert the type of userID (it should be uint)
    id, ok := userID.(uint)
    if !ok {
        log.Println("Error: user_id in context is not uint")
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Server error"})
        return
    }

    // Fetch the user details from the database using the ID from the token/context
    var user models.User
    result := DB.First(&user, id) // Find user by primary key (ID)
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

    // User found, return user details (excluding password hash)
    log.Printf("Fetched current user details: ID=%d, Username=%s", user.ID, user.Username)
    c.JSON(http.StatusOK, gin.H{
        "user": gin.H{
            "id":        user.ID,
            "username":  user.Username,
            "email":     user.Email,
            "created_at": user.CreatedAt, // You can include other non-sensitive fields
            // Don't include PasswordHash or DeletedAt unless needed
        },
    })
}



// AuthMiddleware is a Gin middleware function to protect routes.
// It checks for a valid JWT Bearer token in the Authorization header or query parameter (for WebSockets).
func AuthMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // --- GET THE JWT TOKEN ---

        // 1. Try to get the token from the Authorization header (standard for HTTP requests)
        authHeader := c.GetHeader("Authorization")
        tokenString := ""

        if authHeader != "" {
            // Check if it starts with "Bearer "
            const bearerPrefix = "Bearer "
            if len(authHeader) > len(bearerPrefix) && authHeader[:len(bearerPrefix)] == bearerPrefix {
                // Extract the token string (remove "Bearer " prefix)
                tokenString = authHeader[len(bearerPrefix):]
                log.Printf("AuthMiddleware: Token found in Authorization header")
            } else {
                // --- FIX 1: Accurate Log Message ---
                log.Println("AuthMiddleware: Authorization header format invalid") // <-- BETTER LOG
                c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
                c.Abort()
                return
            }
        }

        // 2. --- NEW: If no token in header, try to get it from query parameter ---
        // This is primarily for WebSocket connections where custom headers are hard to send.
        // Check if it's a WebSocket upgrade request (GET method and Upgrade header)
        // Only proceed if tokenString is still empty after header check
        if tokenString == "" && c.Request.Method == "GET" && c.GetHeader("Upgrade") == "websocket" {
            // Try to get the token from the 'token' query parameter
            queryToken := c.Query("token") // Get the 'token' query parameter
            if queryToken != "" {
                tokenString = queryToken
                log.Printf("AuthMiddleware: Token found in query parameter for WebSocket request")
            } else {
                // --- FIX 2: More Specific Log Message ---
                log.Println("AuthMiddleware: No token found in 'token' query parameter for WebSocket request") // <-- MORE SPECIFIC LOG
            }
        }
        // --- --- ---

        // 3. If no token was found in either header or query parameter, return 401
        if tokenString == "" {
            log.Println("AuthMiddleware: Authorization header or query parameter required")
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header or query parameter required"})
            c.Abort()
            return
        }

        // 4. --- VALIDATE THE JWT TOKEN ---
        // Validate the token using the utility function (from utils/jwt.go)
        userID, err := utils.ValidateJWT(tokenString)
        if err != nil {
            log.Printf("AuthMiddleware: Token validation failed: %v", err)
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
            c.Abort()
            return
        }

        // 5. Token is valid. Store the user ID in the context for the next handler to use.
        c.Set("user_id", userID) // Set user ID in Gin context

        // 6. Continue to the next handler/middleware in the chain
        c.Next()
    }
}