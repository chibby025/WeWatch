# LetsWatchOut - Comprehensive QA Portfolio Master Plan

**Project:** LetsWatchOut (Social Streaming Platform)  
**QA Analyst:** Chibuzor  
**Portfolio Type:** Option 1 - Full Comprehensive Documentation  
**Start Date:** April 13, 2026  
**Timeline:** 4-6 weeks (with prerequisite features)

---

## 📋 Table of Contents
1. [Executive Summary](#executive-summary)
2. [Phase 0: Prerequisite Features](#phase-0-prerequisite-features)
3. [Phase 1: Test Planning & Strategy](#phase-1-test-planning--strategy)
4. [Phase 2: Test Case Development](#phase-2-test-case-development)
5. [Phase 3: Test Automation](#phase-3-test-automation)
6. [Phase 4: API & Performance Testing](#phase-4-api--performance-testing)
7. [Phase 5: Portfolio Documentation](#phase-5-portfolio-documentation)
8. [Learning Outcomes](#learning-outcomes)
9. [Tools & Technologies](#tools--technologies)
10. [Success Metrics](#success-metrics)

---

## Executive Summary

### Project Context
- **Platform:** Social streaming platform with 3D cinema rooms
- **Current State:** Beta (8 users, 1000+ sessions, ₦2000 revenue)
- **Tech Stack:** React (Frontend), Go (Backend), PostgreSQL, WebSocket, LiveKit
- **Unique Features:** 3D cinema, proximity audio, LiveShare graphics, chunked uploads

### Portfolio Objectives
1. Demonstrate comprehensive QA skills across multiple testing types
2. Show real-world problem-solving and critical thinking
3. Build automation framework from scratch
4. Document production bugs and fixes
5. Create reusable test artifacts for job interviews

### Why This Portfolio Stands Out
- ✅ Real production app (not a tutorial project)
- ✅ Complex features (real-time, 3D rendering, payments)
- ✅ Full SDLC experience (planning → execution → reporting)
- ✅ Modern tools (Playwright, Postman, K6)
- ✅ Business context (revenue, user feedback)

---

## Phase 0: Prerequisite Features
**Duration:** Week 1-2  
**Goal:** Implement critical features before comprehensive testing

### 🔐 Feature 1: Google OAuth Integration

#### Business Context
- **Why:** 73% of users prefer social login over manual registration
- **Impact:** Reduces signup friction, increases conversion
- **Documents Needed:** Business registration certificate for Google Cloud Console

#### Implementation Plan

**Step 1: Google Cloud Console Setup**
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
- [ ] Create new project: "LetsWatchOut Production"
- [ ] Upload business registration documents for verification
- [ ] Enable Google+ API and OAuth 2.0

**Step 2: OAuth Credentials**
- [ ] Create OAuth 2.0 Client ID (Web application)
- [ ] Authorized redirect URIs:
  - `http://localhost:5173/auth/google/callback` (development)
  - `https://letswatchout.com/auth/google/callback` (production)
- [ ] Save Client ID and Client Secret

**Step 3: Backend Implementation (Go)**

**File:** `backend/internal/handlers/auth_google.go`
```go
package handlers

import (
    "encoding/json"
    "net/http"
    "github.com/gin-gonic/gin"
    "golang.org/x/oauth2"
    "golang.org/x/oauth2/google"
)

var googleOauthConfig = &oauth2.Config{
    ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
    ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
    RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
    Scopes: []string{
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    },
    Endpoint: google.Endpoint,
}

// GoogleLoginHandler initiates OAuth flow
func GoogleLoginHandler(c *gin.Context) {
    url := googleOauthConfig.AuthCodeURL("state", oauth2.AccessTypeOffline)
    c.JSON(http.StatusOK, gin.H{"url": url})
}

// GoogleCallbackHandler handles OAuth callback
func GoogleCallbackHandler(c *gin.Context) {
    // 1. Exchange code for token
    // 2. Fetch user info from Google
    // 3. Create or update user in database
    // 4. Generate JWT token
    // 5. Return user + token
}
```

**Step 4: Frontend Implementation (React)**

**File:** `frontend/src/components/GoogleLoginButton.jsx`
```jsx
import { useState } from 'react';
import apiClient from '../services/api';

const GoogleLoginButton = () => {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/api/auth/google/login');
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Google login failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleGoogleLogin}
      disabled={loading}
      className="flex items-center gap-3 w-full px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
    >
      <img src="/icons/google.svg" alt="Google" className="w-5 h-5" />
      <span>Continue with Google</span>
    </button>
  );
};
```

**Step 5: Testing Checklist**
- [ ] User can click "Continue with Google"
- [ ] Google consent screen appears
- [ ] After approval, user is redirected back
- [ ] User is logged in automatically
- [ ] User profile synced (name, email, avatar)
- [ ] Existing users can link Google account
- [ ] Error handling (denied consent, network failure)

**Learning Outcomes:**
- OAuth 2.0 flow understanding
- Third-party API integration
- Secure credential management
- State management in auth flows

---

### 💳 Feature 2: Automated Payment System

#### Business Context
- **Current State:** Manual payment verification (WhatsApp/Bank transfer)
- **Why Automate:** Scale to 100+ users, instant session access
- **Revenue Model:** Ticketed events (₦500-₦2000 per session)
- **Documents Needed:** Business registration + Bank account verification

#### Implementation Plan

**Step 1: Payment Gateway Selection**

**Option A: Paystack** (Recommended for Nigeria)
- [ ] Create Paystack account at [paystack.com](https://paystack.com)
- [ ] Submit business registration documents
- [ ] Submit bank account details for settlements
- [ ] Complete KYC verification (1-3 business days)
- [ ] Get Test API keys (immediate)
- [ ] Get Live API keys (after verification)

**Option B: Flutterwave** (Alternative)
- Similar process, good for multi-country support

**Step 2: Backend Payment Integration**

**File:** `backend/internal/handlers/payments.go`
```go
package handlers

import (
    "bytes"
    "encoding/json"
    "net/http"
    "github.com/gin-gonic/gin"
)

// InitializePaymentHandler creates payment transaction
func InitializePaymentHandler(c *gin.Context) {
    userID := c.GetUint("user_id")
    
    var input struct {
        SessionID string  `json:"session_id"`
        Amount    float64 `json:"amount"`
        Email     string  `json:"email"`
    }
    
    if err := c.ShouldBindJSON(&input); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Call Paystack API
    payload := map[string]interface{}{
        "email":  input.Email,
        "amount": input.Amount * 100, // Convert to kobo
        "metadata": map[string]interface{}{
            "session_id": input.SessionID,
            "user_id":    userID,
        },
        "callback_url": "https://letswatchout.com/payment/callback",
    }
    
    jsonData, _ := json.Marshal(payload)
    
    req, _ := http.NewRequest("POST", "https://api.paystack.co/transaction/initialize", 
        bytes.NewBuffer(jsonData))
    req.Header.Set("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, err := client.Do(req)
    
    // Parse response and return payment URL
    // Save transaction to database
    // Return authorization_url to frontend
}

// PaymentWebhookHandler verifies payment completion
func PaymentWebhookHandler(c *gin.Context) {
    // 1. Verify webhook signature
    // 2. Parse payment event
    // 3. Update transaction status in DB
    // 4. Grant session access if successful
    // 5. Send confirmation email/notification
}

// VerifyPaymentHandler checks payment status
func VerifyPaymentHandler(c *gin.Context) {
    reference := c.Param("reference")
    
    // Call Paystack verify endpoint
    // Update database
    // Return payment status
}
```

**Step 3: Database Schema**

**Migration:** `backend/migrations/XXX_create_payments_table.sql`
```sql
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    session_id VARCHAR(255) REFERENCES watch_sessions(session_id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'NGN',
    payment_gateway VARCHAR(50) DEFAULT 'paystack',
    reference VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    authorization_url TEXT,
    metadata JSONB,
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_session_id ON payments(session_id);
CREATE INDEX idx_payments_reference ON payments(reference);
CREATE INDEX idx_payments_status ON payments(status);
```

**Step 4: Frontend Payment Flow**

**File:** `frontend/src/components/PaymentModal.jsx`
```jsx
import { useState } from 'react';
import apiClient from '../services/api';

const PaymentModal = ({ session, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  
  const handlePayment = async () => {
    try {
      setLoading(true);
      
      // Initialize payment
      const response = await apiClient.post('/api/payments/initialize', {
        session_id: session.session_id,
        amount: session.ticket_price,
        email: currentUser.email,
      });
      
      // Redirect to Paystack checkout
      window.location.href = response.data.authorization_url;
      
    } catch (error) {
      console.error('Payment initialization failed:', error);
      toast.error('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="modal">
      <h2>Complete Payment</h2>
      <p>Session: {session.title}</p>
      <p>Amount: ₦{session.ticket_price}</p>
      
      <button onClick={handlePayment} disabled={loading}>
        {loading ? 'Processing...' : 'Pay Now'}
      </button>
    </div>
  );
};
```

**File:** `frontend/src/pages/PaymentCallback.jsx`
```jsx
// Handle redirect after payment
const PaymentCallback = () => {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get('reference');
  
  useEffect(() => {
    verifyPayment(reference);
  }, [reference]);
  
  const verifyPayment = async (ref) => {
    const response = await apiClient.get(`/api/payments/verify/${ref}`);
    
    if (response.data.status === 'success') {
      toast.success('Payment successful!');
      navigate(`/watch/${response.data.session_id}`);
    } else {
      toast.error('Payment verification failed');
      navigate('/lobby');
    }
  };
  
  return <div>Verifying payment...</div>;
};
```

**Step 5: Testing Checklist**
- [ ] User can select paid session
- [ ] Payment modal shows correct amount
- [ ] Payment page opens (Paystack)
- [ ] Test card completes payment (4084 0840 8408 4081)
- [ ] Webhook received and processed
- [ ] User granted session access
- [ ] Payment recorded in database
- [ ] Confirmation email sent
- [ ] Failed payment handled gracefully
- [ ] Refund process works

**Step 6: Security Checklist**
- [ ] API keys stored in environment variables
- [ ] Webhook signature verification implemented
- [ ] Amount validation (prevent tampering)
- [ ] Idempotency checks (prevent double charging)
- [ ] Transaction logging for audits
- [ ] PCI compliance (use Paystack's hosted page)

**Learning Outcomes:**
- Payment gateway integration
- Webhook handling and security
- Financial transaction management
- Compliance and security best practices

---

## Phase 1: Test Planning & Strategy
**Duration:** Week 3  
**Deliverable:** Comprehensive Test Plan Document

### 1.1 Test Scope Definition

#### Features In Scope
1. **Authentication & Authorization**
   - Manual registration (email/password)
   - Google OAuth login
   - Password reset flow
   - Session management (JWT tokens)
   - Role-based access (host vs viewer)

2. **Session Management**
   - Instant watch creation
   - Scheduled event creation
   - Session types (Movie Night, Classroom, Watch Party)
   - Class types (Lecture Hall, Study Room)
   - Content rating selection (G, PG, 13+, 18+, Mature)
   - Session ending

3. **Media Upload & Processing**
   - Chunked upload (1MB to 10MB chunks)
   - Network-aware compression (2G/3G/4G/WiFi)
   - Upload resume after disconnect
   - Progress tracking
   - Poster generation
   - Preview (MP4) generation
   - Service Worker notifications

4. **Payment System**
   - Free session creation
   - Paid ticket purchase (Paystack)
   - Payment verification
   - Session access control
   - Refund processing

5. **Real-time Features**
   - WebSocket connection management
   - Live session updates
   - Chat messaging
   - Likes/reactions
   - Preview updates (poster → MP4)
   - Session ended broadcasts

6. **Watch Experience**
   - 2D Video Watch (VideoWatch.jsx)
   - 3D Cinema (CinemaScene3DDemo.jsx)
   - Lecture Hall (LectureHallPage.jsx)
   - Seat selection and management
   - Video playback controls
   - LiveShare graphics overlays

7. **Social Features**
   - Friend requests (send, accept, reject)
   - 1-on-1 lobby chat
   - Session chat
   - Voice/video calls (LiveKit)
   - User profiles

8. **Lobby & Discovery**
   - Session preview cards
   - "Watching Now" infinite scroll
   - Search functionality
   - Filter by content rating
   - Real-time preview updates

#### Features Out of Scope (For This Portfolio)
- Admin dashboard features
- Analytics and reporting
- Email notification system (tested manually)
- Database migrations (backend concern)

### 1.2 Test Types & Coverage

| Test Type | Coverage Goal | Tools | Priority |
|-----------|--------------|-------|----------|
| **Functional Testing** | 100% critical paths | Manual + Playwright | Critical |
| **UI/UX Testing** | All user flows | Manual (5 devices) | High |
| **API Testing** | 30+ endpoints | Postman | Critical |
| **Cross-browser** | Chrome, Firefox, Safari | BrowserStack/Manual | High |
| **Mobile Testing** | Android, iOS | Real devices | High |
| **Performance** | Core endpoints | K6 Load Testing | Medium |
| **Security** | Auth, Payments | Manual + OWASP | Critical |
| **Accessibility** | WCAG 2.1 AA | Axe DevTools | Medium |
| **Regression** | All critical flows | Automated (Playwright) | Critical |

### 1.3 Test Environment Strategy

#### Environments
1. **Local Development**
   - Backend: `http://localhost:8080`
   - Frontend: `http://localhost:5173`
   - Database: PostgreSQL (local)
   - Usage: Feature development, unit testing

2. **Staging** (To be set up)
   - Backend: `https://staging-api.letswatchout.com`
   - Frontend: `https://staging.letswatchout.com`
   - Database: PostgreSQL (cloud)
   - Usage: Integration testing, UAT

3. **Production**
   - Backend: `https://api.letswatchout.com`
   - Frontend: `https://letswatchout.com`
   - Database: PostgreSQL (cloud)
   - Usage: Smoke testing, production monitoring

#### Test Data Strategy
- **User Accounts:**
  - Test Host 1: `testhost1@example.com` (Pwd: Test1234!)
  - Test Viewer 1: `testviewer1@example.com` (Pwd: Test1234!)
  - Google OAuth: Use personal account for testing
  
- **Media Files:**
  - Sample videos: 10MB, 100MB, 500MB (MP4)
  - Sample images: 1MB, 5MB (JPG, PNG)
  - Corrupt files for negative testing
  
- **Payment:**
  - Paystack test cards: 4084 0840 8408 4081 (Success)
  - 4084 0840 8408 4084 (Decline)

### 1.4 Entry & Exit Criteria

#### Entry Criteria
- [ ] Google OAuth fully implemented and deployed
- [ ] Automated payments fully implemented and deployed
- [ ] Test environment set up and accessible
- [ ] Test data prepared
- [ ] Tools installed (Playwright, Postman, K6)

#### Exit Criteria
- [ ] 100% of critical test cases executed
- [ ] 90%+ pass rate on regression suite
- [ ] All critical/high bugs resolved
- [ ] Test report published
- [ ] Automation suite running in CI/CD

### 1.5 Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WebSocket instability | Medium | High | Add reconnection logic tests |
| Payment failures | Low | Critical | Extensive Paystack webhook testing |
| 3D rendering on low-end devices | High | Medium | Device-specific test matrix |
| Large file upload timeouts | Medium | High | Network condition testing (throttling) |
| OAuth consent revocation | Low | Medium | Test error handling paths |

---

## Phase 2: Test Case Development
**Duration:** Week 3-4  
**Deliverable:** 100+ Test Cases in Spreadsheet

### 2.1 Test Case Template

**Format:** Excel/Google Sheets with tabs for each feature area

**Columns:**
- Test Case ID (TC-XXX)
- Feature Area
- Test Scenario
- Test Steps
- Expected Result
- Actual Result
- Status (Pass/Fail/Blocked)
- Priority (Critical/High/Medium/Low)
- Test Data
- Notes
- Bug ID (if failed)

### 2.2 Feature Coverage Breakdown

#### A. Authentication & Authorization (15 test cases)

**TC-AUTH-001: Manual Registration**
- **Steps:**
  1. Navigate to `/register`
  2. Enter valid email, username, password
  3. Submit form
- **Expected:** User created, redirected to lobby, session started
- **Priority:** Critical

**TC-AUTH-002: Google OAuth Login**
- **Steps:**
  1. Click "Continue with Google"
  2. Select Google account
  3. Grant permissions
- **Expected:** User logged in, profile synced, redirected to lobby
- **Priority:** Critical

**TC-AUTH-003: Invalid Login**
- **Steps:**
  1. Enter incorrect password
  2. Submit login
- **Expected:** Error message "Invalid credentials", user not logged in
- **Priority:** High

**TC-AUTH-004: Token Expiration**
- **Steps:**
  1. Login successfully
  2. Wait for token expiration (or manipulate localStorage)
  3. Attempt protected action
- **Expected:** Redirected to login, session cleared
- **Priority:** High

**TC-AUTH-005: OAuth Account Linking**
- **Steps:**
  1. Login with email/password
  2. Click "Link Google Account"
  3. Complete OAuth flow
- **Expected:** Accounts linked, Google avatar synced
- **Priority:** Medium

#### B. Session Creation (20 test cases)

**TC-SESSION-001: Create Free Instant Watch**
- **Steps:**
  1. Click Create New button
  2. Select "Instant Watch"
  3. Choose "Movie Night"
  4. Select "Free" pricing
  5. Choose "PG" content rating
  6. Click "Create Session"
- **Expected:** Session created, redirected to watch page, emoji icon shows
- **Priority:** Critical

**TC-SESSION-002: Create Paid Session**
- **Steps:**
  1. Create instant watch
  2. Select "Paid" pricing
  3. Set price ₦500
  4. Set capacity 50
  5. Create session
- **Expected:** Session created with ticket requirement, payment modal available
- **Priority:** Critical

**TC-SESSION-003: Content Rating Validation**
- **Steps:**
  1. Create session with "18+" rating
  2. Verify rating badge shows on preview card
  3. Check database `content_rating` field
- **Expected:** Rating stored correctly, badge displays with red neon glow
- **Priority:** High

**TC-SESSION-004: Lecture Hall Creation**
- **Steps:**
  1. Select "Classroom" watch type
  2. Choose "Lecture Hall" class type
  3. Set capacity (145 max)
  4. Create session
- **Expected:** Lecture hall created, 145 seats available, blackboard visible
- **Priority:** High

**TC-SESSION-005: End Session**
- **Steps:**
  1. As host, end active session
  2. Check lobby preview card
- **Expected:** Session removed from lobby immediately, no spinner
- **Priority:** Critical

#### C. Media Upload (25 test cases)

**TC-UPLOAD-001: Successful Video Upload (Small File)**
- **Steps:**
  1. Select 10MB MP4 file
  2. Upload to session
  3. Monitor progress bar
- **Expected:** Upload completes, poster generated immediately, MP4 preview ready
- **Priority:** Critical

**TC-UPLOAD-002: Chunked Upload (Large File)**
- **Steps:**
  1. Select 500MB MP4 file
  2. Monitor network tab (chunks sent)
  3. Verify progress updates
- **Expected:** File split into chunks (network-appropriate size), sequential upload, assembly on backend
- **Priority:** Critical

**TC-UPLOAD-003: Network-Aware Compression (2G)**
- **Steps:**
  1. Throttle network to 2G in DevTools
  2. Select video
  3. Verify compression modal shows
- **Expected:** Auto-compress to Low quality (480p, 1M bitrate), 1MB chunks, ~70% size reduction
- **Priority:** High

**TC-UPLOAD-004: Upload Resume After Disconnect**
- **Steps:**
  1. Start large file upload
  2. Disconnect WiFi mid-upload
  3. Reconnect after 10 seconds
  4. Check localStorage for resume data
- **Expected:** Resume modal appears, upload continues from last chunk
- **Priority:** Critical

**TC-UPLOAD-005: Service Worker Notification**
- **Steps:**
  1. Start upload
  2. Close browser tab
  3. Check notification
- **Expected:** Notification shows "Upload in progress...", prevents data loss
- **Priority:** High

**TC-UPLOAD-006: Poster Generation Broadcast**
- **Steps:**
  1. Upload video from User A
  2. User B views lobby (different browser)
  3. Verify poster appears without refresh
- **Expected:** User B sees poster update via WebSocket broadcast
- **Priority:** Critical

**TC-UPLOAD-007: Preview Cascade (Emoji → Poster → MP4)**
- **Steps:**
  1. Create session (emoji shows)
  2. Upload video (poster shows)
  3. Wait for MP4 generation (video preview shows)
- **Expected:** Smooth transitions, no spinner on poster appearance
- **Priority:** High

**TC-UPLOAD-008: Concurrent Uploads (Conflict)**
- **Steps:**
  1. User A starts uploading video
  2. User B tries uploading simultaneously
- **Expected:** Second upload blocked or queued, warning shown
- **Priority:** Medium

**TC-UPLOAD-009: Invalid File Type**
- **Steps:**
  1. Select .exe or .txt file
  2. Attempt upload
- **Expected:** Error: "Invalid file type. Please select video/image"
- **Priority:** High

**TC-UPLOAD-010: File Size Limit**
- **Steps:**
  1. Select 2GB video file
  2. Attempt upload
- **Expected:** Error: "File exceeds 1GB limit"
- **Priority:** High

#### D. Payment System (18 test cases)

**TC-PAY-001: Initialize Payment**
- **Steps:**
  1. Select paid session (₦500)
  2. Click "Buy Ticket"
  3. Verify Paystack modal opens
- **Expected:** Payment page loads with correct amount, email pre-filled
- **Priority:** Critical

**TC-PAY-002: Successful Payment (Test Card)**
- **Steps:**
  1. Enter test card: 4084 0840 8408 4081
  2. CVV: 408, Expiry: 12/30, PIN: 0000
  3. Complete payment
- **Expected:** Payment success, redirected to session, access granted
- **Priority:** Critical

**TC-PAY-003: Declined Payment**
- **Steps:**
  1. Use decline test card: 4084 0840 8408 4084
  2. Attempt payment
- **Expected:** Error message, no session access, payment status "failed"
- **Priority:** High

**TC-PAY-004: Webhook Processing**
- **Steps:**
  1. Complete payment
  2. Check backend logs for webhook
  3. Verify database updated
- **Expected:** Webhook received within 5s, payment status updated, user granted access
- **Priority:** Critical

**TC-PAY-005: Payment Verification**
- **Steps:**
  1. After payment, call `/api/payments/verify/{reference}`
  2. Check response
- **Expected:** Status "success", session_id returned, metadata correct
- **Priority:** High

**TC-PAY-006: Duplicate Payment Prevention**
- **Steps:**
  1. Complete payment for session
  2. Attempt payment again for same session
- **Expected:** Error: "You already have access to this session"
- **Priority:** Medium

**TC-PAY-007: Refund Request**
- **Steps:**
  1. User requests refund
  2. Admin processes via Paystack dashboard
  3. Verify session access revoked
- **Expected:** Refund successful, access removed, payment status "refunded"
- **Priority:** Medium

**TC-PAY-008: Free Session Access**
- **Steps:**
  1. Join free session
  2. Verify no payment modal
  3. Access granted immediately
- **Expected:** No payment required, instant access
- **Priority:** Critical

#### E. Real-time Features (22 test cases)

**TC-REALTIME-001: WebSocket Connection**
- **Steps:**
  1. Login and navigate to lobby
  2. Check browser console
  3. Monitor network tab (WS)
- **Expected:** WebSocket connected, "lobby_connected" message received
- **Priority:** Critical

**TC-REALTIME-002: Session Started Broadcast**
- **Steps:**
  1. User A creates session
  2. User B views lobby
  3. Verify new session appears
- **Expected:** User B sees new session without refresh
- **Priority:** High

**TC-REALTIME-003: Session Ended Broadcast**
- **Steps:**
  1. User A ends session
  2. User B views lobby
  3. Check session list
- **Expected:** Session removed from User B's lobby immediately
- **Priority:** Critical

**TC-REALTIME-004: Chat Message Broadcast**
- **Steps:**
  1. User A sends session chat
  2. User B in same session
  3. Verify message appears
- **Expected:** User B sees message within 1 second
- **Priority:** High

**TC-REALTIME-005: Like Broadcast**
- **Steps:**
  1. User A likes session
  2. User B views same session preview
  3. Check like count
- **Expected:** Like count updates in real-time for User B
- **Priority:** Medium

**TC-REALTIME-006: Reconnection After Disconnect**
- **Steps:**
  1. Connected to lobby
  2. Disconnect network
  3. Reconnect after 10s
- **Expected:** WebSocket reconnects automatically, exponential backoff
- **Priority:** High

#### F. Watch Experience (30 test cases)

**TC-WATCH-001: 2D Video Playback**
- **Steps:**
  1. Join session with uploaded video
  2. Play video
  3. Test controls (play, pause, seek)
- **Expected:** Video plays smoothly, controls responsive, no buffering
- **Priority:** Critical

**TC-WATCH-002: 3D Cinema Rendering**
- **Steps:**
  1. Join 3D cinema session
  2. Select seat
  3. Navigate camera (WASD)
- **Expected:** 3D scene loads, seat positioning correct, camera smooth
- **Priority:** High

**TC-WATCH-003: Lecture Hall Seat Selection**
- **Steps:**
  1. Join lecture hall
  2. Click empty seat
  3. Verify occupation
- **Expected:** Seat turns occupied, other users see update
- **Priority:** High

**TC-WATCH-004: LiveShare Graphics Overlay**
- **Steps:**
  1. Host enables breaking news banner
  2. Set text "Breaking: New Feature Released"
  3. Check viewer's screen
- **Expected:** Banner appears on video overlay, text readable, logo positioned correctly
- **Priority:** Medium

**TC-WATCH-005: Spatial Audio (3D Cinema)**
- **Steps:**
  1. Join 3D cinema with voice chat
  2. User A speaks from left seat
  3. User B in right seat
  4. Verify audio panning
- **Expected:** Audio comes from correct direction based on seat position
- **Priority:** Medium

#### G. Social Features (15 test cases)

**TC-SOCIAL-001: Send Friend Request**
- **Steps:**
  1. Find user profile
  2. Click "Add Friend"
  3. Check recipient's requests tab
- **Expected:** Request sent, appears in recipient's pending list
- **Priority:** High

**TC-SOCIAL-002: Accept Friend Request**
- **Steps:**
  1. Go to Requests tab
  2. Click ✓ on pending request
  3. Check Friends list
- **Expected:** Friend added, chat available
- **Priority:** High

**TC-SOCIAL-003: Lobby Chat (Stacked View)**
- **Steps:**
  1. Go to Chats tab (Friends view)
  2. Tap friend
  3. Verify messages view
  4. Tap back arrow
- **Expected:** Smooth transition, back returns to friends list
- **Priority:** High

**TC-SOCIAL-004: Message Preview**
- **Steps:**
  1. User A sends "Hello!"
  2. User B views friends list
  3. Check preview under friend's name
- **Expected:** Last message "Hello!" shows with timestamp
- **Priority:** Medium

**TC-SOCIAL-005: Online Status Indicator**
- **Steps:**
  1. User A online
  2. User B views friends list
  3. Check green dot on avatar
- **Expected:** Green dot appears on online friends
- **Priority:** Low (not yet implemented)

#### H. Lobby & Discovery (10 test cases)

**TC-LOBBY-001: Search Sessions**
- **Steps:**
  1. Enter "movie" in search bar
  2. Press Enter
- **Expected:** Only sessions with "movie" in title/description show
- **Priority:** High

**TC-LOBBY-002: Filter by Content Rating**
- **Steps:**
  1. Enable "18+" filter
  2. Check visible sessions
- **Expected:** Only 18+ rated sessions visible
- **Priority:** Medium

**TC-LOBBY-003: Infinite Scroll**
- **Steps:**
  1. Scroll to bottom of "Watching Now"
  2. Wait for load
  3. Verify new sessions load
- **Expected:** Next 10 sessions load automatically
- **Priority:** High

**TC-LOBBY-004: Create Button Discovery (First Visit)**
- **Steps:**
  1. Clear localStorage
  2. Refresh lobby
  3. Go to Rooms tab
- **Expected:** Create button pulses with blue glow for 5 seconds
- **Priority:** Low

### 2.3 Test Case Priority Matrix

| Priority | Criteria | Count Target |
|----------|----------|--------------|
| **Critical** | Core user flows, revenue-impacting | 35+ |
| **High** | Important features, used frequently | 40+ |
| **Medium** | Secondary features, edge cases | 20+ |
| **Low** | Nice-to-have, rare scenarios | 10+ |

**Total Test Cases:** 105+

---

## Phase 3: Test Automation
**Duration:** Week 4-5  
**Deliverable:** Playwright Test Suite + CI/CD Integration

### 3.1 Automation Strategy

#### What to Automate
- ✅ Critical paths (login, session creation, upload, payment)
- ✅ Regression tests (run on every commit)
- ✅ Cross-browser compatibility
- ✅ Smoke tests (quick health check)

#### What NOT to Automate
- ❌ 3D rendering (visual testing, manual only)
- ❌ Audio quality checks
- ❌ One-time exploratory tests
- ❌ Highly unstable features

### 3.2 Playwright Setup

**Installation:**
```bash
cd frontend
npm install -D @playwright/test
npx playwright install
```

**Configuration:** `playwright.config.js`
```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  retries: 2, // Retry flaky tests
  workers: 4, // Parallel execution
  
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
```

### 3.3 Automation Test Suite Structure

```
frontend/tests/
├── fixtures/
│   ├── auth.fixture.js          # Reusable login state
│   └── test-data.json           # Test data constants
├── page-objects/
│   ├── LoginPage.js
│   ├── LobbyPage.js
│   ├── SessionCreationModal.js
│   ├── UploadPage.js
│   └── PaymentPage.js
├── e2e/
│   ├── auth/
│   │   ├── login.spec.js
│   │   ├── google-oauth.spec.js
│   │   └── registration.spec.js
│   ├── session/
│   │   ├── create-session.spec.js
│   │   ├── join-session.spec.js
│   │   └── end-session.spec.js
│   ├── upload/
│   │   ├── video-upload.spec.js
│   │   ├── chunked-upload.spec.js
│   │   └── compression.spec.js
│   ├── payment/
│   │   ├── ticket-purchase.spec.js
│   │   └── payment-verification.spec.js
│   ├── realtime/
│   │   ├── websocket.spec.js
│   │   ├── chat.spec.js
│   │   └── likes.spec.js
│   └── social/
│       ├── friend-requests.spec.js
│       └── lobby-chat.spec.js
├── visual/
│   └── regression.spec.js       # Screenshot comparison
├── accessibility/
│   └── a11y.spec.js             # Axe accessibility tests
└── smoke/
    └── critical-paths.spec.js   # Quick health check
```

### 3.4 Sample Automated Tests

#### A. Page Object Model

**File:** `tests/page-objects/LoginPage.js`
```javascript
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.loginButton = page.locator('button[type="submit"]');
    this.googleButton = page.locator('text=Continue with Google');
    this.errorMessage = page.locator('.error-message');
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email, password) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginWithGoogle() {
    await this.googleButton.click();
    // Handle OAuth popup
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }
}
```

**File:** `tests/page-objects/LobbyPage.js`
```javascript
export class LobbyPage {
  constructor(page) {
    this.page = page;
    this.createButton = page.locator('[title*="Create New"]');
    this.searchInput = page.locator('input[placeholder*="Search"]');
    this.sessionCards = page.locator('.session-card');
    this.chatsTab = page.locator('button:has-text("Chats")');
    this.roomsTab = page.locator('button:has-text("Rooms")');
    this.watchingNowTab = page.locator('button:has-text("Watching Now")');
  }

  async goto() {
    await this.page.goto('/lobby');
  }

  async openCreateModal() {
    await this.createButton.click();
  }

  async searchSessions(query) {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
  }

  async getSessionCount() {
    return await this.sessionCards.count();
  }

  async switchToChatsTab() {
    await this.chatsTab.click();
  }
}
```

#### B. Authentication Tests

**File:** `tests/e2e/auth/login.spec.js`
```javascript
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../page-objects/LoginPage';
import { LobbyPage } from '../../page-objects/LobbyPage';

test.describe('User Authentication', () => {
  test('TC-AUTH-001: Successful login with valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    const lobbyPage = new LobbyPage(page);
    
    await loginPage.goto();
    await loginPage.login('testhost1@example.com', 'Test1234!');
    
    // Verify redirect to lobby
    await expect(page).toHaveURL(/.*lobby/);
    
    // Verify user is logged in
    await expect(lobbyPage.createButton).toBeVisible();
  });

  test('TC-AUTH-003: Failed login with invalid password', async ({ page }) => {
    const loginPage = new LoginPage(page);
    
    await loginPage.goto();
    await loginPage.login('testhost1@example.com', 'WrongPassword123');
    
    // Verify error message
    const error = await loginPage.getErrorMessage();
    expect(error).toContain('Invalid credentials');
    
    // Verify still on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('TC-AUTH-002: Google OAuth login flow', async ({ page, context }) => {
    // Note: This requires special setup for OAuth testing
    // Option 1: Mock OAuth response
    // Option 2: Use Playwright's route interception
    
    const loginPage = new LoginPage(page);
    
    // Intercept OAuth redirect
    await page.route('**/auth/google/login', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ url: 'http://localhost:5173/lobby' })
      });
    });
    
    await loginPage.goto();
    await loginPage.loginWithGoogle();
    
    // Verify logged in
    await expect(page).toHaveURL(/.*lobby/);
  });
});
```

#### C. Session Creation Tests

**File:** `tests/e2e/session/create-session.spec.js`
```javascript
import { test, expect } from '@playwright/test';
import { LobbyPage } from '../../page-objects/LobbyPage';

test.describe('Session Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testhost1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/lobby');
  });

  test('TC-SESSION-001: Create free instant watch', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    
    // Open create modal
    await lobbyPage.openCreateModal();
    
    // Fill form
    await page.click('text=Instant Watch');
    await page.click('text=Movie Night');
    await page.click('text=Free');
    
    // Select content rating
    await page.click('[alt="PG"]');
    
    // Create session
    await page.click('text=Create Session');
    
    // Verify redirect to watch page
    await expect(page).toHaveURL(/.*\/watch\/.*/);
    
    // Verify session created
    const sessionTitle = page.locator('h1');
    await expect(sessionTitle).toContainText('Movie Night');
  });

  test('TC-SESSION-002: Create paid session with ticket', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    
    await lobbyPage.openCreateModal();
    await page.click('text=Instant Watch');
    await page.click('text=Watch Party');
    
    // Select paid pricing
    await page.click('text=Paid');
    await page.fill('input[name="ticket_price"]', '500');
    await page.fill('input[name="capacity"]', '50');
    
    await page.click('[alt="13+"]');
    await page.click('text=Create Session');
    
    // Verify session created
    await expect(page).toHaveURL(/.*\/watch\/.*/);
    
    // Verify ticket requirement
    const ticketBadge = page.locator('text=₦500');
    await expect(ticketBadge).toBeVisible();
  });

  test('TC-SESSION-004: Create lecture hall', async ({ page }) => {
    const lobbyPage = new LobbyPage(page);
    
    await lobbyPage.openCreateModal();
    await page.click('text=Instant Watch');
    await page.click('text=Classroom');
    
    // Select class type
    await page.click('text=Lecture Hall');
    
    // Set capacity (max 145)
    await page.fill('input[name="capacity"]', '100');
    
    await page.click('[alt="G"]');
    await page.click('text=Create Session');
    
    // Verify lecture hall created
    await expect(page).toHaveURL(/.*\/lecture-hall\/.*/);
    
    // Verify seat count
    const seats = page.locator('.seat');
    await expect(seats).toHaveCount(145); // Max capacity
  });
});
```

#### D. Upload Tests

**File:** `tests/e2e/upload/video-upload.spec.js`
```javascript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Video Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Login and create session
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testhost1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/lobby');
    
    // Create instant watch
    await page.click('[title*="Create New"]');
    await page.click('text=Instant Watch');
    await page.click('text=Movie Night');
    await page.click('text=Free');
    await page.click('[alt="PG"]');
    await page.click('text=Create Session');
    await page.waitForURL('**/watch/**');
  });

  test('TC-UPLOAD-001: Upload small video file', async ({ page }) => {
    const filePath = path.join(__dirname, '../../fixtures/sample-video-10mb.mp4');
    
    // Click upload button
    await page.click('button:has-text("Upload Video")');
    
    // Select file
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Wait for upload progress
    const progressBar = page.locator('.upload-progress');
    await expect(progressBar).toBeVisible();
    
    // Wait for completion
    await expect(progressBar).toHaveText(/100%/, { timeout: 60000 });
    
    // Verify poster generated
    await page.goto('/lobby');
    const sessionCard = page.locator('.session-card').first();
    const poster = sessionCard.locator('img[alt*="poster"]');
    await expect(poster).toBeVisible();
  });

  test('TC-UPLOAD-003: Network-aware compression on 2G', async ({ page, context }) => {
    // Throttle network to 2G
    await context.route('**/*', route => {
      route.continue({
        // Simulate 2G: 50 KB/s download, 20 KB/s upload
        throttle: {
          download_throughput: 50 * 1024,
          upload_throughput: 20 * 1024,
          latency: 200,
        },
      });
    });
    
    const filePath = path.join(__dirname, '../../fixtures/sample-video-100mb.mp4');
    
    await page.click('button:has-text("Upload Video")');
    await page.setInputFiles('input[type="file"]', filePath);
    
    // Verify compression modal appears
    const compressionModal = page.locator('text=Compress Video');
    await expect(compressionModal).toBeVisible();
    
    // Verify auto-selected quality
    const lowQuality = page.locator('input[value="low"]:checked');
    await expect(lowQuality).toBeChecked();
    
    // Confirm compression
    await page.click('button:has-text("Compress & Upload")');
    
    // Verify compression progress
    const compressProgress = page.locator('.compress-progress');
    await expect(compressProgress).toBeVisible();
  });

  test('TC-UPLOAD-009: Invalid file type rejection', async ({ page }) => {
    const txtFile = path.join(__dirname, '../../fixtures/sample.txt');
    
    await page.click('button:has-text("Upload Video")');
    await page.setInputFiles('input[type="file"]', txtFile);
    
    // Verify error message
    const errorToast = page.locator('.toast-error');
    await expect(errorToast).toContainText('Invalid file type');
  });
});
```

#### E. Payment Tests

**File:** `tests/e2e/payment/ticket-purchase.spec.js`
```javascript
import { test, expect } from '@playwright/test';

test.describe('Payment System', () => {
  test('TC-PAY-001: Initialize payment for paid session', async ({ page }) => {
    // Login as viewer
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testviewer1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    
    // Navigate to lobby
    await page.waitForURL('**/lobby');
    
    // Find paid session
    const paidSession = page.locator('.session-card:has-text("₦500")').first();
    await paidSession.click();
    
    // Click buy ticket
    await page.click('button:has-text("Buy Ticket")');
    
    // Wait for Paystack modal
    await expect(page).toHaveURL(/.*paystack.com.*/);
  });

  test('TC-PAY-002: Successful payment with test card', async ({ page, context }) => {
    // Note: This requires Paystack test environment
    // We'll mock the payment flow for automated testing
    
    await page.route('**/api/payments/initialize', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          authorization_url: 'http://localhost:5173/payment/success',
          reference: 'test-ref-123'
        })
      });
    });
    
    await page.route('**/api/payments/verify/**', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          status: 'success',
          session_id: 'test-session-123'
        })
      });
    });
    
    // Login and attempt purchase
    await page.goto('/lobby');
    await page.fill('input[name="email"]', 'testviewer1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    
    const paidSession = page.locator('.session-card:has-text("₦500")').first();
    await paidSession.click();
    await page.click('button:has-text("Buy Ticket")');
    
    // Verify redirect to success page
    await expect(page).toHaveURL(/.*payment\/success.*/);
    
    // Verify access granted
    await page.goto('/watch/test-session-123');
    const video = page.locator('video');
    await expect(video).toBeVisible();
  });
});
```

#### F. Real-time WebSocket Tests

**File:** `tests/e2e/realtime/websocket.spec.js`
```javascript
import { test, expect } from '@playwright/test';

test.describe('WebSocket Real-time Features', () => {
  test('TC-REALTIME-001: WebSocket connection established', async ({ page }) => {
    // Listen for WebSocket
    const wsPromise = page.waitForEvent('websocket');
    
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testhost1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    
    const ws = await wsPromise;
    
    // Verify connection
    expect(ws.url()).toContain('ws://');
    
    // Listen for lobby_connected message
    const messagePromise = ws.waitForEvent('framereceived', {
      predicate: frame => {
        try {
          const data = JSON.parse(frame.text());
          return data.type === 'lobby_connected';
        } catch {
          return false;
        }
      }
    });
    
    const frame = await messagePromise;
    const data = JSON.parse(frame.text());
    expect(data.type).toBe('lobby_connected');
  });

  test('TC-REALTIME-003: Session ended broadcast', async ({ browser }) => {
    // Open two browser contexts (User A and User B)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    // User A creates session
    await pageA.goto('/login');
    await pageA.fill('input[name="email"]', 'testhost1@example.com');
    await pageA.fill('input[name="password"]', 'Test1234!');
    await pageA.click('button[type="submit"]');
    await pageA.waitForURL('**/lobby');
    
    await pageA.click('[title*="Create New"]');
    await pageA.click('text=Instant Watch');
    await pageA.click('text=Movie Night');
    await pageA.click('text=Free');
    await pageA.click('[alt="PG"]');
    await pageA.click('text=Create Session');
    
    const sessionUrl = pageA.url();
    const sessionId = sessionUrl.split('/').pop();
    
    // User B views lobby
    await pageB.goto('/login');
    await pageB.fill('input[name="email"]', 'testviewer1@example.com');
    await pageB.fill('input[name="password"]', 'Test1234!');
    await pageB.click('button[type="submit"]');
    await pageB.waitForURL('**/lobby');
    
    // Verify User B sees the session
    const sessionCard = pageB.locator(`[data-session-id="${sessionId}"]`);
    await expect(sessionCard).toBeVisible();
    
    // User A ends session
    await pageA.click('button:has-text("End Session")');
    
    // Wait for WebSocket broadcast
    await pageB.waitForTimeout(2000);
    
    // Verify session removed from User B's lobby
    await expect(sessionCard).not.toBeVisible();
    
    await contextA.close();
    await contextB.close();
  });
});
```

### 3.5 Test Execution & Reporting

**Run Tests:**
```bash
# Run all tests
npx playwright test

# Run specific suite
npx playwright test tests/e2e/auth/

# Run with UI (debugging)
npx playwright test --ui

# Run specific browser
npx playwright test --project=chromium

# Run in headed mode
npx playwright test --headed

# Generate HTML report
npx playwright test --reporter=html
```

**CI/CD Integration (GitHub Actions):**

**File:** `.github/workflows/playwright.yml`
```yaml
name: Playwright Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    
    - name: Install dependencies
      run: |
        cd frontend
        npm ci
    
    - name: Install Playwright Browsers
      run: npx playwright install --with-deps
    
    - name: Run Playwright tests
      run: npx playwright test
    
    - uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 30
```

### 3.6 Accessibility Testing

**File:** `tests/accessibility/a11y.spec.js`
```javascript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility Tests', () => {
  test('Lobby page should not have WCAG violations', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testhost1@example.com');
    await page.fill('input[name="password"]', 'Test1234!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/lobby');
    
    const results = await new AxeBuilder({ page }).analyze();
    
    expect(results.violations).toEqual([]);
  });

  test('Session creation modal should be accessible', async ({ page }) => {
    await page.goto('/lobby');
    // Login first...
    
    await page.click('[title*="Create New"]');
    
    const results = await new AxeBuilder({ page }).analyze();
    
    expect(results.violations).toEqual([]);
  });
});
```

### 3.7 Visual Regression Testing

**File:** `tests/visual/regression.spec.js`
```javascript
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('Lobby page matches baseline', async ({ page }) => {
    await page.goto('/lobby');
    // Login...
    
    await expect(page).toHaveScreenshot('lobby-page.png');
  });

  test('Session preview card matches baseline', async ({ page }) => {
    await page.goto('/lobby');
    // Login...
    
    const sessionCard = page.locator('.session-card').first();
    await expect(sessionCard).toHaveScreenshot('session-card.png');
  });

  test('Create modal matches baseline', async ({ page }) => {
    await page.goto('/lobby');
    // Login...
    
    await page.click('[title*="Create New"]');
    const modal = page.locator('.create-modal');
    await expect(modal).toHaveScreenshot('create-modal.png');
  });
});
```

---

## Phase 4: API & Performance Testing
**Duration:** Week 5-6  
**Deliverable:** Postman Collection + K6 Load Test Results

### 4.1 API Testing with Postman

#### Collection Structure
```
LetsWatchOut API Tests/
├── 1. Authentication/
│   ├── Register User
│   ├── Login
│   ├── Google OAuth (Mock)
│   └── Logout
├── 2. Session Management/
│   ├── Create Instant Watch
│   ├── Get Active Sessions
│   ├── Get Session Details
│   └── End Session
├── 3. Upload/
│   ├── Chunk Upload (Initiate)
│   ├── Chunk Upload (Send Chunk)
│   └── Chunk Upload (Finalize)
├── 4. Payments/
│   ├── Initialize Payment
│   ├── Verify Payment
│   └── Get Payment History
├── 5. Social/
│   ├── Send Friend Request
│   ├── Accept Friend Request
│   ├── Get Friends List
│   └── Send Lobby Chat
└── 6. Real-time/
    ├── Get Session Likes
    ├── Like Session
    └── Get Session Chat Count
```

#### Sample Postman Tests

**Request:** `POST /api/auth/login`
```json
// Body
{
  "email": "testhost1@example.com",
  "password": "Test1234!"
}

// Tests
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns JWT token", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.token).to.be.a('string');
    pm.environment.set("auth_token", jsonData.token);
});

pm.test("Returns user object", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.user).to.have.property('id');
    pm.expect(jsonData.user).to.have.property('email');
});
```

**Request:** `POST /api/rooms/instant-watch`
```json
// Headers
Authorization: Bearer {{auth_token}}

// Body
{
  "watch_type": "movie_night",
  "is_private": false,
  "content_rating": "PG",
  "capacity": 10
}

// Tests
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("Session created with correct watch_type", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.session.watch_type).to.eql('movie_night');
});

pm.test("Session ID is UUID format", function () {
    var jsonData = pm.response.json();
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    pm.expect(jsonData.session.session_id).to.match(uuidPattern);
});

pm.test("Content rating set correctly", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.session.content_rating).to.eql('PG');
});

// Save session_id for next tests
pm.environment.set("session_id", pm.response.json().session.session_id);
```

**Request:** `POST /api/payments/initialize`
```json
// Body
{
  "session_id": "{{session_id}}",
  "amount": 500,
  "email": "testviewer1@example.com"
}

// Tests
pm.test("Payment initialized successfully", function () {
    pm.response.to.have.status(200);
});

pm.test("Returns Paystack authorization URL", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.authorization_url).to.include('paystack.com');
});

pm.test("Reference generated", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.reference).to.be.a('string');
    pm.environment.set("payment_reference", jsonData.reference);
});
```

#### Automated Test Runs

**Newman (CLI Runner):**
```bash
# Install Newman
npm install -g newman

# Run collection
newman run LetsWatchOut-API-Tests.json -e environment.json

# Generate HTML report
newman run LetsWatchOut-API-Tests.json -e environment.json -r htmlextra --reporter-htmlextra-export report.html
```

### 4.2 Performance Testing with K6

#### Installation
```bash
# macOS
brew install k6

# Windows (WSL)
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

#### Test Scenarios

**File:** `performance/load-test.js`
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  stages: [
    { duration: '1m', target: 20 },   // Ramp up to 20 users
    { duration: '3m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 100 },  // Sustained load: 100 users
    { duration: '2m', target: 50 },   // Ramp down to 50
    { duration: '1m', target: 0 },    // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    errors: ['rate<0.1'],              // Error rate below 10%
  },
};

const BASE_URL = 'http://localhost:8080';

export function setup() {
  // Login to get auth token
  const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
    email: 'testhost1@example.com',
    password: 'Test1234!',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return { token: loginRes.json('token') };
}

export default function (data) {
  const headers = {
    'Authorization': `Bearer ${data.token}`,
    'Content-Type': 'application/json',
  };
  
  // Test 1: Get active sessions (most frequent endpoint)
  let res = http.get(`${BASE_URL}/api/sessions/active`, { headers });
  check(res, {
    'Active sessions status 200': (r) => r.status === 200,
    'Response time < 500ms': (r) => r.timings.duration < 500,
  }) || errorRate.add(1);
  
  sleep(1);
  
  // Test 2: Create instant watch (less frequent, heavier)
  res = http.post(`${BASE_URL}/api/rooms/instant-watch`, JSON.stringify({
    watch_type: 'movie_night',
    is_private: false,
    content_rating: 'PG',
    capacity: 10,
  }), { headers });
  check(res, {
    'Create session status 201': (r) => r.status === 201,
  }) || errorRate.add(1);
  
  sleep(2);
  
  // Test 3: Get session details
  if (res.status === 201) {
    const sessionId = res.json('session.session_id');
    res = http.get(`${BASE_URL}/api/sessions/${sessionId}`, { headers });
    check(res, {
      'Session details status 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  }
  
  sleep(1);
}
```

**File:** `performance/spike-test.js`
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },   // Normal load
    { duration: '10s', target: 200 },  // Spike to 200 users
    { duration: '30s', target: 200 },  // Sustained spike
    { duration: '10s', target: 10 },   // Back to normal
  ],
};

const BASE_URL = 'http://localhost:8080';

export default function () {
  const res = http.get(`${BASE_URL}/api/sessions/active`);
  check(res, {
    'Status 200': (r) => r.status === 200,
  });
}
```

**File:** `performance/stress-test.js`
```javascript
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 100 },
    { duration: '5m', target: 200 },  // Beyond normal capacity
    { duration: '5m', target: 300 },  // Push to breaking point
    { duration: '2m', target: 0 },
  ],
};

const BASE_URL = 'http://localhost:8080';

export default function () {
  const res = http.get(`${BASE_URL}/api/sessions/active`);
  check(res, {
    'Status 200 or 503': (r) => r.status === 200 || r.status === 503,
  });
}
```

#### Run Tests
```bash
# Load test
k6 run performance/load-test.js

# Spike test
k6 run performance/spike-test.js

# Stress test
k6 run performance/stress-test.js

# Output to HTML
k6 run --out json=results.json performance/load-test.js
```

#### Expected Performance Metrics

| Endpoint | Target p95 | Target p99 | Acceptable Error Rate |
|----------|-----------|-----------|----------------------|
| GET /api/sessions/active | < 300ms | < 500ms | < 1% |
| POST /api/rooms/instant-watch | < 500ms | < 1s | < 2% |
| POST /api/payments/initialize | < 800ms | < 1.5s | < 5% |
| WebSocket connection | < 200ms | < 400ms | < 1% |
| Chunk upload (per chunk) | < 2s | < 5s | < 3% |

---

## Phase 5: Portfolio Documentation
**Duration:** Week 6  
**Deliverable:** GitHub Repo with Professional README

### 5.1 Repository Structure

```
letswatchout-qa-portfolio/
├── README.md                          # Main portfolio landing page
├── TEST_PLAN.md                       # Comprehensive test plan
├── BUG_REPORTS.md                     # Documented bugs + fixes
├── test-cases/
│   ├── authentication.xlsx
│   ├── session-management.xlsx
│   ├── upload.xlsx
│   ├── payments.xlsx
│   └── realtime.xlsx
├── automation/
│   ├── playwright/                    # Playwright test suite
│   │   ├── tests/
│   │   ├── playwright.config.js
│   │   └── package.json
│   └── screenshots/                   # Test execution screenshots
├── api-testing/
│   ├── LetsWatchOut-API-Tests.postman_collection.json
│   ├── environment.json
│   └── newman-report.html
├── performance/
│   ├── load-test.js
│   ├── spike-test.js
│   ├── stress-test.js
│   └── results/
│       ├── load-test-results.json
│       └── performance-report.pdf
├── documentation/
│   ├── test-strategy.md
│   ├── test-execution-report.md
│   └── lessons-learned.md
└── assets/
    ├── architecture-diagram.png
    ├── test-coverage-graph.png
    └── demo-video.mp4
```

### 5.2 Portfolio README Template

**File:** `README.md`
```markdown
# LetsWatchOut - QA Testing Portfolio

**Portfolio by:** Chibuzor  
**Role:** QA Analyst  
**Project:** LetsWatchOut (Social Streaming Platform)  
**Timeline:** April-May 2026 (6 weeks)

---

## 📌 Executive Summary

This portfolio showcases comprehensive QA testing work on **LetsWatchOut**, a production-grade social streaming platform with 3D cinema rooms, real-time features, and payment integration.

### Key Achievements
- ✅ **105+ test cases** across 8 feature areas
- ✅ **85% automation coverage** on critical paths (Playwright)
- ✅ **30+ API tests** (Postman collection)
- ✅ **Load testing** up to 100 concurrent users (K6)
- ✅ **8 critical bugs** found and verified fixed
- ✅ **Cross-browser testing** (Chrome, Firefox, Safari)
- ✅ **Mobile testing** (Android, iOS)

### Skills Demonstrated
- Manual Testing (Functional, UI/UX, Exploratory)
- Test Automation (Playwright, JavaScript)
- API Testing (Postman, REST)
- Performance Testing (K6, Load/Spike/Stress)
- Bug Reporting & Tracking
- Test Planning & Strategy
- Cross-browser/device Testing
- Agile/SDLC Collaboration

---

## 🎯 Project Context

### About LetsWatchOut
- **Type:** Social streaming platform
- **Features:** 3D cinema rooms, real-time chat, payments, media uploads
- **Tech Stack:** React, Go, PostgreSQL, WebSocket, LiveKit
- **Production Metrics:** 8 beta users, 1000+ sessions, ₦2000 revenue

### Complexity Highlights
- **Real-time Systems:** WebSocket for live updates, LiveKit for voice/video
- **3D Rendering:** Three.js cinema with spatial audio
- **Payment Integration:** Paystack for automated ticketing
- **Chunked Uploads:** Network-aware compression (2G/3G/4G/WiFi)
- **OAuth:** Google authentication integration

---

## 📋 Test Coverage

### Test Plan
[View Full Test Plan](TEST_PLAN.md)

**Scope:**
- Authentication (Manual + Google OAuth)
- Session Management (Instant Watch, Scheduled Events)
- Media Upload (Chunked, Compression, Resume)
- Payment System (Paystack Integration)
- Real-time Features (WebSocket, Chat, Likes)
- Watch Experience (2D, 3D Cinema, Lecture Hall)
- Social Features (Friends, Lobby Chat)

**Test Types:**
- Functional Testing (100% critical paths)
- UI/UX Testing (5 devices)
- API Testing (30+ endpoints)
- Performance Testing (100 concurrent users)
- Cross-browser (Chrome, Firefox, Safari)
- Mobile Testing (Android, iOS)
- Accessibility (WCAG 2.1 AA)

### Test Cases
[View Test Cases (Excel)](test-cases/)

**Summary:**
- **Total:** 105 test cases
- **Critical:** 35 (Core revenue/UX flows)
- **High:** 40 (Important features)
- **Medium:** 20 (Secondary features)
- **Low:** 10 (Edge cases)

**Pass Rate:** 96% (101/105)

---

## 🤖 Test Automation

### Playwright Test Suite
[View Automation Code](automation/playwright/)

**Coverage:**
- 25 end-to-end tests
- 85% coverage on critical paths
- 5 browser configurations (Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari)

**Test Execution:**
```bash
npx playwright test
```

**Sample Test:**
```javascript
test('Create free instant watch session', async ({ page }) => {
  await page.goto('/lobby');
  await page.click('[title*="Create New"]');
  await page.click('text=Instant Watch');
  await page.click('text=Movie Night');
  await page.click('text=Free');
  await page.click('[alt="PG"]');
  await page.click('text=Create Session');
  
  await expect(page).toHaveURL(/.*\/watch\/.*/);
});
```

### CI/CD Integration
- GitHub Actions workflow
- Automated test runs on every commit
- HTML reports with screenshots/videos

---

## 🔌 API Testing

### Postman Collection
[Download Collection](api-testing/LetsWatchOut-API-Tests.postman_collection.json)

**Coverage:**
- 32 API endpoints
- Authentication flow
- Session CRUD operations
- Payment initialization & verification
- Friend requests & lobby chat

**Sample Test:**
```javascript
pm.test("Status code is 201", function () {
    pm.response.to.have.status(201);
});

pm.test("Session created with correct content_rating", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.session.content_rating).to.eql('PG');
});
```

**Newman CLI Execution:**
```bash
newman run LetsWatchOut-API-Tests.json -e environment.json -r htmlextra
```

---

## ⚡ Performance Testing

### K6 Load Testing
[View Test Scripts](performance/)

**Test Scenarios:**
- **Load Test:** 100 concurrent users (sustained 5 minutes)
- **Spike Test:** Sudden spike to 200 users
- **Stress Test:** Push to breaking point (300+ users)

**Results:**
- **p95 Response Time:** 320ms (target: <500ms) ✅
- **p99 Response Time:** 580ms (target: <1s) ✅
- **Error Rate:** 0.8% (target: <1%) ✅
- **Throughput:** 450 req/s

**Performance Graph:**
![Load Test Results](performance/results/performance-graph.png)

---

## 🐞 Bug Reports

[View All Bug Reports](BUG_REPORTS.md)

### Critical Bugs Found

#### BUG-001: Session Preview Not Auto-Updating
**Severity:** Medium | **Priority:** High | **Status:** ✅ Fixed

**Description:**
Session preview cards stuck on emoji icon after media upload, required manual refresh.

**Root Cause:**
Backend poster generation was async but didn't broadcast to lobby via WebSocket.

**Fix:**
Added lobby broadcast after poster generation in `chunk_upload.go`.

**Verification:**
- Uploaded video from User A
- User B observed lobby without refresh
- Poster appeared within 2 seconds ✅

---

#### BUG-005: Content Rating Defaulting to 'G'
**Severity:** High | **Priority:** Critical | **Status:** ✅ Fixed

**Description:**
Content rating always saved as 'G' regardless of user selection.

**Root Cause:**
`CreateWatchSession` handler missing `ContentRating` field in input struct.

**Fix:**
Added `ContentRating` field and validation logic in `room_handlers.go`.

**Verification:**
- Created session with "18+" rating
- Verified database field = "18+"
- Confirmed red neon badge displayed ✅

---

## 📊 Test Execution Report

[View Full Report](documentation/test-execution-report.md)

### Summary
- **Test Cases Executed:** 105
- **Passed:** 101 (96%)
- **Failed:** 2 (2%)
- **Blocked:** 2 (2%)
- **Execution Time:** 3 weeks

### Defect Summary
- **Total Bugs Found:** 8
- **Critical:** 1 (Fixed)
- **High:** 3 (Fixed)
- **Medium:** 3 (2 Fixed, 1 Deferred)
- **Low:** 1 (Deferred)

### Browser Compatibility
| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 122 | ✅ Pass |
| Firefox | 123 | ✅ Pass |
| Safari | 17.3 | ✅ Pass |
| Edge | 122 | ✅ Pass |

### Mobile Compatibility
| Device | OS | Status |
|--------|-----|--------|
| Pixel 5 | Android 13 | ✅ Pass |
| iPhone 12 | iOS 17 | ✅ Pass |
| Samsung Galaxy S21 | Android 12 | ✅ Pass |

---

## 🎓 Learning Outcomes

### Technical Skills Acquired
1. **Playwright Automation:**
   - Page Object Model design pattern
   - Handling WebSocket connections in tests
   - Visual regression testing with screenshots
   
2. **API Testing:**
   - Postman collection organization
   - Environment variables & test scripts
   - Newman CLI automation
   
3. **Performance Testing:**
   - K6 scripting (JavaScript)
   - Load, spike, and stress test scenarios
   - Metrics analysis (p95, p99, throughput)
   
4. **Real-world Testing:**
   - OAuth flow testing strategies
   - Payment gateway integration testing (Paystack)
   - WebSocket real-time feature verification
   - Network throttling & compression testing

### Domain Knowledge
- Social streaming platform architecture
- 3D rendering performance considerations
- Payment security best practices
- Real-time systems challenges (WebSocket)

### Process Improvements
- Implemented CI/CD for regression testing
- Created reusable test fixtures
- Documented bug reproduction steps
- Established test data management strategy

---

## 🎥 Demo Video

[Watch Testing Demo (5 minutes)](assets/demo-video.mp4)

Highlights:
- Automated test execution (Playwright)
- API testing with Postman
- Performance testing with K6
- Bug reproduction & verification

---

## 🛠️ Tools & Technologies

### Testing Tools
- **Automation:** Playwright (JavaScript)
- **API Testing:** Postman, Newman
- **Performance:** K6
- **Accessibility:** Axe DevTools
- **Version Control:** Git, GitHub

### Development Tools
- **Browser DevTools** (Network, Console, Performance)
- **BrowserStack** (Cross-browser testing)
- **VSCode** (Test script development)

### Documentation
- **Test Cases:** Excel, Google Sheets
- **Bug Tracking:** GitHub Issues (simulated Jira)
- **Documentation:** Markdown

---

## 📧 Contact

**Chibuzor**  
Email: your.email@example.com  
LinkedIn: [linkedin.com/in/yourprofile](https://linkedin.com)  
GitHub: [github.com/yourname](https://github.com/yourname)

---

## 📝 License

This portfolio is for educational and job application purposes only.  
LetsWatchOut project © 2026 Chibuzor
```

### 5.3 Bug Report Template

**File:** `BUG_REPORTS.md`
```markdown
# Bug Reports - LetsWatchOut QA Portfolio

## Summary Statistics
- **Total Bugs Found:** 8
- **Critical:** 1 (Fixed)
- **High:** 3 (Fixed)
- **Medium:** 3 (2 Fixed, 1 Deferred)
- **Low:** 1 (Deferred)

---

## BUG-001: Session Preview Not Auto-Updating

### Details
- **ID:** BUG-001
- **Title:** Session preview cards stuck on emoji icon after media upload
- **Severity:** Medium
- **Priority:** High
- **Status:** ✅ Fixed
- **Environment:** Chrome 122, Windows 11, Frontend v1.0.2
- **Found Date:** April 13, 2026
- **Fixed Date:** April 13, 2026

### Description
When a host uploads media to a session, the session preview card in the lobby remains stuck on the emoji icon. The poster image does not appear until the user manually refreshes the page.

### Impact
- **User Experience:** Poor UX, users don't see content previews
- **Business Impact:** Low engagement, users less likely to join sessions
- **Affected Users:** All lobby viewers (not just the uploader)

### Steps to Reproduce
1. User A creates instant watch session
2. User B views lobby (sees emoji icon on preview card)
3. User A uploads video file (10MB MP4)
4. Wait for upload completion (progress bar 100%)
5. User B observes lobby preview card (no refresh)
6. **ACTUAL:** Emoji icon persists
7. **EXPECTED:** Poster image appears automatically

### Screenshots
![Before Upload](assets/bugs/bug-001-before.png)
![After Upload (Bug)](assets/bugs/bug-001-bug.png)
![After Fix](assets/bugs/bug-001-fixed.png)

### Root Cause Analysis
**Backend Issue:**
- Poster generation in `chunk_upload.go` happens in a goroutine
- After poster is generated, no WebSocket broadcast sent to lobby
- Only session creator sees update (via page state)

**Code Location:**
- File: `backend/internal/handlers/chunk_upload.go`
- Lines: 203-232

### Fix Applied
Added lobby broadcast after poster generation:

```go
// After poster generated → Broadcast to lobby
hub := GetWebSocketManager()
if hub != nil {
    notification := map[string]interface{}{
        "type":       "session_preview_updated",
        "session_id": sessionID,
        "poster_url": posterPath,
        "preview_url": "",
    }
    data, _ := json.Marshal(notification)
    hub.BroadcastToLobby(OutgoingMessage{Data: data, IsBinary: false})
}
```

### Verification Steps
1. User A creates session
2. User B views lobby
3. User A uploads video
4. User B observes lobby (no manual refresh)
5. ✅ VERIFIED: Poster appears within 2 seconds
6. ✅ VERIFIED: MP4 preview appears after generation (30s)

### Related Issues
- BUG-002: Session end shows spinner (same root cause)

### Lessons Learned
- Always broadcast state changes to all connected clients
- Test with multiple browser tabs (multi-user scenarios)
- Real-time features require explicit WebSocket messages

---

## BUG-002: Session End Shows "Generating Preview" Spinner

### Details
- **ID:** BUG-002
- **Severity:** Low
- **Priority:** Medium
- **Status:** ✅ Fixed
- **Related:** BUG-001

### Description
When a session ends, the preview card shows a spinner with "generating preview" instead of smoothly disappearing from the lobby.

### Root Cause
Empty `preview_url` interpreted as "generating" state instead of "clearing" state in `SessionPreview.jsx`.

### Fix Applied
Added `isClearing` prop to differentiate clearing vs generating:
```jsx
if (isClearing) {
  setLoadState('emoji'); // No spinner
  return;
}
```

### Verification
✅ Session end → Card disappears smoothly (no spinner)

---

## BUG-005: Content Rating Defaulting to 'G'

### Details
- **ID:** BUG-005
- **Severity:** High
- **Priority:** Critical
- **Status:** ✅ Fixed

### Description
Regardless of user selection (e.g., "18+"), all sessions are saved with content rating "G" in the database.

### Steps to Reproduce
1. Create instant watch
2. Select "18+" content rating
3. Create session
4. Check database: `SELECT content_rating FROM watch_sessions WHERE session_id = '...'`
5. **ACTUAL:** Returns 'G'
6. **EXPECTED:** Returns '18+'

### Root Cause
Backend `CreateWatchSession` handler missing `ContentRating` field in input struct.

### Fix Applied
```go
type CreateWatchSessionInput struct {
    WatchType     string `json:"watch_type"`
    IsPrivate     bool   `json:"is_private"`
    ContentRating string `json:"content_rating"` // ✅ ADDED
    // ...
}
```

### Verification
✅ Created session with each rating (G, PG, 13+, 18+, Mature)  
✅ Database values correct for all ratings  
✅ Neon badges display with correct colors

---

## BUG-003: Upload Resume Modal Appears on First Upload

### Details
- **ID:** BUG-003
- **Severity:** Low
- **Priority:** Low
- **Status:** 🔄 Deferred (Low impact)

### Description
Resume upload modal appears even on first upload attempt when no previous upload exists.

### Root Cause
localStorage check doesn't verify if stored upload belongs to current session.

### Fix Recommendation
Add session_id validation in localStorage check.

### Deferred Reason
Low severity, workaround exists (users can dismiss modal).

---

[Additional bugs documented similarly...]
```

---

## Learning Outcomes

### Technical Skills You'll Master

#### 1. Test Automation
- **Playwright:** Write robust E2E tests, page object model, async/await patterns
- **CI/CD:** GitHub Actions workflow configuration
- **Debugging:** Screenshot/video analysis, trace viewer

#### 2. API Testing
- **Postman:** Collection organization, environment variables, test scripts
- **Newman:** CLI automation, HTML reporting
- **REST APIs:** HTTP methods, status codes, JSON validation

#### 3. Performance Testing
- **K6:** JavaScript-based load testing
- **Metrics:** p95, p99, throughput, error rates
- **Analysis:** Identifying bottlenecks, capacity planning

#### 4. Real-World Scenarios
- **OAuth:** Third-party authentication testing
- **Payments:** Gateway integration, webhook handling
- **WebSocket:** Real-time feature verification
- **File Uploads:** Chunked, compression, network awareness

#### 5. Process & Documentation
- **Test Planning:** Scope, strategy, risk analysis
- **Bug Reporting:** Severity/priority, reproduction steps, root cause
- **Metrics:** Test coverage, pass rates, defect density

### Career Readiness

#### Portfolio Impact
- **Differentiator:** 95% of QA applicants don't have portfolios
- **Proof of Skills:** Code samples, test reports, bug fixes
- **Conversation Starter:** Interviewers will ask about your work

#### Interview Preparation
- **Technical Questions:** You'll have real examples
- **Behavioral Questions:** STAR method with concrete achievements
- **Coding Challenges:** Playwright/JavaScript practice

#### Industry Knowledge
- **Modern Stack:** React, Go, WebSocket (not just Java/Selenium)
- **Cloud/DevOps:** CI/CD, containerization concepts
- **Payment Systems:** PCI compliance, gateway integration

---

## Tools & Technologies

### Testing Tools
- **Playwright** - Browser automation (JavaScript)
- **Postman** - API testing & documentation
- **Newman** - Postman CLI runner
- **K6** - Performance & load testing
- **Axe DevTools** - Accessibility testing

### Development Tools
- **Git/GitHub** - Version control
- **VSCode** - Test script development
- **Chrome DevTools** - Debugging, network analysis
- **PostgreSQL** - Database queries & validation

### Optional Tools
- **BrowserStack** - Cross-browser testing (cloud)
- **Jira** - Bug tracking (simulated with GitHub Issues)
- **Confluence** - Documentation (simulated with Markdown)

---

## Success Metrics

### Portfolio Completeness
- [ ] 100+ test cases documented
- [ ] 25+ automated tests (Playwright)
- [ ] 30+ API tests (Postman)
- [ ] 3 performance test scenarios (K6)
- [ ] 5+ bug reports with fixes
- [ ] Professional README with screenshots
- [ ] Demo video (5 minutes)

### Learning Milestones
- [ ] Understand OAuth 2.0 flow
- [ ] Implement payment gateway testing
- [ ] Write page object model
- [ ] Configure CI/CD pipeline
- [ ] Analyze performance metrics
- [ ] Document test strategy

### Job Application Ready
- [ ] GitHub repo published
- [ ] Resume updated with portfolio link
- [ ] LinkedIn post about portfolio
- [ ] Practice demo presentation (5 min)
- [ ] Prepare interview answers using portfolio examples

---

## Timeline Summary

| Week | Phase | Deliverables | Hours/Week |
|------|-------|-------------|------------|
| 1-2 | **Phase 0: Prerequisite Features** | Google OAuth, Payments implemented | 20-25 |
| 3 | **Phase 1: Test Planning** | Test plan, test strategy | 15-20 |
| 3-4 | **Phase 2: Test Cases** | 105+ test cases in Excel | 15-20 |
| 4-5 | **Phase 3: Automation** | Playwright suite (25 tests) | 20-25 |
| 5-6 | **Phase 4: API & Performance** | Postman collection, K6 tests | 15-20 |
| 6 | **Phase 5: Documentation** | GitHub repo, README, demo video | 10-15 |

**Total Time Investment:** 95-125 hours (6 weeks)

---

## Next Steps

### Immediate Actions (This Week)
1. [ ] Review this master plan
2. [ ] Set up Google Cloud Console account
3. [ ] Register with Paystack (submit business docs)
4. [ ] Install Playwright: `npm install -D @playwright/test`
5. [ ] Install Postman desktop app
6. [ ] Create GitHub repo: `letswatchout-qa-portfolio`

### Week 1 Goals
1. [ ] Complete Google OAuth implementation
2. [ ] Complete Paystack payment integration
3. [ ] Test both features manually
4. [ ] Document setup process

### Week 2 Goals
1. [ ] Write test plan document
2. [ ] Create test case template
3. [ ] Document 20 test cases (authentication + session)
4. [ ] Set up Playwright project

---

## Questions & Notes

### FAQ

**Q: Do I need to finish OAuth and Payments before starting QA work?**  
A: Yes, these are critical features that affect test scope significantly. Complete them first for comprehensive testing.

**Q: Can I use this portfolio for interviews while still working on it?**  
A: Absolutely! Even partial completion (50+ test cases, 10 automation tests) is impressive. Update as you go.

**Q: What if I find real bugs during testing?**  
A: Perfect! Document them thoroughly, fix if possible, and include in portfolio. Real bugs are more valuable than simulated ones.

**Q: How do I explain the business documents requirement?**  
A: In interviews, explain: "I integrated real payment gateway (Paystack) which required business registration and KYC verification - demonstrating production-ready testing skills."

---

## Contact & Support

If you need clarification on any section:
1. Review the specific phase documentation
2. Check the code examples provided
3. Research the tool's official documentation
4. Ask for help with specific blockers

**Remember:** This is a learning journey. Document your process, challenges, and solutions - that's what makes a compelling portfolio story!

---

**Last Updated:** April 13, 2026  
**Version:** 1.0  
**Author:** Chibuzor
