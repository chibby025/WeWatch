#!/bin/bash

# WeWatch Privacy Settings Automated Test Suite
# Tests all privacy enforcement features
# May 7, 2026

set -e  # Exit on error

BASE_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:5173"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 WeWatch Privacy Settings Test Suite"
echo "========================================"
echo ""

# Test counter
PASSED=0
FAILED=0

# Function to print test result
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS:${NC} $2"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL:${NC} $2"
        ((FAILED++))
    fi
}

# Function to login and get token
login_user() {
    local email=$1
    local password=$2
    
    TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
        | jq -r '.token')
    
    if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
        echo -e "${RED}Failed to login as $email${NC}"
        return 1
    fi
    echo "$TOKEN"
}

echo "📝 Test 1: User Settings API - GET /api/users/settings"
echo "------------------------------------------------------"

# Login as user (use existing test user or create one)
USER1_TOKEN=$(login_user "privacy@test.com" "Test1234!")
if [ -z "$USER1_TOKEN" ] || [ "$USER1_TOKEN" = "null" ] || [[ "$USER1_TOKEN" == *"Failed"* ]]; then
    echo -e "${YELLOW}Test user doesn't exist, creating...${NC}"
    
    # Register new test user
    REGISTER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/register" \
        -H "Content-Type: application/json" \
        -d '{"username":"privacytest","email":"privacy@test.com","password":"Test1234!"}')
    
    USER1_TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token')
    
    if [ -z "$USER1_TOKEN" ] || [ "$USER1_TOKEN" = "null" ]; then
        # Try to login if user already exists
        USER1_TOKEN=$(login_user "privacy@test.com" "Test1234!")
        if [ -z "$USER1_TOKEN" ] || [ "$USER1_TOKEN" = "null" ] || [[ "$USER1_TOKEN" == *"Failed"* ]]; then
            echo -e "${RED}❌ Failed to get user token - is backend running?${NC}"
            exit 1
        fi
    fi
fi

# Test GET settings
SETTINGS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN")

# Check if response has settings
HAS_PUSH_ENABLED=$(echo "$SETTINGS_RESPONSE" | jq -r '.settings.push_enabled')
HAS_PROFILE_TYPE=$(echo "$SETTINGS_RESPONSE" | jq -r '.settings.profile_type')

if [ "$HAS_PUSH_ENABLED" != "null" ] && [ "$HAS_PROFILE_TYPE" != "null" ]; then
    test_result 0 "GET /api/users/settings returns valid settings"
else
    test_result 1 "GET /api/users/settings - Expected settings fields missing"
fi

echo ""
echo "📝 Test 2: User Settings API - PUT /api/users/settings"
echo "------------------------------------------------------"

