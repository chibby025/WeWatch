# Webhook Setup Guide for Production Deployment

**Created:** December 16, 2024  
**Status:** Required for Production  
**Priority:** CRITICAL

---

## Overview

Webhooks are **essential** for automatic payment tracking. Without webhooks configured, token purchases won't update platform accounting automatically.

### Current Status ❌
- Backend: Localhost only (not publicly accessible)
- Webhooks: Not configured in Paystack dashboard
- Payment tracking: Manual backfill required

### Required for Production ✅
- Backend: Deployed and publicly accessible (HTTPS required)
- Webhooks: Configured in Paystack/Stripe dashboards
- Payment tracking: Automatic via webhook events

---

## How Payment Tracking Works

### Current Implementation (With Webhooks)

```
User Payment Flow:
┌─────────────────────────────────────────────────────────────────┐
│ 1. User pays ₦200 via Paystack                                  │
│ 2. Paystack charges ₦3 fee (1.5% + ₦100)                        │
│ 3. Paystack sends webhook to your backend                        │
│ 4. Backend receives webhook with payment details                 │
│ 5. Backend calculates: Gross ₦200, Fee ₦3, Net ₦197            │
│ 6. Backend updates:                                              │
│    - User wallet: +121 tokens (1.21 tokens)                     │
│    - Platform accounting:                                        │
│      • platform_revenue_balance: +₦197 (net received)           │
│      • lifetime_user_spend: +₦200 (gross paid)                  │
│      • lifetime_gateway_fees: +₦3 (Paystack fee)               │
│    - Token transaction: Status = completed                       │
│ 7. User sees tokens in their wallet immediately                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Gets Tracked

| Field | Value | Meaning |
|-------|-------|---------|
| `lifetime_user_spend` | ₦200 | What user paid (gross) |
| `platform_revenue_balance` | ₦197 | What platform received (net) |
| `lifetime_gateway_fees` | ₦3 | What Paystack charged |
| User tokens | 121 | Calculated from ₦200 at ₦165/token |

**Key Insight:** User gets tokens based on **gross amount paid** (₦200), but platform accounting tracks **net amount received** (₦197). This is accurate and correct.

---

## Paystack Webhook Setup

### Step 1: Deploy Your Backend

Your backend must be:
- ✅ Publicly accessible from the internet
- ✅ Using HTTPS (SSL certificate required)
- ✅ Running on a stable server (not localhost)

**Example URLs:**
```
✅ Good: https://api.wewatch.com/api/webhooks/paystack
✅ Good: https://wewatch-api.onrender.com/api/webhooks/paystack
❌ Bad: http://localhost:8080/api/webhooks/paystack (not public)
❌ Bad: http://192.168.1.100:8080/api/webhooks/paystack (local network)
```

### Step 2: Configure Paystack Webhook

1. **Go to Paystack Dashboard**
   - Live Mode: https://dashboard.paystack.com/#/settings/developer
   - Test Mode: https://dashboard.paystack.com/#/settings/developer (toggle test mode)

2. **Add Webhook URL**
   ```
   Webhook URL: https://your-domain.com/api/webhooks/paystack
   ```

3. **Select Events to Track**
   - ✅ `charge.success` - Payment successful (REQUIRED)
   - ✅ `transfer.success` - Payout to host successful
   - ✅ `transfer.failed` - Payout to host failed
   - ⚠️ Don't need: `charge.pending`, `charge.failed` (we handle these differently)

4. **Save Webhook Secret**
   Paystack will give you a webhook secret key. Add it to your environment variables:
   ```bash
   PAYSTACK_WEBHOOK_SECRET=sk_live_xxxxxxxxxxxxx
   ```

### Step 3: Test Webhook

After configuring, test it:

```bash
# Make a test payment through your frontend
# Check backend logs for webhook receipt

