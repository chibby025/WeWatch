#!/bin/bash
# Payment System API Test Script
# Date: April 25, 2026
# Purpose: Validate all payment endpoints and revenue calculations

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URL
API_URL="http://localhost:8080"

# Test counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to print test result
test_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

echo "========================================="
echo "Payment System API Tests"
echo "Date: $(date)"
echo "========================================="
echo ""

# Test 1: Health Check
echo "Test 1: Backend Health Check"
RESPONSE=$(curl -s -w "\n%{http_code}" ${API_URL}/api/health)
STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n1)

if [ "$STATUS" = "200" ] && echo "$BODY" | grep -q "ok"; then
    test_result 0 "Backend health check"
else
    test_result 1 "Backend health check (Status: $STATUS)"
fi
echo ""

# Test 2: Check if test users exist
echo "Test 2: Verify Test Users Exist"
echo "Querying database for test users..."

# Check if we have psql access
if command -v psql &> /dev/null; then
    USER_COUNT=$(psql -h localhost -p 5432 -U postgres -d wewatch_db -t -c "SELECT COUNT(*) FROM users WHERE email LIKE 'test_%';" 2>/dev/null || echo "0")
    USER_COUNT=$(echo $USER_COUNT | xargs)  # Trim whitespace
    
    if [ "$USER_COUNT" -gt "0" ]; then
        test_result 0 "Found $USER_COUNT test users in database"
        
        # List test users
        echo "Test users:"
        psql -h localhost -p 5432 -U postgres -d wewatch_db -c "SELECT id, username, email, role FROM users WHERE email LIKE 'test_%' OR role IN ('admin', 'super_admin');" 2>/dev/null || echo "Could not list users"
    else
        test_result 1 "No test users found - need to create seed data"
    fi
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: psql not available, cannot verify database directly"
fi
echo ""

# Test 3: Payment Handlers Registration Check
echo "Test 3: Verify Payment Routes Registered"
echo "Checking main.go for route registration..."

if grep -q "POST.*tokens/purchase" /home/chibuzor_dev/WeWatch/backend/cmd/server/main.go; then
    test_result 0 "Token purchase route registered"
else
    test_result 1 "Token purchase route not found"
fi

if grep -q "POST.*tickets/purchase" /home/chibuzor_dev/WeWatch/backend/cmd/server/main.go; then
    test_result 0 "Ticket purchase route registered"
else
    test_result 1 "Ticket purchase route not found"
fi

if grep -q "POST.*donate" /home/chibuzor_dev/WeWatch/backend/cmd/server/main.go; then
    test_result 0 "Donation route registered"
else
    test_result 1 "Donation route not found"
fi

if grep -q "POST.*donations/gift" /home/chibuzor_dev/WeWatch/backend/cmd/server/main.go; then
    test_result 0 "Wallet gift route registered"
else
    test_result 1 "Wallet gift route not found"
fi

if grep -q "POST.*payouts/request" /home/chibuzor_dev/WeWatch/backend/cmd/server/main.go; then
    test_result 0 "Payout request route registered"
else
    test_result 1 "Payout request route not found"
fi
echo ""

# Test 4: Revenue Split Verification (Code Audit)
echo "Test 4: Revenue Split Logic Verification"

# Check token purchase split (75-25)
if grep -q "platformCommission := grossAmount \* 0.25" /home/chibuzor_dev/WeWatch/backend/internal/handlers/wallet_handlers.go; then
    test_result 0 "Token purchase: 25% platform commission (wallet_handlers.go:166)"
else
    test_result 1 "Token purchase commission not found or incorrect"
fi

if grep -q "netAmount := grossAmount \* 0.75" /home/chibuzor_dev/WeWatch/backend/internal/handlers/wallet_handlers.go; then
    test_result 0 "Token purchase: 75% reserve (wallet_handlers.go:167)"
else
    test_result 1 "Token purchase reserve not found or incorrect"
fi

# Check ticket spending (100% to host)
if grep -q "hostEarning := ticketPriceTokens.*100% to host" /home/chibuzor_dev/WeWatch/backend/internal/handlers/ticket_handlers.go; then
    test_result 0 "Ticket spending: Host gets 100% (ticket_handlers.go:193)"
