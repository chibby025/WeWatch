// src/components/Games/SnakesAndLaddersGame.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X as CloseIcon } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors snakes_ladders.go's snakeLadders/warpPads/trapSquares maps exactly
// — used purely for the board's visual labeling (icons, tints, tooltips),
// never for move validation or event classification. The server tags every
// move's actual outcome via `last_event` (see the sync effect below), so
// these consts don't need to be consulted to know what happened — only to
// know what a given square *looks like* before anyone lands on it.
const SNAKES_LADDERS = {
  4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91, // ladders (up)
  17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78, // snakes (down)
};
const WARP_PADS = { 11: 44, 46: 16, 79: 97 };
const TRAP_SQUARES = { 30: true, 58: true, 68: true, 90: true };

// ── Palette (reuses LudoGame.jsx's exact values for visual consistency
// across the app's game family) ─────────────────────────────────────────
const PLAYER_COLOR_HEX   = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
const PLAYER_COLOR_LIGHT = ['#fca5a5', '#93c5fd', '#86efac', '#fef08a'];
const PLAYER_COLOR_DARK  = ['#991b1b', '#1e3a8a', '#14532d', '#713f12'];

// Standard zigzag ("boustrophedon") board numbering: bottom row is 1-10
// left-to-right, next row up is 20-11 right-to-left, and so on. gridRow is
// the CSS-rendered row (0 = top of screen), so it maps to boardRow = 9-gridRow.
function squareAt(gridRow, col) {
  const boardRow = 9 - gridRow;
  return boardRow % 2 === 0 ? boardRow * 10 + col + 1 : boardRow * 10 + (10 - col);
}

const CELLS = Array.from({ length: 10 }, (_, gridRow) =>
  Array.from({ length: 10 }, (_, col) => squareAt(gridRow, col))
).flat();

// Reverse lookup: square number (1-100) -> {row, col}. Both the static
// board cells and the animated token overlay below are positioned from
// this exact same coordinate math (percentage-based, no CSS grid gaps
// involved anywhere) so the two layers always align pixel-for-pixel and a
// token's CSS transition between squares is always accurate — the same
// technique LudoGame.jsx's board uses.
const SQUARE_TO_POS = {};
for (let gridRow = 0; gridRow < 10; gridRow++) {
  for (let col = 0; col < 10; col++) {
    SQUARE_TO_POS[squareAt(gridRow, col)] = { row: gridRow, col };
  }
}

// ── 3-D Dice (adapted from LudoGame.jsx's Dice3D — self-contained, no
// Ludo-specific logic; duplicated rather than shared, matching this
// codebase's convention of each game file owning its own small visual
// components) ────────────────────────────────────────────────────────────
const PIPS = {
  1: [[50,50]],
  2: [[28,28],[72,72]],
  3: [[28,28],[50,50],[72,72]],
  4: [[28,28],[72,28],[28,72],[72,72]],
  5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
  6: [[28,22],[72,22],[28,50],[72,50],[28,78],[72,78]],
};
// [rotX, rotY] to bring face N to face the viewer
const FACE_SHOW = { 1:[0,0], 2:[0,-90], 3:[-90,0], 4:[90,0], 5:[0,90], 6:[0,180] };

function DieFace({ n, pipColor }) {
  return (
    <div style={{
      position:'absolute', inset:0,
      background:'linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%)',
      borderRadius:8,
      border:'1.5px solid #94a3b8',
      boxShadow:'inset 0 1px 3px rgba(255,255,255,0.9),inset 0 -1px 2px rgba(0,0,0,0.15)',
    }}>
      {(PIPS[n]||[]).map(([px,py],i) => (
        <div key={i} style={{
          position:'absolute', left:`${px}%`, top:`${py}%`,
          transform:'translate(-50%,-50%)',
          width:9, height:9, borderRadius:'50%',
          backgroundColor: pipColor || '#1e293b',
          boxShadow:'0 1px 2px rgba(0,0,0,0.6)',
        }}/>
      ))}
    </div>
  );
}

