// backend/internal/handlers/rate_limiter.go
package handlers

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter tracks request counts per IP address
type RateLimiter struct {
	requests map[string]*ipRequests
	mu       sync.RWMutex
	limit    int
	window   time.Duration
}

type ipRequests struct {
	count     int
	firstSeen time.Time
}

// NewRateLimiter creates a new rate limiter middleware
// limit: maximum requests allowed
// window: time window for the limit (e.g., 1 minute)
func NewRateLimiter(limit int, window time.Duration) gin.HandlerFunc {
	limiter := &RateLimiter{
		requests: make(map[string]*ipRequests),
		limit:    limit,
		window:   window,
	}

	// Cleanup old entries every minute
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			limiter.cleanup()
		}
	}()

	return func(c *gin.Context) {
		ip := c.ClientIP()

		if !limiter.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many requests. Please try again later.",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// allow checks if the IP is allowed to make a request
func (r *RateLimiter) allow(ip string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()

	// Check if IP exists in map
	req, exists := r.requests[ip]
	if !exists {
		// First request from this IP
		r.requests[ip] = &ipRequests{
			count:     1,
			firstSeen: now,
		}
		return true
	}

	// Check if window has expired
	if now.Sub(req.firstSeen) > r.window {
		// Reset the window
		req.count = 1
		req.firstSeen = now
		return true
	}

	// Within window - check limit
	if req.count >= r.limit {
		return false
	}

	// Increment and allow
	req.count++
	return true
}

// cleanup removes old entries from the map
func (r *RateLimiter) cleanup() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	for ip, req := range r.requests {
		if now.Sub(req.firstSeen) > r.window*2 {
			delete(r.requests, ip)
		}
	}
}
