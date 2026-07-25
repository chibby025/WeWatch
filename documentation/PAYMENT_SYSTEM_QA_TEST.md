# Payment System QA Test Plan
**Date:** April 25, 2026  
**Tester:** Chibuzor  
**Environment:** Development (localhost)  
**Status:** IN PROGRESS

---

## Test Objectives

1. **Validate Revenue Model**: Confirm all revenue calculations match documented model
2. **Verify Payment Flows**: Test token purchases, ticket sales, donations, gifts
3. **Check Auto-Approval Logic**: Validate payout auto-approval conditions
4. **Audit Trail**: Ensure all transactions are logged correctly
5. **Performance**: Measure API response times for payment endpoints
6. **Security**: Verify input validation and authorization checks

---

## Pre-Test Code Audit Results ✅

### Bug Fixed (April 25, 2026)
**BUG-001: Gateway Ticket Commission Incorrect**
- **Location**: `backend/internal/handlers/ticket_handlers.go:288`
- **Issue**: Comment said 15% but code used `0.25` (25%)
- **Fix**: Changed to `0.15` (15%)
- **Impact**: HIGH - Would have taken 10% extra from hosts
- **Status**: ✅ FIXED

### Revenue Model Verification (Code Audit)
| Revenue Stream | Expected | Code Location | Status |
|----------------|----------|---------------|--------|
| Token Spread | ₦43/token (26%) | wallet_handlers.go:166-167 | ✅ CORRECT |
| Token Spending | Host 100% | ticket_handlers.go:193 | ✅ CORRECT |
| In-Session Donations | Host 95%, Platform 5% | donation_handlers.go:132-133 | ✅ CORRECT |
| Wallet Gifts | Recipient 95%, Platform 5% | donation_handlers.go:472-478 | ✅ CORRECT |
| Ticket Transfer Fee | 5% | ticket_handlers.go:118 | ✅ CORRECT |
| Gateway Donations | Host 85%, Platform 15% | donation_handlers.go:182-183 | ✅ CORRECT |
| Gateway Tickets | Host 85%, Platform 15% | ticket_handlers.go:288 | ✅ FIXED |

---

## Test Cases

### TC-PAY-001: Token Purchase (Paystack)
**Priority:** P0 (Critical)  
**Prerequisites:** Test user with ₦0 balance

**Steps:**
1. Navigate to user wallet
2. Click "Purchase Tokens"
3. Enter amount: 1650 tokens (₦165)
4. Complete Paystack payment (test card)
5. Verify webhook processing

**Expected Results:**
- ✅ Wallet balance increases by 1650 tokens
- ✅ Platform accounting: ₦41.25 revenue (25%), ₦123.75 reserve (75%)
- ✅ Transaction record created with status "completed"
- ✅ Transfer IDs logged (revenue_transfer_id, reserve_transfer_id)

**Test Data:**
- Amount: ₦165 (1650 tokens)
- Paystack Test Card: 4084084084084081, 12/25, 408

---

### TC-PAY-002: Ticket Purchase with Tokens (100% to Host)
**Priority:** P0 (Critical)  
**Prerequisites:** Viewer with 500 tokens, Host session with ₦100 ticket price

**Steps:**
1. Viewer joins paid session
2. Purchase ticket with tokens (100 tokens)
3. Verify wallet balances

**Expected Results:**
- ✅ Viewer wallet: -100 tokens
- ✅ Host wallet: +100 tokens (100% of spending, NO platform commission)
- ✅ Transaction type: "ticket"
- ✅ Platform accounting: NO change (profit already captured on token purchase)

**Calculation Verification:**
```
Viewer pays: 100 tokens
Host receives: 100 tokens (100%)
Platform commission: 0 tokens (profit from spread: ₦4.3 per token = ₦430 already in reserve)
```

---

### TC-PAY-003: Gateway Ticket Purchase (15% Commission)
**Priority:** P0 (Critical)  
**Prerequisites:** Session with ₦500 ticket price, Paystack enabled