else
    test_result 1 "Ticket spending logic not found or incorrect"
fi

# Check donation split (95-5)
if grep -q "hostEarning := int(float64(req.AmountTokens) \* 0.95)" /home/chibuzor_dev/WeWatch/backend/internal/handlers/donation_handlers.go; then
    test_result 0 "In-session donation: Host 95% (donation_handlers.go:132)"
else
    test_result 1 "Donation split not found or incorrect"
fi

# Check wallet gift split (95-5)
if grep -q "recipientAmount := int(float64(req.AmountTokens) \* 0.95" /home/chibuzor_dev/WeWatch/backend/internal/handlers/donation_handlers.go; then
    test_result 0 "Wallet gift: Recipient 95% (donation_handlers.go:472)"
else
    test_result 1 "Wallet gift split not found or incorrect"
fi

# Check gateway commission (15%)
if grep -q "commission := grossAmount \* 0.15" /home/chibuzor_dev/WeWatch/backend/internal/handlers/ticket_handlers.go; then
    test_result 0 "Gateway ticket: 15% commission (ticket_handlers.go:288)"
else
    test_result 1 "Gateway ticket commission not found or incorrect"
fi

if grep -q "commission := grossAmount \* 0.15" /home/chibuzor_dev/WeWatch/backend/internal/handlers/donation_handlers.go; then
    test_result 0 "Gateway donation: 15% commission (donation_handlers.go:182)"
else
    test_result 1 "Gateway donation commission not found or incorrect"
fi
echo ""

# Test 5: Auto-Approval Logic Verification
echo "Test 5: Auto-Approval Logic Verification"

if grep -q 'if userRole == "admin" || userRole == "super_admin"' /home/chibuzor_dev/WeWatch/backend/internal/handlers/payout_handlers.go; then
    test_result 0 "Admin bypass logic exists (payout_handlers.go:507)"
else
    test_result 1 "Admin bypass logic not found"
fi

if grep -q 'amountNGN < 10000' /home/chibuzor_dev/WeWatch/backend/internal/handlers/payout_handlers.go; then
    test_result 0 "Auto-approval threshold: ₦10,000 (payout_handlers.go:515)"
else
    test_result 1 "Auto-approval threshold not found"
fi
echo ""

# Test 6: Database Schema Validation
echo "Test 6: Database Schema Validation"

if command -v psql &> /dev/null; then
    # Check if critical tables exist
    TABLES=("users" "user_wallets" "token_transactions" "session_tickets" "donations" "payouts" "gateway_earnings" "platform_accounting")
    
    for TABLE in "${TABLES[@]}"; do
        EXISTS=$(psql -h localhost -p 5432 -U postgres -d wewatch_db -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$TABLE');" 2>/dev/null || echo "f")
        EXISTS=$(echo $EXISTS | xargs)
        
        if [ "$EXISTS" = "t" ]; then
            test_result 0 "Table '$TABLE' exists"
        else
            test_result 1 "Table '$TABLE' missing"
        fi
    done
else
    echo -e "${YELLOW}⚠️  SKIP${NC}: psql not available"
fi
echo ""

# Test 7: Performance Baseline (API Response Times)
echo "Test 7: API Response Time Baseline"

# Health endpoint (should be < 100ms)
TIME=$(curl -w "%{time_total}" -o /dev/null -s ${API_URL}/api/health)
TIME_MS=$(echo "$TIME * 1000" | bc)
echo "Health endpoint: ${TIME_MS}ms"

if (( $(echo "$TIME < 0.1" | bc -l) )); then
    test_result 0 "Health endpoint < 100ms (${TIME_MS}ms)"
else
    test_result 1 "Health endpoint slow (${TIME_MS}ms, expected < 100ms)"
fi
echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Total Tests: $TOTAL_TESTS"
echo -e "${GREEN}Passed: $PASSED_TESTS${NC}"
echo -e "${RED}Failed: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✅ ALL TESTS PASSED!${NC}"
    exit 0
else
    PASS_RATE=$(echo "scale=2; ($PASSED_TESTS / $TOTAL_TESTS) * 100" | bc)
    echo -e "\n${YELLOW}⚠️  Pass Rate: ${PASS_RATE}%${NC}"
    exit 1
fi
