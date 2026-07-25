# 🔐 2FA for Development: Your Questions Answered

## ❓ Your Questions

### Q1: Will 2FA affect my regular development?
**A: NO - Here's exactly how it works:**

#### Development Workflow BEFORE 2FA:
```
1. Open Postman/Browser
2. Login with email + password
3. Get JWT token (valid 24 hours)
4. Make API requests
5. Code, test, repeat
```

#### Development Workflow AFTER 2FA (enabled):
```
1. Open Postman/Browser
2. Login with email + password
3. ALSO enter 6-digit code from phone 📱 ← ONLY NEW STEP
4. Get JWT token (still valid 24 hours)
5. Make API requests (same as before)
6. Code, test, repeat
```

**Key Point**: You only enter the 2FA code **ONCE during login**. After that, your JWT token works for 24 hours just like before!

---

### Q2: How long is 2FA valid?

#### Two Different Timeframes:

**TOTP Code (Google Authenticator):**
- **Validity**: 30 seconds
- **When needed**: Only during login
- **Changes**: New code every 30 seconds

**JWT Token (After Login):**
- **Validity**: 24 hours (unchanged!)
- **When needed**: For every API request (automatic via cookie)
- **Stays same**: Token doesn't change after login

#### Example Timeline:
```
09:00 AM: Login with password + TOTP code → Get JWT token
09:00 AM - 09:00 AM (next day): JWT token works for all requests ✅
09:00 AM (next day): JWT expires → Login again (need new TOTP code)
```

**Development Impact**: You login ONCE per day (or less if you keep browser open), not once per request!

---

### Q3: Is 2FA only for you/super admin?

**A: 2FA is OPT-IN for each user individually**

| User Type | 2FA Recommendation | Impact on Others |
|-----------|-------------------|------------------|
| **Your super admin account** | ✅ ENABLE (high security) | None - your choice |
| **Your test account** | ❌ Leave disabled (convenience) | None - separate account |
| **Other admins** | ⚠️ Optional (their choice) | None - their choice |
| **Regular users** | ❌ Not needed | None - not enforced |

**Key Points:**
- Each user decides for themselves
- You can have multiple accounts (one with 2FA, one without)
- Test accounts can skip 2FA for easier testing
- Production super admin SHOULD have 2FA enabled

---

## 🛠️ Development Strategies

### Strategy 1: Keep 2FA Enabled (Recommended for Production)
**Pros:**
- ✅ Maximum security
- ✅ Tests real-world login flow
- ✅ Gets you used to 2FA workflow

**Cons:**
- ⚠️ Need phone during login
- ⚠️ Extra 10 seconds per login

**When to use:** When you're ready to deploy to production and want to test the full security flow.

---

### Strategy 2: Use Test Account Without 2FA (Recommended for Development)
**Pros:**
- ✅ Quick logins during development
- ✅ No phone needed
- ✅ Can still test 2FA with super admin account

