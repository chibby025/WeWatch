# Docker Compose Explanation - Line by Line

## What is Docker Compose?

**Single container:** `docker run` (like running LiveKit manually)  
**Multiple containers:** `docker-compose up` (runs backend + frontend + database + LiveKit all at once)

Think of it as a conductor for an orchestra. Each service is an instrument, docker-compose makes them play together.

---

## Breaking Down docker-compose.yml

### Header

```yaml
version: '3.8'
```
**Translation:** Use Docker Compose version 3.8 syntax.  
**Why?** Different versions have different features. 3.8 is modern and widely supported.

---

### Services Section

```yaml
services:
```
**Translation:** Here come the containers (services) we want to run.

Think of services like team members:
- `postgres` = Database administrator
- `livekit` = Video call manager
- `backend` = API server
- `frontend` = Web UI server

---

### Service 1: PostgreSQL

```yaml
postgres:
  image: postgres:15-alpine
```
**Translation:** Create a container named `postgres` using pre-built PostgreSQL 15 image.

**image vs build:**
- `image:` - Use existing image from Docker Hub (like downloading app from app store)
- `build:` - Build custom image from Dockerfile (like compiling from source code)

---

```yaml
container_name: wewatch-postgres
```
**Translation:** Give container a friendly name: `wewatch-postgres`.

**Why?** Default names are random (like `wewatch_postgres_1_a7f3b2`). Named containers easier to find:
```bash
docker logs wewatch-postgres  # Easy
docker logs wewatch_postgres_1_a7f3b2  # Annoying
```

---

```yaml
environment:
  POSTGRES_USER: postgres
  POSTGRES_PASSWORD: postgres
  POSTGRES_DB: wewatch_db
```
**Translation:** Set environment variables inside container.

**What this does:**
- Creates PostgreSQL user: `postgres`
- Sets password: `postgres`
- Creates database: `wewatch_db`

**Like running manually:**
```bash
createuser -U postgres postgres
psql -U postgres -c "ALTER USER postgres PASSWORD 'postgres';"
createdb -U postgres wewatch_db
```

But automated!

---

```yaml
ports:
  - "5432:5432"
```
**Translation:** Connect port 5432 inside container to port 5432 on your computer.

**Format:** `HOST_PORT:CONTAINER_PORT`

**Visual:**
```
Your Computer          Container
localhost:5432  →  →  postgres:5432
```

**Why?** Your backend running outside container needs to connect to PostgreSQL inside container.

---

```yaml
volumes:
  - postgres_data:/var/lib/postgresql/data
```
**Translation:** Save PostgreSQL data permanently on your computer (not inside container).

**Why this matters:**
- **Without volume:** `docker-compose down` → ALL data deleted (users, sessions, everything) ❌
- **With volume:** `docker-compose down` → Data persists ✅

**How it works:**
- `postgres_data` - Named volume (Docker manages location, like `C:\ProgramData\Docker\volumes\postgres_data`)
- `/var/lib/postgresql/data` - Where PostgreSQL stores data inside container

**Think of it like:**
- Container = Student's desk (temporary)
- Volume = Student's backpack (follows them everywhere)

When container deleted → desk disappears, but backpack remains.

---

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 10s
  timeout: 5s
  retries: 5
```
**Translation:** Check if PostgreSQL is healthy every 10 seconds.

**What this does:**
- Every 10s, run `pg_isready -U postgres` inside container
- If command succeeds → Healthy ✅
- If fails 5 times → Unhealthy ❌

**Why this matters:**
```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy  # ← Wait for healthcheck to pass
```

Backend won't start until PostgreSQL is actually ready (not just "started").

**Real-world example:**
- PostgreSQL container starts (1 second)
- Backend starts immediately, tries to connect → **Connection refused** (PostgreSQL not ready yet)
- Backend crashes ❌

**With healthcheck:**
- PostgreSQL container starts (1 second)
- Healthcheck runs (2-3 seconds until database ready)
- Backend starts AFTER healthcheck passes → **Connection succeeds** ✅

---

```yaml
networks:
  - wewatch-network
```
**Translation:** Put this container on `wewatch-network` network.

**Why networks?**  
Containers on same network can talk to each other by name:

```go
// Backend code
db := "postgres://postgres:postgres@postgres:5432/wewatch_db"
//                                    ↑
//                        Container name, not localhost!
```

**Magic of Docker networks:**
- Backend uses `postgres:5432` (not `localhost:5432`)
- Docker resolves `postgres` → IP address of postgres container
- Works automatically, no configuration needed

**Visual:**
```
wewatch-network (like office WiFi)
├─ postgres (192.168.1.2)
├─ livekit (192.168.1.3)
├─ backend (192.168.1.4) ← Can talk to postgres by name
└─ frontend (192.168.1.5)
```

---

### Service 2: LiveKit

```yaml
livekit:
  image: livekit/livekit-server:latest
