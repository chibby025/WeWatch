package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// tokenPurchaseRateLimiter enforces per-user limits on token purchases
type tokenPurchaseRateLimiter struct {
	mu       sync.RWMutex
	requests map[uint][]time.Time
}

var tokenPurchaseLimiter = &tokenPurchaseRateLimiter{
	requests: make(map[uint][]time.Time),
}

// RateLimitTokenPurchases limits token purchases to 10 per hour per user.
// IP-based limits are insufficient here because shared IPs (offices, NAT) would block
// legitimate users; user-level scoping is both fairer and harder to bypass.
func RateLimitTokenPurchases() gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDInterface, exists := c.Get("user_id")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			c.Abort()
			return
		}
		userID := userIDInterface.(uint)

		if !tokenPurchaseLimiter.allow(userID) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Too many purchase attempts. You can purchase tokens up to 10 times per hour.",
				"retry_after": 3600,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

func (rl *tokenPurchaseRateLimiter) allow(userID uint) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-1 * time.Hour)

	requests := rl.requests[userID]
	var recent []time.Time
	for _, t := range requests {
		if t.After(cutoff) {
			recent = append(recent, t)
		}
	}

	if len(recent) >= 10 {
		return false
	}

	rl.requests[userID] = append(recent, now)

	if len(rl.requests) > 1000 {
		rl.cleanup(cutoff)
	}

	return true
}

func (rl *tokenPurchaseRateLimiter) cleanup(cutoff time.Time) {
	for userID, requests := range rl.requests {
		var recent []time.Time
		for _, t := range requests {
			if t.After(cutoff) {
				recent = append(recent, t)
			}
		}
		if len(recent) == 0 {
			delete(rl.requests, userID)
		} else {
			rl.requests[userID] = recent
		}
	}
}
