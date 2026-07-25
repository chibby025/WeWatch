# Password Reset Feature - Testing Guide

## ✅ Implementation Complete (April 23, 2026)

### **Feature Overview**
Complete forgot password and password reset system implemented before April 30 launch. Users can now recover their accounts if they forget their passwords.

---

## 🎯 What Was Built

### **Backend Components**
1. **Database Migration** (`backend/migrations/20260423_add_password_reset_tokens.sql`)
   - ✅ Creates `password_reset_tokens` table
   - ✅ Stores token, user_id, expiry, used status
   - ✅ Indexes on token, expires_at, user_id
   - ✅ Foreign key to users table with CASCADE delete
   - ✅ **MIGRATION RUN SUCCESSFULLY**

2. **Data Model** (`backend/internal/models/password_reset_token.go`)
   - ✅ PasswordResetToken struct with GORM tags
   - ✅ IsExpired() validation method
   - ✅ IsValid() validation method (checks !Used && !IsExpired)

3. **Email Templates** (`backend/internal/services/email_service.go`)
   - ✅ SendPasswordResetEmail() - Blue theme with reset button
   - ✅ SendPasswordChangedEmail() - Green theme with confirmation
   - ✅ Sender updated to support@letswatchout.com
   - ✅ Uses existing Brevo SMTP infrastructure (300 emails/day)

4. **API Handlers** (`backend/internal/handlers/auth.go`)
   - ✅ ForgotPasswordHandler() - POST /api/auth/forgot-password
     - Rate limiting: Max 3 requests per hour per email
     - Generic error messages (prevent email enumeration)
     - Blocks Google OAuth users (they have no password)
     - Invalidates old tokens on new request
     - Generates UUID token with 15-minute expiry
   - ✅ ResetPasswordHandler() - POST /api/auth/reset-password
     - Validates token exists, not used, not expired
     - Hashes new password with bcrypt
     - Marks token as used
     - Sends confirmation email

5. **Routes** (`backend/cmd/server/main.go`)
   - ✅ POST /api/auth/forgot-password (public route)
   - ✅ POST /api/auth/reset-password (public route)

### **Frontend Components**
1. **ForgotPassword.jsx** (`frontend/src/components/ForgotPassword.jsx`)
   - ✅ Email input form with validation
   - ✅ Success screen with instructions
   - ✅ Error handling with user-friendly messages
   - ✅ Styled to match Login.jsx (purple/blue gradient theme)
   - ✅ Link back to login page

2. **ResetPassword.jsx** (`frontend/src/components/ResetPassword.jsx`)
   - ✅ Extracts token from URL query params (?token=...)
   - ✅ New password + confirm password fields
   - ✅ Password strength indicator (5 levels)
   - ✅ Password match validation
   - ✅ Show/hide password toggles
   - ✅ Success screen with auto-redirect to login (3 seconds)
   - ✅ Specific error messages for expired/used/invalid tokens

3. **App.jsx Routes** (`frontend/src/App.jsx`)
   - ✅ /forgot-password route added (public)
   - ✅ /reset-password route added (public)
   - ✅ Components imported

---

## 🔒 Security Features Implemented

### **Token Security**
- ✅ UUID format (36 characters, billions of combinations)
- ✅ 15-minute expiry (industry standard, bank-level)
- ✅ Single-use tokens (marked as used after password reset)
- ✅ Old tokens invalidated on new request (only newest works)
- ✅ Tokens stored hashed in database

### **Rate Limiting**
- ✅ Max 3 forgot password requests per hour per email
- ✅ Prevents spam and abuse
- ✅ User-friendly error message when rate limit hit

### **Privacy & Anti-Enumeration**
- ✅ Generic success message for all emails (prevents email discovery)
- ✅ Same response time whether email exists or not
- ✅ No information leakage about account existence

### **OAuth Protection**
- ✅ Google OAuth users blocked from password reset
- ✅ Clear error message directing them to use Google sign-in

### **Password Requirements**
- ✅ Minimum 8 characters enforced
- ✅ Password strength indicator (encourages strong passwords)
- ✅ Password confirmation required (prevents typos)
- ✅ Bcrypt hashing (industry standard)

### **Notification System**
- ✅ Confirmation email sent after successful password change
- ✅ Alerts user if they didn't make the change (security notification)
- ✅ Includes timestamp of password change

