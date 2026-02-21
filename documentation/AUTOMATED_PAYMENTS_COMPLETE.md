# Automated Payment Split & Host Withdrawal Implementation

## ✅ Implementation Complete

This document summarizes the automated payment system that:
1. **Automatically transfers 85% from Revenue → Reserve** after token purchases
2. **Enables hosts to withdraw** their earnings from the Reserve account
3. **Provides admin tools** to approve/process payouts

---

## 🎯 What Was Built

### 1. Paystack Transfer API Integration
**File**: `backend/internal/utils/account_manager.go`

New functions:
- `PaystackTransferFunds()` - Initiates transfers via Paystack API
- `PaystackCreateTransferRecipient()` - Creates bank account recipients
- `TransferToReserveAccount()` - Transfers 85% from Revenue to Reserve

**How it works**:
```go
// After token purchase (₦200)
netAmount := 170.0 // 85% of ₦200
TransferToReserveAccount(netAmount, "NGN", "TOKEN_123", "Token purchase reserve")
// → Makes HTTP POST to https://api.paystack.co/transfer
// → Sends ₦170 from Revenue account to Reserve account
```

### 2. Admin Payout Processing
**File**: `backend/internal/handlers/admin_payout_handlers.go`

New endpoints:
- `GET /api/admin/payouts/pending` - List all pending payout requests
- `POST /api/admin/payouts/:id/process` - Approve & transfer money to host
- `POST /api/admin/payouts/:id/reject` - Reject with reason & refund tokens

**Process flow**:
```
1. Host requests payout → Status: "pending"
2. Admin reviews request
3. Admin clicks "Process" → Calls ProcessPayoutHandler
4. Backend:
   - Creates Paystack recipient (if first time)
   - Transfers from Reserve account to host bank
   - Updates status to "completed"
   - Marks gateway_earnings as withdrawn
5. Host receives money in 24 hours
```

### 3. Automatic Token Purchase Splitting
**Already implemented** in `backend/internal/handlers/wallet_handlers.go`

```go
// PaystackWebhookHandler
grossAmount := 200.0      // Total paid by user
platformFee := 30.0       // 15% commission
netAmount := 170.0        // 85% for reserve

// Create tracking record
gatewayEarning := GatewayEarning{
    HostID:             1,
    GrossAmount:        grossAmount,
    PlatformCommission: platformFee,
    NetAmount:          netAmount,
    Currency:           "NGN",
}

// Transfer 85% to Reserve account
TransferToReserveAccount(netAmount, "NGN", paymentID, "Token purchase reserve")
```

### 4. Route Registration
**File**: `backend/cmd/server/main.go`

```go
superAdminGroup := r.Group("/api/admin")
superAdminGroup.Use(handlers.AuthMiddleware())
superAdminGroup.Use(handlers.RequireSuperAdmin())
{
    superAdminGroup.GET("/payouts/pending", handlers.GetPendingPayoutsHandler(DB))
    superAdminGroup.POST("/payouts/:id/process", handlers.ProcessPayoutHandler(DB))
    superAdminGroup.POST("/payouts/:id/reject", handlers.RejectPayoutHandler(DB))
}
```

---

## 🔧 Setup Required (One-time)

### Step 1: Enable Transfers on Paystack
1. Login to **Revenue account** at dashboard.paystack.com
2. Go to **Settings** → **Preferences**
3. Enable **Transfers**
4. Complete KYC if required

### Step 2: Create Transfer Recipient
You need the Reserve account's settlement bank details:

**Option A: Dashboard** (Recommended)
1. Login to Revenue account
2. Go to **Customers** → **Transfer Recipients**
3. Click **Create Recipient**
4. Enter Reserve account's bank details
5. Copy the **Recipient Code** (RCP_xxxxx)

**Option B: API**
```bash
curl -X POST https://api.paystack.co/transferrecipient \
  -H "Authorization: Bearer sk_live_9ae9af..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "nuban",
    "name": "WeWatch Reserve Account",
    "account_number": "YOUR_RESERVE_ACCOUNT_NUMBER",
    "bank_code": "058",
    "currency": "NGN"
  }'
```

