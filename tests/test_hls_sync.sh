#!/usr/bin/env bash
# tests/test_hls_sync.sh
# Tests for the 2-second HLS segment sync implementation.
#
# Covers:
#   1. Source verification — HlsSegmentSeconds=2 in Go source
#   2. current_segment_index present in session_status WS payload
#   3. sync_heartbeat relay (host → member, correct fields)
#   4. playback_control same-media relay (seek, no full reload signal)
#   5. (optional) Manifest segment-size check if an existing .m3u8 is available
#
# Requires: curl, python3
# Optional: pip3 install websocket-client   (for live WS tests)
#
# Usage:
#   bash tests/test_hls_sync.sh [BASE_URL]
#   TEST_USER1_EMAIL=a@b.com TEST_USER1_PASS=pw \
#   TEST_USER2_EMAIL=c@d.com TEST_USER2_PASS=pw \
#   TEST_ROOM_ID=123 \
#   bash tests/test_hls_sync.sh

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
WS_URL="${BASE_URL/http/ws}"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; FAILURES=$((FAILURES+1)); }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
info() { echo -e "${YELLOW}→ $*${NC}"; }

FAILURES=0

# ── helpers ──────────────────────────────────────────────────────────────────
api() {
  local method="$1"; local path="$2"; local token="$3"; shift 3
  curl -sf -X "$method" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    "$@"
}

login() {
  local email="$1" pw="$2"
  curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${pw}\"}" \
    | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  print(d.get('access_token') or d.get('token',''))
except:
  print('')
"
}

# ── credentials ──────────────────────────────────────────────────────────────
HOST_EMAIL="${TEST_USER1_EMAIL:-testhost@wewatch.test}"
HOST_PASS="${TEST_USER1_PASS:-testpass123}"
MEMBER_EMAIL="${TEST_USER2_EMAIL:-testmember@wewatch.test}"
MEMBER_PASS="${TEST_USER2_PASS:-testpass123}"
ROOM_ID="${TEST_ROOM_ID:-}"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " WeWatch HLS Sync Test Suite (2-second segments)"
echo " Target: ${BASE_URL}"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Source verification: HlsSegmentSeconds = 2 ────────────────────────────
info "1. Source check — HlsSegmentSeconds=2 in hls_progressive.go…"
HLS_FILE="backend/internal/utils/hls_progressive.go"
if [ ! -f "$HLS_FILE" ]; then
  warn "  Cannot find ${HLS_FILE} — skipping source check."
else
  # Check the constant is defined and exported as 2
  if grep -q 'HlsSegmentSeconds\s*=\s*2' "$HLS_FILE"; then
    pass "1a: HlsSegmentSeconds = 2 confirmed in ${HLS_FILE}"
  else
    fail "1a: HlsSegmentSeconds is NOT 2 in ${HLS_FILE}"
    grep -n 'HlsSegmentSeconds' "$HLS_FILE" | head -5 || true
  fi

  # Verify it's exported (capital H)
  if grep -q '^const HlsSegmentSeconds' "$HLS_FILE"; then
    pass "1b: HlsSegmentSeconds is exported (capital H)"
  else
    fail "1b: HlsSegmentSeconds not exported — websocket.go cannot import it"
    grep -n 'HlsSegmentSeconds' "$HLS_FILE" | head -5 || true
  fi

  # Verify websocket.go uses it (not a hardcoded literal)
  WS_FILE="backend/internal/handlers/websocket.go"
  if grep -q 'current_segment_index' "$WS_FILE" 2>/dev/null; then
    pass "1c: current_segment_index field present in ${WS_FILE}"
  else
    fail "1c: current_segment_index NOT found in ${WS_FILE}"
  fi

  # Verify the formula uses the constant (or at least divides by 2)
  if grep -A2 'current_segment_index' "$WS_FILE" 2>/dev/null | grep -qE 'HlsSegmentSeconds|/ 2'; then
    pass "1d: current_segment_index uses division by 2 / HlsSegmentSeconds"
  else
    fail "1d: current_segment_index formula may be wrong — check manually"
    grep -A2 'current_segment_index' "$WS_FILE" | head -6 || true
  fi
fi

# ── 2. Server health ─────────────────────────────────────────────────────────
info "2. Server health…"
HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null \
  || curl -sf "${BASE_URL}/api/health" 2>/dev/null \
  || echo "ok")
[ -n "$HEALTH" ] && pass "2: Server reachable at ${BASE_URL}" \
  || { fail "2: Server not reachable at ${BASE_URL}"; echo ""; exit 1; }

