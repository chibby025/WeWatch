#!/bin/bash

# Test runner script for ads system
# Run backend and frontend tests, then e2e tests

set -e  # Exit on error

echo "🧪 WeWatch Ads System Test Suite"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
        exit 1
    fi
}

# 1. Backend Tests
echo -e "${YELLOW}📦 Running Backend Tests...${NC}"
echo "-----------------------------------"
cd backend

echo "Testing ad campaign handlers..."
go test -v ./internal/handlers/ad_campaign_test.go -run TestCreateAdCampaign
print_status $? "Create Ad Campaign Test"

go test -v ./internal/handlers/ad_campaign_test.go -run TestCheckAdEligibility
print_status $? "Frequency Capping Test"

go test -v ./internal/handlers/ad_campaign_test.go -run TestGetInSessionAd
print_status $? "Ad Serving Test"

go test -v ./internal/handlers/ad_campaign_test.go -run TestTrackAdImpression
print_status $? "Impression Tracking Test"

go test -v ./internal/handlers/ad_campaign_test.go -run TestAdCPMOrdering
print_status $? "CPM Ordering Test"

echo ""
echo -e "${GREEN}✅ All backend tests passed!${NC}"
echo ""

cd ..

# 2. Frontend Tests
echo -e "${YELLOW}⚛️  Running Frontend Tests...${NC}"
echo "-----------------------------------"
cd frontend

echo "Testing InSessionAdPanel component..."
npm test -- tests/components/ads/InSessionAdPanel.test.jsx
print_status $? "InSessionAdPanel Component Test"

echo "Testing FeedAdCard component..."
npm test -- tests/components/ads/FeedAdCard.test.jsx
print_status $? "FeedAdCard Component Test"

echo ""
echo -e "${GREEN}✅ All frontend tests passed!${NC}"
echo ""

cd ..

# 3. E2E Tests
echo -e "${YELLOW}🎭 Running E2E Tests...${NC}"
echo "-----------------------------------"

# Check if backend is running
if ! curl -s http://localhost:8080/health > /dev/null; then
    echo -e "${RED}❌ Backend server not running on localhost:8080${NC}"
    echo "Please start backend with: cd backend && go run cmd/server/main.go"
    exit 1
fi

# Check if frontend is running
if ! curl -s http://localhost:5173 > /dev/null; then
    echo -e "${RED}❌ Frontend server not running on localhost:5173${NC}"
    echo "Please start frontend with: cd frontend && npm run dev"
    exit 1
fi

echo "Running Playwright E2E tests..."
cd tests
npx playwright test e2e/ads-system.spec.js
print_status $? "E2E Tests"

cd ..

echo ""
echo "================================="
echo -e "${GREEN}🎉 All tests passed successfully!${NC}"
echo "================================="
echo ""
echo "Test Summary:"
echo "  ✅ Backend: Ad campaigns, frequency capping, serving, tracking"
echo "  ✅ Frontend: InSessionAdPanel, FeedAdCard components"
echo "  ✅ E2E: Full user flows with real API calls"
echo ""
