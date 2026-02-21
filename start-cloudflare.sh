#!/bin/bash

echo "🚀 Starting WeWatch with Cloudflare Tunnel..."
echo ""

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared not found. Installing..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    sudo dpkg -i cloudflared-linux-amd64.deb
    rm cloudflared-linux-amd64.deb
    echo "✅ cloudflared installed"
fi

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

# Start backend tunnel in background
echo "📡 Starting backend tunnel..."
cloudflared tunnel --url http://localhost:8080 > /tmp/cloudflare-backend.log 2>&1 &
BACKEND_TUNNEL_PID=$!

# Wait for backend tunnel to start
echo "   Waiting for backend tunnel to initialize..."
sleep 5

# Start frontend tunnel in background
echo "📡 Starting frontend tunnel..."
cloudflared tunnel --url http://localhost:5173 > /tmp/cloudflare-frontend.log 2>&1 &
FRONTEND_TUNNEL_PID=$!

# Wait for frontend tunnel to start
echo "   Waiting for frontend tunnel to initialize..."
sleep 5

# Extract URLs from logs
echo ""
echo "🔍 Fetching tunnel URLs..."
sleep 3

BACKEND_URL=$(grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/cloudflare-backend.log | head -1)
FRONTEND_URL=$(grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/cloudflare-frontend.log | head -1)

if [ -z "$BACKEND_URL" ] || [ -z "$FRONTEND_URL" ]; then
    echo "⚠️  Could not extract URLs. Check logs:"
    echo "   Backend log:  /tmp/cloudflare-backend.log"
    echo "   Frontend log: /tmp/cloudflare-frontend.log"
    exit 1
fi

echo ""
echo "✅ Cloudflare tunnels started!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 Backend URL:  $BACKEND_URL"
echo "🔗 Frontend URL: $FRONTEND_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Update frontend/.env.local
echo "📝 Updating frontend/.env.local..."
if [ -f frontend/.env.local ]; then
    # Backup existing .env.local
    cp frontend/.env.local frontend/.env.local.backup
fi

cat > frontend/.env.local <<EOF
# Local development
VITE_API_BASE_URL=http://localhost:8080

# Cloudflare Tunnel (for external access)
VITE_CLOUDFLARE_BACKEND_URL=$BACKEND_URL
EOF

echo "   ✅ Updated .env.local with dual configuration:"
echo "      - VITE_API_BASE_URL=http://localhost:8080 (local)"
echo "      - VITE_CLOUDFLARE_BACKEND_URL=$BACKEND_URL (external)"
echo ""

# Check if frontend needs restart
if [ ! -z "$FRONTEND_RUNNING" ]; then
    echo "⚠️  Frontend is currently running on port 5173"
    echo "   You need to RESTART the frontend for changes to take effect:"
    echo "   1. Stop the frontend (Ctrl+C in its terminal)"
    echo "   2. Run: cd frontend && npm run dev"
    echo ""
    echo "   OR run this command in another terminal:"
    echo "   kill $FRONTEND_RUNNING && cd frontend && npm run dev"
    echo ""
fi

echo "📋 Share these URLs with testers:"
echo "   Frontend: $FRONTEND_URL"
echo "   Backend:  $BACKEND_URL"
echo ""
echo "💡 TIP: The backend URL is automatically configured in the frontend!"
echo ""
echo "📊 Tunnel Logs:"
echo "   Backend:  tail -f /tmp/cloudflare-backend.log"
echo "   Frontend: tail -f /tmp/cloudflare-frontend.log"
echo ""
echo "Press Ctrl+C to stop tunnels"

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping tunnels...'; kill $BACKEND_TUNNEL_PID $FRONTEND_TUNNEL_PID; echo '✅ Tunnels stopped'; exit 0" SIGINT SIGTERM

# Keep script running
while true; do
    sleep 1
done
