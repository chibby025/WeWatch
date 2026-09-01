import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// Canvas logical dimensions — same as Ping Pong (400 × 600).
const W = 400, H = 600;
const MALLET_R = 22;  // mallet circle radius
const PUCK_R = 13;
const SPEED_UP = 1.025;
const MAX_SPEED = 500;
const SYNC_EVERY = 6;       // state_sync every N frames (~10 Hz at 60 fps)
const MALLET_SEND_MS = 25;  // was 40 (25 Hz) — trims self-inflicted staleness, see the extrapolation block below for the actual fix

// P1's half: Y in [MALLET_R, H/2 - MALLET_R]
// P2's half: Y in [H/2 + MALLET_R, H - MALLET_R]
const P1_Y_MIN = MALLET_R, P1_Y_MAX = H / 2 - MALLET_R;
const P2_Y_MIN = H / 2 + MALLET_R, P2_Y_MAX = H - MALLET_R;

// Same root cause and fix as Ping Pong's identically-named block (see
// PingPongGame.jsx) — P1 is the sole physics authority, so P2's mallet
// position, as P1's collision check sees it, is only as fresh as the last
// mallet_move that made the round trip. Dead-reckon it forward from its last
// known position+velocity (2D here, since Air Hockey mallets move freely in
// both X and Y, unlike Ping Pong's 1D paddle), and widen the effective
// collision radius proportionally to how stale that reckoning is.
const MAX_EXTRA_MALLET_FORGIVENESS = 8; // px, additional effective radius at maximum staleness — remote mallet only
const REMOTE_MALLET_EXTRAPOLATION_CAP_S = 0.35;

// 2D analog of Ping Pong's estimateSendVelocity — measured once per actual
// send (not per frame), since human mallet input rarely reverses direction
// within one send interval.
function estimateSendVelocity2D(track, currentX, currentY, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const rawVx = (currentX - (track.x ?? currentX)) / dtSec;
  const rawVy = (currentY - (track.y ?? currentY)) / dtSec;
  track.x = currentX;
  track.y = currentY;
  track.t = now;
  const maxV = 2500; // generous clamp — a fast flick can legitimately move a mallet quickly
  return {
    vx: Math.max(-maxV, Math.min(maxV, rawVx)),
    vy: Math.max(-maxV, Math.min(maxV, rawVy)),
  };
}

// Dead-reckons a mallet anchor {x, y, vx, vy, t} forward, clamped to the
// canvas and the given valid Y half so a stale-enough prediction can't
// overshoot into the other player's territory.
function extrapolateMalletPos(anchor, now, yMin, yMax) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_MALLET_EXTRAPOLATION_CAP_S);
  const x = Math.max(MALLET_R, Math.min(W - MALLET_R, anchor.x + anchor.vx * elapsedS));
  const y = Math.max(yMin, Math.min(yMax, anchor.y + anchor.vy * elapsedS));
  return { x, y, elapsedS };
}

// Mobile haptic feedback — same technique as PingPongGame.jsx / SpaceAttackGame.jsx.
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