### Step 3: Add Recipient Code to .env
```bash
# backend/.env
PAYSTACK_RESERVE_RECIPIENT_CODE=RCP_xxxxxxxxxx
```

### Step 4: Restart Backend
```bash
cd backend
./server
```

---

## 🧪 Testing

### Test 1: Token Purchase → Auto Transfer
1. Purchase ₦200 worth of tokens via frontend
2. Check backend logs:
   ```
   ✅ Transferred ₦170.00 to Reserve account (Transfer: TRF_xxxxx)
   ```
3. Verify on Paystack:
   - **Revenue account**: Transfer OUT of ₦170
   - **Reserve account**: Transfer IN of ₦170

### Test 2: Host Withdrawal
1. **Host**: Request payout for ₦1000
   - POST `/api/payouts/request`
   ```json
   {
     "payout_type": "gateway_earnings",
     "payout_method": "bank_transfer",
     "amount": 1000,
     "currency": "NGN",
     "details": {
       "account_name": "John Doe",
       "account_number": "0123456789",
       "bank_code": "058"
     }
   }
   ```

2. **Admin**: View pending payouts
   - GET `/api/admin/payouts/pending`

3. **Admin**: Process payout
   - POST `/api/admin/payouts/:id/process`

4. **Verify**: Check Reserve account transfers

---

## 📊 Database Schema

### gateway_earnings (Tracks 15%/85% split)
```sql
CREATE TABLE gateway_earnings (
    id SERIAL PRIMARY KEY,
    host_id INT NOT NULL,
    session_ticket_id INT,        -- NULL for token purchases
    donation_id INT,                -- NULL for token purchases
    gross_amount DECIMAL(10,2),    -- Total amount (e.g., 200)
    platform_commission DECIMAL(10,2), -- 15% (e.g., 30)
    net_amount DECIMAL(10,2),      -- 85% (e.g., 170)
    currency VARCHAR(3),
    gateway VARCHAR(20),
    is_withdrawn BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);
```

### payouts (Host withdrawal requests)
```sql
CREATE TABLE payouts (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    payout_type VARCHAR(50),       -- 'tokens' or 'gateway_earnings'
    payout_method VARCHAR(50),     -- 'bank_transfer', 'paypal', etc.
    amount_tokens INT,              -- For token payouts
    amount_value DECIMAL(10,2),    -- For currency payouts
    amount_currency VARCHAR(3),
    status VARCHAR(20),             -- 'pending', 'completed', 'failed', 'rejected'
    gateway_transfer_id VARCHAR(255), -- Paystack transfer code
    failure_reason TEXT,
    payout_details JSONB,          -- Bank account details
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## 🔍 Verification Queries

### Check Revenue Split Tracking
```sql
SELECT 
    gross_amount,
    platform_commission,
    net_amount,
    currency,
    is_withdrawn,
    created_at
FROM gateway_earnings
WHERE session_ticket_id IS NULL  -- Token purchases
ORDER BY created_at DESC
LIMIT 10;
```

### Check Pending Payouts
```sql
SELECT 
    p.id,
    u.username,
    p.payout_type,
    p.amount_value,
    p.amount_currency,
    p.status,
    p.created_at
FROM payouts p
JOIN users u ON p.user_id = u.id
WHERE p.status = 'pending'
ORDER BY p.created_at ASC;
```

### Check Transfer History
```sql
SELECT 
    id,
    user_id,
    gateway_transfer_id,
    amount_value,
    amount_currency,
    status,
    created_at
FROM payouts
WHERE status = 'completed'
  AND gateway_transfer_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🎨 Frontend Integration (TODO)

### Admin Payout Management UI
Location: `frontend/src/pages/AdminPayouts.jsx`

Features needed:
1. **Pending Payouts Table**
   - Show host name, amount, date, bank details
   - Action buttons: Process | Reject

2. **Process Payout Modal**
   - Confirm transfer details
   - Show bank account info
   - Success/error feedback

3. **Payout History**
   - Filter by status (pending/completed/failed)
   - Export to CSV
   - Search by host name

