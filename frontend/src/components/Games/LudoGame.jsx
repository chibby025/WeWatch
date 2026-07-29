// src/components/Games/LudoGame.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import GameRulesButton from './GameRulesButton';

// ── Palette ───────────────────────────────────────────────────────────────────
const LUDO_COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX   = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };
const COLOR_LIGHT = { red: '#fca5a5', blue: '#93c5fd', green: '#86efac', yellow: '#fef08a' };
const COLOR_DARK  = { red: '#991b1b', blue: '#1e3a8a', green: '#14532d', yellow: '#713f12' };

// ── Board geometry ─────────────────────────────────────────────────────────────
function buildSharedPath() {
  const p = [];
  for (let c = 1; c <= 5; c++) p.push([6, c]);
  for (let r = 5; r >= 0; r--) p.push([r, 6]);
  p.push([0, 7]); p.push([0, 8]);
  for (let r = 1; r <= 5; r++) p.push([r, 8]);
  for (let c = 9; c <= 14; c++) p.push([6, c]);
  p.push([7, 14]); p.push([8, 14]);
  for (let c = 13; c >= 9; c--) p.push([8, c]);
  for (let r = 9; r <= 14; r++) p.push([r, 8]);
  p.push([14, 7]); p.push([14, 6]);
  for (let r = 13; r >= 9; r--) p.push([r, 6]);
  for (let c = 5; c >= 0; c--) p.push([8, c]);
  p.push([7, 0]);
  p.push([6, 0]); // 52nd square — completes the outer loop
  return p;
}

const SHARED_PATH = buildSharedPath();
const HOME_COLUMNS = {
  red:    [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  blue:   [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  green:  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  yellow: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
};
const ENTRY_OFFSET   = { red: 0, blue: 13, green: 26, yellow: 39 };
const SAFE_SQUARES   = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const YARD_RECT      = { red:{top:0,left:0}, blue:{top:0,left:9}, green:{top:9,left:9}, yellow:{top:9,left:0} };
const YARD_OFFSETS   = [[1.3, 1.3],[1.3, 3.8],[3.8, 1.3],[3.8, 3.8]];

function gSq(color, relPos)       { return (ENTRY_OFFSET[color] + relPos) % 52; }
function cellForToken(color, relPos) {
  if (relPos < 0)    return null;
  if (relPos <= 50)  return SHARED_PATH[gSq(color, relPos)];
  if (relPos <= 56)  return HOME_COLUMNS[color][relPos - 51];
  return [7, 7];
}
function isSafe(color, relPos) {
  if (relPos < 0 || relPos > 50) return true;
  return SAFE_SQUARES.has(gSq(color, relPos));
}

// Returns which colors are active for a given player count:
// 2-player → all 4 colors; 3/4-player → first N colors.
function activeColorsForCount(playerCount) {
  return playerCount === 2 ? LUDO_COLORS : LUDO_COLORS.slice(0, playerCount);
}

// Returns the colors a player at playerIdx controls.
// 2-player: player 0 = red+yellow, player 1 = blue+green.
// 3/4-player: single color per player.
function colorsForPlayerIdx(playerIdx, playerCount) {
  if (playerCount === 2) {
    return playerIdx === 0 ? ['red', 'yellow'] : ['blue', 'green'];
  }
  const c = LUDO_COLORS[playerIdx];
  return c ? [c] : [];
}

// ── 3-D Dice ──────────────────────────────────────────────────────────────────
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
      borderRadius:6,
      border:'1.5px solid #94a3b8',
      boxShadow:'inset 0 1px 3px rgba(255,255,255,0.9),inset 0 -1px 2px rgba(0,0,0,0.15)',
    }}>
      {(PIPS[n]||[]).map(([px,py],i) => (
        <div key={i} style={{
          position:'absolute', left:`${px}%`, top:`${py}%`,
          transform:'translate(-50%,-50%)',
          width:7, height:7, borderRadius:'50%',
          backgroundColor: pipColor || '#1e293b',
          boxShadow:'0 1px 2px rgba(0,0,0,0.6)',
        }}/>
      ))}
    </div>
  );
}

