# 🔐 Security Settings - User Guide

## Overview
The Security section in your profile sidebar allows each user to manage their account security with:
- **Two-Factor Authentication (2FA)** - Add an extra layer of protection
- **Password Management** - Change your password anytime

---

## How to Access Security Settings

1. Click your **profile avatar** in the top-left corner of the lobby
2. Click **"Security"** in the sidebar menu
3. Choose between **2FA** or **Change Password** tabs

---

## 🔐 Two-Factor Authentication (2FA)

### What is 2FA?
Two-Factor Authentication adds an extra security layer by requiring:
1. Your password (something you know)
2. A 6-digit code from your phone (something you have)

### Enable 2FA

#### Step 1: Open Security Settings
- Navigate to Security → 2FA tab
- Click "Enable 2FA"

#### Step 2: Enter Your Password
- Verify your identity by entering your current password
- Click "Enable 2FA" to continue

#### Step 3: Scan QR Code
- Install **Google Authenticator** on your phone:
  - **iOS**: [Download from App Store](https://apps.apple.com/app/google-authenticator/id388497605)
  - **Android**: [Download from Play Store](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2)
- Open Google Authenticator and tap the **+** button
- Scan the QR code displayed on your screen
- Or manually enter the secret key if you can't scan

#### Step 4: Save Backup Codes
⚠️ **CRITICAL: Save these backup codes somewhere safe!**
- You'll see 10 backup codes (e.g., `A7B3C9D2`)
- Each code can be used **once** if you lose your phone
- Click "Copy All" and save them in a password manager or secure note
- **You cannot view these codes again!**

#### Step 5: Verify
- Enter the 6-digit code from Google Authenticator
- Click "Enable 2FA"
- ✅ Your account is now protected!

### Using 2FA After Setup

**Every time you login:**
1. Enter your email and password (as usual)
2. Enter the 6-digit code from Google Authenticator
3. You're logged in! (JWT token lasts 24 hours)

**During the same session:**
- You won't need to enter 2FA codes again
- Your login token works for 24 hours
- No impact on your regular usage

### Disable 2FA

1. Go to Security → 2FA tab
2. Scroll down to "Disable Two-Factor Authentication"
3. Enter your current password
4. Enter a current 6-digit code from Google Authenticator
5. Click "Disable 2FA"
6. ⚠️ Confirm the action (reduces security!)

### Lost Your Phone?

If you lose access to Google Authenticator:
1. Use one of your **backup codes** instead of the 6-digit code
2. Each backup code works **only once**
3. After using a code, it's deleted automatically
4. You'll have 9 remaining codes

If you lost both phone AND backup codes:
- Contact support for account recovery
- You'll need to verify your identity

---

## 🔑 Change Password

### Requirements
- Password must be **at least 8 characters**
- Should include:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Special characters (!@#$%^&*)

### How to Change Password

1. Go to Security → Change Password tab
2. Enter your **current password**
3. Enter your **new password**
4. **Confirm** your new password
5. Click "Change Password"
6. ✅ Password updated successfully!

### Tips for Strong Passwords
- Use a unique password for WeWatch
- Don't reuse passwords from other sites
- Consider using a password manager
- Longer passwords are stronger (12+ characters recommended)

---

## 🛡️ Security Status Indicators

### In Sidebar Menu
- **"Security"** menu item shows:
  - `2FA ✓` badge = 2FA is enabled ✅
  - Purple/blue highlight = 2FA not enabled (recommended to enable)

### In Security Modal
- **Green badge** "ACTIVE" = 2FA enabled
- **Red badge** "INACTIVE" = 2FA disabled
- Status updates immediately after changes

---

## 📱 Google Authenticator Tips

### Adding WeWatch Account
- Account will appear as: **WeWatch (your-email@example.com)**
- Generates new 6-digit code every 30 seconds
- Works offline (no internet needed after setup)

### Managing Multiple Accounts
- You can add multiple accounts to Google Authenticator
- WeWatch will have its own entry
- Each account generates different codes

### Time Sync Issues
If codes keep saying "invalid":
1. Check your phone's time is set to **automatic**
2. Go to Settings → Date & Time → Automatic
3. TOTP requires accurate time (within 30 seconds)

---

## 🚨 Security Best Practices

### For All Users
- ✅ Use a strong, unique password
- ✅ Enable 2FA if you handle sensitive data
- ✅ Never share your password or 2FA codes
- ✅ Log out on shared computers

### For Super Admins
- ✅ **MUST** enable 2FA (required for admin accounts)
- ✅ Use backup codes stored securely
- ✅ Change password every 90 days
- ✅ Monitor security events

### For Regular Users
- ⚠️ 2FA is optional but recommended
- ✅ Enable if you have payment methods saved
- ✅ Enable if your account has valuable tokens/purchases

---

## 🔍 Security Events Logging

### What Gets Logged
When you use security features, these events are tracked:
- Password changes (success/failure)
- 2FA setup/disable
- Failed login attempts
- IP address changes
- Suspicious activity

### Why This Matters
- Helps detect unauthorized access attempts
- Provides audit trail for your account
- Admins can monitor security incidents
- You can review your login history

---

## ❓ FAQs

### Q: Will 2FA slow down my login?
**A:** Only adds ~10 seconds to open Google Authenticator. Your JWT token then works for 24 hours without re-entering codes.

### Q: Can I disable 2FA temporarily?
**A:** Yes, but not recommended. You can disable/re-enable anytime, but requires password + current 2FA code to disable.

### Q: What if I get a new phone?
**A:** 
1. Before wiping old phone, disable 2FA or transfer Google Authenticator data
2. Or use a backup code to login and re-setup 2FA on new phone
3. Google Authenticator has built-in account transfer feature

### Q: Do I need 2FA for development/testing?
**A:** No! Create a separate test account without 2FA for convenience. Use 2FA on your main/admin account.

### Q: Can I use other authenticator apps?
**A:** Yes! Any TOTP-compatible app works:
- Microsoft Authenticator
- Authy
- 1Password
- LastPass Authenticator

### Q: How secure is this?
**A:** Very secure:
- Uses industry-standard TOTP protocol (RFC 6238)
- 30-second code expiration
- Backend validates codes server-side
- Failed attempts are logged and rate-limited

---

## 🎯 Quick Actions

### Enable 2FA (5 minutes)
1. Profile → Security → 2FA tab
2. Enter password
3. Scan QR code with Google Authenticator
4. Save backup codes
5. Verify with 6-digit code
6. ✅ Done!

### Change Password (1 minute)
1. Profile → Security → Change Password tab
2. Enter current password
3. Enter new password twice
4. Click "Change Password"
5. ✅ Done!

### Test 2FA Login
1. Log out
2. Log back in with email + password
3. Enter 6-digit code from phone
4. ✅ Logged in!

---

## 🆘 Troubleshooting

### "Invalid 2FA code" error
- Wait for next code (codes expire every 30 seconds)
- Check phone time is automatic
- Make sure you're reading WeWatch code, not another account
- Try a backup code if available

### "Current password is incorrect"
- Double-check your password (case-sensitive)
- Try "Forgot Password" if you can't remember
- Contact support if issue persists

### QR code won't scan
- Use manual entry option instead
- Copy the secret key and paste in Google Authenticator
- Make sure camera permissions are enabled

### Lost backup codes
- If you still have access to Google Authenticator: disable 2FA and re-enable to get new codes
- If you lost both phone and codes: contact support for recovery

---

## 📞 Need Help?

- Click **Help & Support** in the sidebar
- Or contact: support@wewatch.com
- Security issues: Report immediately to security@wewatch.com

---

**Remember**: Your account security is in your hands. Enable 2FA today! 🔐