// Sound effects — synthesized WAVs (no external samples), same technique and
// hosting convention as Ping Pong's SOUND_FILES.
const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/air_hockey';
const SOUND_FILES = {
  mallet_hit: `${SOUND_BASE}/mallet_hit.wav`,
  wall_bounce: `${SOUND_BASE}/wall_bounce.wav`,
  goal: `${SOUND_BASE}/goal.wav`,
  serve: `${SOUND_BASE}/serve.wav`,
};
let airHockeySoundEnabled = true;
function playAirHockeySound(name, { volume = 0.5, rate = 1 } = {}) {
  if (!airHockeySoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.playbackRate = rate;
  audio.play().catch(() => {});
}
// A mallet hit is the ONLY event that increases puck speed (SPEED_UP each
// hit); every wall bounce (side, or top/bottom outside the goal strip)
// preserves speed exactly, just flipping one velocity component's sign. That
// makes "did speed increase" a clean, physically-grounded way for
// P2/spectators to distinguish a mallet hit from a wall bounce purely from
// consecutive relayed states — not a fuzzy heuristic, the exact rule the
// physics itself already follows. 1.008 sits safely below SPEED_UP's 1.025
// and comfortably above floating-point noise.
const MALLET_HIT_SPEED_RATIO = 1.008;

export default function AirHockeyGame({ gameState, players, currentUserId, onMove, onClose }) {
  const gs = gameState?.game_state || {};
  const p1Id = String(gs.p1_id || '');
  const p2Id = String(gs.p2_id || '');
  const myId = String(currentUserId);
  const isP1 = myId === p1Id;
  const isP2 = myId === p2Id;
  const scores = gs.scores || {};
  const rally = gs.rally || 0;
  const winScore = gs.win_score || 5;
  const phase = gs.phase || 'serving';
  const isEnded = phase === 'ended';
  const isServing = phase === 'serving';
  const serveBy = String(gs.serve_by || '');

  const p1Name = players?.find(p => String(p.user_id) === p1Id)?.username || 'Player 1';
  const p2Name = players?.find(p => String(p.user_id) === p2Id)?.username || 'Player 2';
  const serverName = serveBy === p1Id ? p1Name : serveBy === p2Id ? p2Name : '';
  const isMyServe = isServing && ((isP1 && serveBy === p1Id) || (isP2 && serveBy === p2Id));

  const canvasRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('air_hockey_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    airHockeySoundEnabled = soundEnabled;
    try { localStorage.setItem('air_hockey_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  // Connection-staleness indicator — P2/spectator side only. Same reasoning
  // as PingPongGame.jsx's identical block: P1 (the physics authority)
  // generates state_sync locally every ~100ms during 'playing' regardless of
  // whether it's reaching anyone, so a healthy P2/spectator connection
  // should see gameState update on roughly that cadence — a much longer gap
  // while still nominally 'playing' reliably means something's wrong on the
  // wire. Not shown for P1, which has no equally reliable version of this
  // signal (whether P1's own broadcasts echo back to itself isn't
  // guaranteed, risking false positives during perfectly healthy play with
  // no discrete events happening).
  const [connectionStale, setConnectionStale] = useState(false);
  useEffect(() => {
    if (isP1) return undefined;
    const STALE_AFTER_MS = 1500;
    const check = () => {
      const stale = phase === 'playing' && Date.now() - S.current.lastGameStateAt > STALE_AFTER_MS;
      setConnectionStale(stale);
    };
    const id = setInterval(check, 400);
    return () => clearInterval(id);
  }, [isP1, phase]);

  // All mutable state in one ref — no re-renders from physics.
  const S = useRef({
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    // My own mallet (2D, clamped to my half)
    myMallet: { x: W / 2, y: isP2 ? P2_Y_MIN + 80 : P1_Y_MAX - 80 },
    // Remote mallet (from WS relay) — raw last-known value, kept for anything
    // simpler that still wants it. Collision + draw actually use the
    // dead-reckoning anchor below.
    remoteMallet: { x: W / 2, y: isP2 ? P1_Y_MAX - 80 : P2_Y_MIN + 80 },
    // Dead-reckoning anchor for the OTHER player's mallet — {x, y, vx, vy, t}.
    // P1's view of P2 is collision-critical (see MAX_EXTRA_MALLET_FORGIVENESS
    // above); P2/spectator's view of P1 is visual smoothness only.
    remoteMalletAnchor: { x: W / 2, y: isP2 ? P1_Y_MAX - 80 : P2_Y_MIN + 80, vx: 0, vy: 0, t: Date.now() },
    // Outgoing-velocity trackers for estimateSendVelocity2D — separate from
    // the anchor above since these track MY OWN mallet at send time.
    p1SendTrack: { x: W / 2, y: P1_Y_MAX - 80, t: 0 },
    p2SendTrack: { x: W / 2, y: P2_Y_MIN + 80, t: 0 },
    // Local latch: set the instant a goal is detected locally (P1 only, the
    // physics authority), cleared once the server confirms via a phase
    // transition. Same purpose as ping_pong's pendingGoal — bridges the
    // round-trip gap so the next frame doesn't see the puck still past the
    // goal line and re-fire the same goal event again.
    pendingGoal: false,
    lastKnownPhase: phase,
    syncAnchor: { x: W / 2, y: H / 2, vx: 0, vy: 0, t: Date.now() },
    frameCount: 0,
    lastTime: 0,
    lastMalletSend: 0,
    justServedLocally: false, // set in handleServeTap, consumed once in the sync effect so whoever tapped never hears their own serve sound twice
    // Last time gameState actually changed — used for the connection-
    // staleness indicator below (P2/spectator side only; see its own
    // comment for why P1 doesn't have an equally reliable version of this).
    lastGameStateAt: Date.now(),
    p1Id, p2Id, myId, isP1, isP2,
  });

  const gsRef = useRef(gs);
  useEffect(() => {
    gsRef.current = gameState?.game_state || {};
    const gsCurrent = gsRef.current;
    const s = S.current;
    s.lastGameStateAt = Date.now();
    const prevPhase = s.lastKnownPhase;
    s.lastKnownPhase = gsCurrent.phase;
    const justEnteredPlaying = prevPhase !== 'playing' && gsCurrent.phase === 'playing';
    const justEnteredServing = prevPhase !== 'serving' && gsCurrent.phase === 'serving';

    if (isP1) {
      if (gsCurrent.p2x != null) s.remoteMallet.x = gsCurrent.p2x;
      if (gsCurrent.p2y != null) s.remoteMallet.y = gsCurrent.p2y;
      if (gsCurrent.p2x != null && gsCurrent.p2y != null) {
        s.remoteMalletAnchor = {
          x: gsCurrent.p2x, y: gsCurrent.p2y,
          vx: gsCurrent.p2vx || 0, vy: gsCurrent.p2vy || 0,
          t: Date.now(),
        };
      }
      // Just served — adopt the server-authoritative launched puck exactly
      // once, at the transition edge. Replaces the old "optimistic local
      // reset, then a second server-confirmed reset" race.
      if (justEnteredPlaying) {
        s.puck.x = gsCurrent.ball_x ?? W / 2;
        s.puck.y = gsCurrent.ball_y ?? H / 2;
        s.puck.vx = gsCurrent.ball_vx ?? 0;
        s.puck.vy = gsCurrent.ball_vy ?? 0;
        s.pendingGoal = false;
      }
    } else {
      // P2 / spectator: update extrapolation anchor from relayed state.
      // Goal sound: P1 always plays it directly, the instant it detects a
      // goal in its own physics loop — this branch is the ONLY place it
      // fires for everyone else, so no double-play guard is needed here.
      if (justEnteredServing) {
        playAirHockeySound('goal', { volume: 0.55 });
        if (s.isP2) hapticImpact([20, 40, 20]);
        s.syncAnchor = { x: W / 2, y: H / 2, vx: 0, vy: 0, t: Date.now() };
      }

      if (gsCurrent.p1x != null) s.remoteMallet.x = gsCurrent.p1x;
      if (gsCurrent.p1y != null) s.remoteMallet.y = gsCurrent.p1y;
      if (gsCurrent.p1x != null && gsCurrent.p1y != null) {
        s.remoteMalletAnchor = {
          x: gsCurrent.p1x, y: gsCurrent.p1y,
          vx: gsCurrent.p1vx || 0, vy: gsCurrent.p1vy || 0,
          t: Date.now(),
        };
      }
      if (gsCurrent.phase === 'playing') {
        const now = Date.now();
        const newVx = gsCurrent.ball_vx ?? s.syncAnchor.vx;
        const newVy = gsCurrent.ball_vy ?? s.syncAnchor.vy;
        // Skip inference on the very first playing-phase frame after a serve
        // — that frame is just adopting the served velocity, not a
        // collision, and the 'serve' sound below already covers it. Without
        // this guard the stale pre-rally syncAnchor (left over from
        // whatever the puck was doing right before the last goal) could
        // produce a spurious hit/bounce sound here.
        if (!justEnteredPlaying) {
          const prevSpeed = Math.sqrt(s.syncAnchor.vx * s.syncAnchor.vx + s.syncAnchor.vy * s.syncAnchor.vy);
          const newSpeed = Math.sqrt(newVx * newVx + newVy * newVy);
          if (prevSpeed > 0) {
            if (newSpeed > prevSpeed * MALLET_HIT_SPEED_RATIO) {
              playAirHockeySound('mallet_hit', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
              if (s.isP2) hapticImpact(15);
            } else if (Math.sign(newVx) !== Math.sign(s.syncAnchor.vx) || Math.sign(newVy) !== Math.sign(s.syncAnchor.vy)) {
              playAirHockeySound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 });
            }
          }
        }
        s.syncAnchor = { x: gsCurrent.ball_x ?? W / 2, y: gsCurrent.ball_y ?? H / 2, vx: newVx, vy: newVy, t: now };
      }
    }

    // Serve sound — shared: either role can hold serve. Whoever actually
    // tapped already heard it instantly via handleServeTap's optimistic
    // play; this only needs to cover the OTHER player hearing the confirmed
    // serve arrive over the network.
    if (justEnteredPlaying) {
      if (s.justServedLocally) s.justServedLocally = false;
      else playAirHockeySound('serve', { volume: 0.4 });
    }
  }, [gameState, isP1]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = S.current;
    const gsCurrent = gsRef.current;
    const nowDraw = Date.now();

    // Ice surface
    ctx.fillStyle = '#0f2744';
    ctx.fillRect(0, 0, W, H);

    // Rink border
    ctx.strokeStyle = 'rgba(147,197,253,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    // Goal zones (lighter strip at top and bottom)
    const GOAL_W = 100, GOAL_H = 16;
    ctx.fillStyle = 'rgba(239,68,68,0.25)'; // P1's goal (top, P2 scores here)
    ctx.fillRect((W - GOAL_W) / 2, 4, GOAL_W, GOAL_H);
    ctx.fillStyle = 'rgba(59,130,246,0.25)'; // P2's goal (bottom, P1 scores here)
    ctx.fillRect((W - GOAL_W) / 2, H - 4 - GOAL_H, GOAL_W, GOAL_H);

    // Goal line text
    ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.fillText('GOAL', W / 2, 14 + GOAL_H);
    ctx.fillStyle = 'rgba(59,130,246,0.7)';
    ctx.fillText('GOAL', W / 2, H - 4 - GOAL_H - 4);

    // Centre line and circle
    ctx.strokeStyle = 'rgba(147,197,253,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(8, H / 2); ctx.lineTo(W - 8, H / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
    ctx.stroke();

    // Puck position
    let px, py;
    if (s.isP1) {
      px = s.puck.x; py = s.puck.y;
    } else {
      const elapsed = Math.min((Date.now() - s.syncAnchor.t) / 1000, 0.2);
      px = s.syncAnchor.x + s.syncAnchor.vx * elapsed;
      py = s.syncAnchor.y + s.syncAnchor.vy * elapsed;
    }

    // Draw puck
    ctx.beginPath(); ctx.arc(px, py, PUCK_R, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    // Puck sheen
    ctx.beginPath(); ctx.arc(px - 3, py - 3, PUCK_R * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();

    // P1/P2 mallet positions — the "not mine" one uses the dead-reckoning
    // anchor when I'm an actual player (same predicted position the host's
    // collision check itself uses, when applicable), or a plain last-known
    // fallback for a spectator (who has no anchor for either mallet, same as
    // before this fix — spectators aren't collision-critical).
    let m1x, m1y, m2x, m2y;
    if (s.isP1) {
      m1x = s.myMallet.x; m1y = s.myMallet.y;
      const p2 = extrapolateMalletPos(s.remoteMalletAnchor, nowDraw, P2_Y_MIN, P2_Y_MAX);
      m2x = p2.x; m2y = p2.y;
    } else if (s.isP2) {
      const p1 = extrapolateMalletPos(s.remoteMalletAnchor, nowDraw, P1_Y_MIN, P1_Y_MAX);
      m1x = p1.x; m1y = p1.y;
      m2x = s.myMallet.x; m2y = s.myMallet.y;
    } else {
      m1x = gsCurrent.p1x ?? s.remoteMallet.x; m1y = gsCurrent.p1y ?? s.remoteMallet.y;
      m2x = gsCurrent.p2x ?? s.remoteMallet.x; m2y = gsCurrent.p2y ?? s.remoteMallet.y;
    }

    // P1 mallet (red, top half)
    ctx.beginPath(); ctx.arc(m1x, m1y, MALLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(m1x, m1y, MALLET_R * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();

    // P2 mallet (blue, bottom half)
    ctx.beginPath(); ctx.arc(m2x, m2y, MALLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb'; ctx.fill();
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(m2x, m2y, MALLET_R * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();
  }, []);

  // P1 physics loop
  useEffect(() => {
    if (!isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = S.current;
    let rafId;

    function loop(time) {
      const dt = Math.min((time - (s.lastTime || time)) / 1000, 0.05);
      s.lastTime = time;
      s.frameCount++;
      const gsCurrent = gsRef.current;
      const now = Date.now();

      if (gsCurrent.phase === 'playing' && !s.pendingGoal) {
        const p = s.puck;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wall bounces (left/right only; top/bottom are goal areas)
        if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx); playAirHockeySound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }
        if (p.x > W - PUCK_R) { p.x = W - PUCK_R; p.vx = -Math.abs(p.vx); playAirHockeySound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }

        // Mallet-puck collision check (circle vs circle). extraRadius widens
        // the effective collision boundary — 0 for P1's own mallet (always
        // instantly fresh, same process), and a staleness-scaled margin for
        // P2's dead-reckoned position (see MAX_EXTRA_MALLET_FORGIVENESS above)
        // so a hit that would've whiffed against a stale snapshot becomes
        // forgivable in proportion to how long it's been since P1 actually
        // heard from P2.
        function checkMallet(mx, my, extraRadius = 0) {
          const dx = p.x - mx, dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const collisionRadius = PUCK_R + MALLET_R + extraRadius;
          if (dist < collisionRadius && dist > 0) {
            // Push puck out of overlap first
            const nx = dx / dist, ny = dy / dist;
            p.x = mx + nx * (collisionRadius + 1);
            p.y = my + ny * (collisionRadius + 1);
            // Reflect velocity off collision normal
            const dot = p.vx * nx + p.vy * ny;
            if (dot < 0) { // only if approaching
              p.vx -= 2 * dot * nx;
              p.vy -= 2 * dot * ny;
              // Speed up slightly each hit
              const speed = Math.min(Math.sqrt(p.vx * p.vx + p.vy * p.vy) * SPEED_UP, MAX_SPEED);
              const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
              p.vx = (p.vx / mag) * speed;
              p.vy = (p.vy / mag) * speed;
              playAirHockeySound('mallet_hit', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
              hapticImpact(15);
            }
          }
        }

        checkMallet(s.myMallet.x, s.myMallet.y); // P1's own mallet — always fresh, no forgiveness

        // P2's mallet — dead-reckon its position forward, and widen the
        // effective collision radius proportionally to how stale that
        // reckoning is. Same root cause and fix as Ping Pong's remote-paddle
        // collision check.
        {
          const { x: remoteX, y: remoteY, elapsedS } = extrapolateMalletPos(s.remoteMalletAnchor, now, P2_Y_MIN, P2_Y_MAX);
          const extraRadius = MAX_EXTRA_MALLET_FORGIVENESS * (elapsedS / REMOTE_MALLET_EXTRAPOLATION_CAP_S);
          checkMallet(remoteX, remoteY, extraRadius);
        }

        // Goal detection — no local puck reset here; it just stops updating
        // (frozen wherever it exited) since the "serving" phase's UI takes
        // over the visual entirely once the server confirms. Same pattern
        // as ping_pong's goal handling — see the comment there for why.
        const GOAL_W = 100;
        const goalLeft = (W - GOAL_W) / 2;
        const goalRight = goalLeft + GOAL_W;
        let goalScorer = null;
        if (p.y < PUCK_R && p.x > goalLeft && p.x < goalRight) {
          goalScorer = s.p2Id; // Puck entered top goal → P2 scores
        } else if (p.y > H - PUCK_R && p.x > goalLeft && p.x < goalRight) {
          goalScorer = s.p1Id; // Puck entered bottom goal → P1 scores
        } else {
          // Bounce puck off top/bottom walls outside goal area
          if (p.y < PUCK_R) { p.y = PUCK_R; p.vy = Math.abs(p.vy); playAirHockeySound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }
          if (p.y > H - PUCK_R) { p.y = H - PUCK_R; p.vy = -Math.abs(p.vy); playAirHockeySound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }
        }

        if (goalScorer) {
          s.pendingGoal = true;
          playAirHockeySound('goal', { volume: 0.55 });
          hapticImpact([20, 40, 20]);
          onMove({ move_type: 'goal', scorer_id: goalScorer });
        } else if (s.frameCount % SYNC_EVERY === 0) {
          // Throttled state sync to P2
          const v = estimateSendVelocity2D(s.p1SendTrack, s.myMallet.x, s.myMallet.y, now);
          onMove({
            move_type: 'state_sync',
            ball_x: p.x, ball_y: p.y, ball_vx: p.vx, ball_vy: p.vy,
            p1x: s.myMallet.x, p1y: s.myMallet.y, p1vx: v.vx, p1vy: v.vy,
          });
        }
      } else if (gsCurrent.phase === 'serving' && s.frameCount % SYNC_EVERY === 0) {
        // Still relay mallet position during the serving pause, so the
        // other player can see P1 lining up before the point starts.
        const v = estimateSendVelocity2D(s.p1SendTrack, s.myMallet.x, s.myMallet.y, now);
        onMove({
          move_type: 'state_sync',
          ball_x: s.puck.x, ball_y: s.puck.y, ball_vx: 0, ball_vy: 0,
          p1x: s.myMallet.x, p1y: s.myMallet.y, p1vx: v.vx, p1vy: v.vy,
        });
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw, onMove]);

  // P2 / spectator draw loop
  useEffect(() => {
    if (isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw]);

  // Pointer / touch — drag mallet anywhere in own half
  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const src = e.touches ? e.touches[0] : e;
    if (!src) return;
    const rawX = (src.clientX - rect.left) * scaleX;
    const rawY = (src.clientY - rect.top) * scaleY;
    const x = Math.max(MALLET_R, Math.min(W - MALLET_R, rawX));
    const s = S.current;

    let y;
    if (isP1) {
      y = Math.max(P1_Y_MIN, Math.min(P1_Y_MAX, rawY));
    } else {
      y = Math.max(P2_Y_MIN, Math.min(P2_Y_MAX, rawY));
    }

    s.myMallet.x = x;
    s.myMallet.y = y;

    if (isP2) {
      const now = Date.now();
      if (now - s.lastMalletSend > MALLET_SEND_MS) {
        const v = estimateSendVelocity2D(s.p2SendTrack, x, y, now);
        s.lastMalletSend = now;
        onMove({ move_type: 'mallet_move', p2x: x, p2y: y, p2vx: v.vx, p2vy: v.vy });
      }
    }
  }, [isP1, isP2, onMove]);

  // Tap-to-serve — tapping the serving overlay serves when it's your turn.
  const handleServeTap = useCallback(() => {
    if (!isMyServe) return;
    const s = S.current;
    // Instant local feedback for whoever actually tapped — the sync effect's
    // `justServedLocally` guard is what stops this same player from hearing
    // the confirmed round-trip play a second copy of the same sound.
    s.justServedLocally = true;
    playAirHockeySound('serve', { volume: 0.5 });
    if (isP1) {
      // Optimistic local launch — P1 is the physics authority, so don't make
      // them wait on their own round-trip before the rally visibly starts.
      // isMyServe already guarantees this is P1's own serve, so the puck
      // always launches upward, toward P1's own side.
      s.puck = { x: W / 2, y: H / 2, vx: 80, vy: -220 };
      s.lastKnownPhase = 'playing';
      s.pendingGoal = false;
    }
    onMove({ move_type: 'serve' });
  }, [isMyServe, isP1, onMove]);

  const p1Score = scores[p1Id] || 0;
  const p2Score = scores[p2Id] || 0;

  // Winner: when ended, whoever has more points wins (handles natural finish and mid-game rt_end).
  let winnerName = null;
  if (isEnded) {
    if (p1Score > p2Score) winnerName = p1Name;
    else if (p2Score > p1Score) winnerName = p2Name;
  }

  const handleEndGame = () => onMove({ move_type: 'rt_end' });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏒</span>
          <div>
            <h2 className="text-sm font-bold text-cyan-300 leading-tight">Air Hockey</h2>
            <p className="text-xs text-gray-400">First to {winScore} · Rally {rally}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-lg font-black">
            <span className="text-red-400">{p1Score}</span>
            <span className="text-gray-500 text-sm">vs</span>
            <span className="text-blue-400">{p2Score}</span>
          </div>
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1 hover:text-gray-300 text-gray-500"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {(isP1 || isP2) && !isEnded && (
            <button onClick={handleEndGame} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded font-medium">End Game</button>
          )}
          <button onClick={isP1 || isP2 ? (isEnded ? onClose : handleEndGame) : onClose} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">✕</button>
        </div>
      </div>

      {/* Player labels */}
      <div className="flex justify-between px-4 pt-1 pb-0.5 shrink-0 text-xs">
        <span className={`font-semibold ${isP1 ? 'text-red-300' : 'text-red-400/70'}`}>{p1Name} {isP1 ? '(You ↑)' : '↑'}</span>
        <span className={`font-semibold ${isP2 ? 'text-blue-300' : 'text-blue-400/70'}`}>{isP2 ? '(You ↓) ' : '↓ '}{p2Name}</span>
      </div>

      {/* Connection-unstable notice — see the connectionStale effect's own
          comment for why this is P2/spectator-only. A thin bar rather than a
          blocking overlay: the game itself keeps rendering (frozen at its
          last known position via the extrapolation cap) underneath, this
          just tells the player WHY, instead of an unexplained freeze. */}
      {connectionStale && (
        <div className="text-center text-xs font-semibold py-1 shrink-0 bg-amber-900/70 text-amber-200 animate-pulse">
          ⚠️ Connection unstable — reconnecting…
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden px-2 py-1">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={handlePointerMove}
          onTouchMove={handlePointerMove}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            aspectRatio: `${W} / ${H}`,
            cursor: 'none',
            touchAction: 'none',
            display: 'block',
          }}
        />

        {/* Serving pause — mirrors Ping Pong's tap-to-serve overlay. Covers
            the whole canvas, so the handler lives on this outer div rather
            than the canvas's own (unreachable while this shows) handlers. */}
        {isServing && !isEnded && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center bg-black/50 ${isMyServe ? 'cursor-pointer' : ''}`}
            onClick={isMyServe ? handleServeTap : undefined}
            onTouchStart={isMyServe ? (e) => { e.preventDefault(); handleServeTap(); } : undefined}
          >
            <div className="bg-gray-900/95 border border-gray-700 rounded-2xl px-6 py-5 text-center shadow-2xl mx-4">
              {rally > 0 ? (
                <p className="text-yellow-300 font-black text-xl mb-1">⚡ Goal! {serverName} scores</p>
              ) : (
                <p className="text-cyan-300 font-black text-xl mb-1">🏒 Get Ready!</p>
              )}
              <p className="text-gray-300 text-lg font-bold mb-3">{p1Score} – {p2Score}</p>
              {isMyServe ? (
                <button className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-white animate-pulse pointer-events-none">
                  Tap to Serve
                </button>
              ) : (
                <p className="text-gray-400 text-sm">Waiting for {serverName} to serve…</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Game over */}
      {isEnded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl max-w-xs mx-4">
            <p className="text-5xl mb-3">{winnerName ? '🏒' : '🤝'}</p>
            {winnerName
              ? <><p className="text-2xl font-black text-white">{winnerName}</p><p className="text-green-400 font-bold text-lg">wins!</p></>
              : <><p className="text-xl font-bold text-yellow-300">It's a Draw!</p><p className="text-gray-400 text-sm mt-1">Tied scores — no winner</p></>}
            <p className="text-gray-300 text-lg font-bold mt-3">{p1Score} – {p2Score}</p>
            <button onClick={onClose} className="mt-5 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-sm">Close</button>
          </div>
        </div>
      )}

      {!isP1 && !isP2 && !isEnded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-gray-300 text-xs px-3 py-1.5 rounded-full pointer-events-none">
          👀 Spectating
        </div>
      )}
    </div>
  );
}
