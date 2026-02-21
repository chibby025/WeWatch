# ✅ DEPLOYMENT CHECKLIST - Auto-Approval Withdrawal System

## 🎯 Pre-Deployment (Complete Before Going Live)

### Code Verification
- [ ] Backend compiles without errors
- [ ] Frontend builds without errors
- [ ] No TypeScript errors
- [ ] No linting warnings
- [ ] All imports resolved

### Backend Setup
- [ ] `backend/internal/handlers/payout_handlers.go` updated ✅
- [ ] Auto-approval logic implemented ✅
- [ ] Goroutines configured ✅
- [ ] Error handling in place ✅
- [ ] Logging configured ✅

### Frontend Setup
- [ ] `frontend/src/pages/WithdrawalPage.jsx` created ✅
- [ ] `frontend/src/App.jsx` routes updated ✅
- [ ] `frontend/src/components/LobbyLeftSidebar.jsx` menu added ✅
- [ ] All imports correct ✅
- [ ] No unused variables ✅

### Configuration
- [ ] `.env` file updated with Paystack credentials
- [ ] PAYSTACK_SPLIT_CODE configured
- [ ] PAYSTACK_RESERVE_KEY set
- [ ] Database connection verified
- [ ] Email notifications ready (optional)

### Database
- [ ] Database backup created
- [ ] All tables accessible
- [ ] payout table exists with status column
- [ ] gateway_earnings table exists
- [ ] user_kyc_verifications table exists
- [ ] No missing columns

### Dependencies
- [ ] All Go packages installed (`go mod tidy`)
- [ ] All npm packages installed (`npm install`)
- [ ] Paystack SDK version compatible
- [ ] LiveKit SDK updated (if needed)
- [ ] All APIs accessible

---

## 🧪 Testing (Complete All Test Scenarios)

### Test Scenario 1: Auto-Approve ✅
- [ ] Host requests ₦5,000 withdrawal
- [ ] Amount < ₦10,000 ✅
- [ ] KYC verified ✅
- [ ] Not first withdrawal ✅
- [ ] Bank transfer method ✅
- [ ] Response shows `auto_approve: true`
- [ ] Status shows "processing"
- [ ] Payout created in database
- [ ] Goroutine spawned successfully

### Test Scenario 2: First-Time Withdrawal ✅
- [ ] New host requests ₦2,000 withdrawal
- [ ] Eligibility met except first-time
- [ ] Response shows `auto_approve: false`
- [ ] Status shows "pending"
- [ ] Appears in admin pending queue
- [ ] Admin can approve
- [ ] Transfer processes after approval

### Test Scenario 3: Large Amount ✅
- [ ] Host requests ₦50,000 withdrawal
- [ ] Amount ≥ ₦10,000
- [ ] Response shows `auto_approve: false`
- [ ] Status shows "pending"
- [ ] Appears in admin queue
- [ ] Requires manual approval

### Test Scenario 4: KYC Required ✅
- [ ] Host with no KYC requests ₦8,000
- [ ] Amount > ₦5,000
- [ ] KYC not verified
- [ ] Request rejected with error
- [ ] Message indicates KYC needed
- [ ] Link to KYC page provided

### Test Scenario 5: Payment Method ✅
- [ ] Host selects PayPal (if supported)
- [ ] Non-bank method
- [ ] Request rejected
- [ ] Message indicates bank transfer required
- [ ] Can retry with bank account

### Manual Testing
- [ ] Navigate to /withdraw page
- [ ] Page loads without errors
- [ ] Balance displays correctly
- [ ] Quick buttons work
- [ ] Form validation works
- [ ] Can add bank account
- [ ] Can select bank account
- [ ] Submit button works
- [ ] Loading spinner shows
- [ ] Success/error messages display
- [ ] History list updates
- [ ] Status updates in real-time

### API Testing
- [ ] POST /api/payouts/request works
- [ ] Response contains required fields
- [ ] GET /api/payouts/me returns history
- [ ] Admin endpoints accessible (admin only)
- [ ] Error responses correct
- [ ] Status codes correct

### Database Testing
- [ ] New payout created
- [ ] Status field populated
- [ ] Created/updated timestamps correct
- [ ] User ID linked correctly
- [ ] Amount stored correctly
- [ ] Bank details secured
- [ ] Payouts retrievable by user

### Log Testing
- [ ] Backend logs auto-approval decision
- [ ] Frontend logs API responses
- [ ] Errors logged with context
- [ ] Goroutine completion logged
- [ ] Status updates logged
- [ ] No sensitive data in logs

