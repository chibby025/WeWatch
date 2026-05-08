package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// Rate limiter for withdrawal requests
type withdrawalRateLimiter struct {
	mu       sync.RWMutex
	requests map[uint][]time.Time // userID -> timestamps of requests
}

var withdrawalLimiter = &withdrawalRateLimiter{
	requests: make(map[uint][]time.Time),
}

// RateLimitWithdrawals limits withdrawal requests to prevent spam/abuse
// Allows 5 withdrawal requests per hour per user
func RateLimitWithdrawals() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get user ID from context (set by AuthMiddleware)
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		userID := userIDInterface.(uint)

		// Check rate limit
		if !withdrawalLimiter.allowRequest(userID) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many withdrawal requests. You can request up to 5 withdrawals per hour. Please try again later.",
				"retry_after": 3600, // 1 hour in seconds
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// allowRequest checks if user can make another withdrawal request
func (rl *withdrawalRateLimiter) allowRequest(userID uint) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour)

	// Get user's request history
	requests, exists := rl.requests[userID]
	if !exists {
		requests = []time.Time{}
	}

	// Filter out requests older than 1 hour
	var recentRequests []time.Time
	for _, reqTime := range requests {
		if reqTime.After(oneHourAgo) {
			recentRequests = append(recentRequests, reqTime)
		}
	}

	// Check if under limit (5 requests per hour)
	if len(recentRequests) >= 5 {
		return false
	}

	// Add current request
	recentRequests = append(recentRequests, now)
	rl.requests[userID] = recentRequests

	// Cleanup old entries periodically (every 1000 requests)
	if len(rl.requests) > 1000 {
		rl.cleanup(oneHourAgo)
	}

	return true
}

// cleanup removes old request history to prevent memory leak
func (rl *withdrawalRateLimiter) cleanup(cutoff time.Time) {
	for userID, requests := range rl.requests {
		var recentRequests []time.Time
		for _, reqTime := range requests {
			if reqTime.After(cutoff) {
				recentRequests = append(recentRequests, reqTime)
			}
		}
		
		if len(recentRequests) == 0 {
			delete(rl.requests, userID)
		} else {
			rl.requests[userID] = recentRequests
		}
	}
}
