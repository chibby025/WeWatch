# WeWatch Security Guide

## 🔐 Protecting Secret Keys

### For GitHub
Your `.env` file is already in `.gitignore` and will never be committed. Instead:

1. **Never commit `.env`** - It contains all your secret keys
2. **Use `.env.example`** - Template file with placeholder values
3. **Share keys securely** - Use password managers (1Password, LastPass) or secure vaults

### Setting Up New Environments

When deploying to production or setting up for a new developer:

```bash
# Copy the example file
cp backend/.env.example backend/.env

# Edit with your actual keys
nano backend/.env
```

### Required Secret Keys

#### Database
- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - Random string for JWT tokens (generate: `openssl rand -base64 32`)

#### LiveKit
- `LIVEKIT_API_KEY` - From LiveKit Cloud dashboard
- `LIVEKIT_API_SECRET` - From LiveKit Cloud dashboard

#### Payment Gateways (Dual Account System)

**Account 1: Platform Revenue (15%)**
- Stripe: `STRIPE_REVENUE_SECRET_KEY`
- Paystack: `PAYSTACK_REVENUE_SECRET_KEY`

**Account 2: Host Reserve (85%)**
- Stripe: `STRIPE_RESERVE_SECRET_KEY`
- Paystack: `PAYSTACK_RESERVE_SECRET_KEY`

### Production Deployment

For production servers (AWS, DigitalOcean, etc.):

1. **Never use `.env` files in production** - Use environment variables
2. **Set via hosting platform**:
   - AWS: Use Parameter Store or Secrets Manager
   - DigitalOcean: App Platform environment variables
   - Heroku: Config vars
   - Docker: Secrets or environment variables

---

## 🛡️ Payment Page Security

### Current Protection (Already Implemented ✅)

#### 1. Frontend Route Protection
The PaymentPage is wrapped in `<ProtectedRoute>` which:
- Redirects to login if user is not authenticated
- Verifies JWT token validity
- Only allows logged-in users to access

**Location**: [`frontend/src/App.jsx`](frontend/src/App.jsx#L55)
```jsx
<Route path="/payment" element={
  <ProtectedRoute><PaymentPage /></ProtectedRoute>
} />
```

#### 2. Backend API Protection
All payment account endpoints use `AuthMiddleware()`:
- `/api/payment-accounts` - Get user's payment accounts
- `/api/payment-accounts` - Add new payment account
- `/api/payment-accounts/:id` - Delete payment account
- `/api/payment-accounts/:id/primary` - Set primary account

**Location**: [`backend/cmd/server/main.go`](backend/cmd/server/main.go#L367)
```go
paymentAccountGroup.Use(handlers.AuthMiddleware())
```

#### 3. User Isolation
Backend handlers ensure users can only:
- View their own payment accounts
- Modify their own payment accounts
- Cannot access other users' financial data

**Implementation**:
```go
userID := userIDInterface.(uint) // From JWT token
db.Where("user_id = ?", userID).Find(&accounts)
```

### Additional Security Measures

#### Data Validation
- ✅ Account numbers verified via Paystack API
- ✅ Bank codes validated against official bank list
- ✅ All sensitive data uses HTTPS in production

#### Sensitive Data Protection
- ✅ Account numbers are **masked** in API responses (`****7890`)
- ✅ Full account numbers never returned to frontend
- ✅ Paystack secret keys only on backend (never exposed to frontend)

#### Paystack Security
- ✅ Live API keys in use (not test keys)
- ✅ Transfer recipient verification
- ✅ Only Nigerian banks supported (currency locked to NGN)

---

## 🚀 Deployment Checklist

Before pushing to production:

- [ ] Verify `.env` is in `.gitignore`
- [ ] Create `.env.example` with placeholder values
- [ ] Use HTTPS for all API requests
- [ ] Enable CORS only for your domain
- [ ] Set secure JWT_SECRET (32+ character random string)
- [ ] Use Paystack/Stripe **live keys** (not test keys)
- [ ] Enable database SSL/TLS connections
- [ ] Set up webhook signature verification
- [ ] Configure rate limiting on payment endpoints
- [ ] Enable audit logging for financial transactions

---

## 🔍 Security Best Practices

### API Keys
1. **Rotate regularly** - Change keys every 90 days
2. **Least privilege** - Use read-only keys where possible
3. **Monitor usage** - Watch for unusual API calls
4. **Revoke compromised keys** - Immediately if leaked

### Database
1. **Strong passwords** - 16+ characters, random
2. **SSL/TLS required** - Encrypt connections
3. **Regular backups** - Automated daily backups
4. **Access control** - Limit who can access production DB

### Code Reviews
1. **No secrets in code** - Never hardcode API keys
2. **Dependency scanning** - Check for vulnerable packages
3. **SQL injection prevention** - Use GORM parameterized queries
4. **XSS protection** - Sanitize all user inputs

---

## 📞 Incident Response

If you suspect a security breach:

1. **Immediately rotate all API keys**
2. **Review access logs** - Check for unauthorized access
3. **Notify affected users** - If payment data compromised
4. **Update passwords** - Database, servers, dashboards
5. **Document incident** - What happened, how fixed

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Stripe Security Best Practices](https://stripe.com/docs/security/guide)
- [Paystack Security](https://paystack.com/security)
- [Go Security Checklist](https://github.com/Checkmarx/Go-SCP)
