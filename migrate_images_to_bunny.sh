#!/bin/bash
# Migrate existing room images from local storage to BunnyCDN

# BunnyCDN Configuration
BUNNY_STORAGE_ZONE="letswatchout"
BUNNY_ACCESS_KEY="3eee58c0-9da4-4ef6-a7df729194c4-ea0e-4301"
BUNNY_STORAGE_REGION=""  # Empty for default Frankfurt region
BUNNY_PULL_ZONE_URL="https://LetsWatchOut.b-cdn.net"

# Database Configuration
DB_HOST="ballast.proxy.rlwy.net"
DB_PORT="33527"
DB_NAME="railway"
DB_USER="postgres"
DB_PASSWORD="RkEIczcIWgoXeWxINbNlNpBeMEUKxhnw"

echo "🚀 Starting image migration to BunnyCDN..."
echo ""

# Room 108 image
ROOM_ID=108
LOCAL_IMAGE="backend/uploads/room_images/room_108_1769281609.jpg"

if [ ! -f "$LOCAL_IMAGE" ]; then
    echo "❌ Error: Image file not found: $LOCAL_IMAGE"
    exit 1
fi

echo "📁 Found image: $LOCAL_IMAGE"
FILENAME=$(basename "$LOCAL_IMAGE")
echo "📤 Uploading $FILENAME to BunnyCDN..."

# Upload to BunnyCDN (Frankfurt region uses default endpoint)
UPLOAD_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}/${FILENAME}"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    --request PUT \
    --url "$UPLOAD_URL" \
    --header "AccessKey: $BUNNY_ACCESS_KEY" \
    --header "Content-Type: image/jpeg" \
    --data-binary "@$LOCAL_IMAGE")

if [ "$HTTP_CODE" -eq 201 ]; then
    echo "✅ Upload successful! HTTP $HTTP_CODE"
    
    # New CDN URL
    NEW_URL="${BUNNY_PULL_ZONE_URL}/${FILENAME}"
    echo "🔗 CDN URL: $NEW_URL"
    
    # Update database
    echo "💾 Updating database..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
        "UPDATE rooms SET image_url = '$NEW_URL' WHERE id = $ROOM_ID;"
    
    if [ $? -eq 0 ]; then
        echo "✅ Database updated successfully!"
        echo ""
        echo "🎉 Migration complete!"
        echo "   Room $ROOM_ID image now served from BunnyCDN"
        echo "   URL: $NEW_URL"
    else
        echo "❌ Database update failed"
        exit 1
    fi
else
    echo "❌ Upload failed! HTTP $HTTP_CODE"
    exit 1
fi
