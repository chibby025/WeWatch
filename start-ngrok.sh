#!/bin/bash

echo "🚀 Starting WeWatch with Ngrok..."
echo ""

# Check if backend and frontend are running
BACKEND_RUNNING=$(lsof -i :8080 -t 2>/dev/null)
FRONTEND_RUNNING=$(lsof -i :5173 -t 2>/dev/null)

if [ -z "$BACKEND_RUNNING" ]; then
    echo "⚠️  WARNING: Backend (port 8080) is not running!"
    echo "   Please start the backend in another terminal:"
    echo "   cd backend && go run cmd/server/main.go"
    echo ""
fi

if [ -z "$FRONTEND_RUNNING" ]; then
    echo "⚠️  WARNING: Frontend (port 5173) is not running!"
    echo "   Please start the frontend in another terminal:"
    echo "   cd frontend && npm run dev"
    echo ""
fi

# Start ngrok with both tunnels
echo "📡 Starting ngrok tunnels..."
ngrok start --config=ngrok.yml --all > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
echo "   Waiting for ngrok to initialize..."
sleep 6

# Check if ngrok process is still running
if ! ps -p $NGROK_PID > /dev/null 2>&1; then
    echo "❌ Ngrok process died. Check logs:"
    cat /tmp/ngrok.log
    exit 1
fi

# Get the ngrok URLs with retry logic
echo ""
echo "🔍 Fetching ngrok URLs..."
MAX_RETRIES=5
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    TUNNELS_JSON=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null)
    
    if [ -n "$TUNNELS_JSON" ]; then
        BACKEND_URL=$(echo "$TUNNELS_JSON" | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -n 1)
        FRONTEND_URL=$(echo "$TUNNELS_JSON" | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | tail -n 1)
        
        if [ -n "$BACKEND_URL" ] && [ -n "$FRONTEND_URL" ]; then
            break
        fi
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "   Retry $RETRY_COUNT/$MAX_RETRIES..."
        sleep 2
    fi
done

if [ -z "$BACKEND_URL" ] || [ -z "$FRONTEND_URL" ]; then
    echo "❌ Failed to get ngrok URLs after $MAX_RETRIES attempts"
    echo ""
    echo "🔍 Debug Info:"
    echo "   Ngrok PID: $NGROK_PID"
    echo "   Ngrok API response:"
    curl -s http://localhost:4040/api/tunnels 2>/dev/null || echo "   Could not reach ngrok API"
    echo ""
    echo "   Ngrok logs:"
    cat /tmp/ngrok.log 2>/dev/null || echo "   No logs available"
    echo ""
    echo "💡 Try these steps:"
    echo "   1. Make sure ngrok is installed: ngrok version"
    echo "   2. Check if ports 4040, 8080, 5173 are available"
    echo "   3. Verify ngrok.yml exists and has correct authtoken"
    echo "   4. Try running manually: ngrok start --config=ngrok.yml --all"
    kill $NGROK_PID 2>/dev/null
    exit 1
fi

echo ""
echo "✅ Ngrok tunnels started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Backend URL:  $BACKEND_URL"
echo "🔗 Frontend URL: $FRONTEND_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Update frontend .env.local file
ENV_FILE="frontend/.env.local"
echo ""
echo "📝 Updating $ENV_FILE..."

# Create backup
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
    echo "   Backup created: $ENV_FILE.backup"
fi

# Update or create .env.local with both localhost and ngrok URLs
cat > "$ENV_FILE" << EOF
# Localhost backend (for local development)
VITE_API_BASE_URL=http://localhost:8080

# Ngrok backend (for external testing)
VITE_NGROK_BACKEND_URL=$BACKEND_URL
EOF

echo "   ✅ Updated .env.local with dual configuration:"
echo "      - VITE_API_BASE_URL=http://localhost:8080 (local)"
echo "      - VITE_NGROK_BACKEND_URL=$BACKEND_URL (external)"

# Check if frontend is running and offer to restart
if [ -n "$FRONTEND_RUNNING" ]; then
    echo ""
    echo "⚠️  Frontend is currently running on port 5173"
    echo "   You need to RESTART the frontend for changes to take effect:"
    echo "   1. Stop the frontend (Ctrl+C in its terminal)"
    echo "   2. Run: cd frontend && npm run dev"
    echo ""
    echo "   OR run this command in another terminal:"
    echo "   kill $FRONTEND_RUNNING && cd frontend && npm run dev"
fi

echo ""
echo "📊 Ngrok Inspector: http://localhost:4040"
echo ""
echo "📋 Share these URLs with testers:"
echo "   Frontend: $FRONTEND_URL"
echo "   Backend:  $BACKEND_URL"
echo ""
echo "💡 TIP: The backend URL is automatically configured in the frontend!"
echo ""
echo "Press Ctrl+C to stop ngrok tunnels"

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Stopping ngrok tunnels..."
    kill $NGROK_PID 2>/dev/null
    
    # Restore .env.local if backup exists
    if [ -f "$ENV_FILE.backup" ]; then
        echo "🔄 Restoring original .env.local..."
        mv "$ENV_FILE.backup" "$ENV_FILE"
    else
        # If no backup, ensure localhost is set as default
        echo "🔄 Resetting .env.local to localhost..."
        cat > "$ENV_FILE" << EOF
# Localhost backend (default for local development)
VITE_API_BASE_URL=http://localhost:8080
EOF
    fi
    
    echo "✅ Cleanup complete"
    echo "💡 Restart your frontend to apply localhost configuration"
    exit 0
}

# Wait for Ctrl+C
trap cleanup INT
wait $NGROK_PID
