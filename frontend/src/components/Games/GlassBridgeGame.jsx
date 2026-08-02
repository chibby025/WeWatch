import { useCallback, useEffect, useRef, useState } from 'react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const SPRITE_BASE = 'https://letswatchout.b-cdn.net/games/sprites/glass_bridge';
const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/glass_bridge';
const SOUNDS = {
  strain: `${SOUND_BASE}/glass_strain.mp3`,
  glassbreak: `${SOUND_BASE}/glassbreak_v2.mp3`,
};

function playSound(url) {
  const audio = new Audio(url);
  audio.volume = 0.6;
  audio.play().catch(() => {}); // autoplay-policy rejections are fine to swallow
}
const SPRITE_H = 46; // on-screen display height; width follows the image's own aspect ratio

// Two hand-made top-down character looks. Players 1 & 2 get their natural
// colours; player 3+ reuse the same two looks with a hue-shift on top (see
// hueForPlayer below) so everyone stays visually distinct without needing
// more source art.
const CHARACTERS = [
  { alive: `${SPRITE_BASE}/char1_alive.webp`, dead: `${SPRITE_BASE}/char1_dead_v2.webp` },
  { alive: `${SPRITE_BASE}/char2_alive.webp`, dead: `${SPRITE_BASE}/char2_dead_v2.webp` },
];
const EXTRA_HUES = [140, 220, 300, 40, 180, 60]; // for players beyond the first 2

function charIdxForPlayer(i) {
  return i % CHARACTERS.length;
}
function hueForPlayer(i) {
  return i < CHARACTERS.length ? 0 : EXTRA_HUES[(i - CHARACTERS.length) % EXTRA_HUES.length];
}

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

// Board layout constants — visual rows/tiles AND the sprite-overlay math below
// both derive from these, so a sprite always lands exactly on its tile.
const ROW_H = 56;
const ROW_GAP = 12; // widened from 8 to leave room for a visible cross-plank
const START_ZONE_H = 60;
const FINISH_ZONE_H = 52;
const LEFT_PCT = 25;
const RIGHT_PCT = 75;
const RAIL_MARGIN = 16; // rope rails sit this far outside the tile area
const PLANK_H = 7;

const WALK_DURATION_MS = 550;
const FALL_DURATION_MS = 900;

function boardHeight(slots) {
  return START_ZONE_H + slots * ROW_H + (slots - 1) * ROW_GAP + FINISH_ZONE_H;
}

function rowTop(row) {
  return START_ZONE_H + row * (ROW_H + ROW_GAP) + ROW_H / 2;
}

function plankYs(slots) {
  const ys = [START_ZONE_H];
  for (let i = 0; i < slots - 1; i++) {
    ys.push(START_ZONE_H + i * (ROW_H + ROW_GAP) + ROW_H + ROW_GAP / 2);
  }
  ys.push(START_ZONE_H + slots * (ROW_H + ROW_GAP) - ROW_GAP);
  return ys;
}

// ── Sprite ──────────────────────────────────────────────────────────────────

// Static full-body character art (no frame sheet) — movement is faked with a
// bounce while walking, an idle sway while standing, and a punch+swap to the
// "dead" image on a fall, rather than a stepped frame animation.
function BridgeSprite({ charIdx = 0, anim = 'idle', hue = 0 }) {
  const char = CHARACTERS[charIdx % CHARACTERS.length];
  const isDead = anim === 'falling';
  const filter = `${hue ? `hue-rotate(${hue}deg) saturate(1.2) ` : ''}drop-shadow(0 3px 3px rgba(0,0,0,0.5))`;
  const animation = isDead ? 'gbFallPunch 0.5s ease-out'
    : anim === 'walking' ? 'gbBounce 0.35s ease-in-out infinite'
    : 'gbIdleSway 2.4s ease-in-out infinite';
  return (
    <img src={isDead ? char.dead : char.alive} alt=""
      style={{ height: SPRITE_H, width: 'auto', filter, animation, transformOrigin: 'center bottom' }}
    />
  );
}

