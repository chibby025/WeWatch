# Manual Payout System - Admin Guide

## Overview

Due to Paystack account limitations (Starter Business cannot make transfers), WeWatch has implemented a **hybrid manual/automatic withdrawal system**. This guide explains how the system works and how admins should process manual payouts.

---

## Problem Context

### Paystack Account Limitation
- **Current Account Type**: Starter Business
- **Limitation**: Cannot initiate transfers (third-party payouts)
- **Error Message**: `"You cannot initiate third party payouts as a starter business"`

### Upgrade Requirements
To enable automatic transfers, the Paystack account must be upgraded to **Registered Business**:
- **Required Documents**: CAC registration, BVN, Valid ID, Utility bill
- **Decision Pending**: Nigeria vs International registration (awaiting Elumenul Fund approval)
- **Timeline**: Unknown (pending business registration decision)

### Temporary Solution
Until the Paystack account is upgraded, **manual processing** is required for all withdrawal requests.

---

## System Workflow

### User Experience (Frontend)

1. **User Requests Withdrawal**
   - User clicks "Withdraw" button on Payment page
   - Enters amount (minimum ₦50 / 1 token)
   - Selects payment account (bank details)
   - Submits request

2. **User Sees "Processing" Status**
   - Status: `"Processing"`
   - Message: `"Your withdrawal is being processed. Funds typically arrive within 24 hours."`
   - User cannot see that auto-transfer failed
   - No error messages displayed to user

3. **User Waits for Completion**
   - Payout remains in "processing" state
   - User can check status on Payment page
   - Once admin completes, status changes to "completed"

### Backend Processing (Automatic)

1. **Request Creation** (`withdrawal_handlers.go:280-295`)
   ```go
   // User request validated and created
   payout := models.Payout{
       UserID: currentUserID,
       Status: "processing", // Auto-approved
       AmountValue: &amount,
       PayoutType: "tokens" or "gateway_earnings",
       PaymentAccountID: accountID,
   }
   ```

2. **Auto-Transfer Attempt** (`withdrawal_handlers.go:380-440`)
   ```go
   // Backend attempts Paystack transfer from reserve account
   transferCode, err := initiatePaystackTransfer(...)
   
   if err != nil {
       // Transfer fails due to starter account
       // BUT: Payout stays as "processing" (not marked as "failed")
       // System logs error for admin
       // Sends admin email notification
   }
   ```

3. **Admin Notification Email**
   - Email sent to admin address (from .env `ADMIN_EMAIL`)
   - Subject: `"[WeWatch] Manual Withdrawal Required - Payout #X"`
   - Contains:
     - User details
     - Amount to transfer
     - Bank account details (Name, Bank, Account Number)
     - Payout ID for reference

### Admin Processing (Manual)

4. **Admin Reviews Processing Payouts**
   - Admin logs into Admin Dashboard (`/admin`)
   - Views "Manual Processing Required" section
   - Sees list of payouts awaiting manual transfer

