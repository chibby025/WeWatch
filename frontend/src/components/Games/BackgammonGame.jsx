import { useState, useMemo, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Classic 2-row layout: top row runs 13→24 left-to-right (with a bar gap
// after 18), bottom row runs 12→1 left-to-right (with a bar gap after 7) —
// point 1 and point 24 both sit at the right edge, matching a real board.
const TOP_POINTS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
const BOTTOM_POINTS = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const WHITE_COLOR = '#f1f5f9';
const BLACK_COLOR = '#1e293b';
const WHITE_RING = '#94a3b8';
const BLACK_RING = '#475569';

function pointOwnerCount(board, point) {
  const v = board[point - 1] || 0;
  if (v > 0) return { owner: 0, count: v };
  if (v < 0) return { owner: 1, count: -v };
  return { owner: -1, count: 0 };
}

function Checker({ owner, small }) {
  const size = small ? 14 : 20;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%',
        background: owner === 0 ? WHITE_COLOR : BLACK_COLOR,
        border: `2px solid ${owner === 0 ? WHITE_RING : BLACK_RING}`,
        boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
        flexShrink: 0,
      }}
    />
  );
}

// ── 3-D Dice — ported from LudoGame.jsx's Dice3D verbatim (same technique:
// a real CSS 3D-transform cube built from 6 absolutely-positioned faces,
// rotated to reveal the correct face whenever `value` changes). Reused
// as-is rather than re-derived, since the actual roll ANIMATION is purely
// reactive to the `value` prop — and that value already comes straight from
// gs.dice (the server-broadcast game state every connected player already
// receives identically), so every player sees the exact same roll play out
// at the same time with zero extra wiring needed. Backgammon has no
// per-die click-to-select interaction (a die's own row/onClick prop was
// never wired here either, before or after this port — move selection
// happens by clicking a board point instead), so `selected`/`onClick` are
// simply left unused/undefined at the call site.
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

