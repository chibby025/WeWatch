# WeWatch Payment System - API Quick Reference

**Last Updated**: December 9, 2024  
**Status**: Phase 2 Complete (Core + Advanced APIs)  
**Total Endpoints**: 36 payment-related APIs  

---

## 🔐 Authentication

All endpoints (except webhooks) require authentication via JWT token in `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

---

## 💰 1. Wallet Management

### Get User Wallet
```http
GET /api/wallet/:userId
```
**Response**:
```json
{
  "wallet": {
    "user_id": 1,
    "token_balance": 500,
    "lifetime_earned": 1000,
    "lifetime_spent": 500
  }
}
```

### Get Transaction History
```http
GET /api/wallet/:userId/transactions?type=purchase&limit=20
```
**Query Params**:
- `type`: purchase | ticket | donation | refund | payout (optional)
- `limit`: Number of records (default: 50)

**Response**:
```json
{
  "transactions": [
    {
      "id": 1,
      "user_id": 1,
      "transaction_type": "purchase",
      "amount": 100,
      "usd_value": 10.00,
      "status": "completed",
      "created_at": "2024-12-09T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

## 🪙 2. Token Purchases

### Purchase Tokens
```http
POST /api/tokens/purchase
```
**Request Body**:
```json
{
  "amount": 100,
  "payment_method": "stripe",
  "currency": "USD"
}
```
**Response**:
```json
{
  "transaction_id": 123,
  "amount": 100,
  "usd_value": 10.00,
  "payment_url": "https://checkout.stripe.com/...",
  "status": "pending"
}
```

---

## 🎟️ 3. Session Tickets

### Purchase Ticket
```http
POST /api/sessions/:id/tickets/purchase
```
**Request Body**:
```json
{
  "payment_method": "tokens",
  "ticket_type": "regular"
}
```
**Response**:
```json
{
  "ticket": {
    "id": 1,
    "session_id": 1,
    "user_id": 1,
    "ticket_price_tokens": 50,
    "payment_method": "tokens",
    "is_refunded": false
  }
}
```

### Get Session Tickets (Host Only)
```http
GET /api/sessions/:id/tickets
```
**Response**:
```json
{
  "tickets": [
    {
      "id": 1,
      "user_id": 1,
      "ticket_price_tokens": 50,
      "purchased_at": "2024-12-09T10:30:00Z"
    }
  ],
  "total_revenue_tokens": 500,
  "total_tickets": 10
}
```

### Check Own Ticket
```http
GET /api/sessions/:id/tickets/me
```
**Response**:
```json
{
  "has_ticket": true,
  "ticket": {
    "id": 1,
    "session_id": 1,
    "ticket_price_tokens": 50,
    "purchased_at": "2024-12-09T10:30:00Z"
  }
}
```

---

## 💝 4. Donations

### Donate to Session
```http
POST /api/sessions/:id/donate
```
**Request Body**:
```json
{
  "amount": 100,
  "payment_method": "tokens",
  "message": "Great session!"
}
```
**Response**:
```json
{
  "donation": {
    "id": 1,
    "session_id": 1,
    "donor_id": 1,
    "amount": 100,
    "message": "Great session!"
  }
}
```

### Get Session Donations
```http
GET /api/sessions/:id/donations
```
**Response**:
```json
{
  "donations": [
    {
      "id": 1,
      "donor_id": 1,
      "donor_username": "john_doe",
      "amount": 100,
      "message": "Great session!",
      "created_at": "2024-12-09T10:30:00Z"
    }
  ],
  "total_donations": 500
}
```

### Get Top Donors
```http
GET /api/sessions/:id/top-donors?limit=10
```
**Response**:
```json
{
  "top_donors": [
    {
      "donor_id": 1,
      "donor_username": "john_doe",
      "total_donated": 500,
      "donation_count": 5
    }
  ]
}
```

---

## 📊 5. Earnings Dashboard

### Get User Earnings (Host)
```http
GET /api/earnings/:userId
```
**Response**:
```json
{
  "earnings": {
    "total_tokens": 5000,
    "total_usd": 500.00,
    "ticket_sales": {
      "tokens": 3000,
      "usd": 300.00
    },
    "donations": {
      "tokens": 2000,
      "usd": 200.00
    },
    "gateway_earnings": {
      "USD": 100.00,
      "NGN": 50000.00
    },
    "pending_payouts": 2,
    "lifetime_earnings": 10000
  }
}
```

---

## 💸 6. Payouts

### Request Payout
```http
POST /api/payouts/request
```
**Request Body (Token Payout)**:
```json
{
  "payout_type": "tokens",
  "payout_method": "bank_transfer",
  "amount": 100,
  "bank_details": {
    "bank_name": "First Bank",
    "account_number": "1234567890",
    "account_name": "John Doe"
  }
}
```

**Request Body (Gateway Earnings)**:
```json
{
  "payout_type": "gateway_earnings",
  "payout_method": "paypal",
  "currency": "USD",
  "amount": 50.00,
  "paypal_email": "john@example.com"
}
```

**Response**:
```json
{
  "payout": {
    "id": 1,
    "user_id": 1,
    "payout_type": "tokens",
    "amount_tokens": 100,
    "usd_value": 10.00,
    "status": "pending",
    "created_at": "2024-12-09T10:30:00Z"
  }
}
```

**Notes**:
- Minimum: 50 tokens ($5 USD)
- KYC required for payouts >$100 USD
- Tokens deducted immediately upon request
- Gateway earnings marked as paid but not deducted until processed

### Get Payout History
```http
GET /api/payouts/:userId?status=pending
```
**Response**:
```json
{
  "payouts": [
    {
      "id": 1,
      "payout_type": "tokens",
      "amount_tokens": 100,
      "status": "pending",
      "created_at": "2024-12-09T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Get Payout Details
```http
GET /api/payouts/details/:id
```
**Response**:
```json
{
  "payout": {
    "id": 1,
    "user_id": 1,
    "payout_type": "tokens",
    "amount_tokens": 100,
    "usd_value": 10.00,
    "payout_method": "bank_transfer",
    "bank_details": { ... },
    "status": "pending",
    "created_at": "2024-12-09T10:30:00Z"
  }
}
```

### Cancel Payout
```http
POST /api/payouts/:id/cancel
```
**Response**:
```json
{
  "success": true,
  "message": "Payout cancelled and tokens refunded",
  "payout": {
    "id": 1,
    "status": "cancelled"
  }
}
```

**Notes**:
- Only pending payouts can be cancelled
- Token payouts: Tokens refunded to wallet
- Gateway payouts: Earnings marked as available again

---

## 🆔 7. KYC Verification

### Submit KYC Documents
```http
POST /api/kyc/submit
Content-Type: multipart/form-data
```
**Form Fields**:
- `id_type`: national_id | passport | drivers_license | voters_card
- `id_number`: string
- `bank_details`: JSON string
- `id_document`: File (jpg, jpeg, png, pdf, <5MB)
- `selfie`: File (jpg, jpeg, png, pdf, <5MB)

**Example (cURL)**:
```bash
curl -X POST http://localhost:8080/api/kyc/submit \
  -H "Authorization: Bearer $TOKEN" \
  -F "id_type=passport" \
  -F "id_number=A1234567" \
  -F 'bank_details={"bank_name":"First Bank","account_number":"1234567890"}' \
  -F "id_document=@passport.jpg" \
  -F "selfie=@selfie.jpg"
```

**Response**:
```json
{
  "success": true,
  "kyc": {
    "id": 1,
    "user_id": 1,
    "id_type": "passport",
    "status": "pending",
    "submitted_at": "2024-12-09T10:30:00Z"
  },
  "message": "We'll review them within 24-48 hours"
}
```

### Get KYC Status
```http
GET /api/kyc/:userId
```
**Response**:
```json
{
  "has_kyc": true,
  "kyc": {
    "id": 1,
    "user_id": 1,
    "id_type": "passport",
    "status": "approved",
    "verified_at": "2024-12-09T12:00:00Z",
    "expires_at": "2026-12-09T12:00:00Z"
  }
}
```

---

## 🛡️ 8. Admin KYC Management

### List Pending KYCs (Admin Only)
```http
GET /api/admin/kyc/pending
```
**Response**:
```json
{
  "kyc_verifications": [
    {
      "id": 1,
      "user_id": 1,
      "user": {
        "id": 1,
        "username": "john_doe",
        "email": "john@example.com"
      },
      "id_type": "passport",
      "id_number": "A1234567",
      "id_document_path": "/uploads/kyc/kyc_id_1_uuid.jpg",
      "selfie_path": "/uploads/kyc/kyc_selfie_1_uuid.jpg",
      "status": "pending",
      "submitted_at": "2024-12-09T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Approve KYC (Admin Only)
```http
POST /api/admin/kyc/:id/approve
```
**Response**:
```json
{
  "success": true,
  "message": "KYC approved successfully",
  "kyc": {
    "id": 1,
    "status": "approved",
    "verified_at": "2024-12-09T12:00:00Z",
    "expires_at": "2026-12-09T12:00:00Z"
  }
}
```

### Reject KYC (Admin Only)
```http
POST /api/admin/kyc/:id/reject
```
**Request Body**:
```json
{
  "reason": "ID document is not clear. Please resubmit a higher quality photo."
}
```
**Response**:
```json
{
  "success": true,
  "message": "KYC rejected",
  "kyc": {
    "id": 1,
    "status": "rejected",
    "rejection_reason": "ID document is not clear...",
    "verified_at": "2024-12-09T12:00:00Z"
  }
}
```

---

## 💳 9. Refund Management

### Request Refund
```http
POST /api/refunds/request?ticket_id=123
```
**Request Body**:
```json
{
  "reason": "Session did not start as scheduled. Host was absent."
}
```
**Response**:
```json
{
  "success": true,
  "refund": {
    "id": 1,
    "ticket_id": 123,
    "session_id": 1,
    "user_id": 1,
    "host_id": 2,
    "reason": "Session did not start as scheduled...",
    "status": "pending",
    "created_at": "2024-12-09T10:30:00Z"
  },
  "message": "Refund request submitted successfully"
}
```

**Notes**:
- Refund must be requested within 24 hours of ticket purchase
- Reason must be 10-500 characters

### Get User Refunds
```http
GET /api/refunds/user/:userId
```
**Response**:
```json
{
  "refunds": [
    {
      "id": 1,
      "ticket_id": 123,
      "session_id": 1,
      "reason": "Session did not start...",
      "status": "pending",
      "created_at": "2024-12-09T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Get Host Refunds
```http
GET /api/refunds/host/:userId?status=pending
```
**Response**:
```json
{
  "refunds": [
    {
      "id": 1,
      "ticket_id": 123,
      "session_id": 1,
      "user": {
        "id": 1,
        "username": "john_doe"
      },
      "reason": "Session did not start...",
      "status": "pending",
      "created_at": "2024-12-09T10:30:00Z"
    }
  ],
  "count": 1
}
```

### Approve Refund (Host Only)
```http
POST /api/refunds/:id/approve
```
**Response**:
```json
{
  "success": true,
  "refund": {
    "id": 1,
    "status": "approved",
    "processed_at": "2024-12-09T11:00:00Z"
  },
  "message": "Refund approved and processed successfully"
}
```

**Notes**:
- Token refunds: Buyer gets tokens back, host loses tokens
- Gateway refunds: Logged for manual processing (TODO: API integration)

### Deny Refund (Host Only)
```http
POST /api/refunds/:id/deny
```
**Request Body**:
```json
{
  "reason": "Session ran for full duration. No valid reason for refund."
}
```
**Response**:
```json
{
  "success": true,
  "refund": {
    "id": 1,
    "status": "denied",
    "denial_reason": "Session ran for full duration...",
    "processed_at": "2024-12-09T11:00:00Z"
  },
  "message": "Refund request denied"
}
```

---

## 🔔 10. Payment Webhooks (No Auth)

### Stripe Webhook
```http
POST /api/webhooks/stripe
Stripe-Signature: t=timestamp,v1=signature
```
**Event Types**:
- `payment_intent.succeeded` → Credits user wallet
- `payment_intent.payment_failed` → Marks transaction as failed
- `charge.refunded` → Processes refund

**Response**:
```json
{
  "received": true
}
```

### Paystack Webhook
```http
POST /api/webhooks/paystack
x-paystack-signature: signature
```
**Event Types**:
- `charge.success` → Credits user wallet
- `charge.failed` → Marks transaction as failed
- `refund.processed` → Processes refund

**Response**:
```json
{
  "status": "success"
}
```

### Get Webhook Config (Dev Only)
```http
GET /api/webhooks/config
```
**Response**:
```json
{
  "stripe": {
    "endpoint": "/api/webhooks/stripe",
    "secret_set": true
  },
  "paystack": {
    "endpoint": "/api/webhooks/paystack",
    "secret_set": true
  }
}
```

### Test Webhook Simulator (Dev Only)
```http
POST /api/webhooks/test
```
**Request Body**:
```json
{
  "provider": "stripe",
  "transaction_id": 123,
  "success": true
}
```
**Response**:
```json
{
  "success": true,
  "message": "Webhook simulated"
}
```

---

## 🌍 Currency Support

**Supported Currencies**: USD, NGN, GHS, KES, EUR, GBP

**Token Pricing**:
- 1 token = $0.10 USD
- No bulk discounts

**Exchange Rates**:
- Fetched from exchangerate-api.com
- Cached for 1 hour
- Auto-detected from user IP (via ipapi.co)

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid amount",
  "message": "Amount must be greater than 0"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing authentication token"
}
```

### 403 Forbidden
```json
{
  "error": "Cannot view other users' payouts"
}
```

### 404 Not Found
```json
{
  "error": "Ticket not found"
}
```

### 422 Unprocessable Entity
```json
{
  "error": "Insufficient balance",
  "message": "You need at least 50 tokens to request a payout"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to process payment",
  "message": "An unexpected error occurred. Please try again."
}
```

---

## 🔑 Common Payment Flows

### 1. Buy Tokens with Stripe
```
POST /api/tokens/purchase
→ Receive payment_url
→ User completes payment on Stripe
→ Stripe sends webhook to /api/webhooks/stripe
→ Wallet credited automatically
→ User receives WebSocket notification (TODO)
```

### 2. Purchase Ticket with Tokens
```
POST /api/sessions/:id/tickets/purchase
→ Tokens deducted from wallet
→ Host wallet credited (85% after commission)
→ Gateway earning created (15% commission)
→ Ticket record created
→ User gains session access
```

### 3. Request Payout
```
Check KYC status: GET /api/kyc/:userId
→ If needed: POST /api/kyc/submit
→ Wait for admin approval
→ POST /api/payouts/request
→ Tokens deducted immediately
→ Wait for admin processing (2-5 business days)
→ Payout status: pending → processing → completed
```

### 4. Refund Flow
```
POST /api/refunds/request?ticket_id=123
→ Host receives notification
→ Host: GET /api/refunds/host/:userId
→ Host reviews refund request
→ Host: POST /api/refunds/:id/approve OR deny
→ If approved:
  - Token refund: Buyer wallet credited, host wallet debited
  - Gateway refund: Manual processing (TODO: API integration)
```

---

## 📚 Additional Resources

- [Phase 2 Week 2 Complete Summary](./PHASE2_WEEK2_COMPLETE.md)
- [Database Schema](./migrations/)
- [Model Definitions](./backend/internal/models/)
- [Handler Implementations](./backend/internal/handlers/)

---

**Need Help?** Contact: support@wewatch.tv  
**API Version**: v1.0  
**Last Updated**: December 9, 2024
