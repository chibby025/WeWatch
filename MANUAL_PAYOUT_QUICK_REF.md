# Manual Withdrawal Processing - Quick Reference

## Overview
Due to Paystack Starter Business limitations, withdrawals require **manual admin processing** until account is upgraded.

## User Experience
- User requests withdrawal → Status: "Processing"
- User sees: "Funds typically arrive within 24 hours"
- No error messages shown to user
- Admin processes manually in background

## Admin Workflow

### 1. Check Processing Payouts
- Go to Admin Dashboard: `/admin`
- Look for "Manual Processing Required" section (yellow/blue card)
- View list of pending transfers

### 2. Transfer Manually via Paystack
1. Open [Paystack Dashboard](https://dashboard.paystack.com/#/transfers)
2. Click **Transfers → Single Transfer**
3. Copy bank details from admin panel:
   - Account Name
   - Bank Name
   - Account Number
   - Amount (exact amount shown)
4. Complete transfer
5. Copy transfer reference from Paystack

### 3. Mark as Completed
1. Click **"Mark Completed"** button in admin panel
2. Paste Paystack transfer reference (optional but recommended)
3. Confirm
4. User receives notification automatically

## Quick Commands

### View Processing Payouts
```bash
psql -U postgres -d wewatch_db -c "SELECT id, user_id, amount_value, created_at FROM payouts WHERE status = 'processing' ORDER BY created_at;"
```

### Check Old Payouts (>24h)
```bash
psql -U postgres -d wewatch_db -c "SELECT id, user_id, amount_value, created_at FROM payouts WHERE status = 'processing' AND created_at < NOW() - INTERVAL '24 hours';"
```

## API Endpoints

### Get Processing Payouts
```http
GET /api/admin/payouts/processing
Authorization: Bearer <admin_token>
```

### Mark as Completed
```http
POST /api/admin/payouts/:id/complete
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "transfer_reference": "TRF_abc123",
  "notes": "Manual transfer completed"
}
```

### Reject/Fail Payout
```http
POST /api/admin/payouts/:id/reject
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "reason": "Bank account invalid"
}
```

## Conversion Rates
- **1 token purchase**: ₦165
- **1 token withdrawal**: ₦122 (after 75-25 split and fees)
- **Minimum withdrawal**: ₦50 (Paystack limit)

## Troubleshooting

### Payouts Stuck in Processing
**Solution**: Check admin dashboard and process manually

### User Complains No Funds
**Check**:
1. Was payout marked as completed?
2. Did you actually transfer via Paystack?
3. Is transfer reference saved?

**Verify**:
```bash
psql -U postgres -d wewatch_db -c "SELECT * FROM payouts WHERE id = X;"
```

### Email Notifications Not Working
**Check**:
1. `.env` has `ADMIN_EMAIL` configured
2. SMTP settings correct
3. Check logs: `grep "Admin notification" backend/server.log`

## Daily Checklist

- [ ] Check processing payouts count (keep < 10)
- [ ] Process payouts older than 6 hours
- [ ] Verify all transfers have references
- [ ] Check for user complaints
- [ ] Monitor system logs for errors

## Important Notes

⚠️ **ALWAYS verify bank details before transferring**  
⚠️ **Save transfer reference for audit trail**  
⚠️ **Process within 24 hours to maintain user trust**  
⚠️ **This is temporary until Paystack account upgraded**

## When Paystack Upgraded

Once account is upgraded to Registered Business:
1. Auto-transfers will work
2. Manual processing becomes optional
3. System automatically switches to auto-mode
4. No code changes needed

## Contact

**Paystack Account**: Starter Business  
**Needs**: CAC, BVN, Valid ID, Utility Bill  
**Pending**: Business registration decision (Nigeria vs International)  

**Full Documentation**: See `MANUAL_PAYOUT_SYSTEM.md`
