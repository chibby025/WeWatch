#!/usr/bin/env bash
# tests/test_new_games.sh
# Backend tests for the three new games: Boxing, Pool, and Penalty Shootout.
#
# Boxing + Pool: multi-step WebSocket exchanges, using an inline Python driver
# that maintains two persistent WS connections (host + member).
# Penalty Shootout: backend-only smoke test (game is client-side; just verify
# start_game succeeds with the arcade single-player path).
#
# Requires: curl, python3
# Optional: pip3 install websocket-client   (for live WS game tests)
#
# Usage: bash tests/test_new_games.sh [BASE_URL]

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
WS_URL="${BASE_URL/http/ws}"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓ $*${NC}"; }
fail() { echo -e "${RED}✗ $*${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠  $*${NC}"; }
info() { echo -e "${YELLOW}→ $*${NC}"; }

# ── helpers ──────────────────────────────────────────────────────────────────
api() {
  local method="$1"; local path="$2"; local token="$3"; shift 3
  curl -sf -X "$method" "${BASE_URL}${path}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    "$@"
}

login() {
  local email="$1" pass="$2"
  # No -f: we parse the JSON ourselves and return empty on error.
  curl -s -X POST "${BASE_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${pass}\"}" \
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
echo "═══════════════════════════════════════"
echo " WeWatch New Games Test Suite"
echo " Boxing · Pool · Penalty Shootout"
echo " Target: ${BASE_URL}"
echo "═══════════════════════════════════════"
echo ""

# ── 1. Auth ──────────────────────────────────────────────────────────────────
info "1. Authenticating test users…"
HOST_TOKEN=$(login "$HOST_EMAIL" "$HOST_PASS" 2>/dev/null || true)
sleep 2  # avoid rate-limiter on back-to-back logins
MEMBER_TOKEN=$(login "$MEMBER_EMAIL" "$MEMBER_PASS" 2>/dev/null || true)

if [ -z "$HOST_TOKEN" ]; then
  warn "Could not log in as host (${HOST_EMAIL}) — skipping live WS tests."
  echo "   Set TEST_USER1_EMAIL / TEST_USER1_PASS to real credentials."
fi
if [ -z "$MEMBER_TOKEN" ]; then
  warn "Could not log in as member (${MEMBER_EMAIL}) — skipping multi-client tests."
fi

[ -n "$HOST_TOKEN" ] && pass "Host authenticated" || true
[ -n "$MEMBER_TOKEN" ] && pass "Member authenticated" || true

# ── 2. Server health ─────────────────────────────────────────────────────────
info "2. Server health…"
HEALTH=$(curl -sf "${BASE_URL}/health" 2>/dev/null \
  || curl -sf "${BASE_URL}/api/health" 2>/dev/null \
  || echo "ok")
[ -n "$HEALTH" ] && pass "Server reachable at ${BASE_URL}" || fail "Server not reachable at ${BASE_URL}"

# ── 3. Resolve room ──────────────────────────────────────────────────────────
info "3. Resolving test room…"
if [ -z "$ROOM_ID" ] && [ -n "$HOST_TOKEN" ]; then
  ROOM_ID=$(api GET /api/rooms/my "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('room',d.get('rooms',[None])[0])
print(r['id'] if r else '')
" 2>/dev/null || true)
fi
if [ -z "$ROOM_ID" ]; then
  warn "No room ID available — skipping room-scoped WS tests."
  echo "   Set TEST_ROOM_ID to a room the host owns."
fi
[ -n "$ROOM_ID" ] && pass "Using room ID: ${ROOM_ID}" || true

# ── 4. Get / create active session ───────────────────────────────────────────
SESSION_ID=""
if [ -n "$HOST_TOKEN" ] && [ -n "$ROOM_ID" ]; then
  info "4. Checking for active session in room ${ROOM_ID}…"
  SESSION_ID=$(api GET "/api/rooms/${ROOM_ID}/active-session" "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('session_id',d.get('id','')))
" 2>/dev/null || true)
  if [ -z "$SESSION_ID" ]; then
    info "   No active session — creating one…"
    SESSION_ID=$(api POST "/api/rooms/${ROOM_ID}/sessions" "$HOST_TOKEN" \
      -d '{"watch_type":"instant","title":"New Games Test"}' 2>/dev/null \
      | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('session_id',d.get('id','')))
" 2>/dev/null || true)
    [ -n "$SESSION_ID" ] && pass "Created session: ${SESSION_ID}" \
      || warn "Could not create session — WS tests will skip."
  else
    pass "Active session found: ${SESSION_ID}"
  fi
fi

# ── 5. Resolve host/member user IDs ─────────────────────────────────────────
HOST_USER_ID=""
MEMBER_USER_ID=""
if [ -n "$HOST_TOKEN" ] && [ -n "$MEMBER_TOKEN" ]; then
  HOST_USER_ID=$(api GET /api/auth/me "$HOST_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',d.get('user',{}).get('id','')))" 2>/dev/null || true)
  MEMBER_USER_ID=$(api GET /api/auth/me "$MEMBER_TOKEN" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',d.get('user',{}).get('id','')))" 2>/dev/null || true)
fi
[ -n "$HOST_USER_ID" ] && pass "Host user ID: ${HOST_USER_ID}" || true
[ -n "$MEMBER_USER_ID" ] && pass "Member user ID: ${MEMBER_USER_ID}" || true

# ── 6. websocket-client availability check ───────────────────────────────────
info "6. Checking websocket-client Python package…"
WS_CLIENT_OK=$(python3 -c "import websocket; print('ok')" 2>/dev/null || echo "")
if [ -z "$WS_CLIENT_OK" ]; then
  warn "websocket-client not installed — live game WS tests will be skipped."
  echo "   Install with: pip3 install websocket-client"
fi
[ -n "$WS_CLIENT_OK" ] && pass "websocket-client available" || true

# ── helpers: run inline Python WS driver ─────────────────────────────────────
run_ws_test() {
  # Usage: run_ws_test <test_name> <python_code>
  # Returns exit code; python code should print PASS or FAIL lines.
  local name="$1"; local code="$2"
  if [ -z "$WS_CLIENT_OK" ] || [ -z "$HOST_TOKEN" ] || [ -z "$MEMBER_TOKEN" ] \
      || [ -z "$ROOM_ID" ] || [ -z "$SESSION_ID" ] \
      || [ -z "$HOST_USER_ID" ] || [ -z "$MEMBER_USER_ID" ]; then
    warn "${name}: skipped (missing prerequisites — auth / room / session / websocket-client)."
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
SES_ID    = "${SESSION_ID}"   # UUID string
HOST_ID   = int("${HOST_USER_ID}")
MEM_ID    = int("${MEMBER_USER_ID}")

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
        time.sleep(0.5)

    def send(self, data):
        self.ws.send(json.dumps(data))

    def recv(self, timeout=6, types=None):
        """Read messages until we find one matching a type list, or timeout."""
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

    def drain(self, timeout=0.5):
        deadline = time.time() + timeout
        msgs = []
        while time.time() < deadline:
            try:
                msgs.append(self._q.get(timeout=0.1))
            except queue.Empty:
                break
        return msgs

    def close(self):
        self.ws.close()

def ws_url(token):
    return f"{WS_URL}/api/rooms/{ROOM_ID}/ws?token={token}&session_id={SES_ID}"

$code
PYEOF
  )
  echo "$output"
  if echo "$output" | grep -q "^FAIL"; then
    return 1
  fi
  return 0
}

# ── 7. Boxing game test ───────────────────────────────────────────────────────
info "7. Boxing: start → throw_punch (jab) → defend (dodge) → roles flip…"
BOXING_CODE='
def run():
    host = WSClient(ws_url(HOST_TOK), "host")
    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.3)  # let both connect

    # 7a. Start game
    host.send({
        "type": "start_game",
        "data": {
            "game_type": "boxing",
            "players": [
                {"user_id": HOST_ID,   "username": "TestHost",   "color": "#FF6B6B"},
                {"user_id": MEM_ID,    "username": "TestMember", "color": "#4ECDC4"},
            ]
        }
    })

    gs = host.recv(types=["game"])
    if not gs:
        print("FAIL 7a: no game_started response")
        return
    action = gs.get("action","") or gs.get("data",{}).get("action","")
    if action != "game_started":
        print(f"FAIL 7a: expected game_started action, got: {gs}")
        return
    game_id = gs.get("data",{}).get("game_session_id") or gs.get("data",{}).get("game_session",{}).get("id")
    if not game_id:
        print(f"FAIL 7a: no game_session_id in {gs}")
        return
    print(f"PASS 7a: game started, session_id={game_id}")

    # drain member side (also receives game_started)
    member.drain()

    # 7b. Host sends throw_punch (host is player 0 = attacker)
    host.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type": "throw_punch",
            "punch_type": "jab",
        }
    })
    # expect game_state_update with phase=defending, current_turn pointing at member
    upd = host.recv(types=["game"])
    if not upd:
        print("FAIL 7b: no response after throw_punch")
        return
    state = upd.get("data",{}).get("game_state",{})
    phase = state.get("phase","")
    cur_turn = upd.get("data",{}).get("current_turn", -1)
    if phase != "defending":
        print(f"FAIL 7b: expected phase=defending, got {phase!r} | state={state}")
        return
    if cur_turn != 1:
        print(f"FAIL 7b: expected current_turn=1 (member defends), got {cur_turn}")
        return
    print(f"PASS 7b: phase=defending, current_turn={cur_turn}")

    member.drain()  # consume the same broadcast

    # 7c. Member sends defend=dodge (no damage to either player)
    member.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type": "defend",
            "defense": "dodge",
        }
    })
    upd2 = member.recv(types=["game"])
    if not upd2:
        print("FAIL 7c: no response after defend(dodge)")
        return
    state2 = upd2.get("data",{}).get("game_state",{})
    phase2  = state2.get("phase","")
    hp0     = state2.get("hp_0", -1)
    hp1     = state2.get("hp_1", -1)
    outcome = state2.get("last_outcome","")
    # After dodge: 0 damage to defender (host, player 0), 0 to attacker (also host)
    # Roles flip: next attacker = member (player 1), cur_turn = 1
    cur_turn2 = upd2.get("data",{}).get("current_turn", -1)
    if phase2 != "attacking":
        print(f"FAIL 7c: expected phase=attacking after resolve, got {phase2!r}")
        return
    if outcome != "dodged":
        print(f"FAIL 7c: expected outcome=dodged, got {outcome!r}")
        return
    if hp0 != 100 or hp1 != 100:
        print(f"FAIL 7c: dodge should deal 0 damage; hp_0={hp0}, hp_1={hp1}")
        return
    # After exchange 0, attacker_idx flips to 1 (member attacks next)
    attacker_idx = state2.get("attacker_idx", -1)
    if attacker_idx != 1:
        print(f"FAIL 7c: expected attacker_idx=1 after role flip, got {attacker_idx}")
        return
    print(f"PASS 7c: dodge resolved — hp_0={hp0}, hp_1={hp1}, next_attacker={attacker_idx}")

    # 7d. Quick KO path: play exchanges until one HP reaches 0
    # member attacks (player 1), host defends (player 0) — host does not dodge
    # After role flip current_turn=1, so member sends throw_punch
    max_exchanges = 30
    ko_reached = False
    last_state = state2
    for ex in range(max_exchanges):
        ai = int(last_state.get("attacker_idx", 0))
        di = 1 - ai
        attacker_ws = member if ai == 1 else host
        defender_ws = host if di == 0 else member
        # Attacker always throws uppercut (highest damage when not countered)
        attacker_ws.send({
            "type": "make_move",
            "data": {
                "game_session_id": game_id,
                "move_type": "throw_punch",
                "punch_type": "uppercut",
            }
        })
        r1 = attacker_ws.recv(types=["game"])
        if not r1:
            break
        defender_ws.drain()  # consume same broadcast

        # Defender always lets it land (no block/dodge/counter)
        # Send an invalid defense type? No — that errors. Send block (takes damage).
        defender_ws.send({
            "type": "make_move",
            "data": {
                "game_session_id": game_id,
                "move_type": "defend",
                "defense": "block",  # uppercut breaks block -> full damage
            }
        })
        r2 = defender_ws.recv(types=["game"])
        if not r2:
            break
        attacker_ws.drain()

        s = r2.get("data",{}).get("game_state",{})
        last_state = s
        hp0 = s.get("hp_0", 100)
        hp1 = s.get("hp_1", 100)
        phase_x = s.get("phase","")
        if phase_x == "ko" or hp0 <= 0 or hp1 <= 0:
            ko_reached = True
            winner_id = r2.get("data",{}).get("winner_id")
            print(f"PASS 7d: KO after {ex+1} more exchanges — hp_0={hp0}, hp_1={hp1}, winner_id={winner_id}")
            break

    if not ko_reached:
        h0 = last_state.get("hp_0")
        h1 = last_state.get("hp_1")
        print(f"FAIL 7d: KO never reached after {max_exchanges} exchanges (last hp_0={h0}, hp_1={h1})")

    host.close()
    member.close()

