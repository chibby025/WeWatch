package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter implements a simple in-memory rate limiter
type RateLimiter struct {
	requests map[string][]time.Time
	mu       sync.Mutex
	limit    int           // Max requests allowed
	window   time.Duration // Time window for rate limiting
}

// NewRateLimiter creates a new rate limiter
// limit: maximum number of requests
// window: time window (e.g., 1 minute)
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	limiter := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	
	// Cleanup old entries every minute
	go limiter.cleanupRoutine()
	
	return limiter
}

// Middleware returns a Gin middleware function for rate limiting
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Use IP address as identifier
		clientIP := c.ClientIP()
		
		rl.mu.Lock()
		defer rl.mu.Unlock()
		
		now := time.Now()
		cutoff := now.Add(-rl.window)
		
		// Get request history for this IP
		requests, exists := rl.requests[clientIP]
		if !exists {
			requests = []time.Time{}
		}
		
		// Filter out requests outside the time window
		validRequests := []time.Time{}
		for _, reqTime := range requests {
			if reqTime.After(cutoff) {
				validRequests = append(validRequests, reqTime)
			}
		}
		
		// Check if limit exceeded
		if len(validRequests) >= rl.limit {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}
		
		// Add current request
		validRequests = append(validRequests, now)
		rl.requests[clientIP] = validRequests
		
		c.Next()
	}
}

// cleanupRoutine removes old entries to prevent memory leak
func (rl *RateLimiter) cleanupRoutine() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	
	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-rl.window * 2) // Keep 2x window for safety
		
		for ip, requests := range rl.requests {
			validRequests := []time.Time{}
			for _, reqTime := range requests {
				if reqTime.After(cutoff) {
					validRequests = append(validRequests, reqTime)
				}
			}
			
			if len(validRequests) == 0 {
				delete(rl.requests, ip)
			} else {
				rl.requests[ip] = validRequests
			}
		}
		rl.mu.Unlock()
	}
}
