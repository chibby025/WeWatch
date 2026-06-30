// src/components/Games/LudoGame.jsx
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const LUDO_COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX = { red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308' };

// Classic 15x15 cross-shaped board. Built segment-by-segment (not hand-typed
// as one 52-tuple list) so each straight run is easy to verify against the
// backend's ludoEntryOffset spacing (13 cells between each color's entry —
// confirmed below: segment boundaries land at index 0, 13, 26, 39).
function buildSharedPath() {
  const path = [];
  for (let c = 1; c <= 5; c++) path.push([6, c]);
  for (let r = 5; r >= 0; r--) path.push([r, 6]);
  path.push([0, 7]);
  path.push([0, 8]);
  for (let r = 1; r <= 5; r++) path.push([r, 8]);
  for (let c = 9; c <= 14; c++) path.push([6, c]);
  path.push([7, 14]);
  path.push([8, 14]);
  for (let c = 13; c >= 9; c--) path.push([8, c]);
  for (let r = 9; r <= 14; r++) path.push([r, 8]);
  path.push([14, 7]);
  path.push([14, 6]);
  for (let r = 13; r >= 9; r--) path.push([r, 6]);
  for (let c = 5; c >= 0; c--) path.push([8, c]);
  path.push([7, 0]);
  return path; // 51 cells, relPos 0-50
}

const SHARED_PATH = buildSharedPath();

const HOME_COLUMNS = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  blue: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

const ENTRY_OFFSET = { red: 0, blue: 13, green: 26, yellow: 39 };
const SAFE_SQUARES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

const YARD_RECT = {
  red: { top: 0, left: 0 },
  blue: { top: 0, left: 9 },
  green: { top: 9, left: 9 },
  yellow: { top: 9, left: 0 },
};
const YARD_SLOTS = [[1, 1], [1, 4], [4, 1], [4, 4]];

function globalSquare(color, relPos) {
  return (ENTRY_OFFSET[color] + relPos) % 52;
}

// Returns the [row, col] for a token at a given color+relPos, or null if in base.
function cellForToken(color, relPos) {
  if (relPos < 0) return null;
  if (relPos <= 50) return SHARED_PATH[globalSquare(color, relPos)];
  if (relPos <= 56) return HOME_COLUMNS[color][relPos - 51];
  return [7, 7];
}

function isSafeCell(color, relPos) {
  if (relPos < 0 || relPos > 50) return true; // home column / home are always safe
  return SAFE_SQUARES.has(globalSquare(color, relPos));
}

export default function LudoGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame }) {
  const [rolling, setRolling] = useState(false);

  const gs = gameState?.game_state || {};
  const tokensByColor = gs.tokens || {};
  const currentDice = gs.current_dice || 0;
  const awaitingMove = !!gs.awaiting_move;
  const lastRollWasted = !!gs.last_roll_wasted;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const myColorIdx = players.findIndex(p => p.user_id === currentUserId);
  const myColor = myColorIdx >= 0 ? LUDO_COLORS[myColorIdx] : null;
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = myColorIdx >= 0;
  const winner = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const legalTokenIndices = useMemo(() => {
    if (!isMyTurn || !awaitingMove || currentDice === 0 || !myColor) return [];
    const myTokens = tokensByColor[myColor] || [];
    return myTokens.reduce((acc, t, i) => {
      const pos = t.position ?? -1;
      if (pos === -1 && currentDice === 6) acc.push(i);
      else if (pos >= 0 && pos + currentDice <= 57) acc.push(i);
      return acc;
    }, []);
  }, [tokensByColor, myColor, isMyTurn, awaitingMove, currentDice]);

  const handleRoll = () => {
    if (!isMyTurn || awaitingMove || isOver) return;
    setRolling(true);
    onMove({ move_type: 'roll_dice' });
    setTimeout(() => setRolling(false), 400);
  };

  const handleTokenClick = (tokenIdx) => {
    if (!isMyTurn || !awaitingMove || isOver) return;
    if (!legalTokenIndices.includes(tokenIdx)) return;
    onMove({ move_type: 'move_token', token_index: tokenIdx });
  };

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  // Build a flat list of {color, tokenIdx, row, col} for rendering, grouping
  // base/yard tokens into fixed slots and on-board tokens at their path cell.
  const renderTokens = [];
  LUDO_COLORS.slice(0, players.length).forEach((color) => {
    const tokens = tokensByColor[color] || [];
    tokens.forEach((t, i) => {
      const pos = t.position ?? -1;
      if (pos === -1) {
        const yard = YARD_RECT[color];
        const slot = YARD_SLOTS[i];
        renderTokens.push({ color, tokenIdx: i, row: yard.top + slot[0], col: yard.left + slot[1], inBase: true });
      } else {
        const cell = cellForToken(color, pos);
        renderTokens.push({ color, tokenIdx: i, row: cell[0], col: cell[1], inBase: false, safe: isSafeCell(color, pos) });
      }
    });
  });

  const cellPct = 100 / 15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white text-xl font-bold">Ludo</h2>
            <p className="text-gray-400 text-sm">{players.map(p => p.username).join(' vs ')}</p>
          </div>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 px-4 py-2 flex-wrap">
          {players.map((p, i) => (
            <div
              key={p.user_id}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                currentPlayer?.user_id === p.user_id ? 'ring-2 ring-white/60' : ''
              }`}
              style={{ backgroundColor: `${COLOR_HEX[LUDO_COLORS[i]]}33`, color: COLOR_HEX[LUDO_COLORS[i]] }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_HEX[LUDO_COLORS[i]] }} />
              {p.username}
            </div>
          ))}
        </div>

        <div className="px-4 pb-2">
          <div className="relative w-full aspect-square mx-auto max-w-md rounded-lg overflow-hidden" style={{ backgroundColor: '#1e293b' }}>
            {/* Yards */}
            {LUDO_COLORS.slice(0, players.length).map((color) => {
              const yard = YARD_RECT[color];
              return (
                <div
                  key={`yard-${color}`}
                  className="absolute rounded-md"
                  style={{
                    top: `${yard.top * cellPct}%`,
                    left: `${yard.left * cellPct}%`,
                    width: `${6 * cellPct}%`,
                    height: `${6 * cellPct}%`,
                    backgroundColor: `${COLOR_HEX[color]}22`,
                    border: `2px solid ${COLOR_HEX[color]}55`,
                  }}
                />
              );
            })}

            {/* Shared track cells */}
            {SHARED_PATH.map(([r, c], i) => (
              <div
                key={`track-${i}`}
                className="absolute border border-gray-700/40 bg-gray-200/90"
                style={{
                  top: `${r * cellPct}%`, left: `${c * cellPct}%`,
                  width: `${cellPct}%`, height: `${cellPct}%`,
                  backgroundColor: SAFE_SQUARES.has(i) ? '#fde68a' : undefined,
                }}
              />
            ))}

            {/* Home columns */}
            {LUDO_COLORS.slice(0, players.length).map((color) =>
              HOME_COLUMNS[color].map(([r, c], i) => (
                <div
                  key={`home-${color}-${i}`}
                  className="absolute border border-gray-700/40"
                  style={{
                    top: `${r * cellPct}%`, left: `${c * cellPct}%`,
                    width: `${cellPct}%`, height: `${cellPct}%`,
                    backgroundColor: `${COLOR_HEX[color]}66`,
                  }}
                />
              ))
            )}

            {/* Center home triangle */}
            <div
              className="absolute flex items-center justify-center text-white text-[10px] font-bold bg-gray-700"
              style={{ top: `${7 * cellPct}%`, left: `${7 * cellPct}%`, width: `${cellPct}%`, height: `${cellPct}%` }}
            >
              ★
            </div>

            {/* Tokens */}
            {renderTokens.map(({ color, tokenIdx, row, col, inBase, safe }) => {
              const isMine = color === myColor;
              const clickable = isMine && legalTokenIndices.includes(tokenIdx);
              return (
                <button
                  key={`${color}-${tokenIdx}`}
                  onClick={() => isMine && handleTokenClick(tokenIdx)}
                  disabled={!clickable}
                  className={`absolute rounded-full flex items-center justify-center transition-transform ${
                    clickable ? 'cursor-pointer ring-2 ring-white scale-110 animate-pulse' : 'cursor-default'
                  }`}
                  style={{
                    top: `${(row + 0.15) * cellPct}%`,
                    left: `${(col + 0.15) * cellPct}%`,
                    width: `${cellPct * 0.7}%`,
                    height: `${cellPct * 0.7}%`,
                    backgroundColor: COLOR_HEX[color],
                    border: !inBase && safe ? '2px solid white' : '2px solid rgba(0,0,0,0.3)',
                    zIndex: 10,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="text-center pb-2">
          {isOver ? (
            <p className="text-lg font-semibold text-white">{winner ? `🏆 ${winner.username} wins!` : "🤝 It's a draw!"}</p>
          ) : (
            <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
              {isMyTurn ? 'Your turn' : `${currentPlayer?.username}'s turn`}
              {lastRollWasted && isMyTurn ? ' — three 6s in a row, turn forfeited!' : ''}
            </p>
          )}
        </div>

        {isPlayer && !isOver && (
          <div className="flex flex-col items-center gap-2 pb-5">
            <div
              className={`w-14 h-14 rounded-lg bg-white flex items-center justify-center text-2xl font-bold text-gray-900 shadow-md ${
                rolling ? 'animate-spin' : ''
              }`}
            >
              {currentDice || '?'}
            </div>
            {isMyTurn && !awaitingMove && (
              <button onClick={handleRoll} className="px-5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium">
                Roll Dice
              </button>
            )}
            {isMyTurn && awaitingMove && (
              <p className="text-amber-400 text-sm">Pick a highlighted token to move</p>
            )}
          </div>
        )}

        <div className="flex justify-end px-5 pb-5">
          {!isOver && (
            <button onClick={handleForfeit} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
              Forfeit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
