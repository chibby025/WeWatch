# Phase 3 Week 2: Withdrawal Flow & Stripe Connect - COMPLETED ✅

## Overview
Phase 3 Week 2 implemented the complete automated withdrawal system with dual gateway support (Paystack + Stripe Connect). Hosts can now withdraw earnings via self-service with real-time transfer tracking using goroutines and status polling.

---

## 🎯 Objectives Completed

### 1. Stripe Connect Integration (3 new endpoints)
✅ **Create Stripe Express Accounts** - Hosts can connect international bank accounts
✅ **Onboarding Link Generation** - Seamless redirect flow for Stripe verification
✅ **Account Status Checking** - Real-time verification status updates
✅ **Link Refresh System** - Handle expired onboarding links gracefully

### 2. Withdrawal Flow Implementation (1 endpoint + 6 helper functions)
✅ **Withdrawal Request Handler** - Complete validation and balance deduction
✅ **Async Transfer Execution** - Non-blocking goroutine processing
✅ **Dual Gateway Support** - Paystack Transfer API + Stripe Transfer API
✅ **Status Polling System** - 30-second intervals for up to 10 minutes
✅ **Error Recovery** - Failed transfers marked and logged

### 3. Transfer Tracking Infrastructure
✅ **Goroutine Architecture** - Nested goroutines for async processing
✅ **Database Persistence** - All transfer IDs stored for recovery
✅ **Dual Verification** - Polling + webhook confirmation (redundant)
✅ **Automatic Status Updates** - Payout status: pending → processing → completed/failed

---

## 📂 Files Created/Modified

### Created Files:
1. **backend/internal/handlers/withdrawal_handlers.go** (530 lines)
   - `RequestWithdrawal` - Main withdrawal request handler
   - `processWithdrawal` - Goroutine orchestrator
   - `initiatePaystackTransfer` - Paystack Transfer API integration
   - `initiateStripeTransfer` - Stripe Transfer API integration
   - `pollTransferStatus` - Status polling loop (30s intervals)
   - `checkPaystackTransferStatus` - Query Paystack transfer status
   - `checkStripeTransferStatus` - Query Stripe transfer status

2. **documentation/PHASE3_WEEK2_COMPLETE.md** (this file)
   - Complete implementation summary

### Modified Files:
1. **backend/internal/handlers/payment_account_handlers.go** (+380 lines)
   - `CreateStripeConnectAccount` - Creates Stripe Express account
   - `GetStripeAccountStatus` - Checks onboarding completion
   - `RefreshStripeOnboardingLink` - Regenerates expired links

2. **backend/cmd/server/main.go** (+12 lines)
   - Added 3 Stripe Connect routes
   - Added 1 withdrawal route

3. **documentation/INDEX.md** (updated)
   - Added Phase 3 Week 2 entry

---

## 🔧 API Endpoints (4 new endpoints)

### Stripe Connect Routes

#### POST `/api/payment-accounts/stripe/connect`
**Purpose:** Create Stripe Express account and return onboarding link

**Request Body:**
```json
{
  "country": "US",
  "currency": "USD",
  "is_primary": true
}
```

**Response:**
```json
{
  "message": "Stripe Connect account created. Complete onboarding to verify.",
  "account_id": "acct_1ABC123XYZ",
  "onboarding_url": "https://connect.stripe.com/setup/s/ABC123...",
  "expires_at": 1702345678,
  "account": {
    "id": 1,
    "gateway": "stripe",
    "display_name": "Stripe Account (US)",
    "currency": "USD",
    "is_primary": true,
    "is_verified": false
  }
}
```

**Process:**
1. Creates Stripe Express account via Stripe API
2. Generates account onboarding link (expires in 1 hour)
3. Saves unverified account to database
4. Returns onboarding URL for redirect
5. Host completes onboarding in Stripe's UI
6. Webhook marks account as verified when complete

---

#### GET `/api/payment-accounts/stripe/:accountId/status`
**Purpose:** Check if Stripe onboarding completed

**Response:**
```json
{
  "account_id": "acct_1ABC123XYZ",
  "charges_enabled": true,
  "payouts_enabled": true,
  "details_submitted": true,
  "is_verified": true,
  "account": {
    "id": 1,
    "gateway": "stripe",
    "is_verified": true
  }
}
```

