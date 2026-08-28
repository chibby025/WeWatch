import React, { useRef, useEffect, useCallback, useState } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Tank Battle — genuine real-time 2-player PvP. Unlike Ping Pong/Air Hockey
// (one shared ball, P1 is the sole physics authority), each tank here is
// symmetric and self-controlled: every client owns and self-reports its OWN
// tank's position/rotation/turret angle via state_sync at ~16Hz, and both
// clients independently, identically simulate every bullet in play (fired
// by either side) from a relayed origin/angle/speed — deterministic given
// the same physics constants, so no physics-authority round-trip is needed
// for bullets either. The one thing that DOES need a single source of
// truth is "did a shot land": the SHOOTER is authoritative over their own
// bullets, detects a collision locally against the target's last-known
// (extrapolated) position, and reports it via a "hit" move — same trust
// level already accepted throughout this game package (see tank_battle.go).

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/tank_battle';
const SOUND_FILES = {
  fire: `${SOUND_BASE}/fire.wav`,
  hit: `${SOUND_BASE}/hit.wav`,
  explosion: `${SOUND_BASE}/explosion.wav`,
};
let tankBattleSoundEnabled = true;
function playTankSound(name, { volume = 0.5 } = {}) {
  if (!tankBattleSoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.play().catch(() => {});
}
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
const isTouchDevice =
  typeof window !== 'undefined' && 'ontouchstart' in window && navigator.maxTouchPoints > 0;

// Logical arena size — matches the fixed aspect ratio the canvas is drawn
// at regardless of actual on-screen pixel size (scaled via CSS/transform).
const W = 800;
const H = 480;
const TANK_R = 20;
const MAX_HP = 100;
const TANK_SPEED = 190; // px/sec
const BULLET_SPEED = 420; // px/sec
const BULLET_R = 4;
const FIRE_COOLDOWN_MS = 380;
const HIT_RADIUS = TANK_R * 0.95;
const STATE_SYNC_MS = 55; // ~18Hz

// Dead-reckoning constants — same technique already proven in
// PingPongGame.jsx/AirHockeyGame.jsx for a laggy remote object: extrapolate
// the opponent's tank forward from its last known position + self-reported
// velocity, capped so a stale-enough guess doesn't overshoot into nonsense.
const REMOTE_EXTRAPOLATION_CAP_S = 0.3;

function estimateSendVelocity(track, x, y, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const vx = (x - (track.x ?? x)) / dtSec;
  const vy = (y - (track.y ?? y)) / dtSec;
  track.x = x;
  track.y = y;
  track.t = now;
  const cap = TANK_SPEED * 3;
  return { vx: Math.max(-cap, Math.min(cap, vx)), vy: Math.max(-cap, Math.min(cap, vy)) };
}

function extrapolateTank(anchor, now) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_EXTRAPOLATION_CAP_S);
  return {
    x: Math.max(TANK_R, Math.min(W - TANK_R, anchor.x + anchor.vx * elapsedS)),
    y: Math.max(TANK_R, Math.min(H - TANK_R, anchor.y + anchor.vy * elapsedS)),
    angle: anchor.angle,
    turretAngle: anchor.turretAngle,
  };
}

// Loads a player's avatar as an Image once, cached by URL — reused by
// drawTank so a hit tank shows a real player photo instead of a plain
// colored dot. Falls back silently (drawTank just skips the image and
// keeps its existing colored-dot rendering) on any load failure — same
// "cosmetic only, never blocks gameplay" tolerance already used throughout
// this game for sound.
const avatarImageCache = new Map();
function loadAvatarImage(url) {
  if (!url) return null;
  let entry = avatarImageCache.get(url);
  if (!entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    entry = { img, loaded: false };
    img.onload = () => { entry.loaded = true; };
    img.onerror = () => { entry.loaded = false; };
    img.src = url;
    avatarImageCache.set(url, entry);
  }
  return entry.loaded ? entry.img : null;
}

// Hit-impact spark burst + continuous low-HP smoke — both pure client-side
// cosmetic particle effects, same trust model/architecture as every other
// visual flourish in this game (no server involvement, no new wire fields).
const HIT_PARTICLE_COUNT = 14;
const LOW_HP_SMOKE_THRESHOLD = 40; // % HP below which a tank starts smoking
const SMOKE_INTERVAL_MS = 140;

function spawnHitBurst(particles, x, y) {
  for (let i = 0; i < HIT_PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220;
    particles.push({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0, maxLife: 0.28 + Math.random() * 0.22,
      size: 2 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#ffb347' : '#ff5a3c',
    });
  }
}