// Single die (this game rolls once per turn, unlike Ludo's two) — sized a
// bit larger than Ludo's 44px since it's the sole centerpiece here.
function Dice3D({ value, pipColor }) {
  const S = 56;
  const H = S / 2;
  const rotRef  = useRef({ x: 0, y: 0 });
  const prevVal = useRef(0);
  const [tf, setTf] = useState('rotateX(-20deg) rotateY(20deg)');
  const [tr, setTr] = useState('none');

  useEffect(() => {
    if (!value || value === prevVal.current) return;
    prevVal.current = value;
    const [fx, fy] = FACE_SHOW[value];
    const bx = Math.round(rotRef.current.x / 360) * 360;
    const by = Math.round(rotRef.current.y / 360) * 360;
    const nx = bx + (Math.floor(Math.random()*2)+2)*360 + fx;
    const ny = by + (Math.floor(Math.random()*2)+2)*360 + fy;
    rotRef.current = { x: nx, y: ny };
    setTr('transform 0.75s cubic-bezier(0.22,1.5,0.5,1)');
    setTf(`rotateX(${nx}deg) rotateY(${ny}deg)`);
  }, [value]);

  const face = (transform, n) => (
    <div style={{ position:'absolute', width:S, height:S, transform }}>
      <DieFace n={n} pipColor={pipColor} />
    </div>
  );

  return (
    <div style={{ width:S, height:S, perspective:200, perspectiveOrigin:'50% 40%' }}>
      <div style={{ width:S, height:S, position:'relative', transformStyle:'preserve-3d', transform:tf, transition:tr }}>
        {face(`translateZ(${H}px)`, 1)}
        {face(`rotateY(180deg) translateZ(${H}px)`, 6)}
        {face(`rotateY(90deg) translateZ(${H}px)`, 2)}
        {face(`rotateY(-90deg) translateZ(${H}px)`, 5)}
        {face(`rotateX(-90deg) translateZ(${H}px)`, 4)}
        {face(`rotateX(90deg) translateZ(${H}px)`, 3)}
      </div>
    </div>
  );
}

// ── Token (SVG puck, adapted from LudoGame.jsx's Token — the pulsing ring
// here marks whose TURN it is, not "clickable", since moves in this game
// are fully automatic once rolled) ────────────────────────────────────────
function Token({ colorIdx, isCurrentTurn }) {
  const hex  = PLAYER_COLOR_HEX[colorIdx];
  const lite = PLAYER_COLOR_LIGHT[colorIdx];
  const dark = PLAYER_COLOR_DARK[colorIdx];
  return (
    <svg viewBox="0 0 40 40" style={{
      width:'100%', height:'100%', overflow:'visible',
      filter: isCurrentTurn
        ? `drop-shadow(0 0 5px ${hex}bb) drop-shadow(0 3px 6px rgba(0,0,0,0.65))`
        : 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
    }}>
      {isCurrentTurn && (
        <circle cx="20" cy="20" r="20" fill="none" stroke={hex} strokeWidth="2.5"
          style={{ animation:'slTokenRing 1.3s ease-out infinite', transformOrigin:'20px 20px' }}/>
      )}
      <circle cx="20" cy="20" r="18" fill={dark}/>
      <circle cx="20" cy="20" r="16.5" fill={hex}/>
      <circle cx="20" cy="20" r="11" fill="none" stroke={lite} strokeWidth="2" opacity="0.55"/>
      <circle cx="20" cy="20" r="5" fill={dark} opacity="0.5"/>
      <circle cx="20" cy="20" r="3.2" fill={lite} opacity="0.8"/>
    </svg>
  );
}

// ── Ladder / snake board icons (replace the old 🪜/🐍 emoji for a cleaner,
// more "designed" look consistent with the custom-SVG Token above) ───────
function LadderIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width:'68%', height:'68%' }}>
      <line x1="6" y1="2" x2="6" y2="22" stroke="#a16207" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="18" y1="2" x2="18" y2="22" stroke="#a16207" strokeWidth="2.2" strokeLinecap="round"/>
      {[4, 8.5, 13, 17.5].map((y, i) => (
        <line key={i} x1="6" y1={y} x2="18" y2={y} stroke="#ca8a04" strokeWidth="2" strokeLinecap="round"/>
      ))}
    </svg>
  );
}

function SnakeIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width:'72%', height:'72%' }}>
      <path d="M 4 21 Q 4 14 12 14 Q 20 14 20 8 Q 20 3 14 3"
        fill="none" stroke="#16a34a" strokeWidth="2.6" strokeLinecap="round"/>
      <circle cx="14" cy="3" r="2.6" fill="#15803d"/>
      <circle cx="14.9" cy="2.3" r="0.55" fill="#0f172a"/>
    </svg>
  );
}