# Expected log output:
📥 Received Paystack webhook: charge.success
💳 Processing payment for reference: TXN_12345
💰 Platform accounting updated: User paid ₦200.00, Gateway fee ₦3.00, Net received ₦197.00
✅ Payment processed successfully
```

---

## Stripe Webhook Setup (International Payments)

### Step 1: Deploy Your Backend
Same as Paystack - must be publicly accessible with HTTPS.

### Step 2: Configure Stripe Webhook

1. **Go to Stripe Dashboard**
   - https://dashboard.stripe.com/webhooks

2. **Add Endpoint**
   ```
   Endpoint URL: https://your-domain.com/api/webhooks/stripe
   ```

3. **Select Events to Listen To**
   - ✅ `payment_intent.succeeded` - Payment successful (REQUIRED)
   - ✅ `payout.paid` - Payout to host successful
   - ✅ `payout.failed` - Payout to host failed

4. **Save Signing Secret**
   Stripe will give you a signing secret. Add it to environment variables:
   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
   ```

### Step 3: Test Webhook

```bash
# Make a test payment in test mode
# Check backend logs for webhook receipt

# Expected log output:
📥 Received Stripe webhook: payment_intent.succeeded
💳 Processing payment for reference: pi_12345
💰 Platform accounting updated: User paid $2.00, Fee $0.35, Net received $1.65
✅ Payment processed successfully
```

---

## Fee Calculations

### Paystack Fees (Nigerian Naira)

**Official Pricing:** https://paystack.com/pricing

**Local Cards (Nigerian):**

| Transaction Amount | Fee Structure | Example |
|-------------------|---------------|---------|
| < ₦2,500 | **1.5% only** (₦100 waived) | ₦200 → ₦3 fee → ₦197 net |
| ≥ ₦2,500 | **1.5% + ₦100** (capped at ₦2,000) | ₦3,000 → ₦145 fee → ₦2,855 net |
| Large amounts | **Capped at ₦2,000** | ₦150,000 → ₦2,000 fee → ₦148,000 net |

**International Cards:**
- Fee: **3.9% + ₦100** (no waiver, no cap)
- Example: ₦200 → ₦107.80 fee → ₦92.20 net

**Current Implementation:**
```go
// backend/internal/handlers/webhook_handlers.go
isInternational := event.Data.Authorization.CountryCode != "NG"

if isInternational {
    gatewayFee = (grossAmount * 0.039) + 100.0
} else {
    if grossAmount < 2500.0 {
        gatewayFee = grossAmount * 0.015  // Only 1.5%, ₦100 waived
    } else {
        gatewayFee = (grossAmount * 0.015) + 100.0
        if gatewayFee > 2000.0 {
            gatewayFee = 2000.0  // Cap
        }
    }
}
netAmount := grossAmount - gatewayFee
```

### Stripe Fees (International)

**Standard:**
- Fee: **2.9% + $0.30**
- Example: $2.00 → $0.36 fee → $1.64 net

**International Cards:**
- Fee: **3.9% + $0.30**
- Example: $2.00 → $0.38 fee → $1.62 net

---

## Environment Variables Required

Add these to your production `.env` file:

```bash
# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxx
PAYSTACK_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx
PAYSTACK_WEBHOOK_SECRET=sk_live_xxxxxxxxxxxxx

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxx
STRIPE_PUBLIC_KEY=pk_live_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Backend URL (for webhooks)
BACKEND_URL=https://api.wewatch.com
```

---

## Troubleshooting Webhooks

### Webhook Not Received

**Check 1: Is backend publicly accessible?**
```bash
curl https://your-domain.com/api/webhooks/paystack
# Should return: 405 Method Not Allowed (GET not supported, needs POST)
```

**Check 2: Check Paystack webhook logs**
- Go to: https://dashboard.paystack.com/#/settings/developer
- Click "Webhook Logs"
- Look for delivery attempts and errors

**Check 3: Check backend logs**
```bash
# SSH into your server
tail -f /var/log/wewatch/server.log | grep webhook
```

### Webhook Received But Not Processing

**Check 1: Verify webhook secret**
```bash
# Backend logs should show:
✅ Webhook signature verified
❌ Invalid webhook signature  # Wrong secret key
```

**Check 2: Check transaction reference**
```bash
# Backend should find transaction by reference
✅ Found transaction: TXN_12345
❌ Transaction not found  # Payment initiated outside your app
```

### Accounting Not Updated

**Check 1: Database connection**
```bash
# Backend logs should show:
✅ Platform accounting updated
❌ Failed to get platform accounting: connection refused
```

