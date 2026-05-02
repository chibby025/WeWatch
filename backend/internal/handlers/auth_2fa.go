package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// Setup2FARequest represents the request to enable 2FA
type Setup2FARequest struct {
	Password string `json:"password" binding:"required"` // Verify password before enabling 2FA
}

// Verify2FARequest represents the 2FA code verification
type Verify2FARequest struct {
	Code string `json:"code" binding:"required,len=6"` // 6-digit TOTP code
}

// Login2FARequest extends LoginInput with 2FA code
type Login2FARequest struct {
	Email    string  `json:"email" binding:"required,email"`
	Password string  `json:"password" binding:"required"`
	TotpCode *string `json:"totp_code,omitempty"` // Optional: only required if 2FA enabled
}

// Setup2FAHandler generates TOTP secret and QR code for 2FA setup
// POST /api/auth/setup-2fa
func Setup2FAHandler(c *gin.Context) {
	// Get current user from context (authenticated)
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	if err := DB.First(&user, userID.(uint)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Verify password before enabling 2FA (security measure)
	var req Setup2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check password
	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		log.Printf("⚠️ Failed 2FA setup attempt for user %d: wrong password", user.ID)
		models.LogSecurityEvent(DB, &user.ID, models.EventUnauthorizedAccess, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "2fa_setup_wrong_password"}`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
		return
	}

	// Generate TOTP secret
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "WeWatch",
		AccountName: user.Email,
		Period:      30,                // 30 second validity
		SecretSize:  20,                // 160-bit secret
		Digits:      otp.DigitsSix,     // 6-digit code
		Algorithm:   otp.AlgorithmSHA1, // Google Authenticator compatible
	})
	if err != nil {
		log.Printf("❌ Error generating TOTP secret: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate 2FA secret"})
		return
	}

	// Generate backup codes (10 codes, 8 characters each)
	backupCodes := generateBackupCodes(10)
	backupCodesJSON, err := json.Marshal(backupCodes)
	if err != nil {
		log.Printf("❌ Error marshaling backup codes: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate backup codes"})
		return
	}

	// Save to database (not enabled yet until user confirms)
	secret := key.Secret()
	backupCodesStr := string(backupCodesJSON)
	user.TwoFactorSecret = &secret
	user.BackupCodes = &backupCodesStr
	user.TwoFactorEnabled = false // Will be enabled after verification

	if err := DB.Save(&user).Error; err != nil {
		log.Printf("❌ Error saving 2FA secret: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save 2FA setup"})
		return
	}

	log.Printf("✅ 2FA setup initiated for user %d (%s)", user.ID, user.Email)

	// Return QR code URL and backup codes
	c.JSON(http.StatusOK, gin.H{
		"message":       "Scan this QR code with Google Authenticator",
		"qr_code_url":   key.URL(),                    // otpauth://totp/...
		"secret":        key.Secret(),                 // Manual entry option
		"backup_codes":  backupCodes,                  // SHOW ONCE - user must save
		"instructions":  "Scan QR code, then verify with a code to enable 2FA",
	})
}

// Verify2FASetupHandler verifies TOTP code and enables 2FA
// POST /api/auth/verify-2fa-setup
func Verify2FASetupHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	if err := DB.First(&user, userID.(uint)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.TwoFactorSecret == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "2FA not set up. Call /setup-2fa first"})
		return
	}

	var req Verify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify TOTP code
	valid := totp.Validate(req.Code, *user.TwoFactorSecret)
	if !valid {
		log.Printf("❌ Invalid 2FA code during setup for user %d", user.ID)
		models.LogSecurityEvent(DB, &user.ID, "2fa_setup_failed", c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "invalid_code"}`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid 2FA code"})
		return
	}

	// Enable 2FA
	user.TwoFactorEnabled = true
	if err := DB.Save(&user).Error; err != nil {
		log.Printf("❌ Error enabling 2FA: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to enable 2FA"})
		return
	}

	log.Printf("✅ 2FA enabled successfully for user %d (%s)", user.ID, user.Email)
	models.LogSecurityEvent(DB, &user.ID, "2fa_enabled", c.ClientIP(), c.GetHeader("User-Agent"), `{"status": "success"}`)

	c.JSON(http.StatusOK, gin.H{
		"message": "2FA enabled successfully! You will need your authenticator app to login from now on.",
		"enabled": true,
	})
}