// Portal/spiral — deliberately doesn't lean up or down (unlike Ladder/Snake)
// since a warp pad's direction is unknown until landed on.
function WarpIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width:'70%', height:'70%' }}>
      <path d="M 12 2 A 8 8 0 1 1 4 12" fill="none" stroke="#a855f7" strokeWidth="2.4" strokeLinecap="round"/>
      <path d="M 12 6 A 4.5 4.5 0 1 0 16.5 10.5" fill="none" stroke="#22d3ee" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="1.7" fill="#22d3ee"/>
    </svg>
  );
}

function TrapIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width:'70%', height:'70%' }}>
      <path d="M 3 8 L 21 8 L 18.5 21 L 5.5 21 Z" fill="none" stroke="#ea580c" strokeWidth="1.8" strokeLinejoin="round"/>
      <line x1="3" y1="8" x2="12" y2="2" stroke="#fb923c" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="21" y1="8" x2="12" y2="2" stroke="#fb923c" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="7" y1="8" x2="9" y2="19" stroke="#fb923c" strokeWidth="1.3" opacity="0.8"/>
      <line x1="12" y1="8" x2="12" y2="20" stroke="#fb923c" strokeWidth="1.3" opacity="0.8"/>
      <line x1="17" y1="8" x2="15" y2="19" stroke="#fb923c" strokeWidth="1.3" opacity="0.8"/>
    </svg>
  );
}

const BOARD_CP = 10; // percent per cell (100 / 10)