```
**Translation:** Use official LiveKit image.

**This is what you're already doing!** Just moving from manual `docker run` to docker-compose.

---

```yaml
command: --config /livekit.yaml
```
**Translation:** Override default command, use custom config file.

**Default:** LiveKit runs with built-in config  
**Custom:** Use your `livekit.yaml` file

---

```yaml
ports:
  - "7880:7880"  # HTTP
  - "7881:7881"  # WebSocket
  - "7882:7882"  # RTC (TURN)
  - "50000-50100:50000-50100/udp"  # RTC port range
```
**Translation:** Expose LiveKit ports.

**Breaking down:**
- `7880` - HTTP API (backend talks to this)
- `7881` - WebSocket signaling (frontend connects here)
- `7882` - TURN server (NAT traversal)
- `50000-50100/udp` - WebRTC media streams (voice/video data)

**Note:** `/udp` means UDP protocol (fast, for real-time data). Default is TCP.

---

```yaml
volumes:
  - ./livekit.yaml:/livekit.yaml:ro
```
**Translation:** Mount your `livekit.yaml` file into container as read-only.

**Format:** `HOST_PATH:CONTAINER_PATH:OPTIONS`

**Breaking down:**
- `./livekit.yaml` - File on your computer (same folder as docker-compose.yml)
- `/livekit.yaml` - Where file appears inside container
- `:ro` - Read-only (container can't modify original file)

**Why?**  
LiveKit needs config file. Instead of copying into image (requires rebuild every time you change config), mount it directly. Change config → restart container → new config applied.

---

```yaml
depends_on:
  - postgres
```
**Translation:** Start postgres BEFORE livekit.

**Order matters:**
1. PostgreSQL starts first
2. Then LiveKit starts
3. Then backend starts
4. Then frontend starts

**Note:** This only controls START order, not readiness. Use `condition: service_healthy` for that.

---

### Service 3: Backend

```yaml
backend:
  build:
    context: ./backend
    dockerfile: Dockerfile
```
**Translation:** Build custom image from `backend/Dockerfile`.

**context:** Where to run `docker build` from (sets working directory)  
**dockerfile:** Which file contains build instructions

**What happens:**
```bash
cd ./backend
docker build -f Dockerfile -t wewatch-backend .
```

---

```yaml
environment:
  - DATABASE_URL=postgres://postgres:postgres@postgres:5432/wewatch_db?sslmode=disable
```
**Translation:** Set DATABASE_URL environment variable for backend to use.

**Breaking down the connection string:**
```
postgres://postgres:postgres@postgres:5432/wewatch_db?sslmode=disable
^protocol  ^user   ^pass    ^host   ^port ^db       ^option
```

**CRITICAL:** Host is `postgres` (container name), not `localhost`!

**Why?**
- `localhost` inside container = the container itself
- `postgres` = Docker resolves to postgres container's IP

---

```yaml
- LIVEKIT_URL=http://livekit:7880
```
**Translation:** Tell backend where LiveKit is.

**Again:** `livekit` (container name), not `localhost`!

---

```yaml
- GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
```
**Translation:** Use environment variable from `.env` file or shell.

**How it works:**
1. Create `.env` file in same folder as docker-compose.yml:
   ```env
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-secret
   PAYSTACK_SECRET_KEY=sk_test_...
   ```

2. Docker Compose reads `.env` automatically
3. `${GOOGLE_CLIENT_ID}` replaced with actual value

**Security:**  
Never commit `.env` to GitHub! Add to `.gitignore`.

---

```yaml
ports:
  - "8080:8080"
```
**Translation:** Expose backend API on localhost:8080.

---

```yaml
volumes:
  - ./backend/uploads:/root/uploads
```
**Translation:** Mount uploads folder so files persist.

**Why?**  
When users upload videos, they're saved to container's `/root/uploads/`. Without volume:
- Container deleted → uploads gone ❌

With volume:
- Container deleted → uploads remain on your computer ✅

**Bind mount vs named volume:**
- Named volume: `postgres_data:/var/lib/...` (Docker manages location)
- Bind mount: `./backend/uploads:/root/uploads` (you specify exact folder on computer)

---

```yaml
depends_on:
  postgres:
    condition: service_healthy
  livekit:
    condition: service_started
```
**Translation:**
- Wait for PostgreSQL healthcheck to pass
- Wait for LiveKit to start (no healthcheck, just started)

**Why different conditions?**
- PostgreSQL needs time to initialize → wait for healthy
- LiveKit starts quickly → just wait for started

---

```yaml
restart: unless-stopped
```
**Translation:** If backend crashes, automatically restart it.

**Options:**
- `no` - Never restart (default)
- `always` - Always restart (even after reboot)
- `on-failure` - Restart only if crashes (exit code != 0)
- `unless-stopped` - Always restart, except if you manually stopped it

**Real-world scenario:**
- Backend has bug, crashes at 3 AM
- With `restart: unless-stopped` → Docker restarts backend automatically
- Without restart policy → Backend stays down until you manually restart

---

### Service 4: Frontend

```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile
```
**Translation:** Build frontend image from `frontend/Dockerfile`.

---

```yaml
ports:
  - "80:80"