// Static "downed" marker left on a tile once someone has fallen there —
// the same dead-pose art, rotated to lie flat and dimmed to read as "past."
function DeadAvatar({ charIdx = 0, hue = 0 }) {
  const char = CHARACTERS[charIdx % CHARACTERS.length];
  const filter = `${hue ? `hue-rotate(${hue}deg) ` : ''}grayscale(0.35) brightness(0.78) drop-shadow(0 2px 3px rgba(0,0,0,0.5))`;
  return (
    <img src={char.dead} alt=""
      style={{ height: SPRITE_H * 0.85, width: 'auto', filter, transform: 'rotate(90deg)', opacity: 0.85 }}
    />
  );
}

function ShatterBurst() {
  const shards = Array.from({ length: 7 }, (_, i) => i);
  return (
    <div style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, pointerEvents: 'none' }}>
      {shards.map(i => {
        const angle = (i / shards.length) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 26 + Math.random() * 20;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 10;
        const size = 5 + (i % 3) * 2;
        return (
          <span key={i} style={{
            position: 'absolute', width: size, height: size,
            background: 'linear-gradient(160deg,#f0f9ff,#93c5fd 60%,#3b82f6)',
            border: '0.5px solid rgba(255,255,255,0.7)',
            clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
            '--dx': `${dx}px`, '--dy': `${dy}px`,
            animation: 'gbShard 0.6s ease-out forwards',
          }} />
        );
      })}
    </div>
  );
}

// Permanent cracked-glass decal for a tile someone has actually fallen
// through — distinct from ShatterBurst, which is the one-time "it just
// broke" moment. This is the lasting scar left behind afterward. Built as
// radiating triangular glass shard pieces (not just crack lines) so it reads
// as an actual broken pane, not a scratch.
function CrackOverlay() {
  const center = [48, 45];
  // A loop of boundary points well outside the 0-100 viewBox so every wedge
  // fully covers the tile edge-to-edge regardless of aspect ratio.
  const boundary = [
    [15, -8], [55, -10], [95, -6], [110, 28], [112, 65],
    [85, 108], [45, 112], [5, 100], [-10, 60], [-8, 20],
  ];
  const opacities = [0.16, 0.24, 0.13, 0.28, 0.18, 0.22, 0.15, 0.26, 0.17, 0.2];

  const wedges = boundary.map((pt, i) => {
    const next = boundary[(i + 1) % boundary.length];
    return `${center.join(',')} ${pt.join(',')} ${next.join(',')}`;
  });

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {wedges.map((points, i) => (
        <polygon key={i} points={points}
          fill={`rgba(203,224,255,${opacities[i]})`}
          stroke="rgba(240,249,255,0.6)" strokeWidth="0.8" />
      ))}
      {/* Outer fracture lines drawn again, darker, for contrast against any tile background */}
      {wedges.map((points, i) => (
        <polygon key={`edge-${i}`} points={points}
          fill="none" stroke="rgba(8,15,35,0.45)" strokeWidth="0.5" />
      ))}
      <circle cx={center[0]} cy={center[1]} r="3.2" fill="rgba(8,15,35,0.4)" />
      <circle cx={center[0]} cy={center[1]} r="1.4" fill="rgba(240,249,255,0.6)" />
    </svg>
  );
}