**Use Cases:**
- Frontend polling after onboarding redirect
- Verify account before allowing withdrawals
- Display verification status in UI

---

#### POST `/api/payment-accounts/stripe/:accountId/refresh-link`
**Purpose:** Generate new onboarding link for expired/incomplete accounts

**Response:**
```json
{
  "message": "New onboarding link created",
  "onboarding_url": "https://connect.stripe.com/setup/s/NEW123...",
  "expires_at": 1702349999
}
```

**Use Cases:**
- Link expired (>1 hour old)
- User didn't complete onboarding
- Host returns to finish setup later

---

### Withdrawal Route

#### POST `/api/withdrawals/request`
**Purpose:** Request withdrawal from token wallet or gateway earnings

**Request Body:**
```json
{
  "amount": 5000.00,
  "currency": "NGN",
  "payment_account_id": 1,
  "source_type": "gateway_earnings"
}
```

**Validation:**
- ✅ Payment account exists and is verified
- ✅ Currency matches account currency
- ✅ Amount meets minimum (₦2,000 / $5 / €5)
- ✅ Sufficient balance in source (tokens or earnings)

**Response:**
```json
{
  "message": "Withdrawal request submitted successfully",
  "payout_id": 42,
  "amount": 5000.00,
  "currency": "NGN",
  "status": "pending",
  "payment_account": {
    "id": 1,
    "gateway": "paystack",
    "display_name": "GTBank - ****6789",
    "currency": "NGN"
  }
}
```

**Backend Process:**
1. **Validation Phase:**
   - Check payment account exists and is verified
   - Verify currency matches
   - Validate minimum withdrawal amount
   - Check sufficient balance

2. **Transaction Phase:**
   - Start database transaction
   - Deduct from `user_wallet.token_balance` OR mark `gateway_earnings.is_withdrawn = true`
   - Create `payout` record with status = "pending"
   - Commit transaction atomically

3. **Transfer Phase (Goroutine):**
   - Launch `processWithdrawal` goroutine (non-blocking)
   - Mark payout as "processing"
   - Call Paystack/Stripe Transfer API
   - Save `gateway_transfer_id` in payout record
   - Update `payment_account.last_used_at`

4. **Polling Phase (Nested Goroutine):**
   - Launch `pollTransferStatus` goroutine
   - Poll every 30 seconds
   - Check transfer status via API
   - Update payout status: "completed" or "failed"
   - Stop when webhook confirms OR after 10 minutes

---

## 🔄 Withdrawal Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  1. HOST CLICKS "WITHDRAW" ON PAYMENT PAGE                  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  2. POST /api/withdrawals/request                           │
│     {amount: 5000, currency: "NGN", payment_account_id: 1}  │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  3. VALIDATION                                               │
│     ✓ Payment account verified?                             │
│     ✓ Currency matches?                                     │
│     ✓ Amount >= minimum?                                    │
│     ✓ Sufficient balance?                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  4. DATABASE TRANSACTION                                     │
│     BEGIN TRANSACTION                                        │
│       - Deduct from user_wallet OR gateway_earnings         │
│       - Create payout record (status: pending)              │
│     COMMIT                                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  5. HTTP RESPONSE (Immediate)                                │
│     200 OK - "Withdrawal submitted"                         │
│     Returns instantly to user                               │
└─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  6. GOROUTINE: processWithdrawal()                          │
│     - Mark payout as "processing"                           │
│     - Call Paystack/Stripe Transfer API                     │
│     - Save gateway_transfer_id                              │
│     - Update payment_account.last_used_at                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  7. NESTED GOROUTINE: pollTransferStatus()                  │
│     Loop: Every 30 seconds (max 20 attempts = 10 min)       │
│       - Query Paystack/Stripe for transfer status          │
│       - If "success"/"paid": Mark payout "completed"        │
│       - If "failed": Mark payout "failed"                   │
│       - If webhook updated: Stop polling                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 💳 Gateway-Specific Details

### Paystack Transfer API

**Endpoint:** `POST https://api.paystack.co/transfer`

**Request:**
```json
{
  "source": "balance",
  "reason": "Withdrawal for payout #42",
  "amount": 500000,  // Amount in kobo (₦5,000.00 * 100)
  "recipient": "RCP_abc123xyz"  // Pre-created recipient code
}
```

