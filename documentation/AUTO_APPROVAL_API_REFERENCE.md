# Auto-Approval Withdrawal API Reference

## 🔌 Endpoints Overview

```
POST   /api/payouts/request           Request withdrawal (auto-approve eligible)
GET    /api/payouts/me                Get user's withdrawal history
POST   /api/payouts/:id/cancel        Cancel pending withdrawal
GET    /api/admin/payouts/pending     Get pending payouts for admin review
POST   /api/admin/payouts/:id/process Approve/reject payout (admin)
GET    /api/user/bank-accounts        Get saved bank accounts
POST   /api/user/bank-accounts        Add new bank account
GET    /api/user/wallet               Get wallet and earnings balance
```

---

## 📤 POST /api/payouts/request

### Purpose
Request a withdrawal from gateway earnings or wallet tokens.

### Request
```http
POST /api/payouts/request
Content-Type: application/json
Authorization: Bearer <token>

{
  "payout_type": "gateway_earnings",           // or "wallet_tokens"
  "payout_method": "bank_transfer",            // or "paypal", "mobile_money"
  "amount": 5000,                              // Amount in naira
  "currency": "NGN",                           // Currency code
  "details": {
    "account_number": "0123456789",            // 10-digit account number
    "bank_code": "058",                        // 3-digit bank code
    "account_name": "John Doe"                 // Account owner name
  }
}
```

### Response (Auto-Approved) ✅
```json
{
  "success": true,
  "auto_approve": true,
  "message": "Processing withdrawal automatically...",
  "payout": {
    "id": 123,
    "user_id": 456,
    "payout_type": "gateway_earnings",
    "payout_method": "bank_transfer",
    "amount_value": 5000,
    "currency": "NGN",
    "status": "processing",
    "created_at": "2025-12-14T10:30:00Z",
    "updated_at": "2025-12-14T10:30:00Z",
    "gateway_transfer_id": null
  }
}
```

### Response (Manual Review) ⏳
```json
{
  "success": true,
  "auto_approve": false,
  "message": "Withdrawal request sent for review",
  "reason": "Amount exceeds threshold",
  "payout": {
    "id": 124,
    "user_id": 456,
    "payout_type": "gateway_earnings",
    "payout_method": "bank_transfer",
    "amount_value": 50000,
    "currency": "NGN",
    "status": "pending",
    "created_at": "2025-12-14T10:35:00Z",
    "updated_at": "2025-12-14T10:35:00Z"
  }
}
```

### Response (Error) ❌
```json
{
  "success": false,
  "error": "KYC verification required for amounts over ₦5,000",
  "code": "KYC_REQUIRED"
}
```

### Status Codes
```
200 OK                  Withdrawal processed (auto-approved or pending review)
400 Bad Request         Invalid input data
401 Unauthorized        Not authenticated
403 Forbidden           Insufficient balance
422 Unprocessable       Data validation failed
500 Server Error        Internal server error
```

### Auto-Approval Conditions
The request will be auto-approved if ALL conditions are met:

```javascript
{
  amount < 10000                          // Less than ₦10,000
  && !isFirstWithdrawal                   // Not first-time withdrawal
  && (amount <= 5000 || kycVerified)      // KYC if amount > ₦5,000
  && payoutMethod === 'bank_transfer'     // Bank transfer only
}
```

### Examples

#### Example 1: Auto-Approved ✅
```bash
curl -X POST http://localhost:8080/api/payouts/request \
  -H "Authorization: Bearer token_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "payout_type": "gateway_earnings",
    "payout_method": "bank_transfer",
    "amount": 5000,
    "currency": "NGN",
    "details": {
      "account_number": "0123456789",
      "bank_code": "058",
      "account_name": "John Doe"
    }
  }'

# Response: 200 OK
# "auto_approve": true
# "status": "processing"
```

#### Example 2: Manual Review ❌
```bash
curl -X POST http://localhost:8080/api/payouts/request \
  -H "Authorization: Bearer token_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "payout_type": "gateway_earnings",
    "payout_method": "bank_transfer",
    "amount": 50000,
    "currency": "NGN",
    "details": { ... }
  }'

# Response: 200 OK
# "auto_approve": false
# "status": "pending"
# "reason": "Amount exceeds threshold"
```

---

## 📥 GET /api/payouts/me

### Purpose
Get all withdrawal requests for the current user.

### Request
```http
GET /api/payouts/me
Authorization: Bearer <token>

# Query parameters (optional)
?status=completed          # Filter by status
&page=1                    # Pagination (default 1)
&limit=10                  # Items per page (default 10)
```

