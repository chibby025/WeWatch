# 🔐 Super Admin Security Hardening Guide
**Priority: CRITICAL** | **Date: April 25, 2026**

---

## ⚠️ CURRENT RISK ASSESSMENT

### Super Admin Attack Surface
| Vulnerability | Risk Level | Status | Action Required |
|--------------|-----------|--------|-----------------|
| **No 2FA** | 🔴 CRITICAL | Open | **IMPLEMENT NOW** |
| **No IP Whitelisting** | 🟠 HIGH | Open | Priority 2 |
| **24-hour JWT tokens** | 🟡 MEDIUM | Open | Priority 3 |
| **SQL Injection** | ✅ LOW | **PROTECTED** | GORM parameterized queries |
| **Password Security** | ✅ LOW | **PROTECTED** | Bcrypt hashing |
| **Token Blacklist** | ✅ LOW | **PROTECTED** | Logout invalidates tokens |

**Current Security Score**: 6/10 (After P0 fixes)  
**Target Security Score**: 9/10 (After 2FA + IP whitelist)

---

## 🎯 PRIORITY 1: IMPLEMENT 2FA (DO THIS FIRST)

### Why 2FA is Critical for Super Admin
- **Single Point of Failure**: Password alone = complete system access
- **Phishing Protection**: Even if password is stolen, attacker needs physical device
- **Compliance**: Many security standards (PCI-DSS, SOC 2) require 2FA for admin accounts
- **Audit Trail**: Logs when 2FA is used/bypassed

### Implementation Status
✅ **Database fields added** (already done)  
✅ **Security event logging ready** (already done)  
✅ **2FA handlers created** (`auth_2fa.go`)  
✅ **Routes registered** (`/api/auth/setup-2fa`, `/verify-2fa-setup`, `/disable-2fa`)  
⚠️ **Needs**: Go dependencies + frontend QR code display

### Quick Setup (5 minutes)

#### Step 1: Install TOTP Library
```bash
cd /home/chibuzor_dev/WeWatch/backend
go get github.com/pquerna/otp@v1.4.0
go get github.com/pquerna/otp/totp@v1.4.0
```

#### Step 2: Fix Import Issues in auth_2fa.go
The file references `CheckPasswordHash` and `GenerateJWT` - these need to be imported from your existing auth.go:

```go
// In auth_2fa.go, replace the placeholder functions at the bottom with:
import (
    "wewatch-backend/internal/utils"
)

func CheckPasswordHash(password, hash string) bool {
    return utils.CheckPasswordHash(password, hash)
}

func GenerateJWT(userID uint) (string, error) {
    return utils.GenerateJWT(userID)
}
```

#### Step 3: Compile Backend
```bash
cd /home/chibuzor_dev/WeWatch/backend
go build -o bin/server cmd/server/main.go
```

#### Step 4: Test 2FA Setup (Using curl)
```bash
# 1. Login as super admin
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "chibi@gmail.com", "password": "Chibby123"}' \
  -c cookies.txt

# 2. Setup 2FA (requires password verification)
curl -X POST http://localhost:8080/api/auth/setup-2fa \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"password": "Chibby123"}'

# Response will include:
# - "qr_code_url": "otpauth://totp/WeWatch:chibi@gmail.com?secret=ABC123..."
# - "backup_codes": ["XXXXXXXX", "YYYYYYYY", ...] (SAVE THESE!)
```

#### Step 5: Frontend Integration (React/Next.js)
```jsx
// Component to display QR code
import QRCode from 'react-qr-code';

function Setup2FA() {
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);

  const handleSetup = async () => {
    const response = await fetch('/api/auth/setup-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: userPassword }),
      credentials: 'include'
    });
    
    const data = await response.json();
    setQrCodeUrl(data.qr_code_url);
    setBackupCodes(data.backup_codes);
  };

  return (
    <div>
      <h2>Enable Two-Factor Authentication</h2>
      {qrCodeUrl && (
        <>
          <QRCode value={qrCodeUrl} />
          <p>Scan with Google Authenticator</p>
          
          <div style={{ background: '#fef3cd', padding: '10px' }}>
            <strong>⚠️ SAVE THESE BACKUP CODES:</strong>
            <ul>
              {backupCodes.map(code => <li key={code}>{code}</li>)}
            </ul>
          </div>
          
          <input 
            placeholder="Enter 6-digit code to verify" 
            onChange={(e) => verifyCode(e.target.value)} 
          />
        </>
      )}
    </div>
  );
}
```