// Disable2FAHandler disables 2FA (requires password + current TOTP code)
// POST /api/auth/disable-2fa
func Disable2FAHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var user models.User
	if err := DB.First(&user, userID.(uint)).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if !user.TwoFactorEnabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": "2FA is not enabled"})
		return
	}

	var req struct {
		Password string `json:"password" binding:"required"`
		Code     string `json:"code" binding:"required,len=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify password
	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		log.Printf("⚠️ Failed 2FA disable attempt for user %d: wrong password", user.ID)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid password"})
		return
	}

	// Verify TOTP code
	if user.TwoFactorSecret != nil {
		valid := totp.Validate(req.Code, *user.TwoFactorSecret)
		if !valid {
			log.Printf("❌ Invalid 2FA code during disable for user %d", user.ID)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid 2FA code"})
			return
		}
	}

	// Disable 2FA
	user.TwoFactorEnabled = false
	user.TwoFactorSecret = nil
	user.BackupCodes = nil

	if err := DB.Save(&user).Error; err != nil {
		log.Printf("❌ Error disabling 2FA: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to disable 2FA"})
		return
	}

	log.Printf("⚠️ 2FA disabled for user %d (%s)", user.ID, user.Email)
	models.LogSecurityEvent(DB, &user.ID, "2fa_disabled", c.ClientIP(), c.GetHeader("User-Agent"), `{"status": "success"}`)

	c.JSON(http.StatusOK, gin.H{
		"message": "2FA disabled successfully",
		"enabled": false,
	})
}

// Login2FAHandler replaces LoginHandler with 2FA support
// POST /api/auth/login (enhanced version)
func Login2FAHandler(c *gin.Context) {
	var input Login2FARequest
	if err := c.ShouldBindJSON(&input); err != nil {
		log.Printf("Error binding login input: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	result := DB.Where("email = ?", input.Email).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Log failed login attempt (user not found)
			models.LogSecurityEvent(DB, nil, models.EventFailedLogin, c.ClientIP(), c.GetHeader("User-Agent"), fmt.Sprintf(`{"email": "%s", "reason": "user_not_found"}`, input.Email))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
			return
		} else {
			log.Printf("Database error finding user for login: %v", result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
			return
		}
	}

	// Check password
	if !utils.CheckPasswordHash(input.Password, user.PasswordHash) {
		// Log failed login attempt (wrong password)
		userID := user.ID
		models.LogSecurityEvent(DB, &userID, models.EventFailedLogin, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "wrong_password"}`)
		
		// Check for brute force
		if models.DetectBruteForce(DB, user.ID) {
			models.LogSecurityEvent(DB, &userID, models.EventAccountLocked, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "brute_force_detected"}`)
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Account temporarily locked due to multiple failed attempts. Try again in 15 minutes."})
			return
		}
		
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}

	// ✅ P0 SECURITY FIX: Check if 2FA is required
	if user.TwoFactorEnabled {
		if input.TotpCode == nil || *input.TotpCode == "" {
			// 2FA required but not provided - tell client to ask for it
			log.Printf("⚠️ 2FA required for user %d but code not provided", user.ID)
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":         "2FA code required",
				"requires_2fa":  true,
				"message":       "Please enter your 6-digit code from Google Authenticator",
			})
			return
		}

		// Verify TOTP code
		if user.TwoFactorSecret == nil {
			log.Printf("❌ 2FA enabled but no secret for user %d", user.ID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "2FA configuration error"})
			return
		}

		valid := totp.Validate(*input.TotpCode, *user.TwoFactorSecret)
		
		// If TOTP fails, check backup codes
		if !valid {
			valid = checkAndConsumeBackupCode(DB, &user, *input.TotpCode)
		}

		if !valid {
			log.Printf("❌ Invalid 2FA code for user %d", user.ID)
			userID := user.ID
			models.LogSecurityEvent(DB, &userID, models.Event2FAFailed, c.ClientIP(), c.GetHeader("User-Agent"), `{"reason": "invalid_code"}`)
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid 2FA code"})
			return
		}

		log.Printf("✅ 2FA verification successful for user %d", user.ID)
	}

	// Generate JWT token
	tokenString, err := utils.GenerateJWT(user.ID)
	if err != nil {
		log.Printf("Error generating JWT: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Set HTTP-only cookie
	cookie := &http.Cookie{
		Name:     "wewatch_token",
		Value:    tokenString,
		Path:     "/",
		MaxAge:   7 * 24 * 60 * 60, // 7 days
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteNoneMode,
	}
	http.SetCookie(c.Writer, cookie)

	// Track login IP for security monitoring
	clientIP := c.ClientIP()
	if user.LastLoginIP != nil && *user.LastLoginIP != clientIP {
		// IP changed - log security event
		models.LogSecurityEvent(DB, &user.ID, models.EventIPChange, clientIP, c.GetHeader("User-Agent"), 
			fmt.Sprintf(`{"old_ip": "%s", "new_ip": "%s"}`, *user.LastLoginIP, clientIP))
		log.Printf("⚠️ IP change detected for user %d: %s → %s", user.ID, *user.LastLoginIP, clientIP)
	}
	user.LastLoginIP = &clientIP
	DB.Save(&user)

	log.Printf("✅ User logged in successfully: ID=%d, Username=%s, 2FA=%v", user.ID, user.Username, user.TwoFactorEnabled)
	models.LogSecurityEvent(DB, &user.ID, models.EventSuccessfulLogin, clientIP, c.GetHeader("User-Agent"), `{"2fa_used": true}`)

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"user": gin.H{
			"id":               user.ID,
			"username":         user.Username,
			"email":            user.Email,
			"two_factor_enabled": user.TwoFactorEnabled,
		},
	})
}

// generateBackupCodes creates random backup codes for 2FA recovery
func generateBackupCodes(count int) []string {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		// Generate 8-character random code
		bytes := make([]byte, 6)
		rand.Read(bytes)
		codes[i] = base64.RawURLEncoding.EncodeToString(bytes)[:8]
	}
	return codes
}

// checkAndConsumeBackupCode validates and removes a backup code if valid
func checkAndConsumeBackupCode(db *gorm.DB, user *models.User, code string) bool {
	if user.BackupCodes == nil || *user.BackupCodes == "" {
		return false
	}

	var backupCodes []string
	if err := json.Unmarshal([]byte(*user.BackupCodes), &backupCodes); err != nil {
		log.Printf("❌ Error unmarshaling backup codes: %v", err)
		return false
	}

	// Check if code exists
	found := false
	newCodes := []string{}
	for _, bc := range backupCodes {
		if bc == code {
			found = true
			log.Printf("✅ Backup code used for user %d", user.ID)
			// Don't add to newCodes (consume it)
		} else {
			newCodes = append(newCodes, bc)
		}
	}

	if !found {
		return false
	}

	// Save updated backup codes (without the used one)
	newCodesJSON, _ := json.Marshal(newCodes)
	newCodesStr := string(newCodesJSON)
	user.BackupCodes = &newCodesStr
	db.Save(user)

	// Log backup code usage
	models.LogSecurityEvent(db, &user.ID, "backup_code_used", "", "", fmt.Sprintf(`{"remaining_codes": %d}`, len(newCodes)))

	return true
}