Sample API call:
```javascript
// Get pending payouts
const response = await axios.get('/api/admin/payouts/pending', {
  headers: { Authorization: `Bearer ${token}` }
});

// Process payout
await axios.post(`/api/admin/payouts/${payoutId}/process`, {}, {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## 🚨 Error Handling

### Common Errors & Solutions

1. **"PAYSTACK_RESERVE_RECIPIENT_CODE not configured"**
   - Solution: Create recipient and add code to `.env`

2. **"Transfers have not been enabled on your integration"**
   - Solution: Enable transfers in Paystack dashboard

3. **"Insufficient balance for transfer"**
   - Solution: Ensure Revenue account has funds
   - Check if transfers are settled

4. **"Invalid recipient code"**
   - Solution: Verify recipient code format (RCP_xxxxx)
   - Recreate recipient if needed

5. **"Transfer failed: connection timeout"**
   - Solution: Network issue, retry automatically
   - Manual transfer may be needed

---

## 📈 Monitoring & Analytics

### Metrics to Track

1. **Transfer Success Rate**
   ```sql
   SELECT 
       DATE(created_at) as date,
       COUNT(*) FILTER (WHERE status = 'completed') as successful,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) as total
   FROM payouts
   WHERE created_at >= NOW() - INTERVAL '30 days'
   GROUP BY DATE(created_at)
   ORDER BY date DESC;
   ```

2. **Reserve Account Balance**
   - Available: Sum of non-withdrawn gateway_earnings
   - Pending: Sum of pending payouts
   - Transferred: Sum of completed payouts

3. **Platform Revenue**
   ```sql
   SELECT 
       SUM(platform_commission) as total_revenue,
       currency
   FROM gateway_earnings
   WHERE created_at >= DATE_TRUNC('month', NOW())
   GROUP BY currency;
   ```

---

## 🔐 Security Considerations

1. **Secret Keys**
   - Never commit `.env` to git
   - Use different keys for test/production
   - Rotate keys periodically

2. **Transfer Limits**
   - Set daily transfer limits in Paystack
   - Implement rate limiting on payout endpoints
   - Require 2FA for large transfers

3. **Audit Logging**
   - Log all payout approvals/rejections
   - Track admin actions
   - Monitor unusual transfer patterns

4. **Recipient Verification**
   - Verify bank account names
   - Implement two-step approval for large amounts
   - Store recipient codes securely

---

## 📚 Documentation Links

- **Setup Guide**: `documentation/PAYSTACK_TRANSFER_SETUP.md`
- **Token Pricing**: `backend/TOKEN_PRICING.md`
- **Payment Flow**: `documentation/PAYMENT_FLOW_EXPLAINED.md`
- **Paystack Docs**: https://paystack.com/docs/transfers

---

## ✅ Checklist

Setup:
- [ ] Transfers enabled on Revenue Paystack account
- [ ] Reserve account recipient created
- [ ] `PAYSTACK_RESERVE_RECIPIENT_CODE` added to `.env`
- [ ] Backend restarted with new config

Testing:
- [ ] Token purchase triggers automatic transfer
- [ ] Transfer appears in both Paystack accounts
- [ ] Host can request payout
- [ ] Admin can process payout
- [ ] Money reaches host bank account

Production:
- [ ] Test with small amounts first
- [ ] Monitor first 10 transfers closely
- [ ] Set up alerts for failed transfers
- [ ] Create admin dashboard for payouts
- [ ] Document manual fallback procedures

---

## 🚀 Next Steps

1. **Test the complete flow** with real money (small amounts)
2. **Create admin UI** for payout management
3. **Set up monitoring** and alerts
4. **Add webhook listeners** for transfer status updates
5. **Implement batching** for multiple payouts
6. **Add retry logic** for failed transfers
7. **Create reconciliation reports** (monthly)

---

## 🆘 Support

**Issues?** Check logs:
```bash
cd backend
tail -f logs/server.log | grep -i "transfer\|payout"
```

**Database debugging**:
```bash
psql -h localhost -U postgres -d wewatch_db
\x
SELECT * FROM gateway_earnings WHERE session_ticket_id IS NULL ORDER BY created_at DESC LIMIT 5;
```

**Paystack issues**:
- Dashboard: https://dashboard.paystack.com
- Support: support@paystack.com
- API Status: https://paystack.statuspage.io