function spawnSmoke(particles, x, y) {
  particles.push({
    kind: 'smoke',
    x: x + (Math.random() - 0.5) * TANK_R * 0.6,
    y: y + (Math.random() - 0.5) * TANK_R * 0.6,
    vx: (Math.random() - 0.5) * 12,
    vy: -18 - Math.random() * 22,
    life: 0, maxLife: 0.6 + Math.random() * 0.5,
    size: TANK_R * 0.3 + Math.random() * TANK_R * 0.25,
  });
}

export default function TankBattleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const p1Id = String(gs.p1_id || '');
  const p2Id = String(gs.p2_id || '');
  const myId = String(currentUserId);
  const isP1 = myId === p1Id;
  const isP2 = myId === p2Id;
  const scores = gs.scores || {};
  const phase = gs.phase || 'playing';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';

  const p1Name = players?.find((p) => String(p.user_id) === p1Id)?.username || 'Player 1';
  const p2Name = players?.find((p) => String(p.user_id) === p2Id)?.username || 'Player 2';
  const opponentId = isP1 ? p2Id : p1Id;
  // p.avatar is the established field this broadcast already resolves
  // player avatars into (see VideoWatch.jsx's enrichedPlayers) — matches
  // the same convention already used by BowlingGame.jsx's scoreboard.
  const myAvatarUrl = players?.find((p) => String(p.user_id) === myId)?.avatar || null;
  const oppAvatarUrl = players?.find((p) => String(p.user_id) === opponentId)?.avatar || null;

  const myHP = isP1 ? Number(scores[p1Id] ?? MAX_HP) : Number(scores[p2Id] ?? MAX_HP);
  const oppHP = isP1 ? Number(scores[p2Id] ?? MAX_HP) : Number(scores[p1Id] ?? MAX_HP);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('tank_battle_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    tankBattleSoundEnabled = soundEnabled;
    try { localStorage.setItem('tank_battle_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  const [countingDown, setCountingDown] = useState(3);
  useEffect(() => {
    if (isEnded) return undefined;
    setCountingDown(3);
    const t1 = setTimeout(() => setCountingDown(2), 700);
    const t2 = setTimeout(() => setCountingDown(1), 1400);
    const t3 = setTimeout(() => setCountingDown(0), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isEnded]);

  const S = useRef({
    my: { x: isP2 ? W - 90 : 90, y: H / 2, angle: isP2 ? Math.PI : 0, turretAngle: isP2 ? Math.PI : 0, vx: 0, vy: 0 },
    // Extrapolation anchor for the opponent's tank — {x, y, vx, vy, angle, turretAngle, t}
    oppAnchor: { x: isP2 ? 90 : W - 90, y: H / 2, vx: 0, vy: 0, angle: isP2 ? 0 : Math.PI, turretAngle: 0, t: Date.now() },
    sendTrack: { x: 0, y: 0, t: 0 },
    bullets: [], // {id, x, y, vx, vy, mine}
    nextBulletId: 1,
    keys: { w: false, a: false, s: false, d: false },
    aim: { x: W - 200, y: H / 2 }, // desktop mouse / touch aim point, in canvas-logical coords
    lastFireAt: 0,
    lastStateSyncAt: 0,
    lastSeenFireSeq: gs.fire_seq || 0,
    startedAt: Date.now(),
    hitSent: false,
    // Touch joystick state (mobile only)
    joyActive: false,
    joyVec: { x: 0, y: 0 },
    // Collision spark bursts + continuous low-HP smoke — {kind, x, y, vx, vy, life, maxLife, size, color?}
    particles: [],
    lastMySmokeAt: 0,
    lastOppSmokeAt: 0,
  });

  // Ingest the opponent's relayed tank state whenever the broadcast updates.
  useEffect(() => {
    const myKey = `tank_${myId}`;
    const oppKey = `tank_${opponentId}`;
    void myKey; // (kept for symmetry/clarity — not read; my own tank never reads its own relay)
    const oppSnap = gs[oppKey];
    if (oppSnap && typeof oppSnap === 'object') {
      const a = S.current.oppAnchor;
      a.x = typeof oppSnap.x === 'number' ? oppSnap.x : a.x;
      a.y = typeof oppSnap.y === 'number' ? oppSnap.y : a.y;
      a.vx = typeof oppSnap.vx === 'number' ? oppSnap.vx : 0;
      a.vy = typeof oppSnap.vy === 'number' ? oppSnap.vy : 0;
      a.angle = typeof oppSnap.angle === 'number' ? oppSnap.angle : a.angle;
      a.turretAngle = typeof oppSnap.turret_angle === 'number' ? oppSnap.turret_angle : a.turretAngle;
      a.t = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(gs[`tank_${opponentId}`])]);

  // Ingest a new fire event from the opponent — spawn an identical bullet
  // locally so both clients agree on the trajectory going forward.
  useEffect(() => {
    const seq = gs.fire_seq || 0;
    if (seq <= S.current.lastSeenFireSeq) return;
    S.current.lastSeenFireSeq = seq;
    const lf = gs.last_fire;
    if (!lf || String(lf.shooter_id) === myId) return; // my own echo, or malformed
    const speed = BULLET_SPEED;
    const bullet = {
      id: S.current.nextBulletId++,
      x: lf.x, y: lf.y,
      vx: Math.cos(lf.angle) * speed,
      vy: Math.sin(lf.angle) * speed,
      mine: false,
    };
    S.current.bullets.push(bullet);
    playTankSound('fire', { volume: 0.35 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.fire_seq]);

  // Damage feedback for whichever side just got hit (both sides feel it —
  // the target visually/audibly confirms the shooter's hit report landed).
  const prevOppHP = useRef(oppHP);
  const prevMyHP = useRef(myHP);
  useEffect(() => {
    if (oppHP < prevOppHP.current) {
      playTankSound('hit', { volume: 0.4 });
      const pos = extrapolateTank(S.current.oppAnchor, Date.now());
      spawnHitBurst(S.current.particles, pos.x, pos.y);
    }
    prevOppHP.current = oppHP;
  }, [oppHP]);
  useEffect(() => {
    if (myHP < prevMyHP.current) {
      playTankSound('hit', { volume: 0.5 });
      hapticImpact([15, 30, 15]);
      spawnHitBurst(S.current.particles, S.current.my.x, S.current.my.y);
    }
    prevMyHP.current = myHP;
  }, [myHP]);
  useEffect(() => {
    if (isEnded) { playTankSound('explosion', { volume: 0.5 }); hapticImpact([30, 60, 30]); }
  }, [isEnded]);

  const canPlay = (isP1 || isP2) && !isEnded && countingDown === 0;

  const tryFire = useCallback(() => {
    if (!canPlay) return;
    const now = performance.now();
    if (now - S.current.lastFireAt < FIRE_COOLDOWN_MS) return;
    S.current.lastFireAt = now;
    const my = S.current.my;
    const bullet = {
      id: S.current.nextBulletId++,
      x: my.x + Math.cos(my.turretAngle) * (TANK_R + 6),
      y: my.y + Math.sin(my.turretAngle) * (TANK_R + 6),
      vx: Math.cos(my.turretAngle) * BULLET_SPEED,
      vy: Math.sin(my.turretAngle) * BULLET_SPEED,
      mine: true,
    };
    S.current.bullets.push(bullet);
    playTankSound('fire', { volume: 0.5 });
    onMove({ move_type: 'fire', x: bullet.x, y: bullet.y, angle: my.turretAngle });
  }, [canPlay, onMove]);

  // ── Keyboard + mouse (desktop) ──────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') S.current.keys.w = true;
      if (k === 'a' || k === 'arrowleft') S.current.keys.a = true;
      if (k === 's' || k === 'arrowdown') S.current.keys.s = true;
      if (k === 'd' || k === 'arrowright') S.current.keys.d = true;
      if (k === ' ') { e.preventDefault(); tryFire(); }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') S.current.keys.w = false;
      if (k === 'a' || k === 'arrowleft') S.current.keys.a = false;
      if (k === 's' || k === 'arrowdown') S.current.keys.s = false;
      if (k === 'd' || k === 'arrowright') S.current.keys.d = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tryFire]);

  const canvasPointFromEvent = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isTouchDevice) return;
    S.current.aim = canvasPointFromEvent(e.clientX, e.clientY);
  }, [canvasPointFromEvent]);

  const handleClick = useCallback(() => {
    if (isTouchDevice) return;
    tryFire();
  }, [tryFire]);

  // ── Main physics/render loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    let raf;
    let lastT = performance.now();

    const draw = (now) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const s = S.current;

      if (canPlay) {
        // Movement
        let dx = 0, dy = 0;
        if (isTouchDevice) {
          dx = s.joyVec.x; dy = s.joyVec.y;
        } else {
          if (s.keys.w) dy -= 1;
          if (s.keys.s) dy += 1;
          if (s.keys.a) dx -= 1;
          if (s.keys.d) dx += 1;
        }
        const mag = Math.hypot(dx, dy);
        if (mag > 0.01) {
          dx /= mag; dy /= mag;
          s.my.x = Math.max(TANK_R, Math.min(W - TANK_R, s.my.x + dx * TANK_SPEED * dt));
          s.my.y = Math.max(TANK_R, Math.min(H - TANK_R, s.my.y + dy * TANK_SPEED * dt));
          s.my.angle = Math.atan2(dy, dx);
          s.my.vx = dx * TANK_SPEED;
          s.my.vy = dy * TANK_SPEED;
        } else {
          s.my.vx = 0; s.my.vy = 0;
        }
        // Turret aim
        s.my.turretAngle = Math.atan2(s.aim.y - s.my.y, s.aim.x - s.my.x);

        // Relay my own tank state
        const nowMs = Date.now();
        if (nowMs - s.lastStateSyncAt > STATE_SYNC_MS) {
          s.lastStateSyncAt = nowMs;
          const { vx, vy } = estimateSendVelocity(s.sendTrack, s.my.x, s.my.y, nowMs);
          onMove({
            move_type: 'state_sync',
            x: s.my.x, y: s.my.y, angle: s.my.angle, turret_angle: s.my.turretAngle,
            vx, vy,
          });
        }
      }

      // Advance bullets, check my-own-bullet-vs-opponent collision
      const oppNow = extrapolateTank(s.oppAnchor, Date.now());
      s.bullets = s.bullets.filter((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
        if (b.mine && canPlay) {
          const d = Math.hypot(b.x - oppNow.x, b.y - oppNow.y);
          if (d < HIT_RADIUS + BULLET_R) {
            onMove({ move_type: 'hit', target_player_id: Number(opponentId), damage: 20 });
            return false;
          }
        }
        return true;
      });

      // Continuous smoke for a badly damaged (but still alive) tank — the
      // "burning animation" the redesign asked for. Independent of the
      // spark-burst hit feedback above; this fires every frame the tank
      // stays under threshold, not just on the instant HP changes.
      if (canPlay) {
        const nowMs2 = Date.now();
        if (myHP > 0 && myHP < LOW_HP_SMOKE_THRESHOLD && nowMs2 - s.lastMySmokeAt > SMOKE_INTERVAL_MS) {
          s.lastMySmokeAt = nowMs2;
          spawnSmoke(s.particles, s.my.x, s.my.y);
        }
        if (oppHP > 0 && oppHP < LOW_HP_SMOKE_THRESHOLD && nowMs2 - s.lastOppSmokeAt > SMOKE_INTERVAL_MS) {
          s.lastOppSmokeAt = nowMs2;
          spawnSmoke(s.particles, oppNow.x, oppNow.y);
        }
      }

      // Advance every particle (sparks + smoke share one array/lifecycle —
      // only their drawn appearance differs, by `kind`).
      s.particles = s.particles.filter((p) => {
        p.life += dt;
        if (p.life >= p.maxLife) return false;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'spark') { p.vx *= 0.92; p.vy *= 0.92; } // quick drag, sparks slow fast
        return true;
      });

      // ── Render ──
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(canvas.width / W, canvas.height / H);

      // Arena
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2d3b1f');
      grad.addColorStop(1, '#1c2614');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);

      const drawTank = (t, color, isDead, avatarUrl, hpPct) => {
        if (isDead) return;
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        ctx.fillStyle = color;
        ctx.fillRect(-TANK_R, -TANK_R * 0.7, TANK_R * 2, TANK_R * 1.4);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-TANK_R, -TANK_R * 0.7, TANK_R * 2, TANK_R * 1.4);
        ctx.restore();
        // Turret + barrel (independent rotation)
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.turretAngle);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, -3, TANK_R + 10, 6);
        ctx.restore();
        // Player avatar clipped into the turret hatch — falls back to a
        // plain colored dot (the original look) until the image finishes
        // loading, or forever if there is no avatar/it fails to load.
        const avatarR = TANK_R * 0.55;
        const img = loadAvatarImage(avatarUrl);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, t.x - avatarR, t.y - avatarR, avatarR * 2, avatarR * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        // A faint pulsing red ring at low HP — a quick "this tank is
        // burning" read even in the instant between smoke puffs.
        if (hpPct > 0 && hpPct < LOW_HP_SMOKE_THRESHOLD) {
          const pulse = 0.4 + 0.3 * Math.sin(now / 130);
          ctx.beginPath();
          ctx.arc(t.x, t.y, TANK_R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,90,40,${pulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      };

      const myDead = myHP <= 0;
      const oppDead = oppHP <= 0;
      drawTank(s.my, isP2 ? '#ef4444' : '#3b82f6', myDead && isEnded, myAvatarUrl, myHP);
      drawTank(oppNow, isP2 ? '#3b82f6' : '#ef4444', oppDead && isEnded, oppAvatarUrl, oppHP);

      // Bullets
      ctx.fillStyle = '#ffe066';
      s.bullets.forEach((b) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, BULLET_R, 0, Math.PI * 2);
        ctx.fill();
      });

      // Particles — hit sparks (bright, fast-fading) and smoke (soft, slow
      // grey puffs) drawn on top of everything else so a fresh hit reads
      // clearly regardless of what's underneath.
      s.particles.forEach((p) => {
        const t = p.life / p.maxLife;
        if (p.kind === 'spark') {
          ctx.globalAlpha = Math.max(0, 1 - t);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = Math.max(0, 0.55 * (1 - t));
          ctx.fillStyle = '#555';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.8), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canPlay, isP2, opponentId, myHP, oppHP, isEnded, onMove, myAvatarUrl, oppAvatarUrl]);

  // ── Touch joystick handlers (mobile) ─────────────────────────────────
  const joyBaseRef = useRef({ x: 0, y: 0 });
  const handleJoyStart = (e) => {
    const t = e.touches[0];
    joyBaseRef.current = { x: t.clientX, y: t.clientY };
    S.current.joyActive = true;
  };
  const handleJoyMove = (e) => {
    if (!S.current.joyActive) return;
    const t = e.touches[0];
    const dx = t.clientX - joyBaseRef.current.x;
    const dy = t.clientY - joyBaseRef.current.y;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, 44);
    S.current.joyVec = mag > 6 ? { x: (dx / mag) * (clamped / 44), y: (dy / mag) * (clamped / 44) } : { x: 0, y: 0 };
  };
  const handleJoyEnd = () => {
    S.current.joyActive = false;
    S.current.joyVec = { x: 0, y: 0 };
  };
  const handleAimTouch = (e) => {
    const t = e.touches[0];
    S.current.aim = canvasPointFromEvent(t.clientX, t.clientY);
    tryFire();
  };

  const handleForfeit = () => {
    onEndGame?.();
    onClose?.();
  };

  if (!isP1 && !isP2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🎖️</div>
          <h2 className="text-white text-xl font-bold mb-2">Tank Battle</h2>
          <p className="text-gray-400 text-sm mb-4">{p1Name} vs {p2Name} — spectating!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">🎖️ Tank Battle</span>
        <div className="flex items-center gap-3">
          <GameRulesButton gameType="tank_battle" />
          <button onClick={() => setSoundEnabled((v) => !v)} className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title="End Battle">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/60 shrink-0">
        <div className="flex-1">
          <div className="text-[11px] text-gray-400 mb-0.5">You ({myHP <= 0 ? 'destroyed' : `${Math.max(0, myHP)} HP`})</div>
          <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(0, myHP)}%` }} />
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] text-gray-400 mb-0.5 text-right">{isP1 ? p2Name : p1Name} ({oppHP <= 0 ? 'destroyed' : `${Math.max(0, oppHP)} HP`})</div>
          <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-red-500 ml-auto transition-all" style={{ width: `${Math.max(0, oppHP)}%` }} />
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{ touchAction: 'none', cursor: isTouchDevice ? 'default' : 'crosshair' }}
        />
        {isTouchDevice && canPlay && (
          <>
            <div
              className="absolute bottom-6 left-6 w-24 h-24 rounded-full bg-white/10 border border-white/20"
              onTouchStart={handleJoyStart}
              onTouchMove={handleJoyMove}
              onTouchEnd={handleJoyEnd}
            />
            <div
              className="absolute bottom-6 right-6 w-24 h-24 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center text-white text-xs font-bold"
              onTouchStart={handleAimTouch}
            >
              FIRE
            </div>
          </>
        )}
        {!isEnded && countingDown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-white text-6xl font-black">{countingDown}</span>
          </div>
        )}
        {isEnded && (
          <GameWinnerBanner
            winner={gameState?.winner_id ? players?.find((p) => String(p.user_id) === String(gameState.winner_id)) : null}
            gameType="tank_battle"
            gameStats={{
              lines: [
                { label: p1Name, value: `${Math.max(0, Number(scores[p1Id] ?? 0))} HP` },
                { label: p2Name, value: `${Math.max(0, Number(scores[p2Id] ?? 0))} HP` },
              ],
            }}
            isForfeit={gameState?.status === 'forfeited'}
            onClose={onClose}
            onPostResult={onPostResult}
          />
        )}
      </div>

      {!isTouchDevice && !isEnded && (
        <div className="px-4 py-2 bg-gray-900/60 shrink-0 text-center text-[11px] text-gray-500">
          WASD/Arrows to move · Mouse to aim · Click or Space to fire
        </div>
      )}
    </div>
  );
}