**Response:**
```json
{
  "status": true,
  "message": "Transfer has been queued",
  "data": {
    "transfer_code": "TRF_xyz789abc",
    "id": 123456,
    "amount": 500000,
    "status": "pending"  // Will become "success" or "failed"
  }
}
```

**Status Check:** `GET https://api.paystack.co/transfer/TRF_xyz789abc`

**Webhook:** `transfer.success` or `transfer.failed`

**Transfer Fee:** ₦10 flat (for NGN), GH₵1 (for GHS), KSh25 (for KES)  
**Platform absorbs fees** - Host receives full requested amount

---

### Stripe Transfer API

**Endpoint:** `POST https://api.stripe.com/v1/transfers`

**Request:**
```json
{
  "amount": 1000,  // Amount in cents ($10.00 * 100)
  "currency": "usd",
  "destination": "acct_1ABC123XYZ",  // Stripe Express account ID
  "description": "Withdrawal for payout #42",
  "metadata": {
    "payout_id": "42",
    "user_id": "5"
  }
}
```

**Response:**
```json
{
  "id": "tr_1ABC123XYZ",
  "object": "transfer",
  "amount": 1000,
  "currency": "usd",
  "status": "pending"  // Will become "paid" or "failed"
}
```

**Status Check:** `GET https://api.stripe.com/v1/transfers/tr_1ABC123XYZ`

**Webhook:** `transfer.paid` or `transfer.failed`

**Transfer Fee:** 0.25% + $0.25 (for US transfers)  
**Platform absorbs fees** - Host receives full requested amount

---

## 🔧 Technical Implementation

### Goroutine Architecture

```go
// Main HTTP handler (returns immediately)
func RequestWithdrawal(c *gin.Context) {
    // ... validation ...
    
    // Database transaction
    tx := db.Begin()
    // ... deduct balance ...
    // ... create payout ...
    tx.Commit()
    
    // Launch async transfer (non-blocking!)
    go processWithdrawal(DB, payout.ID, paymentAccount)
    
    // Return immediately to user
    c.JSON(200, gin.H{"message": "Withdrawal submitted"})
}

// Background goroutine (async)
func processWithdrawal(db *gorm.DB, payoutID uint, account PaymentAccount) {
    // Mark as processing
    payout.Status = "processing"
    db.Save(&payout)
    
    // Call transfer API
    if account.IsPaystack() {
        transferID, err = initiatePaystackTransfer(db, &payout, &account)
    } else {
        transferID, err = initiateStripeTransfer(db, &payout, &account)
    }
    
    // Save transfer ID
    payout.GatewayTransferID = &transferID
    db.Save(&payout)
    
    // Start status polling (nested goroutine!)
    go pollTransferStatus(db, payoutID, account.Gateway, transferID)
}

// Nested goroutine (status polling)
func pollTransferStatus(db *gorm.DB, payoutID uint, gateway string, transferID string) {
    maxAttempts := 20  // 20 * 30s = 10 minutes
    
    for attempt := 0; attempt < maxAttempts; attempt++ {
        time.Sleep(30 * time.Second)  // Wait 30 seconds
        
        // Check if webhook already updated status
        var payout models.Payout
        db.First(&payout, payoutID)
        if payout.Status == "completed" || payout.Status == "failed" {
            return  // Webhook handled it!
        }
        
        // Query gateway for status
        status, err := checkTransferStatus(gateway, transferID)
        
        if status == "success" || status == "paid" {
            payout.MarkAsCompleted(transferID)
            db.Save(&payout)
            return
        } else if status == "failed" {
            payout.MarkAsFailed("Transfer failed")
            db.Save(&payout)
            return
        }
        
        // Still pending, continue polling...
    }
    
    // Max attempts reached
    log.Printf("Polling timeout for payout %d\n", payoutID)
}
```

**Why This Architecture?**
1. **Non-blocking**: HTTP request returns immediately
2. **Resilient**: Polling continues even if webhook fails
3. **Efficient**: Webhook stops polling when it confirms
4. **Recoverable**: Database stores transfer_id for manual checking
5. **Scalable**: Each withdrawal runs in its own goroutine

---

## 💰 Withdrawal Sources