### 2FA Login Flow

**Before 2FA (Current)**:
```
User → Email + Password → JWT Token → Access Granted
```

**After 2FA (Enhanced)**:
```
User → Email + Password → Check if 2FA enabled
                         ↓
                   [2FA Enabled?]
                   ↓            ↓
                 YES           NO
                   ↓            ↓
         Require TOTP Code   JWT Token
                   ↓
         Verify with Google Auth
                   ↓
           JWT Token → Access Granted
```

### Security Benefits
- **Phishing Resistant**: Attacker needs physical device
- **Time-Limited Codes**: TOTP codes expire every 30 seconds
- **Backup Codes**: 10 one-time codes for account recovery
- **Audit Logging**: All 2FA events logged to `security_events` table

---

## 🎯 PRIORITY 2: IP WHITELISTING FOR SUPER ADMIN

### Why IP Whitelisting Matters
- **Geographic Restriction**: Limit access to known locations
- **Stolen Credential Protection**: Even with correct password, wrong IP = blocked
- **Reduced Attack Surface**: 99.9% of login attempts come from wrong IPs

### Implementation Options

#### Option A: IP Whitelist Middleware (Recommended)
```go
// backend/internal/middleware/ip_whitelist.go
package middleware

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
)

var SuperAdminAllowedIPs = []string{
    "YOUR_HOME_IP",      // Your home internet IP
    "YOUR_OFFICE_IP",    // Your office IP
    "102.89.0.0/16",     // Nigeria MTN range (if needed)
    // Add more as needed
}

func SuperAdminIPWhitelist() gin.HandlerFunc {
    return func(c *gin.Context) {
        // Only apply to super admin role
        userRole, exists := c.Get("user_role")
        if !exists || userRole != "super_admin" {
            c.Next()
            return
        }

        clientIP := c.ClientIP()
        
        // Check if IP is in whitelist
        allowed := false
        for _, allowedIP := range SuperAdminAllowedIPs {
            if strings.HasPrefix(clientIP, allowedIP) || 
               cidrContains(allowedIP, clientIP) {
                allowed = true
                break
            }
        }

        if !allowed {
            log.Printf("🚫 Super admin login blocked from unauthorized IP: %s", clientIP)
            models.LogSecurityEvent(DB, nil, "super_admin_ip_blocked", clientIP, c.GetHeader("User-Agent"), "")
            c.JSON(http.StatusForbidden, gin.H{
                "error": "Access denied from this location",
            })
            c.Abort()
            return
        }

        c.Next()
    }
}
```

**Apply to Login Endpoint**:
```go
// In main.go
r.POST("/api/auth/login", authLimiter, middleware.SuperAdminIPWhitelist(), handlers.LoginHandler)
```

#### Option B: Database-Stored Whitelist (More Flexible)
```sql
-- Add table for IP whitelists
CREATE TABLE ip_whitelists (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    ip_address VARCHAR(45) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert your IPs
INSERT INTO ip_whitelists (user_id, ip_address, description) 
VALUES (1, 'YOUR_HOME_IP', 'Home internet');
```

Then check database in middleware instead of hardcoded list.

#### Option C: VPN Requirement
- Use a private VPN (WireGuard/Tailscale)
- Only allow super admin login through VPN IP range
- Most secure option but requires VPN setup

### How to Find Your IP
```bash
# Your current public IP
curl ifconfig.me

# Your server can see this in logs
grep "User logged in successfully" /tmp/wewatch-server.log
```

---

## 🎯 PRIORITY 3: SESSION TIMEOUT & TOKEN HARDENING

### Current Token Behavior
```go
// JWT token valid for 24 hours (even if inactive)
expirationTime := time.Now().Add(24 * time.Hour)
```

### Problems
1. **Long Validity**: Stolen token works for 24 hours
2. **No Inactivity Logout**: User forgets to logout → token still valid
3. **No Device Tracking**: Can't see where super admin is logged in

### Recommended Improvements