export default function SnakesAndLaddersGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [positions, setPositions] = useState([]);               // authoritative, from server
  const [displayPositions, setDisplayPositions] = useState([]); // what's actually rendered (animated)
  const [skipNext, setSkipNext] = useState([]);                 // per-player "will miss next turn" flags
  const [currentTurn, setCurrentTurn] = useState(0);
  const [lastRoll, setLastRoll] = useState(null);
  const [lastPlayerIdx, setLastPlayerIdx] = useState(null);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [announcement, setAnnouncement] = useState(null);

  const animTimerRef = useRef(null);
  const announceTimerRef = useRef(null);
  // Shadow ref so the sync effect below always diffs against the latest
  // *displayed* value (not a stale closure) without needing displayPositions
  // itself as an effect dependency.
  const displayPositionsRef = useRef([]);
  displayPositionsRef.current = displayPositions;

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2800);
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    const newPositions = gs.positions || players.map(() => 0);
    const newSkipNext = gs.skip_next || players.map(() => false);
    const roll = typeof gs.last_roll === 'number' ? gs.last_roll : null;
    const lastPlayer = typeof gs.last_player === 'number' ? gs.last_player : null;
    const lastEvent = gs.last_event || null;

    setPositions(newPositions);
    setSkipNext(newSkipNext);
    setCurrentTurn(gameState.current_turn ?? 0);
    setLastRoll(roll);
    setLastPlayerIdx(lastPlayer);
    setRolling(false);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    setIsOver(over);
    setWinner(over ? (gameState.winner_id ? (players.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw') : null);

    clearTimeout(animTimerRef.current);

    const prevDisplay = displayPositionsRef.current;
    const playerName = players[lastPlayer]?.username || 'Someone';

    // A trapped player's "roll" click burns the skip with no dice roll and no
    // position change at all — handle it before any of the roll-based
    // animation math below, which assumes a real roll just happened.
    if (lastEvent === 'skipped') {
      setDisplayPositions(newPositions);
      announce({ icon: '😵', text: 'TURN SKIPPED!', sub: `${playerName} was trapped and missed their turn`,
        bg: 'linear-gradient(135deg,#78350f,#451a03)' });
      return;
    }

    if (lastPlayer === null || roll === null || prevDisplay.length === 0) {
      // First render / rehydration — snap directly, nothing to animate from yet.
      setDisplayPositions(newPositions);
      return;
    }

    const oldPos = prevDisplay[lastPlayer] ?? 0;
    const finalPos = newPositions[lastPlayer] ?? 0;
    const overshoot = lastEvent === 'overshoot';
    const landedSquare = overshoot ? oldPos : oldPos + roll;

    if (landedSquare === finalPos) {
      // Ordinary move (or a forfeited overshoot, or a landing with no
      // event) — a single CSS-transition slide is enough.
      setDisplayPositions(newPositions);
    } else {
      // Landed on a snake/ladder/warp square: slide to the landed-on square
      // first (normal roll motion)...
      setDisplayPositions(prev => {
        const next = [...prev];
        next[lastPlayer] = landedSquare;
        return next;
      });
      // ...then, once that slide has visibly finished, climb/slide/teleport
      // the rest of the way to the real destination.
      animTimerRef.current = setTimeout(() => {
        setDisplayPositions(newPositions);
      }, 480);
    }

    // ── Event banner — trusts the server's own `last_event` tag directly
    // (rather than re-deriving it from position deltas), since a warp pad
    // can go either up or down and can't be told apart from a ladder/snake
    // by direction alone. ──
    if (lastEvent === 'ladder') {
      announce({ icon: '🪜', text: 'LADDER CLIMB!', sub: `${playerName} climbs to ${finalPos}!`,
        bg: 'linear-gradient(135deg,#16a34a,#14532d)' });
    } else if (lastEvent === 'snake') {
      announce({ icon: '🐍', text: 'SNAKE BITE!', sub: `${playerName} slides down to ${finalPos}!`,
        bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' });
    } else if (lastEvent === 'warp') {
      announce({ icon: '🌀', text: finalPos > landedSquare ? 'WARPED FORWARD!' : 'WARPED BACK!',
        sub: `${playerName} teleports to ${finalPos}!`,
        bg: 'linear-gradient(135deg,#7c3aed,#0891b2)' });
    } else if (lastEvent === 'trap') {
      announce({ icon: '🕸️', text: 'TRAPPED!', sub: `${playerName} will miss their next turn`,
        bg: 'linear-gradient(135deg,#c2410c,#431407)' });
    } else if (lastEvent === 'trap_dodged') {
      announce({ icon: '🍀', text: 'LUCKY SIX!', sub: `${playerName} rolled right out of the trap!`,
        bg: 'linear-gradient(135deg,#65a30d,#365314)' });
    } else if (lastEvent === 'overshoot') {
      announce({ icon: '🚫', text: 'TOO FAR!', sub: 'Need an exact roll to reach 100',
        bg: 'linear-gradient(135deg,#b45309,#78350f)' });
    } else if (roll === 6 && finalPos !== 100) {
      announce({ icon: '🎲', text: 'EXTRA ROLL!', sub: `${playerName} goes again!`,
        bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' });
    }
    // gameState/players fully capture what varies here; announce is a stable
    // useCallback, same pattern LudoGame.jsx already uses for its own sync effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, players]);

  useEffect(() => () => {
    clearTimeout(animTimerRef.current);
    clearTimeout(announceTimerRef.current);
  }, []);

  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver;
  // Server is the sole authority on whether this actually consumes a trap —
  // this only drives the button label/copy, same "display only" role every
  // other client-side mirror in this file plays.
  const amTrapped = !isOver && skipNext[currentTurn] === true;

  const handleRoll = () => {
    if (!isMyTurn || rolling) return;
    setRolling(true);
    onMove({ move_type: 'roll' });
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  // Group on-board tokens sharing a square so they render stacked, not
  // fully overlapping; off-board (position 0) tokens go to a waiting tray.
  const tokensBySquare = useMemo(() => {
    const map = {};
    displayPositions.forEach((pos, idx) => {
      // `pos <= 0` alone doesn't exclude NaN — every comparison with NaN is
      // false, so `NaN <= 0` is false too, letting a corrupted position
      // silently become an invalid "NaN" key below (SQUARE_TO_POS has no
      // such entry, crashing the token-overlay render further down). A
      // positive range check excludes NaN correctly since `NaN >= 1` is
      // also false.
      if (!(pos >= 1 && pos <= 100)) return;
      (map[pos] = map[pos] || []).push(idx);
    });
    return map;
  }, [displayPositions]);

  const offBoardIdxs = useMemo(
    () => displayPositions.map((pos, idx) => ({ pos, idx })).filter(t => !(t.pos >= 1 && t.pos <= 100)).map(t => t.idx),
    [displayPositions]
  );

  const diePipColor = PLAYER_COLOR_HEX[lastPlayerIdx ?? currentTurn] || '#1e293b';

  return (
    <>
      <style>{`
        @keyframes slTokenRing {
          0%   { transform: scale(1);   opacity: 0.75; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes slAnnounceIn {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(0.35) rotate(-8deg); }
          18%  { opacity:1; transform:translate(-50%,-50%) scale(1.12) rotate(2deg); }
          28%  { transform:translate(-50%,-50%) scale(0.96) rotate(-0.5deg); }
          55%  { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
          78%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
          92%  { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
          100% { opacity:0; transform:translate(-50%,-50%) scale(0.75); }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ background: 'linear-gradient(135deg,#4c1d95 0%,#1e3a8a 100%)' }}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎲</span>
              <div>
                <h2 className="text-white text-base font-bold leading-none">Snakes &amp; Ladders</h2>
                <p className="text-purple-300 text-[10px]">{players.length}-player game</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="snakes_ladders" className="text-white/60 hover:text-white" />
              {!isOver && (
                <button onClick={handleForfeit}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 text-white"
                  style={{ background: '#dc2626', boxShadow: '0 2px 6px rgba(220,38,38,0.45)' }}>
                  End Game
                </button>
              )}
              <button onClick={handleForfeit}
                className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Player pills */}
          {!isOver && (
            <div className="flex items-center justify-center gap-2 px-3 py-2 flex-wrap" style={{ background: 'rgba(0,0,0,0.3)' }}>
              {players.map((p, idx) => {
                const hex = PLAYER_COLOR_HEX[idx];
                const active = currentTurn === idx;
                return (
                  <div key={p.user_id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${active ? 'scale-105' : 'opacity-60'}`}
                    style={{ background: `${hex}22`, border: `1.5px solid ${active ? hex : hex + '55'}`, color: hex }}>
                    <div className="w-5 h-5 flex-shrink-0"><Token colorIdx={idx} isCurrentTurn={false} /></div>
                    <span className="max-w-[70px] truncate">{p.username}</span>
                    <span className="font-normal opacity-70">#{positions[idx] || 0}</span>
                    {skipNext[idx] && <span title="Trapped — will miss next turn" className="flex-shrink-0 text-[11px]">🕸️</span>}
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0"/>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Dice + Roll */}
          {!isOver && (
            <div className="flex items-center justify-center gap-3 py-2.5 px-3" style={{ background: 'rgba(0,0,0,0.15)' }}>
              {lastRoll !== null ? (
                <Dice3D value={lastRoll} pipColor={diePipColor} />
              ) : (
                <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: 0.4 }}>🎲</div>
              )}
              {isMyTurn ? (
                <button
                  onClick={handleRoll}
                  disabled={rolling}
                  className="px-4 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
                  style={amTrapped
                    ? { background: 'linear-gradient(135deg,#c2410c,#7c2d12)', boxShadow: '0 2px 10px rgba(194,65,12,0.5)' }
                    : { background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 2px 10px rgba(124,58,237,0.5)' }}
                >
                  {rolling ? (amTrapped ? 'Skipping…' : 'Rolling…') : (amTrapped ? '😵 Trapped — Tap to Continue' : '🎲 Roll Dice')}
                </button>
              ) : (
                <p className="text-gray-400 text-sm font-semibold">{currentPlayer?.username}'s turn</p>
              )}
            </div>
          )}

          {/* Board */}
          <div className="p-3">
            <div className="relative mx-auto aspect-square select-none" style={{
              maxWidth: 460, width: '100%',
              background: 'linear-gradient(135deg,#1a0533 0%,#0f172a 100%)',
              border: '2px solid #6d28d9',
              borderRadius: 10,
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(109,40,217,0.2)',
            }}>
              {/* Static cells */}
              {CELLS.map((square) => {
                const { row, col } = SQUARE_TO_POS[square];
                const dest = SNAKES_LADDERS[square];
                const isLadder = dest !== undefined && dest > square;
                const isSnake = dest !== undefined && dest < square;
                const warpDest = WARP_PADS[square];
                const isWarp = warpDest !== undefined;
                const isTrap = TRAP_SQUARES[square] === true;
                const isStart = square === 1;
                const isFinish = square === 100;
                const rowIsEven = Math.floor((square - 1) / 10) % 2 === 0;
                // Two clearly-separated bands (was a near-flat ~15-lightness-point
                // gap) so the checkerboard pattern itself reads at a glance.
                const baseShade = rowIsEven
                  ? 'linear-gradient(135deg,#3d4560,#323a52)'
                  : 'linear-gradient(135deg,#232a3d,#1a2030)';
                const bg = isFinish
                  ? 'linear-gradient(135deg,#fbbf24,#b45309)'
                  : isStart
                    ? 'linear-gradient(135deg,#1e3a8a,#1e293b)'
                    : isLadder
                      ? 'linear-gradient(135deg,#16a34acc,#14532dcc)'
                      : isSnake
                        ? 'linear-gradient(135deg,#dc2626cc,#7f1d1dcc)'
                        : isWarp
                          ? 'linear-gradient(135deg,#a855f7cc,#0891b2cc)'
                          : isTrap
                            ? 'linear-gradient(135deg,#ea580ccc,#43140799)'
                            : baseShade;
                const title = isLadder ? `Ladder to ${dest}`
                  : isSnake ? `Snake to ${dest}`
                  : isWarp ? 'Warp pad — teleports somewhere unknown'
                  : isTrap ? 'Trap — skip your next turn'
                  : undefined;
                return (
                  <div key={square} className="absolute flex items-center justify-center"
                    title={title}
                    style={{
                      top: `${row * BOARD_CP}%`, left: `${col * BOARD_CP}%`,
                      width: `${BOARD_CP}%`, height: `${BOARD_CP}%`,
                      background: bg,
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                    <span className="absolute top-0.5 left-0.5 text-[9px] font-bold"
                      style={{ color: isFinish ? '#78350f' : 'rgba(255,255,255,0.45)' }}>
                      {square}
                    </span>
                    {isLadder && <LadderIcon />}
                    {isSnake && <SnakeIcon />}
                    {isWarp && <WarpIcon />}
                    {isTrap && <TrapIcon />}
                    {isFinish && <span className="text-sm">🏁</span>}
                    {isStart && <span className="text-[6.5px] font-bold text-blue-300 tracking-wide">START</span>}
                  </div>
                );
              })}

              {/* Token overlay — same coordinate system as the cells above, so
                  the CSS top/left transition below animates a real slide. */}
              {Object.entries(tokensBySquare).map(([sq, idxs]) => {
                // Defensive: tokensBySquare's own filter should already keep every
                // key within 1-100, but this is the actual point a bad key would
                // otherwise throw (destructuring undefined) and take the whole
                // board down — fail safe by skipping the render instead.
                const pos = SQUARE_TO_POS[Number(sq)];
                if (!pos) return null;
                const { row, col } = pos;
                return idxs.map((idx, i) => {
                  const stagger = idxs.length > 1 ? (i - (idxs.length - 1) / 2) * 5.5 : 0;
                  return (
                    <div key={idx} className="absolute"
                      style={{
                        top: `${row * BOARD_CP + 1.2}%`, left: `${col * BOARD_CP + 1.2}%`,
                        width: `${BOARD_CP - 2.4}%`, height: `${BOARD_CP - 2.4}%`,
                        transform: `translate(${stagger}%, ${stagger}%)`,
                        transition: 'top 480ms ease, left 480ms ease',
                        zIndex: !isOver && currentTurn === idx ? 15 : 10,
                      }}>
                      <Token colorIdx={idx} isCurrentTurn={!isOver && currentTurn === idx} />
                    </div>
                  );
                });
              })}
            </div>

            {/* Waiting-to-start tray */}
            {!isOver && offBoardIdxs.length > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wide">Waiting to start:</span>
                {offBoardIdxs.map(idx => (
                  <div key={idx} className="w-5 h-5"><Token colorIdx={idx} isCurrentTurn={currentTurn === idx} /></div>
                ))}
              </div>
            )}
          </div>

          {/* ── Event announcement overlay (Ladder/Snake/Overshoot/Extra Roll) ── */}
          {announcement && (
            <div
              key={announcement.key}
              style={{
                position: 'absolute', top: '38%', left: '50%',
                zIndex: 60, pointerEvents: 'none',
                animation: 'slAnnounceIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
              }}
            >
              <div style={{
                background: announcement.bg,
                borderRadius: 20,
                padding: '16px 30px',
                textAlign: 'center',
                boxShadow: '0 0 56px rgba(0,0,0,0.7), 0 12px 40px rgba(0,0,0,0.5)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                minWidth: 190, maxWidth: 300,
              }}>
                <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>{announcement.icon}</div>
                <div style={{
                  color: '#fff', fontSize: 24, fontWeight: 900,
                  letterSpacing: 0.5, textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                  lineHeight: 1.1,
                }}>{announcement.text}</div>
                {announcement.sub && (
                  <div style={{
                    color: 'rgba(255,255,255,0.8)', fontSize: 12,
                    marginTop: 6, fontWeight: 600, letterSpacing: 0.2,
                  }}>{announcement.sub}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {winner && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="snakes_ladders"
          gameStats={{ lines: players.map((p, i) => ({ label: p.username, value: `Square ${positions[i] || 0}` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