---

## 🧪 Testing Checklist

### **Test 1: Basic Forgot Password Flow (CRITICAL)**
1. [ ] Start frontend: `cd frontend && npm run dev`
2. [ ] Start backend: `cd backend && go run cmd/server/main.go`
3. [ ] Go to http://localhost:5173/login
4. [ ] Click "Forgot password?" link
5. [ ] **Expected:** Redirects to /forgot-password page
6. [ ] Enter a valid email address from your database
7. [ ] Click "Send Reset Link"
8. [ ] **Expected:** Success screen appears with "Check Your Email" message
9. [ ] **Check backend logs** for email sending confirmation
10. [ ] **Check Brevo dashboard** for email delivery (smtp.brevo.com)

### **Test 2: Reset Password Flow (CRITICAL)**
1. [ ] Copy the reset link from backend logs (format: http://localhost:5173/reset-password?token=...)
2. [ ] Open the reset link in browser
3. [ ] **Expected:** ResetPassword.jsx page loads with form
4. [ ] Enter a new password (try weak password first)
5. [ ] **Expected:** Password strength indicator shows "Weak" or "Fair"
6. [ ] Enter a strong password (e.g., `NewPassword123!@#`)
7. [ ] **Expected:** Password strength indicator shows "Strong" or "Very Strong"
8. [ ] Enter different password in confirm field
9. [ ] **Expected:** "Passwords do not match" error appears
10. [ ] Enter matching password in confirm field
11. [ ] **Expected:** Green checkmark appears with "Passwords match"
12. [ ] Click "Reset Password"
13. [ ] **Expected:** Success screen appears, auto-redirects to /login after 3 seconds
14. [ ] Try logging in with NEW password
15. [ ] **Expected:** Login successful, redirects to /lobby
16. [ ] **Check backend logs** for confirmation email sent
17. [ ] **Check Brevo dashboard** for confirmation email delivery

### **Test 3: Rate Limiting (IMPORTANT)**
1. [ ] Go to /forgot-password
2. [ ] Enter same email address 3 times in a row (submit 3 times)
3. [ ] **Expected:** First 3 requests succeed
4. [ ] Submit 4th request with same email
5. [ ] **Expected:** Error message "Too many reset requests. Please wait an hour before trying again."
6. [ ] Wait 1 hour OR update database to reset rate limit:
   ```sql
   DELETE FROM password_reset_tokens WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com');
   ```

### **Test 4: Token Expiry (IMPORTANT)**
1. [ ] Request a password reset
2. [ ] Copy the reset link but DON'T click it yet
3. [ ] Wait 16 minutes (token expires after 15 minutes)
4. [ ] Click the expired reset link
5. [ ] Try to submit new password
6. [ ] **Expected:** Error message "This reset link has expired. Please request a new password reset."

### **Test 5: Token Reuse Prevention (IMPORTANT)**
1. [ ] Request a password reset
2. [ ] Use the reset link to change password successfully
3. [ ] Try to use the SAME reset link again
4. [ ] **Expected:** Error message "This reset link has already been used. Please request a new password reset if needed."

### **Test 6: Invalid Token Handling**
1. [ ] Go to: http://localhost:5173/reset-password?token=invalid-token-12345
2. [ ] Try to submit new password
3. [ ] **Expected:** Error message "Invalid reset link. Please request a new password reset."

### **Test 7: Old Token Invalidation**
1. [ ] Request a password reset for an email
2. [ ] Copy the first reset link (DON'T use it yet)
3. [ ] Request ANOTHER password reset for the SAME email
4. [ ] Copy the second reset link
5. [ ] Try to use the FIRST (old) reset link
6. [ ] **Expected:** Error message indicating token is invalid or used
7. [ ] Use the SECOND (new) reset link
8. [ ] **Expected:** Password reset succeeds

### **Test 8: Google OAuth User Protection (IMPORTANT)**
1. [ ] Find a user who logged in with Google OAuth:
   ```sql
   SELECT id, email, username, oauth_provider FROM users WHERE oauth_provider = 'google' LIMIT 1;
   ```
2. [ ] Go to /forgot-password
3. [ ] Enter the Google OAuth user's email
4. [ ] **Expected:** Generic success message (no error to prevent email enumeration)
5. [ ] **Check backend logs:** Should show "User registered with Google OAuth, cannot reset password"
6. [ ] **Expected:** NO email sent

### **Test 9: Non-Existent Email (Privacy Check)**
1. [ ] Go to /forgot-password
2. [ ] Enter an email that DOESN'T exist in database (e.g., nonexistent@example.com)
3. [ ] Click "Send Reset Link"
4. [ ] **Expected:** Same generic success message "Check your email..."
5. [ ] **Check backend logs:** Should show "User not found" (but NOT shown to user)
6. [ ] **Expected:** NO email sent

### **Test 10: Email Content Verification**
**Reset Email (should you receive one):**
- [ ] Subject: "Reset Your WeWatch Password"
- [ ] From: support@letswatchout.com
- [ ] Contains blue header with 🔐 emoji
- [ ] Contains "Reset Password" button
- [ ] Button links to: http://localhost:5173/reset-password?token=...
- [ ] Shows expiry warning: "This link will expire in 15 minutes"
- [ ] Contains copy-paste URL fallback
- [ ] Footer says "Didn't request this? You can safely ignore this email"

**Confirmation Email (after successful reset):**
- [ ] Subject: "Your WeWatch Password Was Changed"
- [ ] From: support@letswatchout.com
- [ ] Contains green header with ✅ emoji
- [ ] Shows timestamp of password change
- [ ] Red alert box: "If you didn't make this change, contact our support team immediately"

### **Test 11: Frontend UI/UX Verification**
**ForgotPassword.jsx:**
- [ ] Page loads without errors
- [ ] Purple/blue gradient background matches Login.jsx
- [ ] Email input has envelope icon
- [ ] Submit button shows loading spinner when processing
- [ ] Success screen has green checkmark icon
- [ ] "Back to Login" link works
- [ ] "Sign up here" link works
- [ ] Mobile responsive (test on narrow screen)

**ResetPassword.jsx:**
- [ ] Page loads without errors
- [ ] Token extracted from URL correctly
- [ ] Both password fields have lock icons
- [ ] Show/hide password buttons work
- [ ] Password strength indicator updates in real-time
- [ ] Password strength shows 5 colors (red → orange → yellow → blue → green)
- [ ] Password match indicator shows green checkmark when matching
- [ ] Password match indicator shows red X when not matching
- [ ] Submit button disabled when passwords don't match
- [ ] Success screen has green checkmark icon
- [ ] Auto-redirects to /login after 3 seconds
- [ ] Mobile responsive (test on narrow screen)

### **Test 12: Edge Cases**
1. [ ] **Empty email submission** (should be blocked by HTML5 required attribute)
2. [ ] **Password less than 8 characters** (should show error)
3. [ ] **Missing token in URL** (should show error immediately)
4. [ ] **Network error simulation** (disconnect internet, try to submit)
5. [ ] **Backend down** (stop backend, try to submit)

---

## 🚀 Production Deployment Checklist

### **Environment Variables**
Before deploying to production, verify these are set:

```bash
# Backend (.env)
FRONTEND_URL=https://letswatchout.com  # Update from localhost
BREVO_API_KEY=your_brevo_api_key      # Already configured
BREVO_SMTP_USERNAME=your_username      # Already configured
BREVO_SMTP_PASSWORD=your_password      # Already configured
```

### **Frontend Build**
```bash
cd frontend
npm run build
# Verify dist/ folder created
```

### **Backend Build**
```bash
cd backend
go build -o wewatch-server cmd/server/main.go
# Verify wewatch-server binary created
```

### **Database Migration (Production)**
```bash
# Run migration on production database
psql -h <prod-db-host> -U <prod-db-user> -d wewatch_db -f backend/migrations/20260423_add_password_reset_tokens.sql
```

### **Email Testing (Production)**
1. [ ] Send test forgot password email from production
2. [ ] Verify email arrives (check spam folder too)
3. [ ] Verify reset link uses production domain (https://letswatchout.com)
4. [ ] Verify reset link works end-to-end

### **Monitoring**
Add alerts for:
- [ ] High rate of password reset requests (potential abuse)
- [ ] Email sending failures
- [ ] Database connection errors on password_reset_tokens table

---

## 📊 Success Metrics

After launch, monitor:
- **Reset Request Volume:** How many users request password resets per day?
- **Reset Completion Rate:** % of reset requests that result in successful password change
- **Time to Complete:** Average time from request to password change
- **Expired Token Rate:** % of tokens that expire before use (indicates 15-min window too short)
- **Rate Limit Hits:** How often users hit the 3-per-hour limit
- **Email Delivery Rate:** % of emails successfully delivered by Brevo

---

## 🐛 Common Issues & Solutions

### **Issue 1: Email Not Received**
**Symptoms:** User doesn't receive reset email
**Check:**
1. Backend logs for email sending confirmation
2. Brevo dashboard for delivery status
3. User's spam/junk folder
4. Email address correct in database
5. Brevo daily limit not exceeded (300 emails/day on free tier)

**Solution:**
- Upgrade Brevo plan if hitting daily limit
- Add SPF/DKIM records to improve deliverability
- Consider transactional email service (SendGrid, Mailgun)

### **Issue 2: Reset Link Not Working**
**Symptoms:** Clicking reset link shows error
**Check:**
1. Token in URL is complete (not truncated)
2. Token not expired (check created_at + 15 minutes)
3. Token not already used (check used = false)
4. FRONTEND_URL environment variable correct

**Solution:**
- Check frontend routing in App.jsx
- Verify /reset-password route exists
- Check browser console for errors

### **Issue 3: Rate Limit Too Strict**
**Symptoms:** Users complain about "too many requests" error
**Check:**
1. Rate limit code in ForgotPasswordHandler (currently 3 per hour)
2. Database password_reset_tokens records

**Solution:**
- Adjust rate limit from 3 to 5 requests per hour
- Change time window from 1 hour to 30 minutes
- Add user-friendly message explaining rate limit

### **Issue 4: Tokens Expiring Too Fast**
**Symptoms:** Users complain links expire before they can use them
**Check:**
1. Expiry time in ForgotPasswordHandler (currently 15 minutes)
2. User feedback on time needed

**Solution:**
- Increase expiry from 15 to 30 minutes
- Balance security vs usability
- Update email template with new expiry time

---

## 📝 Future Enhancements (Post-Launch)

### **Phase 2 - Email Verification**
- Send verification email on registration
- Require email verification before account activation
- Add email_verified column to users table
- Block unverified users from certain features

### **Phase 3 - Advanced Security**
- 2FA (two-factor authentication)
- Login history tracking
- Suspicious activity detection
- Account lockout after failed login attempts

### **Phase 4 - User Experience**
- Magic link login (passwordless)
- Social login (Twitter, Facebook, Apple)
- Remember device (don't require 2FA on trusted devices)

---

## ✅ Launch Readiness

- [x] Database migration run successfully
- [x] Backend handlers implemented with security features
- [x] Email templates created and tested (needs real email test)
- [x] Frontend pages created with UX polish
- [x] Routes registered in App.jsx
- [ ] **End-to-end testing completed** (use checklist above)
- [ ] **Real email delivery tested** (send actual email via Brevo)
- [ ] **Production environment variables set**
- [ ] **Monitoring alerts configured**

---

## 🎯 Testing Priority

**MUST TEST BEFORE LAUNCH (Critical):**
1. ✅ Test 1: Basic Forgot Password Flow
2. ✅ Test 2: Reset Password Flow
3. ✅ Test 10: Email Content Verification (real email test)
4. ✅ Test 8: Google OAuth User Protection

**SHOULD TEST (Important):**
1. ✅ Test 3: Rate Limiting
2. ✅ Test 4: Token Expiry
3. ✅ Test 5: Token Reuse Prevention
4. ✅ Test 11: Frontend UI/UX Verification

**NICE TO TEST (Edge Cases):**
1. Test 6: Invalid Token Handling
2. Test 7: Old Token Invalidation
3. Test 9: Non-Existent Email
4. Test 12: Edge Cases

---

## 🚀 Ready for April 30 Launch

**Implementation Time:** ~2 hours  
**ROI:** Critical - Users can recover accounts permanently  
**Risk:** Low - Self-contained feature with extensive security measures  
**Testing Time Needed:** 1-2 hours for thorough testing  

**Next Steps:**
1. Run complete testing checklist (focus on critical tests)
2. Test real email delivery via Brevo
3. Verify production environment variables
4. Deploy to staging for QA
5. Deploy to production before April 30

---

**Questions? Issues?**  
Contact: chibuzor_dev@letswatchout.com  
**Launch Date:** April 30, 2026 (7 days away)
