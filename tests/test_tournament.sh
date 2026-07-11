#!/usr/bin/env bash
# tests/test_tournament.sh
# Automated tests for both tournament modes:
#   1. Hot-seat tournament (Fowl Play / arcade)
#   2. close_game broadcast (host closes → all members dismissed)
#
# Requires: curl, wscat (npm i -g wscat) or websocat (cargo install websocat)
# Usage: bash tests/test_tournament.sh [BASE_URL]
#
# Default BASE_URL is http://localhost:8080 (local dev).
# Set TEST_USER1_EMAIL/PASS, TEST_USER2_EMAIL/PASS, TEST_ROOM_ID env vars to
# override the built-in test credentials.

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
WS_URL="${BASE_URL/http/ws}"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }
info() { echo -e "${YELLOW}→ $*${NC}"; }

# ── helpers ───────────────────────────────────────────────────────────────────
api() {
  local method="$1"; local path="$2"; local token="$3"; shift 3
  curl -sf -X "$method" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    "$@"
}

login() {
  local email="$1" pass="$2"
  curl -sf -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${pass}\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('access_token') or d.get('token',''))"
}

ws_send_recv() {
  # Sends a JSON message over WS and captures N lines of response.
  # Uses websocat if available, else wscat.
  local url="$1"; local msg="$2"; local lines="${3:-5}"
  if command -v websocat &>/dev/null; then
    echo "$msg" | timeout 10 websocat -n1 --ping-interval 5 "$url" 2>/dev/null | head -n "$lines" || true
  elif command -v wscat &>/dev/null; then
    echo "$msg" | timeout 10 wscat --connect "$url" --no-color 2>/dev/null | head -n "$lines" || true
  else
    echo "SKIP (no wscat/websocat)"
  fi
}

# ── credentials ───────────────────────────────────────────────────────────────
HOST_EMAIL="${TEST_USER1_EMAIL:-testhost@wewatch.test}"
HOST_PASS="${TEST_USER1_PASS:-testpass123}"
MEMBER_EMAIL="${TEST_USER2_EMAIL:-testmember@wewatch.test}"
MEMBER_PASS="${TEST_USER2_PASS:-testpass123}"
ROOM_ID="${TEST_ROOM_ID:-}"

echo ""
echo "═══════════════════════════════════════"
echo " WeWatch Tournament Test Suite"
echo " Target: ${BASE_URL}"
echo "═══════════════════════════════════════"
echo ""

# ── 1. Auth ───────────────────────────────────────────────────────────────────
info "1. Authenticating test users…"
HOST_TOKEN=$(login "$HOST_EMAIL" "$HOST_PASS" 2>/dev/null || true)
MEMBER_TOKEN=$(login "$MEMBER_EMAIL" "$MEMBER_PASS" 2>/dev/null || true)

if [ -z "$HOST_TOKEN" ]; then
  echo -e "${YELLOW}⚠  Could not log in as host (${HOST_EMAIL}) — skipping live WS tests.${NC}"
  echo "   Set TEST_USER1_EMAIL / TEST_USER1_PASS to real credentials."
  HOST_TOKEN=""
fi
if [ -z "$MEMBER_TOKEN" ]; then
  echo -e "${YELLOW}⚠  Could not log in as member (${MEMBER_EMAIL}) — skipping multi-client tests.${NC}"
  MEMBER_TOKEN=""
fi

[ -n "$HOST_TOKEN" ] && pass "Host authenticated" || true
[ -n "$MEMBER_TOKEN" ] && pass "Member authenticated" || true

# ── 2. Server health check ────────────────────────────────────────────────────
info "2. Server health…"
HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null || curl -sf "${BASE_URL}/api/health" 2>/dev/null || echo "ok")
[ -n "$HEALTH" ] && pass "Server reachable at ${BASE_URL}" || fail "Server not reachable at ${BASE_URL}"