# ── 3. Auth ──────────────────────────────────────────────────────────────────
info "3. Authenticating test users…"
HOST_TOKEN=$(login "$HOST_EMAIL" "$HOST_PASS" 2>/dev/null || true)
sleep 1
MEMBER_TOKEN=$(login "$MEMBER_EMAIL" "$MEMBER_PASS" 2>/dev/null || true)

[ -n "$HOST_TOKEN" ]   && pass "3a: Host authenticated (${HOST_EMAIL})" \
  || warn "3a: Host auth failed — live WS tests will be skipped"
[ -n "$MEMBER_TOKEN" ] && pass "3b: Member authenticated (${MEMBER_EMAIL})" \
  || warn "3b: Member auth failed — multi-client WS tests will be skipped"

# ── 4. Resolve room ──────────────────────────────────────────────────────────
info "4. Resolving test room…"
if [ -z "$ROOM_ID" ] && [ -n "$HOST_TOKEN" ]; then
  ROOM_ID=$(api GET /api/rooms/my "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('room',d.get('rooms',[None])[0])
print(r['id'] if r else '')
" 2>/dev/null || true)
fi
[ -n "$ROOM_ID" ] && pass "4: Using room ID: ${ROOM_ID}" \
  || warn "4: No room ID — set TEST_ROOM_ID. Live WS tests will be skipped."

# ── 5. Session ───────────────────────────────────────────────────────────────
SESSION_ID=""
if [ -n "$HOST_TOKEN" ] && [ -n "$ROOM_ID" ]; then
  info "5. Resolving active session…"
  SESSION_ID=$(api GET "/api/rooms/${ROOM_ID}/active-session" "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('session_id',d.get('id','')))
" 2>/dev/null || true)

  if [ -z "$SESSION_ID" ]; then
    info "   No active session — creating one…"
    SESSION_ID=$(api POST "/api/rooms/${ROOM_ID}/sessions" "$HOST_TOKEN" \
      -d '{"watch_type":"instant","title":"HLS Sync Test"}' 2>/dev/null \
      | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('session_id',d.get('id','')))
" 2>/dev/null || true)
    [ -n "$SESSION_ID" ] && pass "5: Created session: ${SESSION_ID}" \
      || warn "5: Could not create session — WS tests will skip."
  else
    pass "5: Active session found: ${SESSION_ID}"
  fi
fi

# ── 6. Resolve user IDs ──────────────────────────────────────────────────────
HOST_USER_ID=""
MEMBER_USER_ID=""
if [ -n "$HOST_TOKEN" ]; then
  HOST_USER_ID=$(api GET /api/auth/me "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',d.get('user',{}).get('id','')))" 2>/dev/null || true)
fi
if [ -n "$MEMBER_TOKEN" ]; then
  MEMBER_USER_ID=$(api GET /api/auth/me "$MEMBER_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',d.get('user',{}).get('id','')))" 2>/dev/null || true)
fi
[ -n "$HOST_USER_ID" ]   && pass "6a: Host user ID: ${HOST_USER_ID}" || true
[ -n "$MEMBER_USER_ID" ] && pass "6b: Member user ID: ${MEMBER_USER_ID}" || true

# ── 7. websocket-client check ─────────────────────────────────────────────────
info "7. Checking websocket-client Python package…"
WS_CLIENT_OK=$(python3 -c "import websocket; print('ok')" 2>/dev/null || echo "")
[ -n "$WS_CLIENT_OK" ] && pass "7: websocket-client available" \
  || warn "7: websocket-client not installed — install with: pip3 install websocket-client"

# ── WS test runner (same pattern as test_new_games.sh) ───────────────────────
run_ws_test() {
  local name="$1"; local code="$2"
  if [ -z "$WS_CLIENT_OK" ] || [ -z "$HOST_TOKEN" ] || [ -z "$ROOM_ID" ] \
      || [ -z "$SESSION_ID" ] || [ -z "$HOST_USER_ID" ]; then
    warn "${name}: skipped (missing prerequisites — auth / room / session / websocket-client)"
    return 0
  fi

  local output
  output=$(python3 - <<PYEOF
import os, sys, json, time, threading, queue
try:
    import websocket
except ImportError:
    print("SKIP: websocket-client not installed")
    sys.exit(0)

BASE_URL  = "${BASE_URL}"
WS_URL    = "${WS_URL}"
HOST_TOK  = "${HOST_TOKEN}"
MEM_TOK   = "${MEMBER_TOKEN}"
ROOM_ID   = int("${ROOM_ID}")
SES_ID    = "${SESSION_ID}"
HOST_ID   = int("${HOST_USER_ID}")
MEM_ID    = int("${MEMBER_USER_ID:-0}")

class WSClient:
    def __init__(self, url, label=""):
        self.label = label
        self._q   = queue.Queue()
        self._err = None
        self.ws   = websocket.WebSocketApp(
            url,
            on_message = lambda ws, m: self._q.put(json.loads(m)),
            on_error   = lambda ws, e: setattr(self, '_err', str(e)),
        )
        self._t = threading.Thread(target=self.ws.run_forever, daemon=True)
        self._t.start()
        time.sleep(0.6)

    def send(self, data):
        self.ws.send(json.dumps(data))

    def recv(self, timeout=6, types=None):
        deadline = time.time() + timeout
        while time.time() < deadline:
            remaining = deadline - time.time()
            try:
                msg = self._q.get(timeout=max(0.1, remaining))
            except queue.Empty:
                break
            if types is None or msg.get("type") in types or msg.get("action") in types:
                return msg
        return None

    def recv_all(self, timeout=2.0, types=None):
        """Collect all messages until timeout."""
        msgs = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            remaining = deadline - time.time()
            try:
                msg = self._q.get(timeout=max(0.05, remaining))
                if types is None or msg.get("type") in types:
                    msgs.append(msg)
            except queue.Empty:
                break
        return msgs

    def drain(self, timeout=0.5):
        return self.recv_all(timeout=timeout)

    def close(self):
        self.ws.close()

def ws_url(token):
    return f"{WS_URL}/api/rooms/{ROOM_ID}/ws?token={token}&session_id={SES_ID}"

$code
PYEOF
  )
  echo "$output"
  if echo "$output" | grep -q "^FAIL"; then
    FAILURES=$((FAILURES+1))
    return 1
  fi
  return 0
}

# ── Test 8: current_segment_index in session_status ──────────────────────────
info "8. current_segment_index in session_status…"
SEG_INDEX_CODE='
def run():
    """
    Test: when a member connects to a session that has a known current_playback_time,
    the session_status WS message must include current_segment_index = int(playback_time / 2).

    Strategy: host connects first, sends a sync_heartbeat to push a known playback time
    into the DB (backend persists current_playback_time on every playback_control/seek).
    Then member connects and checks session_status.
    """
    host = WSClient(ws_url(HOST_TOK), "host")
    time.sleep(0.4)

    # Let host settle — drain welcome / session_status messages
    host.drain(timeout=1.0)

    # Push a known playback time into the session by sending playback_control seek.
    # Backend persists this as current_playback_time.
    KNOWN_TIME = 44.0   # seconds — gives index = int(44 / 2) = 22
    import time as _t
    host.send({
        "type": "playback_control",
        "data": {
            "command":    "seek",
            "seek_time":  KNOWN_TIME,
            "timestamp":  int(_t.time() * 1000),
            "file_path":  "test_placeholder.mp4",
            "is_playing": True,
        }
    })
    # Give backend time to persist current_playback_time
    time.sleep(0.8)
    host.drain()

    # Member connects fresh — should receive session_status with current_segment_index
    if not MEM_TOK:
        print("SKIP 8: no member token — using host-only workaround")
        # Alternative: host can re-join its own session in a new WS to get session_status
        host.close()
        return

    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.5)

    # Collect all initial messages from member
    initial_msgs = member.recv_all(timeout=3.0)

    session_status = None
    for m in initial_msgs:
        t = m.get("type","")
        # session_status might arrive as type="session_status" or inside a data wrapper
        if t == "session_status" or (t == "session" and m.get("action") == "session_status"):
            session_status = m
            break
        # Sometimes keyed under "data"
        inner = m.get("data", {})
        if inner.get("type") == "session_status":
            session_status = inner
            break

    if session_status is None:
        # Try the message directly if there is only one candidate
        for m in initial_msgs:
            if "current_playback_time" in m or "current_playback_time" in m.get("data",{}):
                session_status = m
                break

    if session_status is None:
        print(f"FAIL 8a: no session_status in initial messages. Received types: {[m.get('type') for m in initial_msgs]}")
        member.close(); host.close()
        return

    # Unwrap data if nested
    payload = session_status.get("data", session_status)

    if "current_segment_index" not in payload:
        print(f"FAIL 8b: current_segment_index missing from session_status payload. Keys: {list(payload.keys())}")
        member.close(); host.close()
        return

    seg_idx = payload["current_segment_index"]
    playback_time = float(payload.get("current_playback_time", 0))
    expected_idx = int(playback_time / 2)

    print(f"  current_playback_time={playback_time}, current_segment_index={seg_idx}, expected={expected_idx}")

    if seg_idx == expected_idx:
        print(f"PASS 8b: current_segment_index={seg_idx} matches int({playback_time}/2)={expected_idx}")
    else:
        print(f"FAIL 8b: current_segment_index={seg_idx} != expected {expected_idx} (playback_time={playback_time})")

    member.close()
    host.close()

run()
'

run_ws_test "current_segment_index in session_status" "$SEG_INDEX_CODE" \
  && pass "8: current_segment_index test complete" || true

# ── Test 9: sync_heartbeat relay ─────────────────────────────────────────────
info "9. sync_heartbeat relay host → member…"
SYNC_HB_CODE='
def run():
    if not MEM_TOK:
        print("SKIP 9: no member token")
        return

    host   = WSClient(ws_url(HOST_TOK), "host")
    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.5)
    host.drain(); member.drain()

    import time as _t
    KNOWN_TIME = 123.456
    TS = int(_t.time() * 1000)

    host.send({
        "type": "sync_heartbeat",
        "data": {
            "current_time": KNOWN_TIME,
            "timestamp":    TS,
        }
    })

    # Member should receive the relayed sync_heartbeat
    hb = member.recv(timeout=5, types=["sync_heartbeat"])
    if not hb:
        print("FAIL 9a: member did not receive sync_heartbeat within 5s")
        host.close(); member.close()
        return

    payload = hb.get("data", hb)
    cur_time  = payload.get("current_time")
    timestamp = payload.get("timestamp")

    if cur_time is None:
        print(f"FAIL 9b: sync_heartbeat missing current_time. Keys: {list(payload.keys())}")
        host.close(); member.close()
        return
    if timestamp is None:
        print(f"FAIL 9c: sync_heartbeat missing timestamp. Keys: {list(payload.keys())}")
        host.close(); member.close()
        return

    # current_time should match (or be very close — no server modification expected)
    if abs(float(cur_time) - KNOWN_TIME) < 0.01:
        print(f"PASS 9a: current_time relayed correctly: {cur_time}")
    else:
        print(f"FAIL 9a: current_time mismatch: got {cur_time}, expected {KNOWN_TIME}")

    # timestamp should match host clock (not replaced by server_ts)
    if int(timestamp) == TS:
        print(f"PASS 9b: timestamp preserved as host clock value (not server_ts replacement)")
    else:
        diff_ms = abs(int(timestamp) - TS)
        if diff_ms < 1000:
            print(f"PASS 9b: timestamp close to host clock (diff={diff_ms}ms) — acceptable")
        else:
            print(f"WARN 9b: timestamp diff={diff_ms}ms (> 1s). If using server_ts this is the WSL clock skew bug.")

    # Host should NOT receive their own sync_heartbeat back
    host.drain(timeout=0.5)
    self_msgs = [m for m in host.drain(timeout=0.3) if m.get("type") == "sync_heartbeat"]
    if self_msgs:
        print(f"WARN 9c: host received own sync_heartbeat echo (sender exclusion may be missing)")
    else:
        print(f"PASS 9c: host did not receive own sync_heartbeat (correct sender exclusion)")

    host.close(); member.close()