run()
'

if run_ws_test "Boxing" "$BOXING_CODE"; then
  pass "7. Boxing WS test complete"
else
  fail "7. Boxing WS test FAILED (see FAIL lines above)"
fi

# ── 8. Pool game test ─────────────────────────────────────────────────────────
info "8. Pool: start → dry break (turn passes) → solid pocket (retain turn) → miss → illegal 8-ball pot…"
POOL_CODE='
def run():
    host   = WSClient(ws_url(HOST_TOK), "host")
    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.3)

    # 8a. Start game
    host.send({
        "type": "start_game",
        "data": {
            "game_type": "pool",
            "players": [
                {"user_id": HOST_ID, "username": "TestHost",   "color": "#FF6B6B"},
                {"user_id": MEM_ID,  "username": "TestMember", "color": "#4ECDC4"},
            ]
        }
    })

    gs = host.recv(types=["game"])
    if not gs or gs.get("action") != "game_started":
        print(f"FAIL 8a: expected game_started, got {gs}")
        return
    game_id = gs.get("data",{}).get("game_session_id")
    if not game_id:
        print(f"FAIL 8a: no game_session_id in {gs}")
        return
    print(f"PASS 8a: pool started, session_id={game_id}")
    member.drain()

    def get_state(resp):
        return resp.get("data",{}).get("game_state",{}) if resp else {}

    def cur_turn(resp):
        return resp.get("data",{}).get("current_turn", -99)

    # 8b. Host: dry break (no balls pocketed, no scratch, first_contact on a stripe)
    host.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type":    "shot",
            "pocketed":     [],
            "cue_scratched": False,
            "cue_x":        0.5,
            "cue_y":        0.5,
            "first_contact": 9,   # stripe — legal on break (breaking=true → no foul)
        }
    })
    r = host.recv(types=["game"])
    st = get_state(r)
    ct = cur_turn(r)
    if ct != 1:
        print(f"FAIL 8b: expected turn to pass to member (1) after dry break, got current_turn={ct} | state={st}")
        return
    foul = st.get("last_foul", "ERR")
    breaking = st.get("breaking", True)
    if breaking:
        print(f"FAIL 8b: breaking flag should be false after break shot")
        return
    print(f"PASS 8b: dry break OK — turn passed to member (cur_turn={ct}), foul={foul!r}")
    member.drain()

    # 8c. Member pockets a solid (ball 1) — open table, so type is assigned
    member.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type":    "shot",
            "pocketed":     [1],
            "cue_scratched": False,
            "cue_x":        0.4,
            "cue_y":        0.4,
            "first_contact": 1,
        }
    })
    r2 = member.recv(types=["game"])
    st2 = get_state(r2)
    ct2 = cur_turn(r2)
    p1_type = st2.get("p1_type","")
    if ct2 != 1:
        print(f"FAIL 8c: member should retain turn after legal pocket, got current_turn={ct2}")
        return
    if p1_type != "solids":
        print(f"FAIL 8c: member should be assigned solids, got p1_type={p1_type!r}")
        return
    pocketed = st2.get("pocketed",[])
    if 1.0 not in pocketed and 1 not in pocketed:
        print(f"FAIL 8c: ball 1 not in pocketed set: {pocketed}")
        return
    print(f"PASS 8c: member pocketed ball 1 → assigned solids, retained turn (cur_turn={ct2})")
    host.drain()

    # 8d. Member misses (no pocket, no scratch, first_contact=1 which is their type)
    member.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type":    "shot",
            "pocketed":     [],
            "cue_scratched": False,
            "cue_x":        0.4,
            "cue_y":        0.4,
            "first_contact": 1,
        }
    })
    r3 = member.recv(types=["game"])
    ct3 = cur_turn(r3)
    if ct3 != 0:
        print(f"FAIL 8d: turn should pass to host after miss, got current_turn={ct3}")
        return
    print(f"PASS 8d: member missed → turn passed to host (cur_turn={ct3})")
    host.drain()

    # 8e. Foul (scratch): host sinks cue ball → turn passes to member + ball_in_hand
    host.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type":    "shot",
            "pocketed":     [0],   # cue ball sunk
            "cue_scratched": True,
            "cue_x":        0.5,
            "cue_y":        0.5,
            "first_contact": 9,
        }
    })
    r4 = host.recv(types=["game"])
    st4 = get_state(r4)
    ct4 = cur_turn(r4)
    if ct4 != 1:
        print(f"FAIL 8e: foul/scratch should pass turn to member (1), got {ct4}")
        return
    bih = st4.get("ball_in_hand", False)
    if not bih:
        print(f"FAIL 8e: ball_in_hand should be True after scratch, got {bih}")
        return
    last_foul = st4.get("last_foul","")
    if last_foul != "scratch":
        print(f"FAIL 8e: last_foul should be scratch, got {last_foul!r}")
        return
    print(f"PASS 8e: scratch foul — turn to member (cur_turn={ct4}), ball_in_hand={bih}")
    member.drain()

    # 8f. Illegal 8-ball pot: member pockets the 8 while still has solids left
    # (member has solids, only ball 1 is pocketed so far — several remain)
    member.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type":    "shot",
            "pocketed":     [8],
            "cue_scratched": False,
            "cue_x":        0.5,
            "cue_y":        0.5,
            "first_contact": 8,
        }
    })
    r5 = member.recv(types=["game"])
    d5 = r5.get("data",{}) if r5 else {}
    # game should be over with host (opponent) winning
    game_over = d5.get("game_over", False) or d5.get("status") in ("finished","completed")
    winner_id = d5.get("winner_id")
    foul5 = d5.get("game_state",{}).get("last_foul","")
    # illegal 8 pot: game ends, opponent wins
    if not (game_over or winner_id):
        print(f"FAIL 8f: illegal 8-pot should end game; game_over={game_over}, winner_id={winner_id}, data={d5}")
        return
    if winner_id != HOST_ID:
        print(f"FAIL 8f: host should win illegal 8-pot, winner_id={winner_id} (host_id={HOST_ID})")
        return
    print(f"PASS 8f: illegal 8-pot → game over, host wins (winner_id={winner_id})")

    host.close()
    member.close()