**Cons:**
- ⚠️ Test account less secure (but it's just test data)

**Setup:**
```bash
# Create test account without 2FA
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testdev",
    "email": "test@dev.local",
    "password": "testpass123"
  }'

# Use this account for daily development
# Use super admin account only when testing admin features
```

---

### Strategy 3: Environment-Based 2FA (Most Flexible)
**Modify code to make 2FA optional in development:**

```go
// In Login2FAHandler, add environment check:
if user.TwoFactorEnabled {
    // Skip 2FA check in development mode
    if os.Getenv("ENVIRONMENT") == "development" {
        log.Printf("⚠️ DEV MODE: Skipping 2FA for user %d", user.ID)
    } else {
        // Production: require 2FA code
        if input.TotpCode == nil || *input.TotpCode == "" {
            c.JSON(http.StatusUnauthorized, gin.H{
                "error": "2FA code required",
                "requires_2fa": true,
            })
            return
        }
        // ... verify code
    }
}
```

**Pros:**
- ✅ 2FA enabled in production
- ✅ 2FA bypassed in development
- ✅ Best of both worlds

**Cons:**
- ⚠️ Requires environment variable management
- ⚠️ Easy to forget to set ENVIRONMENT=production

---

## 📱 2FA Setup Guide

### Step 1: Install Google Authenticator
- **iOS**: https://apps.apple.com/app/google-authenticator/id388497605
- **Android**: https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2

### Step 2: Enable 2FA for Super Admin
```bash
cd /home/chibuzor_dev/WeWatch
chmod +x test-2fa-setup.sh
./test-2fa-setup.sh
```

**What the script does:**
1. ✅ Login as super admin
2. ✅ Call `/api/auth/setup-2fa` to generate QR code
3. ✅ Display QR code URL + secret key + backup codes
4. ✅ Prompt you to enter 6-digit code from phone
5. ✅ Call `/api/auth/verify-2fa-setup` to enable 2FA
6. ✅ Confirm 2FA is active

### Step 3: Test 2FA Login
```bash
# Login without 2FA code (should fail)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chibi@gmail.com",
    "password": "Chibby123"
  }'

# Response: {"error": "2FA code required", "requires_2fa": true}

# Login WITH 2FA code (should succeed)
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chibi@gmail.com",
    "password": "Chibby123",
    "totp_code": "123456"
  }' \
  -c cookies.txt

# Response: {"message": "Login successful", "user": {...}}
```

---

## 🔥 Common Scenarios

### Scenario 1: "I lost my phone!"
**Solution: Use backup codes**

When you first setup 2FA, you got 10 backup codes. Each code can be used ONCE:

```bash
# Login with backup code instead of TOTP
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "chibi@gmail.com",
    "password": "Chibby123",
    "totp_code": "XXXXXXXX"
  }'
  # ↑ Use backup code instead of 6-digit TOTP
```

**After using backup code:**
- That code is deleted (can't reuse)
- You have 9 codes remaining
- Get a new phone and setup 2FA again

---

### Scenario 2: "I need to disable 2FA temporarily"
**Solution: Call disable endpoint**

```bash
# Must be logged in + provide password + current TOTP code
curl -X POST http://localhost:8080/api/auth/disable-2fa \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "password": "Chibby123",
    "code": "123456"
  }'

# Response: {"message": "2FA disabled successfully"}
```

**Note**: This is logged as a security event. Don't disable 2FA in production!

---

### Scenario 3: "Code keeps saying invalid"
**Common issues:**

1. **Time sync problem**
   ```bash
   # Check server time
   date
   
   # Check phone time (Settings > Date & Time > Automatic)
   # TOTP requires accurate time (within 30 seconds)
   ```

2. **Typo in code**
   - TOTP codes are case-insensitive
   - No spaces or dashes
   - Exactly 6 digits

3. **Code expired**
   - Codes change every 30 seconds
   - Wait for new code if near expiration

4. **Wrong account in Google Authenticator**
   - Make sure you're reading code for "WeWatch (chibi@gmail.com)"

---

### Scenario 4: "Can I test without phone?"
**Solution: Generate TOTP codes programmatically**

```bash
# Install TOTP generator
npm install -g totp-generator

# Generate code using your secret key
totp-generator --secret=YOUR_SECRET_KEY

# Or use online generator (dev only!):
# https://totp.danhersam.com/
```

**WARNING**: Never paste your production secret into online tools! Only use for development.

---

## 🎯 Recommended Setup for Development

### Option A: Separate Accounts (Easiest)
```
Production Super Admin (chibi@gmail.com)
  ✅ 2FA enabled
  ✅ Use for production deployments only
  ✅ Keep Google Authenticator handy

Development Account (test@dev.local)
  ❌ 2FA disabled
  ✅ Use for daily development
  ✅ Quick login, no phone needed
```

### Option B: Environment Variable (Flexible)
```bash
# .env for development
ENVIRONMENT=development

# .env for production
ENVIRONMENT=production
```

Then add environment check in code (see Strategy 3 above).

---

## 📊 2FA Impact Summary

| Aspect | Before 2FA | After 2FA (Enabled) |
|--------|-----------|-------------------|
| **Login frequency** | Once per day | Once per day (same) |
| **Login time** | 5 seconds | 15 seconds (+10 sec for phone) |
| **JWT validity** | 24 hours | 24 hours (unchanged) |
| **API requests** | No change | No change |
| **Development flow** | Same | Same (after initial login) |
| **Security** | Password only | Password + Phone |

**Bottom Line**: 2FA adds 10 seconds to login, but JWT token still lasts 24 hours. Your development workflow is 99% unchanged!

---

## 🚀 Quick Start Commands

### Enable 2FA (Interactive)
```bash
cd /home/chibuzor_dev/WeWatch
./test-2fa-setup.sh
```

### Check 2FA Status
```bash
psql -U postgres -d wewatch_db -c \
  "SELECT id, email, two_factor_enabled FROM users WHERE role = 'super_admin';"
```

### View Recent 2FA Events
```bash
psql -U postgres -d wewatch_db -c \
  "SELECT event_type, timestamp, metadata FROM security_events 
   WHERE user_id = 1 AND event_type LIKE '%2fa%' 
   ORDER BY timestamp DESC LIMIT 10;"
```

### Disable 2FA (if needed)
```bash
# Login first
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "chibi@gmail.com", "password": "Chibby123", "totp_code": "123456"}' \
  -c cookies.txt

# Then disable
curl -X POST http://localhost:8080/api/auth/disable-2fa \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"password": "Chibby123", "code": "789012"}'
```

---

## 🎓 Summary

### Your Questions - Final Answers

**Q: Will 2FA affect regular development?**  
A: **Minimal impact** - Only adds 10 seconds to login (once per day). JWT token still lasts 24 hours.

**Q: Is 2FA valid for 24 hours?**  
A: **TOTP code**: 30 seconds. **JWT token**: 24 hours (unchanged).

**Q: Is it only for me?**  
A: **Opt-in per user** - You can enable it, others can skip it. You can even have one account with 2FA and one without.

### Recommended Approach

1. **Enable 2FA on production super admin** ✅
2. **Create separate test account without 2FA** ✅
3. **Use test account for daily development** ✅
4. **Only use super admin account for admin/production tasks** ✅

This way:
- ✅ Production is secure
- ✅ Development is convenient
- ✅ You get used to 2FA workflow
- ✅ No phone needed for 95% of dev work

---

Ready to enable 2FA? Run: `./test-2fa-setup.sh`
