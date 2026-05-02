#!/bin/bash
# Test script for 2FA setup

echo "🔐 WeWatch 2FA Setup Test"
echo "=========================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Login as super admin
echo -e "${YELLOW}Step 1: Logging in as super admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "chibi@gmail.com", "password": "Chibby123"}' \
  -c /tmp/wewatch-cookies.txt)

echo "$LOGIN_RESPONSE" | jq '.'

if echo "$LOGIN_RESPONSE" | jq -e '.user.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Login successful!${NC}"
    USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.user.id')
    echo "   User ID: $USER_ID"
else
    echo -e "${RED}❌ Login failed! Check your credentials.${NC}"
    exit 1
fi

echo ""

# Step 2: Setup 2FA (requires password re-verification)
echo -e "${YELLOW}Step 2: Setting up 2FA (generating QR code)...${NC}"
SETUP_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/setup-2fa \
  -H "Content-Type: application/json" \
  -b /tmp/wewatch-cookies.txt \
  -d '{"password": "Chibby123"}')

echo "$SETUP_RESPONSE" | jq '.'

if echo "$SETUP_RESPONSE" | jq -e '.qr_code_url' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 2FA setup initiated!${NC}"
    
    QR_URL=$(echo "$SETUP_RESPONSE" | jq -r '.qr_code_url')
    SECRET=$(echo "$SETUP_RESPONSE" | jq -r '.secret')
    
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}📱 NEXT STEPS:${NC}"
    echo ""
    echo "1. Open Google Authenticator on your phone"
    echo "2. Tap the '+' button"
    echo "3. Choose 'Scan QR code' or 'Enter setup key'"
    echo ""
    echo "Option A - QR Code URL:"
    echo "   Generate QR from: $QR_URL"
    echo "   (Visit: https://www.qr-code-generator.com/ and paste the URL)"
    echo ""
    echo "Option B - Manual Entry:"
    echo -e "   ${GREEN}Secret Key: $SECRET${NC}"
    echo "   Account: chibi@gmail.com"
    echo "   Issuer: WeWatch"
    echo ""
    echo -e "${RED}⚠️  SAVE THESE BACKUP CODES (show once only):${NC}"
    echo "$SETUP_RESPONSE" | jq -r '.backup_codes[]' | awk '{print "   " $0}'
    echo ""
    echo "4. After adding to Google Authenticator, enter the 6-digit code:"
    echo ""
    read -p "   Enter 6-digit code from Google Authenticator: " TOTP_CODE
    echo ""
    
    # Step 3: Verify 2FA code to enable it
    echo -e "${YELLOW}Step 3: Verifying 2FA code to enable 2FA...${NC}"
    VERIFY_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/verify-2fa-setup \
      -H "Content-Type: application/json" \
      -b /tmp/wewatch-cookies.txt \
      -d "{\"code\": \"$TOTP_CODE\"}")
    
    echo "$VERIFY_RESPONSE" | jq '.'
    
    if echo "$VERIFY_RESPONSE" | jq -e '.enabled' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 2FA ENABLED SUCCESSFULLY!${NC}"
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${YELLOW}🎉 Your super admin account is now protected with 2FA!${NC}"
        echo ""
        echo "What this means:"
        echo "  • Next time you login, you'll need your password + 6-digit code"
        echo "  • TOTP codes change every 30 seconds"
        echo "  • JWT token still valid for 24 hours after login"
        echo "  • You can use backup codes if you lose your phone"
        echo ""
        echo "Development Impact:"
        echo "  • Keep Google Authenticator app handy during login"
        echo "  • Or disable 2FA temporarily for testing (not recommended)"
        echo "  • Other users NOT affected (2FA is opt-in per user)"
        echo ""
        echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    else
        echo -e "${RED}❌ 2FA verification failed! Code may be expired or incorrect.${NC}"
        echo "   Try again - codes expire every 30 seconds."
    fi
else
    echo -e "${RED}❌ 2FA setup failed!${NC}"
    echo "Error: $(echo "$SETUP_RESPONSE" | jq -r '.error')"
fi

echo ""
echo "Test complete!"