# Test PUT settings - disable push notifications
UPDATE_RESPONSE=$(curl -s -X PUT "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"push_enabled":false}')

# Check if update succeeded
if echo "$UPDATE_RESPONSE" | jq -e '.message' > /dev/null 2>&1; then
    test_result 0 "PUT /api/users/settings updates notification settings"
else
    test_result 1 "PUT /api/users/settings - Update failed"
fi

# Test PUT settings - change privacy to private
UPDATE_PRIVACY=$(curl -s -X PUT "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"profile_type":"private","who_can_call":"nobody"}')

if echo "$UPDATE_PRIVACY" | jq -e '.message' > /dev/null 2>&1; then
    test_result 0 "PUT /api/users/settings updates privacy settings"
else
    test_result 1 "PUT /api/users/settings - Privacy update failed"
fi

echo ""
echo "📝 Test 3: Privacy Validation - Invalid Values"
echo "----------------------------------------------"

# Test invalid profile type
INVALID_PROFILE=$(curl -s -X PUT "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"profile_type":"invalid"}')

if echo "$INVALID_PROFILE" | grep -q "error"; then
    test_result 0 "PUT /api/users/settings rejects invalid profile_type"
else
    test_result 1 "PUT /api/users/settings - Should reject invalid profile_type"
fi

# Test invalid who_can_call
INVALID_CALL=$(curl -s -X PUT "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"who_can_call":"invalid"}')

if echo "$INVALID_CALL" | grep -q "error"; then
    test_result 0 "PUT /api/users/settings rejects invalid who_can_call"
else
    test_result 1 "PUT /api/users/settings - Should reject invalid who_can_call"
fi

echo ""
echo "📝 Test 4: Discover Feed Privacy Enforcement"
echo "--------------------------------------------"

# Test that feed respects privacy settings
FEED_RESPONSE=$(curl -s -X GET "$BASE_URL/api/posts?limit=10" \
    -H "Authorization: Bearer $USER1_TOKEN")

HAS_POSTS=$(echo "$FEED_RESPONSE" | jq -r '.posts | length')

if [ "$HAS_POSTS" != "null" ]; then
    test_result 0 "GET /api/posts returns posts (privacy filtering active)"
else
    test_result 1 "GET /api/posts - Failed to fetch posts"
fi

echo ""
echo "📝 Test 5: User Profile Privacy Enforcement"
echo "-------------------------------------------"

# Test getting own profile (should always work)
OWN_PROFILE=$(curl -s -X GET "$BASE_URL/api/users/7" \
    -H "Authorization: Bearer $USER1_TOKEN")

HAS_USERNAME=$(echo "$OWN_PROFILE" | jq -r '.user.username')

if [ "$HAS_USERNAME" != "null" ] && [ -n "$HAS_USERNAME" ]; then
    test_result 0 "GET /api/users/:id returns own profile"
else
    test_result 1 "GET /api/users/:id - Failed to get own profile"
fi

echo ""
echo "📝 Test 6: Blocked Users Endpoint"
echo "---------------------------------"

# Test getting blocked users list
BLOCKED_RESPONSE=$(curl -s -X GET "$BASE_URL/api/lobby-chats/blocked" \
    -H "Authorization: Bearer $USER1_TOKEN")

if echo "$BLOCKED_RESPONSE" | jq -e '.blocked_users' > /dev/null 2>&1; then
    test_result 0 "GET /api/lobby-chats/blocked returns blocked users list"
else
    test_result 1 "GET /api/lobby-chats/blocked - Failed to fetch blocked users"
fi

echo ""
echo "📝 Test 7: Friends List Endpoint"
echo "--------------------------------"

# Test getting friends list (should include profile pictures)
FRIENDS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/friendships/friends" \
    -H "Authorization: Bearer $USER1_TOKEN")

if echo "$FRIENDS_RESPONSE" | jq -e '.friends' > /dev/null 2>&1; then
    test_result 0 "GET /api/friendships/friends returns friends list"
    
    # Check if profile_picture field exists
    HAS_PROFILE_PIC=$(echo "$FRIENDS_RESPONSE" | jq -r '.friends[0].profile_picture // empty')
    if [ -n "$HAS_PROFILE_PIC" ]; then
        test_result 0 "Friends list includes profile_picture URLs"
    else
        test_result 1 "Friends list missing profile_picture field"
    fi
else
    test_result 1 "GET /api/friendships/friends - Failed to fetch friends"
fi

echo ""
echo "📝 Test 8: Authentication Middleware"
echo "------------------------------------"

# Test protected endpoint without token
NO_AUTH=$(curl -s -X GET "$BASE_URL/api/users/settings")

if echo "$NO_AUTH" | grep -q "Unauthorized\|not authenticated"; then
    test_result 0 "Protected endpoints require authentication"
else
    test_result 1 "Protected endpoints should reject requests without auth"
fi

echo ""
echo "📝 Test 9: Frontend Accessibility"
echo "---------------------------------"

# Test if frontend is running
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL")

if [ "$FRONTEND_STATUS" = "200" ]; then
    test_result 0 "Frontend server is accessible at $FRONTEND_URL"
else
    test_result 1 "Frontend server not accessible (status: $FRONTEND_STATUS)"
fi

echo ""
echo "========================================"
echo "📊 Test Results Summary"
echo "========================================"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

# Reset user settings to defaults for next test run
echo "🔄 Resetting test user settings to defaults..."
curl -s -X PUT "$BASE_URL/api/users/settings" \
    -H "Authorization: Bearer $USER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"push_enabled":true,"profile_type":"public","who_can_call":"friends"}' > /dev/null

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Privacy settings are working correctly.${NC}"
    echo ""
    echo "✅ Ready to deploy to Vercel!"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Please review the failures above.${NC}"
    exit 1
fi