### Source 1: Token Wallet (`source_type: "tokens"`)

**Balance Query:**
```sql
SELECT token_balance FROM user_wallets WHERE user_id = ?
```

**Conversion:** 1 token = $0.10 USD

**Example:**
- Host has 1,000 tokens
- Requests withdrawal of $50 USD
- Required: 500 tokens (50 / 0.10)
- After withdrawal: 500 tokens remaining

**Database Updates:**
```go
wallet.TokenBalance -= requiredTokens
db.Save(&wallet)

tokenTx := TokenTransaction{
    UserID: userID,
    Amount: requiredTokens,
    TransactionType: "payout",
    Status: "completed",
}
db.Create(&tokenTx)
```

---

### Source 2: Gateway Earnings (`source_type: "gateway_earnings"`)

**Balance Query:**
```sql
SELECT COALESCE(SUM(net_amount), 0) 
FROM gateway_earnings 
WHERE host_id = ? 
  AND currency = ? 
  AND is_withdrawn = false
```

**Example:**
- Host earned ₦10,000 from 5 ticket sales (85% of each)
- Requests withdrawal of ₦5,000
- System marks oldest earnings as withdrawn until total >= ₦5,000

**Database Updates:**
```go
var earnings []GatewayEarning
db.Where("host_id = ? AND is_withdrawn = false", hostID).
   Order("created_at ASC").Find(&earnings)

remainingAmount := requestedAmount
for i := range earnings {
    if remainingAmount <= 0 { break }
    
    if earnings[i].NetAmount <= remainingAmount {
        earnings[i].IsWithdrawn = true
        earnings[i].WithdrawnAt = &now
        remainingAmount -= earnings[i].NetAmount
        db.Save(&earnings[i])
    }
}
```

---

## 🔐 Security & Validation

### Payment Account Verification
```go
// Check account exists and belongs to user
var account PaymentAccount
if err := db.Where("id = ? AND user_id = ?", accountID, userID).First(&account).Error; err != nil {
    return errors.New("Account not found")
}

// Verify account is verified
if !account.IsVerified {
    return errors.New("Account not verified")
}
```

### Currency Matching
```go
// Prevent currency mismatch attacks
if account.Currency != req.Currency {
    return errors.New("Currency mismatch")
}
```

### Minimum Amount Enforcement
```go
minimumAmount := account.MinimumWithdrawalAmount()
// Returns: $5 (USD), ₦2,000 (NGN), €5 (EUR), etc.

if req.Amount < minimumAmount {
    return errors.New("Below minimum")
}
```

### Balance Verification
```go
// For tokens
if wallet.TokenBalance < requiredTokens {
    return errors.New("Insufficient tokens")
}

// For gateway earnings
if totalEarnings < requestedAmount {
    return errors.New("Insufficient earnings")
}
```

### Atomic Transactions
```go
tx := db.Begin()
defer func() {
    if r := recover(); r != nil {
        tx.Rollback()
    }
}()

// ... deduct balance ...
// ... create payout ...

if err := tx.Commit().Error; err != nil {
    return errors.New("Transaction failed")
}
```

---

## 📊 Database Schema Updates

### Payout Table (already exists, using new fields)
```go
type Payout struct {
    ID               uint
    UserID           uint
    PayoutType       string  // "tokens" or "gateway_earnings"
    PayoutMethod     string  // "bank_transfer"
    AmountValue      *float64
    AmountCurrency   *string
    Status           string  // "pending", "processing", "completed", "failed"
    
    // NEW FIELDS (Phase 3 Week 2)
    GatewayTransferID *string  // Paystack transfer_code or Stripe transfer ID
    PaymentAccountID  *uint    // FK to payment_accounts
}
```

### Payment Account (from Phase 3 Week 1)
```go
type PaymentAccount struct {
    ID                    uint
    UserID                uint
    Gateway               string  // "paystack" or "stripe"
    
    // Paystack fields
    PaystackRecipientCode *string
    BankCode              *string
    AccountNumber         *string
    
    // Stripe fields
    StripeAccountID       *string
    StripeCountry         *string
    
    IsVerified            bool
    LastUsedAt            *time.Time  // Updated on each withdrawal
}
```