**Steps:**
1. Purchase ticket via Paystack
2. Verify gateway earning record
3. Check commission split

**Expected Results:**
- ✅ Gross amount: ₦500
- ✅ Platform commission: ₦75 (15%)
- ✅ Host net amount: ₦425 (85%)
- ✅ Gateway earning status: "pending" (until webhook confirms)
- ✅ After webhook: Status "completed"

---

### TC-PAY-004: In-Session Donation (5% Fee)
**Priority:** P0 (Critical)  
**Prerequisites:** Active session, Donor with 100 tokens

**Steps:**
1. Donor sends 100 tokens to host during session
2. Verify wallet updates
3. Check platform accounting

**Expected Results:**
- ✅ Donor wallet: -100 tokens
- ✅ Host wallet: +95 tokens (95%)
- ✅ Platform commission: 5 tokens (5%)
- ✅ Transaction type: "donation"
- ✅ Platform accounting: RecordTokenDonationCommission(5.0) called

**Calculation Verification:**
```
Donation: 100 tokens
Host receives: 95 tokens (95%)
Platform fee: 5 tokens (5%)
₦ Value: 5 tokens × ₦1.65 = ₦8.25 commission
```

---

### TC-PAY-005: Wallet-to-Wallet Gift (5% Fee)
**Priority:** P1 (High)  
**Prerequisites:** Sender with 200 tokens, Recipient with ₦0 balance, Both in same room

**Steps:**
1. Sender gifts 200 tokens to recipient
2. Verify both wallets
3. Check transaction records

**Expected Results:**
- ✅ Sender wallet: -200 tokens
- ✅ Recipient wallet: +190 tokens (95%)
- ✅ Platform commission: 10 tokens (5%)
- ✅ Transaction records for both users

**Validation:**
- Verify sender and recipient are room members (authorization check)
- Prevent self-gifting (error message)

---

### TC-PAY-006: Ticket Transfer Fee (5%)
**Priority:** P1 (High)  
**Prerequisites:** Buyer with 200 tokens, Recipient user, Session with 100-token ticket

**Steps:**
1. Buy ticket with gift_to_user_id parameter
2. Verify ticket ownership
3. Check transfer fee

**Expected Results:**
- ✅ Buyer pays: 105 tokens (100 ticket + 5 transfer fee)
- ✅ Host receives: 100 tokens (full ticket price)
- ✅ Platform collects: 5 tokens transfer fee (separate revenue stream)
- ✅ Ticket assigned to recipient, not buyer
- ✅ Platform accounting: TransferFeeRevenue += ₦8.25

---

### TC-PAY-007: Auto-Approval Payout (Small Amount)
**Priority:** P0 (Critical)  
**Prerequisites:** Host with ₦8,000 balance, KYC verified, not first-time withdrawal

**Steps:**
1. Request payout of ₦5,000 (bank transfer)
2. Check auto-approval status
3. Verify processing

**Expected Results:**
- ✅ Auto-approve: YES (< ₦10,000, KYC verified, not first-time, bank transfer)
- ✅ Status: "processing" immediately
- ✅ Background goroutine starts Paystack transfer
- ✅ Wallet balance reserved (not deducted until completion)

**shouldAutoApprovePayout() Logic:**
```go
✅ Payment method == "bank_transfer"
✅ Amount < ₦10,000
✅ KYC verified
✅ Not first-time withdrawal
→ RESULT: true (auto-approve)
```

---

### TC-PAY-008: Admin Auto-Approval Bypass
**Priority:** P1 (High)  
**Prerequisites:** Admin user with any balance

**Steps:**
1. Admin requests payout of ₦50,000 (exceeds ₦10,000 limit)
2. Check auto-approval

**Expected Results:**
- ✅ Auto-approve: YES (admin bypass logic triggers)
- ✅ Log: "✅ Auto-approve: YES - Admin/Super Admin bypass (role: admin)"
- ✅ Status: "processing"