```
**Translation:** Serve frontend on port 80 (standard HTTP).

**Options:**
- `"80:80"` - Access via `http://localhost` (no port needed)
- `"5173:80"` - Access via `http://localhost:5173` (matches dev server)

---

```yaml
environment:
  - VITE_API_BASE_URL=http://localhost:8080
```
**Translation:** Tell frontend where backend API is.

**NOTE:** This is for browser connections, not container-to-container. Browser runs on your computer, so it needs `localhost:8080`, not `backend:8080`.

**Why?**
- Browser → Backend: Use `localhost:8080` (browser runs on your computer)
- Backend → PostgreSQL: Use `postgres:5432` (containers talk via network)

---

### Volumes Section

```yaml
volumes:
  postgres_data:
    driver: local
```
**Translation:** Define named volume for PostgreSQL data.

**driver: local** = Store on your computer's disk (default, can omit).

Other drivers: NFS, cloud storage (AWS EFS, Azure Files) for production.

---

### Networks Section

```yaml
networks:
  wewatch-network:
    driver: bridge
```
**Translation:** Create custom network for containers.

**driver: bridge** = Standard Docker network (containers can talk to each other, isolated from outside).

**Why custom network?**  
Default network doesn't allow container name resolution. Custom network enables:
```go
db := "postgres://postgres:postgres@postgres:5432/wewatch_db"
//                                    ↑ Works!
```

---

## How to Use Docker Compose

### Start Everything

```bash
docker-compose up
```

**What happens:**
1. Builds backend image (if Dockerfile changed)
2. Builds frontend image (if Dockerfile changed)
3. Pulls PostgreSQL image (if not cached)
4. Pulls LiveKit image (if not cached)
5. Creates network
6. Creates volumes
7. Starts containers in dependency order:
   - postgres
   - livekit
   - backend (after postgres healthy)
   - frontend (after backend started)

**Options:**
```bash
docker-compose up -d          # Detached mode (runs in background)
docker-compose up --build     # Force rebuild images
docker-compose up backend     # Start only backend (and dependencies)
```

---

### Stop Everything

```bash
docker-compose down
```

**What happens:**
1. Stops all containers
2. Removes containers
3. Removes network
4. **Volumes persist** (data safe!)

**Full cleanup (delete volumes too):**
```bash
docker-compose down -v  # ⚠️ Deletes all data!
```

---

### View Logs

```bash
docker-compose logs           # All services
docker-compose logs backend   # Just backend
docker-compose logs -f backend # Follow (live tail)
```

---

### Rebuild After Code Changes

```bash
docker-compose up --build
```

**When needed:**
- Changed Go code
- Changed React code
- Changed Dockerfile

**NOT needed:**
- Changed environment variables (just restart: `docker-compose restart backend`)
- Changed docker-compose.yml (just re-run `docker-compose up`)

---

## Common Issues & Solutions

### Issue 1: Port Already in Use

**Error:**
```
ERROR: for postgres  Cannot start service postgres: driver failed programming external connectivity on endpoint wewatch-postgres: Bind for 0.0.0.0:5432 failed: port is already allocated
```

**Cause:** PostgreSQL already running on your computer (port 5432 taken).

**Solution:**
```bash
# Stop local PostgreSQL
sudo service postgresql stop

# Or change port in docker-compose.yml
ports:
  - "5433:5432"  # Use 5433 on host, 5432 in container
```

---

### Issue 2: Backend Can't Connect to Database

**Error in backend logs:**
```
Failed to connect to database: dial tcp: lookup postgres: no such host
```

**Cause:** Backend not on same network as PostgreSQL, or using `localhost` instead of `postgres`.

**Solution:** Check:
1. Both services on same network (`wewatch-network`)
2. Backend uses `postgres:5432`, not `localhost:5432`

---

### Issue 3: Frontend Can't Reach Backend

**Error in browser console:**
```
Failed to fetch http://localhost:8080/api/rooms
```

**Cause:** Backend not exposed to host, or wrong VITE_API_BASE_URL.

**Solution:**
```yaml
backend:
  ports:
    - "8080:8080"  # ← Ensure this exists

frontend:
  environment:
    - VITE_API_BASE_URL=http://localhost:8080  # ← Not backend:8080!
```

---

## Next: GitHub Actions CI/CD

Now that you understand Docker, let's set up automated testing with GitHub Actions.

(Continued in GITHUB_ACTIONS_GUIDE.md)
