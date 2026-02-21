# WeWatch Platform Payment Setup Guide

**Purpose**: Configure YOUR platform's payment accounts to receive money from users  
**Last Updated**: December 9, 2024  

---

## 💰 Money Flow Overview

```
✨ STAGE 1: Token Purchase (100% to Platform)
User Buys Tokens (₦200)
    ↓
💳 Stripe/Paystack Payment
    ↓
💰 ₦200 goes to YOUR PLATFORM ACCOUNT (100%)
    ↓
User Gets 1.21 tokens in wallet

✨ STAGE 2: Token Spending (85/15 Split)
User Spends Tokens (buys ticket/sends donation)
    ↓
Host Gets 85% of tokens
Platform Keeps 15% commission
    ↓
Host Sees Token Balance (e.g., 103 tokens = 1.03 tokens)
    ↓
Host Requests Payout
    ↓
You transfer ₦169.95 (1.03 tokens × ₦165/token)

📄 Summary:
- Token purchase: Platform gets 100% of money immediately
- Token spending: Revenue split 85% host, 15% platform
- Host withdrawal: Paid based on token balance earned
```

---
## 🪙 Token Economics Explained

### Two-Stage Revenue Model

WeWatch uses a **two-stage revenue model** for token-based transactions:

#### Stage 1: Token Purchase (100% Platform Revenue)
```
User Action: Buy 1.21 tokens for ₦200
Payment Gateway: Paystack receives ₦200
Platform Gets: ₦200 (100%) ✅
Host Gets: Nothing yet
User Gets: 1.21 tokens to spend
```

**Why 100% to platform?** The platform is **selling its own tokens** (like selling gift cards). This is platform inventory, not host revenue yet.

#### Stage 2: Token Spending (85/15 Split)
```
User Action: Spend 1.21 tokens on ticket/donation
Host Gets: 1.03 tokens (85%) ✅
Platform Keeps: 0.18 tokens (15% commission) ✅
No new money: Just reallocating existing platform funds
```

**Why 85/15 split?** Now the tokens are being **spent on host content**, so host earns 85% and platform keeps 15% commission.

#### Stage 3: Host Withdrawal
```
Host Action: Withdraw 1.03 tokens
Host Receives: ₦1.03 × 165 = ₦169.95
Platform Pays: ₦169.95 from reserve balance
Platform Keeps: ₦0.18 × 165 = ₦29.70 commission (from original ₦200)
```

### Gateway Payments (Tickets/Donations)

For **direct bank transfer** or **card payments** (not tokens):
```
User Pays: ₦500 directly via Paystack
Host Gets: ₦425 (85%)
Platform Gets: ₦75 (15%)
Paystack Fee: ~₦3 (deducted from gross)
```

**Key Difference:** Gateway payments split immediately at purchase time.

### Platform Accounting

**Revenue Balance (Platform Money):**
- Token purchases: +₦200 (100%)
- Token spending commission: Tracks 15% allocation
- Gateway commission: +₦75 (15%)

**Reserve Balance (Host Money):**
- Token spending: +₦170 (85% allocated to hosts)
- Gateway payments: +₦425 (85% to hosts)
- Payouts: -₦169.95 (when host withdraws)

---
## 🏦 1. Stripe Setup (International Payments)

### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Sign up for a Stripe account
3. Complete business verification (KYC)
4. Add bank account for receiving payouts

### Step 2: Get API Keys
1. Go to: https://dashboard.stripe.com/apikeys
2. Copy your keys:
   - **Publishable Key**: `pk_test_...` (for frontend)
   - **Secret Key**: `sk_test_...` (for backend)

### Step 3: Set Up Webhooks
1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Copy **Signing secret**: `whsec_...`

### Step 4: Add to `.env` File
```bash
# Stripe Configuration (YOUR PLATFORM ACCOUNT)
STRIPE_PUBLISHABLE_KEY=pk_test_51ABC123...
STRIPE_SECRET_KEY=sk_test_51XYZ789...
STRIPE_WEBHOOK_SECRET=whsec_abc123...
```

### Step 5: Test Mode → Live Mode
When ready for production:
1. Switch to "View live data" in Stripe dashboard
2. Copy **LIVE keys** (start with `pk_live_` and `sk_live_`)
3. Update `.env` with live keys
4. Update webhook URL to production domain

---

## 🌍 2. Paystack Setup (African Payments)

### Step 1: Create Paystack Account
1. Go to https://paystack.com
2. Sign up for a Paystack account
3. Complete business verification
4. Add bank account for settlement

### Step 2: Get API Keys
1. Go to: https://dashboard.paystack.com/#/settings/developers
2. Copy your keys:
   - **Public Key**: `pk_test_...` (for frontend)
   - **Secret Key**: `sk_test_...` (for backend)