**Check 2: Check accounting calculations**
```sql
-- Should see increases after webhook
SELECT 
    platform_revenue_balance,
    lifetime_user_spend,
    lifetime_gateway_fees
FROM platform_accounting;
```

---

## Testing Webhooks Locally (Development)

You can't receive webhooks on localhost, but you can simulate them:

### Option 1: Use ngrok (Recommended)

```bash
# Install ngrok
npm install -g ngrok

# Start your backend on localhost:8080
cd backend && go run cmd/server/main.go

# In another terminal, create tunnel
ngrok http 8080

# ngrok will give you a public URL:
# https://abc123.ngrok.io

# Use this URL in Paystack dashboard:
# https://abc123.ngrok.io/api/webhooks/paystack
```

### Option 2: Use Paystack Test Webhook Tool

1. Go to: https://dashboard.paystack.com/#/settings/developer
2. Click "Send Test Webhook"
3. Select event: `charge.success`
4. Add your test transaction reference
5. Click "Send"

### Option 3: Use cURL to Simulate Webhook

```bash
# Simulate a Paystack webhook locally
curl -X POST http://localhost:8080/api/webhooks/paystack \
  -H "Content-Type: application/json" \
  -d '{
    "event": "charge.success",
    "data": {
      "id": 123456,
      "reference": "TXN_TEST_001",
      "amount": 20000,
      "currency": "NGN",
      "status": "success"
    }
  }'
```

---

## Migration from Manual to Automatic

### Current State (Manual)
- ✅ User paid ₦200
- ✅ User received 121 tokens (1.21)
- ✅ Platform accounting manually backfilled with ₦197
- ✅ Gateway fee ₦3 tracked

### After Deployment (Automatic)
- ✅ User pays ₦200
- ✅ Webhook fires automatically
- ✅ Backend updates everything:
  - User wallet: +121 tokens
  - Platform accounting: +₦197 revenue
  - Gateway fees: +₦3
  - Transaction status: completed
- ✅ No manual intervention needed

---

## Important Notes

### Token Calculation vs Accounting

**User pays ₦200:**
- ✅ User gets 1.21 tokens (calculated from ₦200 at ₦165/token)
- ✅ Platform receives ₦197 (after ₦3 Paystack fee)
- ✅ Gateway fee ₦3 tracked separately

**Why it works:**
- Users aren't buying naira, they're buying tokens
- Token price is fixed: ₦165 per token
- User pays ₦200, gets ₦200 worth of tokens (1.21 tokens)
- Paystack takes their fee from the platform, not the user
- Platform accepts the fee as cost of doing business

### Commission Split Still Applies

**Token Purchase:** 100% to platform (₦197 net)
- Platform keeps: ₦197

**Token Spending:** 85/15 split
- Host gets: 85% of 1.21 tokens = 1.03 tokens
- Platform keeps: 15% of 1.21 tokens = 0.18 tokens

**Host Withdrawal:** Host withdraws tokens
- Host withdraws 1.03 tokens → ₦169.95
- Platform has spent: ₦169.95
- Platform commission earned: ₦27.05 (from ₦197 net revenue)

---

## Deployment Checklist

Before going live, ensure:

- [ ] Backend deployed and publicly accessible (HTTPS)
- [ ] Environment variables configured (Paystack/Stripe keys)
- [ ] Webhook URLs configured in Paystack dashboard
- [ ] Webhook URLs configured in Stripe dashboard
- [ ] Test webhook with small payment (₦100)
- [ ] Verify webhook logs show successful delivery
- [ ] Verify platform accounting updates automatically
- [ ] Verify user receives tokens immediately
- [ ] Monitor logs for any webhook failures

---

## Summary

**What Changes After Deployment:**
- ❌ Before: Manual backfill required for each payment
- ✅ After: Automatic tracking via webhooks

**What Stays the Same:**
- ✅ User pays ₦200, gets 1.21 tokens
- ✅ Platform tracks ₦197 net revenue
- ✅ Gateway fee ₦3 tracked separately
- ✅ Commission split 85/15 on token spending

**Key Takeaway:**
Webhooks are **REQUIRED** for production. They enable automatic, accurate payment tracking without manual intervention.