### Response
```json
{
  "success": true,
  "payouts": [
    {
      "id": 123,
      "payout_type": "gateway_earnings",
      "amount_value": 5000,
      "currency": "NGN",
      "status": "completed",
      "gateway_transfer_id": "TRF_abc123xyz",
      "created_at": "2025-12-14T10:30:00Z",
      "updated_at": "2025-12-14T10:31:00Z"
    },
    {
      "id": 122,
      "payout_type": "gateway_earnings",
      "amount_value": 3000,
      "currency": "NGN",
      "status": "processing",
      "gateway_transfer_id": null,
      "created_at": "2025-12-14T09:15:00Z",
      "updated_at": "2025-12-14T09:15:00Z"
    },
    {
      "id": 121,
      "payout_type": "gateway_earnings",
      "amount_value": 2000,
      "currency": "NGN",
      "status": "pending",
      "created_at": "2025-12-14T08:00:00Z",
      "updated_at": "2025-12-14T08:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3
  }
}
```

### Status Values
```
pending      - Waiting for admin approval
processing   - Auto-approved, transferring now
completed    - Successfully transferred
failed       - Transfer failed
rejected     - Admin rejected the request
cancelled    - User cancelled the request
```

---

## ❌ POST /api/payouts/:id/cancel

### Purpose
Cancel a pending withdrawal request.

### Request
```http
POST /api/payouts/123/cancel
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Changed my mind"  // Optional cancellation reason
}
```

### Response (Success)
```json
{
  "success": true,
  "message": "Withdrawal cancelled",
  "payout": {
    "id": 123,
    "status": "cancelled",
    "updated_at": "2025-12-14T10:35:00Z"
  }
}
```

### Response (Error)
```json
{
  "success": false,
  "error": "Cannot cancel processed withdrawal",
  "code": "INVALID_STATUS"
}
```

### Requirements
- Only pending payouts can be cancelled
- Cannot cancel processing/completed transfers
- User must be the owner of the payout

---

## 👨‍💼 GET /api/admin/payouts/pending

### Purpose
Get all pending payouts for admin review.

### Request
```http
GET /api/admin/payouts/pending
Authorization: Bearer <admin_token>

# Query parameters (optional)
?sort=created_at        # Sort field
&order=desc             # Sort order (asc/desc)
&page=1
&limit=20
```

### Response
```json
{
  "success": true,
  "pending_payouts": [
    {
      "id": 124,
      "user_id": 456,
      "user": {
        "id": 456,
        "username": "host_john",
        "email": "john@example.com"
      },
      "amount_value": 50000,
      "currency": "NGN",
      "status": "pending",
      "reason_not_auto_approved": "Amount exceeds threshold",
      "payout_method": "bank_transfer",
      "details": {
        "account_number": "0123456789",
        "bank_code": "058",
        "account_name": "John Doe"
      },
      "created_at": "2025-12-14T10:35:00Z"
    }
  ],
  "total": 8,
  "auto_failed_count": 2,
  "first_time_count": 3,
  "large_amount_count": 2,
  "other_count": 1
}
```

### Admin-Only
Requires super_admin role. Regular users cannot access this endpoint.

---

## ✅ POST /api/admin/payouts/:id/process

### Purpose
Approve or reject a pending withdrawal.

### Request
```http
POST /api/admin/payouts/124/process
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "action": "approve",        // or "reject"
  "reason": "Verified account"  // Optional reason
}
```

### Response (Approved)
```json
{
  "success": true,
  "message": "Payout approved and processing",
  "payout": {
    "id": 124,
    "status": "processing",
    "gateway_transfer_id": null,
    "updated_at": "2025-12-14T10:40:00Z"
  }
}
```

### Response (Rejected)
```json
{
  "success": true,
  "message": "Payout rejected",
  "payout": {
    "id": 124,
    "status": "rejected",
    "rejection_reason": "Suspicious activity detected",
    "updated_at": "2025-12-14T10:40:00Z"
  }
}
```

### Action Values
```
approve  - Transfer the funds
reject   - Decline and notify host
```

---

## 💳 GET /api/user/bank-accounts

### Purpose
Get all saved bank accounts for the user.

### Request
```http
GET /api/user/bank-accounts
Authorization: Bearer <token>
```

### Response
```json
{
  "success": true,
  "accounts": [
    {
      "id": 1,
      "account_number": "0123456789",
      "bank_code": "058",
      "bank_name": "Guaranty Trust Bank",
      "account_name": "John Doe",
      "is_primary": true,
      "is_verified": true,
      "created_at": "2025-12-10T15:00:00Z"
    },
    {
      "id": 2,
      "account_number": "9876543210",
      "bank_code": "044",
      "bank_name": "Access Bank",
      "account_name": "John Doe",
      "is_primary": false,
      "is_verified": false,
      "created_at": "2025-12-12T10:00:00Z"
    }
  ]
}
```