### Step 3: Set Up Webhooks
1. Go to: https://dashboard.paystack.com/#/settings/developer
2. Add webhook URL: `https://your-domain.com/api/webhooks/paystack`
3. Paystack automatically signs webhooks with your **Secret Key**

### Step 4: Add to `.env` File
```bash
# Paystack Configuration (YOUR PLATFORM ACCOUNT)
PAYSTACK_PUBLIC_KEY=pk_test_abc123...
PAYSTACK_SECRET_KEY=sk_test_xyz789...
```

### Step 5: Test Mode → Live Mode
When ready for production:
1. Switch to "Live" mode in Paystack dashboard
2. Copy **LIVE keys** (start with `pk_live_` and `sk_live_`)
3. Update `.env` with live keys

---

## 💸 3. Host Payout Options

### Option A: Manual Payouts (Recommended for MVP)

**How it works:**
1. Host requests payout via `/api/payouts/request`
2. You receive notification in admin dashboard
3. You manually transfer money via:
   - **Bank Transfer**: Use your bank's online banking
   - **PayPal**: Send money to host's PayPal email
   - **Mobile Money**: Use M-Pesa/MTN/etc. for African hosts
4. Mark payout as "completed" in admin panel
5. Host receives confirmation

**Pros:**
- ✅ Simple to implement (already done!)
- ✅ Full control over payouts
- ✅ Review each payout manually (fraud prevention)
- ✅ No additional API integration needed

**Cons:**
- ❌ Time-consuming for high volume
- ❌ Manual work required

**Good for**: MVP, early stage, <100 payouts/month

---

### Option B: Automated Payouts (Future Enhancement)

#### For International Hosts: Stripe Connect

**How it works:**
1. Hosts connect their Stripe account to your platform
2. Automated transfers using Stripe Transfer API
3. Money goes directly from your account to theirs

**Setup:**
```bash
# Add to .env
STRIPE_CONNECT_CLIENT_ID=ca_abc123...
```

**Implementation:**
```go
// backend/internal/handlers/stripe_payout.go
func ProcessStripePayout(payout *models.Payout) error {
    transfer, err := stripe.Transfer.New(&stripe.TransferParams{
        Amount:      stripe.Int64(payout.AmountUSD * 100), // cents
        Currency:    stripe.String("usd"),
        Destination: stripe.String(host.StripeAccountID),
    })
    // ...
}
```

**Pros:**
- ✅ Fully automated
- ✅ Instant transfers
- ✅ International support

**Cons:**
- ❌ Hosts need Stripe account
- ❌ Additional verification required
- ❌ Transaction fees

**Documentation**: https://stripe.com/docs/connect

---

#### For African Hosts: Paystack Transfer API

**How it works:**
1. Automated bank transfers using Paystack Transfer API
2. Send money to host's bank account directly

**Implementation:**
```go
// backend/internal/handlers/paystack_payout.go
func ProcessPaystackPayout(payout *models.Payout) error {
    transfer, err := paystack.CreateTransfer(&paystack.TransferRequest{
        Amount:    payout.AmountNGN * 100, // kobo
        Recipient: host.PaystackRecipientCode,
        Reason:    "WeWatch Payout",
    })
    // ...
}
```

**Pros:**
- ✅ Fully automated
- ✅ Direct bank transfers
- ✅ Supports Nigeria, Ghana, South Africa

**Cons:**
- ❌ Must verify recipient bank accounts first
- ❌ Transfer fees apply

**Documentation**: https://paystack.com/docs/transfers/single-transfers

---

## 🔐 4. Security Best Practices

### Webhook Security
```go
// Already implemented in webhook_handlers.go
func verifyStripeSignature(payload, signature, secret string) bool {
    // HMAC-SHA256 verification
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(payload)
    expectedSignature := hex.EncodeToString(mac.Sum(nil))
    return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
```

### Environment Variables
```bash
# NEVER commit these to Git!
# Add to .gitignore:
.env
.env.local
.env.production
```

### HTTPS Required
- ⚠️ Stripe/Paystack webhooks require HTTPS in production
- Use Let's Encrypt for free SSL certificates
- Or use Cloudflare for SSL proxy

---

## 💰 5. Platform Revenue (15% Commission)

### How Commission is Collected

**Token Purchases:**
- User buys 100 tokens for $10
- Money goes to YOUR Stripe/Paystack account
- User receives 100 tokens in wallet
- No commission deducted yet (you already have the money!)

**Ticket Sales:**
- User buys ticket with 50 tokens
- Host wallet credited: 42.5 tokens (85%)
- Platform commission: 7.5 tokens (15%)
- Commission tracked in `gateway_earnings` table