function Dice3D({ value, pipColor, consumed }) {
  const S = 32; // matches the old flat Die's own 32px footprint
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
      <DieFace n={n} pipColor={consumed ? '#94a3b8' : pipColor} />
    </div>
  );

  return (
    <div style={{
      width:S, height:S, perspective:160, perspectiveOrigin:'50% 40%',
      opacity: consumed ? 0.4 : 1,
      borderRadius: 8,
      transition: 'opacity 0.2s',
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

function Point({ point, board, isTop, selected, isTarget, onClick }) {
  const { owner, count } = pointOwnerCount(board, point);
  const isEven = point % 2 === 0;
  const bg = isEven ? '#78350f' : '#a16207';
  const stack = Math.min(count, 5);
  const overflow = count - stack;

  return (
    <div
      onClick={onClick}
      className="relative flex-1 flex flex-col items-center cursor-pointer"
      style={{ height: '100%', justifyContent: isTop ? 'flex-start' : 'flex-end' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: isTop ? 'polygon(0 0, 100% 0, 50% 85%)' : 'polygon(0 100%, 100% 100%, 50% 15%)',
          background: bg,
          opacity: selected ? 0.9 : isTarget ? 0.7 : 0.55,
          outline: selected ? '2px solid #facc15' : isTarget ? '2px solid #4ade80' : 'none',
        }}
      />
      <div
        className="relative flex flex-wrap items-center justify-center gap-0.5 px-0.5"
        style={{
          flexDirection: isTop ? 'column' : 'column-reverse',
          paddingTop: isTop ? 3 : 0,
          paddingBottom: isTop ? 0 : 3,
        }}
      >
        {Array.from({ length: stack }, (_, i) => <Checker key={i} owner={owner} small />)}
        {overflow > 0 && (
          <span className="text-[9px] font-bold text-white bg-black/60 rounded-full px-1">+{overflow}</span>
        )}
      </div>
    </div>
  );
}

export default function BackgammonGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const board = gs.board || [];
  const bar = gs.bar || {};
  const borneOff = gs.borne_off || {};
  const dice = gs.dice || [];
  const remainingDice = gs.remaining_dice || [];
  const awaitingRoll = gs.awaiting_roll !== false;

  const isOver = ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');
  const currentTurnIdx = gameState?.current_turn ?? 0;
  const currentTurnPlayer = players?.[currentTurnIdx];
  const isMyTurn = !isOver && currentTurnPlayer?.user_id === currentUserId;

  const myPlayerIdx = players.findIndex(p => p.user_id === currentUserId);
  const myColor = myPlayerIdx === 0 ? 'White' : myPlayerIdx === 1 ? 'Black' : null;

  const [selectedFrom, setSelectedFrom] = useState(null); // 0 = bar, 1-24 = point, null = none

  const myBarCount = bar[String(myPlayerIdx)] || 0;

  const legalTargets = useMemo(() => {
    if (selectedFrom === null || !isMyTurn || awaitingRoll) return new Map();
    const map = new Map(); // target -> die
    const distinctDice = [...new Set(remainingDice)];
    for (const die of distinctDice) {
      let target;
      if (myPlayerIdx === 0) target = selectedFrom === 0 ? 25 - die : selectedFrom - die;
      else target = selectedFrom === 0 ? die : selectedFrom + die;
      const bearingOff = (myPlayerIdx === 0 && target <= 0) || (myPlayerIdx === 1 && target >= 25);
      if (bearingOff) {
        map.set('off', die);
        continue;
      }
      const { owner, count } = pointOwnerCount(board, target);
      if (owner === -1 || owner === myPlayerIdx || count <= 1) {
        map.set(target, die);
      }
    }
    return map;
  }, [selectedFrom, isMyTurn, awaitingRoll, remainingDice, board, myPlayerIdx]);

  const handleSelect = (point) => {
    if (!isMyTurn || awaitingRoll) return;
    if (myBarCount > 0 && point !== 0) {
      // Must enter from the bar first — clicking board points selects nothing.
      setSelectedFrom(0);
      return;
    }
    if (selectedFrom !== null && legalTargets.has(point)) {
      onMove({ move_type: 'move', from: selectedFrom, die: legalTargets.get(point) });
      setSelectedFrom(null);
      return;
    }
    const { owner } = pointOwnerCount(board, point);
    if (point === 0 ? myBarCount > 0 : owner === myPlayerIdx) {
      setSelectedFrom(selectedFrom === point ? null : point);
    }
  };

  const handleBearOff = () => {
    if (selectedFrom === null || !legalTargets.has('off')) return;
    onMove({ move_type: 'move', from: selectedFrom, die: legalTargets.get('off') });
    setSelectedFrom(null);
  };

  const rollDice = () => onMove({ move_type: 'roll' });
  const passTurn = () => { setSelectedFrom(null); onMove({ move_type: 'pass' }); };

  const winner = gameState?.winner_id
    ? (players.find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: players.map((p, i) => ({
      label: p.username,
      value: `${borneOff[String(i)] || 0} / 15 borne off`,
    })),
  };

  const endOrLeave = () => {
    const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  const usedDiceCount = dice.length && remainingDice.length !== undefined
    ? dice.length - Math.min(dice.length, remainingDice.length)
    : 0;

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="backgammon"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}

      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">Backgammon</span>
            {myColor && <span className="text-gray-500 text-xs">You: {myColor}</span>}
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="backgammon" className="text-gray-400 hover:text-white" />
            {!isOver && (
              <button
                onClick={endOrLeave}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                End Game
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Scores row */}
        <div className="flex gap-2 px-4 py-2 bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
          {players.map((p, i) => {
            const isTheirTurn = currentTurnPlayer?.user_id === p.user_id;
            return (
              <div key={p.user_id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs
                ${isTheirTurn ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
                <Checker owner={i === 0 ? 0 : 1} small />
                <span className="text-gray-300 font-semibold">{p.username}</span>
                <span className="text-yellow-300 font-bold">{borneOff[String(i)] || 0}/15</span>
                {(bar[String(i)] || 0) > 0 && (
                  <span className="text-red-400 font-bold">· {bar[String(i)]} on bar</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Board */}
        <div className="flex-1 flex items-center justify-center p-2 min-h-0">
          <div
            className="flex flex-col"
            style={{ width: 'min(94vw, 80vh, 760px)', aspectRatio: '1.6', background: '#3f2d00', border: '3px solid #6d28d9', borderRadius: 8, padding: 6 }}
          >
            {/* Top row */}
            <div className="flex" style={{ height: '44%' }}>
              {TOP_POINTS.slice(0, 6).map(pt => (
                <Point key={pt} point={pt} board={board} isTop
                  selected={selectedFrom === pt} isTarget={legalTargets.has(pt)}
                  onClick={() => handleSelect(pt)} />
              ))}
              <div className="flex flex-col items-center justify-start gap-0.5 pt-1" style={{ width: '6%' }}>
                {Array.from({ length: bar['1'] || 0 }, (_, i) => <Checker key={i} owner={1} small />)}
              </div>
              {TOP_POINTS.slice(6).map(pt => (
                <Point key={pt} point={pt} board={board} isTop
                  selected={selectedFrom === pt} isTarget={legalTargets.has(pt)}
                  onClick={() => handleSelect(pt)} />
              ))}
            </div>

            {/* Middle bar strip */}
            <div style={{ height: '12%' }} className="flex items-center justify-center">
              <div className="flex items-center gap-3">
                {dice.map((d, i) => <Dice3D key={i} value={d} pipColor="#3f2d00" consumed={i < usedDiceCount} />)}
              </div>
            </div>

            {/* Bottom row */}
            <div className="flex" style={{ height: '44%' }}>
              {BOTTOM_POINTS.slice(0, 6).map(pt => (
                <Point key={pt} point={pt} board={board} isTop={false}
                  selected={selectedFrom === pt} isTarget={legalTargets.has(pt)}
                  onClick={() => handleSelect(pt)} />
              ))}
              <div className="flex flex-col items-center justify-end gap-0.5 pb-1" style={{ width: '6%' }}>
                {Array.from({ length: bar['0'] || 0 }, (_, i) => <Checker key={i} owner={0} small />)}
              </div>
              {BOTTOM_POINTS.slice(6).map(pt => (
                <Point key={pt} point={pt} board={board} isTop={false}
                  selected={selectedFrom === pt} isTarget={legalTargets.has(pt)}
                  onClick={() => handleSelect(pt)} />
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        {!isOver && (
          <div className="bg-gray-900/80 border-t border-gray-800 px-3 py-3 flex-shrink-0 flex items-center justify-center gap-3">
            {!isMyTurn ? (
              <p className="text-center text-gray-400 text-sm py-2">
                Waiting for {currentTurnPlayer?.username || 'the next player'}…
              </p>
            ) : awaitingRoll ? (
              <button
                onClick={rollDice}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                🎲 Roll Dice
              </button>
            ) : (
              <>
                {legalTargets.has('off') && (
                  <button
                    onClick={handleBearOff}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    Bear Off
                  </button>
                )}
                <span className="text-gray-400 text-xs">
                  {selectedFrom !== null
                    ? 'Tap a highlighted point to move there'
                    : myBarCount > 0
                      ? 'Tap your checker on the bar to enter'
                      : 'Tap one of your checkers to move it'}
                </span>
                <button
                  onClick={passTurn}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl transition-colors"
                >
                  Pass
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