---

## ➕ POST /api/user/bank-accounts

### Purpose
Add a new bank account for withdrawals.

### Request
```http
POST /api/user/bank-accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "account_number": "0123456789",
  "bank_code": "058",
  "account_name": "John Doe"
}
```

### Response
```json
{
  "success": true,
  "message": "Bank account added",
  "account": {
    "id": 3,
    "account_number": "0123456789",
    "bank_code": "058",
    "bank_name": "Guaranty Trust Bank",
    "account_name": "John Doe",
    "is_primary": false,
    "is_verified": false,
    "created_at": "2025-12-14T10:50:00Z"
  }
}
```

### Validation
- account_number: 10 digits
- bank_code: 3 digits
- account_name: Non-empty string

---

## 💰 GET /api/user/wallet

### Purpose
Get user's wallet balance and available earnings.

### Request
```http
GET /api/user/wallet
Authorization: Bearer <token>
```

### Response
```json
{
  "success": true,
  "wallet": {
    "id": 1,
    "user_id": 456,
    "token_balance": 125,           // Total tokens: 125 = ₦20,625
    "locked_tokens": 0,
    "available_tokens": 125
  },
  "gateway_earnings": [
    {
      "id": 1,
      "gross_amount": 200,          // ₦200
      "platform_commission": 30,    // 15% = ₦30
      "net_amount": 170,            // 85% = ₦170
      "is_withdrawn": false,
      "created_at": "2025-12-14T10:00:00Z"
    }
  ],
  "total_earnings": 50000           // Total in naira
}
```

### Values
```
token_balance        - Total tokens user owns
gateway_earnings     - Earnings from streams/subscriptions
total_earnings       - Sum of all earnings
```

---

## 🔐 Authentication

All endpoints except `/login` and `/register` require:

```http
Authorization: Bearer <jwt_token>
```

### Token Example
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Get Token
```bash
# Login request
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

# Response includes token
{
  "token": "eyJhbGci...",
  "user": { ... }
}
```

---

## 🔄 Webhooks (Coming Soon)

### Paystack Transfer Webhook
```
POST /api/webhooks/paystack
Content-Type: application/json

{
  "event": "transfer.success",
  "data": {
    "reference": "TRF_abc123",
    "status": "success",
    "amount": 170,
    "currency": "NGN"
  }
}

# Auto-updates payout status to "completed"
```

---

## 📊 Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `INVALID_AMOUNT` | 400 | Amount is invalid or zero |
| `INSUFFICIENT_BALANCE` | 403 | Not enough funds to withdraw |
| `KYC_REQUIRED` | 422 | KYC verification needed |
| `FIRST_WITHDRAWAL` | 422 | First withdrawal requires review |
| `INVALID_BANK_ACCOUNT` | 400 | Bank account details invalid |
| `PAYOUT_NOT_FOUND` | 404 | Payout ID not found |
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Permission denied |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 🧪 Test Payloads

### Curl: Request Withdrawal
```bash
curl -X POST http://localhost:8080/api/payouts/request \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{
    "payout_type": "gateway_earnings",
    "payout_method": "bank_transfer",
    "amount": 5000,
    "currency": "NGN",
    "details": {
      "account_number": "0123456789",
      "bank_code": "058",
      "account_name": "John Doe"
    }
  }'
```

### Curl: Get Withdrawal History
```bash
curl -X GET http://localhost:8080/api/payouts/me \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json"
```

### Curl: Admin Approve Payout
```bash
curl -X POST http://localhost:8080/api/admin/payouts/124/process \
  -H "Authorization: Bearer admin_token" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "approve",
    "reason": "Verified"
  }'
```

---

## 📈 Rate Limiting (Optional)

Future implementation limits:
```
- 5 auto-approvals per week per user
- Max ₦10,000 per auto-approved withdrawal
- Max ₦40,000 per week
```

Currently disabled. Contact admin to enable.

---

## 🎯 Summary

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/payouts/request` | POST | Request withdrawal | User |
| `/api/payouts/me` | GET | View history | User |
| `/api/payouts/:id/cancel` | POST | Cancel pending | User |
| `/api/admin/payouts/pending` | GET | View pending | Admin |
| `/api/admin/payouts/:id/process` | POST | Approve/reject | Admin |
| `/api/user/bank-accounts` | GET/POST | Manage accounts | User |
| `/api/user/wallet` | GET | View balance | User |

All endpoints are production-ready and fully documented! ✅