**Donations:**
- User donates 100 tokens
- Host wallet credited: 85 tokens (85%)
- Platform commission: 15 tokens (15%)
- Commission tracked in `gateway_earnings` table

**Host Payouts:**
- Host requests payout: 100 tokens
- Platform checks: 100 tokens = $10 USD
- You transfer $10 to host
- Platform already kept $1.50 commission (15%) from tickets/donations

### Viewing Platform Earnings

**Query Platform Earnings:**
```sql
-- Total platform commission earned
SELECT 
    SUM(amount_usd) as total_commission_usd,
    SUM(amount_local) as total_commission_local,
    currency
FROM gateway_earnings
WHERE user_id = 0  -- Platform earnings (user_id = 0)
GROUP BY currency;
```

**Create Platform Dashboard:**
```go
// GET /api/admin/platform-earnings
func GetPlatformEarnings(c *gin.Context) {
    var earnings []models.GatewayEarning
    db.Where("user_id = ?", 0).Find(&earnings)
    
    // Calculate totals by currency
    totals := make(map[string]float64)
    for _, earning := range earnings {
        totals[earning.Currency] += earning.AmountLocal
    }
    
    c.JSON(200, gin.H{
        "total_usd": totals["USD"],
        "total_ngn": totals["NGN"],
        "total_ghs": totals["GHS"],
        "total_kes": totals["KES"],
    })
}
```

---

## 📊 6. Payment Testing Checklist

### Test Stripe Integration
```bash
# Use Stripe test cards
# Success: 4242 4242 4242 4242
# Decline: 4000 0000 0000 0002

curl -X POST http://localhost:8080/api/tokens/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 100,
    "payment_method": "stripe",
    "currency": "USD"
  }'
```

### Test Paystack Integration
```bash
# Use Paystack test cards
# Success: 5060 6666 6666 6666 6666 446
# PIN: 1234, OTP: 123456

curl -X POST http://localhost:8080/api/tokens/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 100,
    "payment_method": "paystack",
    "currency": "NGN"
  }'
```

### Test Webhook Simulator
```bash
# Simulate successful payment
curl -X POST http://localhost:8080/api/webhooks/test \
  -d '{
    "provider": "stripe",
    "transaction_id": 123,
    "success": true
  }'
```

---

## 🚀 7. Going Live Checklist

### Before Launch:
- [ ] Create production Stripe account
- [ ] Create production Paystack account
- [ ] Add bank account for settlements
- [ ] Complete business verification (KYC)
- [ ] Set up SSL certificate (HTTPS)
- [ ] Update webhook URLs to production domain
- [ ] Switch to live API keys
- [ ] Test small transaction ($1) in production
- [ ] Set up monitoring/alerts for failed payments
- [ ] Create admin dashboard for payout management

### Environment Variables (Production):
```bash
# Production .env
ENV=production

# Stripe LIVE keys
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Paystack LIVE keys
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_SECRET_KEY=sk_live_...

# Database
DB_HOST=production-db.example.com
DB_NAME=wewatch_production
```

---

## 💡 Recommended Setup for MVP

**Phase 1 (Launch):**
1. ✅ Set up Stripe for international payments
2. ✅ Set up Paystack for African payments
3. ✅ Use manual payouts (current implementation)
4. ✅ Process 1-2 payouts per week manually

**Phase 2 (Growth - 100+ payouts/month):**
1. Integrate Stripe Connect for automated payouts
2. Integrate Paystack Transfer API for African payouts
3. Add batch payout processing (weekly/monthly)
4. Build admin dashboard for payout management

**Phase 3 (Scale - 1000+ payouts/month):**
1. Implement payout scheduling (auto-process every Friday)
2. Add fraud detection for suspicious payouts
3. Multi-signature approval for large payouts (>$10,000)
4. Add payout analytics dashboard

---

## 📞 Support Contacts

**Stripe Support:**
- Email: support@stripe.com
- Docs: https://stripe.com/docs

**Paystack Support:**
- Email: support@paystack.com
- Docs: https://paystack.com/docs

**WeWatch Payment Issues:**
- Check logs: `~/WeWatch/backend/server.log`
- View transactions: `SELECT * FROM token_transactions;`
- View payouts: `SELECT * FROM payouts;`

---

## 🎯 Quick Start

```bash
# 1. Create Stripe account → Get keys
# 2. Create Paystack account → Get keys

# 3. Add to .env file
cd ~/WeWatch/backend
nano .env

# Add these lines:
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...

# 4. Restart backend
./main

# 5. Test payment
# Use frontend or cURL to buy tokens

# 6. Check your Stripe/Paystack dashboard
# You should see the payment!
```

---

**Your platform = Your bank account gets paid! 💰**