**Code Validation:**
```go
if userRole == "admin" || userRole == "super_admin" {
    return true  // ← This line should execute
}
```

---

### TC-PAY-009: Manual Approval Required (Large Amount)
**Priority:** P1 (High)  
**Prerequisites:** Regular user with ₦50,000 balance, first-time withdrawal

**Steps:**
1. Request payout of ₦50,000
2. Check approval status

**Expected Results:**
- ✅ Auto-approve: NO (> ₦10,000 OR first-time)
- ✅ Status: "pending"
- ✅ Awaits admin approval in dashboard
- ✅ Email notification to admins (future feature)

---

### TC-PAY-010: Platform Accounting Accuracy
**Priority:** P0 (Critical)  
**Prerequisites:** Fresh database state

**Steps:**
1. Execute 10 token purchases (₦1,650 total)
2. Execute 5 ticket purchases (500 tokens)
3. Execute 3 donations (150 tokens)
4. Execute 2 wallet gifts (100 tokens)
5. Query platform_accounting table

**Expected Results:**
- ✅ Total GMV: ₦1,650
- ✅ Platform profit: ₦412.50 (25% of purchases)
- ✅ Reserve balance: ₦1,237.50 (75% of purchases)
- ✅ Token donation commission: ₦24.75 (15 tokens × ₦1.65)
- ✅ Wallet gift commission: ₦8.25 (5 tokens × ₦1.65)
- ✅ Transfer fee revenue: ₦0 (no gifted tickets)

**Formula Validation:**
```
Token Purchases: 10 × ₦165 = ₦1,650
Platform Profit: ₦1,650 × 0.25 = ₦412.50 ✅
Reserve: ₦1,650 × 0.75 = ₦1,237.50 ✅

Token Spending (500 tokens): Host gets 100%, NO platform cut ✅

Donation Commission: 15 tokens (5% of 300) × ₦1.65 = ₦24.75 ✅
Gift Commission: 5 tokens (5% of 100) × ₦1.65 = ₦8.25 ✅

Total Platform Profit: ₦412.50 + ₦24.75 + ₦8.25 = ₦445.50
```

---

### TC-PAY-011: Transaction Audit Trail
**Priority:** P1 (High)  
**Prerequisites:** Any completed payment flow

**Steps:**
1. Query token_transactions table
2. Verify all fields populated
3. Check transfer ID tracking

**Expected Results:**
- ✅ All transactions logged with timestamps
- ✅ revenue_transfer_id present for purchases
- ✅ reserve_transfer_id present for purchases
- ✅ Transaction types correct: "purchase", "ticket", "donation", "gift", "transfer_fee"
- ✅ USD values calculated (token × 0.10)
- ✅ Status always "completed" for successful transactions

---

### TC-PAY-012: Negative Test - Insufficient Balance
**Priority:** P1 (High)  
**Prerequisites:** User with 50 tokens

**Steps:**
1. Attempt to purchase 100-token ticket
2. Observe error handling

**Expected Results:**
- ✅ Transaction fails with error: "Insufficient tokens"
- ✅ Wallet balance unchanged
- ✅ No partial deduction
- ✅ HTTP 400 Bad Request response

---

### TC-PAY-013: Negative Test - Invalid Payment Amount
**Priority:** P2 (Medium)  
**Prerequisites:** Any payment endpoint

**Steps:**
1. Send request with negative amount
2. Send request with zero amount
3. Send request with amount > max limit

**Expected Results:**
- ✅ Validation error: "Invalid amount"
- ✅ HTTP 400 Bad Request
- ✅ No database changes

---

### TC-PAY-014: Performance - Payment API Response Time
**Priority:** P1 (High)  
**Tools:** K6 or curl with time measurement

**Steps:**
1. Measure GET /api/wallet/:userId (wallet fetch)
2. Measure POST /api/tokens/purchase (token purchase)
3. Measure POST /api/sessions/:id/tickets/purchase (ticket purchase)
4. Measure POST /api/donations/gift (wallet gift)