5. **Admin Transfers Manually**
   - Logs into [Paystack Dashboard](https://dashboard.paystack.com)
   - Goes to **Transfers → Single Transfer**
   - Copies bank details from admin panel:
     - Account Name
     - Bank Name
     - Account Number
     - Amount (exact amount shown)
   - Completes transfer
   - Copies Paystack transfer reference

6. **Admin Marks as Completed**
   - Clicks "Mark Completed" button
   - Enters Paystack transfer reference (optional)
   - Confirms completion
   - Payout status → "completed"
   - User receives WebSocket notification

---

## Admin Dashboard Interface

### Location
- URL: `/admin` (requires super_admin role)
- Section: "Manual Processing Required" (yellow/blue gradient card)

### Displayed Information

**For Each Payout:**
- User details (username, user ID)
- Payout amount (₦X.XX)
- Payout type (🪙 Token Withdrawal or 💰 Earnings Withdrawal)
- Bank account details:
  - Account Name
  - Bank Name
  - Account Number
- Date/time requested
- Hours since request

### Admin Actions

**1. Mark Completed** (Green button)
- Use after manually transferring funds via Paystack
- Prompts for transfer reference (optional)
- Confirms completion with dialog
- Updates payout status to "completed"
- Sends success notification to user

**2. Fail & Refund** (Red button)
- Use if transfer cannot be completed
- Prompts for rejection reason
- Refunds tokens/earnings to user
- Updates payout status to "failed"
- Sends refund notification to user

**3. Open Paystack Dashboard** (Blue link)
- Direct link to Paystack transfer page
- Opens in new tab

---

## Technical Details

### Backend Endpoints

#### Get Processing Payouts
```http
GET /api/admin/payouts/processing
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "payouts": [
    {
      "id": 3,
      "user_id": 7,
      "user": { "username": "chibi" },
      "status": "processing",
      "amount_value": 122.00,
      "amount_currency": "NGN",
      "payout_type": "tokens",
      "payment_account": {
        "account_name": "Chibuzor Ogbu",
        "bank_name": "OPay",
        "account_number": "7023959876"
      },
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "count": 1,
  "total_amount": 122.00
}
```

#### Mark Payout as Completed
```http
POST /api/admin/payouts/:id/complete
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "transfer_reference": "TRF_abc123xyz" (optional),
  "notes": "Manually transferred via Paystack dashboard" (optional)
}
```

**Response:**
```json
{
  "success": true,
  "payout": { ... },
  "message": "Payout marked as completed successfully"
}
```

#### Reject/Fail Payout
```http
POST /api/admin/payouts/:id/reject
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Bank account invalid"
}
```

**Response:**
```json
{
  "success": true,
  "payout": { ... },
  "message": "Payout rejected successfully"
}
```

### Frontend API Functions

```javascript
// services/api.js

// Get processing payouts
export const getAdminProcessingPayouts = async () => {
  const response = await apiClient.get('/api/admin/payouts/processing');
  return response.data;
};

// Mark as completed
export const completeAdminPayout = async (payoutId, transferReference, notes) => {
  const response = await apiClient.post(`/api/admin/payouts/${payoutId}/complete`, {
    transfer_reference: transferReference,
    notes: notes
  });
  return response.data;
};

// Reject with reason
export const rejectAdminPayout = async (payoutId, reason) => {
  const response = await apiClient.post(`/api/admin/payouts/${payoutId}/reject`, {
    reason: reason
  });
  return response.data;
};
```

---

## Conversion Rates

### Token Purchase
- **1 token** = **₦165**
- Split: 75% to reserve (₦123.75), 25% to revenue (₦41.25)

### Token Withdrawal
- **1 token** = **₦122** (paid to user)
- This accounts for:
  - 75% split (₦123.75 from reserve)
  - Paystack transfer fee (~₦1.75)
  - Net to user: ₦122

### Database Storage
- Tokens stored as **integer cents**
- 1 token = 100 cents
- Withdrawal of 1 token = 100 cents = ₦1.22 → display as ₦122.00

---

## Error Handling

### Auto-Transfer Failure
```go
// withdrawal_handlers.go:420-440
if err != nil {
    // Don't mark as failed - keep as "processing"
    // Perform auto-refund (already coded but disabled for manual workflow)
    
    // Log error for admin
    fmt.Printf("⚠️ TRANSFER FAILED (will be manually processed): Payout %d: %v\n", ...)
    
    // Send admin email notification
    emailService.SendAdminWithdrawalFailureEmail(...)
    
    // Exit without changing status (stays "processing")
    return
}
```

### Manual Completion Success
```go
// admin_payout_handlers.go:440-485
// Update payout status
payout.Status = "completed"
payout.GatewayTransferID = transferReference // Optional

// Send WebSocket notification to user
hub.BroadcastToUser(payout.UserID, {
    "type": "withdrawal_completed",
    "message": "Your withdrawal has been completed"
})
```

---

## Testing Workflow

### 1. Test User Withdrawal Request
```bash
# As regular user (user ID 7)
curl -X POST http://localhost:8080/api/withdrawals/request \
  -H "Authorization: Bearer <user_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 122.00,
    "source": "tokens",
    "currency": "NGN",
    "payment_account_id": 1
  }'
```

**Expected Result:**
- Status: `"processing"`
- Message: `"Your withdrawal is being processed"`
- Backend attempts transfer → fails silently
- Admin receives email notification

### 2. Admin Views Processing Payouts
```bash
# As admin
curl -X GET http://localhost:8080/api/admin/payouts/processing \
  -H "Authorization: Bearer <admin_token>"
```

**Expected Response:**
```json
{
  "payouts": [{ "id": 3, "status": "processing", ... }],
  "count": 1,
  "total_amount": 122.00
}
```

### 3. Admin Marks as Completed
```bash
curl -X POST http://localhost:8080/api/admin/payouts/3/complete \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transfer_reference": "TRF_test123",
    "notes": "Manually transferred via Paystack"
  }'
```

**Expected Result:**
- Status → `"completed"`
- User receives WebSocket notification
- Payout removed from processing list

---

## Database Schema

### Payout Model
```go
type Payout struct {
    ID                 uint       `gorm:"primaryKey"`
    UserID             uint       `gorm:"not null;index"`
    User               User       `gorm:"foreignKey:UserID"`
    
    Status             string     `gorm:"type:varchar(20);default:'pending'"`
    // Possible values: "pending", "processing", "completed", "failed", "rejected"
    
    PayoutType         string     `gorm:"type:varchar(50);not null"`
    // "tokens" or "gateway_earnings"
    
    PayoutMethod       string     `gorm:"type:varchar(50);not null"`
    // "bank_transfer", "paypal", "mobile_money"
    
    AmountValue        *float64   `gorm:"type:decimal(15,2)"`
    // Actual currency amount (₦122.00)
    
    AmountTokens       *int       `gorm:"type:integer"`
    // Token amount in cents (100 = 1 token)
    
    AmountCurrency     *string    `gorm:"type:varchar(10)"`
    // "NGN", "USD", etc.
    
    PaymentAccountID   *uint      `gorm:"index"`
    PaymentAccount     *PaymentAccount `gorm:"foreignKey:PaymentAccountID"`
    // Bank account details for transfer
    
    GatewayTransferID  *string    `gorm:"type:varchar(255)"`
    // Paystack transfer code/reference
    
    FailureReason      *string    `gorm:"type:text"`
    // Reason for failure/rejection
    
    PayoutDetails      datatypes.JSON `gorm:"type:jsonb"`
    // Additional metadata
    
    CreatedAt          time.Time
    UpdatedAt          time.Time
}
```

### Payout Status Flow
```
User Request → "processing"
              ↓
              ├─ Auto-transfer succeeds → "completed"
              ├─ Auto-transfer fails → stays "processing" (manual)
              ├─ Admin marks complete → "completed"
              └─ Admin rejects → "failed" or "rejected"
```

---

## Future Improvements

### When Paystack Account is Upgraded

1. **Remove Manual Processing**
   - Auto-transfers will work
   - "Processing" payouts will complete automatically
   - Admin panel can be used for exceptions only

2. **Code Changes Needed**
   ```go
   // withdrawal_handlers.go:420-440
   // Remove the "keep as processing" logic
   // Let transfers complete automatically
   if err != nil {
       payout.Status = "failed"
       // Perform refund
       // Notify user of failure
   }
   ```

3. **Migration Plan**
   - No code deletion needed
   - System will automatically switch to auto-mode
   - Manual endpoints remain for admin overrides

---

## Troubleshooting

### Issue: Payouts Stuck in Processing
**Symptom**: Payouts remain in "processing" for days

**Cause**: Admin has not manually transferred funds

**Solution**: Admin should:
1. Check processing payouts list in dashboard
2. Complete manual transfers via Paystack
3. Mark payouts as completed

### Issue: User Complains Funds Not Received
**Symptom**: User says withdrawal completed but no funds

**Possible Causes:**
1. Admin marked as completed but didn't transfer
2. Transfer went to wrong account
3. Bank processing delay

**Solution:**
1. Check payout details in database:
   ```sql
   SELECT * FROM payouts WHERE user_id = X AND status = 'completed';
   ```
2. Verify transfer reference in Paystack dashboard
3. Check bank account details match user's payment account
4. Contact Paystack support if transfer failed

### Issue: Email Notifications Not Sending
**Symptom**: Admin not receiving withdrawal request emails

**Check:**
1. `.env` file has correct `ADMIN_EMAIL`
2. SMTP credentials configured correctly
3. Email service initialized properly
4. Check server logs for email errors

**Solution:**
```bash
# Check logs
tail -f backend/server.log | grep "Admin notification"

# Test email manually
curl -X POST http://localhost:8080/api/support/send \
  -H "Authorization: Bearer <token>" \
  -d '{"message": "Test email"}'
```

---

## Security Considerations

### Admin Authentication
- Only users with `role = "super_admin"` can access admin endpoints
- JWT token required with admin role claim
- Middleware: `RequireSuperAdmin()`

### Payout Verification
- Validate payout ownership before processing
- Check payout status before completion
- Log all admin actions with user ID and timestamp

### Transfer References
- Optional but recommended for audit trail
- Helps track manual transfers in Paystack
- Stored in `gateway_transfer_id` field

---

## Monitoring & Alerts

### Daily Checks (Recommended)

1. **Processing Payouts Count**
   ```sql
   SELECT COUNT(*), SUM(amount_value)
   FROM payouts
   WHERE status = 'processing';
   ```

2. **Old Processing Payouts** (>24 hours)
   ```sql
   SELECT id, user_id, amount_value, created_at
   FROM payouts
   WHERE status = 'processing'
     AND created_at < NOW() - INTERVAL '24 hours'
   ORDER BY created_at ASC;
   ```

3. **Failed Auto-Transfers** (check logs)
   ```bash
   grep "TRANSFER FAILED" backend/server.log | tail -20
   ```

### Metrics to Track

- Average time from request to completion
- Percentage of manual vs auto completions
- Total amount processed manually per day
- User satisfaction (complaints about delays)

---

## Contact & Support

For questions or issues with the manual payout system:

**Developer**: Chibuzor Ogbu (chibuzor_dev)  
**System**: WeWatch Backend (Go + Gin + GORM)  
**Database**: PostgreSQL  
**Payment Gateway**: Paystack (Starter Business - pending upgrade)

**Related Documentation**:
- `PAYMENT_API_REFERENCE.md` - Payment system overview
- `PLATFORM_ACCOUNTING_REFACTOR_SUMMARY.md` - Split accounting details
- `AUTO_REFUND_IMPLEMENTATION.md` - Automatic refund system

**Paystack Support**:
- Dashboard: https://dashboard.paystack.com
- Support: support@paystack.com
- Docs: https://paystack.com/docs

---

## Changelog

### 2025-01-15 - Initial Implementation
- Added `GetProcessingPayoutsHandler` endpoint
- Added `MarkPayoutCompletedHandler` endpoint
- Modified `processWithdrawal` to keep status as "processing" on failure
- Created admin dashboard UI for manual processing
- Added WebSocket notifications for completion
- Created comprehensive documentation

### Future Updates
- Will be marked here when Paystack account is upgraded
- Auto-transfer re-enabled date
- Manual system deprecation date