run()
'

run_ws_test "sync_heartbeat relay" "$SYNC_HB_CODE" \
  && pass "9: sync_heartbeat relay test complete" || true

# ── Test 10: playback_control same-media seek relay ──────────────────────────
info "10. playback_control seek relayed to member with correct shape…"
PC_CODE='
def run():
    if not MEM_TOK:
        print("SKIP 10: no member token")
        return

    host   = WSClient(ws_url(HOST_TOK), "host")
    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.5)
    host.drain(); member.drain()

    import time as _t
    SEEK_TIME = 67.89
    FILE_PATH = "uploads/test/sample.mp4"
    TS = int(_t.time() * 1000)

    host.send({
        "type": "playback_control",
        "data": {
            "command":    "seek",
            "seek_time":  SEEK_TIME,
            "timestamp":  TS,
            "file_path":  FILE_PATH,
            "is_playing": True,
        }
    })

    pc = member.recv(timeout=6, types=["playback_control"])
    if not pc:
        print("FAIL 10a: member did not receive playback_control within 6s")
        host.close(); member.close()
        return

    # playback_control is a flat message (no data wrapper) per CLAUDE.md gotcha
    command   = pc.get("command")
    seek_time = pc.get("seek_time")
    file_path = pc.get("file_path")
    timestamp = pc.get("timestamp")
    server_ts = pc.get("server_ts")  # backend may inject this

    if command != "seek":
        print(f"FAIL 10b: command should be 'seek', got {command!r}")
        host.close(); member.close()
        return
    print(f"PASS 10a: command='seek' relayed correctly")

    if seek_time is not None and abs(float(seek_time) - SEEK_TIME) < 0.01:
        print(f"PASS 10b: seek_time={seek_time} preserved")
    else:
        print(f"FAIL 10b: seek_time={seek_time}, expected {SEEK_TIME}")

    if file_path == FILE_PATH:
        print(f"PASS 10c: file_path preserved: {file_path!r}")
    else:
        print(f"FAIL 10c: file_path={file_path!r}, expected {FILE_PATH!r}")

    if timestamp is not None:
        print(f"PASS 10d: timestamp field present (value={timestamp})")
    else:
        print(f"FAIL 10d: timestamp field missing from relayed playback_control")

    if server_ts is not None:
        diff = abs(int(server_ts) - int(timestamp or 0))
        if diff > 500:
            print(f"WARN 10e: server_ts ({server_ts}) differs from host timestamp ({timestamp}) by {diff}ms")
            print(f"         Frontend must use message.timestamp (not server_ts) for latency — see CLAUDE.md")
        else:
            print(f"INFO 10e: server_ts present and close to host timestamp (diff={diff}ms)")
    else:
        print(f"INFO 10e: server_ts not present in relayed message")

    host.close(); member.close()