**Expected Results:**
- ✅ GET /api/wallet/:userId < 100ms
- ✅ POST /api/tokens/purchase < 500ms (includes Paystack API call)
- ✅ POST /api/sessions/:id/tickets/purchase < 200ms (token payment)
- ✅ POST /api/donations/gift < 150ms

---

### TC-PAY-015: Security - Authorization Checks
**Priority:** P0 (Critical)  
**Prerequisites:** Two test users (user A, user B)

**Steps:**
1. User A attempts to gift tokens from User B's wallet
2. User A attempts to view User B's wallet balance
3. Non-admin attempts to approve payout

**Expected Results:**
- ✅ Gift attempt: HTTP 401 Unauthorized (user ID from JWT, not request)
- ✅ Wallet view: HTTP 403 Forbidden
- ✅ Payout approval: HTTP 403 Forbidden (RequireAdmin middleware)

---

## Performance Benchmarks

| Endpoint | Target | Measured | Status |
|----------|--------|----------|--------|
| GET /api/wallet/:userId | < 100ms | TBD | ⏳ |
| POST /api/tokens/purchase | < 500ms | TBD | ⏳ |
| POST /api/sessions/:id/tickets/purchase | < 200ms | TBD | ⏳ |
| POST /api/sessions/:id/donate | < 150ms | TBD | ⏳ |
| POST /api/donations/gift | < 150ms | TBD | ⏳ |
| POST /api/payouts/request | < 300ms | TBD | ⏳ |

---

## Test Execution Log

### Session 1: April 25, 2026

**Time:** TBD  
**Tester:** Chibuzor  
**Environment:** WSL Ubuntu 22.04, PostgreSQL 14, Go 1.21

| Test Case | Status | Notes | Time |
|-----------|--------|-------|------|
| TC-PAY-001 | ⏳ | Token purchase | - |
| TC-PAY-002 | ⏳ | Token ticket | - |
| TC-PAY-003 | ⏳ | Gateway ticket | - |
| TC-PAY-004 | ⏳ | Donation | - |
| TC-PAY-005 | ⏳ | Wallet gift | - |
| TC-PAY-006 | ⏳ | Ticket transfer | - |
| TC-PAY-007 | ⏳ | Auto-approval | - |
| TC-PAY-008 | ⏳ | Admin bypass | - |
| TC-PAY-009 | ⏳ | Manual approval | - |
| TC-PAY-010 | ⏳ | Accounting | - |
| TC-PAY-011 | ⏳ | Audit trail | - |
| TC-PAY-012 | ⏳ | Insufficient balance | - |
| TC-PAY-013 | ⏳ | Invalid amount | - |
| TC-PAY-014 | ⏳ | Performance | - |
| TC-PAY-015 | ⏳ | Authorization | - |

---

## Bugs Found

### BUG-001: Gateway Ticket Commission Incorrect ✅ FIXED
**Severity:** HIGH  
**Status:** FIXED  
**Details:** See Pre-Test Code Audit section

---

## Test Summary

**Total Test Cases:** 15  
**Executed:** 0  
**Passed:** 0  
**Failed:** 0  
**Blocked:** 0  

**Pass Rate:** TBD  
**Critical Bugs:** 1 (fixed pre-test)  
**High Bugs:** 0  
**Medium Bugs:** 0  
**Low Bugs:** 0

---

## Next Steps

1. ✅ Start backend server (port 8080)
2. ✅ Start frontend dev server (port 5173)
3. ⏳ Create test users with SQL seed data
4. ⏳ Execute test cases TC-PAY-001 to TC-PAY-015
5. ⏳ Document results with screenshots
6. ⏳ Generate performance metrics with curl timing
7. ⏳ Update letswatchout-qa-portfolio repository with findings
8. ⏳ Create professional test report for portfolio

---

**Status:** READY TO BEGIN TESTING
