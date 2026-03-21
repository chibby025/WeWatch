# WeWatch Deployment Guide

Complete guide to deploy WeWatch for testing and production.

---

## 📱 Quick Testing Options

### Option 1: Local Network Testing (Same WiFi)

**Best for:** Testing on mobile devices in the same location

```bash
# 1. Get your machine's local IP
hostname -I
# Example output: 192.168.1.100

# 2. Start backend (ensure it's listening on 0.0.0.0)
cd backend
go run cmd/server/main.go

# 3. Start frontend with network access
cd frontend
npm run dev -- --host

# 4. Access from mobile browser
# Frontend: http://192.168.1.100:5173
# Backend: http://192.168.1.100:8080
```

**Update frontend config:**
```javascript
// frontend/src/services/api.js
const API_BASE_URL = 'http://192.168.1.100:8080';
const WS_BASE_URL = 'ws://192.168.1.100:8080';
```

---

### Option 2: Ngrok (Easiest for Remote Testing)

**Best for:** Sharing with remote testers, external testing

```bash
# Install ngrok
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# Or snap install
sudo snap install ngrok

# Sign up at https://ngrok.com and get auth token
ngrok config add-authtoken YOUR_AUTH_TOKEN

# Expose backend (Terminal 1)
ngrok http 8080
# Copy URL: https://abc123.ngrok-free.app

# Expose frontend (Terminal 2)
ngrok http 5173
# Copy URL: https://xyz789.ngrok-free.app
```

**Update frontend config:**
```javascript
// frontend/src/services/api.js
const API_BASE_URL = 'https://abc123.ngrok-free.app';
const WS_BASE_URL = 'wss://abc123.ngrok-free.app';
```

**Share URLs with testers:**
- Frontend: `https://xyz789.ngrok-free.app`
- Backend API: `https://abc123.ngrok-free.app`

---

### Option 3: Cloudflare Tunnel (Free Alternative to Ngrok)

**Best for:** Long-term testing, no paid subscription

```bash
# Install cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Tunnel backend
cloudflared tunnel --url http://localhost:8080

# Tunnel frontend (in another terminal)
cloudflared tunnel --url http://localhost:5173
```

---

## 🚀 Production Deployment

### Architecture Overview
```
Frontend (Vercel/Netlify) → Backend (Railway/Render) → PostgreSQL (Managed DB) → LiveKit (Self-hosted/Cloud)
```

---

### Step 1: Deploy Backend to Railway

**Why Railway?** Free tier, easy PostgreSQL integration, WebSocket support

```bash
# 1. Create Railway account: https://railway.app

# 2. Install Railway CLI
npm i -g @railway/cli

# 3. Login
railway login

# 4. Initialize project
cd backend
railway init

# 5. Add PostgreSQL
railway add postgresql

# 6. Set environment variables
railway variables set GO_ENV=production
railway variables set PORT=8080
railway variables set DATABASE_URL=${{Postgres.DATABASE_URL}}
railway variables set JWT_SECRET=your-super-secret-key-change-in-production
railway variables set LIVEKIT_API_KEY=your-livekit-api-key
railway variables set LIVEKIT_API_SECRET=your-livekit-secret
railway variables set LIVEKIT_HOST=your-livekit-host

# 7. Create railway.toml
cat > railway.toml << 'EOF'
[build]
builder = "nixpacks"

[deploy]
startCommand = "go run cmd/server/main.go"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
EOF

# 8. Deploy
railway up

# Copy your Railway URL: https://wewatch-backend.up.railway.app
```

---

### Step 2: Deploy Frontend to Vercel

**Why Vercel?** Free tier, automatic HTTPS, great performance

```bash
# 1. Install Vercel CLI
npm i -g vercel

# 2. Update API config
# Edit frontend/src/services/api.js
const API_BASE_URL = 'https://wewatch-backend.up.railway.app';
const WS_BASE_URL = 'wss://wewatch-backend.up.railway.app';

# 3. Build frontend
cd frontend
npm run build

# 4. Deploy
vercel --prod

# Your app: https://wewatch.vercel.app
```

**Alternative: Netlify**
```bash
# Install Netlify CLI
npm i -g netlify-cli

# Deploy
cd frontend
npm run build
netlify deploy --prod
```

---

### Step 3: Configure LiveKit

**Option A: Self-hosted LiveKit (Current Setup)**
```bash
# Ensure LiveKit is accessible from internet
# Update firewall rules to allow ports 7880, 7881, 7882

# Get public IP
curl ifconfig.me

# Update frontend config
LIVEKIT_HOST=your-public-ip:7880
```

**Option B: LiveKit Cloud (Recommended for Production)**
```bash
# 1. Sign up: https://livekit.io/cloud
# 2. Create project
# 3. Copy credentials:
#    - API Key
#    - API Secret
#    - WebSocket URL

# 4. Update backend env vars
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_HOST=your-project.livekit.cloud
```