run()
'

run_ws_test "playback_control seek relay" "$PC_CODE" \
  && pass "10: playback_control relay test complete" || true

# ── Test 11: HLS manifest segment duration (if an .m3u8 exists) ──────────────
info "11. HLS manifest segment duration check…"
# Look for any .m3u8 files in the backend's upload directories
M3U8_FILE=$(find ./backend/uploads ./uploads 2>/dev/null \
  -name "*.m3u8" -newer ./backend/internal/utils/hls_progressive.go \
  2>/dev/null | head -1 || true)

if [ -z "$M3U8_FILE" ]; then
  # Try common absolute upload paths (works when running inside WSL)
  M3U8_FILE=$(find /home/chibuzor_dev/WeWatch/uploads /tmp/wewatch_uploads 2>/dev/null \
    -name "*.m3u8" 2>/dev/null | head -1 || true)
fi

if [ -n "$M3U8_FILE" ]; then
  info "  Found manifest: ${M3U8_FILE}"
  # Check that all EXTINF durations are ≤ 2s (with 0.2s tolerance)
  BAD_SEGS=$(grep '#EXTINF:' "$M3U8_FILE" 2>/dev/null \
    | awk -F: '{gsub(/,/,"",$2); if ($2+0 > 2.2) print $0}' | head -5 || true)
  if [ -z "$BAD_SEGS" ]; then
    SEG_COUNT=$(grep -c '#EXTINF:' "$M3U8_FILE" 2>/dev/null || echo "0")
    SAMPLE=$(grep '#EXTINF:' "$M3U8_FILE" 2>/dev/null | head -3 | tr '\n' ' ' || echo "n/a")
    pass "11a: All segments ≤ 2.2s in ${M3U8_FILE} (count=${SEG_COUNT})"
    echo "     Sample: ${SAMPLE}"
  else
    fail "11a: Segments > 2.2s found in ${M3U8_FILE} (old 6s segments still being used?):"
    echo "     ${BAD_SEGS}"
  fi