#### 1. Shorter Token Expiry for Super Admin
```go
// In utils/jwt.go - modify GenerateJWT()
func GenerateJWT(userID uint) (string, error) {
    user, _ := GetUser(userID) // Fetch user to check role
    
    var expirationTime time.Time
    if user.Role == "super_admin" {
        expirationTime = time.Now().Add(2 * time.Hour) // 2 hours only
    } else {
        expirationTime = time.Now().Add(24 * time.Hour) // 24 hours for regular users
    }
    
    // ... rest of JWT generation
}
```

#### 2. Session Activity Tracking
```go
// Add to User model
type User struct {
    // ... existing fields
    LastActivity *time.Time `json:"last_activity"`
}

// Middleware to track activity
func UpdateLastActivity() gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, exists := c.Get("user_id")
        if exists {
            now := time.Now()
            DB.Model(&models.User{}).Where("id = ?", userID).Update("last_activity", now)
        }
        c.Next()
    }
}

// Check for inactivity (30 min timeout)
func CheckInactivityTimeout() gin.HandlerFunc {
    return func(c *gin.Context) {
        userID, _ := c.Get("user_id")
        var user models.User
        DB.First(&user, userID)
        
        if user.LastActivity != nil {
            inactiveDuration := time.Since(*user.LastActivity)
            if inactiveDuration > 30*time.Minute {
                c.JSON(http.StatusUnauthorized, gin.H{"error": "Session expired due to inactivity"})
                c.Abort()
                return
            }
        }
        c.Next()
    }
}
```

#### 3. Active Session Management
```go
// New table: active_sessions
type ActiveSession struct {
    ID        uint
    UserID    uint
    Token     string `gorm:"uniqueIndex"`
    IPAddress string
    UserAgent string
    CreatedAt time.Time
    LastSeen  time.Time
}

// Endpoint: GET /api/auth/sessions (see all active sessions)
// Endpoint: DELETE /api/auth/sessions/:id (revoke specific session)
```

---

## 🎯 PRIORITY 4: DATABASE SECURITY

### ✅ Current Protection (You're Already Safe!)

#### SQL Injection Protection
**Status**: ✅ **FULLY PROTECTED**

Your entire codebase uses GORM with parameterized queries:
```go
// ✅ SAFE - All your queries look like this
db.Where("email = ?", userInput).First(&user)
db.Where("id = ? AND role = ?", userId, role).First(&user)

// ❌ DANGEROUS - You have ZERO instances of this
db.Raw("SELECT * FROM users WHERE email = '" + userInput + "'")
```

**Verification Command**:
```bash
# Check for dangerous patterns (should return 0 results)
cd /home/chibuzor_dev/WeWatch/backend
grep -r "Raw.*SELECT.*+\|Exec.*INSERT.*+" internal/
```

#### Database Access Control
**Current Setup**:
```env
DB_HOST=localhost  # ✅ Not exposed to internet
DB_USER=postgres   # ⚠️ Using superuser role
DB_PASSWORD=Chibby # ✅ Password protected
```

### Recommended Improvements

#### 1. Principle of Least Privilege
Create a dedicated database user with minimal permissions:

```sql
-- Connect as postgres superuser
psql -U postgres

-- Create app-specific user
CREATE USER wewatch_app WITH PASSWORD 'STRONG_PASSWORD_HERE';

-- Grant only necessary permissions
GRANT CONNECT ON DATABASE wewatch_db TO wewatch_app;
GRANT USAGE ON SCHEMA public TO wewatch_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wewatch_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wewatch_app;

-- Revoke dangerous permissions
REVOKE CREATE ON SCHEMA public FROM wewatch_app;
REVOKE DROP ON ALL TABLES IN SCHEMA public FROM wewatch_app;
```

Update `.env`:
```env
DB_USER=wewatch_app
DB_PASSWORD=STRONG_PASSWORD_HERE
```

#### 2. Connection Encryption
Enable SSL for database connections:

```go
// In config/database.go
dsn := fmt.Sprintf(
    "host=%s user=%s password=%s dbname=%s port=%s sslmode=require",
    config.Host, config.User, config.Password, config.Database, config.Port,
)
```

#### 3. Query Logging for Auditing
```sql
-- Enable query logging
ALTER SYSTEM SET log_statement = 'mod'; -- Log INSERT/UPDATE/DELETE
ALTER SYSTEM SET log_duration = on;
SELECT pg_reload_conf();
```

