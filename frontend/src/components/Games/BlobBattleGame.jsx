import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Blob Battle — an Agar.io-style real-time free-for-all (2-8 players).
// Every player self-reports their own position via state_sync (same as
// tank_battle/bomberman/football), but MASS is authoritatively tracked
// server-side (see blob_battle.go's file-level note) — this component only
// ever reports "I ate pellet N" / "I ate player X" as discrete, validated
// actions, never a raw mass value.
//
// Unlike the other real-time games in this package, movement here follows
// the genre-standard "move toward the cursor" scheme (not WASD) — bigger
// blobs move slower, matching the real Agar.io feel players would expect.

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/tank_battle';
const SOUND_FILES = { eat: `${SOUND_BASE}/hit.wav`, eliminated: `${SOUND_BASE}/explosion.wav` };
let blobSoundEnabled = true;
function playBlobSound(name, { volume = 0.5 } = {}) {
  if (!blobSoundEnabled) return;
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

// Must match blob_battle.go's constants exactly.
const ARENA_SIZE = 2000;
const STARTING_MASS = 20;
const PELLET_MASS_GAIN = 2;
const EAT_MASS_RATIO = 1.15;
const PELLET_R = 6;
const BASE_SPEED = 220; // px/sec at starting mass
const STATE_SYNC_MS = 60;
const REMOTE_EXTRAPOLATION_CAP_S = 0.3;

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];

function massToRadius(mass) { return 10 + Math.sqrt(Math.max(0, mass)) * 3; }
function speedForMass(mass) { return BASE_SPEED / (1 + mass / 40); }

function spawnFor(index, total) {
  const angle = (2 * Math.PI * index) / Math.max(1, total);
  const radius = ARENA_SIZE * 0.35;
  const cx = ARENA_SIZE / 2, cy = ARENA_SIZE / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function estimateSendVelocity(track, x, y, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const vx = (x - (track.x ?? x)) / dtSec;
  const vy = (y - (track.y ?? y)) / dtSec;
  track.x = x; track.y = y; track.t = now;
  const cap = BASE_SPEED * 3;
  return { vx: Math.max(-cap, Math.min(cap, vx)), vy: Math.max(-cap, Math.min(cap, vy)) };
}
function extrapolatePos(anchor, now) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_EXTRAPOLATION_CAP_S);
  return {
    x: Math.max(0, Math.min(ARENA_SIZE, anchor.x + anchor.vx * elapsedS)),
    y: Math.max(0, Math.min(ARENA_SIZE, anchor.y + anchor.vy * elapsedS)),
  };
}

