// src/components/Games/DominoesGame.jsx
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Classic 3x3 dot layouts for pip values 0-6 (grid positions 0-8, row-major).
const PIP_LAYOUTS = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function parseTile(tile) {
  if (!tile) return [0, 0];
  const [a, b] = tile.split('-').map(Number);
  return [a, b];
}

function tilePips(tile) {
  const [a, b] = parseTile(tile);
  return a + b;
}

// Pips are drawn as inset "drilled" dots (a dark radial well + a small
// bright highlight offset toward the tile's own light source) instead of
// flat filled circles — real inlaid domino pips read as small carved holes,
// not printed marks.
function PipFace({ value, size }) {
  const active = new Set(PIP_LAYOUTS[value] ?? []);
  const dot = Math.max(3, Math.round(size * 0.17));
  return (
    <div
      className="grid grid-cols-3 grid-rows-3 shrink-0"
      style={{ width: size, height: size, padding: size * 0.1 }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="flex items-center justify-center">
          {active.has(i) && (
            <div
              className="rounded-full"
              style={{
                width: dot,
                height: dot,
                background: 'radial-gradient(circle at 35% 30%, #4a4a4a 0%, #1a1a1a 55%, #0a0a0a 100%)',
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6), 0 0.5px 0 rgba(255,255,255,0.5)',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// left/right are the two pip values as ORIENTED (chain tiles) or in whatever
// order they're stored (hand tiles — a tile hasn't been placed yet, so no
// orientation applies). Doubles get a small cosmetic 90° rotation as a nod
// to how real dominoes are laid — a deliberate v1 simplification: the chain
// still lays out as a single straight (wrapping) row rather than the real
// snaking board layout, which would need real 2D grid-placement logic.
//
// CSS-only 3D look (no canvas/WebGL — see the project's own decision to
// keep this lightweight): an ivory/bone gradient body, a layered box-shadow
// stack simulating a beveled raised edge (outer drop shadow for lift off
// the table + an inset highlight along the top-left + an inset shadow along
// the bottom-right), a carved center groove instead of a flat divider line,
// and a subtle constant perspective tilt so the tile reads as a physical
// object lying on a table rather than a flat icon. Selecting/hovering an
// interactive tile deepens the tilt and lift, like actually picking it up.
function DominoTile({ left, right, size = 30, onClick, selected, dimmed, faceDown, isDouble }) {
  if (faceDown) {
    return (
      <div
        className="rounded-md shrink-0"
        style={{
          width: size * 0.85,
          height: size * 1.7,
          background: 'linear-gradient(135deg, #b87f42 0%, #8a5a28 45%, #6b431a 100%)',
          border: '1px solid rgba(0,0,0,0.35)',
          boxShadow: `
            0 ${size * 0.08}px ${size * 0.14}px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.25),
            inset 0 -2px 3px rgba(0,0,0,0.35)
          `,
          transform: 'perspective(300px) rotateX(6deg)',
        }}
      />
    );
  }
  const tilt = selected ? 'perspective(500px) rotateX(14deg) translateY(-8px)' : 'perspective(500px) rotateX(8deg)';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-stretch rounded-md shrink-0 overflow-hidden transition-all duration-150 ${
        dimmed ? 'opacity-40' : ''
      } ${onClick ? 'cursor-pointer' : 'cursor-default'} ${isDouble ? 'rotate-90 mx-3' : ''}`}
      style={{
        height: size,
        background: 'linear-gradient(160deg, #ffffff 0%, #f3f1ea 55%, #e2ddcf 100%)',
        border: selected ? '2px solid #22d3ee' : '1px solid #c9c2b3',
        boxShadow: selected
          ? `0 ${size * 0.18}px ${size * 0.22}px rgba(0,0,0,0.45), 0 0 0 3px rgba(34,211,238,0.35), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 2px rgba(0,0,0,0.08)`
          : `0 ${size * 0.1}px ${size * 0.12}px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.85), inset 0 -2px 2px rgba(0,0,0,0.08)`,
        transform: tilt,
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.transform = 'perspective(500px) rotateX(14deg) translateY(-6px)'; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.transform = tilt; }}
    >
      <PipFace value={left} size={size} />
      <div
        className="w-[3px] shrink-0"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35), rgba(255,255,255,0.6), rgba(0,0,0,0.35))' }}
      />
      <PipFace value={right} size={size} />
    </button>
  );
}

export default function DominoesGame({ gameState, players = [], currentUserId, myHand, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const [pendingTile, setPendingTile] = useState(null); // tile matching BOTH ends — needs a side choice

  const gs = gameState?.game_state || {};
  const chain = Array.isArray(gs.chain) ? gs.chain : [];
  const leftEnd = gs.left_end ?? -1;
  const rightEnd = gs.right_end ?? -1;
  const openingTile = gs.opening_tile || '';
  const handCounts = gs.hand_counts || {};
  const drawPileCount = gs.draw_pile_count ?? 0;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const hand = myHand || [];

  const matchesEnd = (tile, end) => {
    const [a, b] = parseTile(tile);
    return a === end || b === end;
  };

  const canPlayTile = (tile) => {
    if (chain.length === 0) return openingTile ? tile === openingTile : true;
    return matchesEnd(tile, leftEnd) || matchesEnd(tile, rightEnd);
  };

  const canPlayAnyTile = useMemo(() => hand.some(canPlayTile), [hand, chain.length, leftEnd, rightEnd, openingTile]); // eslint-disable-line react-hooks/exhaustive-deps

  const playTile = (tile, end) => {
    if (!isMyTurn || isOver) return;
    onMove({ move_type: 'play', tile, ...(end ? { end } : {}) });
    setPendingTile(null);
  };

  const handleTileClick = (tile) => {
    if (!isMyTurn || isOver || !canPlayTile(tile)) return;
    if (chain.length === 0) {
      playTile(tile);
      return;
    }
    const matchesLeft = matchesEnd(tile, leftEnd);
    const matchesRight = matchesEnd(tile, rightEnd);
    if (matchesLeft && matchesRight && leftEnd !== rightEnd) {
      setPendingTile(tile); // ambiguous — ask which side
      return;
    }
    playTile(tile, matchesRight ? 'right' : 'left');
  };

  const handleDraw = () => {
    if (!isMyTurn || isOver || canPlayAnyTile) return;
    onMove({ move_type: 'draw' });
  };

  const handlePass = () => {
    if (!isMyTurn || isOver || canPlayAnyTile || drawPileCount > 0) return;
    onMove({ move_type: 'pass' });
  };

  const handleForfeit = () => {
    if (winner || isOver) {
      onClose();
      return;
    }
    (onEndGame || onClose)();
  };

  const mustPass = isMyTurn && !isOver && chain.length > 0 && !canPlayAnyTile && drawPileCount === 0;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 gap-3">
            <div className="min-w-0">
              <h2 className="text-white text-xl font-bold">Dominoes</h2>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {players.map((p, i) => (
                  <span key={p.user_id} className="flex items-center gap-1">
                    {i > 0 && <span className="text-gray-500 text-xs">vs</span>}
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.username} className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-gray-700 flex items-center justify-center text-[8px] font-bold text-gray-300">
                        {p.username?.[0]?.toUpperCase()}
                      </span>
                    )}
                    <span className="text-gray-400 text-sm truncate max-w-[120px]">{p.username}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <GameRulesButton gameType="dominoes" />
              {!isOver && (
                <button
                  onClick={handleForfeit}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
                >
                  Forfeit
                </button>
              )}
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Other players' tile counts */}
          <div className="flex items-center justify-center gap-4 px-5 py-3 flex-wrap">
            {players.filter(p => p.user_id !== currentUserId).map(p => (
              <div
                key={p.user_id}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${
                  currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.username} className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-300 shrink-0">
                      {p.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className="text-white text-sm font-medium">{p.username}</span>
                </div>
                <div className="flex -space-x-4">
                  {Array.from({ length: Math.min(handCounts[String(p.user_id)] ?? 0, 7) }).map((_, i) => (
                    <DominoTile key={i} faceDown size={28} />
                  ))}
                </div>
                <span className="text-gray-400 text-xs">{handCounts[String(p.user_id)] ?? 0} tiles</span>
              </div>
            ))}
          </div>

          {/* The board */}
          <div className="px-5 py-5 min-h-[110px] flex flex-col items-center justify-center">
            {chain.length === 0 ? (
              <p className="text-gray-500 text-sm">
                {openingTile
                  ? `${currentPlayer?.username || 'Someone'} must open with their highest double — ${openingTile.replace('-', ' | ')}`
                  : 'The board is empty — first tile can be anything'}
              </p>
            ) : (
              <div className="flex items-center justify-center gap-1 flex-wrap max-w-full">
                {chain.map((t, i) => (
                  <DominoTile key={i} left={t.left} right={t.right} size={34} isDouble={t.left === t.right} />
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-gray-500 text-xs">
              <span>🪵 {drawPileCount} in boneyard</span>
            </div>
          </div>

          {!isOver && (
            <div className="text-center pb-3">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn
                  ? mustPass
                    ? "You're stuck and the boneyard is empty — Pass"
                    : canPlayAnyTile
                      ? 'Your turn'
                      : 'Your turn — draw a tile'
                  : `${currentPlayer?.username}'s turn`}
              </p>
            </div>
          )}

          {/* Your hand */}
          {isPlayer && (
            <div className="px-5 pb-5">
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {hand.map((tile, i) => {
                  const [a, b] = parseTile(tile);
                  const playable = isMyTurn && !isOver && canPlayTile(tile);
                  return (
                    <DominoTile
                      key={`${tile}-${i}`}
                      left={a}
                      right={b}
                      size={40}
                      selected={pendingTile === tile}
                      dimmed={isMyTurn && !isOver && !canPlayTile(tile)}
                      onClick={playable ? () => handleTileClick(tile) : undefined}
                    />
                  );
                })}
              </div>
              {hand.length === 0 && !isOver && (
                <p className="text-center text-gray-500 text-sm mt-2">No tiles left</p>
              )}
            </div>
          )}

          {/* Draw / Pass controls */}
          {isMyTurn && !isOver && (
            <div className="flex items-center justify-center gap-3 pb-5">
              {!canPlayAnyTile && drawPileCount > 0 && (
                <button
                  onClick={handleDraw}
                  className="px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-sm font-medium"
                >
                  Draw a tile
                </button>
              )}
              {mustPass && (
                <button
                  onClick={handlePass}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium"
                >
                  Pass
                </button>
              )}
            </div>
          )}

          {/* Ambiguous tile (matches both ends) — ask which side */}
          {pendingTile && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-2xl">
              <div className="bg-gray-800 rounded-xl p-5 flex flex-col items-center gap-3">
                <p className="text-white font-medium">Play {pendingTile.replace('-', ' | ')} on which side?</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => playTile(pendingTile, 'left')}
                    className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-semibold"
                  >
                    ◀ Left ({leftEnd})
                  </button>
                  <button
                    onClick={() => playTile(pendingTile, 'right')}
                    className="px-4 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-semibold"
                  >
                    Right ({rightEnd}) ▶
                  </button>
                </div>
                <button onClick={() => setPendingTile(null)} className="text-gray-400 text-sm mt-1">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="dominoes"
          gameStats={{ lines: [
            ...players.map(p => ({
              label: p.username,
              // Only your own hand's pip total is ever computable client-side —
              // opponents' actual tiles are hidden by design, only their count
              // is ever sent to you (handCounts).
              value: p.user_id === currentUserId
                ? `${hand.length} tiles (${hand.reduce((sum, t) => sum + tilePips(t), 0)} pips)`
                : `${handCounts[String(p.user_id)] ?? '?'} tiles`,
            })),
            { label: 'Boneyard', value: `${drawPileCount} tiles` },
          ]}}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}