#### 4. Database Firewall Rules
```bash
# In PostgreSQL pg_hba.conf, restrict connections
# Allow only from localhost
host    wewatch_db    wewatch_app    127.0.0.1/32    md5
host    wewatch_db    postgres       127.0.0.1/32    md5

# Reject all others
host    all           all            0.0.0.0/0       reject
```

---

## 🎯 PRIORITY 5: ADDITIONAL HARDENING MEASURES

### 1. Password Policy Enforcement
```go
// In handlers/auth.go - RegisterHandler
func ValidateStrongPassword(password string) error {
    if len(password) < 12 {
        return errors.New("password must be at least 12 characters")
    }
    
    hasUpper := regexp.MustCompile(`[A-Z]`).MatchString(password)
    hasLower := regexp.MustCompile(`[a-z]`).MatchString(password)
    hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)
    hasSpecial := regexp.MustCompile(`[!@#$%^&*]`).MatchString(password)
    
    if !(hasUpper && hasLower && hasNumber && hasSpecial) {
        return errors.New("password must contain uppercase, lowercase, number, and special character")
    }
    
    return nil
}
```

### 2. Force Password Change on First Login
```go
// Add to User model
type User struct {
    // ... existing
    MustChangePassword bool `json:"must_change_password" gorm:"default:false"`
}

// Check in AuthMiddleware
if user.MustChangePassword {
    c.JSON(http.StatusForbidden, gin.H{
        "error": "You must change your password",
        "redirect_to": "/change-password",
    })
    c.Abort()
    return
}
```

### 3. Email Notifications for Security Events
```go
// Send email on critical events
func NotifySuperAdminSecurityEvent(event string, details string) {
    // When super admin logs in from new IP
    // When 2FA is disabled
    // When password is changed
    // When failed login attempts detected
    
    SendEmail(
        to: "chibi@gmail.com",
        subject: "🚨 WeWatch Security Alert",
        body: fmt.Sprintf("Event: %s\nDetails: %s", event, details),
    )
}
```

### 4. Regular Security Audits
```sql
-- Query to check recent super admin activity
SELECT 
    event_type, 
    ip_address, 
    timestamp, 
    metadata 
FROM security_events 
WHERE user_id = (SELECT id FROM users WHERE role = 'super_admin')
ORDER BY timestamp DESC 
LIMIT 50;

-- Check failed login attempts
SELECT 
    ip_address, 
    COUNT(*) as attempts,
    MAX(timestamp) as last_attempt
FROM security_events 
WHERE event_type = 'failed_login'
GROUP BY ip_address 
HAVING COUNT(*) > 10
ORDER BY attempts DESC;
```

---

## 📋 IMPLEMENTATION CHECKLIST

### Week 1: Critical Security (DO NOW)
- [ ] **Install TOTP library** (`go get github.com/pquerna/otp`)
- [ ] **Fix auth_2fa.go imports** (CheckPasswordHash, GenerateJWT)
- [ ] **Compile backend** with 2FA handlers
- [ ] **Enable 2FA for super admin account**
- [ ] **Save backup codes in secure location** (password manager)
- [ ] **Test 2FA login flow**
- [ ] **Document 2FA setup process for team**

### Week 2: IP Security
- [ ] **Find your public IP** (`curl ifconfig.me`)
- [ ] **Create IP whitelist middleware**
- [ ] **Apply to super admin login**
- [ ] **Test blocked IP behavior**
- [ ] **Document IP whitelist management**

### Week 3: Session Hardening
- [ ] **Reduce super admin JWT expiry to 2 hours**
- [ ] **Add session activity tracking**
- [ ] **Implement 30-minute inactivity timeout**
- [ ] **Create active sessions table**
- [ ] **Build session management UI**

### Week 4: Database & Monitoring
- [ ] **Create dedicated database user** (wewatch_app)
- [ ] **Enable SSL for database connections**
- [ ] **Setup query logging**
- [ ] **Configure firewall rules**
- [ ] **Setup email alerts for critical events**

---

## 🚨 INCIDENT RESPONSE PLAN

### If Super Admin Account is Compromised

#### Immediate Actions (Within 5 minutes)
1. **Blacklist all super admin tokens**:
   ```sql
   INSERT INTO token_blacklists (token, expires_at)
   SELECT DISTINCT token, NOW() + INTERVAL '24 hours'
   FROM active_sessions
   WHERE user_id = (SELECT id FROM users WHERE role = 'super_admin');
   ```

2. **Disable super admin account**:
   ```sql
   UPDATE users SET is_active = false WHERE role = 'super_admin';
   ```

3. **Reset password immediately**:
   ```bash
   # Generate new strong password
   NEW_PASSWORD=$(openssl rand -base64 32)
   echo "New password: $NEW_PASSWORD" | mail -s "URGENT" your-recovery-email@gmail.com
   ```

4. **Check for unauthorized actions**:
   ```sql
   SELECT * FROM security_events 
   WHERE user_id = (SELECT id FROM users WHERE role = 'super_admin')
   AND timestamp > NOW() - INTERVAL '1 day'
   ORDER BY timestamp DESC;
   ```

#### Follow-up Actions (Within 1 hour)
- [ ] Review all database changes in past 24 hours
- [ ] Check payment transactions for anomalies
- [ ] Notify users if data may be compromised
- [ ] File security incident report
- [ ] Update all security credentials (API keys, database passwords, etc.)

---

## 📊 SECURITY METRICS TO MONITOR

### Daily Checks
```sql
-- Failed super admin login attempts
SELECT COUNT(*) as failed_attempts
FROM security_events 
WHERE user_id = (SELECT id FROM users WHERE role = 'super_admin')
AND event_type = 'failed_login'
AND timestamp > NOW() - INTERVAL '24 hours';

