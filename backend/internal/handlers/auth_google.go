package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

var nonAlphanumeric = regexp.MustCompile(`[^a-z0-9_]+`)

// generateUsername builds a clean username from a Google profile name, falling
// back to the email local-part. It appends a random 3-digit suffix until it
// finds a username that isn't already taken.
func generateUsername(db *gorm.DB, givenName, familyName, email string) string {
	base := strings.ToLower(strings.TrimSpace(givenName + "_" + familyName))
	if strings.TrimSpace(familyName) == "" {
		base = strings.ToLower(strings.TrimSpace(givenName))
	}
	if base == "" || base == "_" {
		// Fall back to the part before @ in the email
		base = strings.ToLower(strings.SplitN(email, "@", 2)[0])
	}
	base = nonAlphanumeric.ReplaceAllString(base, "_")
	base = strings.Trim(base, "_")
	if len(base) > 20 {
		base = base[:20]
	}
	if base == "" {
		base = "user"
	}

	candidate := base
	for {
		var count int64
		db.Model(&models.User{}).Where("username = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = fmt.Sprintf("%s_%03d", base, rand.Intn(900)+100)
	}
}

var googleOauthConfig = &oauth2.Config{
	ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
	ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
	RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
	Scopes: []string{
		"https://www.googleapis.com/auth/userinfo.email",
		"https://www.googleapis.com/auth/userinfo.profile",
	},
	Endpoint: google.Endpoint,
}

// GoogleUser represents the user data from Google
type GoogleUser struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
	Locale        string `json:"locale"`
}

// GoogleLoginHandler initiates the Google OAuth flow
func GoogleLoginHandler(c *gin.Context) {
	// Self-verifying signed state for CSRF protection — no cookie needed (see
	// utils.GenerateOAuthState for why: iOS Safari's ITP silently blocks the
	// cross-site cookie a cookie-based approach would depend on here).
	state, err := utils.GenerateOAuthState()
	if err != nil {
		log.Printf("❌ [GoogleLogin] Failed to generate OAuth state: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start Google login"})
		return
	}

	// Generate OAuth URL
	url := googleOauthConfig.AuthCodeURL(state, oauth2.AccessTypeOffline)

	c.JSON(http.StatusOK, gin.H{
		"url": url,
	})
}

// GoogleCallbackHandler handles the OAuth callback from Google
func GoogleCallbackHandler(c *gin.Context) {
	// Verify state to prevent CSRF — self-verifying, no cookie lookup (see
	// utils.GenerateOAuthState / GoogleLoginHandler for why).
	stateParam := c.Query("state")
	if stateParam == "" || !utils.ValidateOAuthState(stateParam) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired state parameter"})
		return
	}

	// Get authorization code
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Authorization code not found"})
		return
	}
	
	// Exchange code for token
	token, err := googleOauthConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("❌ [GoogleCallback] Token exchange failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to exchange token"})
		return
	}
	log.Printf("✅ [GoogleCallback] Token exchange successful")
	
	// Fetch user info from Google
	client := googleOauthConfig.Client(context.Background(), token)
	log.Printf("🔄 [GoogleCallback] Fetching user info from Google API...")
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		log.Printf("❌ [GoogleCallback] Failed to fetch user info: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user info"})
		return
	}
	defer resp.Body.Close()
	log.Printf("✅ [GoogleCallback] User info response status: %d", resp.StatusCode)
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ [GoogleCallback] Failed to read response body: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read user info"})
		return
	}
	
	var googleUser GoogleUser
	if err := json.Unmarshal(body, &googleUser); err != nil {
		log.Printf("❌ [GoogleCallback] Failed to parse user info. Body: %s, Error: %v", string(body), err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to parse user info"})
		return
	}
	log.Printf("✅ [GoogleCallback] User info parsed: email=%s, id=%s", googleUser.Email, googleUser.ID)
	
	// Find or create user (using global DB variable like other auth handlers)
	var user models.User
	result := DB.Where("email = ?", googleUser.Email).First(&user)
	isNewUser := result.Error == gorm.ErrRecordNotFound

	if isNewUser {
		// Create new user
		provider := "google"
		user = models.User{
			Username:        generateUsername(DB, googleUser.GivenName, googleUser.FamilyName, googleUser.Email),
			Email:           googleUser.Email,
			PasswordHash:    "", // No password for OAuth users
			AvatarURL:       googleUser.Picture,
			Role:            "user",
			OAuthProvider:   &provider,
			OAuthProviderID: &googleUser.ID,
			EmailVerified:   true, // Google verifies emails
		}
		
		if err := DB.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}
	} else if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	} else {
		// Update existing user's avatar if changed
		if user.AvatarURL != googleUser.Picture {
			DB.Model(&user).Update("avatar_url", googleUser.Picture)
		}
		
		// Link OAuth provider if not already set (enables password + OAuth login)
		if user.OAuthProvider == nil {
			provider := "google"
			DB.Model(&user).Updates(map[string]interface{}{
				"oauth_provider":    &provider,
				"oauth_provider_id": &googleUser.ID,
				"email_verified":    true,
			})
		}
	}
	
	// Generate JWT token
	jwtToken, err := utils.GenerateJWT(user.ID)
	if err != nil {
		log.Printf("❌ [GoogleCallback] Failed to generate JWT: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}
	
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "wewatch_token",
		Value:    jwtToken,
		Path:     "/",
		MaxAge:   3600, // 1h — matches access JWT TTL
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	})
	// The wewatch_refresh cookie set inside issueRefreshToken is subject to the
	// exact same iOS Safari third-party-cookie blocking as the old oauth_state
	// cookie above, so it can't be relied on alone — the plaintext refresh
	// token is also passed through the URL hash below (same delivery
	// mechanism already used for the access token) so GoogleAuthCallback.jsx
	// can store it directly in localStorage regardless of cookie support.
	refreshToken := issueRefreshToken(c, user.ID)
	log.Printf("✅ [GoogleCallback] JWT cookie set for user ID: %d", user.ID)

	// Redirect to frontend success page, passing tokens in URL hash so they can be stored in localStorage
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:5173"
	}

	redirectURL := fmt.Sprintf(
		"%s/auth/google/success#token=%s&refresh_token=%s&new_user=%t",
		frontendURL, url.QueryEscape(jwtToken), url.QueryEscape(refreshToken), isNewUser,
	)
	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}