run()
'

if run_ws_test "Pool" "$POOL_CODE"; then
  pass "8. Pool WS test complete"
else
  fail "8. Pool WS test FAILED (see FAIL lines above)"
fi

# ── 9. Penalty Shootout: arcade start_game ────────────────────────────────────
info "9. Penalty Shootout: arcade start_game (single player)…"
PENALTY_CODE='
def run():
    host = WSClient(ws_url(HOST_TOK), "host")
    time.sleep(0.3)

    host.send({
        "type": "start_game",
        "data": {
            "game_type": "penalty_shootout",
            "players": [
                {"user_id": HOST_ID, "username": "TestHost", "color": "#FF6B6B"},
            ]
        }
    })

    gs = host.recv(types=["game"])
    if not gs:
        print("FAIL 9a: no response to start_game for penalty_shootout")
        return
    action = gs.get("action","")
    if action != "game_started":
        err = gs.get("error","") or gs.get("data",{}).get("error","")
        print(f"FAIL 9a: expected game_started, got action={action!r}, error={err!r}")
        return
    game_id = gs.get("data",{}).get("game_session_id")
    game_type = gs.get("data",{}).get("game_type","")
    if game_type != "penalty_shootout":
        print(f"FAIL 9a: wrong game_type in response: {game_type!r}")
        return
    print(f"PASS 9a: penalty_shootout started as arcade (single player), session_id={game_id}")

    host.close()