export default function BlobBattleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'playing';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  const myId = String(currentUserId);

  const orderedPlayers = useMemo(() => players || [], [players]);
  const myIndex = orderedPlayers.findIndex((p) => String(p.user_id) === myId);
  const isPlayer = myIndex >= 0;

  const pellets = useMemo(() => gs.pellets || [], [gs.pellets]);
  const eatenPellets = useMemo(() => new Set((gs.eaten_pellets || []).map(Number)), [gs.eaten_pellets]);
  const massMap = useMemo(() => gs.mass || {}, [gs.mass]);
  const aliveMap = useMemo(() => gs.players_alive || {}, [gs.players_alive]);
  const myMass = Number(massMap[myId] ?? STARTING_MASS);
  const iAmAlive = aliveMap[myId] !== false;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('blob_battle_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    blobSoundEnabled = soundEnabled;
    try { localStorage.setItem('blob_battle_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
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

  const mySpawn = myIndex >= 0 ? spawnFor(myIndex, orderedPlayers.length) : spawnFor(0, 1);

  const S = useRef({
    my: { x: mySpawn.x, y: mySpawn.y, vx: 0, vy: 0 },
    remoteAnchors: {}, // userId -> {x,y,vx,vy,t}
    sendTrack: { x: mySpawn.x, y: mySpawn.y, t: 0 },
    mouseTarget: { x: mySpawn.x + 40, y: mySpawn.y },
    joyVec: { x: 0, y: 0 },
    lastStateSyncAt: 0,
    pendingPelletClaims: new Set(), // avoid spamming the same pellet every frame while overlapping it
    pendingEatAttempts: new Set(),
  });

  // Seed/refresh remote player anchors.
  useEffect(() => {
    for (const p of orderedPlayers) {
      const pid = String(p.user_id);
      if (pid === myId) continue;
      const snap = gs[`player_${pid}`];
      if (snap && typeof snap === 'object') {
        const idx = orderedPlayers.findIndex((pp) => String(pp.user_id) === pid);
        const spawn = spawnFor(idx, orderedPlayers.length);
        if (!S.current.remoteAnchors[pid]) {
          S.current.remoteAnchors[pid] = { x: spawn.x, y: spawn.y, vx: 0, vy: 0, t: Date.now() };
        }
        const a = S.current.remoteAnchors[pid];
        a.x = typeof snap.x === 'number' ? snap.x : a.x;
        a.y = typeof snap.y === 'number' ? snap.y : a.y;
        a.vx = typeof snap.vx === 'number' ? snap.vx : 0;
        a.vy = typeof snap.vy === 'number' ? snap.vy : 0;
        a.t = Date.now();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(orderedPlayers.map((p) => gs[`player_${p.user_id}`]))]);

  const canPlay = isPlayer && !isEnded && countingDown === 0 && iAmAlive;

  // Sound/haptic feedback: my own mass growing means I ate a pellet or
  // player; being eliminated is handled separately.
  const prevMassRef = useRef(myMass);
  useEffect(() => {
    if (myMass > prevMassRef.current) playBlobSound('eat', { volume: 0.3 });
    prevMassRef.current = myMass;
  }, [myMass]);
  const prevAliveRef = useRef(iAmAlive);
  useEffect(() => {
    if (prevAliveRef.current && !iAmAlive) { playBlobSound('eliminated', { volume: 0.5 }); hapticImpact([30, 60, 30]); }
    prevAliveRef.current = iAmAlive;
  }, [iAmAlive]);

  // ── Desktop mouse-follow input ────────────────────────────────────────
  const canvasPointToWorld = useCallback((clientX, clientY, camX, camY, zoom) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: camX, y: camY };
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left, screenY = clientY - rect.top;
    const worldX = camX + (screenX - rect.width / 2) / zoom;
    const worldY = camY + (screenY - rect.height / 2) / zoom;
    return { x: worldX, y: worldY };
  }, []);

  const lastZoomRef = useRef(1);
  const handleMouseMove = useCallback((e) => {
    if (isTouchDevice) return;
    const s = S.current;
    const world = canvasPointToWorld(e.clientX, e.clientY, s.my.x, s.my.y, lastZoomRef.current);
    s.mouseTarget = world;
  }, [canvasPointToWorld]);

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

    const draw = () => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const s = S.current;

      if (canPlay) {
        let dx = 0, dy = 0;
        if (isTouchDevice) {
          dx = s.joyVec.x; dy = s.joyVec.y;
        } else {
          dx = s.mouseTarget.x - s.my.x;
          dy = s.mouseTarget.y - s.my.y;
        }
        const mag = Math.hypot(dx, dy);
        const speed = speedForMass(myMass);
        if (mag > 2) {
          dx /= mag; dy /= mag;
          const step = Math.min(speed * dt, mag);
          s.my.x = Math.max(0, Math.min(ARENA_SIZE, s.my.x + dx * step));
          s.my.y = Math.max(0, Math.min(ARENA_SIZE, s.my.y + dy * step));
          s.my.vx = dx * speed;
          s.my.vy = dy * speed;
        } else {
          s.my.vx = 0; s.my.vy = 0;
        }

        const nowMs = Date.now();
        if (nowMs - s.lastStateSyncAt > STATE_SYNC_MS) {
          s.lastStateSyncAt = nowMs;
          const { vx, vy } = estimateSendVelocity(s.sendTrack, s.my.x, s.my.y, nowMs);
          onMove({ move_type: 'state_sync', x: s.my.x, y: s.my.y, vx, vy });
        }

        // Pellet collision — claim any uneaten pellet I currently overlap,
        // deduped locally so I don't spam identical claims every frame.
        const myR = massToRadius(myMass);
        for (const p of pellets) {
          if (eatenPellets.has(Number(p.id))) continue;
          if (s.pendingPelletClaims.has(p.id)) continue;
          const d = Math.hypot(p.x - s.my.x, p.y - s.my.y);
          if (d < myR + PELLET_R) {
            s.pendingPelletClaims.add(p.id);
            onMove({ move_type: 'eat_pellet', pellet_id: p.id });
          }
        }

        // Player-vs-player collision — attempt to eat any sufficiently
        // smaller overlapping player. The backend is the real authority
        // (see blob_battle.go); a rejected attempt is a harmless no-op.
        for (const p of orderedPlayers) {
          const pid = String(p.user_id);
          if (pid === myId) continue;
          if (aliveMap[pid] === false) continue;
          const a = s.remoteAnchors[pid];
          if (!a) continue;
          const pos = extrapolatePos(a, Date.now());
          const targetMass = Number(massMap[pid] ?? STARTING_MASS);
          const targetR = massToRadius(targetMass);
          const d = Math.hypot(pos.x - s.my.x, pos.y - s.my.y);
          if (d < myR - targetR * 0.3 && myMass >= targetMass * EAT_MASS_RATIO) {
            if (!s.pendingEatAttempts.has(pid)) {
              s.pendingEatAttempts.add(pid);
              onMove({ move_type: 'eat_player', target_player_id: Number(pid) });
              setTimeout(() => s.pendingEatAttempts.delete(pid), 500);
            }
          }
        }
      }

      // ── Render ──
      const myR = massToRadius(myMass);
      const zoom = Math.max(0.35, Math.min(1.3, 55 / myR));
      lastZoomRef.current = zoom;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-s.my.x, -s.my.y);

      // Arena background + border
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, ARENA_SIZE, ARENA_SIZE);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, ARENA_SIZE, ARENA_SIZE);
      // Faint grid for spatial reference
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= ARENA_SIZE; gx += 100) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, ARENA_SIZE); ctx.stroke();
      }
      for (let gy = 0; gy <= ARENA_SIZE; gy += 100) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(ARENA_SIZE, gy); ctx.stroke();
      }

      // Pellets
      ctx.fillStyle = '#4ade80';
      for (const p of pellets) {
        if (eatenPellets.has(Number(p.id))) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PELLET_R, 0, Math.PI * 2);
        ctx.fill();
      }

      // Other players
      orderedPlayers.forEach((p, idx) => {
        const pid = String(p.user_id);
        if (pid === myId) return;
        if (aliveMap[pid] === false) return;
        const pos = extrapolatePos(s.remoteAnchors[pid] || { x: -9999, y: -9999, vx: 0, vy: 0, t: Date.now() }, Date.now());
        const r = massToRadius(Number(massMap[pid] ?? STARTING_MASS));
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'white';
        ctx.font = `${Math.max(10, r * 0.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.username || 'Player', pos.x, pos.y + r + 14);
      });

      // My own blob
      if (iAmAlive) {
        ctx.beginPath();
        ctx.arc(s.my.x, s.my.y, myR, 0, Math.PI * 2);
        ctx.fillStyle = PLAYER_COLORS[myIndex >= 0 ? myIndex % PLAYER_COLORS.length : 0];
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, myMass, myIndex, iAmAlive, JSON.stringify(pellets), JSON.stringify([...eatenPellets]), JSON.stringify(massMap), JSON.stringify(aliveMap), myId, onMove]);

  // ── Touch joystick ────────────────────────────────────────────────────
  const joyBaseRef = useRef({ x: 0, y: 0 });
  const handleJoyStart = (e) => {
    const t = e.touches[0];
    joyBaseRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleJoyMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - joyBaseRef.current.x;
    const dy = t.clientY - joyBaseRef.current.y;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, 44);
    S.current.joyVec = mag > 6 ? { x: (dx / mag) * (clamped / 44), y: (dy / mag) * (clamped / 44) } : { x: 0, y: 0 };
  };
  const handleJoyEnd = () => { S.current.joyVec = { x: 0, y: 0 }; };

  const handleForfeit = () => {
    onEndGame?.();
    onClose?.();
  };

  const leaderboard = useMemo(() => {
    return orderedPlayers
      .map((p) => ({ ...p, mass: Number(massMap[String(p.user_id)] ?? STARTING_MASS), alive: aliveMap[String(p.user_id)] !== false }))
      .filter((p) => p.alive)
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 5);
  }, [orderedPlayers, massMap, aliveMap]);

  if (!isPlayer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔵</div>
          <h2 className="text-white text-xl font-bold mb-2">Blob Battle</h2>
          <p className="text-gray-400 text-sm mb-4">Spectating this match!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">🔵 Blob Battle</span>
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 font-bold text-sm">Mass: {Math.round(myMass)}</span>
          <GameRulesButton gameType="blob_battle" />
          <button onClick={() => setSoundEnabled((v) => !v)} className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title="End Match">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseMove={handleMouseMove}
          style={{ touchAction: 'none', cursor: isTouchDevice ? 'default' : 'crosshair' }}
        />

        <div className="absolute top-3 right-3 bg-black/50 rounded-lg px-3 py-2 text-xs text-white">
          <div className="font-bold mb-1 text-gray-300">Leaderboard</div>
          {leaderboard.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-2">
              <span className="text-gray-400">{i + 1}.</span>
              <span style={{ color: PLAYER_COLORS[orderedPlayers.findIndex((pp) => pp.user_id === p.user_id) % PLAYER_COLORS.length] }}>
                {p.username || 'Player'}
              </span>
              <span className="text-gray-400 ml-auto">{Math.round(p.mass)}</span>
            </div>
          ))}
        </div>

        {isTouchDevice && canPlay && (
          <div
            className="absolute bottom-6 left-6 w-24 h-24 rounded-full bg-white/10 border border-white/20"
            onTouchStart={handleJoyStart}
            onTouchMove={handleJoyMove}
            onTouchEnd={handleJoyEnd}
          />
        )}
        {!isEnded && countingDown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-white text-6xl font-black">{countingDown}</span>
          </div>
        )}
        {!isEnded && !iAmAlive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
            <span className="text-white text-2xl font-bold">💥 You were eaten!</span>
          </div>
        )}
        {isEnded && (
          <GameWinnerBanner
            winner={gameState?.winner_id ? orderedPlayers.find((p) => String(p.user_id) === String(gameState.winner_id)) : null}
            gameType="blob_battle"
            gameStats={{
              lines: orderedPlayers.map((p) => ({
                label: p.username, value: `${Math.round(Number(massMap[String(p.user_id)] ?? STARTING_MASS))} mass`,
              })),
            }}
            isForfeit={gameState?.status === 'forfeited'}
            onClose={onClose}
            onPostResult={onPostResult}
          />
        )}
      </div>

      {!isTouchDevice && !isEnded && (
        <div className="px-4 py-2 bg-gray-900/60 shrink-0 text-center text-[11px] text-gray-500">
          Move your mouse to steer — eat pellets to grow, avoid bigger blobs, eat smaller ones!
        </div>
      )}
    </div>
  );
}