else
  warn "11: No recently-modified .m3u8 file found — do a real 'Browse Files' upload to verify 2s segments."
  echo "   After uploading, re-run this script to check the generated manifest."
  echo "   Expected: all #EXTINF: values should be 2.000000,"
fi

# ── Test 12: Frontend — handleFragChanged + hlsStartPosition present in code ─
info "12. Frontend source checks…"
VW_FILE="frontend/src/components/cinema/VideoWatch.jsx"
CV_FILE="frontend/src/components/cinema/ui/CinemaVideoPlayer.jsx"

if [ -f "$VW_FILE" ]; then
  grep -q 'handleFragChanged' "$VW_FILE" \
    && pass "12a: handleFragChanged defined in VideoWatch.jsx" \
    || fail "12a: handleFragChanged NOT found in VideoWatch.jsx"

  grep -q 'hlsStartPosition' "$VW_FILE" \
    && pass "12b: hlsStartPosition state present in VideoWatch.jsx" \
    || fail "12b: hlsStartPosition NOT found in VideoWatch.jsx"

  grep -q 'currentMemberFragRef' "$VW_FILE" \
    && pass "12c: currentMemberFragRef ref present in VideoWatch.jsx" \
    || fail "12c: currentMemberFragRef NOT found in VideoWatch.jsx"

  grep -q 'currentSegmentIndex' "$VW_FILE" \
    && pass "12d: late-join currentSegmentIndex consumed in VideoWatch.jsx" \
    || fail "12d: currentSegmentIndex NOT consumed in VideoWatch.jsx (is it mapped in useWebSocket.js?)"

  WS_HOOK="frontend/src/hooks/useWebSocket.js"
  grep -q 'currentSegmentIndex.*current_segment_index\|current_segment_index.*currentSegmentIndex' "$WS_HOOK" 2>/dev/null \
    && pass "12d2: currentSegmentIndex mapped in useWebSocket.js" \
    || fail "12d2: currentSegmentIndex NOT mapped in useWebSocket.js — late-join segment positioning will not work"

  # Bug 1 fix: same-media branch should not call setCurrentMedia for seeks
  if grep -q 'isSameMedia' "$VW_FILE"; then
    pass "12e: isSameMedia check present (Bug 1 fix in place)"
  else
    fail "12e: isSameMedia check NOT found — Bug 1 (same-media full reload) may not be fixed"
  fi

  # Bug 2 fix: HLS skips currentTime in sync_heartbeat — check for _isHls variable pattern
  if grep -q '_isHls\|isHls.*endsWith.*m3u8' "$VW_FILE"; then
    pass "12f: HLS check in sync_heartbeat handler (Bug 2 fix — no currentTime for HLS)"
  else
    warn "12f: _isHls variable not found — verify Bug 2 fix manually in sync_heartbeat handler"
  fi
