# Admin Audit Log & Upload Rate Limiting

## Overview
Two new security features have been implemented:
1. **Admin Audit Logging** - Tracks all administrative actions for compliance and security
2. **File Upload Rate Limiting** - Prevents abuse of file upload endpoints

---

## 1. Admin Audit Logging

### Database Schema
```sql
CREATE TABLE admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL,                    -- Admin who performed the action
    action VARCHAR(100) NOT NULL,                -- Action type (e.g., "approve_kyc")
    target_type VARCHAR(50),                     -- Entity type (e.g., "kyc", "payout", "user")
    target_id BIGINT,                            -- Entity ID
    details TEXT,                                -- JSON details of the action
    ip_address VARCHAR(45),                      -- Admin's IP address
    user_agent TEXT,                             -- Admin's browser/client
    success BOOLEAN DEFAULT true,                -- Whether action succeeded
    error_msg TEXT,                              -- Error message if failed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### How to Use

**In any admin handler**, call `LogAdminAction()` after performing an action:

```go
// Example: KYC Approval
LogAdminAction(db, c, "approve_kyc", "kyc", uint(kycID), gin.H{
    "user_id": kyc.UserID,
    "id_type": kyc.IDType,
    "id_number": kyc.IDNumber,
}, true, "")

// Example: Ban User
LogAdminAction(db, c, "ban_user", "user", userID, gin.H{
    "reason": "Spam violation",
    "duration": "30 days",
}, true, "")

// Example: Failed Action
LogAdminAction(db, c, "approve_payout", "payout", payoutID, gin.H{
    "amount": 50000,
}, false, "Insufficient balance in reserve account")
```

### API Endpoint

**GET /api/admin/audit-logs** (Admin only)

Query parameters:
- `page` (default: 1)
- `limit` (default: 50, max: 100)
- `admin_id` - Filter by admin
- `action` - Filter by action type (e.g., "approve_kyc")
- `target_type` - Filter by entity type (e.g., "kyc")
- `target_id` - Filter by entity ID
- `start_date` - Filter from date (YYYY-MM-DD)
- `end_date` - Filter to date (YYYY-MM-DD)

Example request:
```bash
GET /api/admin/audit-logs?action=approve_kyc&page=1&limit=20
Authorization: Bearer <admin-jwt-token>
```

Example response:
```json
{
  "logs": [
    {
      "id": 45,
      "admin_id": 7,
      "action": "approve_kyc",
      "target_type": "kyc",
      "target_id": 123,
      "details": "{\"user_id\":456,\"id_type\":\"national_id\",\"id_number\":\"12345678\"}",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0...",
      "success": true,
      "error_msg": "",
      "created_at": "2026-04-23T10:30:00Z",
      "admin": {
        "id": 7,
        "username": "admin_john",
        "email": "john@wewatch.com",
        "role": "admin"
      }
    }
  ],
  "total": 245,
  "page": 1,
  "limit": 20,
  "total_pages": 13
}
```

### Actions to Log

Common actions to track:
- `approve_kyc` - KYC approval
- `reject_kyc` - KYC rejection
- `approve_payout` - Payout approval
- `reject_payout` - Payout rejection
- `ban_user` - User ban
- `unban_user` - User unban
- `delete_room` - Room deletion (admin override)
- `delete_content` - Content removal (moderation)
- `update_permissions` - Permission changes
- `view_sensitive_data` - Access to sensitive user data
- `export_data` - Data export actions

---

## 2. File Upload Rate Limiting

### Configuration
```go
// 3 uploads per 10 minutes per user
uploadLimiter := handlers.NewUploadRateLimiter(3, 10*time.Minute)
```

### Applied to Routes
- `POST /api/rooms/:id/upload` - Media uploads

### How It Works
1. **Per-user tracking** - Uses authenticated user ID
2. **Sliding window** - Resets after time window expires
3. **Automatic cleanup** - Old entries removed every 5 minutes

### Response on Rate Limit
```json
{
  "error": "Upload rate limit exceeded. Please try again later.",
  "limit": 3,
  "window": "10m0s",
  "reset_time": "2026-04-23T10:45:00Z"
}
```

HTTP Status: `429 Too Many Requests`

### Rate Limit Headers
```
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 1
X-RateLimit-Reset: 2026-04-23T10:45:00Z
```

### Adjust Limits
To change limits, modify the `NewUploadRateLimiter()` call:

```go
// More restrictive: 2 uploads per 5 minutes
uploadLimiter := handlers.NewUploadRateLimiter(2, 5*time.Minute)

// More lenient: 10 uploads per hour
uploadLimiter := handlers.NewUploadRateLimiter(10, 60*time.Minute)
```

---

## Migration

Run the migration to create the audit log table:

```bash
cd /home/chibuzor_dev/WeWatch/backend
# Apply migration
migrate -path migrations -database "postgresql://postgres:Chibby@localhost:5432/wewatch_db?sslmode=disable" up
```

Or manually:
```bash
psql -h localhost -U postgres -d wewatch_db -f migrations/20260424000001_create_admin_audit_logs.sql
```

---

## Testing

### Test Upload Rate Limiting
```bash
# Upload 4 files rapidly (4th should be blocked)
for i in {1..4}; do
  curl -X POST http://localhost:8080/api/rooms/123/upload \
    -H "Authorization: Bearer <token>" \
    -F "mediaFile=@test.mp4" \
    -F "temporary=false"
done
```

### Test Audit Logging
```bash
# Approve a KYC
curl -X POST http://localhost:8080/api/admin/kyc/5/approve \
  -H "Authorization: Bearer <admin-token>"

# View audit logs
curl http://localhost:8080/api/admin/audit-logs \
  -H "Authorization: Bearer <admin-token>"
```

---

## Benefits

### Admin Audit Logging
✅ **Compliance** - Meet regulatory requirements for financial platforms  
✅ **Security** - Track suspicious admin behavior  
✅ **Accountability** - Every admin action is recorded  
✅ **Forensics** - Investigate issues by reviewing action history  
✅ **Transparency** - Show users their data access history  

### Upload Rate Limiting
✅ **Prevent abuse** - Stop users from flooding storage  
✅ **Fair usage** - Ensure equal access for all users  
✅ **Cost control** - Limit bandwidth and storage costs  
✅ **DoS protection** - Mitigate upload-based attacks  

---

## Future Enhancements

1. **Real-time alerts** - Notify super admin of suspicious activity
2. **Audit log export** - CSV/PDF export for compliance reports
3. **User access history** - Show users when admins viewed their data
4. **Anomaly detection** - Flag unusual admin behavior patterns
5. **Two-factor for sensitive actions** - Require 2FA for critical admin actions
