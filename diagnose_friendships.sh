#!/bin/bash

# Friendships Database Diagnostic Script
# Compares local and Railway (production) databases to find missing friendships

echo "================================================"
echo "🔍 WeWatch Friendships Database Diagnostic"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ===========================
# 1. CHECK LOCAL DATABASE
# ===========================
echo -e "${BLUE}📊 STEP 1: Checking LOCAL database...${NC}"
echo "-------------------------------------------"

echo -e "\n${YELLOW}Local Users:${NC}"
psql -U postgres -d wewatch_db -c "SELECT id, username, email, created_at FROM users ORDER BY id;" 2>/dev/null || echo "⚠️  Local database not accessible"

echo -e "\n${YELLOW}Local Friendships (Accepted):${NC}"
psql -U postgres -d wewatch_db -c "
SELECT 
    f.id,
    f.requester_id,
    u1.username AS requester_username,
    f.recipient_id,
    u2.username AS recipient_username,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
WHERE f.status = 'accepted'
ORDER BY f.created_at DESC;
" 2>/dev/null || echo "⚠️  Could not query local friendships"

# ===========================
# 2. CHECK RAILWAY DATABASE
# ===========================
echo -e "\n${BLUE}📊 STEP 2: Checking RAILWAY (Production) database...${NC}"
echo "-------------------------------------------"

echo -e "\n${YELLOW}Railway Users:${NC}"
railway run psql -c "SELECT id, username, email, created_at FROM users ORDER BY id;"

echo -e "\n${YELLOW}Railway Friendships (Accepted):${NC}"
railway run psql -c "
SELECT 
    f.id,
    f.requester_id,
    u1.username AS requester_username,
    f.recipient_id,
    u2.username AS recipient_username,
    f.status,
    f.created_at
FROM friendships f
JOIN users u1 ON f.requester_id = u1.id
JOIN users u2 ON f.recipient_id = u2.id
WHERE f.status = 'accepted'
ORDER BY f.created_at DESC;
"

# ===========================
# 3. SPECIFIC USER CHECK
# ===========================
echo -e "\n${BLUE}📊 STEP 3: Checking specific user (test025)...${NC}"
echo "-------------------------------------------"

echo -e "\n${YELLOW}Local test025 user:${NC}"
psql -U postgres -d wewatch_db -c "SELECT id, username, email, created_at FROM users WHERE username = 'test025';" 2>/dev/null

echo -e "\n${YELLOW}Railway test025 user:${NC}"
railway run psql -c "SELECT id, username, email, created_at FROM users WHERE username = 'test025';"

# ===========================
# 4. FIND YOUR USER ID
# ===========================
echo -e "\n${BLUE}📊 STEP 4: Finding YOUR user ID in both databases...${NC}"
echo "-------------------------------------------"

echo -e "\n${YELLOW}Enter your username (or press Enter to skip):${NC}"
read -r YOUR_USERNAME