---

## 🔐 Security Verification

### Authentication
- [ ] JWT tokens required for all endpoints
- [ ] Token validation working
- [ ] Expired tokens rejected
- [ ] Users can only see own payouts
- [ ] Admin endpoints protected

### Authorization
- [ ] Only admins can view pending payouts
- [ ] Only admins can approve/reject
- [ ] Users can't modify others' payouts
- [ ] Role-based access enforced
- [ ] Super admin role required

### Data Protection
- [ ] Bank details not exposed in logs
- [ ] Passwords never logged
- [ ] API keys not hardcoded
- [ ] Sensitive fields encrypted in database
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities

### Thresholds
- [ ] Auto-approve max: ₦10,000 ✅
- [ ] KYC required: > ₦5,000 ✅
- [ ] First-time: Manual review ✅
- [ ] Bank transfer only: Enforced ✅
- [ ] Rate limiting configured (if enabled)

---

## 📊 Monitoring Setup

### Logs
- [ ] Backend log file configured
- [ ] Log rotation enabled
- [ ] Error tracking setup
- [ ] Paystack API logs monitored
- [ ] Database query logs enabled (dev)

### Metrics
- [ ] Auto-approval rate tracked
- [ ] Manual review rate tracked
- [ ] Transfer success rate tracked
- [ ] Response time monitored
- [ ] Error rate tracked

### Alerts
- [ ] High failure rate alert (>5%)
- [ ] API downtime alert
- [ ] Database connection alert
- [ ] Goroutine crash alert
- [ ] Large amount withdrawal alert (optional)

### Dashboards
- [ ] Admin dashboard shows payout stats
- [ ] Withdrawal history visible
- [ ] Status tracking working
- [ ] Failed transfers show reason
- [ ] Performance metrics displayed

---

## 📱 Frontend Verification

### UI/UX
- [ ] Page loads quickly
- [ ] No broken images
- [ ] Buttons responsive
- [ ] Forms clear and intuitive
- [ ] Error messages helpful
- [ ] Success messages clear
- [ ] Loading indicators visible
- [ ] Mobile responsive

### Functionality
- [ ] Balance displays correctly
- [ ] Quick buttons populate amount
- [ ] Form validation works
- [ ] Submit button disabled when invalid
- [ ] Bank account CRUD works
- [ ] History list populates
- [ ] Status updates real-time
- [ ] Can cancel pending (if implemented)

### Accessibility
- [ ] Form labels present
- [ ] Keyboard navigation works
- [ ] Color contrast sufficient
- [ ] Error messages accessible
- [ ] Button focus states visible

---

## 🔧 Backend Verification

### API Functionality
- [ ] Request endpoint works
- [ ] Response format correct
- [ ] Status field populated
- [ ] Auto-approve flag returns
- [ ] History endpoint returns correct data
- [ ] Admin endpoints secured
- [ ] Error responses appropriate

### Goroutines
- [ ] Spawning correctly
- [ ] Processing in background
- [ ] Not blocking main request
- [ ] Error handling in place
- [ ] Status updates correctly
- [ ] No memory leaks
- [ ] Graceful shutdown

### Database
- [ ] Transactions atomic
- [ ] Status updates correct
- [ ] Balance decrements correctly
- [ ] Bank details stored securely
- [ ] Relationships intact
- [ ] No orphaned records

---

## 📞 Communication

### Team Notification
- [ ] Inform backend team
- [ ] Inform frontend team
- [ ] Inform devops team
- [ ] Inform support team
- [ ] Inform managers

### User Notification (Hosts)
- [ ] Email about new feature
- [ ] In-app announcement
- [ ] Tutorial available
- [ ] Support documentation ready
- [ ] FAQ updated

### Admin Notification
- [ ] Admin dashboard explained
- [ ] Pending queue visible
- [ ] Approval workflow documented
- [ ] Error handling explained
- [ ] Support contact provided

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment (Staging)
```bash
# Backend
cd backend
go test ./...              # Run tests
go build -o server .       # Build binary

# Frontend
cd ../frontend
npm test                   # Run tests
npm run build              # Build bundle

# Deploy to staging
# Verify all features work
# Run full test suite
```