### Gateway Earning (from Phase 2 Week 1)
```go
type GatewayEarning struct {
    ID                 uint
    HostID             uint
    GrossAmount        float64
    PlatformCommission float64  // 15%
    NetAmount          float64  // 85%
    Currency           string
    
    // NEW USAGE (Phase 3 Week 2)
    IsWithdrawn        bool      // Marked true when withdrawn
    WithdrawnAt        *time.Time
}
```

---

## 🧪 Testing Guide

### Test Case 1: Paystack Withdrawal (Nigerian Host)

**Setup:**
```bash
# 1. Register user
curl -X POST http://localhost:8080/api/auth/register \
  -d '{"username":"nigerian_host","email":"host@test.ng","password":"test123"}'

# 2. Login and get token
TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -d '{"email":"host@test.ng","password":"test123"}' | jq -r '.token')

# 3. Link Nigerian bank account
curl -X POST http://localhost:8080/api/payment-accounts/paystack \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "bank_code": "058",
    "account_number": "0123456789",
    "currency": "NGN",
    "is_primary": true
  }'
# Returns: account_id = 1

# 4. Simulate earnings (manual DB insert or via ticket purchase)
# INSERT INTO gateway_earnings (host_id, net_amount, currency, is_withdrawn)
# VALUES (1, 5000.00, 'NGN', false);
```

**Execute Withdrawal:**
```bash
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000.00,
    "currency": "NGN",
    "payment_account_id": 1,
    "source_type": "gateway_earnings"
  }'
```

**Expected Response:**
```json
{
  "message": "Withdrawal request submitted successfully",
  "payout_id": 1,
  "amount": 5000.00,
  "currency": "NGN",
  "status": "pending"
}
```

**Backend Logs:**
```
INFO: Transfer initiated for payout 1. Transfer ID: TRF_abc123
INFO: Payout 1 still pending (attempt 1/20). Status: pending
INFO: Payout 1 still pending (attempt 2/20). Status: pending
SUCCESS: Payout 1 completed. Transfer ID: TRF_abc123
```

**Verify:**
```bash
# Check payout status
curl -X GET http://localhost:8080/api/payouts/details/1 \
  -H "Authorization: Bearer $TOKEN"
  
# Should show: status = "completed", gateway_transfer_id = "TRF_abc123"
```

---

### Test Case 2: Stripe Withdrawal (US Host)

**Setup:**
```bash
# 1. Register US host
curl -X POST http://localhost:8080/api/auth/register \
  -d '{"username":"us_host","email":"host@test.us","password":"test123"}'

TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -d '{"email":"host@test.us","password":"test123"}' | jq -r '.token')

# 2. Create Stripe Connect account
RESPONSE=$(curl -X POST http://localhost:8080/api/payment-accounts/stripe/connect \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "country": "US",
    "currency": "USD",
    "is_primary": true
  }')

ACCOUNT_ID=$(echo $RESPONSE | jq -r '.account.id')
ONBOARDING_URL=$(echo $RESPONSE | jq -r '.onboarding_url')

# 3. Open onboarding URL in browser (manual step)
echo "Complete onboarding at: $ONBOARDING_URL"

# 4. Check status (poll until verified)
curl -X GET "http://localhost:8080/api/payment-accounts/stripe/acct_123/status" \
  -H "Authorization: Bearer $TOKEN"
# Wait until charges_enabled = true

# 5. Simulate earnings
# INSERT INTO gateway_earnings (host_id, net_amount, currency, is_withdrawn)
# VALUES (2, 50.00, 'USD', false);
```

**Execute Withdrawal:**
```bash
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.00,
    "currency": "USD",
    "payment_account_id": '$ACCOUNT_ID',
    "source_type": "gateway_earnings"
  }'
```

**Expected Response:**
```json
{
  "message": "Withdrawal request submitted successfully",
  "payout_id": 2,
  "amount": 50.00,
  "currency": "USD",
  "status": "pending"
}
```

---

### Test Case 3: Token Withdrawal

**Setup:**
```bash
# User has 1,000 tokens from purchases
# INSERT INTO user_wallets (user_id, token_balance) VALUES (1, 1000);
```

**Execute:**
```bash
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 50.00,
    "currency": "USD",
    "payment_account_id": 1,
    "source_type": "tokens"
  }'
```