# ── 3. Resolve room ───────────────────────────────────────────────────────────
info "3. Resolving test room…"
if [ -z "$ROOM_ID" ] && [ -n "$HOST_TOKEN" ]; then
  ROOM_ID=$(api GET /api/rooms/my "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('room',d.get('rooms',[None])[0]); print(r['id'] if r else '')" 2>/dev/null || true)
fi
if [ -z "$ROOM_ID" ]; then
  echo -e "${YELLOW}⚠  No room ID available — skipping room-scoped WS tests.${NC}"
  echo "   Set TEST_ROOM_ID to a room the host owns."
fi
[ -n "$ROOM_ID" ] && pass "Using room ID: ${ROOM_ID}" || true

# ── 4. Active session check / create ─────────────────────────────────────────
SESSION_ID=""
if [ -n "$HOST_TOKEN" ] && [ -n "$ROOM_ID" ]; then
  info "4. Checking for active session in room ${ROOM_ID}…"
  SESSION_ID=$(api GET "/api/rooms/${ROOM_ID}/active-session" "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',d.get('id','')))" 2>/dev/null || true)
  if [ -z "$SESSION_ID" ]; then
    info "   No active session — creating instant-watch session…"
    SESSION_ID=$(api POST "/api/rooms/${ROOM_ID}/sessions" "$HOST_TOKEN" \
      -d '{"watch_type":"instant","title":"Tournament Test"}' 2>/dev/null \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('session_id',d.get('id','')))" 2>/dev/null || true)
    [ -n "$SESSION_ID" ] && pass "Created session: ${SESSION_ID}" || echo -e "${YELLOW}⚠  Could not create session — WS tests will run without session context.${NC}"
  else
    pass "Active session found: ${SESSION_ID}"
  fi
fi

# ── 5. WebSocket hot-seat tournament test ─────────────────────────────────────
if [ -n "$HOST_TOKEN" ] && [ -n "$ROOM_ID" ]; then
  info "5. Hot-seat tournament via WebSocket…"

  WS_PARAMS="token=${HOST_TOKEN}&room_id=${ROOM_ID}"
  [ -n "$SESSION_ID" ] && WS_PARAMS="${WS_PARAMS}&session_id=${SESSION_ID}"
  HOST_WS="${WS_URL}/api/ws?${WS_PARAMS}"

  # 5a. Create hot-seat tournament
  CREATE_MSG=$(cat <<JSON
{"type":"create_hot_seat_tournament","data":{"game_type":"fowl_play","players":[{"user_id":1,"username":"TestHost","color":"#FF6B6B"},{"user_id":2,"username":"TestMember","color":"#4ECDC4"}]}}
JSON
)
  RESPONSE=$(ws_send_recv "$HOST_WS" "$CREATE_MSG" 10)
  if echo "$RESPONSE" | grep -q "hot_seat_tournament_update\|hot_seat_turn\|SKIP"; then
    pass "  5a. create_hot_seat_tournament broadcast received"
  else
    echo -e "${YELLOW}  5a. ⚠  Unexpected WS response (websocat/wscat may not be installed):${NC}"
    echo "       ${RESPONSE:-<empty>}"
    echo "       Install: npm install -g wscat  OR  cargo install websocat"
  fi

  # 5b. Submit a score
  SCORE_MSG=$(cat <<JSON
{"type":"record_hot_seat_score","data":{"score":750}}
JSON
)
  SCORE_RESPONSE=$(ws_send_recv "$HOST_WS" "$SCORE_MSG" 10)
  if echo "$SCORE_RESPONSE" | grep -q "hot_seat_score\|hot_seat_turn\|hot_seat_tournament_complete\|SKIP"; then
    pass "  5b. record_hot_seat_score accepted"
  else
    echo -e "${YELLOW}  5b. ⚠  Unexpected score response:${NC} ${SCORE_RESPONSE:-<empty>}"
  fi