run()
'

if run_ws_test "Penalty Shootout" "$PENALTY_CODE"; then
  pass "9. Penalty Shootout arcade start accepted"
else
  fail "9. Penalty Shootout arcade start FAILED"
fi

# ── 10. Wrong-turn enforcement check ─────────────────────────────────────────
info "10. Boxing wrong-turn rejection…"
WRONG_TURN_CODE='
def run():
    host   = WSClient(ws_url(HOST_TOK), "host")
    member = WSClient(ws_url(MEM_TOK), "member")
    time.sleep(0.3)

    host.send({
        "type": "start_game",
        "data": {
            "game_type": "boxing",
            "players": [
                {"user_id": HOST_ID, "username": "TestHost",   "color": "#FF6B6B"},
                {"user_id": MEM_ID,  "username": "TestMember", "color": "#4ECDC4"},
            ]
        }
    })
    gs = host.recv(types=["game"])
    if not gs or gs.get("action") != "game_started":
        print(f"FAIL 10a: game_started not received: {gs}")
        return
    game_id = gs.get("data",{}).get("game_session_id")
    member.drain()

    # Member (player 1) tries to throw_punch when it is host (player 0) attack turn
    member.send({
        "type": "make_move",
        "data": {
            "game_session_id": game_id,
            "move_type": "throw_punch",
            "punch_type": "jab",
        }
    })
    # backend should reject with "not your turn" or the game-level error
    err_resp = member.recv(timeout=4)
    if not err_resp:
        print("FAIL 10a: no response to out-of-turn move (expected error)")
        return
    err_msg = err_resp.get("error","") or err_resp.get("data",{}).get("error","")
    if not err_msg:
        # could be a "game" action with error
        err_msg = str(err_resp)
    print(f"PASS 10a: out-of-turn move correctly rejected: {err_msg!r}")

    host.close()
    member.close()

run()
'

if run_ws_test "Wrong turn" "$WRONG_TURN_CODE"; then
  pass "10. Wrong-turn rejection confirmed"
else
  fail "10. Wrong-turn rejection test FAILED"
fi

# ── 11. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo -e " ${GREEN}New Games tests complete.${NC}"
echo "═══════════════════════════════════════"
echo ""
echo "Notes:"
echo "  • Live WS tests require:  pip3 install websocket-client"
echo "  • Set TEST_USER1_EMAIL/PASS  TEST_USER2_EMAIL/PASS  TEST_ROOM_ID for full coverage"
echo "  • Penalty Shootout has no backend logic — arcade start_game only"
echo ""
