#!/bin/bash
# Quick SMTP test script for Brevo authentication

echo "Testing Brevo SMTP authentication..."
echo ""

# Read credentials from .env
source backend/.env

# Test SMTP connection using curl
echo "Attempting to connect to $SMTP_HOST:$SMTP_PORT"
echo "Username: $SMTP_USER"
echo "Password: ${SMTP_PASSWORD:0:20}... (truncated)"
echo ""

# Try to send a test email via curl
curl --url "smtp://$SMTP_HOST:$SMTP_PORT" \
  --ssl-reqd \
  --mail-from "support@letswatchout.com" \
  --mail-rcpt "test@example.com" \
  --user "$SMTP_USER:$SMTP_PASSWORD" \
  --upload-file - << EOF
From: WeWatch <support@letswatchout.com>
To: test@example.com
Subject: SMTP Test

This is a test email.
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SMTP authentication successful!"
else
    echo ""
    echo "❌ SMTP authentication failed!"
    echo ""
    echo "Possible solutions:"
    echo "1. Go to https://account.brevo.com/advanced/api"
    echo "2. Generate a new SMTP key"
    echo "3. Update SMTP_PASSWORD in backend/.env"
    echo "4. Restart the backend server"
fi
