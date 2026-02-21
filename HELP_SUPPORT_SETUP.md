# Help & Support Email Setup

## Overview
Users can now send support requests directly from the app via the Help & Support modal. Messages are sent to `watchoutrev@gmail.com`.

## Setup Instructions

### 1. Install Go Email Package
```bash
cd backend
go get gopkg.in/gomail.v2
```

### 2. Configure SMTP with Brevo (Recommended - Fastest & Easiest)

**Why Brevo?**
- ✅ 300 emails/day free forever
- ✅ No credit card required
- ✅ Faster than Gmail
- ✅ 2-minute setup

#### Setup Steps:
1. Go to https://www.brevo.com/
2. Click "Sign up free"
3. Verify your email
4. Go to **Settings** (top right) → **SMTP & API**
5. Click **SMTP** tab
6. Copy your credentials:
   - **SMTP Server**: `smtp-relay.brevo.com`
   - **Port**: `587`
   - **Login**: Your Brevo login email
   - **SMTP Key**: Click "Create a new SMTP key" → Copy it

Done! Use these in your .env file below.

#### Alternative: Gmail (Slower)
If you prefer Gmail:
1. Enable 2-Step Verification at https://myaccount.google.com/security
2. Go to **App passwords** → Generate for "Mail"
3. Use `smtp.gmail.com` port `587`

### 3. Update .env File
Add these variables to `backend/.env`:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_16_char_app_password
```

**Important:** 
- Use the **App Password**, NOT your regular Gmail password
- Keep this secure - don't commit to Git

### 4. Test the Feature

#### Backend
```bash
cd backend
go run cmd/server/main.go
```

#### Frontend
1. Login to the app
2. Click hamburger menu → Help & Support (? icon)
3. Fill out the form
4. Click "Send Message"

#### Expected Behavior
- ✅ Loading spinner appears
- ✅ Email sent to watchoutrev@gmail.com
- ✅ Success message shown
- ✅ Modal closes automatically

### 5. Email Format
The support team receives emails like this:

```
Subject: [WeWatch Support] User's Subject

New Support Request from WeWatch

From: username (user@email.com)
Subject: Login Issues

Message:
I can't login to my account. Getting error 500.

---
This is an automated message from WeWatch Support System.
```

## Troubleshooting

### "Failed to send support request"
- Check SMTP credentials in .env
- Verify App Password is correct (16 chars, no spaces)
- Check internet connection
- Try using a different SMTP provider

### "SMTP configuration missing"
- Add SMTP_HOST, SMTP_USER, SMTP_PASSWORD to .env
- Restart backend server after updating .env

### Gmail blocks connection
- Enable 2-Step Verification
- Use App Password (not regular password)
- Check "Less secure app access" is NOT enabled (deprecated)

## Security Notes
- ✅ Endpoint is protected by AuthMiddleware
- ✅ User info auto-included (can't spoof identity)
- ✅ Rate limiting recommended for production
- ✅ SMTP password stored in .env (not committed)

## Production Deployment
For production, consider:
- Using SendGrid/Mailgun for better deliverability
- Adding rate limiting (max 5 requests per user per hour)
- Logging all support requests to database
- Auto-reply emails to users
- Support ticket system integration