### Step 2: Database Migration (If Needed)
```bash
# Backup production database first
pg_dump wewatch_db > backup_$(date +%Y%m%d).sql

# Run any migrations
migrate -path migrations -database $DATABASE_URL up

# Verify tables exist
psql -d wewatch_db -c "SELECT * FROM payouts LIMIT 1;"
```

### Step 3: Backend Deployment
```bash
# Stop old backend
systemctl stop wewatch-backend

# Deploy new backend
cp server /opt/wewatch/server

# Start new backend
systemctl start wewatch-backend

# Verify running
curl http://localhost:8080/health
```

### Step 4: Frontend Deployment
```bash
# Build frontend
npm run build

# Deploy bundle
cp -r dist/* /var/www/wewatch/

# Verify accessible
curl http://localhost:5173/

# Clear browser cache
# (Or add cache busting to deploy script)
```

### Step 5: Verification
```bash
# Check backend logs
tail -f /var/log/wewatch-backend.log

# Check frontend in browser
# Verify withdrawal page loads
# Test withdrawal request
# Check admin dashboard

# Monitor for errors
grep ERROR /var/log/wewatch-backend.log
```

### Step 6: Post-Deployment
- [ ] Monitor logs for errors
- [ ] Check auto-approval rate
- [ ] Verify transfers processing
- [ ] Confirm host notifications sent
- [ ] Check admin dashboard works
- [ ] Monitor performance metrics

---

## 🧪 Sanity Checks (Day 1)

### Morning Check
- [ ] System running without errors
- [ ] No spike in error rate
- [ ] Auto-approval rate 70-80%
- [ ] Paystack transfers successful
- [ ] Database clean (no corruption)
- [ ] Logs showing normal activity

### Afternoon Check
- [ ] Test withdrawal manually
- [ ] Verify auto-approval working
- [ ] Check admin queue empty/pending
- [ ] Monitor transfer success
- [ ] Review host feedback
- [ ] Adjust thresholds if needed

### Evening Check
- [ ] Daily metrics compiled
- [ ] No outstanding issues
- [ ] Backup completed
- [ ] Logs rotated
- [ ] Ready for next day

---

## 🆘 Rollback Plan

If critical issues found:

### Immediate Actions
1. [ ] Identify issue from logs
2. [ ] Notify team immediately
3. [ ] Assess impact (# affected hosts)
4. [ ] Decide: Fix or rollback

### Rollback Steps (If Needed)
```bash
# Stop backend
systemctl stop wewatch-backend

# Restore previous version
cp /opt/wewatch/server.backup /opt/wewatch/server

# Restart
systemctl start wewatch-backend

# Verify working
curl http://localhost:8080/health

# Revert database if needed
psql wewatch_db < backup.sql
```

### Recovery
- [ ] Identify root cause
- [ ] Fix in code
- [ ] Test thoroughly
- [ ] Deploy again
- [ ] Monitor closely

---

## ✅ Final Sign-Off

### Technical Lead
- [ ] Code review completed
- [ ] All tests passing
- [ ] Security verified
- [ ] Performance acceptable
- [ ] Ready for deployment: _____ (signature/approval)

### Product Manager
- [ ] Requirements met
- [ ] User experience validated
- [ ] Documentation complete
- [ ] Ready for launch: _____ (signature/approval)

### DevOps/Infrastructure
- [ ] Infrastructure ready
- [ ] Monitoring configured
- [ ] Backup procedures verified
- [ ] Rollback plan ready
- [ ] Ready for deployment: _____ (signature/approval)

---

## 📊 Deployment Metrics

After deployment, track:

```
Auto-Approval Rate:    Target 70-80%
Manual Review Rate:    Target 20-30%
Transfer Success:      Target > 98%
Error Rate:            Target < 1%
Response Time:         Target < 100ms
Host Satisfaction:     Monitor feedback
System Uptime:         Target 99.9%
```

---

## 🎉 Congratulations!

If all checkboxes are checked, you're ready to deploy!

**Status: READY FOR PRODUCTION** ✅

---

**Deployment Date:** ______________
**Deployed By:** ______________
**Verified By:** ______________
**Notes:** ______________

---

**Questions?** See documentation:
- Deployment: [PHASE5_COMPLETE.md](PHASE5_COMPLETE.md#-rollout-plan)
- Testing: [QUICK_START_TESTING.md](QUICK_START_TESTING.md)
- Configuration: [AUTO_APPROVAL_IMPLEMENTATION_COMPLETE.md](AUTO_APPROVAL_IMPLEMENTATION_COMPLETE.md)

**Good luck! 🚀**