---

### Step 4: Database Migration

```bash
# Connect to Railway PostgreSQL
railway run psql

# Or use connection string
psql postgresql://user:pass@host:port/db

# Run migrations
cd backend
go run cmd/server/main.go migrate

# Verify tables
\dt
```

---

### Step 5: Environment Variables Checklist

**Backend (.env or Railway vars):**
```bash
PORT=8080
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key-change-me
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-secret
LIVEKIT_HOST=your-livekit-host
CORS_ORIGINS=https://wewatch.vercel.app
```

**Frontend (.env.production):**
```bash
VITE_API_URL=https://wewatch-backend.up.railway.app
VITE_WS_URL=wss://wewatch-backend.up.railway.app
VITE_LIVEKIT_URL=wss://your-livekit-host
```

---

## 🐳 Docker Deployment (All-in-One)

**Best for:** VPS deployment (DigitalOcean, Linode, AWS)

```dockerfile
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: wewatch_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: your_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://postgres:your_password@postgres:5432/wewatch_db
      JWT_SECRET: your-secret
      LIVEKIT_API_KEY: your-key
      LIVEKIT_API_SECRET: your-secret
      LIVEKIT_HOST: your-livekit-host
    depends_on:
      - postgres

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    environment:
      VITE_API_URL: http://your-domain.com:8080
      VITE_WS_URL: ws://your-domain.com:8080
    depends_on:
      - backend

  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    ports:
      - "7880:7880"
      - "7881:7881"
      - "7882:7882/udp"
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml

volumes:
  postgres_data:
```

**Deploy:**
```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## 📊 Monitoring & Debugging

### Health Checks

**Backend:**
```bash
curl https://wewatch-backend.up.railway.app/health
```

**Frontend:**
```bash
curl https://wewatch.vercel.app
```

**LiveKit:**
```bash
curl http://your-livekit-host:7880/
```

### Common Issues

**Issue: WebSocket connection failed**
- Check CORS settings in backend
- Ensure `wss://` protocol for HTTPS sites
- Verify firewall allows WebSocket ports

**Issue: CORS errors**
- Add frontend URL to backend CORS_ORIGINS
- Check protocol (http vs https)

**Issue: Database connection failed**
- Verify DATABASE_URL format
- Check PostgreSQL is running
- Ensure network allows database port

**Issue: LiveKit connection failed**
- Verify API key/secret are correct
- Check LiveKit host is accessible
- Ensure WebRTC ports are open (UDP 7882)

---

## 🔒 Security Checklist

- [ ] Change JWT_SECRET from default
- [ ] Use HTTPS for production (SSL certificates)
- [ ] Enable CORS only for your domain
- [ ] Use environment variables (never commit secrets)
- [ ] Enable PostgreSQL password authentication
- [ ] Set up firewall rules (allow only necessary ports)
- [ ] Enable rate limiting on API endpoints
- [ ] Regular database backups
- [ ] Monitor logs for suspicious activity

---

## 📱 Mobile App (Future)

### React Native Export
```bash
# Use React Native Web
npm install react-native-web

# Or Expo
npx expo init wewatch-mobile
```

### Progressive Web App (PWA)
```bash
# Add PWA support to Vite
npm install vite-plugin-pwa -D

# Configure in vite.config.js
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WeWatch',
        short_name: 'WeWatch',
        description: 'Watch together platform',
        theme_color: '#1F2937',
        icons: [/* ... */]
      }
    })
  ]
}
```

---

## 🎯 Performance Optimization

### Backend
```go
// Enable gzip compression
router.Use(gzip.Gzip(gzip.DefaultCompression))

// Add caching headers
router.Use(func(c *gin.Context) {
    c.Header("Cache-Control", "public, max-age=3600")
    c.Next()
})

// Connection pooling
db.SetMaxOpenConns(25)
db.SetMaxIdleConns(5)
db.SetConnMaxLifetime(5 * time.Minute)
```

### Frontend
```javascript
// Code splitting
const LobbyPage = lazy(() => import('./components/LobbyPage'));

// Image optimization
<img src={url} loading="lazy" />

// Service worker caching
// Use workbox for advanced caching
```

---

## 📚 Additional Resources

- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)
- [LiveKit Docs](https://docs.livekit.io)
- [Ngrok Docs](https://ngrok.com/docs)
- [Docker Compose Docs](https://docs.docker.com/compose)

---

## 🆘 Support

**Issues:**
- Check GitHub Issues
- Review backend logs: `railway logs`
- Check frontend console for errors
- Verify WebSocket connection in Network tab

**Contact:**
- Create issue on GitHub
- Email support (if available)
- Community Discord/Slack (if available)