**Validation:**
- 50 USD requires 500 tokens (50 / 0.10)
- Wallet balance: 1000 - 500 = 500 tokens remaining
- Token transaction created with type="payout", amount=500

---

### Test Case 4: Error Scenarios

**Insufficient Balance:**
```bash
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 10000.00,
    "currency": "NGN",
    "payment_account_id": 1,
    "source_type": "gateway_earnings"
  }'

# Expected: 400 Bad Request
# "error": "Insufficient earnings. Available: 5000.00 NGN, Requested: 10000.00 NGN"
```

**Unverified Account:**
```bash
# Try to withdraw before completing Stripe onboarding
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 10.00,
    "currency": "USD",
    "payment_account_id": 2,
    "source_type": "tokens"
  }'

# Expected: 400 Bad Request
# "error": "Payment account is not verified. Complete verification first."
```

**Below Minimum:**
```bash
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 1000.00,
    "currency": "NGN",
    "payment_account_id": 1,
    "source_type": "gateway_earnings"
  }'

# Expected: 400 Bad Request
# "error": "Amount below minimum withdrawal of 2000.00 NGN"
```

**Currency Mismatch:**
```bash
# Account is NGN, but requesting USD withdrawal
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "amount": 50.00,
    "currency": "USD",
    "payment_account_id": 1,
    "source_type": "tokens"
  }'

# Expected: 400 Bad Request
# "error": "Currency mismatch. Account currency is NGN, but you requested USD"
```

---

## 🔄 Recovery & Persistence

### Server Restart Recovery
When server restarts with transfers in-flight:

**Problem:** Goroutines are lost on restart

**Solution:** Database persistence
```go
// On server startup, query for stalled transfers
var stalledPayouts []Payout
db.Where("status = ? AND updated_at < ?", "processing", time.Now().Add(-15*time.Minute)).
   Find(&stalledPayouts)

// Resume polling for each
for _, payout := range stalledPayouts {
    if payout.GatewayTransferID != nil {
        go pollTransferStatus(db, payout.ID, payout.Gateway, *payout.GatewayTransferID)
    }
}
```

### Manual Status Check
For transfers stuck in "processing":

```bash
# Check Paystack
curl -X GET https://api.paystack.co/transfer/TRF_abc123 \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY"

# Check Stripe
curl -X GET https://api.stripe.com/v1/transfers/tr_123 \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY"

# Update database manually if needed
UPDATE payouts SET status = 'completed', gateway_transfer_id = 'TRF_abc123' WHERE id = 1;
```

---

## 📈 Performance Considerations

### Goroutine Limits
- Each withdrawal spawns 2 goroutines (process + poll)
- Max concurrent: Unlimited (Go handles scheduling)
- Memory per goroutine: ~2KB
- 1,000 withdrawals = ~2MB memory

### Database Connections
- Each goroutine uses DB connection pool
- Configure pool size in main.go:
```go
sqlDB, _ := DB.DB()
sqlDB.SetMaxOpenConns(100)
sqlDB.SetMaxIdleConns(10)
```

### API Rate Limits
- **Paystack:** 100 requests/minute
- **Stripe:** 100 requests/second
- Polling at 30s intervals stays well under limits

### Webhook vs Polling
- **Webhook:** Instant update (preferred)
- **Polling:** Fallback if webhook fails
- Both update same database field (idempotent)

---

## 🚨 Error Handling

### Transfer API Failures
```go
transferID, err := initiatePaystackTransfer(db, &payout, &account)
if err != nil {
    // Mark payout as failed
    payout.MarkAsFailed(err.Error())
    db.Save(&payout)
    
    // Log for investigation
    log.Printf("ERROR: Transfer failed for payout %d: %v\n", payout.ID, err)
    return
}
```

### Status Polling Timeouts
```go
// After 20 attempts (10 minutes)
if attempt >= maxAttempts {
    log.Printf("WARN: Payout %d polling timeout. Check manually.\n", payoutID)
    // Payout remains in "processing" status
    // Admin can manually investigate and update
}
```

### Database Transaction Failures
```go
if err := tx.Commit().Error; err != nil {
    c.JSON(500, gin.H{"error": "Failed to commit transaction"})
    return
}
// Balance NOT deducted if commit fails (atomic)
```

---

## 🎯 Key Achievements

