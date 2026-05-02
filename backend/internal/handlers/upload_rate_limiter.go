// backend/internal/handlers/upload_rate_limiter.go
package handlers

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// UploadRateLimiter tracks file upload counts per user
type UploadRateLimiter struct {
	uploads         map[uint]*userUploads // Map of userID -> upload tracking
	seenUploadIDs   map[string]time.Time  // Track upload_id to avoid counting chunks multiple times
	mu              sync.RWMutex
	limit           int           // Maximum uploads allowed
	window          time.Duration // Time window for the limit
}

type userUploads struct {
	count     int
	firstSeen time.Time
}

// NewUploadRateLimiter creates a new file upload rate limiter middleware
// limit: maximum uploads allowed per user
// window: time window for the limit (e.g., 10 minutes)
func NewUploadRateLimiter(limit int, window time.Duration) gin.HandlerFunc {
	limiter := &UploadRateLimiter{
		uploads:       make(map[uint]*userUploads),
		seenUploadIDs: make(map[string]time.Time),
		limit:         limit,
		window:        window,
	}

	// Cleanup old entries every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			limiter.cleanup()
		}
	}()

	return func(c *gin.Context) {
		// Get authenticated user ID
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		userID := userIDInterface.(uint)

		// ✅ For chunked uploads, check upload_id to avoid counting each chunk
		isChunked := c.Query("chunked") == "true"
		uploadID := ""
		if isChunked {
			// Get upload_id from form (will be available after ParseMultipartForm)
			uploadID = c.PostForm("upload_id")
		}

		// Check if user is allowed to upload
		allowed, remaining, resetTime := limiter.allow(userID, uploadID)
		if !allowed {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":      "Upload rate limit exceeded. Please try again later.",
				"limit":      limiter.limit,
				"window":     limiter.window.String(),
				"reset_time": resetTime.Format(time.RFC3339),
			})
			c.Abort()
			return
		}

		// Set rate limit headers
		c.Header("X-RateLimit-Limit", string(rune(limiter.limit)))
		c.Header("X-RateLimit-Remaining", string(rune(remaining)))
		c.Header("X-RateLimit-Reset", resetTime.Format(time.RFC3339))

		c.Next()
	}
}

// allow checks if the user is allowed to upload
// uploadID: unique identifier for chunked uploads (empty for non-chunked)
// Returns: (allowed, remaining, resetTime)
func (u *UploadRateLimiter) allow(userID uint, uploadID string) (bool, int, time.Time) {
	u.mu.Lock()
	defer u.mu.Unlock()

	now := time.Now()

	// ✅ If this is a chunked upload with upload_id, check if we've seen it before
	if uploadID != "" {
		if _, exists := u.seenUploadIDs[uploadID]; exists {
			// Already counted this upload - allow it without incrementing
			// Just return current user's remaining quota
			if upload, userExists := u.uploads[userID]; userExists {
				if now.Sub(upload.firstSeen) <= u.window {
					remaining := u.limit - upload.count
					resetTime := upload.firstSeen.Add(u.window)
					return true, remaining, resetTime
				}
			}
			// Window expired or new user, but upload_id already counted
			return true, u.limit, now.Add(u.window)
		}

		// First time seeing this upload_id - will count it below
		u.seenUploadIDs[uploadID] = now
	}

	// Check if user exists in map
	upload, exists := u.uploads[userID]
	if !exists {
		// First upload from this user
		u.uploads[userID] = &userUploads{
			count:     1,
			firstSeen: now,
		}
		resetTime := now.Add(u.window)
		return true, u.limit - 1, resetTime
	}

	// Check if window has expired
	if now.Sub(upload.firstSeen) > u.window {
		// Reset the window
		upload.count = 1
		upload.firstSeen = now
		resetTime := now.Add(u.window)
		return true, u.limit - 1, resetTime
	}

	// Within window - check limit
	if upload.count >= u.limit {
		resetTime := upload.firstSeen.Add(u.window)
		return false, 0, resetTime
	}

	// Increment and allow
	upload.count++
	remaining := u.limit - upload.count
	resetTime := upload.firstSeen.Add(u.window)
	return true, remaining, resetTime
}

// cleanup removes old entries from the map
func (u *UploadRateLimiter) cleanup() {
	u.mu.Lock()
	defer u.mu.Unlock()

	now := time.Now()

	// Clean up old user upload tracking
	for userID, upload := range u.uploads {
		if now.Sub(upload.firstSeen) > u.window*2 {
			delete(u.uploads, userID)
		}
	}

	// ✅ Clean up old upload_id tracking (keep for 2x window to be safe)
	for uploadID, seenTime := range u.seenUploadIDs {
		if now.Sub(seenTime) > u.window*2 {
			delete(u.seenUploadIDs, uploadID)
		}
	}
}