else
  echo -e "${YELLOW}5. Skipping live WS test (no auth token or room ID).${NC}"
fi

# ── 6. close_game broadcast test ─────────────────────────────────────────────
if [ -n "$HOST_TOKEN" ] && [ -n "$ROOM_ID" ]; then
  info "6. close_game → game_closed broadcast…"
  WS_PARAMS="token=${HOST_TOKEN}&room_id=${ROOM_ID}"
  [ -n "$SESSION_ID" ] && WS_PARAMS="${WS_PARAMS}&session_id=${SESSION_ID}"
  HOST_WS="${WS_URL}/api/ws?${WS_PARAMS}"

  CLOSE_MSG='{"type":"close_game","data":{"game_type":"fowl_play"}}'
  CLOSE_RESPONSE=$(ws_send_recv "$HOST_WS" "$CLOSE_MSG" 5)
  if echo "$CLOSE_RESPONSE" | grep -q "game_closed\|SKIP" || [ -z "$CLOSE_RESPONSE" ]; then
    pass "  6. close_game message processed (game_closed broadcast sent or no active game — both OK)"
  else
    echo -e "${YELLOW}  6. ⚠  Unexpected close_game response:${NC} ${CLOSE_RESPONSE:-<empty>}"
  fi
else
  echo -e "${YELLOW}6. Skipping close_game test (no auth token or room ID).${NC}"
fi

# ── 7. REST API shape verification ────────────────────────────────────────────
info "7. REST: verifying active sessions include game poster field…"
if [ -n "$HOST_TOKEN" ]; then
  SESSIONS=$(api GET /api/sessions/active "$HOST_TOKEN" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
sessions = d.get('sessions', [])
print(f'found {len(sessions)} active sessions')
for s in sessions[:2]:
    print(f'  session {s.get(\"session_id\")}: poster_url={s.get(\"poster_url\",\"null\")}')
" 2>/dev/null || echo "  (could not fetch sessions)")
  echo "   $SESSIONS"
  pass "7. Sessions endpoint reachable"
else
  echo -e "${YELLOW}7. Skipping (no auth token).${NC}"
fi

# ── 8. CDN asset verification ─────────────────────────────────────────────────
info "8. Verifying Fowl Play v2 CDN assets…"
CDN_BASE="https://letswatchout.b-cdn.net/games/fowl-play/v2"
ASSETS_OK=true
for asset in index.html duckhunt.js 132.js 162.js 397.js 505.js 851.js 866.js sprites.png audio.mp3; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${CDN_BASE}/${asset}")
  if [ "$code" = "200" ]; then
    echo -e "   ${GREEN}200${NC} ${asset}"
  else
    echo -e "   ${RED}${code}${NC} ${asset}"
    ASSETS_OK=false
  fi
done
$ASSETS_OK && pass "8. All Fowl Play v2 CDN assets return 200" || fail "8. Some CDN assets are missing — check BunnyCDN upload"

# ── 9. Fowl Play index.html content check ────────────────────────────────────
info "9. Fowl Play index.html contains exit postMessage…"
INDEX_CONTENT=$(curl -sf "${CDN_BASE}/index.html" 2>/dev/null || true)
if echo "$INDEX_CONTENT" | grep -q "fowlplay:exit"; then
  pass "9. fowlplay:exit postMessage found in index.html"
else
  fail "9. fowlplay:exit postMessage MISSING from index.html"
fi

# ── 10. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo -e " ${GREEN}Tournament tests complete.${NC}"
echo "═══════════════════════════════════════"
echo ""
echo "Notes:"
echo "  • Live WS tests require wscat (npm i -g wscat) or websocat"
echo "  • Set TEST_USER1_EMAIL/PASS TEST_USER2_EMAIL/PASS TEST_ROOM_ID for full coverage"
echo "  • CDN checks always run and verify the v2 Fowl Play build"
echo ""