✅ **Dual Gateway Support** - Seamless Paystack + Stripe integration  
✅ **Async Processing** - Non-blocking HTTP responses  
✅ **Status Tracking** - Real-time updates via polling + webhooks  
✅ **Error Recovery** - Failed transfers logged and marked  
✅ **Database Persistence** - All transfer IDs stored  
✅ **Currency Support** - NGN, GHS, KES, USD, EUR, GBP  
✅ **Balance Validation** - Atomic transactions prevent double-spending  
✅ **Goroutine Architecture** - Scalable concurrent processing  

---

## 📋 Next Steps: Phase 3 Week 3

### 1. Session Creation Validation
Update scheduled event handler to check for verified bank account:
```go
func CreateScheduledEvent(c *gin.Context) {
    if event.WatchType == "paid" {
        // Check for verified payment account
        var account PaymentAccount
        if err := db.Where("user_id = ? AND is_verified = ?", hostID, true).
                     First(&account).Error; err != nil {
            c.JSON(400, gin.H{
                "error": "You must link a verified bank account before creating paid sessions",
                "redirect": "/payment"
            })
            return
        }
    }
    
    // ... continue with event creation ...
}
```

### 2. Frontend Payment Page
Build React component with sections:
- **Balance Display:** Show tokens + gateway earnings (85%/15% breakdown)
- **Bank Accounts:** List with primary indicator, add/remove buttons
- **Withdrawal Form:** Amount input, currency dropdown, account selector
- **Transaction History:** Table with status tracking (pending/processing/completed)
- **Stripe Onboarding:** Redirect to onboarding URL for international hosts

### 3. End-to-End Testing
Complete payment cycle:
1. User purchases ticket → Host earns 85%
2. Host links bank account (Paystack or Stripe)
3. Host withdraws earnings
4. Goroutine tracks transfer status
5. Webhook confirms completion
6. Balance updates in UI

---

## 🎓 Documentation References

- **PHASE3_WEEK1_COMPLETE.md** - Payment account management foundation
- **AUTOMATED_PAYOUT_MODEL.md** - Payout architecture reference
- **PAYMENT_API_REFERENCE.md** - All payment APIs
- **PLATFORM_PAYMENT_SETUP.md** - Platform owner setup guide

---

## ✅ Acceptance Criteria Met

| Requirement | Status | Notes |
|-------------|--------|-------|
| Stripe Connect account creation | ✅ | POST /api/payment-accounts/stripe/connect |
| Onboarding link generation | ✅ | Returns URL with 1-hour expiry |
| Account status checking | ✅ | GET /api/payment-accounts/stripe/:id/status |
| Link refresh for expired accounts | ✅ | POST /api/payment-accounts/stripe/:id/refresh-link |
| Withdrawal request handler | ✅ | POST /api/withdrawals/request |
| Balance validation | ✅ | Tokens and gateway earnings |
| Paystack transfer execution | ✅ | initiatePaystackTransfer function |
| Stripe transfer execution | ✅ | initiateStripeTransfer function |
| Goroutine async processing | ✅ | processWithdrawal + pollTransferStatus |
| Status polling (30s intervals) | ✅ | Polls for up to 10 minutes |
| Database persistence | ✅ | gateway_transfer_id stored |
| Error handling | ✅ | Failed transfers marked |
| Backend compiles | ✅ | No errors |

---

## 📊 Implementation Statistics

- **New Endpoints:** 4
- **New Functions:** 7 (1 handler + 6 helpers)
- **Lines of Code:** 910+ lines
- **Files Created:** 1 (withdrawal_handlers.go)
- **Files Modified:** 3
- **Goroutines Used:** 2 per withdrawal (nested)
- **API Integrations:** 2 (Paystack + Stripe)
- **Status Checks:** Polling every 30s for up to 10 minutes
- **Supported Currencies:** 6 (NGN, GHS, KES, USD, EUR, GBP)

---

**Date Completed:** December 10, 2025  
**Phase Status:** ✅ Phase 3 Week 2 Complete  
**Next Milestone:** Phase 3 Week 3 - Session Validation & Frontend UI  
**Backend Status:** ✅ Compiles successfully  
**Total Payment APIs:** 44 endpoints (10 + 26 + 5 + 4)
