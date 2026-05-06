#!/bin/bash
# Test BunnyCDN connection

BUNNY_STORAGE_ZONE="letswatchout"
BUNNY_ACCESS_KEY="3eee58c0-9da4-4ef6-a7df729194c4-ea0e-4301"
BUNNY_STORAGE_REGION="ny"

echo "🔍 Testing BunnyCDN connection..."
echo "Storage Zone: $BUNNY_STORAGE_ZONE"
echo "Region: $BUNNY_STORAGE_REGION"
echo ""

# Test with a simple file list
echo "📋 Attempting to list files..."
curl -v \
    --request GET \
    --url "https://${BUNNY_STORAGE_REGION}.storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/" \
    --header "AccessKey: $BUNNY_ACCESS_KEY"

echo ""
echo ""
echo "If you see HTTP 401: Check your Access Key in BunnyCDN dashboard"
echo "If you see HTTP 404: Check your Storage Zone name"
echo "If you see HTTP 200: Connection works! ✅"