function Dice3D({ value, pipColor, selected, consumed, onClick }) {
  const S = 44;
  const H = S / 2;
  const rotRef    = useRef({ x: 0, y: 0 });
  const prevVal   = useRef(0);
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
      <DieFace n={n} pipColor={consumed ? '#94a3b8' : pipColor} />
    </div>
  );

  return (
    <div
      onClick={!consumed && onClick ? onClick : undefined}
      style={{
        width:S, height:S, perspective:160, perspectiveOrigin:'50% 40%',
        cursor: !consumed && onClick ? 'pointer' : 'default',
        opacity: consumed ? 0.35 : 1,
        borderRadius: 8,
        outline: selected ? `2.5px solid ${pipColor || '#fff'}` : 'none',
        outlineOffset: 3,
        boxShadow: selected ? `0 0 10px ${pipColor || '#fff'}88` : 'none',
        transition: 'opacity 0.2s, outline 0.15s',
      }}>
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

// ── Token (SVG flat token) ─────────────────────────────────────────────────────
function Token({ color, isClickable, isFaded }) {
  const hex  = COLOR_HEX[color];
  const lite = COLOR_LIGHT[color];
  const dark = COLOR_DARK[color];
  return (
    <svg
      viewBox="0 0 40 40"
      style={{
        width:'100%', height:'100%',
        overflow:'visible',
        opacity: isFaded ? 0.3 : 1,
        transform: isClickable ? 'scale(1.14)' : 'scale(1)',
        transition:'transform 0.15s ease, opacity 0.12s',
        cursor: isClickable ? 'grab' : 'default',
        filter: isClickable
          ? `drop-shadow(0 0 5px ${hex}bb) drop-shadow(0 3px 6px rgba(0,0,0,0.65))`
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.55))',
      }}
    >
      {isClickable && (
        <circle cx="20" cy="20" r="20" fill="none" stroke={hex} strokeWidth="2.5"
          style={{ animation:'tokenRing 1.3s ease-out infinite', transformOrigin:'20px 20px' }}/>
      )}
      <circle cx="20" cy="20" r="18" fill={dark}/>
      <circle cx="20" cy="20" r="16.5" fill={hex}/>
      <circle cx="20" cy="20" r="11" fill="none" stroke={lite} strokeWidth="2" opacity="0.55"/>
      <circle cx="20" cy="20" r="5" fill={dark} opacity="0.5"/>
      <circle cx="20" cy="20" r="3.2" fill={lite} opacity="0.8"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LudoGame({ gameState, players=[], currentUserId, onMove, onClose, onEndGame }) {
  const boardRef  = useRef(null);
  const dragInfo  = useRef(null);
  const [dragging, setDragging]         = useState(null);
  const [ghostPos, setGhostPos]         = useState({ x:0, y:0 });
  const [selectedDieValue, setSelectedDieValue] = useState(null);
  const [announcement, setAnnouncement] = useState(null);
  const announceTimerRef = useRef(null);
  const prevDoubleSixRef = useRef(false);
  const prevCaptureSeqRef = useRef(0);

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2800);
  }, []);

  const gs             = gameState?.game_state || {};
  const tokensByColor  = gs.tokens || {};
  const diceRolls      = gs.dice_rolls || [];        // [d1, d2] — always 2 values
  const remainingMoves = gs.remaining_moves || [];   // subset still playable
  const awaitingMove   = !!gs.awaiting_move;
  const lastRollWasted = !!gs.last_roll_wasted;
  const doubleSixBonus = !!gs.double_six_bonus;
  const captureSeq     = gs.capture_seq ?? 0;
  const lastCapturedColor = gs.last_captured_color || null;
  const lastCapturerColor = gs.last_capturer_color || null;

  const currentTurn   = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const myColorIdx    = players.findIndex(p => p.user_id === currentUserId);
  const isMyTurn      = currentPlayer?.user_id === currentUserId;
  const isPlayer      = myColorIdx >= 0;
  const winner        = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver        = ['finished','forfeited','completed'].includes(gameState?.status);

  // Colors this player controls (1 or 2 depending on player count)
  const myColors = useMemo(() => {
    if (myColorIdx < 0) return [];
    return colorsForPlayerIdx(myColorIdx, players.length);
  }, [myColorIdx, players.length]);

  const myPrimaryColor = myColors[0] || null;

  // All colors shown on the board (all 4 for 2-player, first N for 3/4-player)
  const activeColors = useMemo(() => activeColorsForCount(players.length), [players.length]);

  // Figure out which dice are consumed: match remaining_moves against dice_rolls.
  // Handles duplicate values (e.g. both dice = 4) correctly.
  const diceConsumed = useMemo(() => {
    const rem = [...remainingMoves];
    return diceRolls.map(v => {
      const idx = rem.indexOf(v);
      if (idx >= 0) { rem.splice(idx, 1); return false; }
      return true;
    });
  }, [diceRolls, remainingMoves]);

  // Auto-select the die when only one playable value remains.
  // Clear selection when it's not our turn or not awaiting a move.
  const rmKey = JSON.stringify(remainingMoves);
  useEffect(() => {
    if (!awaitingMove || !isMyTurn) {
      setSelectedDieValue(null);
      return;
    }
    if (remainingMoves.length === 1) {
      setSelectedDieValue(remainingMoves[0]);
    } else if (remainingMoves.length === 0) {
      setSelectedDieValue(null);
    }
    // If 2+ remain, wait for player to tap a die.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rmKey, awaitingMove, isMyTurn]);

  // "Extra Roll" banner on the false→true transition only — not on every render
  // while the flag holds (it stays true across this roll's own move_token calls),
  // and correctly re-fires for a second consecutive double-six since the backend
  // clears the flag to false right when the turn would otherwise pass, before the
  // next roll_dice sets it fresh. Same one-shot pattern WhotGame.jsx uses for its
  // Pick 2/Pick 3/Hold On announcements.
  useEffect(() => {
    if (doubleSixBonus && !prevDoubleSixRef.current) {
      announce({ icon: '🎲🎲', text: 'EXTRA ROLL!', sub: 'Double six bonus — go again!',
        bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' });
    }
    prevDoubleSixRef.current = doubleSixBonus;
  }, [doubleSixBonus, announce]);

  // "Knocked Out!" banner — capture_seq is monotonic (never reset, unlike
  // last_capture which a later non-capturing move in the same turn would
  // overwrite back to false), so this correctly fires once per capture even
  // when both dice in one turn each capture a different token.
  useEffect(() => {
    if (captureSeq > prevCaptureSeqRef.current && lastCapturedColor) {
      const victimIdx = players.findIndex((_, idx) => colorsForPlayerIdx(idx, players.length).includes(lastCapturedColor));
      const victim = players[victimIdx];
      const victimLabel = lastCapturedColor.charAt(0).toUpperCase() + lastCapturedColor.slice(1);

      const capturerIdx = lastCapturerColor
        ? players.findIndex((_, idx) => colorsForPlayerIdx(idx, players.length).includes(lastCapturerColor))
        : -1;
      const capturer = players[capturerIdx];
      const capturerLabel = lastCapturerColor ? lastCapturerColor.charAt(0).toUpperCase() + lastCapturerColor.slice(1) : null;

      const victimText = victim ? `${victim.username}'s ${victimLabel}` : victimLabel;
      const capturerText = capturer ? `${capturer.username}'s ${capturerLabel}` : capturerLabel;

      announce({ icon: '🎯', text: 'KNOCKED OUT!',
        sub: capturerText
          ? `${victimText} sent to base — ${capturerText} races Home!`
          : `${victimText} sent back to base!`,
        bg: 'linear-gradient(135deg,#dc2626,#7f1d1d)' });
    }
    prevCaptureSeqRef.current = captureSeq;
  }, [captureSeq, lastCapturedColor, lastCapturerColor, players, announce]);

  // Legal moves: { color, tokenIdx } pairs for the currently selected die value.
  const legalMoves = useMemo(() => {
    if (!isMyTurn || !awaitingMove || !selectedDieValue || myColors.length === 0) return [];
    const moves = [];
    for (const color of myColors) {
      (tokensByColor[color] || []).forEach((t, i) => {
        const pos = t.position ?? -1;
        if ((pos === -1 && selectedDieValue === 6) || (pos >= 0 && pos + selectedDieValue <= 57)) {
          moves.push({ color, tokenIdx: i });
        }
      });
    }
    return moves;
  }, [tokensByColor, myColors, isMyTurn, awaitingMove, selectedDieValue]);

  // Drop-zone map: "row,col" → { color, tokenIdx }
  const targetCells = useMemo(() => {
    const map = new Map();
    if (!awaitingMove || !selectedDieValue) return map;
    legalMoves.forEach(({ color, tokenIdx }) => {
      const pos = (tokensByColor[color] || [])[tokenIdx]?.position ?? -1;
      const newPos = pos === -1 ? 0 : pos + selectedDieValue;
      const cell  = cellForToken(color, newPos);
      if (cell) map.set(`${cell[0]},${cell[1]}`, { color, tokenIdx });
    });
    return map;
  }, [awaitingMove, selectedDieValue, tokensByColor, legalMoves]);

  const handleRoll = () => {
    if (!isMyTurn || awaitingMove || isOver) return;
    onMove({ move_type: 'roll_dice' });
  };

  const handleTokenMove = (color, tokenIdx) => {
    if (!isMyTurn || !awaitingMove || isOver || !selectedDieValue) return;
    if (!legalMoves.some(m => m.color === color && m.tokenIdx === tokenIdx)) return;
    onMove({ move_type: 'move_token', token_index: tokenIdx, color, die_value: selectedDieValue });
    setSelectedDieValue(null);
  };

  const handleDieClick = (dieIdx) => {
    if (!isMyTurn || !awaitingMove || diceConsumed[dieIdx]) return;
    setSelectedDieValue(diceRolls[dieIdx]);
  };

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  // ── Drag-and-drop ───────────────────────────────────────────────────────────
  const onTokenPointerDown = (e, color, tokenIdx) => {
    if (!myColors.includes(color) || !legalMoves.some(m => m.color === color && m.tokenIdx === tokenIdx)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragInfo.current = { color, tokenIdx, startX: e.clientX, startY: e.clientY };
    setGhostPos({ x: e.clientX, y: e.clientY });
  };

  const onTokenPointerMove = (e) => {
    if (!dragInfo.current) return;
    const { startX, startY, color, tokenIdx } = dragInfo.current;
    setGhostPos({ x: e.clientX, y: e.clientY });
    if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 7)
      setDragging({ color, tokenIdx });
  };

  const onTokenPointerUp = (e) => {
    if (!dragInfo.current) return;
    const { color, tokenIdx, startX, startY } = dragInfo.current;
    const wasTap = Math.hypot(e.clientX - startX, e.clientY - startY) <= 7;

    if (wasTap) {
      handleTokenMove(color, tokenIdx);
    } else if (dragging && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const col  = Math.floor(((e.clientX - rect.left) / rect.width)  * 15);
      const row  = Math.floor(((e.clientY - rect.top)  / rect.height) * 15);
      const key  = `${row},${col}`;
      if (targetCells.has(key)) {
        const target = targetCells.get(key);
        handleTokenMove(target.color, target.tokenIdx);
      }
    }

    dragInfo.current = null;
    setDragging(null);
  };

  // ── Flatten tokens for rendering ────────────────────────────────────────────
  const renderTokens = [];
  activeColors.forEach((color) => {
    (tokensByColor[color]||[]).forEach((t, i) => {
      const pos = t.position ?? -1;
      if (pos === -1) {
        const y = YARD_RECT[color];
        const [dr, dc] = YARD_OFFSETS[i];
        renderTokens.push({ color, tokenIdx:i, row: y.top+dr, col: y.left+dc, inBase:true });
      } else {
        const cell = cellForToken(color, pos);
        if (cell) renderTokens.push({ color, tokenIdx:i, row:cell[0], col:cell[1], inBase:false });
      }
    });
  });

  const cp = 100 / 15;

  // Is any die selectable (helps hint the player to tap one)?
  const needsDieSelection = isMyTurn && awaitingMove && remainingMoves.length >= 2 && !selectedDieValue;

  return (
    <>
      <style>{`
        @keyframes tokenRing {
          0%   { transform: scale(1);   opacity: 0.75; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes dropPulse {
          0%,100% { opacity:.55; transform:scale(.9); }
          50%     { opacity:1;   transform:scale(1); }
        }
        @keyframes bannerIn {
          0%   { opacity:0; transform:scale(0.88); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes trophySpin {
          0%   { transform:rotate(-15deg) scale(1); }
          50%  { transform:rotate(15deg)  scale(1.15); }
          100% { transform:rotate(-15deg) scale(1); }
        }
        @keyframes confettiFall {
          0%   { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(120px) rotate(720deg); opacity:0; }
        }
        @keyframes announceIn {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(0.35) rotate(-8deg); }
          18%  { opacity:1; transform:translate(-50%,-50%) scale(1.12) rotate(2deg); }
          28%  { transform:translate(-50%,-50%) scale(0.96) rotate(-0.5deg); }
          55%  { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
          78%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
          92%  { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
          100% { opacity:0; transform:translate(-50%,-50%) scale(0.75); }
        }
        @keyframes tapPulse {
          0%,100% { transform:scale(1);    opacity:1; }
          50%     { transform:scale(1.14); opacity:0.6; }
        }
      `}</style>

      {/* Drag ghost */}
      {dragging && (
        <div style={{
          position:'fixed', left:ghostPos.x, top:ghostPos.y,
          transform:'translate(-50%,-50%)',
          width:30, height:30, borderRadius:'50%',
          background:`radial-gradient(circle at 35% 30%,${COLOR_LIGHT[dragging.color]},${COLOR_HEX[dragging.color]} 55%,${COLOR_DARK[dragging.color]})`,
          border:'2px solid white',
          boxShadow:'0 8px 24px rgba(0,0,0,0.7)',
          pointerEvents:'none', zIndex:9999,
        }}/>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-[440px] sm:max-w-[600px] lg:max-w-[720px] mx-3 overflow-hidden flex flex-col"
          style={{ maxHeight:'97vh' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ background:'linear-gradient(135deg,#4c1d95 0%,#1e3a8a 100%)' }}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🎲</span>
              <div>
                <h2 className="text-white text-base font-bold leading-none">Ludo</h2>
                <p className="text-purple-300 text-[10px]">{players.length}-player game</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="ludo" className="text-white/60 hover:text-white" />
              {!isOver && (
                <button onClick={handleForfeit}
                  className="px-3 py-1 rounded-lg text-xs font-bold transition-all active:scale-95 text-white"
                  style={{ background:'#dc2626', boxShadow:'0 2px 6px rgba(220,38,38,0.45)' }}>
                  Forfeit
                </button>
              )}
              <button onClick={handleForfeit}
                className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4"/>
              </button>
            </div>
          </div>

          {/* Player pills */}
          <div className="flex items-center justify-center gap-2 px-3 py-2 flex-wrap flex-shrink-0"
            style={{ background:'rgba(0,0,0,0.3)' }}>
            {players.map((p, i) => {
              const pColors  = colorsForPlayerIdx(i, players.length);
              const primary  = pColors[0];
              const hex      = COLOR_HEX[primary];
              const active   = currentPlayer?.user_id === p.user_id;
              return (
                <div key={p.user_id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${active ? 'scale-105' : 'opacity-60'}`}
                  style={{
                    background:`${hex}22`,
                    border:`1.5px solid ${active ? hex : hex+'55'}`,
                    color: hex,
                  }}>
                  {/* Avatar or initial */}
                  <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0 ring-1"
                    style={{ ringColor: hex }}>
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.username} className="w-full h-full object-cover"/>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ background: hex }}>
                        {p.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="max-w-[60px] truncate">{p.username}</span>
                  {/* Color dots — show both when 2 colors */}
                  <div className="flex gap-0.5 flex-shrink-0">
                    {pColors.map(c => (
                      <div key={c} className="w-2 h-2 rounded-full" style={{ background: COLOR_HEX[c] }}/>
                    ))}
                  </div>
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0"/>}
                </div>
              );
            })}
          </div>

          {/* Board */}
          <div className="px-2 pb-1 flex-shrink-0">
            <div ref={boardRef}
              className="relative mx-auto aspect-square select-none"
              style={{
                maxWidth: 'min(620px, calc(97vh - 175px))',
                width:'100%',
                background:'linear-gradient(135deg,#1a0533 0%,#0f172a 100%)',
                borderRadius:10,
                border:'2px solid #6d28d9',
                boxShadow:'inset 0 2px 8px rgba(0,0,0,0.5), 0 0 20px rgba(109,40,217,0.2)',
              }}
            >
              {/* Yard quadrants — all 4 always shown */}
              {LUDO_COLORS.map((color) => {
                const y   = YARD_RECT[color];
                const hex = COLOR_HEX[color];
                return (
                  <div key={`yard-${color}`} className="absolute"
                    style={{
                      top:`${y.top*cp}%`, left:`${y.left*cp}%`,
                      width:`${6*cp}%`, height:`${6*cp}%`,
                      background:`linear-gradient(135deg,${hex}28,${hex}14)`,
                      border:`2px solid ${hex}44`,
                      borderRadius:8,
                      overflow:'hidden',
                    }}>
                    <div style={{
                      position:'absolute', bottom:4, right:6,
                      fontSize:'55%', fontWeight:700, color:`${hex}88`,
                      textTransform:'uppercase', letterSpacing:1,
                    }}>{color}</div>
                  </div>
                );
              })}

              {/* Shared track cells */}
              {SHARED_PATH.map(([r,c], i) => {
                const safe = SAFE_SQUARES.has(i);
                return (
                  <div key={`tr${i}`} className="absolute"
                    title={safe ? "Safe Zone — tokens here can't be captured" : undefined}
                    style={{
                      top:`${r*cp}%`, left:`${c*cp}%`,
                      width:`${cp}%`, height:`${cp}%`,
                      background: safe
                        ? 'linear-gradient(135deg,#fcd34d,#f59e0b)'
                        : '#f1f5f9',
                      border:`1px solid ${safe ? '#d97706' : '#cbd5e1'}`,
                    }}>
                    {safe && (
                      <div style={{
                        position:'absolute', inset:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'55%', color:'#78350f', fontWeight:900, lineHeight:1,
                      }}>✦</div>
                    )}
                  </div>
                );
              })}

              {/* Home columns — all 4 always shown */}
              {LUDO_COLORS.map(color =>
                HOME_COLUMNS[color].map(([r,c], i) => (
                  <div key={`hc-${color}-${i}`} className="absolute"
                    style={{
                      top:`${r*cp}%`, left:`${c*cp}%`,
                      width:`${cp}%`, height:`${cp}%`,
                      background:`linear-gradient(135deg,${COLOR_HEX[color]}90,${COLOR_HEX[color]}55)`,
                      border:`1px solid ${COLOR_HEX[color]}aa`,
                    }}/>
                ))
              )}

              {/* Center 3×3 — 4 colored triangles */}
              <div className="absolute" style={{
                top:`${6*cp}%`, left:`${6*cp}%`,
                width:`${3*cp}%`, height:`${3*cp}%`,
                overflow:'hidden', borderRadius:3,
              }}>
                <div style={{ position:'absolute',inset:0, clipPath:'polygon(0 0,100% 0,50% 50%)',
                  background:`linear-gradient(135deg,${COLOR_HEX.blue},${COLOR_HEX.blue}aa)` }}/>
                <div style={{ position:'absolute',inset:0, clipPath:'polygon(100% 0,100% 100%,50% 50%)',
                  background:`linear-gradient(135deg,${COLOR_HEX.green},${COLOR_HEX.green}aa)` }}/>
                <div style={{ position:'absolute',inset:0, clipPath:'polygon(100% 100%,0 100%,50% 50%)',
                  background:`linear-gradient(135deg,${COLOR_HEX.yellow},${COLOR_HEX.yellow}aa)` }}/>
                <div style={{ position:'absolute',inset:0, clipPath:'polygon(0 100%,0 0,50% 50%)',
                  background:`linear-gradient(135deg,${COLOR_HEX.red},${COLOR_HEX.red}aa)` }}/>
                <div style={{
                  position:'absolute', inset:0,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'80%', color:'white', fontWeight:900,
                  textShadow:'0 1px 4px rgba(0,0,0,0.8)',
                }}>★</div>
              </div>

              {/* Drop-zone overlays */}
              {awaitingMove && selectedDieValue && Array.from(targetCells.keys()).map(key => {
                const [row, col] = key.split(',').map(Number);
                return (
                  <div key={`dz-${key}`}
                    className="absolute pointer-events-none"
                    style={{
                      top:`${row*cp+0.25}%`, left:`${col*cp+0.25}%`,
                      width:`${cp-0.5}%`, height:`${cp-0.5}%`,
                      borderRadius:'50%',
                      border:`2px dashed ${myPrimaryColor ? COLOR_HEX[myPrimaryColor] : '#fff'}`,
                      background:`${myPrimaryColor ? COLOR_HEX[myPrimaryColor] : '#fff'}28`,
                      zIndex:9,
                      animation:'dropPulse 1.1s ease-in-out infinite',
                    }}/>
                );
              })}

              {/* Tokens */}
              {renderTokens.map(({ color, tokenIdx, row, col }) => {
                const isClickable   = myColors.includes(color) && legalMoves.some(m => m.color === color && m.tokenIdx === tokenIdx);
                const isFadedByDrag = dragging && !(dragging.color===color && dragging.tokenIdx===tokenIdx);
                const isDraggingThis = dragging?.color===color && dragging?.tokenIdx===tokenIdx;
                return (
                  <div
                    key={`${color}-${tokenIdx}`}
                    onPointerDown={(e) => onTokenPointerDown(e, color, tokenIdx)}
                    onPointerMove={onTokenPointerMove}
                    onPointerUp={onTokenPointerUp}
                    className="absolute"
                    style={{
                      top:`${(row+0.13)*cp}%`, left:`${(col+0.13)*cp}%`,
                      width:`${cp*0.74}%`, height:`${cp*0.74}%`,
                      zIndex: isDraggingThis ? 30 : isClickable ? 20 : 10,
                      touchAction:'none',
                      opacity: isDraggingThis ? 0.25 : 1,
                    }}
                  >
                    <Token
                      color={color}
                      isClickable={isClickable}
                      isFaded={!!isFadedByDrag && !isDraggingThis}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Event announcement overlay (Extra Roll — Double Six Bonus) ── */}
          {announcement && (
            <div
              key={announcement.key}
              style={{
                position: 'absolute', top: '40%', left: '50%',
                zIndex: 60, pointerEvents: 'none',
                animation: 'announceIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
              }}
            >
              <div style={{
                background: announcement.bg,
                borderRadius: 20,
                padding: '16px 30px',
                textAlign: 'center',
                boxShadow: '0 0 56px rgba(0,0,0,0.7), 0 12px 40px rgba(0,0,0,0.5)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                minWidth: 190, maxWidth: 290,
              }}>
                <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>{announcement.icon}</div>
                <div style={{
                  color: '#fff', fontSize: 26, fontWeight: 900,
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

          {/* ── Winner banner overlay ── */}
          {isOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
              style={{ background:'rgba(0,0,0,0.82)', backdropFilter:'blur(6px)' }}>

              {[...Array(16)].map((_,i) => {
                const colors = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#f97316'];
                const left   = 10 + (i * 5.5) % 82;
                const delay  = (i * 0.18) % 1.6;
                const dur    = 1.4 + (i % 4) * 0.25;
                const size   = 6 + (i % 4) * 3;
                return (
                  <div key={i} style={{
                    position:'absolute', left:`${left}%`, top: '-10px',
                    width: size, height: size,
                    borderRadius: i % 3 === 0 ? '2px' : '50%',
                    background: colors[i % colors.length],
                    animation:`confettiFall ${dur}s ${delay}s ease-in infinite`,
                    pointerEvents:'none',
                  }}/>
                );
              })}

              <div className="relative flex flex-col items-center gap-4 px-8 py-8 rounded-2xl mx-6 text-center"
                style={{
                  background:'linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 100%)',
                  border:'2px solid #6d28d9',
                  boxShadow:'0 0 40px rgba(109,40,217,0.5), 0 20px 60px rgba(0,0,0,0.7)',
                  animation:'bannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
                  minWidth:240, maxWidth:340,
                }}>

                {winner ? (
                  <>
                    <div style={{ fontSize:64, lineHeight:1, animation:'trophySpin 2s ease-in-out infinite' }}>🏆</div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-full overflow-hidden ring-4"
                        style={{ boxShadow:`0 0 0 4px ${COLOR_HEX[colorsForPlayerIdx(players.findIndex(p=>p.user_id===winner.user_id), players.length)[0]] || '#7c3aed'}` }}>
                        {winner.avatar ? (
                          <img src={winner.avatar} alt={winner.username} className="w-full h-full object-cover"/>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
                            style={{ background: COLOR_HEX[colorsForPlayerIdx(players.findIndex(p=>p.user_id===winner.user_id), players.length)[0]] || '#7c3aed' }}>
                            {winner.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Winner</p>
                        <p className="text-white text-xl font-black">{winner.username}</p>
                        {gameState?.status === 'forfeited' && (
                          <p className="text-purple-300 text-xs mt-0.5">by forfeit</p>
                        )}
                      </div>
                    </div>
                    {(() => {
                      const wi = players.findIndex(p => p.user_id === winner.user_id);
                      const wColors = colorsForPlayerIdx(wi, players.length);
                      return (
                        <div className="flex gap-1.5 items-center">
                          {wColors.map(c => (
                            <div key={c} className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                              style={{ background: COLOR_HEX[c] }}>
                              {c.charAt(0).toUpperCase() + c.slice(1)}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:56, lineHeight:1 }}>🤝</div>
                    <div>
                      <p className="text-white text-xl font-black">It's a Draw!</p>
                      <p className="text-purple-300 text-sm mt-1">Tied scores — no single winner</p>
                    </div>
                  </>
                )}

                <button
                  onClick={onClose}
                  className="mt-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
                  style={{
                    background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
                    boxShadow:'0 4px 14px rgba(124,58,237,0.5)',
                  }}>
                  Close Game
                </button>
              </div>
            </div>
          )}

          {/* Status row + Dice */}
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
            <div className="flex-1 min-w-0">
              {isOver ? (
                <p className="text-base font-bold text-white">
                  {winner ? `🏆 ${winner.username} wins!` : '🤝 Draw!'}
                </p>
              ) : (
                <>
                  <p className={`text-sm font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                    {isMyTurn ? '✨ Your turn' : `${currentPlayer?.username}'s turn`}
                  </p>
                  {isMyTurn && awaitingMove && !selectedDieValue && remainingMoves.length > 1 && (
                    <p className="text-amber-400 text-[11px] mt-0.5">2 dice rolled →</p>
                  )}
                  {isMyTurn && awaitingMove && selectedDieValue && legalMoves.length === 0 && (
                    <p className="text-amber-400 text-[11px] mt-0.5">No valid moves — turn passes</p>
                  )}
                  {isMyTurn && awaitingMove && selectedDieValue && legalMoves.length > 0 && (
                    <p className="text-amber-400 text-[11px] mt-0.5">Tap or drag a glowing token</p>
                  )}
                  {isMyTurn && lastRollWasted && (
                    <p className="text-red-400 text-[11px] mt-0.5">Three 6s — turn forfeited!</p>
                  )}
                </>
              )}
            </div>

            {/* Dice section */}
            {isPlayer && !isOver && (
              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                {/* Left slot: Roll button OR prominent "Tap a die!" hint */}
                {isMyTurn && awaitingMove && needsDieSelection ? (
                  <span style={{
                    display: 'inline-block',
                    fontSize: 14, fontWeight: 900, whiteSpace: 'nowrap',
                    color: '#fbbf24',
                    textShadow: '0 0 10px rgba(251,191,36,0.8)',
                    letterSpacing: '-0.3px',
                    animation: 'tapPulse 0.9s ease-in-out infinite',
                  }}>
                    👆 Tap a die!
                  </span>
                ) : (
                  <button
                    onClick={handleRoll}
                    disabled={!isMyTurn || awaitingMove}
                    className="px-3 py-2 rounded-xl text-white text-sm font-bold transition-all active:scale-95 whitespace-nowrap"
                    style={{
                      background: isMyTurn && !awaitingMove
                        ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                        : 'transparent',
                      boxShadow: isMyTurn && !awaitingMove
                        ? '0 2px 10px rgba(124,58,237,0.5)'
                        : 'none',
                      opacity: isMyTurn && !awaitingMove ? 1 : 0,
                      pointerEvents: isMyTurn && !awaitingMove ? 'auto' : 'none',
                    }}>
                    Roll!
                  </button>
                )}

                {/* Two dice side-by-side */}
                {diceRolls.length > 0 && (
                  <div className="flex gap-2 items-center">
                    {diceRolls.map((val, i) => (
                      <Dice3D
                        key={i}
                        value={val}
                        pipColor={myPrimaryColor ? COLOR_HEX[myPrimaryColor] : '#1e293b'}
                        selected={selectedDieValue === val && !diceConsumed[i]}
                        consumed={diceConsumed[i]}
                        onClick={isMyTurn && awaitingMove && !diceConsumed[i] ? () => handleDieClick(i) : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