-- IP changes for super admin
SELECT * FROM security_events 
WHERE event_type = 'ip_change'
AND user_id = (SELECT id FROM users WHERE role = 'super_admin')
ORDER BY timestamp DESC LIMIT 10;
```

### Weekly Reviews
- Review all super admin actions in `security_events` table
- Check for anomalous payment patterns
- Verify IP whitelist is up to date
- Test 2FA backup codes (rotate if needed)

---

## 🎓 SUMMARY: DEFENSE IN DEPTH

Your super admin protection uses **multiple layers**:

```
Layer 1: Strong Password (bcrypt) ✅ DONE
    ↓
Layer 2: Rate Limiting (5 attempts/min) ✅ DONE
    ↓
Layer 3: Token Blacklist (logout invalidation) ✅ DONE
    ↓
Layer 4: Two-Factor Authentication ⚠️ IMPLEMENT NOW
    ↓
Layer 5: IP Whitelisting ⚠️ IMPLEMENT NEXT
    ↓
Layer 6: Security Event Logging ✅ DONE
    ↓
Layer 7: Session Timeout ⏳ OPTIONAL
```

**Even if attacker breaks ONE layer, they still can't get in!**

---

## 🔗 QUICK REFERENCE

### Important Files
- **2FA Implementation**: `backend/internal/handlers/auth_2fa.go`
- **Security Logging**: `backend/internal/models/security_event.go`
- **Token Blacklist**: `backend/internal/models/token_blacklist.go`
- **Main Server**: `backend/cmd/server/main.go`

### Key Endpoints
- `POST /api/auth/login` - Login (with optional 2FA)
- `POST /api/auth/setup-2fa` - Generate QR code for 2FA
- `POST /api/auth/verify-2fa-setup` - Enable 2FA after scanning
- `POST /api/auth/disable-2fa` - Disable 2FA (requires password + code)

### Testing Commands
```bash
# Enable 2FA for super admin
curl -X POST http://localhost:8080/api/auth/setup-2fa \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"password": "YOUR_PASSWORD"}'

# Check security events
psql -U postgres -d wewatch_db -c \
  "SELECT * FROM security_events WHERE user_id = 1 ORDER BY timestamp DESC LIMIT 10;"

# View active sessions
psql -U postgres -d wewatch_db -c \
  "SELECT id, ip_address, last_seen FROM active_sessions WHERE user_id = 1;"
```

---

## 🎯 NEXT STEPS (IN ORDER)

1. **TODAY**: Install TOTP library and enable 2FA for super admin
2. **THIS WEEK**: Setup IP whitelist for super admin login
3. **THIS MONTH**: Implement session timeout and active session management
4. **ONGOING**: Monitor security events daily, review weekly

**Questions?** Check the code or test with curl commands above!