// A few tiny shard flecks that continuously drift/fall and fade-reset within
// a broken tile's bounds, forever — an ongoing "this glass is still crumbling"
// tell layered on top of the permanent CrackOverlay decal, not a one-time effect.
function AmbientShards() {
  const flecks = [
    { left: '22%', size: 4, dur: 2.4, delay: 0 },
    { left: '58%', size: 3, dur: 3.1, delay: 0.8 },
    { left: '40%', size: 5, dur: 2.8, delay: 1.6 },
    { left: '75%', size: 3, dur: 3.6, delay: 0.4 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {flecks.map((f, i) => (
        <span key={i} style={{
          position: 'absolute', top: '30%', left: f.left,
          width: f.size, height: f.size,
          background: 'linear-gradient(160deg,#f0f9ff,#93c5fd 60%,#3b82f6)',
          border: '0.5px solid rgba(255,255,255,0.6)',
          clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
          animation: `gbAmbientFall ${f.dur}s ${f.delay}s ease-in infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function GlassBridgeGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const slots = gs.slots || 6;
  const revealed = gs.revealed || [];
  const safeSides = gs.safe_sides || [];
  const positions = gs.positions || {};
  const phase = gs.phase || 'playing';
  const attempts = gs.attempts || {};
  const moveSeq = gs.move_seq ?? 0;
  const lastActorId = gs.last_actor_id ?? null;
  const lastResult = gs.last_result || '';
  const lastSlot = gs.last_slot ?? -1;
  const lastSide = gs.last_side || '';
  const frontierPosition = gs.frontier_position ?? -1;

  const myKey = String(currentUserId);
  const myPos = positions[myKey] ?? -1;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = (players || [])[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;

  const [announcement, setAnnouncement] = useState(null);
  const announceTimerRef = useRef(null);
  const [animPhase, setAnimPhase] = useState({});     // { [userKey]: 'idle'|'walking'|'falling' }
  const [fallOverlay, setFallOverlay] = useState({});  // { [userKey]: { slot, side } }
  const [shatter, setShatter] = useState(null);        // { row, side, id }
  const [deadMarkers, setDeadMarkers] = useState({});  // { 'row-side': { charIdx, hue } } — persists for the whole game
  const prevMoveSeqRef = useRef(moveSeq);
  const timersRef = useRef([]);

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2600);
  }, []);

  useEffect(() => () => {
    clearTimeout(announceTimerRef.current);
    timersRef.current.forEach(clearTimeout);
  }, []);

  // Edge-detect a new move via the monotonic move_seq — fires the correct
  // animation for every connected client, not just the mover.
  useEffect(() => {
    if (moveSeq <= prevMoveSeqRef.current || !lastActorId) {
      prevMoveSeqRef.current = moveSeq;
      return;
    }
    prevMoveSeqRef.current = moveSeq;

    const actorKey = String(lastActorId);
    const actorIdx = (players || []).findIndex(p => String(p.user_id) === actorKey);
    const actor = actorIdx >= 0 ? players[actorIdx] : null;
    const actorName = actor?.username || 'Someone';
    const safeActorIdx = actorIdx >= 0 ? actorIdx : 0;

    if (lastResult === 'fell') {
      playSound(SOUNDS.glassbreak);
      setFallOverlay(prev => ({ ...prev, [actorKey]: { slot: lastSlot, side: lastSide } }));
      setAnimPhase(prev => ({ ...prev, [actorKey]: 'falling' }));
      setShatter({ row: lastSlot, side: lastSide, id: Date.now() });
      // The crack + downed marker are permanent — set once, never cleared.
      setDeadMarkers(prev => ({
        ...prev,
        [`${lastSlot}-${lastSide}`]: { charIdx: charIdxForPlayer(safeActorIdx), hue: hueForPlayer(safeActorIdx) },
      }));
      announce({
        icon: '💥', text: 'FELL THROUGH!', sub: `${actorName}'s tile shattered — back to start!`,
        bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
      });
      const t1 = setTimeout(() => {
        setFallOverlay(prev => {
          const next = { ...prev };
          delete next[actorKey];
          return next;
        });
        setAnimPhase(prev => ({ ...prev, [actorKey]: 'idle' }));
      }, FALL_DURATION_MS);
      const t2 = setTimeout(() => setShatter(s => (s && s.id === t1 ? null : s)), FALL_DURATION_MS + 50);
      timersRef.current.push(t1, t2);
    } else if (lastResult === 'advanced' || lastResult === 'crossed') {
      // Not every tile strains audibly underfoot — only play it some of the time.
      if (Math.random() < 0.3) playSound(SOUNDS.strain);
      setAnimPhase(prev => ({ ...prev, [actorKey]: 'walking' }));
      if (lastResult === 'crossed') {
        announce({
          icon: '🏆', text: 'CROSSED!', sub: `${actorName} made it across the bridge!`,
          bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
        });
      }
      const t = setTimeout(() => {
        setAnimPhase(prev => ({ ...prev, [actorKey]: 'idle' }));
      }, WALK_DURATION_MS);
      timersRef.current.push(t);
    }
  }, [moveSeq, lastActorId, lastResult, lastSlot, lastSide, players, announce]);

  function handleStep(side) {
    if (!isMyTurn || phase !== 'playing') return;
    onMove({ move_type: 'step', side });
  }

  // Where does this player's sprite currently belong on the board?
  function renderPosFor(uid) {
    const key = String(uid);
    const override = fallOverlay[key];
    if (override) return { zone: 'row', row: override.slot, side: override.side };
    const pos = positions[key] ?? -1;
    if (pos === -1) return { zone: 'start' };
    if (pos === slots - 1) return { zone: 'finish' };
    const side = safeSides[pos] || 'left';
    return { zone: 'row', row: pos, side };
  }

  const allPlayers = players || [];
  // Group players sharing the exact same visual spot so we can jitter them apart.
  const spotGroups = {};
  allPlayers.forEach(p => {
    const rp = renderPosFor(p.user_id);
    const spotKey = rp.zone === 'row' ? `row-${rp.row}-${rp.side}` : rp.zone;
    (spotGroups[spotKey] = spotGroups[spotKey] || []).push(p.user_id);
  });

  function topLeftFor(uid, rp) {
    let top, leftPct;
    if (rp.zone === 'start') {
      top = START_ZONE_H / 2;
      leftPct = 50;
    } else if (rp.zone === 'finish') {
      top = START_ZONE_H + slots * (ROW_H + ROW_GAP) - ROW_GAP + FINISH_ZONE_H / 2;
      leftPct = 50;
    } else {
      top = rowTop(rp.row);
      leftPct = rp.side === 'right' ? RIGHT_PCT : LEFT_PCT;
    }
    const spotKey = rp.zone === 'row' ? `row-${rp.row}-${rp.side}` : rp.zone;
    const group = spotGroups[spotKey] || [uid];
    const idx = group.indexOf(uid);
    const jitter = group.length > 1 ? (idx - (group.length - 1) / 2) * 16 : 0;
    return { top, leftPct, jitter };
  }

  // Turn spotlight — the row the active player is about to attempt.
  const spotlightRow = phase === 'playing' && currentPlayer ? (positions[String(currentPlayer.user_id)] ?? -1) + 1 : -1;

  const platformCells = Array.from({ length: slots }, (_, i) => ({
    index: i,
    isRevealed: !!revealed[i],
    safeSide: safeSides[i] || '',
  }));

  const railHeight = boardHeight(slots);
  const railTotalWidth = 300 + RAIL_MARGIN * 2;
  const planks = plankYs(slots);

  const isGameOver = phase === 'ended' || gameState?.status === 'forfeited' || gameState?.status === 'finished';
  const winner = gameState?.winner_id ? (allPlayers.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw';
  const gameStats = {
    lines: allPlayers.map(p => {
      const pos = positions[String(p.user_id)] ?? -1;
      const wrongCount = attempts[String(p.user_id)] || 0;
      const posLabel = pos < 0 ? '0' : pos === slots - 1 ? `${slots}` : `${pos + 1}`;
      return { label: p.username, value: `Slot ${posLabel}/${slots} · ${wrongCount} fall${wrongCount === 1 ? '' : 's'}` };
    }),
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex flex-col text-white select-none overflow-y-auto"
      style={{ background: 'linear-gradient(180deg,#0f172a 0%,#1e1b4b 45%,#0f172a 100%)' }}>
      <style>{`
        @keyframes gbIdleSway {
          0%,100% { transform: translateY(0) scale(1,1); }
          50%     { transform: translateY(-1.5px) scale(1.01,1); }
        }
        @keyframes gbBounce {
          0%,100% { transform: translateY(0) scale(1,1); }
          50%     { transform: translateY(-5px) scale(0.96,1.04); }
        }
        @keyframes gbFallPunch {
          0%   { transform: scale(1) rotate(0deg); }
          30%  { transform: scale(1.3) rotate(-8deg); }
          60%  { transform: scale(0.92) rotate(4deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes gbShard {
          0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--dx),var(--dy)) rotate(220deg); opacity: 0; }
        }
        @keyframes gbSpotlight {
          0%,100% { opacity: 0.35; } 50% { opacity: 0.85; }
        }
        @keyframes gbFrontierGlow {
          0%,100% { opacity: 0.4; box-shadow: 0 0 10px 2px rgba(251,191,36,0.5) inset; }
          50%     { opacity: 0.9; box-shadow: 0 0 16px 4px rgba(251,191,36,0.85) inset; }
        }
        @keyframes gbTapPulse {
          0%,100% { transform: scale(1);    opacity: 1; }
          50%     { transform: scale(1.1); opacity: 0.65; }
        }
        @keyframes gbAmbientFall {
          0%   { transform: translateY(-6px) rotate(0deg);  opacity: 0; }
          15%  { opacity: 0.85; }
          100% { transform: translateY(30px) rotate(200deg); opacity: 0; }
        }
        @keyframes gbBannerIn {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.8); }
          15%  { opacity: 1; transform: translate(-50%,-50%) scale(1.06); }
          25%  { transform: translate(-50%,-50%) scale(1); }
          80%  { opacity: 1; }
          100% { opacity: 0; transform: translate(-50%,-50%) scale(0.94); }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/30 border-b border-white/10 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-bold text-cyan-300">Glass Bridge</h2>
          <p className="text-xs text-gray-400">
            {phase === 'playing'
              ? isMyTurn ? 'Your turn — choose a side!' : `Waiting for ${currentPlayer?.username || '...'}…`
              : 'Game Over'}
          </p>
          {isMyTurn && phase === 'playing' && (
            <span style={{
              display: 'inline-block', marginTop: 2,
              fontSize: 11, fontWeight: 900, color: '#fbbf24',
              textShadow: '0 0 8px rgba(251,191,36,0.75)',
              animation: 'gbTapPulse 0.9s ease-in-out infinite',
            }}>
              👆 Choose a side!
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <GameRulesButton gameType="glass_bridge" className="text-white/60 hover:text-white" />
          {onEndGame && (
            <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">
              End
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Bridge */}
        <div className="mb-6 mx-auto" style={{ maxWidth: 300 }}>
          <div className="relative" style={{ height: boardHeight(slots) }}>

              {/* Void backdrop — the abyss beneath the bridge */}
              <div className="absolute pointer-events-none" style={{
                top: 0, left: -RAIL_MARGIN, width: railTotalWidth, height: railHeight,
                background: 'radial-gradient(ellipse 70% 100% at 50% 40%, rgba(30,27,75,0.5), rgba(2,6,23,0.85) 75%)',
                borderRadius: 12,
              }}>
                {[[12, 8], [88, 22], [30, 55], [70, 68], [50, 90], [15, 78], [92, 45]].map(([lx, ly], i) => (
                  <span key={i} className="absolute rounded-full bg-white" style={{
                    left: `${lx}%`, top: `${ly}%`, width: 2, height: 2, opacity: 0.35 + (i % 3) * 0.1,
                  }} />
                ))}
              </div>

              {/* Rope rails */}
              {['left', 'right'].map(edge => (
                <div key={edge} className="absolute top-0 rounded-full" style={{
                  [edge]: -RAIL_MARGIN, width: 6, height: railHeight,
                  background: 'repeating-linear-gradient(45deg, #9a7b46 0px, #9a7b46 3px, #6b4f28 3px, #6b4f28 6px)',
                  boxShadow: '0 0 6px rgba(0,0,0,0.6), inset 0 0 2px rgba(255,255,255,0.25)',
                }}>
                  {platformCells.map(cell => (
                    <span key={cell.index} className="absolute rounded-full" style={{
                      top: rowTop(cell.index) - 3, left: -1.5, width: 9, height: 9,
                      background: 'radial-gradient(circle,#d1d5db,#4b5563)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                    }} />
                  ))}
                </div>
              ))}

              {/* Cross-planks connecting the rails at each row boundary */}
              {planks.map((y, i) => (
                <div key={i} className="absolute" style={{
                  top: y - PLANK_H / 2, left: -RAIL_MARGIN, width: railTotalWidth, height: PLANK_H,
                  background: 'linear-gradient(180deg,#a9835a,#6f4e2e)',
                  borderRadius: 3,
                  boxShadow: '0 2px 3px rgba(0,0,0,0.5)',
                }} />
              ))}

              {/* Start zone */}
              <div className="absolute left-0 right-0 flex items-center justify-center"
                style={{ top: 0, height: START_ZONE_H }}>
                <span className="text-[10px] tracking-wider text-cyan-300/70 font-bold">START</span>
              </div>

              {/* Platform rows */}
              {platformCells.map(cell => {
                const isSpotlit = cell.index === spotlightRow && !cell.isRevealed;
                return (
                  <div key={cell.index} className="absolute left-0 right-0 flex gap-2"
                    style={{ top: START_ZONE_H + cell.index * (ROW_H + ROW_GAP), height: ROW_H }}>
                    <span className="absolute -left-5 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{cell.index + 1}</span>

                    {['left', 'right'].map(side => {
                      const isSafeRevealed = cell.isRevealed && cell.safeSide === side;
                      const isWrongRevealed = cell.isRevealed && cell.safeSide && cell.safeSide !== side;
                      const clickable = isMyTurn && phase === 'playing' && myPos === cell.index - 1;
                      const deadMarker = deadMarkers[`${cell.index}-${side}`];
                      const isFrontier = cell.index === frontierPosition && isSafeRevealed;
                      return (
                        <button
                          key={side}
                          onClick={() => handleStep(side)}
                          disabled={!clickable}
                          className="relative flex-1 rounded-lg transition-all active:scale-95 overflow-hidden"
                          style={{
                            background: isSafeRevealed
                              ? 'linear-gradient(160deg,rgba(34,197,94,0.35),rgba(21,128,61,0.25))'
                              : isWrongRevealed
                                ? 'linear-gradient(160deg,rgba(80,15,15,0.65),rgba(20,6,6,0.7))'
                                : 'linear-gradient(160deg,rgba(255,255,255,0.16),rgba(255,255,255,0.03))',
                            border: isSafeRevealed ? '1px solid rgba(74,222,128,0.7)'
                              : isWrongRevealed ? '1px solid rgba(153,27,27,0.6)'
                              : clickable ? '1px solid rgba(103,232,249,0.55)' : '1px solid rgba(255,255,255,0.12)',
                            boxShadow: isWrongRevealed
                              ? '0 5px 8px rgba(0,0,0,0.55)'
                              : 'inset 2px 2px 3px rgba(255,255,255,0.3), inset -2px -3px 5px rgba(0,0,0,0.3), 0 5px 8px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(2px)',
                            cursor: clickable ? 'pointer' : 'default',
                          }}
                        >
                          {isSpotlit && (
                            <span className="absolute inset-0 rounded-lg"
                              style={{ boxShadow: '0 0 14px 3px rgba(103,232,249,0.6) inset', animation: 'gbSpotlight 1.1s ease-in-out infinite' }} />
                          )}
                          {isFrontier && (
                            <span className="absolute inset-0 rounded-lg"
                              style={{ animation: 'gbFrontierGlow 1.4s ease-in-out infinite' }} />
                          )}
                          {isWrongRevealed && <CrackOverlay />}
                          {isWrongRevealed && <AmbientShards />}
                          {isWrongRevealed && deadMarker && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <DeadAvatar charIdx={deadMarker.charIdx} hue={deadMarker.hue} />
                            </div>
                          )}
                          {/* Corner rivets — makes the pane read as set into a frame */}
                          {['top-0.5 left-0.5', 'top-0.5 right-0.5', 'bottom-0.5 left-0.5', 'bottom-0.5 right-0.5'].map(pos => (
                            <span key={pos} className={`absolute w-1 h-1 rounded-full bg-black/40 ${pos}`} />
                          ))}
                          {isSafeRevealed && <span className="absolute top-1 right-1.5 text-[10px] text-green-300 z-10">✓</span>}
                          {isWrongRevealed && <span className="absolute top-1 right-1.5 text-[10px] text-red-300 z-10">✗</span>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Finish zone */}
              <div className="absolute left-0 right-0 flex items-center justify-center"
                style={{ top: START_ZONE_H + slots * (ROW_H + ROW_GAP) - ROW_GAP, height: FINISH_ZONE_H }}>
                <span className="text-[10px] tracking-wider text-amber-300/80 font-bold">🏁 FINISH</span>
              </div>

              {/* Sprite overlay layer */}
              <div className="absolute inset-0 pointer-events-none">
                {allPlayers.map((p, i) => {
                  const rp = renderPosFor(p.user_id);
                  const { top, leftPct, jitter } = topLeftFor(p.user_id, rp);
                  const key = String(p.user_id);
                  const anim = animPhase[key] || 'idle';
                  const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
                  const hue = hueForPlayer(i);
                  return (
                    <div key={p.user_id}
                      className="absolute flex flex-col items-center"
                      style={{
                        top, left: `calc(${leftPct}% + ${jitter}px)`,
                        transform: 'translate(-50%,-50%)',
                        transition: 'top 0.5s cubic-bezier(0.34,1.2,0.64,1), left 0.5s cubic-bezier(0.34,1.2,0.64,1)',
                      }}>
                      <div style={{
                        position: 'absolute', bottom: 2, width: 22, height: 8, borderRadius: '50%',
                        background: `radial-gradient(ellipse, ${color}88, transparent 70%)`,
                      }} />
                      <BridgeSprite charIdx={charIdxForPlayer(i)} anim={anim} hue={hue} />
                      <span className="mt-0.5 px-1 rounded text-[8px] font-bold whitespace-nowrap"
                        style={{ background: `${color}cc`, color: '#fff' }}>
                        {p.username?.slice(0, 8) || 'P'}
                      </span>
                    </div>
                  );
                })}

                {shatter && (
                  <div className="absolute" style={{
                    top: rowTop(shatter.row),
                    left: `${shatter.side === 'right' ? RIGHT_PCT : LEFT_PCT}%`,
                  }}>
                    <ShatterBurst key={shatter.id} />
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Player status */}
        <div className="grid grid-cols-2 gap-2">
          {allPlayers.map((p, i) => {
            const pos = positions[String(p.user_id)] ?? -1;
            const progress = pos < 0 ? 0 : Math.round(((pos + 1) / slots) * 100);
            const wrongCount = attempts[String(p.user_id)] || 0;
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            return (
              <div key={p.user_id} className="rounded-lg p-2 bg-white/5 border border-white/10"
                style={{ boxShadow: i === currentTurn && phase === 'playing' ? `0 0 0 1px ${color}` : 'none' }}>
                <p className="text-sm font-medium text-gray-200 truncate">{p.username}</p>
                <p className="text-xs text-gray-400">
                  {pos < 0 ? 'At start' : pos === slots - 1 ? '🏁 Crossed!' : `Slot ${pos + 1}/${slots}`}
                </p>
                <div className="h-1 bg-gray-700 rounded-full mt-1.5">
                  <div className="h-1 rounded-full transition-all" style={{ width: `${progress}%`, background: color }} />
                </div>
                {wrongCount > 0 && (
                  <p className="text-xs text-red-400 mt-1">❌ {wrongCount} falls</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Announcement banner */}
      {announcement && (
        <div key={announcement.key} className="fixed z-[60] pointer-events-none"
          style={{
            top: '30%', left: '50%',
            animation: 'gbBannerIn 2.6s ease-out forwards',
          }}>
          <div className="px-6 py-3 rounded-2xl text-center shadow-2xl" style={{ background: announcement.bg }}>
            <div className="text-3xl mb-0.5">{announcement.icon}</div>
            <div className="text-white font-black text-lg tracking-wide">{announcement.text}</div>
            {announcement.sub && <div className="text-white/85 text-xs mt-0.5">{announcement.sub}</div>}
          </div>
        </div>
      )}
    </div>

    {isGameOver && (
      <GameWinnerBanner
        winner={winner === 'draw' ? null : winner}
        players={allPlayers}
        gameType="glass_bridge"
        gameStats={gameStats}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