if [ -n "$YOUR_USERNAME" ]; then
    echo -e "\n${YELLOW}Your user in LOCAL database:${NC}"
    psql -U postgres -d wewatch_db -c "SELECT id, username, email FROM users WHERE username = '$YOUR_USERNAME';" 2>/dev/null
    
    echo -e "\n${YELLOW}Your user in RAILWAY database:${NC}"
    railway run psql -c "SELECT id, username, email FROM users WHERE username = '$YOUR_USERNAME';"
    
    echo -e "\n${YELLOW}Your friendships in LOCAL database:${NC}"
    LOCAL_USER_ID=$(psql -U postgres -d wewatch_db -t -c "SELECT id FROM users WHERE username = '$YOUR_USERNAME';" 2>/dev/null | xargs)
    if [ -n "$LOCAL_USER_ID" ]; then
        psql -U postgres -d wewatch_db -c "
        SELECT 
            CASE 
                WHEN f.requester_id = $LOCAL_USER_ID THEN u2.username
                ELSE u1.username
            END AS friend_username,
            f.status,
            f.created_at
        FROM friendships f
        JOIN users u1 ON f.requester_id = u1.id
        JOIN users u2 ON f.recipient_id = u2.id
        WHERE (f.requester_id = $LOCAL_USER_ID OR f.recipient_id = $LOCAL_USER_ID)
        AND f.status = 'accepted'
        ORDER BY f.created_at DESC;
        " 2>/dev/null
    fi
    
    echo -e "\n${YELLOW}Your friendships in RAILWAY database:${NC}"
    RAILWAY_USER_ID=$(railway run psql -t -c "SELECT id FROM users WHERE username = '$YOUR_USERNAME';" | xargs)
    if [ -n "$RAILWAY_USER_ID" ]; then
        railway run psql -c "
        SELECT 
            CASE 
                WHEN f.requester_id = $RAILWAY_USER_ID THEN u2.username
                ELSE u1.username
            END AS friend_username,
            f.status,
            f.created_at
        FROM friendships f
        JOIN users u1 ON f.requester_id = u1.id
        JOIN users u2 ON f.recipient_id = u2.id
        WHERE (f.requester_id = $RAILWAY_USER_ID OR f.recipient_id = $RAILWAY_USER_ID)
        AND f.status = 'accepted'
        ORDER BY f.created_at DESC;
        "
    fi
fi

# ===========================
# 5. GENERATE MIGRATION SQL
# ===========================
echo -e "\n${BLUE}📊 STEP 5: Generating migration SQL (if needed)...${NC}"
echo "-------------------------------------------"

echo -e "\n${GREEN}If test025 is missing in Railway, use these commands:${NC}"
echo ""
echo "# Option 1: Export from local and import to Railway"
echo "# Step 1: Export test025 user from local"
echo "psql -U postgres -d wewatch_db -c \"COPY (SELECT id, username, email, password_hash, avatar_url, bio, role, oauth_provider, oauth_provider_id, email_verified, date_of_birth, country, preferred_gateway, two_factor_secret, two_factor_enabled, backup_codes, last_login_ip, created_at, updated_at FROM users WHERE username = 'test025') TO STDOUT WITH CSV HEADER;\" > test025_user.csv"
echo ""
echo "# Step 2: Import to Railway"
echo "railway run psql -c \"\\copy users (id, username, email, password_hash, avatar_url, bio, role, oauth_provider, oauth_provider_id, email_verified, date_of_birth, country, preferred_gateway, two_factor_secret, two_factor_enabled, backup_codes, last_login_ip, created_at, updated_at) FROM 'test025_user.csv' WITH CSV HEADER;\""
echo ""
echo "# Option 2: Manual INSERT (if you know the user details)"
echo "railway run psql -c \"INSERT INTO users (username, email, password_hash, avatar_url, role, created_at, updated_at) VALUES ('test025', 'test025@example.com', 'hash_here', '/avatars/default.png', 'user', NOW(), NOW()) ON CONFLICT (username) DO NOTHING;\""
echo ""
echo "# Step 3: Recreate friendship in Railway"
echo "railway run psql -c \"INSERT INTO friendships (requester_id, recipient_id, status, created_at, updated_at) SELECT (SELECT id FROM users WHERE username = 'YOUR_USERNAME'), (SELECT id FROM users WHERE username = 'test025'), 'accepted', NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM friendships WHERE (requester_id = (SELECT id FROM users WHERE username = 'YOUR_USERNAME') AND recipient_id = (SELECT id FROM users WHERE username = 'test025')) OR (requester_id = (SELECT id FROM users WHERE username = 'test025') AND recipient_id = (SELECT id FROM users WHERE username = 'YOUR_USERNAME')));\""

echo -e "\n${BLUE}================================================${NC}"
echo -e "${GREEN}✅ Diagnostic complete!${NC}"
echo -e "${BLUE}================================================${NC}"