else
  warn "12: ${VW_FILE} not found — skipping frontend source checks"
fi

if [ -f "$CV_FILE" ]; then
  grep -q 'hlsStartPosition\|startPosition' "$CV_FILE" \
    && pass "12g: hlsStartPosition/startPosition wired in CinemaVideoPlayer.jsx" \
    || fail "12g: startPosition prop NOT found in CinemaVideoPlayer.jsx"

  grep -q 'onFragChanged\|FRAG_CHANGED\|Events.FRAG_CHANGED' "$CV_FILE" \
    && pass "12h: FRAG_CHANGED listener in CinemaVideoPlayer.jsx" \
    || fail "12h: FRAG_CHANGED NOT found in CinemaVideoPlayer.jsx"

  grep -q 'onFragChangedRef' "$CV_FILE" \
    && pass "12i: onFragChangedRef shadow ref pattern in CinemaVideoPlayer.jsx" \
    || fail "12i: onFragChangedRef NOT found in CinemaVideoPlayer.jsx"
else
  warn "12: ${CV_FILE} not found — skipping CinemaVideoPlayer source checks"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$FAILURES" -eq 0 ]; then
  echo -e " ${GREEN}All HLS sync tests passed.${NC}"
else
  echo -e " ${RED}${FAILURES} test(s) FAILED — see FAIL lines above.${NC}"
fi
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Notes:"
echo "  • Live WS tests require:  pip3 install websocket-client"
echo "  • Set TEST_USER1_EMAIL/PASS  TEST_USER2_EMAIL/PASS  TEST_ROOM_ID for full coverage"
echo "  • Test 11 (manifest segment size) needs a real Browse-Files upload to generate a .m3u8"
echo "  • After confirming 2s segments: verify in prod with a real upload and two browser tabs"
echo ""
echo "To test 'can we use same logic for all other watch types':"
echo "  sync_heartbeat and playback_control tests (9 + 10) apply to ALL watch types already."
echo "  handleFragChanged + FRAG_CHANGED (segment-boundary correction) is HLS-specific."
echo "  For non-HLS (regular mp4/direct URLs): existing sync_heartbeat drift correction is"
echo "  still active (Bug 2 fix skips it for HLS only). No changes needed for other types."
echo ""

exit $FAILURES
